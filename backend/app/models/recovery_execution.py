from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from app.database import Base
import datetime

class RecoveryExecution(Base):
    __tablename__ = "recovery_executions"

    id = Column(Integer, primary_key=True, index=True)
    checkout_id = Column(String(64), index=True, nullable=False)
    original_amount_at_risk = Column(Float, nullable=False)
    
    agent_decision = Column(Text, nullable=False) # JSON serialized
    selected_action = Column(String(64), nullable=False)
    guardrail_decision = Column(Text, nullable=False) # JSON serialized
    
    outcome = Column(String(32), nullable=False)
    recovered_amount = Column(Float, default=0.0)
    attempt_number = Column(Integer, default=1)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
