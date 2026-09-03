"""Train a baseline model to predict recovery (binary) conditional on applied action.

Produces metrics and saves a pipeline + model and a calibrated model artifact.
"""
import os
import joblib
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import roc_auc_score, accuracy_score, precision_score, recall_score, brier_score_loss

try:
    import lightgbm as lgb
    GB_AVAILABLE = True
except Exception:
    from sklearn.ensemble import HistGradientBoostingClassifier
    GB_AVAILABLE = False

from sklearn.calibration import CalibratedClassifierCV

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_CSV = os.environ.get('TRAINING_CSV', os.path.join('/tmp', 'training_dataset.csv'))
ARTIFACT_DIR = os.path.join(ROOT, 'backend', 'models', 'artifacts')
os.makedirs(ARTIFACT_DIR, exist_ok=True)


def load_dataset(path: str):
    df = pd.read_csv(path, parse_dates=['created_at', 'recovered_at'], low_memory=False)
    return df


def prepare_features(df: pd.DataFrame):
    # Target
    y = df['recovered'].fillna(False).astype(int)

    # Features to use (exclude ids and leakage)
    features = [
        'payment_status', 'failure_reason', 'attempt_count', 'previous_failed_payments',
        'previous_successful_orders', 'cart_value', 'customer_segment', 'payment_method',
        'time_on_checkout_seconds', 'risk_score', 'applied_recovery_action'
    ]
    X = df[features].copy()
    return X, y


def build_pipeline(cat_cols, num_cols):
    cat_pipe = Pipeline([
        ('impute', SimpleImputer(strategy='constant', fill_value='missing')),
        ('ohe', OneHotEncoder(handle_unknown='ignore'))
    ])
    num_pipe = Pipeline([
        ('impute', SimpleImputer(strategy='median')),
        ('scale', StandardScaler())
    ])
    preproc = ColumnTransformer([
        ('cat', cat_pipe, cat_cols),
        ('num', num_pipe, num_cols)
    ])

    if GB_AVAILABLE:
        model = lgb.LGBMClassifier(n_estimators=200, random_state=42)
    else:
        model = HistGradientBoostingClassifier(random_state=42)

    pipe = Pipeline([
        ('pre', preproc),
        ('clf', model)
    ])
    return pipe


def evaluate(clf, X_test, y_test):
    proba = clf.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    metrics = {
        'roc_auc': float(roc_auc_score(y_test, proba)),
        'accuracy': float(accuracy_score(y_test, pred)),
        'precision': float(precision_score(y_test, pred, zero_division=0)),
        'recall': float(recall_score(y_test, pred, zero_division=0)),
        'brier': float(brier_score_loss(y_test, proba)),
    }
    return metrics, proba


def main():
    print('Loading', DATA_CSV)
    df = load_dataset(DATA_CSV)
    print('Dataset rows:', len(df))

    X, y = prepare_features(df)

    # Column lists
    cat_cols = ['payment_status', 'failure_reason', 'customer_segment', 'payment_method', 'applied_recovery_action']
    num_cols = ['attempt_count', 'previous_failed_payments', 'previous_successful_orders', 'cart_value', 'time_on_checkout_seconds', 'risk_score']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    pipe = build_pipeline(cat_cols, num_cols)

    print('Training model...')
    pipe.fit(X_train, y_train)

    metrics_uncal, proba_uncal = evaluate(pipe, X_test, y_test)
    print('Uncalibrated metrics:', metrics_uncal)

    # Calibrate probabilities with sigmoid (Platt) — safe for smaller datasets
    print('Calibrating probabilities (Platt)...')
    calib = CalibratedClassifierCV(pipe, cv=5, method='sigmoid')
    calib.fit(X_train, y_train)

    metrics_cal, proba_cal = evaluate(calib, X_test, y_test)
    print('Calibrated metrics:', metrics_cal)

    # Save artifacts
    model_path = os.path.join(ARTIFACT_DIR, 'baseline_model.pkl')
    calib_path = os.path.join(ARTIFACT_DIR, 'baseline_model_calibrated.pkl')
    joblib.dump(pipe, model_path)
    joblib.dump(calib, calib_path)
    print('Saved model to', model_path)
    print('Saved calibrated model to', calib_path)

    # Show class balance
    print('Class distribution:', int(y.sum()), '/', len(y), 'positive recovered')

    # Example predictions for first 5 test rows
    ex = X_test.head(5)
    ex_proba = calib.predict_proba(ex)[:, 1]
    print('Example predictions (probabilities):')
    print(pd.DataFrame({'index': ex.index, 'proba': ex_proba, 'label': y_test.loc[ex.index].values,}).to_string(index=False))


if __name__ == '__main__':
    main()
