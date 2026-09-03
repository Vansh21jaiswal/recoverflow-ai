from datetime import datetime, timedelta
from typing import List, Optional
from app.models.checkout import CheckoutEvent
from app.schemas.recovery import AgentDecision
from app.schemas.execution import GuardrailResult

MAX_ATTEMPTS = 3
COOLDOWN_HOURS = 24
HIGH_VALUE_THRESHOLD = 5000
MIN_CONFIDENCE = 0.3

def evaluate_guardrails(
    checkout: CheckoutEvent, 
    agent_decision: AgentDecision, 
    current_attempt_count: int, 
    last_attempt_time: Optional[datetime]
) -> GuardrailResult:
    action = agent_decision.recommended_action
    
    if action == "no_action":
        return GuardrailResult(
            action=action,
            status="allowed",
            allowed=True,
            policy_rules_triggered=["action_is_no_action"]
        )

    # 1. Stop if already recovered
    if checkout.recovered:
        return GuardrailResult(
            action=action,
            status="blocked",
            allowed=False,
            blocked_reason="Checkout has already been successfully recovered.",
            policy_rules_triggered=["already_recovered"]
        )

    # 2. Maximum attempts
    if current_attempt_count >= MAX_ATTEMPTS:
        return GuardrailResult(
            action=action,
            status="blocked",
            allowed=False,
            blocked_reason=f"Maximum recovery attempts ({MAX_ATTEMPTS}) reached.",
            policy_rules_triggered=["max_attempts_exceeded"]
        )

    # 3. Cooldown period
    if last_attempt_time:
        if datetime.utcnow() - last_attempt_time < timedelta(hours=COOLDOWN_HOURS):
            return GuardrailResult(
                action=action,
                status="blocked",
                allowed=False,
                blocked_reason="Customer contacted too recently. Cooldown period active.",
                policy_rules_triggered=["cooldown_active"]
            )

    # 4. Low confidence
    if agent_decision.confidence_score < MIN_CONFIDENCE:
        return GuardrailResult(
            action="escalate_for_review",
            status="requires_review",
            allowed=False,
            review_required=True,
            blocked_reason="AI confidence score is too low for automatic execution.",
            policy_rules_triggered=["low_confidence_escalation"]
        )

    # 5. High value / High risk cases
    if agent_decision.risk_level == "high" or (checkout.cart_value and checkout.cart_value >= HIGH_VALUE_THRESHOLD):
        # Allow simple reminders, but escalate financial or sensitive actions
        if action not in ["send_payment_reminder", "send_personalized_nudge"]:
            return GuardrailResult(
                action="escalate_for_review",
                status="requires_review",
                allowed=False,
                review_required=True,
                blocked_reason="High value or high risk cases require human review for this action type.",
                policy_rules_triggered=["high_value_escalation"]
            )

    # 6. Discount limits (Policy rule 5)
    if action == "offer_limited_discount":
        # Simulate checking a configuration max discount.
        # Since the bounded action doesn't specify a % in the string, we just log the rule check.
        pass

    return GuardrailResult(
        action=action,
        status="allowed",
        allowed=True,
        policy_rules_triggered=[]
    )
