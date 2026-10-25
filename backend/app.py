"""
AstroWatch AI — Flask API.

Development:
    python app.py

Health endpoint:
    GET /api/health

Feed:
    GET /api/neos?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

Object details:
    GET /api/neo/<id>
"""

import os
from datetime import date, timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS

from nasa_service import (
    NASAServiceError,
    get_neo_details,
    get_neo_feed
)

from orbital_calculations import calculate_orbital_parameters

from nasa_service import get_neo_orbit

app = Flask(__name__)

# Restrict this using FRONTEND_ORIGIN when deploying.
frontend_origin = os.getenv("FRONTEND_ORIGIN", "*")

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": frontend_origin
        }
    }
)


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "application": "AstroWatch AI",
        "message": "Backend is running."
    })


@app.get("/api/neos")
def neos():
    today = date.today()

    default_start = today.isoformat()
    default_end = (today + timedelta(days=2)).isoformat()

    start_date = request.args.get("start_date", default_start)
    end_date = request.args.get("end_date", default_end)

    try:
        result = get_neo_feed(start_date, end_date)
        return jsonify(result)

    except ValueError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except NASAServiceError as exc:
        return jsonify({
            "error": str(exc),
            "source": "NASA NeoWs"
        }), 502


@app.get("/api/neo/<neo_id>")
def neo_details(neo_id):
    try:
        result = get_neo_details(neo_id)

        # NeoWs object details do not always include orbital elements.
        # Do not manufacture an orbit when those elements are absent.
        result["orbital_calculations"] = None

        return jsonify(result)

    except ValueError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except NASAServiceError as exc:
        return jsonify({
            "error": str(exc),
            "source": "NASA NeoWs"
        }), 502


@app.post("/api/orbit/calculate")
def calculate_orbit():
    """
    Calculate basic orbital parameters from supplied elements.

    Request JSON:
        {
            "a": 1.2,
            "e": 0.3,
            "i": 5.4
        }

    The supplied orbital elements must come from a reliable,
    documented source and refer to a consistent orbital solution.
    """

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({
            "error": "Request body must be a JSON object."
        }), 400

    result = calculate_orbital_parameters(payload)

    if result is None:
        return jsonify({
            "error": (
                "Valid semimajor axis a > 0 and eccentricity "
                "0 <= e < 1 are required."
            )
        }), 400

    return jsonify({
        "result": result,
        "scientific_note": (
            "Approximate two-body orbital calculations; "
            "not a precision ephemeris or impact prediction."
        )
    })


@app.errorhandler(404)
def not_found(_error):
    return jsonify({
        "error": "Endpoint not found."
    }), 404


@app.errorhandler(500)
def server_error(_error):
    app.logger.exception("Unexpected server error.")

    return jsonify({
        "error": "An unexpected backend error occurred."
    }), 500

@app.get("/api/neo/orbit")
def neo_orbit():
    """
    Example:
        GET /api/neo/orbit?search=99942%20Apophis
    """

    search_string = request.args.get("search", "").strip()

    if not search_string:
        return jsonify({
            "error": "Provide an asteroid name or designation."
        }), 400

    try:
        result = get_neo_orbit(search_string)
        return jsonify(result)

    except ValueError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except NASAServiceError as exc:
        return jsonify({
            "error": str(exc),
            "source": "JPL Small-Body Database"
        }), 502


if __name__ == "__main__":
    # Debug mode is for local development only.
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true"
  )
