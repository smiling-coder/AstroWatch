"""
AstroWatch AI: NASA NeoWs integration.
"""

import os
import time
from datetime import date, timedelta

import requests


NASA_API_URL = "https://api.nasa.gov/neo/rest/v1"

# DEMO_KEY is suitable only for testing and has stricter rate limits.
NASA_API_KEY = os.getenv("NASA_API_KEY", "DEMO_KEY")

REQUEST_TIMEOUT = 15
CACHE_SECONDS = 300

_session = requests.Session()
_cache = {}


class NASAServiceError(Exception):
    """Raised when the NASA service cannot provide the requested data."""


def _request_json(url, params=None):
    """Fetch JSON with timeout, caching, and useful error messages."""

    params = params or {}
    params["api_key"] = NASA_API_KEY

    cache_key = (url, tuple(sorted(params.items())))
    now = time.time()

    cached = _cache.get(cache_key)

    if cached and now - cached["time"] < CACHE_SECONDS:
        return cached["data"]

    try:
        response = _session.get(
            url,
            params=params,
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()
        data = response.json()

    except requests.Timeout as exc:
        raise NASAServiceError(
            "NASA API request timed out. Please try again."
        ) from exc

    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response else "unknown"

        if status == 429:
            message = "NASA API rate limit reached. Try again later."
        elif status in (401, 403):
            message = (
                "NASA API authentication failed. Check the API key "
                "or DEMO_KEY usage limits."
            )
        else:
            message = f"NASA API returned HTTP {status}."

        raise NASAServiceError(message) from exc

    except (requests.RequestException, ValueError) as exc:
        raise NASAServiceError(
            "Unable to retrieve valid data from NASA."
        ) from exc

    _cache[cache_key] = {
        "time": now,
        "data": data
    }

    return data


def _normalize_neo(neo):
    """Normalize NASA NeoWs data without inventing missing measurements."""

    diameter = neo.get("estimated_diameter", {}).get("kilometers", {})

    approaches = neo.get("close_approach_data") or []
    closest = None

    if approaches:
        # NeoWs feed records usually have one approach in the requested
        # feed interval. Select the earliest listed approach.
        approach = sorted(
            approaches,
            key=lambda item: item.get("close_approach_date", "")
        )[0]

        miss_data = approach.get("miss_distance") or {}
        velocity_data = approach.get("relative_velocity") or {}

        closest = {
            "date": approach.get("close_approach_date"),
            "date_full": approach.get("close_approach_date_full"),
            "miss_distance_km": _to_float(
                miss_data.get("kilometers")
            ),
            "miss_distance_au": _to_float(
                miss_data.get("astronomical")
            ),
            "miss_distance_lunar": _to_float(
                miss_data.get("lunar")
            ),
            "relative_velocity_km_s": _to_float(
                velocity_data.get("kilometers_per_second")
            ),
            "orbiting_body": approach.get("orbiting_body")
        }

    return {
        "id": str(neo.get("id", "")),
        "name": neo.get("name", "Unknown object"),
        "nasa_jpl_url": neo.get("nasa_jpl_url"),
        "absolute_magnitude_h": _to_float(
            neo.get("absolute_magnitude_h")
        ),
        "diameter_km_min": _to_float(
            diameter.get("estimated_diameter_min")
        ),
        "diameter_km_max": _to_float(
            diameter.get("estimated_diameter_max")
        ),
        "is_potentially_hazardous": neo.get(
            "is_potentially_hazardous_asteroid"
        ),
        "close_approach": closest,
        "data_source": "NASA NeoWs"
    }


def _to_float(value):
    """Convert a valid finite numeric value to float."""

    if value is None:
        return None

    try:
        import math

        number = float(value)

        return number if math.isfinite(number) else None

    except (TypeError, ValueError):
        return None


def get_neo_feed(start_date, end_date):
    """Retrieve the NASA NeoWs feed for an inclusive date interval."""

    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    if end < start:
        raise ValueError("End date cannot precede start date.")

    if (end - start).days > 6:
        raise ValueError(
            "Select a maximum seven-day date interval."
        )

    today = date.today()

    if start < today - timedelta(days=30):
        raise ValueError(
            "Choose dates within the most recent 30 days "
            "for this dashboard."
        )

    if end > today + timedelta(days=7):
        raise ValueError(
            "End date is too far in the future for this dashboard."
        )

    data = _request_json(
        f"{NASA_API_URL}/feed",
        {
            "start_date": start.isoformat(),
            "end_date": end.isoformat()
        }
    )

    near_earth_objects = data.get("near_earth_objects", {})

    objects = []

    for records in near_earth_objects.values():
        for neo in records:
            objects.append(_normalize_neo(neo))

    return {
        "source": "NASA NeoWs",
        "date_range": {
            "start": start.isoformat(),
            "end": end.isoformat()
        },
        "retrieved_at_unix": time.time(),
        "total_objects": len(objects),
        "approach_records": sum(
            1 for item in objects if item["close_approach"]
        ),
        "potentially_hazardous_count": sum(
            1 for item in objects
            if item["is_potentially_hazardous"] is True
        ),
        "objects": objects
    }


def get_neo_details(neo_id):
    """Retrieve one NEO record by its NASA identifier."""

    if not neo_id or not str(neo_id).isdigit():
        raise ValueError("A valid numeric NASA NEO identifier is required.")

    data = _request_json(
        f"{NASA_API_URL}/neo/{neo_id}"
    )

    return _normalize_neo(data)

def get_neo_orbit(search_string):
    """
    Retrieve orbital elements from the JPL Small-Body Database.

    search_string should preferably be the asteroid's official
    designation or name, such as "99942 Apophis".

    The response includes available orbital elements and metadata.
    """

    if not search_string or not search_string.strip():
        raise ValueError("An asteroid name or designation is required.")

    url = "https://ssd-api.jpl.nasa.gov/sbdb.api"

    try:
        response = _session.get(
            url,
            params={
                "sstr": search_string.strip(),
                "full-prec": "true"
            },
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()
        data = response.json()

    except requests.Timeout as exc:
        raise NASAServiceError(
            "The JPL orbital-data request timed out."
        ) from exc

    except requests.HTTPError as exc:
        raise NASAServiceError(
            "The JPL orbital-data service returned an HTTP error."
        ) from exc

    except (requests.RequestException, ValueError) as exc:
        raise NASAServiceError(
            "Could not retrieve valid JPL orbital data."
        ) from exc

    if data.get("code") not in (None, 200):
        raise NASAServiceError(
            data.get("message", "JPL could not resolve this object.")
        )

    orbit = data.get("orbit") or {}
    raw_elements = orbit.get("elements") or []

    # JPL returns elements as a list of objects, not a single dictionary.
    elements = {}

    for item in raw_elements:
        name = item.get("name")

        if not name:
            continue

        value = item.get("value")

        try:
            value = float(value) if value is not None else None
        except (TypeError, ValueError):
            value = None

        elements[name] = {
            "value": value,
            "sigma": item.get("sigma"),
            "units": item.get("units"),
            "label": item.get("label")
        }

    def get_value(name):
        return elements.get(name, {}).get("value")

    required = ("a", "e", "i", "om", "w", "ma")

    available_for_geometry = all(
        get_value(name) is not None for name in required
    )

    return {
        "source": "JPL Small-Body Database",
        "object": data.get("object", {}),
        "orbit": {
            "orbit_id": orbit.get("orbit_id"),
            "epoch_jd_tdb": orbit.get("epoch"),
            "epoch_calendar": orbit.get("epoch_cal"),
            "equinox": orbit.get("equinox"),
            "solution_date": orbit.get("soln_date"),
            "condition_code": orbit.get("condition_code"),
            "observation_count": orbit.get("n_obs_used"),
            "data_arc_days": orbit.get("data_arc"),
            "moid_au": orbit.get("moid"),
            "elements": elements,
            "geometry_available": available_for_geometry
        },
        "scientific_note": (
            "Osculating orbital elements apply at a specific epoch. "
            "The browser visualization uses a simplified two-body "
            "approximation and is not a precision ephemeris."
        )
    }
