import os
import json
import logging
import urllib.request
from abc import ABC, abstractmethod

from app.models.checkout import CheckoutEvent
from app.schemas.recovery import AgentDecision

logger = logging.getLogger(__name__)

BOUNDED_ACTIONS = [
    "send_payment_reminder",
    "send_personalized_nudge",
    "offer_limited_discount",
    "create_payment_link",
    "no_action",
    "escalate_for_review"
]

class BaseRecoveryAgent(ABC):
    @abstractmethod
    def analyze(self, checkout: CheckoutEvent) -> AgentDecision:
        pass


class DeterministicAgent(BaseRecoveryAgent):
    def analyze(self, checkout: CheckoutEvent) -> AgentDecision:
        # Heuristics based on checkout fields
        
        # Determine risk level
        risk_level = "low"
        if checkout.risk_score and checkout.risk_score > 0.7:
            risk_level = "high"
        elif checkout.cart_value and checkout.cart_value > 5000:
            risk_level = "medium"

        # Determine reason
        likely_reason = "Customer distraction or temporary network failure"
        if checkout.failure_reason in ["insufficient_funds", "card_declined", "fraud_suspected"]:
            likely_reason = f"Payment failure: {checkout.failure_reason}"
        elif checkout.time_on_checkout_seconds and checkout.time_on_checkout_seconds > 120:
            likely_reason = "High friction during checkout process"

        # Determine action
        action = "send_payment_reminder"
        if risk_level == "high":
            action = "escalate_for_review"
        elif checkout.failure_reason in ["bank_timeout", "upi_timeout", "gateway_timeout"]:
            action = "create_payment_link"
        elif checkout.customer_segment in ["high_value", "returning"] and checkout.cart_value and checkout.cart_value > 3000:
            action = "offer_limited_discount"
        elif checkout.attempt_count and checkout.attempt_count > 2:
            action = "send_personalized_nudge"

        return AgentDecision(
            risk_level=risk_level,
            likely_abandonment_reason=likely_reason,
            confidence_score=0.75,
            recommended_action=action,
            reason_for_action="Deterministic fallback based on checkout properties",
            recovery_priority="high" if risk_level in ["medium", "high"] else "normal"
        )


class LLMAgent(BaseRecoveryAgent):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.fallback = DeterministicAgent()

    def analyze(self, checkout: CheckoutEvent) -> AgentDecision:
        try:
            system_prompt = (
                "You are an AI Recovery Agent for an abandoned checkout recovery system.\n"
                "You analyze checkout contexts and produce a structured decision.\n"
                "You MUST respond with valid JSON matching this schema:\n"
                "{\n"
                '  "risk_level": "low" | "medium" | "high",\n'
                '  "likely_abandonment_reason": "string",\n'
                '  "confidence_score": float between 0 and 1,\n'
                f'  "recommended_action": "must be one of {BOUNDED_ACTIONS}",\n'
                '  "reason_for_action": "string",\n'
                '  "recovery_priority": "string"\n'
                "}\n"
            )
            
            user_prompt = (
                f"Checkout Amount: {checkout.cart_value} {checkout.currency}\n"
                f"Customer Segment: {checkout.customer_segment}\n"
                f"Previous Successes: {checkout.previous_successful_orders}\n"
                f"Previous Failures: {checkout.previous_failed_payments}\n"
                f"Attempts: {checkout.attempt_count}\n"
                f"Failure Reason: {checkout.failure_reason}\n"
                f"Time on Checkout: {checkout.time_on_checkout_seconds}s\n"
                f"Payment Method: {checkout.payment_method}\n"
                f"Risk Score: {checkout.risk_score}\n"
            )

            req_body = json.dumps({
                "model": "gpt-4o-mini",
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2
            }).encode('utf-8')

            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=req_body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}"
                }
            )

            with urllib.request.urlopen(req, timeout=8) as response:
                result = json.loads(response.read().decode('utf-8'))
                content = result['choices'][0]['message']['content']
                parsed = json.loads(content)
                
                return AgentDecision(
                    risk_level=parsed.get("risk_level", "low"),
                    likely_abandonment_reason=parsed.get("likely_abandonment_reason", "Unknown"),
                    confidence_score=float(parsed.get("confidence_score", 0.7)),
                    recommended_action=parsed.get("recommended_action", "no_action"),
                    reason_for_action=parsed.get("reason_for_action", "AI decision"),
                    recovery_priority=parsed.get("recovery_priority", "normal")
                )
        except Exception as e:
            logger.warning(f"LLMAgent failed: {e}. Falling back to deterministic.")
            return self.fallback.analyze(checkout)


def get_recovery_agent() -> BaseRecoveryAgent:
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        return LLMAgent(api_key)
    return DeterministicAgent()
