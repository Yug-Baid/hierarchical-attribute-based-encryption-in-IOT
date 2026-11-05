"""
generate_sensor_data.py
========================
Generates a synthetic industrial IoT telemetry dataset (~5,000 samples)
grounded in the CASE paper ("CASE: A Context-Aware Security Scheme for
Preserving Data Privacy in IoT-Enabled Society 5.0", IEEE IoTJ 2022).

Features:
  - temperature (°C): Normal [20, 50], Warning [51, 75], Critical > 75
  - vibration (mm/s): Normal [0.1, 2.5], Warning [2.6, 4.5], Critical > 4.5
  - pressure (PSI):   Normal [30, 70], Warning [71, 110], Critical > 110
  - gas_ppm (PPM):    Normal < 50, Warning [50, 150], Critical > 150

Target Classes:
  0 -> NORMAL
  1 -> WARNING
  2 -> CRITICAL

Output:
  ml/data/sensor_telemetry.csv
"""

import os
from pathlib import Path
import numpy as np
import pandas as pd

SEED = 42
TOTAL_SAMPLES = 5000

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = DATA_DIR / "sensor_telemetry.csv"


def classify_reading(temp: float, vib: float, press: float, gas: float) -> tuple[int, str]:
    """
    Classify telemetry sample based on CASE industrial thresholds.
    Critical takes highest priority, followed by Warning, then Normal.
    """
    if temp > 75.0 or vib > 4.5 or press > 110.0 or gas > 150.0:
        return 2, "CRITICAL"
    if temp > 50.0 or vib > 2.5 or press > 70.0 or gas >= 50.0:
        return 1, "WARNING"
    return 0, "NORMAL"


def generate_data(n_samples: int = TOTAL_SAMPLES, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # Distribute samples across the three target conditions
    n_normal = int(n_samples * 0.40)    # 2000
    n_warning = int(n_samples * 0.30)   # 1500
    n_critical = n_samples - n_normal - n_warning  # 1500

    records = []

    # 1. Generate NORMAL samples
    for _ in range(n_normal):
        temp = rng.uniform(20.0, 50.0)
        vib = rng.uniform(0.1, 2.5)
        press = rng.uniform(30.0, 70.0)
        gas = rng.uniform(0.0, 49.5)
        label, state = classify_reading(temp, vib, press, gas)
        records.append({
            "temperature": round(float(temp), 2),
            "vibration": round(float(vib), 3),
            "pressure": round(float(press), 2),
            "gas_ppm": round(float(gas), 2),
            "label": label,
            "state": state
        })

    # 2. Generate WARNING samples
    # In WARNING state, at least one parameter enters Warning range, and none enters Critical.
    for _ in range(n_warning):
        # Base normal ranges
        temp = rng.uniform(20.0, 50.0)
        vib = rng.uniform(0.1, 2.5)
        press = rng.uniform(30.0, 70.0)
        gas = rng.uniform(0.0, 49.5)

        # Elevate 1, 2, 3, or all 4 features into warning range
        elevate_choices = rng.choice(["temp", "vib", "press", "gas"],
                                     size=rng.integers(1, 5),
                                     replace=False)
        if "temp" in elevate_choices:
            temp = rng.uniform(50.5, 75.0)
        if "vib" in elevate_choices:
            vib = rng.uniform(2.55, 4.5)
        if "press" in elevate_choices:
            press = rng.uniform(70.5, 110.0)
        if "gas" in elevate_choices:
            gas = rng.uniform(50.0, 150.0)

        label, state = classify_reading(temp, vib, press, gas)
        records.append({
            "temperature": round(float(temp), 2),
            "vibration": round(float(vib), 3),
            "pressure": round(float(press), 2),
            "gas_ppm": round(float(gas), 2),
            "label": label,
            "state": state
        })

    # 3. Generate CRITICAL samples
    # In CRITICAL state, at least one parameter exceeds the critical threshold.
    for _ in range(n_critical):
        # Start from base normal/warning ranges
        temp = rng.uniform(25.0, 65.0)
        vib = rng.uniform(0.5, 3.5)
        press = rng.uniform(40.0, 90.0)
        gas = rng.uniform(10.0, 100.0)

        # Spike 1, 2, 3, or 4 features into critical territory
        spike_choices = rng.choice(["temp", "vib", "press", "gas"],
                                   size=rng.integers(1, 5),
                                   replace=False)
        if "temp" in spike_choices:
            temp = rng.uniform(75.5, 120.0)
        if "vib" in spike_choices:
            vib = rng.uniform(4.55, 10.0)
        if "press" in spike_choices:
            press = rng.uniform(110.5, 180.0)
        if "gas" in spike_choices:
            gas = rng.uniform(150.5, 400.0)

        label, state = classify_reading(temp, vib, press, gas)
        records.append({
            "temperature": round(float(temp), 2),
            "vibration": round(float(vib), 3),
            "pressure": round(float(press), 2),
            "gas_ppm": round(float(gas), 2),
            "label": label,
            "state": state
        })

    df = pd.DataFrame(records)
    # Shuffle dataset
    df = df.sample(frac=1.0, random_state=seed).reset_index(drop=True)
    return df


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = generate_data()
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"Generated {len(df)} samples into {OUTPUT_FILE}")
    print("\nClass Distribution:")
    print(df["state"].value_counts())
    print("\nFeature Summary:")
    print(df.describe())


if __name__ == "__main__":
    main()

