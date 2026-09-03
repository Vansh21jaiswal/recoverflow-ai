from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class GuardrailResult(BaseModel):
    action: str
    status: str
    allowed: bool
    blocked_reason: Optional[str] = None
    review_required: bool = False
    policy_rules_triggered: List[str] = []

class ExecutionResponse(BaseModel):
    checkout_id: str
    original_amount_at_risk: float
    selected_action: str
    guardrail_decision: GuardrailResult
    outcome: str
    recovered_amount: float
    recovery_attempt_number: int
    execution_timestamp: datetime
