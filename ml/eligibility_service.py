"""
HABE Eligibility Service
========================
Lightweight Flask microservice that wraps the trained Random Forest model.
Node.js calls POST /predict before invoking habe_create_user.

Startup: python eligibility_service.py
Port:    5001 (configurable via ELIGIBILITY_PORT env var)

Endpoints:
  POST /predict  — single-attr runtime gate (original, unchanged)
  POST /score    — bulk pre-computation for bulletin creation
                   called ONCE per user at bulletin registration time
  GET  /health   — liveness check

Attribute sensitivity encoding (must match generate_data.py exactly):
  sensor_data      → 1
  telemetry_data   → 2
  maintenance_data → 3
  plant_data       → 4
  control_data     → 5
  admin_data       → 6
"""

import json
import os
import sys
from pathlib import Path

import joblib
import numpy as np
from flask import Flask, jsonify, request

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
MODEL_DIR = Path(__file__).parent
_clf  = None
_meta = None


def load_model():
    global _clf, _meta
    model_path = MODEL_DIR / "model.joblib"
    meta_path  = MODEL_DIR / "model_meta.json"

    if not model_path.exists():
        raise RuntimeError(f"model.joblib not found at {model_path} — run train_model.py first")

    _clf = joblib.load(model_path)
    with open(meta_path) as f:
        _meta = json.load(f)

    print(f"[eligibility] Model loaded: {_clf.n_estimators} trees, features={_meta['features']}", flush=True)


# ---------------------------------------------------------------------------
# Feature extraction — shared by /predict and /score, single source of truth
# ---------------------------------------------------------------------------
ROLE_ENC   = {"technician": 0, "engineer": 1, "manager": 2, "admin": 3}
DEVICE_ENC = {"low": 0, "medium": 1, "high": 2}

# CHANGED: extended from 3 to 6 attr types — must match generate_data.py
ATTR_SENSITIVITY = {
    "sensor_data":      1,
    "telemetry_data":   2,
    "maintenance_data": 3,
    "plant_data":       4,
    "control_data":     5,
    "admin_data":       6,
}


def dm_depth(dm_addr: str) -> int:
    return dm_addr.count("/")


def location_matches(loc: str, dm_addr: str) -> int:
    """Mirror of generate_data.py location_matches — must stay in sync."""
    depth    = dm_depth(dm_addr)
    parts    = dm_addr.split("/")
    expected = parts[-1]

    if loc == "external":
        return 0
    if depth == 0:
        return 1
    if depth == 1:
        plant = expected
        ok = [plant, "areaA1", "areaA2"] if plant == "plantA" else [plant, "areaB1", "areaB2"]
        return int(loc in ok)
    if depth == 2:
        return int(loc == expected)
    return 0


def extract_attr_sensitivity(attr_pk: str) -> int:
    """Parse attr type from attrPk string like 'company/plantA/areaA1:sensor_data'."""
    if ":" not in attr_pk:
        return 1  # default: sensor_data level
    attr_type = attr_pk.split(":")[-1]
    return ATTR_SENSITIVITY.get(attr_type, 1)


def extract_features(body: dict) -> tuple[np.ndarray, list[str]]:
    """
    Returns (feature_vector, validation_errors).
    feature_vector is None if there are validation errors.

    Feature order must match train_model.py FEATURES list exactly:
      role_encoded, location_match, time_hour, is_business_hours,
      device_trust_encoded, past_violations, attr_sensitivity, hierarchy_depth
    """
    errors = []

    dm_addr = body.get("dmAddr", "")
    attr_pk = body.get("attrPk", "")
    ctx     = body.get("context", {})

    if not isinstance(ctx, dict):
        return None, ["context must be an object"]

    role = ctx.get("role", "")
    if role not in ROLE_ENC:
        errors.append(f"invalid role '{role}'; must be one of {list(ROLE_ENC)}")

    location = ctx.get("location", "")
    if not location:
        errors.append("context.location is required")

    time_str = ctx.get("time_of_day", "")
    hour = None
    try:
        if not isinstance(time_str, str) or ":" not in time_str:
            raise ValueError
        hour = int(time_str.split(":")[0])
        if not 0 <= hour <= 23:
            raise ValueError
    except (ValueError, IndexError, AttributeError):
        errors.append(f"invalid time_of_day '{time_str}'; expected HH:MM (24-hour)")
        hour = 0

    device_trust = ctx.get("device_trust", "")
    if device_trust not in DEVICE_ENC:
        errors.append(f"invalid device_trust '{device_trust}'; must be one of {list(DEVICE_ENC)}")

    past_violations = ctx.get("past_violations", 0)
    try:
        past_violations = int(past_violations)
    except (ValueError, TypeError):
        errors.append("past_violations must be an integer")
        past_violations = 0

    if errors:
        return None, errors

    features = np.array([[
        ROLE_ENC[role],
        location_matches(location, dm_addr),
        hour,
        int(7 <= hour <= 19),
        DEVICE_ENC[device_trust],
        past_violations,
        extract_attr_sensitivity(attr_pk),
        dm_depth(dm_addr),
    ]], dtype=np.float32)

    return features, []


def build_reason(features: np.ndarray, eligible: bool, proba: float) -> str:
    """Produce a human-readable denial reason. Updated for 6 attr types."""
    if eligible:
        return "context evaluation passed"

    row = features[0]
    role_enc, loc_match, hour, _, device_enc, violations, sensitivity, depth = row

    reasons = []

    if violations >= 3:
        reasons.append(f"past_violations={int(violations)} exceeds threshold (3)")
    if device_enc == 0:
        reasons.append("device_trust=low is not permitted for key issuance")
    if loc_match == 0 and sensitivity >= 3 and role_enc < 2:
        reasons.append("cross-location access to maintenance_data+ requires manager+ role")
    if (hour >= 22 or hour < 6) and role_enc < 1:
        reasons.append("off-hours access not permitted for technician role")

    # Per-sensitivity denial reasons
    if sensitivity == 2 and loc_match == 0 and device_enc < 2:
        reasons.append("telemetry_data off-location requires high device trust")
    if sensitivity == 3 and role_enc < 1:
        reasons.append("maintenance_data requires engineer+ role")
    if sensitivity == 3 and device_enc < 2:
        reasons.append("maintenance_data requires high device trust")
    if sensitivity == 4 and role_enc < 1:
        reasons.append("plant_data requires engineer+ role")
    if sensitivity == 4 and loc_match == 0 and role_enc < 2:
        reasons.append("cross-location plant_data requires manager+ role")
    if sensitivity == 5 and role_enc < 2:
        reasons.append("control_data requires manager+ role")
    if sensitivity == 5 and device_enc < 2:
        reasons.append("control_data requires high device trust")
    if sensitivity == 5 and (hour >= 20 or hour < 7):
        reasons.append("control_data access restricted to business hours (07:00-20:00)")
    if sensitivity == 5 and loc_match == 0:
        reasons.append("control_data requires on-location access")
    if sensitivity == 6 and role_enc < 3:
        reasons.append("admin_data requires admin role")

    if not reasons:
        reasons.append(f"model confidence {proba:.2f} below eligibility threshold")

    return "; ".join(reasons)


# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "model_loaded": _clf is not None})


# ---------------------------------------------------------------------------
# POST /predict — unchanged except build_reason now covers 6 attr types
# ---------------------------------------------------------------------------
@app.route("/predict", methods=["POST"])
def predict():
    if _clf is None:
        return jsonify({"error": "model not loaded"}), 503

    body = request.get_json(silent=True)
    if body is None:
        return jsonify({"error": "request body must be JSON"}), 400

    features, errors = extract_features(body)
    if errors:
        return jsonify({"error": errors}), 400

    THRESHOLD = 0.5

    proba    = float(_clf.predict_proba(features)[0][1])
    eligible = proba >= THRESHOLD
    reason   = build_reason(features, eligible, proba)

    return jsonify({
        "eligible":   eligible,
        "confidence": round(proba, 4),
        "reason":     reason,
    })


# ---------------------------------------------------------------------------
# POST /score — bulk pre-computation for bulletin creation, unchanged
# ---------------------------------------------------------------------------
@app.route("/score", methods=["POST"])
def score():
    """
    Runs predict_proba for each attribute using the same extract_features
    logic as /predict. Does NOT apply thresholds — raw probabilities returned.
    bulletin.js applies per-attribute thresholds at eligibility check time.
    """
    if _clf is None:
        return jsonify({"error": "model not loaded"}), 503

    body = request.get_json(silent=True)
    if body is None:
        return jsonify({"error": "request body must be JSON"}), 400

    dm_addr    = body.get("dmAddr", "")
    context    = body.get("context")
    attributes = body.get("attributes")

    if not dm_addr:
        return jsonify({"error": "dmAddr is required"}), 400
    if not isinstance(attributes, list) or len(attributes) == 0:
        return jsonify({"error": "attributes must be a non-empty array"}), 400

    ml_scores = {}
    for attr_pk in attributes:
        if not isinstance(attr_pk, str) or ":" not in attr_pk:
            return jsonify({"error": f"invalid attribute format '{attr_pk}'; expected 'path:type'"}), 400

        synthetic_body = {
            "dmAddr":  dm_addr,
            "attrPk":  attr_pk,
            "context": context,
        }

        features, errors = extract_features(synthetic_body)
        if errors:
            return jsonify({"error": f"validation failed for '{attr_pk}': {errors}"}), 400

        proba = float(_clf.predict_proba(features)[0][1])
        ml_scores[attr_pk] = round(proba, 4)

    print(f"[eligibility] /score dmAddr={dm_addr} n={len(attributes)} scores={ml_scores}", flush=True)
    return jsonify({"ml_scores": ml_scores})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        load_model()
    except RuntimeError as e:
        print(f"[eligibility] FATAL: {e}", file=sys.stderr)
        sys.exit(1)

    port = int(os.environ.get("ELIGIBILITY_PORT", 5001))
    print(f"[eligibility] Listening on http://localhost:{port}", flush=True)
    app.run(host="127.0.0.1", port=port, threaded=False)