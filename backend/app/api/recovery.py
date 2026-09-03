from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.checkout import CheckoutEvent
from app.services.recovery_engine import decision_for_checkout
from app.schemas.recovery import RecoveryDecisionOut
import concurrent.futures
from datetime import datetime
import json
from app.agent.providers import get_recovery_agent
from app.services.guardrails import evaluate_guardrails
from app.services.executor import simulate_execution
from app.models.recovery_execution import RecoveryExecution
from app.schemas.execution import ExecutionResponse

router = APIRouter()


@router.get('/recovery/decision/{checkout_id}')
def recovery_decision(checkout_id: str, db: Session = Depends(get_db)):
    c = db.query(CheckoutEvent).filter(CheckoutEvent.checkout_id == checkout_id).first()
    if not c:
        raise HTTPException(status_code=404, detail='Checkout not found')
    decision = decision_for_checkout(c)
    out = decision.dict()
    out.update({
        'cart_value': c.cart_value,
        'currency': c.currency,
        'customer_segment': c.customer_segment,
        'payment_status': c.payment_status,
        'failure_reason': c.failure_reason,
        'attempt_count': c.attempt_count,
        'previous_failed_payments': c.previous_failed_payments,
        'previous_successful_orders': c.previous_successful_orders,
        'payment_method': c.payment_method,
    })

    executions = db.query(RecoveryExecution).filter(RecoveryExecution.checkout_id == checkout_id).order_by(RecoveryExecution.created_at.asc()).all()
    audit_trail = []

    if executions:
        for idx, ex in enumerate(executions):
            try:
                agent_dec = json.loads(ex.agent_decision)
                guardrail_dec = json.loads(ex.guardrail_decision)
                
                # 1. Detection
                audit_trail.append({
                    "timestamp": ex.created_at.isoformat(),
                    "type": "detection",
                    "title": "Revenue risk detected",
                    "description": f"Abandoned checkout detected for {c.currency} {c.cart_value}.",
                    "metadata": {"attempt_number": ex.attempt_number}
                })

                # 2. Analysis
                audit_trail.append({
                    "timestamp": ex.created_at.isoformat(),
                    "type": "analysis",
                    "title": "Agent analysis complete",
                    "description": f"Identified likely reason: {agent_dec.get('likely_abandonment_reason', 'Unknown')}",
                    "metadata": {
                        "risk_level": agent_dec.get('risk_level'),
                        "confidence": agent_dec.get('confidence_score')
                    }
                })

                # 3. Decision
                audit_trail.append({
                    "timestamp": ex.created_at.isoformat(),
                    "type": "decision",
                    "title": f"Recommended action: {agent_dec.get('recommended_action', 'Unknown')}",
                    "description": agent_dec.get('reason_for_action', 'No reason provided.'),
                    "metadata": {"action": agent_dec.get('recommended_action')}
                })

                # 4. Guardrails
                status_text = "Allowed" if guardrail_dec.get('status') == 'allowed' else ("Blocked" if guardrail_dec.get('status') == 'blocked' else "Review Required")
                audit_trail.append({
                    "timestamp": ex.created_at.isoformat(),
                    "type": "guardrail",
                    "title": f"Policy check: {status_text}",
                    "description": guardrail_dec.get('blocked_reason') or "All policy checks passed.",
                    "metadata": {"rules_triggered": guardrail_dec.get('policy_rules_triggered', [])}
                })

                # 5. Outcome
                outcome_titles = {
                    "recovered": "Successfully recovered",
                    "failed": "Recovery attempt failed",
                    "pending": "Action pending response",
                    "stopped_by_policy": "Action blocked by policy",
                    "requires_review": "Escalated for human review"
                }
                audit_trail.append({
                    "timestamp": ex.created_at.isoformat(),
                    "type": "outcome",
                    "title": outcome_titles.get(ex.outcome, ex.outcome),
                    "description": f"Outcome recorded. Recovered amount: {c.currency} {ex.recovered_amount}",
                    "metadata": {"outcome": ex.outcome, "recovered": ex.recovered_amount}
                })
            except Exception:
                pass
    else:
        audit_trail.append({
            "timestamp": datetime.utcnow().isoformat(),
            "type": "info",
            "title": "No recovery attempts yet",
            "description": "This checkout has not been processed by the recovery engine.",
            "metadata": {}
        })

    out['audit_trail'] = audit_trail
    return out


@router.post('/recovery/execute/{checkout_id}', response_model=ExecutionResponse)
def execute_recovery(checkout_id: str, db: Session = Depends(get_db)):
    checkout = db.query(CheckoutEvent).filter(CheckoutEvent.checkout_id == checkout_id).first()
    if not checkout:
        raise HTTPException(status_code=404, detail='Checkout not found')

    # 1. Analyze with Agent
    agent = get_recovery_agent()
    agent_decision = agent.analyze(checkout)

    # 2. Get past attempt history
    # For a real system we would query RecoveryExecution
    past_executions = db.query(RecoveryExecution).filter(RecoveryExecution.checkout_id == checkout_id).order_by(RecoveryExecution.created_at.desc()).all()
    current_attempt = len(past_executions) + 1
    last_attempt_time = past_executions[0].created_at if past_executions else None

    # 3. Evaluate Guardrails
    guardrail_result = evaluate_guardrails(checkout, agent_decision, current_attempt, last_attempt_time)

    # 4. Simulate Execution
    outcome, recovered_amount = simulate_execution(checkout, guardrail_result, agent_decision.confidence_score)

    # 5. Record Execution Audit Log
    execution_log = RecoveryExecution(
        checkout_id=checkout.checkout_id,
        original_amount_at_risk=checkout.cart_value or 0.0,
        agent_decision=agent_decision.json(),
        selected_action=guardrail_result.action,
        guardrail_decision=guardrail_result.json(),
        outcome=outcome,
        recovered_amount=recovered_amount,
        attempt_number=current_attempt
    )
    db.add(execution_log)
    
    # 6. Update Checkout State
    if outcome == "recovered":
        checkout.recovered = True
        checkout.recovered_amount = recovered_amount
        checkout.recovered_at = datetime.utcnow()
    
    checkout.attempt_count = (checkout.attempt_count or 0) + 1
    if outcome == "failed":
        checkout.previous_failed_payments = (checkout.previous_failed_payments or 0) + 1
        
    db.commit()

    return ExecutionResponse(
        checkout_id=checkout.checkout_id,
        original_amount_at_risk=checkout.cart_value or 0.0,
        selected_action=guardrail_result.action,
        guardrail_decision=guardrail_result,
        outcome=outcome,
        recovered_amount=recovered_amount,
        recovery_attempt_number=current_attempt,
        execution_timestamp=execution_log.created_at or datetime.utcnow()
    )


@router.get('/recovery/decisions')
def recovery_decisions(limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    q = db.query(CheckoutEvent).filter(CheckoutEvent.payment_status.in_(['failed', 'abandoned']), CheckoutEvent.recovery_eligible == True).order_by(CheckoutEvent.id.desc()).limit(limit)
    results = q.all()
    decisions = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        decisions_futures = list(executor.map(decision_for_checkout, results))
        
    for c, d_obj in zip(results, decisions_futures):
        d = d_obj.dict()
        d.update({
            'cart_value': c.cart_value,
            'currency': c.currency,
            'customer_segment': c.customer_segment,
            'payment_status': c.payment_status,
            'failure_reason': c.failure_reason,
            'attempt_count': c.attempt_count,
            'previous_failed_payments': c.previous_failed_payments,
        })
        decisions.append(d)
    return decisions


@router.get('/recovery/baseline-summary')
def baseline_summary(db: Session = Depends(get_db)):
    q = db.query(CheckoutEvent).filter(CheckoutEvent.payment_status.in_(['failed', 'abandoned']), CheckoutEvent.recovery_eligible == True)
    items = q.all()
    total = len(items)
    action_counts = {}
    source_counts = {}
    confidences = []
    est_probs = []
    total_risk = 0.0
    total_expected = 0.0

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        decisions = list(executor.map(decision_for_checkout, items))

    for c, d in zip(items, decisions):
        action_counts[d.recommended_action] = action_counts.get(d.recommended_action, 0) + 1
        source_counts[d.decision_source] = source_counts.get(d.decision_source, 0) + 1
        confidences.append(d.confidence)
        est_probs.append(d.estimated_recovery_probability)
        total_risk += (c.cart_value or 0.0)
        total_expected += d.expected_recoverable_revenue

    avg_conf = round(sum(confidences) / len(confidences), 3) if confidences else 0.0
    avg_prob = round(sum(est_probs) / len(est_probs), 3) if est_probs else 0.0

    return {
        'total_eligible_cases': total,
        'action_distribution': action_counts,
        'source_distribution': source_counts,
        'average_confidence': avg_conf,
        'average_estimated_recovery_probability': avg_prob,
        'total_revenue_at_risk': float(round(total_risk, 2)),
        'total_expected_recoverable_revenue': float(round(total_expected, 2)),
    }


from sqlalchemy import func

@router.post('/recovery/batch-execute')
def batch_execute_recovery(limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    q = db.query(CheckoutEvent).filter(
        CheckoutEvent.payment_status.in_(['failed', 'abandoned']),
        CheckoutEvent.recovery_eligible == True,
        CheckoutEvent.recovered == False
    ).order_by(CheckoutEvent.id.desc()).limit(limit)
    
    checkouts = q.all()
    results = []
    
    # Process sequentially for simplicity and safety, though it could be threaded.
    # Note: we use execute_recovery logic here directly.
    for checkout in checkouts:
        try:
            agent = get_recovery_agent()
            agent_decision = agent.analyze(checkout)
            
            past_executions = db.query(RecoveryExecution).filter(RecoveryExecution.checkout_id == checkout.checkout_id).order_by(RecoveryExecution.created_at.desc()).all()
            current_attempt = len(past_executions) + 1
            last_attempt_time = past_executions[0].created_at if past_executions else None

            guardrail_result = evaluate_guardrails(checkout, agent_decision, current_attempt, last_attempt_time)
            outcome, recovered_amount = simulate_execution(checkout, guardrail_result, agent_decision.confidence_score)

            execution_log = RecoveryExecution(
                checkout_id=checkout.checkout_id,
                original_amount_at_risk=checkout.cart_value or 0.0,
                agent_decision=agent_decision.json(),
                selected_action=guardrail_result.action,
                guardrail_decision=guardrail_result.json(),
                outcome=outcome,
                recovered_amount=recovered_amount,
                attempt_number=current_attempt
            )
            db.add(execution_log)
            
            if outcome == "recovered":
                checkout.recovered = True
                checkout.recovered_amount = recovered_amount
                checkout.recovered_at = datetime.utcnow()
            
            checkout.attempt_count = (checkout.attempt_count or 0) + 1
            if outcome == "failed":
                checkout.previous_failed_payments = (checkout.previous_failed_payments or 0) + 1
                
            db.commit()
            
            results.append({
                "checkout_id": checkout.checkout_id,
                "outcome": outcome,
                "recovered_amount": recovered_amount
            })
        except Exception as e:
            db.rollback()
            results.append({
                "checkout_id": checkout.checkout_id,
                "outcome": "error",
                "error": str(e)
            })
            
    return {"processed": len(checkouts), "results": results}


@router.get('/recovery/execution-summary')
def execution_summary(db: Session = Depends(get_db)):
    # Calculate real execution metrics
    total_at_risk_query = db.query(func.coalesce(func.sum(CheckoutEvent.cart_value), 0.0)).filter(
        CheckoutEvent.payment_status.in_(['failed', 'abandoned'])
    )
    total_revenue_at_risk = float(total_at_risk_query.scalar())

    total_abandoned = db.query(func.count(CheckoutEvent.id)).filter(
        CheckoutEvent.payment_status.in_(['failed', 'abandoned'])
    ).scalar()

    total_eligible = db.query(func.count(CheckoutEvent.id)).filter(
        CheckoutEvent.payment_status.in_(['failed', 'abandoned']),
        CheckoutEvent.recovery_eligible == True
    ).scalar()

    actions_attempted = db.query(func.count(RecoveryExecution.id)).scalar()
    
    successfully_recovered = db.query(func.count(RecoveryExecution.id)).filter(
        RecoveryExecution.outcome == 'recovered'
    ).scalar()
    
    total_recovered_amount = db.query(func.coalesce(func.sum(RecoveryExecution.recovered_amount), 0.0)).filter(
        RecoveryExecution.outcome == 'recovered'
    ).scalar()
    
    stopped_by_policy = db.query(func.count(RecoveryExecution.id)).filter(
        RecoveryExecution.outcome == 'stopped_by_policy'
    ).scalar()
    
    requires_review = db.query(func.count(RecoveryExecution.id)).filter(
        RecoveryExecution.outcome == 'requires_review'
    ).scalar()

    recovery_rate = (total_recovered_amount / total_revenue_at_risk) * 100 if total_revenue_at_risk > 0 else 0
    amount_still_at_risk = max(0, total_revenue_at_risk - total_recovered_amount)

    return {
        "total_checkout_value_at_risk": total_revenue_at_risk,
        "number_of_abandoned_checkouts_detected": total_abandoned,
        "number_eligible_for_recovery": total_eligible,
        "number_of_recovery_actions_attempted": actions_attempted,
        "number_successfully_recovered": successfully_recovered,
        "total_amount_recovered": total_recovered_amount,
        "recovery_rate": round(recovery_rate, 2),
        "amount_still_at_risk": amount_still_at_risk,
        "number_of_cases_stopped_by_policy": stopped_by_policy,
        "number_of_cases_requiring_review": requires_review
    }
