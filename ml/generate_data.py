"""
Synthetic training data generator for HABE CreateUser eligibility.

Labeling rules encode IIoT access control semantics from the HABE hierarchy:
  Company (depth 0) → Plant A/B (depth 1) → Area A1-B2 (depth 2)

Attribute types (sensitivity 1-6):
  sensor_data      (1) — raw sensor readings, temp/pressure/flow
  telemetry_data   (2) — aggregated time-series, device health metrics
  maintenance_data (3) — equipment logs, fault history, calibration records
  plant_data       (4) — production metrics, process parameters
  control_data     (5) — actuator commands, setpoints, PLC configs
  admin_data       (6) — user roles, key registry, audit config

Sampling notes:
  - manager probability raised (0.18 → 0.25) and control_data raised
    (0.11 → 0.15) to ensure sufficient eligible samples in the
    manager+control_data slice.
  - Targeted augmentation block added: 300 samples of technician+telemetry_data
    at hours 20-23 to sharpen the off-hours boundary at hour=22.
    The RF uses time_hour directly but needs sufficient density at the exact
    boundary (hours 22-23 ineligible vs 20-21 eligible) to learn it cleanly.
  - Label noise at 4% applied only to the main block, not the augmentation
    block — augmentation samples are kept clean to anchor the boundary.
"""

import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42
rng = np.random.default_rng(SEED)

N = 6000

ROLES = ["technician", "engineer", "manager", "admin"]
ROLE_ENC = {r: i for i, r in enumerate(ROLES)}

LOCATIONS = [
    "company", "plantA", "plantB",
    "areaA1", "areaA2", "areaB1", "areaB2",
    "external"
]

DEVICE_TRUST = ["low", "medium", "high"]
DEVICE_ENC = {d: i for i, d in enumerate(DEVICE_TRUST)}

ATTR_TYPES = [
    "sensor_data",
    "telemetry_data",
    "maintenance_data",
    "plant_data",
    "control_data",
    "admin_data",
]

ATTR_SENSITIVITY = {
    "sensor_data":      1,
    "telemetry_data":   2,
    "maintenance_data": 3,
    "plant_data":       4,
    "control_data":     5,
    "admin_data":       6,
}

DM_ADDRS = [
    "company",
    "company/plantA",
    "company/plantB",
    "company/plantA/areaA1",
    "company/plantA/areaA2",
    "company/plantB/areaB1",
    "company/plantB/areaB2",
]


def dm_depth(dm_addr: str) -> int:
    return dm_addr.count("/")


def location_for_dm(dm_addr: str) -> str:
    return dm_addr.split("/")[-1]


def location_matches(loc: str, dm_addr: str) -> int:
    """Must stay in sync with eligibility_service.py."""
    expected = location_for_dm(dm_addr)
    depth = dm_depth(dm_addr)

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


def label(row: dict) -> int:
    """
    Deterministic eligibility rules for 6-attr IIoT hierarchy.
    Returns 1 (eligible) or 0 (ineligible).
    """
    role_enc    = row["role_encoded"]
    loc_match   = row["location_match"]
    hour        = row["time_hour"]
    device      = row["device_trust_encoded"]
    violations  = row["past_violations"]
    sensitivity = row["attr_sensitivity"]

    # --- Hard denials ---
    if violations >= 3:
        return 0
    if device == 0:
        return 0
    if loc_match == 0 and sensitivity >= 3 and role_enc < 2:
        return 0

    # --- Per-sensitivity rules ---

    if sensitivity == 1:  # sensor_data — no hour restriction
        return 1

    if sensitivity == 2:  # telemetry_data
        if loc_match == 0 and device < 2:
            return 0
        if (hour >= 22 or hour < 6) and role_enc < 1:  # technician off-hours
            return 0
        return 1

    if sensitivity == 3:  # maintenance_data
        if role_enc < 1:
            return 0
        if device < 2:
            return 0
        return 1

    if sensitivity == 4:  # plant_data
        if role_enc < 1:
            return 0
        if loc_match == 0 and role_enc < 2:
            return 0
        if (hour >= 22 or hour < 6) and role_enc < 2:
            return 0
        return 1

    if sensitivity == 5:  # control_data
        if role_enc < 2:
            return 0
        if device < 2:
            return 0
        if hour >= 20 or hour < 7:
            return 0
        if loc_match == 0:
            return 0
        return 1

    if sensitivity == 6:  # admin_data
        if role_enc < 3:
            return 0
        if device < 2:
            return 0
        return 1

    return 0


def make_row(role, location, dm_addr, hour, device, violations, attr):
    loc_match   = location_matches(location, dm_addr)
    device_enc  = DEVICE_ENC[device]
    sensitivity = ATTR_SENSITIVITY[attr]
    row = {
        "role_encoded":         ROLE_ENC[role],
        "location_match":       loc_match,
        "time_hour":            hour,
        "is_business_hours":    int(7 <= hour <= 19),
        "device_trust_encoded": device_enc,
        "past_violations":      violations,
        "attr_sensitivity":     sensitivity,
        "hierarchy_depth":      dm_depth(dm_addr),
        "role":      role,
        "_location": location,
        "_device":   device,
        "_attr":     attr,
        "_dm_addr":  dm_addr,
    }
    row["eligible"] = label(row)
    return row


def generate() -> pd.DataFrame:
    rows = []

    role_probs = [0.28, 0.32, 0.25, 0.15]
    attr_probs = [0.23, 0.20, 0.17, 0.15, 0.15, 0.10]

    # --- Main random block ---
    for _ in range(N):
        dm_addr   = rng.choice(DM_ADDRS)
        role      = rng.choice(ROLES, p=role_probs)
        location  = rng.choice(LOCATIONS)
        hour      = int(rng.integers(0, 24))
        device    = rng.choice(DEVICE_TRUST, p=[0.15, 0.38, 0.47])
        violations = int(rng.choice([0, 1, 2, 3, 4], p=[0.65, 0.20, 0.10, 0.03, 0.02]))
        attr      = rng.choice(ATTR_TYPES, p=attr_probs)

        rows.append(make_row(role, location, dm_addr, hour, device, violations, attr))

    df_main = pd.DataFrame(rows)

    # 4% label noise on main block only
    noise_idx = rng.choice(len(df_main), size=int(0.04 * N), replace=False)
    df_main.loc[noise_idx, "eligible"] = 1 - df_main.loc[noise_idx, "eligible"]

    # --- Targeted augmentation: technician + telemetry_data at hours 20-23 ---
    # Hours 20-21 → eligible (label rule allows technician telemetry outside strict off-hours)
    # Hours 22-23 → ineligible (label rule: hour >= 22 blocks technician telemetry)
    # 300 clean samples, no noise — anchors the exact boundary the RF was missing
    aug_rows = []
    dm_aug = "company/plantA/areaA1"
    for hour in [20, 21, 22, 23]:
        for _ in range(75):  # 75 × 4 hours = 300 samples
            aug_rows.append(make_row(
                role="technician",
                location="areaA1",
                dm_addr=dm_aug,
                hour=hour,
                device="high",
                violations=0,
                attr="telemetry_data",
            ))
    df_aug = pd.DataFrame(aug_rows)

    df = pd.concat([df_main, df_aug], ignore_index=True)
    return df


if __name__ == "__main__":
    df = generate()
    out = Path(__file__).parent / "training_data.csv"
    df.to_csv(out, index=False)

    pos = df["eligible"].sum()
    neg = len(df) - pos
    print(f"Generated {len(df)} samples  |  eligible={pos} ({pos/len(df):.1%})  ineligible={neg} ({neg/len(df):.1%})")

    print("\nPer-attr breakdown:")
    for attr in ATTR_TYPES:
        sub = df[df["_attr"] == attr]
        e = sub["eligible"].sum()
        print(f"  {attr:20s}: {len(sub):4d} samples  eligible={e} ({e/len(sub):.1%})")

    print(f"\nSaved → {out}")