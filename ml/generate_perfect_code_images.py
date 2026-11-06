"""
generate_perfect_code_images.py
===============================
Generates pixel-perfect, syntax-highlighted code card images using true Consolas font.
"""

import os
from PIL import Image, ImageDraw, ImageFont

DIRS = [
    os.path.abspath("e:/All Projects/HABE/report/images"),
    os.path.abspath("e:/All Projects/HABE/ml/benchmarks"),
    os.path.abspath("e:/All Projects/HABE/frontend/public/benchmarks")
]
for d in DIRS:
    os.makedirs(d, exist_ok=True)

FONT_PATH = "C:/Windows/Fonts/consola.ttf"
FONT_BOLD_PATH = "C:/Windows/Fonts/consolab.ttf"

# Colors (VS Code / GitHub Light Theme)
CARD_BG        = (248, 250, 252)       # Light slate
HEADER_BG      = (241, 245, 249)       # Card header slate
BORDER_COLOR   = (203, 213, 225)       # Border slate
DIVIDER_COLOR  = (226, 232, 240)       # Divider

C_KEY          = (9, 105, 218)         # #0969da Blue
C_STR          = (26, 127, 55)         # #1a7f37 Green
C_NUM          = (130, 80, 223)        # #8250df Purple
C_PUNCT        = (36, 41, 47)          # #24292f Charcoal
C_COMM         = (87, 96, 106)         # #57606a Grey
C_NORMAL       = (22, 101, 52)         # Forest Green
C_WARNING      = (180, 83, 9)          # Amber
C_CRITICAL     = (185, 28, 28)         # Crimson

def create_window_card(w, h, title):
    img = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=16, fill=CARD_BG, outline=BORDER_COLOR, width=2)
    # Header
    draw.rounded_rectangle([0, 0, w - 1, 48], radius=16, fill=HEADER_BG, outline=BORDER_COLOR, width=2)
    draw.rectangle([0, 32, w - 1, 48], fill=HEADER_BG)
    draw.line([(0, 48), (w - 1, 48)], fill=BORDER_COLOR, width=2)

    # Window dots
    draw.ellipse([18, 17, 32, 31], fill=(255, 95, 86))
    draw.ellipse([38, 17, 52, 31], fill=(255, 189, 46))
    draw.ellipse([58, 17, 72, 31], fill=(39, 201, 63))

    # Header title
    font_header = ImageFont.truetype(FONT_BOLD_PATH, 20)
    draw.text((88, 13), title, font=font_header, fill=(30, 41, 59))

    return img, draw

# ===========================================================================
# 1. FIG_SENSOR_DATA_SCHEMA
# ===========================================================================
def build_sensor_schema_image():
    print("[1/2] Generating pixel-perfect fig_sensor_data_schema.png...")
    w, h = 1600, 1020
    img, draw = create_window_card(w, h, "Sensor Telemetry Ingestion & Autonomous Policy Formulation")

    font_code = ImageFont.truetype(FONT_PATH, 22)
    font_bold = ImageFont.truetype(FONT_BOLD_PATH, 22)

    # Top Section Label
    draw.text((40, 68), "// PART A: 4-Channel Live Telemetry Training Dataset (ml/data/sensor_telemetry.csv)",
              font=font_bold, fill=C_COMM)

    csv_rows = [
        [("temperature, ", C_KEY), ("vibration, ", C_KEY), ("pressure, ", C_KEY), ("gas_ppm, ", C_KEY), ("state", C_KEY)],
        [("21.83,        ", C_NUM), ("1.297,     ", C_NUM), ("56.21,    ", C_NUM), ("42.28,   ", C_NUM), ("NORMAL", C_NORMAL), ("    // Baseline safe state", C_COMM)],
        [("51.68,        ", C_NUM), ("3.314,     ", C_NUM), ("64.46,    ", C_NUM), ("67.27,   ", C_NUM), ("WARNING", C_WARNING), ("   // Mechanical vibration stress", C_COMM)],
        [("94.60,        ", C_NUM), ("7.800,     ", C_NUM), ("6.20,     ", C_NUM), ("142.00,  ", C_NUM), ("CRITICAL", C_CRITICAL), ("  // Thermal overheat & gas surge", C_COMM)]
    ]

    y = 108
    for row in csv_rows:
        x = 40
        for text, col in row:
            draw.text((x, y), text, font=font_code, fill=col)
            x += font_code.getlength(text)
        y += 34

    # Divider Line
    draw.line([(40, 260), (w - 40, 260)], fill=DIVIDER_COLOR, width=2)

    # Bottom Section Label
    draw.text((40, 278), "// PART B: Ingestion Payload & Dynamic DNF Synthesis (POST /data/encrypt/autonomous)",
              font=font_bold, fill=C_COMM)

    json_lines = [
        [("{", C_PUNCT)],
        [('  "plantId": ', C_KEY), ('"company/plantA",', C_STR)],
        [('  "areaId": ', C_KEY), ('"areaA1",', C_STR)],
        [('  "telemetry": {', C_KEY)],
        [('    "temperature": ', C_KEY), ('94.6,', C_NUM), ('    // Thermocouple channel (Celsius)', C_COMM)],
        [('    "vibration": ', C_KEY), ('7.8,', C_NUM), ('      // Accelerometer channel (mm/s)', C_COMM)],
        [('    "pressure": ', C_KEY), ('6.2,', C_NUM), ('       // Hydraulic pressure (bar)', C_COMM)],
        [('    "gas_ppm": ', C_KEY), ('142.0', C_NUM), ('       // Gas transducer channel (ppm)', C_COMM)],
        [('  },', C_PUNCT)],
        [('  "payload": ', C_KEY), ('"TURBINE_VALVE_OVERHEAT_SECTOR_4",', C_STR)],
        [('  "state": ', C_KEY), ('"CRITICAL",', C_CRITICAL), ('  // Autonomous Decision Tree classification (1.8 ms)', C_COMM)],
        [('  "dynamic_policy": ', C_KEY), ('"(plantA/areaA1 AND sensor_data) OR (plantA AND manager) OR ...",', C_STR)],
        [('  "ctHash": ', C_KEY), ('"0x4b7f8e3a2c1d9b8a7c6e5f4d3b2a1c0e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c"', C_STR)],
        [("}", C_PUNCT)]
    ]

    y = 318
    for row in json_lines:
        x = 40
        for text, col in row:
            draw.text((x, y), text, font=font_code, fill=col)
            x += font_code.getlength(text)
        y += 34

    final_img = Image.new("RGB", (w, h), (255, 255, 255))
    final_img.paste(img, (0, 0), img)

    for d in DIRS:
        final_img.save(os.path.join(d, "fig_sensor_data_schema.png"), dpi=(300, 300))
    print("  -> Saved clean fig_sensor_data_schema.png")

# ===========================================================================
# 2. FIG_BULLETIN_SCHEMA
# ===========================================================================
def build_bulletin_schema_image():
    print("[2/2] Generating pixel-perfect fig_bulletin_schema.png...")
    w, h = 1600, 1140
    img, draw = create_window_card(w, h, "User Identity Public Bulletin Record (bulletin.json)")

    font_code = ImageFont.truetype(FONT_PATH, 22)
    font_bold = ImageFont.truetype(FONT_BOLD_PATH, 22)

    draw.text((40, 68), "// User Identity Public Bulletin: Cached in memory at registration time (<5 ms lookup)",
              font=font_bold, fill=C_COMM)

    bulletin_lines = [
        [("{", C_PUNCT)],
        [('  "userAddr": ', C_KEY), ('"operator_alice",', C_STR), ('         // Unique user public identifier (PK_u)', C_COMM)],
        [('  "dmAddr": ', C_KEY), ('"company/plantA/areaA1",', C_STR), (' // Issuing domain master authority', C_COMM)],
        [('  "context": {', C_KEY)],
        [('    "role": ', C_KEY), ('"technician",', C_STR)],
        [('    "location": ', C_KEY), ('"areaA1",', C_STR)],
        [('    "time_of_day": ', C_KEY), ('"14:30",', C_STR)],
        [('    "device_trust": ', C_KEY), ('"high",', C_STR)],
        [('    "past_violations": ', C_KEY), ('0', C_NUM)],
        [('  },', C_PUNCT)],
        [('  "ml_scores": {', C_KEY), ('  // Layer 2 Random Forest contextual attribute evaluation', C_COMM)],
        [('    "company/plantA/areaA1:sensor_data": ', C_KEY), ('0.9820,', C_NUM), ('     // Status: GRANTED (Score >= 0.45)', C_NORMAL)],
        [('    "company/plantA/areaA1:telemetry_data": ', C_KEY), ('0.8910,', C_NUM), ('  // Status: GRANTED (Score >= 0.50)', C_NORMAL)],
        [('    "company/plantA/areaA1:maintenance_data": ', C_KEY), ('0.6240,', C_NUM), ('// Status: GRANTED (Score >= 0.55)', C_NORMAL)],
        [('    "company/plantA/areaA1:plant_data": ', C_KEY), ('0.4120,', C_NUM), ('        // Status: DENIED  (Score <  0.60)', C_CRITICAL)],
        [('    "company/plantA/areaA1:control_data": ', C_KEY), ('0.1850,', C_NUM), ('      // Status: DENIED  (Score <  0.70)', C_CRITICAL)],
        [('    "company/plantA/areaA1:admin_data": ', C_KEY), ('0.0210', C_NUM), ('        // Status: DENIED  (Score <  0.85)', C_CRITICAL)],
        [('  },', C_PUNCT)],
        [('  "UNION_ATTRS": [', C_KEY), ('  // Consolidated attribute qualification set', C_COMM)],
        [('    "company/plantA/areaA1:sensor_data",', C_STR)],
        [('    "company/plantA/areaA1:telemetry_data",', C_STR)],
        [('    "company/plantA/areaA1:maintenance_data"', C_STR)],
        [('  ],', C_PUNCT)],
        [('  "createdAt": ', C_KEY), ('"2026-11-04T10:15:30.000Z"', C_STR)],
        [("}", C_PUNCT)]
    ]

    y = 108
    for row in bulletin_lines:
        x = 40
        for text, col in row:
            draw.text((x, y), text, font=font_code, fill=col)
            x += font_code.getlength(text)
        y += 34

    final_img = Image.new("RGB", (w, h), (255, 255, 255))
    final_img.paste(img, (0, 0), img)

    for d in DIRS:
        final_img.save(os.path.join(d, "fig_bulletin_schema.png"), dpi=(300, 300))
    print("  -> Saved clean fig_bulletin_schema.png")

if __name__ == '__main__':
    build_sensor_schema_image()
    build_bulletin_schema_image()
    print("Both pixel-perfect images generated successfully at 300 DPI!")
