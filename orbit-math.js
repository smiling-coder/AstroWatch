import * as THREE from "three";

const DEG = Math.PI / 180;

// Gaussian gravitational constant in AU^(3/2) / day.
// Its square approximates the solar gravitational parameter
// in AU^3 / day^2 for this simplified model.
const GAUSSIAN_K = 0.01720209895;

function solveKepler(meanAnomaly, eccentricity) {
    let E = meanAnomaly;

    for (let i = 0; i < 30; i++) {
        const f = E - eccentricity * Math.sin(E) - meanAnomaly;

        const derivative =
            1 - eccentricity * Math.cos(E);

        const delta = f / derivative;

        E -= delta;

        if (Math.abs(delta) < 1e-12) {
            break;
        }
    }

    return E;
}

/**
 * Calculate an approximate heliocentric position.
 *
 * elements:
 * {
 *   a: semimajor axis in AU,
 *   e: eccentricity,
 *   i: inclination in degrees,
 *   om: longitude of ascending node in degrees,
 *   w: argument of perihelion in degrees,
 *   ma: mean anomaly in degrees,
 *   epoch: osculating-element epoch in Julian days
 * }
 *
 * jd: requested Julian date in the same time convention as epoch.
 *
 * Returns position in a heliocentric ecliptic coordinate system.
 *
 * This is a simplified two-body calculation, not a high-precision
 * ephemeris. The epoch and time scale must be consistent.
 */
export function calculateHeliocentricPosition(elements, jd) {
    const {
        a,
        e,
        i,
        om,
        w,
        ma,
        epoch
    } = elements;

    const values = [a, e, i, om, w, ma, epoch, jd];

    if (!values.every(Number.isFinite)) {
        throw new Error("Orbital elements must be finite numbers.");
    }

    if (a <= 0 || e < 0 || e >= 1) {
        throw new Error(
            "This implementation requires an elliptical orbit."
        );
    }

    const inclination = i * DEG;
    const ascendingNode = om * DEG;
    const argumentPerihelion = w * DEG;

    const meanMotion =
        GAUSSIAN_K / Math.pow(a, 1.5);

    const elapsedDays = jd - epoch;

    const meanAnomaly =
        ma * DEG + meanMotion * elapsedDays;

    const E = solveKepler(meanAnomaly, e);

    const xOrbital =
        a * (Math.cos(E) - e);

    const yOrbital =
        a * Math.sqrt(1 - e * e) * Math.sin(E);

    const cosO = Math.cos(ascendingNode);
    const sinO = Math.sin(ascendingNode);

    const cosW = Math.cos(argumentPerihelion);
    const sinW = Math.sin(argumentPerihelion);

    const cosI = Math.cos(inclination);
    const sinI = Math.sin(inclination);

    // Rotate from the orbital plane into the heliocentric
    // ecliptic coordinate system.
    const x =
        (cosO * cosW - sinO * sinW * cosI) * xOrbital +
        (-cosO * sinW - sinO * cosW * cosI) * yOrbital;

    const y =
        (sinO * cosW + cosO * sinW * cosI) * xOrbital +
        (-sinO * sinW + cosO * cosW * cosI) * yOrbital;

    const z =
        sinW * sinI * xOrbital +
        cosW * sinI * yOrbital;

    // Scale AU into convenient Three.js visualization units.
    const AU_SCALE = 20;

    return new THREE.Vector3(
        x * AU_SCALE,
        z * AU_SCALE,
        y * AU_SCALE
    );
}

/**
 * Generate points for the asteroid's complete elliptical orbit.
 *
 * This displays the osculating orbit implied by the supplied
 * elements. It does not predict future orbital changes.
 */
export function createOrbitPoints(elements, segments = 300) {
    const points = [];

    for (let index = 0; index < segments; index++) {
        const E = (2 * Math.PI * index) / segments;

        const a = elements.a;
        const e = elements.e;

        const xOrbital =
            a * (Math.cos(E) - e);

        const yOrbital =
            a * Math.sqrt(1 - e * e) * Math.sin(E);

        const O = elements.om * DEG;
        const w = elements.w * DEG;
        const i = elements.i * DEG;

        const cosO = Math.cos(O);
        const sinO = Math.sin(O);

        const cosW = Math.cos(w);
        const sinW = Math.sin(w);

        const cosI = Math.cos(i);
        const sinI = Math.sin(i);

        const x =
            (cosO * cosW - sinO * sinW * cosI) * xOrbital +
            (-cosO * sinW - sinO * cosW * cosI) * yOrbital;

        const y =
            (sinO * cosW + cosO * sinW * cosI) * xOrbital +
            (-sinO * sinW + cosO * cosW * cosI) * yOrbital;

        const z =
            sinW * sinI * xOrbital +
            cosW * sinI * yOrbital;

        const AU_SCALE = 20;

        points.push(
            new THREE.Vector3(
                x * AU_SCALE,
                z * AU_SCALE,
                y * AU_SCALE
            )
        );
    }

    return points;
          }
