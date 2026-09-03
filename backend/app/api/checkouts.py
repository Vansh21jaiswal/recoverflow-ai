from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from app.database import get_db, engine
from app.models.checkout import CheckoutEvent
from sqlalchemy import func

router = APIRouter()


def checkout_to_dict(c: CheckoutEvent):
    return {
        'id': c.id,
        'checkout_id': c.checkout_id,
        'customer_id': c.customer_id,
        'merchant_id': c.merchant_id,
        'created_at': c.created_at.isoformat() if c.created_at else None,
        'updated_at': c.updated_at.isoformat() if c.updated_at else None,
        'customer_segment': c.customer_segment,
        'product_category': c.product_category,
        'cart_value': c.cart_value,
        'currency': c.currency,
        'payment_method': c.payment_method,
        'payment_status': c.payment_status,
        'failure_reason': c.failure_reason,
        'checkout_stage': c.checkout_stage,
        'attempt_count': c.attempt_count,
        'time_on_checkout_seconds': c.time_on_checkout_seconds,
        'device_type': c.device_type,
        'hour_of_day': c.hour_of_day,
        'previous_successful_orders': c.previous_successful_orders,
        'previous_failed_payments': c.previous_failed_payments,
        'risk_score': c.risk_score,
        'recovery_eligible': c.recovery_eligible,
        'best_recovery_action': c.best_recovery_action,
        'recovery_probability': c.recovery_probability,
    }


@router.get('/checkouts')
def list_checkouts(limit: int = Query(100, ge=1, le=1000), payment_status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(CheckoutEvent)
    if payment_status:
        q = q.filter(CheckoutEvent.payment_status == payment_status)
    q = q.order_by(CheckoutEvent.id.desc()).limit(limit)
    results = q.all()
    return [checkout_to_dict(r) for r in results]


@router.get('/checkouts/summary')
def checkouts_summary(db: Session = Depends(get_db)):
    total = db.query(func.count(CheckoutEvent.id)).scalar()
    completed = db.query(func.count(CheckoutEvent.id)).filter(CheckoutEvent.payment_status == 'completed').scalar()
    failed = db.query(func.count(CheckoutEvent.id)).filter(CheckoutEvent.payment_status == 'failed').scalar()
    abandoned = db.query(func.count(CheckoutEvent.id)).filter(CheckoutEvent.payment_status == 'abandoned').scalar()

    total_revenue_completed = db.query(func.coalesce(func.sum(CheckoutEvent.cart_value), 0.0)).filter(CheckoutEvent.payment_status == 'completed').scalar()

    # revenue at risk: failed or abandoned and recovery_eligible
    total_revenue_at_risk = db.query(func.coalesce(func.sum(CheckoutEvent.cart_value), 0.0)).filter(
        CheckoutEvent.payment_status.in_(['failed','abandoned']), CheckoutEvent.recovery_eligible == True
    ).scalar()

    return {
        'total_checkouts': total,
        'completed_checkouts': completed,
        'failed_checkouts': failed,
        'abandoned_checkouts': abandoned,
        'total_revenue_completed': float(total_revenue_completed or 0.0),
        'total_revenue_at_risk': float(total_revenue_at_risk or 0.0),
    }
