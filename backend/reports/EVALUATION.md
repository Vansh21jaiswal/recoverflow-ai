# RecoverFlow AI — Offline Model Evaluation

Generated at 2026-09-02T10:56:29.294570+00:00.

This report evaluates saved sklearn artifacts **offline**. The live dashboard and `/recovery/*` APIs remain **rule-based** (`app/services/recovery_engine.py`) and were not changed.

## Dataset

- CSV: `/Users/Vansh/Desktop/recoverflow-ai/backend/reports/eval_dataset.csv`
- Rows: 5200
- Positive recovered labels: 219 (4.2%)
- Held-out test size: 0.2 (random_state=42, stratified)
- Test rows: 1040

Features match `backend/ml/train.py` (no IDs, no `best_recovery_action` / `recovery_probability`). The model is **action-conditional**: `applied_recovery_action` is an input.

## Metrics

| Model | ROC-AUC | Accuracy | Precision | Recall | Brier (lower is better) |
|---|---:|---:|---:|---:|---:|
| baseline_model.pkl | 0.9929 | 0.9817 | 0.7660 | 0.8182 | 0.0126 |
| baseline_model_calibrated.pkl | 0.9925 | 0.9837 | 0.9355 | 0.6591 | 0.0162 |

## What the numbers mean

- **Discrimination (ROC-AUC):** uncalibrated 0.993, calibrated 0.993. Values well above 0.5 mean the model ranks recoveries better than chance on this split. Accuracy is dominated by the majority class (most checkouts never recover).
- **Precision / recall:** precision 0.935 and recall 0.659 (calibrated, threshold 0.5). Low recall is expected with a rare positive class and a 0.5 cutoff; the useful output for recovery is the **probability**, not the hard label.

## Does calibration improve probability reliability?

Not clearly: Brier went from 0.0126 (uncalibrated) to 0.0162 (calibrated). Ranking (ROC-AUC) can stay similar while probability reliability does not improve. Use the calibration plot before treating scores as true recovery rates.

## Limitations (synthetic data)

- Labels come from `app/services/synthetic.py` heuristics plus randomness, not real customer outcomes.
- The same process that generates features also generates `recovered`, so metrics can look stronger than they would in production.
- Regenerating the CSV from the current SQLite DB may not match the exact file originally used to train the pickles.
- Class imbalance is severe; a 0.5 classification threshold is a reporting convention, not an operating policy.
- `applied_recovery_action` must be known (or scored per candidate action) at inference time; that is not how the live rules engine works today.

Feature importance uses native `feature_importances_` when the estimator exposes it. The saved `HistGradientBoostingClassifier` pickle does not, so the chart uses sklearn permutation importance on the original (unencoded) columns. SHAP was not added.

## Live product vs this evaluation

The dashboard at `/dashboard` still calls `/recovery/baseline-summary` and `/recovery/decisions`, which use handwritten rules and heuristic probabilities. These pickle models are **not** loaded by FastAPI.

## Charts

- `charts/roc_curve_comparison.png`
- `charts/calibration_curve_comparison.png`
- `charts/predicted_probability_distribution.png`
- `charts/action_distribution.png`
- `charts/estimated_recovery_value_distribution.png`
- `charts/feature_importance.png`
