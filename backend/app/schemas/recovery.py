from pydantic import BaseModel
from typing import List


class AgentDecision(BaseModel):
    risk_level: str
    likely_abandonment_reason: str
    confidence_score: float
    recommended_action: str
    reason_for_action: str
    recovery_priority: str


class RecoveryDecisionOut(BaseModel):
    checkout_id: str
    recommended_action: str
    confidence: float
    reason: str
    signals: List[str]
    estimated_recovery_probability: float
    expected_recoverable_revenue: float
    decision_source: str
