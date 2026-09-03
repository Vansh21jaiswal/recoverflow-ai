from dataclasses import dataclass, field
from typing import List, Optional

from pydantic import BaseModel

from app.models.checkout import CheckoutEvent
from app.services.ml_scorer import get_calibrated_model, last_load_failed, score_actions


class RecoveryDecision(BaseModel):
    checkout_id: str
    recommended_action: str
    confidence: float
    reason: str
    signals: List[str]
    estimated_recovery_probability: float
    expected_recoverable_revenue: float
    decision_source: str = "rule_based"


HARD_BLOCKS = {"suspected_fraud", "compliance_hold"}
TEMPORARY_REASONS = {"bank_timeout", "upi_timeout", "gateway_timeout"}
ML_RANK_MARGIN = 0.02


def _base_confidence_for_action(action: str) -> float:
    mapping = {
        "human_review": 0.95,
        "retry_payment": 0.85,
        "switch_payment_method": 0.80,
        "send_reminder": 0.65,
        "offer_small_incentive": 0.75,
        "no_action": 0.10,
        # New Agent Actions
        "send_payment_reminder": 0.70,
        "send_personalized_nudge": 0.65,
        "offer_limited_discount": 0.80,
        "create_payment_link": 0.90,
        "escalate_for_review": 0.95,
    }
    return mapping.get(action, 0.5)


def _base_prob_for_action(action: str) -> float:
    mapping = {
        "retry_payment": 0.35,
        "switch_payment_method": 0.30,
        "send_reminder": 0.25,
        "offer_small_incentive": 0.60,
        "human_review": 0.05,
        "no_action": 0.0,
        # New Agent Actions
        "send_payment_reminder": 0.30,
        "send_personalized_nudge": 0.35,
        "offer_limited_discount": 0.65,
        "create_payment_link": 0.40,
        "escalate_for_review": 0.05,
    }
    return mapping.get(action, 0.0)


def estimate_probability(action: str, checkout: CheckoutEvent) -> float:
    p = _base_prob_for_action(action)

    # customer segment modifiers
    seg = checkout.customer_segment or ""
    if seg == "high_value":
        p += 0.15
    elif seg == "returning":
        p += 0.05
    elif seg == "new":
        p -= 0.05
    elif seg == "at_risk":
        p -= 0.10

    # previous successful orders help
    p += min(0.2, (checkout.previous_successful_orders or 0) * 0.01)

    # attempt count reduces recovery likelihood
    attempts = checkout.attempt_count or 1
    if attempts > 1:
        p -= min(0.15, 0.03 * (attempts - 1))

    # risk score reduces
    p -= (checkout.risk_score or 0.0) * 0.5

    # action-specific tweak: incentives more effective for high cart value customers
    if action in ("offer_small_incentive", "offer_limited_discount") and checkout.cart_value and checkout.cart_value > 10000:
        p += 0.05

    # clamp
    p = max(0.0, min(0.95, round(p, 3)))
    return p


@dataclass
class PolicyResult:
    action: str
    confidence: float
    reason: str
    signals: List[str]
    candidates: List[str]
    locked: bool
    force_zero_probability: bool = False
    extra_signals: List[str] = field(default_factory=list)


def _policy_for_checkout(checkout: CheckoutEvent) -> PolicyResult:
    """Deterministic eligibility, safety, and candidate constraints. ML cannot override this."""
    signals: List[str] = []

    if not checkout.recovery_eligible:
        return PolicyResult(
            action="no_action",
            confidence=0.10,
            reason="Recovery not eligible for this checkout.",
            signals=["Recovery flagged as ineligible"],
            candidates=["no_action"],
            locked=True,
            force_zero_probability=True,
        )

    if checkout.failure_reason in HARD_BLOCKS:
        action = "human_review"
        return PolicyResult(
            action=action,
            confidence=_base_confidence_for_action(action),
            reason=f"Hard block: {checkout.failure_reason}",
            signals=[f"Hard failure reason: {checkout.failure_reason}"],
            candidates=[action],
            locked=True,
        )

    if checkout.failure_reason in TEMPORARY_REASONS:
        signals.append(f"Temporary failure: {checkout.failure_reason}")
        if (checkout.attempt_count or 1) <= 1:
            action = "retry_payment"
            candidates = ["retry_payment", "switch_payment_method"]
        else:
            action = "switch_payment_method"
            candidates = ["switch_payment_method", "retry_payment"]
        return PolicyResult(
            action=action,
            confidence=_base_confidence_for_action("retry_payment"),
            reason=f"Temporary payment failure: {checkout.failure_reason}",
            signals=signals,
            candidates=candidates,
            locked=False,
        )

    if (checkout.previous_failed_payments or 0) >= 2 or (checkout.attempt_count or 0) >= 3:
        action = "switch_payment_method"
        signals.append(f"previous_failed_payments={checkout.previous_failed_payments}")
        signals.append(f"attempt_count={checkout.attempt_count}")
        return PolicyResult(
            action=action,
            confidence=_base_confidence_for_action(action),
            reason="Repeated payment failures detected",
            signals=signals,
            candidates=[action],
            locked=False,
        )

    if (
        checkout.payment_status == "abandoned"
        and (checkout.cart_value or 0) >= 5000
        and (checkout.customer_segment in ("returning", "high_value"))
    ):
        signals.append(f"abandoned_high_value_cart={checkout.cart_value}")
        if (checkout.risk_score or 0.0) < 0.6:
            action = "offer_small_incentive"
            return PolicyResult(
                action=action,
                confidence=_base_confidence_for_action(action),
                reason="High-value customer abandoned; offer small incentive",
                signals=signals,
                candidates=["offer_small_incentive", "send_reminder"],
                locked=False,
            )
        action = "human_review"
        return PolicyResult(
            action=action,
            confidence=_base_confidence_for_action(action),
            reason="High-value abandonment with elevated risk; human review",
            signals=signals,
            candidates=[action],
            locked=True,
        )

    if checkout.payment_status == "abandoned":
        action = "send_reminder"
        signals.append(f"time_on_checkout_seconds={checkout.time_on_checkout_seconds}")
        return PolicyResult(
            action=action,
            confidence=_base_confidence_for_action(action),
            reason="Customer abandoned checkout; send reminder",
            signals=signals,
            candidates=[action],
            locked=False,
        )

    action = "retry_payment"
    signals.append(f"failure_reason={checkout.failure_reason}")
    return PolicyResult(
        action=action,
        confidence=_base_confidence_for_action(action),
        reason="Default recovery action for failed checkout",
        signals=signals,
        candidates=["retry_payment", "switch_payment_method"],
        locked=False,
    )


def _select_action(policy: PolicyResult, scores: Optional[dict]) -> str:
    if policy.locked or not scores:
        return policy.action
    ranked = [a for a in policy.candidates if a in scores]
    if not ranked:
        return policy.action
    best = max(ranked, key=lambda a: scores[a])
    rule_score = scores.get(policy.action)
    if rule_score is None:
        return best
    if scores[best] > rule_score + ML_RANK_MARGIN:
        return best
    return policy.action


def _decision_source(policy: PolicyResult, scores: Optional[dict], action_changed: bool) -> str:
    model_present = get_calibrated_model() is not None
    if scores:
        return "ml_assisted"
    if not model_present:
        # Artifact missing/corrupt/disabled after a load attempt, or ML turned off.
        from app.services.ml_scorer import _load_attempted, _load_error, ml_enabled

        if ml_enabled() and (_load_attempted and _load_error):
            return "fallback"
        return "rule_based"
    if action_changed:
        return "ml_assisted"
    return "rule_based"


from app.services.recovery_engine_cache import cache
def decision_for_checkout(checkout: CheckoutEvent) -> RecoveryDecision:
    if checkout.checkout_id in cache:
        return cache[checkout.checkout_id]
    res = _decision_for_checkout_impl(checkout)
    cache[checkout.checkout_id] = res
    return res

from app.agent.providers import get_recovery_agent

def _decision_for_checkout_impl(checkout: CheckoutEvent) -> RecoveryDecision:
    # Get the structured decision from the core Recovery Agent
    agent = get_recovery_agent()
    agent_decision = agent.analyze(checkout)
    
    # We still evaluate the deterministic policy to respect hard blocks
    policy = _policy_for_checkout(checkout)
    
    action = agent_decision.recommended_action
    # Override agent if policy mandates zero probability or a locked hard-block
    if policy.force_zero_probability or policy.locked:
        action = policy.action

    reason = agent_decision.reason_for_action
    if action != agent_decision.recommended_action:
        reason = f"Policy override: {policy.reason}. Agent suggested: {agent_decision.recommended_action}."

    signals = list(policy.signals)
    signals.append(f"risk_level={agent_decision.risk_level}")
    signals.append(f"likely_abandonment_reason={agent_decision.likely_abandonment_reason}")
    signals.append(f"recovery_priority={agent_decision.recovery_priority}")
    signals.append(f"payment_method={checkout.payment_method}")
    signals.append(f"customer_segment={checkout.customer_segment}")
    signals.append(f"previous_successful_orders={checkout.previous_successful_orders}")

    est_prob = estimate_probability(action, checkout)
    if policy.force_zero_probability:
        est_prob = 0.0

    expected_rev = round((checkout.cart_value or 0.0) * est_prob, 2)
    
    source = "ai_agent"
    if agent.__class__.__name__ == "DeterministicAgent":
        source = "rule_based"
    if policy.force_zero_probability or policy.locked:
        source = "policy_locked"

    return RecoveryDecision(
        checkout_id=checkout.checkout_id,
        recommended_action=action,
        confidence=round(agent_decision.confidence_score, 2),
        reason=reason,
        signals=signals,
        estimated_recovery_probability=est_prob,
        expected_recoverable_revenue=expected_rev,
        decision_source=source,
    )
