"""Lazy-loaded calibrated model for scoring recovery actions.

Never raises to callers: missing or broken artifacts yield None and the
rule engine continues unchanged.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Dict, Iterable, List, Optional

from app.models.checkout import CheckoutEvent

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "payment_status",
    "failure_reason",
    "attempt_count",
    "previous_failed_payments",
    "previous_successful_orders",
    "cart_value",
    "customer_segment",
    "payment_method",
    "time_on_checkout_seconds",
    "risk_score",
    "applied_recovery_action",
]

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_MODEL_PATH = os.path.join(_BACKEND_DIR, "models", "artifacts", "baseline_model_calibrated.pkl")

_lock = threading.Lock()
_load_attempted = False
_model = None
_load_error: Optional[str] = None


def model_path() -> str:
    return os.environ.get("RECOVERY_MODEL_PATH", DEFAULT_MODEL_PATH)


def ml_enabled() -> bool:
    return os.environ.get("RECOVERY_ML_ENABLED", "1").strip().lower() not in {"0", "false", "no"}


def last_load_failed() -> bool:
    get_calibrated_model()
    return bool(_load_attempted and _model is None and _load_error)


def model_status() -> Dict[str, Optional[str]]:
    return {
        "enabled": str(ml_enabled()),
        "path": model_path(),
        "loaded": str(_model is not None),
        "error": _load_error,
    }


def _smoke_predict(model) -> None:
    import pandas as pd

    sample = pd.DataFrame(
        [
            {
                "payment_status": "failed",
                "failure_reason": "bank_timeout",
                "attempt_count": 1,
                "previous_failed_payments": 0,
                "previous_successful_orders": 0,
                "cart_value": 100.0,
                "customer_segment": "new",
                "payment_method": "card",
                "time_on_checkout_seconds": 30,
                "risk_score": 0.1,
                "applied_recovery_action": "retry_payment",
            }
        ],
        columns=FEATURE_COLUMNS,
    )
    proba = model.predict_proba(sample)
    if proba is None or len(proba.shape) != 2 or proba.shape[1] < 2:
        raise ValueError("Model predict_proba did not return binary class scores")


def get_calibrated_model():
    """Load and cache the calibrated pipeline. Returns None on any failure."""
    global _load_attempted, _model, _load_error
    if not ml_enabled():
        return None
    if _load_attempted:
        return _model
    with _lock:
        if _load_attempted:
            return _model
        _load_attempted = True
        path = model_path()
        try:
            import joblib

            if not os.path.isfile(path):
                raise FileNotFoundError(f"Calibrated model not found: {path}")
            loaded = joblib.load(path)
            if not hasattr(loaded, "predict_proba"):
                raise TypeError(f"Loaded object has no predict_proba: {type(loaded)}")
            _smoke_predict(loaded)
            _model = loaded
            _load_error = None
            logger.info("Loaded calibrated recovery model from %s", path)
        except Exception as exc:
            _model = None
            _load_error = f"{type(exc).__name__}: {exc}"
            logger.warning("Recovery ML unavailable (%s); using rule-based fallback", _load_error)
        return _model


def _feature_row(checkout: CheckoutEvent, action: str) -> dict:
    return {
        "payment_status": checkout.payment_status,
        "failure_reason": checkout.failure_reason,
        "attempt_count": checkout.attempt_count,
        "previous_failed_payments": checkout.previous_failed_payments,
        "previous_successful_orders": checkout.previous_successful_orders,
        "cart_value": checkout.cart_value,
        "customer_segment": checkout.customer_segment,
        "payment_method": checkout.payment_method,
        "time_on_checkout_seconds": checkout.time_on_checkout_seconds,
        "risk_score": checkout.risk_score,
        "applied_recovery_action": action,
    }


def score_actions(checkout: CheckoutEvent, actions: Iterable[str]) -> Optional[Dict[str, float]]:
    """P(recovered | checkout, action) for each candidate. None if ML cannot be used."""
    action_list: List[str] = [a for a in actions if a]
    if not action_list:
        return None
    model = get_calibrated_model()
    if model is None:
        return None
    try:
        import pandas as pd

        X = pd.DataFrame(
            [_feature_row(checkout, action) for action in action_list],
            columns=FEATURE_COLUMNS,
        )
        proba = model.predict_proba(X)[:, 1]
        return {action: float(p) for action, p in zip(action_list, proba)}
    except Exception as exc:
        logger.warning("ML inference failed for checkout %s: %s", getattr(checkout, "checkout_id", "?"), exc)
        return None
