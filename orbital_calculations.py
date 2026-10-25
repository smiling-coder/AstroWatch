"""
AstroWatch AI: Basic orbital calculations.

Assumptions:
- Kepler's third law uses the simplified two-body approximation.
- Semimajor axis is expressed in astronomical units (AU).
- Orbital period is expressed in Earth years.
- Orbital elements must be valid and refer to a consistent solution.
"""

import math

DAYS_PER_YEAR = 365.256363004


def calculate_orbital_parameters(elements):
    """
    Calculate basic parameters from orbital elements.

    Accepted keys:
        a: semimajor axis, AU
        e: eccentricity, dimensionless
        i: inclination, degrees (optional)

    Returns None if the required elements are unavailable or invalid.
    """

    if not isinstance(elements, dict):
        return None

    try:
        a = float(elements["a"])
        e = float(elements["e"])

    except (KeyError, TypeError, ValueError):
        return None

    if not math.isfinite(a) or not math.isfinite(e):
        return None

    if a <= 0 or not 0 <= e < 1:
        return None

    # Kepler's third law for an idealized solar two-body orbit.
    period_years = math.sqrt(a ** 3)

    perihelion_au = a * (1 - e)
    aphelion_au = a * (1 + e)

    result = {
        "semimajor_axis_au": round(a, 8),
        "eccentricity": round(e, 8),
        "orbital_period_years_approx": round(period_years, 6),
        "orbital_period_days_approx": round(
            period_years * DAYS_PER_YEAR, 3
        ),
        "perihelion_au": round(perihelion_au, 8),
        "aphelion_au": round(aphelion_au, 8),
        "model": "Simplified two-body approximation"
    }

    try:
        inclination = float(elements["i"])

        if math.isfinite(inclination) and 0 <= inclination <= 180:
            result["inclination_degrees"] = round(inclination, 6)

    except (KeyError, TypeError, ValueError):
        pass

    return result
