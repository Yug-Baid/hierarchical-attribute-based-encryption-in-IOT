"""
ml_test.py — Standalone tests for the ML eligibility service.

Tests the Flask service over HTTP. No HABE engine, no Besu needed.

Prerequisites:
    python eligibility_service.py   (must be running)

Run:
    python ml_test.py
    ELIGIBILITY_URL=http://127.0.0.1:5001 python ml_test.py

Coverage:
    - /health endpoint
    - /score endpoint (bulletin pre-computation)
    - Eligible cases across roles, locations, times, hierarchy depths
    - Each individual denial rule in isolation
    - Compound denial (multiple rules triggered at once)
    - Input validation (missing fields, bad enum values)
    - Response shape contract (eligible, confidence, reason always present)
    - Confidence ordering (eligible requests score higher than denied ones)
    - All hierarchy depths (company, plantA, areaA1)
    - All 6 attribute sensitivity levels
"""

import os
import sys
import requests

ELIGIBILITY_URL = os.environ.get("ELIGIBILITY_URL", "http://127.0.0.1:5001")

# ---------------------------------------------------------------------------
# Minimal test runner
# ---------------------------------------------------------------------------
passed = 0
failed = 0


def test(name, fn):
    global passed, failed
    try:
        fn()
        print(f"  [PASS] {name}")
        passed += 1
    except AssertionError as e:
        print(f"  [FAIL] {name}")
        print(f"         {e}")
        failed += 1
    except Exception as e:
        print(f"  [FAIL] {name}")
        print(f"         Unexpected error: {e}")
        failed += 1


def assert_true(cond, msg="Assertion failed"):
    if not cond:
        raise AssertionError(msg)


def assert_equal(a, b, msg=None):
    if a != b:
        raise AssertionError(msg or f"Expected {b!r}, got {a!r}")


def assert_includes(string, substr, msg=None):
    if substr not in string:
        raise AssertionError(msg or f'Expected "{string}" to include "{substr}"')


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def predict(body: dict) -> tuple[int, dict]:
    r = requests.post(f"{ELIGIBILITY_URL}/predict", json=body, timeout=5)
    return r.status_code, r.json()


def score(body: dict) -> tuple[int, dict]:
    r = requests.post(f"{ELIGIBILITY_URL}/score", json=body, timeout=5)
    return r.status_code, r.json()


def health() -> dict:
    r = requests.get(f"{ELIGIBILITY_URL}/health", timeout=5)
    return r.json()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
DM_ADDR   = "company/plantA/areaA1"
ALL_ATTRS = [
    f"{DM_ADDR}:sensor_data",
    f"{DM_ADDR}:telemetry_data",
    f"{DM_ADDR}:maintenance_data",
    f"{DM_ADDR}:plant_data",
    f"{DM_ADDR}:control_data",
    f"{DM_ADDR}:admin_data",
]

GOOD_CONTEXT = {
    "role":            "technician",
    "location":        "areaA1",
    "time_of_day":     "09:00",
    "device_trust":    "high",
    "past_violations": 0,
}


def eligible_request(context_overrides=None, top_overrides=None):
    """
    Base request: technician, good context, sensor_data.
    sensor_data (sensitivity=1) has no role/hour restriction beyond hard denials.
    For tests that require a specific attr, pass top_overrides={"attrPk": "..."}.
    """
    body = {
        "dmAddr":   DM_ADDR,
        "userAddr": "test_operator",
        "attrPk":   f"{DM_ADDR}:sensor_data",
        "context":  dict(GOOD_CONTEXT),
    }
    if context_overrides:
        body["context"].update(context_overrides)
    if top_overrides:
        body.update(top_overrides)
    return body


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def run():
    print(f"\n=== ML Eligibility Service Tests ===")
    print(f"    Target: {ELIGIBILITY_URL}\n")

    # ------------------------------------------------------------------
    print("--- Service Health ---")

    def t_health():
        r = health()
        assert_true(r.get("ok") is True,          f"ok={r.get('ok')}")
        assert_true(r.get("model_loaded") is True, f"model_loaded={r.get('model_loaded')}")

    test("Health endpoint returns ok=true and model_loaded=true", t_health)

    # ------------------------------------------------------------------
    print("\n--- /score: Response Shape & Correctness ---")

    def t_score_shape():
        status, body = score({
            "dmAddr":     DM_ADDR,
            "context":    GOOD_CONTEXT,
            "attributes": ALL_ATTRS,
        })
        assert_equal(status, 200, f"expected 200, got {status}: {body}")
        assert_true(isinstance(body.get("ml_scores"), dict), "expected ml_scores dict")
        assert_equal(len(body["ml_scores"]), 6, f"expected 6 scores, got {len(body['ml_scores'])}")
        for attr, s in body["ml_scores"].items():
            assert_true(isinstance(s, float) and 0.0 <= s <= 1.0,
                        f"score for {attr} out of range: {s}")

    test("/score returns ml_scores for all 6 attrs, all in [0,1]", t_score_shape)

    def t_score_sensor_high():
        status, body = score({
            "dmAddr":     DM_ADDR,
            "context":    GOOD_CONTEXT,
            "attributes": [f"{DM_ADDR}:sensor_data"],
        })
        assert_equal(status, 200)
        s = body["ml_scores"][f"{DM_ADDR}:sensor_data"]
        assert_true(s >= 0.5, f"sensor_data score should be high for good technician context: {s}")

    test("/score: technician good context — sensor_data scores high", t_score_sensor_high)

    def t_score_admin_low_for_tech():
        status, body = score({
            "dmAddr":     DM_ADDR,
            "context":    GOOD_CONTEXT,
            "attributes": [f"{DM_ADDR}:admin_data"],
        })
        assert_equal(status, 200)
        s = body["ml_scores"][f"{DM_ADDR}:admin_data"]
        assert_true(s < 0.5, f"admin_data should score low for technician: {s}")

    test("/score: technician — admin_data scores low", t_score_admin_low_for_tech)

    def t_score_degraded_context():
        status, body = score({
            "dmAddr": DM_ADDR,
            "context": {
                "role":            "technician",
                "location":        "areaA1",
                "time_of_day":     "09:00",
                "device_trust":    "low",
                "past_violations": 4,
            },
            "attributes": ALL_ATTRS,
        })
        assert_equal(status, 200)
        scores = body["ml_scores"]
        for attr, s in scores.items():
            assert_true(s < 0.5, f"degraded context: {attr} should score low, got {s}")

    test("/score: degraded context (low trust, violations) — all scores below 0.5", t_score_degraded_context)

    def t_score_400_missing_dmaddr():
        status, body = score({
            "context":    GOOD_CONTEXT,
            "attributes": ALL_ATTRS,
        })
        assert_equal(status, 400, f"expected 400, got {status}: {body}")

    test("/score: missing dmAddr → 400", t_score_400_missing_dmaddr)

    def t_score_400_empty_attrs():
        status, body = score({
            "dmAddr":     DM_ADDR,
            "context":    GOOD_CONTEXT,
            "attributes": [],
        })
        assert_equal(status, 400, f"expected 400, got {status}: {body}")

    test("/score: empty attributes array → 400", t_score_400_empty_attrs)

    def t_score_400_bad_attr_format():
        status, body = score({
            "dmAddr":     DM_ADDR,
            "context":    GOOD_CONTEXT,
            "attributes": ["company/plantA/areaA1/sensor_data"],  # missing colon
        })
        assert_equal(status, 400, f"expected 400, got {status}: {body}")

    test("/score: malformed attrPk (no colon) → 400", t_score_400_bad_attr_format)

    def t_score_400_bad_context():
        status, body = score({
            "dmAddr":     DM_ADDR,
            "context":    {"role": "technician"},  # incomplete
            "attributes": ALL_ATTRS,
        })
        assert_equal(status, 400, f"expected 400, got {status}: {body}")

    test("/score: incomplete context → 400", t_score_400_bad_context)

    def t_score_ordering():
        _, body = score({
            "dmAddr":     DM_ADDR,
            "context":    GOOD_CONTEXT,
            "attributes": ALL_ATTRS,
        })
        scores = body["ml_scores"]
        s_sensor = scores[f"{DM_ADDR}:sensor_data"]
        s_admin  = scores[f"{DM_ADDR}:admin_data"]
        assert_true(s_sensor > s_admin,
                    f"sensor_data ({s_sensor}) should score higher than admin_data ({s_admin}) for technician")

    test("/score: sensor_data scores higher than admin_data for technician", t_score_ordering)

    # ------------------------------------------------------------------
    print("\n--- /predict: Response Shape Contract ---")

    def t_shape_eligible():
        status, body = predict(eligible_request())
        assert_equal(status, 200)
        assert_true(isinstance(body.get("eligible"),   bool),  "eligible must be bool")
        assert_true(isinstance(body.get("confidence"), float), "confidence must be float")
        assert_true(isinstance(body.get("reason"),     str),   "reason must be str")

    test("Eligible response has eligible, confidence, reason", t_shape_eligible)

    def t_shape_denied():
        status, body = predict(eligible_request({"device_trust": "low"}))
        assert_equal(status, 200, f"Expected 200, got {status}")
        assert_true(body.get("eligible") is False,         "Expected eligible=false")
        assert_true(isinstance(body.get("confidence"), float))
        assert_true(isinstance(body.get("reason"),     str))

    test("Denied response has eligible, confidence, reason", t_shape_denied)

    def t_confidence_range():
        cases = [
            eligible_request(),
            eligible_request({"device_trust": "low"}),
            eligible_request({"role": "admin", "past_violations": 5}),
        ]
        for c in cases:
            _, body = predict(c)
            conf = body.get("confidence")
            assert_true(
                isinstance(conf, float) and 0.0 <= conf <= 1.0,
                f"confidence={conf} out of range"
            )

    test("confidence is always in [0, 1]", t_confidence_range)

    # ------------------------------------------------------------------
    print("\n--- /predict: Eligible Cases ---")

    def t_elig_technician():
        _, body = predict(eligible_request())
        assert_true(body["eligible"] is True,  f"Expected eligible, reason: {body.get('reason')}")
        assert_true(body["confidence"] > 0.5,  f"Low confidence: {body['confidence']}")

    test("Technician, business hours, high trust, sensor_data, areaA1", t_elig_technician)

    def t_elig_technician_telemetry():
        _, body = predict(eligible_request(
            top_overrides={"attrPk": f"{DM_ADDR}:telemetry_data"}
        ))
        assert_true(body["eligible"] is True,
                    f"Expected technician eligible for telemetry_data in good context, reason: {body.get('reason')}")

    test("Technician, high trust, on-location, telemetry_data — eligible", t_elig_technician_telemetry)

    def t_elig_engineer_maintenance():
        _, body = predict(eligible_request(
            {"role": "engineer"},
            {"attrPk": f"{DM_ADDR}:maintenance_data"}
        ))
        assert_true(body["eligible"] is True,
                    f"Expected engineer eligible for maintenance_data, reason: {body.get('reason')}")

    test("Engineer, high trust, maintenance_data — eligible", t_elig_engineer_maintenance)

    def t_elig_engineer_plant():
        _, body = predict(eligible_request(
            {"role": "engineer"},
            {"attrPk": f"{DM_ADDR}:plant_data"}
        ))
        assert_true(body["eligible"] is True,
                    f"Expected engineer eligible for plant_data on-location, reason: {body.get('reason')}")

    test("Engineer, on-location, plant_data — eligible", t_elig_engineer_plant)

    def t_elig_manager_control():
        _, body = predict({
            "dmAddr":   DM_ADDR,
            "userAddr": "mgr_1",
            "attrPk":   f"{DM_ADDR}:control_data",
            "context": {
                "role":            "manager",
                "location":        "areaA1",
                "time_of_day":     "10:00",
                "device_trust":    "high",
                "past_violations": 0,
            },
        })
        assert_true(body["eligible"] is True,
                    f"Expected manager eligible for control_data, reason: {body.get('reason')}")

    test("Manager, on-location, business hours, high trust, control_data — eligible", t_elig_manager_control)

    def t_elig_admin_all():
        for attr in ALL_ATTRS:
            _, body = predict({
                "dmAddr":   DM_ADDR,
                "userAddr": "admin_1",
                "attrPk":   attr,
                "context": {
                    "role":            "admin",
                    "location":        "areaA1",
                    "time_of_day":     "10:00",
                    "device_trust":    "high",
                    "past_violations": 0,
                },
            })
            assert_true(body["eligible"] is True,
                        f"Expected admin eligible for {attr}, reason: {body.get('reason')}")

    test("Admin eligible for all 6 attr types", t_elig_admin_all)

    def t_elig_manager_crossloc():
        _, body = predict({
            "dmAddr":   "company/plantA",
            "userAddr": "mgr_1",
            "attrPk":   "company/plantA:plant_data",
            "context": {
                "role": "manager", "location": "areaB2",
                "time_of_day": "14:00", "device_trust": "medium", "past_violations": 0,
            },
        })
        assert_true(body["eligible"] is True, f"Expected eligible, reason: {body.get('reason')}")

    test("Manager, cross-location, medium trust, plant_data, plant level", t_elig_manager_crossloc)

    def t_elig_engineer_offhours():
        _, body = predict(eligible_request(
            {"role": "engineer", "time_of_day": "23:30", "device_trust": "high"}
        ))
        assert_true(body["eligible"] is True,
                    f"Expected eligible for engineer off-hours sensor_data, reason: {body.get('reason')}")

    test("Engineer off-hours with high trust device — eligible for sensor_data", t_elig_engineer_offhours)

    def t_elig_one_violation():
        _, body = predict(eligible_request({"past_violations": 1}))
        assert_true(body["eligible"] is True,
                    f"Expected eligible with 1 violation, reason: {body.get('reason')}")

    test("Technician with 1 violation is still eligible", t_elig_one_violation)

    # ------------------------------------------------------------------
    print("\n--- /predict: Denial Rules (each in isolation) ---")

    def t_deny_low_device():
        _, body = predict(eligible_request({"device_trust": "low"}))
        assert_true(body["eligible"] is False, "Expected ineligible for low trust device")
        assert_includes(body["reason"], "device_trust=low")

    test("DENY: device_trust=low always blocks", t_deny_low_device)

    def t_deny_violations_3():
        _, body = predict(eligible_request(
            {"role": "engineer", "device_trust": "high", "past_violations": 3}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible for 3 violations")
        assert_includes(body["reason"], "past_violations")

    test("DENY: past_violations=3 triggers threshold", t_deny_violations_3)

    def t_deny_violations_4():
        _, body = predict(eligible_request({"past_violations": 4}))
        assert_true(body["eligible"] is False, "Expected ineligible for 4 violations")
        assert_includes(body["reason"], "past_violations")

    test("DENY: past_violations=4 triggers threshold", t_deny_violations_4)

    def t_deny_tech_admin_data():
        _, body = predict(eligible_request(
            {"role": "technician"},
            {"attrPk": f"{DM_ADDR}:admin_data"}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible: technician + admin_data")
        assert_includes(body["reason"], "admin_data")

    test("DENY: technician requesting admin_data", t_deny_tech_admin_data)

    def t_deny_eng_admin_data():
        _, body = predict(eligible_request(
            {"role": "engineer"},
            {"attrPk": f"{DM_ADDR}:admin_data"}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible: engineer + admin_data")
        assert_includes(body["reason"], "admin_data")

    test("DENY: engineer requesting admin_data", t_deny_eng_admin_data)

    def t_deny_mgr_admin_data():
        _, body = predict(eligible_request(
            {"role": "manager"},
            {"attrPk": f"{DM_ADDR}:admin_data"}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible: manager + admin_data")
        assert_includes(body["reason"], "admin_data")

    test("DENY: manager requesting admin_data (admin-only attr)", t_deny_mgr_admin_data)

    def t_deny_tech_plant_data():
        _, body = predict(eligible_request(
            {"role": "technician"},
            {"attrPk": f"{DM_ADDR}:plant_data"}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible: technician + plant_data")
        assert_includes(body["reason"], "plant_data")

    test("DENY: technician requesting plant_data", t_deny_tech_plant_data)

    def t_deny_tech_maintenance_data():
        _, body = predict(eligible_request(
            {"role": "technician"},
            {"attrPk": f"{DM_ADDR}:maintenance_data"}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible: technician + maintenance_data")
        assert_includes(body["reason"], "maintenance_data")

    test("DENY: technician requesting maintenance_data", t_deny_tech_maintenance_data)

    def t_deny_tech_control_data():
        _, body = predict(eligible_request(
            {"role": "technician"},
            {"attrPk": f"{DM_ADDR}:control_data"}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible: technician + control_data")
        assert_includes(body["reason"], "control_data")

    test("DENY: technician requesting control_data", t_deny_tech_control_data)

    def t_deny_eng_control_data():
        _, body = predict(eligible_request(
            {"role": "engineer"},
            {"attrPk": f"{DM_ADDR}:control_data"}
        ))
        assert_true(body["eligible"] is False, "Expected ineligible: engineer + control_data")
        assert_includes(body["reason"], "control_data")

    test("DENY: engineer requesting control_data (manager+ only)", t_deny_eng_control_data)

    def t_deny_control_offhours():
        _, body = predict({
            "dmAddr":   DM_ADDR,
            "userAddr": "mgr_night",
            "attrPk":   f"{DM_ADDR}:control_data",
            "context": {
                "role":            "manager",
                "location":        "areaA1",
                "time_of_day":     "21:00",
                "device_trust":    "high",
                "past_violations": 0,
            },
        })
        assert_true(body["eligible"] is False,
                    "Expected ineligible: control_data off-hours (21:00)")
        assert_includes(body["reason"], "control_data")

    test("DENY: manager requesting control_data off-hours (21:00)", t_deny_control_offhours)

    def t_deny_maintenance_medium_trust():
        _, body = predict(eligible_request(
            {"role": "engineer", "device_trust": "medium"},
            {"attrPk": f"{DM_ADDR}:maintenance_data"}
        ))
        assert_true(body["eligible"] is False,
                    "Expected ineligible: maintenance_data requires high trust")
        assert_includes(body["reason"], "maintenance_data")

    test("DENY: engineer + maintenance_data + medium trust (requires high)", t_deny_maintenance_medium_trust)

    def t_deny_tech_offhours_0200():
        # off-hours rule for technician applies to telemetry_data (sensitivity=2)
        # sensor_data (sensitivity=1) has no hour restriction
        _, body = predict({
            "dmAddr":   DM_ADDR,
            "userAddr": "tech_night",
            "attrPk":   f"{DM_ADDR}:telemetry_data",
            "context": {
                "role":            "technician",
                "location":        "areaA1",
                "time_of_day":     "02:00",
                "device_trust":    "high",
                "past_violations": 0,
            },
        })
        assert_true(body["eligible"] is False,
                    f"Expected ineligible: technician telemetry_data at 02:00, reason: {body.get('reason')}")
        assert_includes(body["reason"], "off-hours")

    test("DENY: technician off-hours (02:00) — telemetry_data", t_deny_tech_offhours_0200)

    def t_deny_tech_offhours_2300():
        _, body = predict({
            "dmAddr":   DM_ADDR,
            "userAddr": "tech_night",
            "attrPk":   f"{DM_ADDR}:telemetry_data",
            "context": {
                "role":            "technician",
                "location":        "areaA1",
                "time_of_day":     "23:00",
                "device_trust":    "high",
                "past_violations": 0,
            },
        })
        assert_true(body["eligible"] is False,
                    f"Expected ineligible: technician telemetry_data at 23:00, reason: {body.get('reason')}")
        assert_includes(body["reason"], "off-hours")

    test("DENY: technician off-hours (23:00) — telemetry_data", t_deny_tech_offhours_2300)

    def t_deny_telemetry_offloc_medtrust():
        _, body = predict({
            "dmAddr":   DM_ADDR,
            "userAddr": "tech_remote",
            "attrPk":   f"{DM_ADDR}:telemetry_data",
            "context": {
                "role":            "technician",
                "location":        "external",
                "time_of_day":     "09:00",
                "device_trust":    "medium",
                "past_violations": 0,
            },
        })
        assert_true(body["eligible"] is False,
                    "Expected ineligible: telemetry_data off-location without high trust")
        assert_includes(body["reason"], "telemetry_data")

    test("DENY: telemetry_data off-location + medium trust", t_deny_telemetry_offloc_medtrust)

    # ------------------------------------------------------------------
    print("\n--- /predict: Compound Denial ---")

    def t_deny_compound():
        _, body = predict({
            "dmAddr":   DM_ADDR,
            "userAddr": "worst_case",
            "attrPk":   f"{DM_ADDR}:admin_data",
            "context": {
                "role": "technician", "location": "areaA1",
                "time_of_day": "02:00", "device_trust": "low", "past_violations": 4,
            },
        })
        assert_true(body["eligible"] is False)
        rule_count = sum(
            1 for k in ["past_violations", "device_trust=low", "off-hours", "admin_data"]
            if k in body["reason"]
        )
        assert_true(rule_count >= 3,
                    f"Expected ≥3 rules in reason, got {rule_count}: \"{body['reason']}\"")

    test("DENY: multiple rules triggered simultaneously", t_deny_compound)

    # ------------------------------------------------------------------
    print("\n--- /predict: Hierarchy Depth Coverage ---")

    def t_depth_0():
        _, body = predict({
            "dmAddr": "company", "userAddr": "root_admin", "attrPk": "company:admin_data",
            "context": {"role": "admin", "location": "company", "time_of_day": "10:00",
                        "device_trust": "high", "past_violations": 0},
        })
        assert_true(body["eligible"] is True,
                    f"Expected eligible at depth 0, reason: {body.get('reason')}")

    test("Company level (depth 0) — admin eligible for admin_data", t_depth_0)

    def t_depth_1():
        _, body = predict({
            "dmAddr": "company/plantB", "userAddr": "plant_mgr",
            "attrPk": "company/plantB:plant_data",
            "context": {"role": "manager", "location": "plantB", "time_of_day": "10:00",
                        "device_trust": "high", "past_violations": 0},
        })
        assert_true(body["eligible"] is True,
                    f"Expected eligible at depth 1, reason: {body.get('reason')}")

    test("Plant level (depth 1) — manager eligible for plant_data", t_depth_1)

    def t_depth_2():
        _, body = predict({
            "dmAddr": "company/plantB/areaB2", "userAddr": "tech_b2",
            "attrPk": "company/plantB/areaB2:sensor_data",
            "context": {"role": "technician", "location": "areaB2", "time_of_day": "10:00",
                        "device_trust": "high", "past_violations": 0},
        })
        assert_true(body["eligible"] is True,
                    f"Expected eligible at depth 2, reason: {body.get('reason')}")

    test("Area level (depth 2) — technician eligible for sensor_data", t_depth_2)

    # ------------------------------------------------------------------
    print("\n--- /predict: Confidence Ordering ---")

    def t_confidence_order():
        _, good = predict(eligible_request())
        _, bad  = predict(eligible_request(
            {"device_trust": "low", "past_violations": 4,
             "role": "technician", "time_of_day": "02:00"}
        ))
        assert_true(
            good["confidence"] > bad["confidence"],
            f"Expected eligible conf ({good['confidence']}) > denied conf ({bad['confidence']})"
        )

    test("Eligible request scores higher confidence than denied request", t_confidence_order)

    # ------------------------------------------------------------------
    print("\n--- /predict: Input Validation ---")

    def t_empty_context():
        status, body = predict({
            "dmAddr": DM_ADDR, "userAddr": "op",
            "attrPk": f"{DM_ADDR}:sensor_data",
            "context": {},
        })
        assert_equal(status, 400, f"Expected 400 for empty context, got {status}: {body}")

    test("Empty context object → 400", t_empty_context)

    def t_invalid_role():
        status, body = predict(eligible_request({"role": "superhero"}))
        assert_equal(status, 400, f"Expected 400 for invalid role, got {status}: {body}")
        assert_true(bool(body.get("error")), "Expected error field")

    test("Invalid role value → 400", t_invalid_role)

    def t_invalid_device_trust():
        status, body = predict(eligible_request({"device_trust": "ultra"}))
        assert_equal(status, 400, f"Expected 400 for invalid device_trust, got {status}: {body}")

    test("Invalid device_trust value → 400", t_invalid_device_trust)

    def t_invalid_time():
        status, body = predict(eligible_request({"time_of_day": "noon"}))
        assert_equal(status, 400, f"Expected 400 for invalid time_of_day, got {status}: {body}")

    test("Invalid time_of_day format → 400", t_invalid_time)

    def t_empty_body():
        status, body = predict({})
        assert_true(status == 400 or body.get("error"),
                    f"Expected error for empty body, got {status}: {body}")

    test("Empty body → 400", t_empty_body)

    # ------------------------------------------------------------------
    print(f"\n=== Results: {passed} passed, {failed} failed ===\n")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    try:
        health()
    except requests.exceptions.ConnectionError:
        print(f"[fatal] Eligibility service not reachable at {ELIGIBILITY_URL}")
        print(f"        Run: python eligibility_service.py")
        sys.exit(1)
    run()