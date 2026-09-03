"""Utilities to export training datasets from the checkouts DB.

Produces a CSV suitable for supervised training: features + applied action + recovered label.
"""
from typing import Iterable
import csv
from datetime import datetime
from app.database import SessionLocal
from app.models.checkout import CheckoutEvent


DEFAULT_COLUMNS = [
    'checkout_id', 'customer_id', 'merchant_id', 'created_at', 'customer_segment',
    'product_category', 'cart_value', 'currency', 'payment_method', 'payment_status',
    'failure_reason', 'checkout_stage', 'attempt_count', 'time_on_checkout_seconds',
    'device_type', 'hour_of_day', 'previous_successful_orders', 'previous_failed_payments',
    'risk_score', 'recovery_eligible', 'best_recovery_action', 'recovery_probability',
    # labels
    'applied_recovery_action', 'recovered', 'recovered_amount', 'recovered_at', 'recovery_horizon_days'
]


def _row_from_checkout(c: CheckoutEvent):
    return {
        'checkout_id': c.checkout_id,
        'customer_id': c.customer_id,
        'merchant_id': c.merchant_id,
        'created_at': c.created_at.isoformat() if c.created_at else None,
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
        'applied_recovery_action': c.applied_recovery_action,
        'recovered': c.recovered,
        'recovered_amount': c.recovered_amount,
        'recovered_at': c.recovered_at.isoformat() if c.recovered_at else None,
        'recovery_horizon_days': c.recovery_horizon_days,
    }


def export_csv(path: str, limit: int = None):
    db = SessionLocal()
    try:
        q = db.query(CheckoutEvent)
        if limit:
            q = q.limit(limit)
        rows = q.all()
        with open(path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=DEFAULT_COLUMNS)
            writer.writeheader()
            for c in rows:
                writer.writerow(_row_from_checkout(c))
        return path, len(rows)
    finally:
        db.close()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=str, default='training_dataset.csv')
    parser.add_argument('--limit', type=int, default=1000)
    args = parser.parse_args()
    p, n = export_csv(args.out, args.limit)
    print(f'Wrote {n} rows to {p}')
