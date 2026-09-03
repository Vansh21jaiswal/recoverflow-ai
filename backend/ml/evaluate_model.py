"""Offline evaluation and charts for saved baseline recovery models.

Reuses feature definitions from train.py. Does not modify live API or rules.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.inspection import permutation_importance
from sklearn.metrics import roc_curve
from sklearn.model_selection import train_test_split

ML_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(ML_DIR, ".."))
ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

# Point export at the backend SQLite file the API typically uses, unless overridden.
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(BACKEND_DIR, "recoverflow.db")

from train import (  # noqa: E402
    ARTIFACT_DIR,
    evaluate,
    load_dataset,
    prepare_features,
)

from app.services.dataset import export_csv  # noqa: E402

REPORTS_DIR = os.path.join(BACKEND_DIR, "reports")
CHARTS_DIR = os.path.join(REPORTS_DIR, "charts")
DEFAULT_EVAL_CSV = os.path.join(REPORTS_DIR, "eval_dataset.csv")
TMP_TRAINING_CSV = os.path.join("/tmp", "training_dataset.csv")

CAT_COLS = [
    "payment_status",
    "failure_reason",
    "customer_segment",
    "payment_method",
    "applied_recovery_action",
]
NUM_COLS = [
    "attempt_count",
    "previous_failed_payments",
    "previous_successful_orders",
    "cart_value",
    "time_on_checkout_seconds",
    "risk_score",
]


def ensure_dataset_csv() -> str:
    env_path = os.environ.get("TRAINING_CSV")
    candidates = [p for p in (env_path, TMP_TRAINING_CSV, DEFAULT_EVAL_CSV) if p]
    for path in candidates:
        if os.path.isfile(path):
            print("Using existing dataset CSV:", path)
            return path

    out_path = env_path or DEFAULT_EVAL_CSV
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    print("No training CSV found; exporting from SQLite via existing export_csv() ->", out_path)
    path, n = export_csv(out_path, limit=None)
    print(f"Exported {n} rows to {path}")
    return path


def load_models():
    uncal_path = os.path.join(ARTIFACT_DIR, "baseline_model.pkl")
    cal_path = os.path.join(ARTIFACT_DIR, "baseline_model_calibrated.pkl")
    if not os.path.isfile(uncal_path) or not os.path.isfile(cal_path):
        raise FileNotFoundError(
            f"Missing model artifacts. Expected:\n  {uncal_path}\n  {cal_path}"
        )
    return {
        "baseline_model": joblib.load(uncal_path),
        "baseline_model_calibrated": joblib.load(cal_path),
    }, uncal_path, cal_path


def _estimator_pipeline(obj):
    if hasattr(obj, "named_steps") and "clf" in getattr(obj, "named_steps", {}):
        return obj
    est = getattr(obj, "estimator", None) or getattr(obj, "base_estimator", None)
    if est is not None and hasattr(est, "named_steps"):
        return est
    return None


def feature_importance_frame(model, X_test=None, y_test=None) -> pd.DataFrame | None:
    """Native tree importances when present; otherwise permutation importance on raw features."""
    pipelines = []
    if hasattr(model, "calibrated_classifiers_"):
        for cc in model.calibrated_classifiers_:
            pipe = _estimator_pipeline(cc)
            if pipe is not None:
                pipelines.append(pipe)
    else:
        pipe = _estimator_pipeline(model)
        if pipe is not None:
            pipelines.append(pipe)

    rows = []
    for pipe in pipelines:
        pre = pipe.named_steps.get("pre")
        clf = pipe.named_steps.get("clf")
        if pre is None or clf is None or not hasattr(clf, "feature_importances_"):
            continue
        try:
            names = pre.get_feature_names_out()
        except Exception:
            names = np.array([f"f{i}" for i in range(len(clf.feature_importances_))])
        imp = np.asarray(clf.feature_importances_, dtype=float)
        if len(names) != len(imp):
            names = np.array([f"f{i}" for i in range(len(imp))])
        rows.append(pd.Series(imp, index=names))

    if rows:
        avg = pd.concat(rows, axis=1).mean(axis=1).sort_values(ascending=False)
        return avg.rename("importance").reset_index().rename(columns={"index": "feature"})

    if X_test is None or y_test is None:
        return None
    print("Native feature_importances_ unavailable; using permutation importance on original columns.")
    result = permutation_importance(
        model, X_test, y_test, n_repeats=8, random_state=42, scoring="roc_auc"
    )
    series = pd.Series(result.importances_mean, index=list(X_test.columns))
    series = series.sort_values(ascending=False)
    return series.rename("importance").reset_index().rename(columns={"index": "feature"})


def _save_fig(fig, name: str) -> str:
    path = os.path.join(CHARTS_DIR, name)
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)
    return path


def plot_roc(y_test, probas: dict) -> str:
    fig, ax = plt.subplots(figsize=(7, 5))
    for label, proba in probas.items():
        fpr, tpr, _ = roc_curve(y_test, proba)
        ax.plot(fpr, tpr, label=label)
    ax.plot([0, 1], [0, 1], "--", color="gray", linewidth=1, label="chance")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("ROC curve comparison")
    ax.legend()
    return _save_fig(fig, "roc_curve_comparison.png")


def plot_calibration(y_test, probas: dict) -> str:
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot([0, 1], [0, 1], "--", color="gray", linewidth=1, label="perfect")
    for label, proba in probas.items():
        frac, mean_pred = calibration_curve(y_test, proba, n_bins=10, strategy="uniform")
        ax.plot(mean_pred, frac, marker="o", label=label)
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Fraction of positives")
    ax.set_title("Calibration curve comparison")
    ax.legend()
    return _save_fig(fig, "calibration_curve_comparison.png")


def plot_proba_distribution(probas: dict) -> str:
    fig, ax = plt.subplots(figsize=(7, 5))
    for label, proba in probas.items():
        ax.hist(proba, bins=30, alpha=0.5, label=label, range=(0, 1))
    ax.set_xlabel("Predicted recovery probability")
    ax.set_ylabel("Count (test set)")
    ax.set_title("Predicted recovery probability distribution")
    ax.legend()
    return _save_fig(fig, "predicted_probability_distribution.png")


def plot_feature_importance(imp_df: pd.DataFrame | None) -> str | None:
    if imp_df is None or imp_df.empty:
        return None
    top = imp_df.head(20).iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.barh(top["feature"], top["importance"])
    ax.set_xlabel("Mean native feature importance")
    ax.set_title("Feature importance")
    return _save_fig(fig, "feature_importance.png")


def plot_action_distribution(df: pd.DataFrame) -> str:
    counts = df["applied_recovery_action"].fillna("none").value_counts()
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.bar(counts.index.astype(str), counts.values)
    ax.set_ylabel("Count")
    ax.set_title("Applied recovery action distribution (evaluation CSV)")
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    return _save_fig(fig, "action_distribution.png")


def plot_expected_recovery_value(X_test: pd.DataFrame, proba: np.ndarray) -> str:
    expected = X_test["cart_value"].fillna(0).to_numpy(dtype=float) * proba
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.hist(expected, bins=30, color="steelblue")
    ax.set_xlabel("Estimated recoverable value (cart_value × P(recovered))")
    ax.set_ylabel("Count (test set)")
    ax.set_title("Estimated recovery value distribution (calibrated model)")
    return _save_fig(fig, "estimated_recovery_value_distribution.png")


def write_metrics_json(payload: dict) -> str:
    path = os.path.join(REPORTS_DIR, "metrics.json")
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    return path


def write_markdown_report(payload: dict, chart_files: list[str]) -> str:
    uncal = payload["models"]["baseline_model"]["metrics"]
    cal = payload["models"]["baseline_model_calibrated"]["metrics"]
    ds = payload["dataset"]
    brier_delta = uncal["brier"] - cal["brier"]
    cal_better = cal["brier"] < uncal["brier"]

    lines = [
        "# RecoverFlow AI — Offline Model Evaluation",
        "",
        f"Generated at {payload['generated_at']}.",
        "",
        "This report evaluates saved sklearn artifacts **offline**. "
        "The live dashboard and `/recovery/*` APIs remain **rule-based** "
        "(`app/services/recovery_engine.py`) and were not changed.",
        "",
        "## Dataset",
        "",
        f"- CSV: `{ds['csv_path']}`",
        f"- Rows: {ds['n_rows']}",
        f"- Positive recovered labels: {ds['n_positive']} ({ds['positive_rate']:.1%})",
        f"- Held-out test size: {payload['split']['test_size']} (random_state={payload['split']['random_state']}, stratified)",
        f"- Test rows: {payload['split']['n_test']}",
        "",
        "Features match `backend/ml/train.py` (no IDs, no `best_recovery_action` / `recovery_probability`). "
        "The model is **action-conditional**: `applied_recovery_action` is an input.",
        "",
        "## Metrics",
        "",
        "| Model | ROC-AUC | Accuracy | Precision | Recall | Brier (lower is better) |",
        "|---|---:|---:|---:|---:|---:|",
        f"| baseline_model.pkl | {uncal['roc_auc']:.4f} | {uncal['accuracy']:.4f} | {uncal['precision']:.4f} | {uncal['recall']:.4f} | {uncal['brier']:.4f} |",
        f"| baseline_model_calibrated.pkl | {cal['roc_auc']:.4f} | {cal['accuracy']:.4f} | {cal['precision']:.4f} | {cal['recall']:.4f} | {cal['brier']:.4f} |",
        "",
        "## What the numbers mean",
        "",
        f"- **Discrimination (ROC-AUC):** uncalibrated {uncal['roc_auc']:.3f}, calibrated {cal['roc_auc']:.3f}. "
        "Values well above 0.5 mean the model ranks recoveries better than chance on this split. "
        "Accuracy is dominated by the majority class (most checkouts never recover).",
        f"- **Precision / recall:** precision {cal['precision']:.3f} and recall {cal['recall']:.3f} "
        "(calibrated, threshold 0.5). Low recall is expected with a rare positive class and a 0.5 cutoff; "
        "the useful output for recovery is the **probability**, not the hard label.",
        "",
        "## Does calibration improve probability reliability?",
        "",
    ]
    if cal_better:
        lines.append(
            f"Yes on this split: Brier score fell from {uncal['brier']:.4f} to {cal['brier']:.4f} "
            f"(improvement {brier_delta:.4f}). Platt scaling (`CalibratedClassifierCV`, sigmoid) "
            "is intended to make predicted probabilities closer to observed frequencies. "
            "Confirm visually with `charts/calibration_curve_comparison.png`."
        )
    else:
        lines.append(
            f"Not clearly: Brier went from {uncal['brier']:.4f} (uncalibrated) to {cal['brier']:.4f} "
            f"(calibrated). Ranking (ROC-AUC) can stay similar while probability reliability does not improve. "
            "Use the calibration plot before treating scores as true recovery rates."
        )
    lines.extend(
        [
            "",
            "## Limitations (synthetic data)",
            "",
            "- Labels come from `app/services/synthetic.py` heuristics plus randomness, not real customer outcomes.",
            "- The same process that generates features also generates `recovered`, so metrics can look stronger than they would in production.",
            "- Regenerating the CSV from the current SQLite DB may not match the exact file originally used to train the pickles.",
            "- Class imbalance is severe; a 0.5 classification threshold is a reporting convention, not an operating policy.",
            "- `applied_recovery_action` must be known (or scored per candidate action) at inference time; that is not how the live rules engine works today.",
            "",
            "Feature importance uses native `feature_importances_` when the estimator exposes it. "
            "The saved `HistGradientBoostingClassifier` pickle does not, so the chart uses sklearn permutation importance on the original (unencoded) columns. SHAP was not added.",
            "",
            "## Live product vs this evaluation",
            "",
            "The dashboard at `/dashboard` still calls `/recovery/baseline-summary` and `/recovery/decisions`, "
            "which use handwritten rules and heuristic probabilities. These pickle models are **not** loaded by FastAPI.",
            "",
            "## Charts",
            "",
        ]
    )
    for name in chart_files:
        lines.append(f"- `{name}`")
    lines.append("")
    path = os.path.join(REPORTS_DIR, "EVALUATION.md")
    with open(path, "w") as f:
        f.write("\n".join(lines))
    return path


def main():
    os.makedirs(CHARTS_DIR, exist_ok=True)

    csv_path = ensure_dataset_csv()
    df = load_dataset(csv_path)
    X, y = prepare_features(df)
    missing = [c for c in CAT_COLS + NUM_COLS if c not in X.columns]
    if missing:
        raise ValueError(f"Dataset missing training features: {missing}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    models, uncal_path, cal_path = load_models()
    metrics_by_model = {}
    probas = {}
    display_names = {
        "baseline_model": "uncalibrated",
        "baseline_model_calibrated": "calibrated",
    }

    for key, model in models.items():
        metrics, proba = evaluate(model, X_test, y_test)
        metrics_by_model[key] = metrics
        probas[display_names[key]] = proba
        print(f"{key}: {metrics}")

    chart_paths = [
        plot_roc(y_test, probas),
        plot_calibration(y_test, probas),
        plot_proba_distribution(probas),
        plot_action_distribution(df),
        plot_expected_recovery_value(X_test, probas["calibrated"]),
    ]
    imp_df = feature_importance_frame(models["baseline_model"], X_test, y_test)
    if imp_df is None:
        imp_df = feature_importance_frame(models["baseline_model_calibrated"], X_test, y_test)
    imp_chart = plot_feature_importance(imp_df)
    if imp_chart:
        chart_paths.append(imp_chart)
        imp_top = imp_df.head(15).to_dict(orient="records")
    else:
        imp_top = []

    expected_cal = X_test["cart_value"].fillna(0).to_numpy(dtype=float) * probas["calibrated"]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "csv_path": csv_path,
            "n_rows": int(len(df)),
            "n_positive": int(y.sum()),
            "positive_rate": float(y.mean()),
            "feature_columns": CAT_COLS + NUM_COLS,
            "excluded_potential_leakage": ["best_recovery_action", "recovery_probability", "checkout_id"],
        },
        "split": {
            "test_size": 0.2,
            "random_state": 42,
            "stratify": True,
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
        },
        "artifacts": {
            "baseline_model": uncal_path,
            "baseline_model_calibrated": cal_path,
        },
        "models": {
            "baseline_model": {
                "type": type(models["baseline_model"]).__name__,
                "metrics": metrics_by_model["baseline_model"],
            },
            "baseline_model_calibrated": {
                "type": type(models["baseline_model_calibrated"]).__name__,
                "metrics": metrics_by_model["baseline_model_calibrated"],
            },
        },
        "test_expected_recovery_value_calibrated": {
            "mean": float(np.mean(expected_cal)),
            "median": float(np.median(expected_cal)),
            "sum": float(np.sum(expected_cal)),
        },
        "feature_importance_top": imp_top,
        "live_api_uses_ml": False,
        "charts": [os.path.relpath(p, REPORTS_DIR) for p in chart_paths],
    }

    metrics_path = write_metrics_json(payload)
    report_path = write_markdown_report(payload, payload["charts"])
    print("Wrote", metrics_path)
    print("Wrote", report_path)
    for p in chart_paths:
        print("Wrote", p)


if __name__ == "__main__":
    main()
