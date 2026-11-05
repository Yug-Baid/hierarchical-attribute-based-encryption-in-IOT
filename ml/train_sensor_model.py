"""
train_sensor_model.py
======================
Trains a Decision Tree Classifier (max_depth=5) for the CASE Autonomous Policy Engine.
Grounded in CASE paper (IEEE IoTJ 2022) Section V-B Table III benchmark findings,
where Decision Tree demonstrated 99.7% accuracy, 2.16s latency, and 4.31e3 CPU clock cycles,
outperforming SVM and Naive Bayes in resource-constrained edge environments.

Inputs:
  ml/data/sensor_telemetry.csv

Outputs:
  ml/models/sensor_policy_dt.pkl
"""

import sys
from pathlib import Path
import joblib
import pandas as pd
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

SEED = 42

BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR / "data" / "sensor_telemetry.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "sensor_policy_dt.pkl"

FEATURES = ["temperature", "vibration", "pressure", "gas_ppm"]
TARGET = "label"
CLASS_NAMES = ["NORMAL", "WARNING", "CRITICAL"]


def train_model():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found at {DATA_PATH}. Run generate_sensor_data.py first.")

    df = pd.read_csv(DATA_PATH)
    X = df[FEATURES].values
    y = df[TARGET].values

    # Train / Test split (80/20)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=SEED, stratify=y
    )

    # DecisionTreeClassifier with max_depth=5 as benchmarked in the CASE paper
    clf = DecisionTreeClassifier(max_depth=5, random_state=SEED)

    # 5-fold cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    cv_scores = cross_val_score(clf, X, y, cv=cv, scoring="accuracy")
    print(f"5-Fold CV Accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

    # Fit on training split
    clf.fit(X_train, y_train)

    # Evaluate on held-out test set
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nHeld-out Test Accuracy: {acc * 100:.2f}%")
    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=CLASS_NAMES))

    # Fit final model on all data for deployment
    clf.fit(X, y)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    print(f"Successfully saved Decision Tree model to {MODEL_PATH}")

    # Sanity checks on known cases
    test_cases = [
        {"telemetry": [30.0, 1.2, 50.0, 25.0], "expected": "NORMAL"},
        {"telemetry": [60.0, 3.0, 85.0, 75.0], "expected": "WARNING"},
        {"telemetry": [85.0, 5.0, 120.0, 180.0], "expected": "CRITICAL"},
    ]
    print("\nSanity Check Verifications:")
    for tc in test_cases:
        pred_label = clf.predict([tc["telemetry"]])[0]
        pred_state = CLASS_NAMES[pred_label]
        status = "PASS" if pred_state == tc["expected"] else "FAIL"
        print(f"  [{status}] Input: {tc['telemetry']} -> Predicted: {pred_state} (Expected: {tc['expected']})")


if __name__ == "__main__":
    train_model()

