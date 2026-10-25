from flask import Flask, jsonify, request, send_from_directory
from pathlib import Path
import math

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent


# --------------------------------------------------
# SIMULATED DEMONSTRATION DATA
# --------------------------------------------------

OBJECTS = [
    {
        "id": "AST-001",
        "name": "Demo Asteroid Alpha",
        "description": (
            "A hypothetical near-Earth object used to demonstrate "
            "orbital visualisation and object inspection."
        ),
        "diameter_km": 0.8,
        "relative_speed_kms": 12.4,
        "closest_approach_km": 85000,
        "inclination_deg": 12,
        "orbit_speed": 0.8,
        "orbit_phase": 0.2,
        "color": "#ff79d2",
    },
    {
        "id": "AST-002",
        "name": "Demo Asteroid Beta",
        "description": (
            "A simulated object for comparing hypothetical "
            "closest-approach distances and relative speeds."
        ),
        "diameter_km": 1.2,
        "relative_speed_kms": 18.2,
        "closest_approach_km": 220000,
        "inclination_deg": 24,
        "orbit_speed": 0.55,
        "orbit_phase": 1.8,
        "color": "#58c7ff",
    },
    {
        "id": "AST-003",
        "name": "Demo Asteroid Gamma",
        "description": (
            "A hypothetical object used to explore orbital "
            "inclination and changing positions in the 3D scene."
        ),
        "diameter_km": 0.3,
        "relative_speed_kms": 9.6,
        "closest_approach_km": 450000,
        "inclination_deg": 35,
        "orbit_speed": 0.35,
        "orbit_phase": 2.6,
        "color": "#ffd166",
    },
    {
        "id": "AST-004",
        "name": "Demo Asteroid Delta",
        "description": (
            "A simulated object for demonstrating a more distant "
            "hypothetical close approach."
        ),
        "diameter_km": 2.1,
        "relative_speed_kms": 22.1,
        "closest_approach_km": 1200000,
        "inclination_deg": 8,
        "orbit_speed": 0.24,
        "orbit_phase": 4.1,
        "color": "#a78bfa",
    },
    {
        "id": "AST-005",
        "name": "Demo Asteroid Epsilon",
        "description": (
            "A fictional object for demonstrating filtering, "
            "selection, and risk-category explanations."
        ),
        "diameter_km": 0.6,
        "relative_speed_kms": 15.7,
        "closest_approach_km": 180000,
        "inclination_deg": 42,
        "orbit_speed": 0.42,
        "orbit_phase": 5.3,
        "color": "#62f2bc",
    },
]


# --------------------------------------------------
# SIMPLIFIED DEMONSTRATION CLASSIFICATION
# --------------------------------------------------

def classify_demo_risk(distance_km, relative_speed_kms):
    """
    Classify a hypothetical encounter using illustrative
    thresholds only.

    This is NOT an impact-probability calculation.

    Real collision analysis requires additional information,
    including the object's orbital state, covariance,
    encounter geometry, and uncertainty.
    """

    if distance_km < 100000:
        category = "HIGH"

        explanation = (
            "The entered separation is below the prototype's "
            "100,000 km demonstration threshold. This is not "
            "evidence of a real collision threat."
        )

        title = "Highest demonstration category"

    elif distance_km < 500000:
        category = "MEDIUM"

        explanation = (
            "The entered separation is within the prototype's "
            "intermediate distance band. Actual risk cannot be "
            "determined from distance alone."
        )

        title = "Intermediate demonstration category"

    else:
        category = "LOW"

        explanation = (
            "The entered separation is outside the prototype's "
            "two closer-distance bands. This classification "
            "does not establish that the encounter is safe."
        )

        title = "Lowest demonstration category"

    return {
        "category": category,
        "title": title,
        "explanation": explanation,
        "distance_km": distance_km,
        "relative_speed_kms": relative_speed_kms,
        "method": "Illustrative distance thresholds",
        "is_real_collision_probability": False,
    }


# --------------------------------------------------
# DASHBOARD
# --------------------------------------------------

@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:filename>")
def serve_static(filename):
    if filename in {"style.css", "script.js"}:
        return send_from_directory(BASE_DIR, filename)

    return jsonify({
        "error": "File not found"
    }), 404


# --------------------------------------------------
# API: OBJECT DIRECTORY
# --------------------------------------------------

@app.get("/api/objects")
def get_objects():
    objects_with_risk = []

    for obj in OBJECTS:
        item = obj.copy()

        result = classify_demo_risk(
            item["closest_approach_km"],
            item["relative_speed_kms"]
        )

        item["risk_category"] = result["category"]

        objects_with_risk.append(item)

    high_risk_count = sum(
        1
        for obj in objects_with_risk
        if obj["risk_category"] == "HIGH"
    )

    close_approach_count = sum(
        1
        for obj in objects_with_risk
        if obj["closest_approach_km"] < 500000
    )

    return jsonify({
        "project": "AstroWatch",
        "data_mode": "SIMULATED",
        "is_live_tracking": False,
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "statistics": {
            "total_objects": len(objects_with_risk),
            "close_approaches": close_approach_count,
            "high_risk_demonstrations": high_risk_count,
        },
        "objects": objects_with_risk,
    })


# --------------------------------------------------
# API: HYPOTHETICAL RISK ANALYSIS
# --------------------------------------------------

@app.post("/api/analyze")
def analyze():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Send a valid JSON request."
        }), 400

    try:
        distance = float(data["distance_km"])

        speed = float(data["relative_speed_kms"])

    except (KeyError, TypeError, ValueError):
        return jsonify({
            "error": (
                "Provide numeric distance_km and "
                "relative_speed_kms values."
            )
        }), 400

    if not math.isfinite(distance) or not math.isfinite(speed):
        return jsonify({
            "error": "Values must be finite numbers."
        }), 400

    if distance < 0 or speed < 0:
        return jsonify({
            "error": "Distance and speed cannot be negative."
        }), 400

    if distance > 1_000_000_000_000:
        return jsonify({
            "error": "Distance is outside the demo's supported range."
        }), 400

    if speed > 100_000:
        return jsonify({
            "error": "Speed is outside the demo's supported range."
        }), 400

    result = classify_demo_risk(distance, speed)

    return jsonify(result)


# --------------------------------------------------
# START SERVER
# --------------------------------------------------

if __name__ == "__main__":
    print("=" * 55)
    print("ASTROWATCH — EDUCATIONAL SPACE OBSERVATORY")
    print("Mode: SIMULATED DATA")
    print("Open: http://127.0.0.1:5000")
    print("=" * 55)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
