from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from app.database import Base
import datetime


class CheckoutEvent(Base):
    __tablename__ = "checkouts"

    id = Column(Integer, primary_key=True, index=True)
    checkout_id = Column(String(64), unique=True, index=True, nullable=False)
    customer_id = Column(String(64), index=True, nullable=False)
    merchant_id = Column(String(64), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    customer_segment = Column(String(32))
    product_category = Column(String(64))
    cart_value = Column(Float)
    currency = Column(String(8), default="INR")

    payment_method = Column(String(32))
    payment_status = Column(String(32))
    failure_reason = Column(String(64), nullable=True)

    checkout_stage = Column(String(32))
    attempt_count = Column(Integer, default=1)
    time_on_checkout_seconds = Column(Integer, default=0)

    device_type = Column(String(16))
    hour_of_day = Column(Integer)

    previous_successful_orders = Column(Integer, default=0)
    previous_failed_payments = Column(Integer, default=0)

    risk_score = Column(Float, default=0.0)

    recovery_eligible = Column(Boolean, default=False)
    best_recovery_action = Column(String(32), nullable=True)
    recovery_probability = Column(Float, default=0.0)
    # Fields for supervised ML / logging
    applied_recovery_action = Column(String(32), nullable=True)
    recovered = Column(Boolean, default=False)
    recovered_amount = Column(Float, default=0.0)
    recovered_at = Column(DateTime, nullable=True)
    recovery_horizon_days = Column(Integer, nullable=True)
