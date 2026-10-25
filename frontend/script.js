import {
    calculateHeliocentricPosition,
    createOrbitPoints
} from "./orbit-math.js";

import * as THREE from "three";

import { OrbitControls } from
    "three/addons/controls/OrbitControls.js";

/*
 * AstroWatch AI frontend.
 *
 * Local development:
 *   http://127.0.0.1:5000/api
 *
 * Production:
 *   Set API_BASE_URL to your deployed Flask backend.
 */

const API_BASE_URL = (
    window.ASTROWATCH_API_URL || "http://127.0.0.1:5000/api"
).replace(/\/$/, "");

const $ = (id) => document.getElementById(id);

const state = {
    objects: [],
    selected: null,
    filteredObjects: [],
    diameterChart: null,
    velocityChart: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    asteroidMeshes: new Map(),
    focusTarget: null,
    resizeObserver: null
};

const numberFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
});

const asteroidMeshes = [];

const orbitLines = [];

const orbitPositions = new Map();

const orbitEpochs = new Map();

function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "Not available";
    }

    return Number(value).toLocaleString("en-US", {
        maximumFractionDigits: digits
    });
}

function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value;
    }
}

function setConnectionStatus(message, healthy = false) {
    setText("connectionStatus", message);

    const dot = document.querySelector(".header-status .status-dot");

    if (dot) {
        dot.style.background = healthy ? "#63e6be" : "#ff7f9d";
        dot.style.boxShadow = healthy
            ? "0 0 12px rgba(99,230,190,.65)"
            : "0 0 12px rgba(255,127,157,.5)";
    }
}

function showError(message) {
    const element = $("errorMessage");

    if (!element) return;

    element.hidden = !message;
    element.textContent = message || "";
}

async function apiGet(path) {
    const response = await fetch(`${API_BASE_URL}${path}`);

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("The backend returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(
            data.error || `Request failed with HTTP ${response.status}.`
        );
    }

    return data;
}

function setInitialDates() {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 2);

    const startString = today.toISOString().slice(0, 10);
    const endString = end.toISOString().slice(0, 10);

    $("startDate").value = startString;
    $("endDate").value = endString;

    $("startDate").max = endString;
    $("endDate").min = startString;
}

async function checkBackend() {
    try {
        const result = await apiGet("/health");

        setConnectionStatus(
            result.status === "ok" ? "Backend online" : "Backend status",
            result.status === "ok"
        );

        return true;
    } catch (error) {
        setConnectionStatus("Backend offline");

        showError(
            `Cannot connect to Flask. Start the Python backend first. ${error.message}`
        );

        return false;
    }
}

async function loadAsteroids() {
    const start = $("startDate").value;
    const end = $("endDate").value;

    if (!start || !end) {
        showError("Please select both a start date and an end date.");
        return;
    }

    if (end < start) {
        showError("The end date cannot be earlier than the start date.");
        return;
    }

    const startTime = new Date(`${start}T00:00:00Z`).getTime();
    const endTime = new Date(`${end}T00:00:00Z`).getTime();
    const intervalDays = (endTime - startTime) / 86400000;

    if (intervalDays > 6) {
        showError("Select a maximum seven-day date interval.");
        return;
    }

    const submitButton = document.querySelector(
        "#dateFilterForm button[type='submit']"
    );

    submitButton.disabled = true;
    submitButton.textContent = "Loading...";

    showError("");

    try {
        const data = await apiGet(
            `/neos?start_date=${encodeURIComponent(start)}` +
            `&end_date=${encodeURIComponent(end)}`
        );

        state.objects = Array.isArray(data.objects)
            ? data.objects
            orbitLines: new Map(),
orbitPositions: new Map(),
orbitEpochs: new Map(),
            : [];

        state.selected = null;

        setText(
            "dataUpdated",
            `NASA data retrieved: ${new Date().toLocaleTimeString()}`
        );

        setText("dataStatus", "Live");
        setConnectionStatus("NASA data loaded", true);

        updateStatistics(data);
        applyFilters();
        updateCharts();

    } catch (error) {
        showError(error.message);

        setText("dataStatus", "Error");
        setConnectionStatus("Data unavailable");

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Load Data";
    }
}

function updateStatistics(data) {
    setText("totalObjects", numberFormatter.format(
        data.total_objects ?? state.objects.length
    ));

    setText("approachCount", numberFormatter.format(
        data.approach_records ?? 0
    ));

    setText("hazardCount", numberFormatter.format(
        data.potentially_hazardous_count ?? 0
    ));
}

function getDiameter(neo) {
    const min = neo.diameter_km_min;
    const max = neo.diameter_km_max;

    if (
        min === null || min === undefined ||
        max === null || max === undefined
    ) {
        return null;
    }

    return (Number(min) + Number(max)) / 2;
}

function applyFilters() {
    const query = $("searchInput").value.trim().toLowerCase();
    const hazardFilter = $("hazardFilter").value;

    state.filteredObjects = state.objects.filter((neo) => {
        const matchesSearch =
            String(neo.name || "").toLowerCase().includes(query) ||
            String(neo.id || "").toLowerCase().includes(query);

        const hazardous = neo.is_potentially_hazardous === true;

        const matchesHazard =
            hazardFilter === "all" ||
            (hazardFilter === "hazardous" && hazardous) ||
            (hazardFilter === "nonhazardous" && !hazardous);

        return matchesSearch && matchesHazard;
    });

    renderTable();
    renderAsteroidMarkers();
    
}

function addCell(row, text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    row.appendChild(cell);

    return cell;
}

function renderTable() {
    const body = $("asteroidTableBody");
    body.replaceChildren();

    setText(
        "tableCount",
        `${state.filteredObjects.length} records`
    );

    if (state.filteredObjects.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.className = "empty-state";
        cell.textContent = "No matching records.";

        row.appendChild(cell);
        body.appendChild(row);

        return;
    }

    const fragment = document.createDocumentFragment();

    for (const neo of state.filteredObjects) {
        const row = document.createElement("tr");

        if (state.selected?.id === neo.id) {
            row.classList.add("selected-row");
        }

        const objectCell = document.createElement("td");
        const objectButton = document.createElement("button");

        objectButton.className = "object-button";
        objectButton.type = "button";
        objectButton.textContent = neo.name || "Unknown object";

        objectButton.addEventListener("click", () => {
            selectAsteroid(neo);
        });
        loadRealOrbit(neo);

        objectCell.appendChild(objectButton);
        row.appendChild(objectCell);

        const diameter =
            neo.diameter_km_min !== null &&
            neo.diameter_km_max !== null
                ? `${formatNumber(neo.diameter_km_min, 5)}–` +
                  `${formatNumber(neo.diameter_km_max, 5)} km`
                : "Not available";

        addCell(row, diameter);

        const approach = neo.close_approach;

        addCell(
            row,
            approach ? formatDate(approach.date) : "Not available"
        );

        addCell(
            row,
            approach
                ? `${formatNumber(approach.miss_distance_km)} km`
                : "Not available"
        );

        addCell(
            row,
            approach
                ? `${formatNumber(approach.relative_velocity_km_s)} km/s`
                : "Not available"
        );

        const classificationCell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className = neo.is_potentially_hazardous
            ? "hazard-badge"
            : "normal-badge";

        badge.textContent = neo.is_potentially_hazardous
            ? "Potentially hazardous"
            : neo.is_potentially_hazardous === false
                ? "Not flagged"
                : "Unknown";

        classificationCell.appendChild(badge);
        row.appendChild(classificationCell);

        row.addEventListener("click", (event) => {
            if (event.target.closest("button")) return;
            selectAsteroid(neo);
        });
        loadRealOrbit(neo);

        fragment.appendChild(row);
    }

    body.appendChild(fragment);
}

function selectAsteroid(neo) {
    state.selected = neo;

    setText("selectedName", neo.name || "Unknown object");
    setText("selectedId", `NASA NEO ID: ${neo.id || "Not available"}`);

    setText(
        "selectedDiameter",
        neo.diameter_km_min !== null &&
        neo.diameter_km_max !== null
            ? `${formatNumber(neo.diameter_km_min, 5)}–` +
              `${formatNumber(neo.diameter_km_max, 5)} km`
            : "Not available"
    );

    const approach = neo.close_approach;

    setText(
        "selectedVelocity",
        approach
            ? `${formatNumber(approach.relative_velocity_km_s)} km/s`
            : "Not available"
    );

    setText(
        "selectedDistance",
        approach
            ? `${formatNumber(approach.miss_distance_km)} km`
            : "Not available"
    );

    setText(
        "selectedDate",
        approach ? formatDate(approach.date) : "Not available"
    );

    setText(
        "selectedHazard",
        neo.is_potentially_hazardous === true
            ? "Yes — classified"
            : neo.is_potentially_hazardous === false
                ? "No — not flagged"
                : "Unknown"
    );

    setText(
        "selectedExplanation",
        approach
            ? (
                `This NASA NeoWs record lists a close approach on ` +
                `${formatDate(approach.date)}. Its miss distance is ` +
                `${formatNumber(approach.miss_distance_km)} km and its ` +
                `relative velocity is ` +
                `${formatNumber(approach.relative_velocity_km_s)} km/s. ` +
                `These values describe the recorded encounter; they do ` +
                `not establish an impact probability.`
            )
            : (
                "No close-approach measurement is available in this " +
                "record. Missing measurements are not treated as zero."
            )
    );

    $("focusObject").disabled = false;

    renderTable();
    focusAsteroid(neo);
}

function createChart(canvasId, type, labels, values, label) {
    const canvas = $(canvasId);

    if (!canvas || typeof Chart === "undefined") return null;

    return new Chart(canvas, {
        type,

        data: {
            labels,

            datasets: [{
                label,
                data: values,
                backgroundColor: [
                    "rgba(167,139,250,.75)",
                    "rgba(112,167,255,.75)",
                    "rgba(101,230,240,.75)",
                    "rgba(99,230,190,.75)",
                    "rgba(255,190,120,.75)"
                ],
                borderColor: "#a78bfa",
                borderWidth: 1,
                borderRadius: 6
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    labels: {
                        color: "#c3c9e0"
                    }
                }
            },

            scales: type === "bar" ? {
                x: {
                    ticks: { color: "#9ba5c2" },
                    grid: { color: "rgba(180,193,255,.08)" }
                },

                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#9ba5c2",
                        precision: 0
                    },
                    grid: { color: "rgba(180,193,255,.08)" }
                }
            } : {}
        }
    });
}

function updateCharts() {
    if (state.diameterChart) {
        state.diameterChart.destroy();
        state.diameterChart = null;
    }

    if (state.velocityChart) {
        state.velocityChart.destroy();
        state.velocityChart = null;
    }

    const diameterBuckets = {
        "< 0.01 km": 0,
        "0.01–0.1 km": 0,
        "0.1–1 km": 0,
        "1–10 km": 0,
        "≥ 10 km": 0
    };

    const velocityBuckets = {
        "< 5 km/s": 0,
        "5–10 km/s": 0,
        "10–20 km/s": 0,
        "20–30 km/s": 0,
        "≥ 30 km/s": 0
    };

    for (const neo of state.filteredObjects) {
        const diameter = getDiameter(neo);

        if (diameter !== null && Number.isFinite(diameter)) {
            if (diameter < 0.01) diameterBuckets["< 0.01 km"]++;
            else if (diameter < 0.1) diameterBuckets["0.01–0.1 km"]++;
            else if (diameter < 1) diameterBuckets["0.1–1 km"]++;
            else if (diameter < 10) diameterBuckets["1–10 km"]++;
            else diameterBuckets["≥ 10 km"]++;
        }

        const velocity = neo.close_approach?.relative_velocity_km_s;

        if (velocity !== null && velocity !== undefined &&
            Number.isFinite(Number(velocity))) {

            const v = Number(velocity);

            if (v < 5) velocityBuckets["< 5 km/s"]++;
            else if (v < 10) velocityBuckets["5–10 km/s"]++;
            else if (v < 20) velocityBuckets["10–20 km/s"]++;
            else if (v < 30) velocityBuckets["20–30 km/s"]++;
            else velocityBuckets["≥ 30 km/s"]++;
        }
    }

    state.diameterChart = createChart(
        "diameterChart",
        "bar",
        Object.keys(diameterBuckets),
        Object.values(diameterBuckets),
        "Objects"
    );

    state.velocityChart = createChart(
        "velocityChart",
        "bar",
        Object.keys(velocityBuckets),
        Object.values(velocityBuckets),
        "Objects"
    );
}

/* -------------------------------------------------------
   THREE.JS ORBITAL VISUALIZATION
------------------------------------------------------- */

function createOrbit(radius, color, eccentricity = 0) {
    const points = [];
    const segments = 240;

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;

        const x = radius * Math.cos(angle);
        const z = radius * Math.sqrt(
            Math.max(0, 1 - eccentricity * eccentricity)
        ) * Math.sin(angle);

        points.push(new THREE.Vector3(x, 0, z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.48
    });

    const line = new THREE.LineLoop(geometry, material);

    state.scene.add(line);

    return line;
}

function createSphere(radius, color, emissive = 0x000000) {
    const geometry = new THREE.SphereGeometry(radius, 32, 24);

    const material = new THREE.MeshStandardMaterial({
        color,
        emissive,
        roughness: 0.8,
        metalness: 0.05
    });

    return new THREE.Mesh(geometry, material);
}

function initThreeScene() {
    const container = $("solarSystem");

    try {
        state.scene = new THREE.Scene();
        state.scene.background = new THREE.Color("#080b19");

        state.camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.1,
            2000
        );

        state.camera.position.set(0, 48, 85);

        state.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

        state.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );

        state.renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );

        state.renderer.outputColorSpace = THREE.SRGBColorSpace;

        container.appendChild(state.renderer.domElement);

        state.controls = new OrbitControls(
            state.camera,
            state.renderer.domElement
        );

        state.controls.enableDamping = true;
        state.controls.dampingFactor = 0.06;
        state.controls.minDistance = 15;
        state.controls.maxDistance = 220;
        state.controls.target.set(0, 0, 0);

        state.scene.add(
            new THREE.AmbientLight(0xffffff, 1.4)
        );

        const sunlight = new THREE.PointLight(
            0xffd9a0,
            150,
            500
        );

        state.scene.add(sunlight);

        const sun = createSphere(4.5, 0xffcb70, 0xff8c28);
        sun.position.set(0, 0, 0);
        state.scene.add(sun);

        const sunGlow = new THREE.Mesh(
            new THREE.SphereGeometry(5.7, 32, 32),
            new THREE.MeshBasicMaterial({
                color: 0xffa64d,
                transparent: true,
                opacity: 0.08,
                side: THREE.BackSide
            })
        );

        state.scene.add(sunGlow);

        createOrbit(20, 0x70a7ff, 0.0167);
        createOrbit(33, 0xa78bfa, 0.0934);
        createOrbit(45, 0x65e6f0, 0.2056);

        const earth = createSphere(1.8, 0x5799ff);
        earth.position.set(20, 0, 0);
        earth.name = "Earth";

        state.scene.add(earth);

        // Earth position and orbital path are illustrative, not ephemerides.

        const starsGeometry = new THREE.BufferGeometry();
        const starCount = 700;
        const positions = [];

        for (let i = 0; i < starCount; i++) {
            positions.push(
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 250,
                (Math.random() - 0.5) * 400
            );
        }

        starsGeometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3)
        );

        const stars = new THREE.Points(
            starsGeometry,
            new THREE.PointsMaterial({
                color: 0xd8e4ff,
                size: 0.35
            })
        );

        state.scene.add(stars);

        renderAsteroidMarkers();

        $("viewerLoading").style.display = "none";

        state.resizeObserver = new ResizeObserver(() => {
            resizeThreeScene();
        });

        state.resizeObserver.observe(container);

        const animate = () => {
            requestAnimationFrame(animate);

            sun.rotation.y += 0.001;
            earth.rotation.y += 0.005;

            if (state.controls) {
                state.controls.update();
            }

            state.renderer.render(state.scene, state.camera);
        };

        animate();

    } catch (error) {
        console.error("Three.js initialization failed:", error);

        $("viewerLoading").textContent =
            "3D visualization unavailable. Check browser WebGL support.";
    }
}

function resizeThreeScene() {
    if (!state.renderer || !state.camera) return;

    const container = $("solarSystem");

    const width = container.clientWidth;
    const height = container.clientHeight;

   if (width <= 0 || height <= 0) return;

    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();

    state.renderer.setSize(width, height);
}

function clearAsteroidMeshes() {
    // Remove asteroid markers from the Three.js scene
    if (asteroidMeshes && asteroidMeshes.length > 0) {
        asteroidMeshes.forEach((mesh) => {
            scene.remove(mesh);

            // Dispose of geometry and materials to prevent memory leaks
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }

            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach((material) => material.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });

        asteroidMeshes.length = 0;
    }

    // Remove orbital trajectory lines
    if (orbitLines && orbitLines.length > 0) {
        orbitLines.forEach((line) => {
            scene.remove(line);

            if (line.geometry) {
                line.geometry.dispose();
            }

            if (line.material) {
                if (Array.isArray(line.material)) {
                    line.material.forEach((material) => material.dispose());
                } else {
                    line.material.dispose();
                }
            }
        });

        orbitLines.length = 0;
    }

    // Clear cached orbital positions and epochs
    if (orbitPositions) {
        orbitPositions.clear();
    }

    if (orbitEpochs) {
        orbitEpochs.clear();
    }
            }

function renderAsteroidMarkers() {
    if (!state.scene) return;

    clearAsteroidMeshes();

    mesh.position.set(
    Math.cos(angle) * radius,
    Math.sin(index * 0.4) * 5,
    Math.sin(angle) * radius
);

    const knownPosition = state.orbitPositions.get(neo.id);

if (knownPosition) {
    mesh.position.copy(knownPosition);
} else {
    // Illustrative placement until actual orbital elements are available.
    mesh.position.set(
        Math.cos(angle) * radius,
        Math.sin(index * 0.4) * 5,
        Math.sin(angle) * radius
    );
}
    

    const objects = state.filteredObjects.slice(0, 150);

    objects.forEach((neo, index) => {
        const angle = index * 2.399963;
        const radius = 28 + (index % 12) * 1.6;

        const mesh = createSphere(
            neo.is_potentially_hazardous ? 0.55 : 0.4,
            neo.is_potentially_hazardous ? 0xff7f9d : 0x65e6f0
        );
        

        mesh.position.set(
            Math.cos(angle) * radius,
            Math.sin(index * 0.4) * 5,
            Math.sin(angle) * radius
        );

        mesh.userData.neo = neo;

        state.scene.add(mesh);
        state.asteroidMeshes.set(neo.id, mesh);
    });
}

function focusAsteroid(neo) {
    if (!state.camera || !state.controls) return;

    const mesh = state.asteroidMeshes.get(neo.id);

    if (!mesh) return;

    state.focusTarget = mesh.position.clone();

    state.controls.target.copy(state.focusTarget);

    const direction = new THREE.Vector3(1, 0.8, 1).normalize();

    state.camera.position.copy(
        mesh.position.clone().add(direction.multiplyScalar(15))
    );

    state.controls.update();
}

function resetCamera() {
    if (!state.camera || !state.controls) return;

    state.camera.position.set(0, 48, 85);
    state.controls.target.set(0, 0, 0);

    state.controls.update();

    state.focusTarget = null;
}

function attachThreeInteractions() {
    if (!state.renderer) return;

    const canvas = state.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

canvas.addEventListener("click", (event) => {
        const rect = canvas.getBoundingClientRect();

        pointer.x = (
            (event.clientX - rect.left) / rect.width
        ) * 2 - 1;

        pointer.y = -(
            (event.clientY - rect.top) / rect.height
        ) * 2 + 1;

        raycaster.setFromCamera(pointer, state.camera);

        const meshes = [...state.asteroidMeshes.values()];
        const intersections = raycaster.intersectObjects(meshes);

        if (intersections.length > 0) {
            const neo = intersections[0].object.userData.neo;

            if (neo) {
                selectAsteroid(neo);
            }
        }
    });
}

function attachEvents() {
    $("dateFilterForm").addEventListener("submit", (event) => {
        event.preventDefault();
        loadAsteroids();
    });

    $("searchInput").addEventListener("input", applyFilters);
    $("hazardFilter").addEventListener("change", applyFilters);

    $("resetCamera").addEventListener("click", resetCamera);

    $("focusObject").addEventListener("click", () => {
        if (state.selected) {
            focusAsteroid(state.selected);
        }
    });
}

async function main() {
    setInitialDates();

    attachEvents();
    initThreeScene();
    attachThreeInteractions();

    const online = await checkBackend();

    if (online) {
        await loadAsteroids();
    }
}

async function loadRealOrbit(neo) {
    if (!neo || !neo.name) return;

    setText("orbitStatus", "Retrieving orbital elements from JPL...");

    try {
        const data = await apiGet(
            `/neo/orbit?search=${encodeURIComponent(neo.name)}`
        );

        const orbit = data.orbit;
        const elements = orbit.elements || {};

        function value(name) {
            return elements[name]?.value ?? null;
        }

        const a = value("a");
        const e = value("e");
        const i = value("i");
        const om = value("om");
        const w = value("w");
        const ma = value("ma");
        const epoch = Number(orbit.epoch_jd_tdb);

        setText(
            "orbitA",
            a === null ? "Not available" : `${a} AU`
        );

        setText(
            "orbitE",
            e === null ? "Not available" : String(e)
        );

        setText(
            "orbitI",
            i === null ? "Not available" : `${i}°`
        );

        setText(
            "orbitEpoch",
            Number.isFinite(epoch) ? `${epoch} JD (TDB)` : "Not available"
        );

        if (a !== null && a > 0 && e !== null && e >= 0 && e < 1) {
            const periodDays = 365.256363004 * Math.sqrt(a ** 3);

            setText(
                "orbitPeriod",
                `${formatNumber(periodDays / 365.256363004, 3)} years`
            );
        } else {
            setText("orbitPeriod", "Not available");
        }

        const canCalculate =
            [a, e, i, om, w, ma, epoch].every(
                value => value !== null && Number.isFinite(Number(value))
            );

        if (!canCalculate) {
            setText(
                "orbitStatus",
                "JPL returned orbital data, but one or more required elements are unavailable. No orbit was fabricated."
            );

            return;
        }

        const orbitalElements = {
            a: Number(a),
            e: Number(e),
            i: Number(i),
            om: Number(om),
            w: Number(w),
            ma: Number(ma),
            epoch
        };

        drawJPLOrbit(neo.id, orbitalElements);

        setText(
            "orbitStatus",
            `Orbital elements retrieved from JPL SBDB. ` +
            `Orbit solution: ${orbit.orbit_id || "not specified"}. ` +
            `The displayed path uses a simplified two-body model.`
        );

    } catch (error) {
        setText(
            "orbitStatus",
            `Could not retrieve orbital elements: ${error.message}`
        );
    }
    }

function drawJPLOrbit(neoId, elements) {
    if (!state.scene) return;

    // Remove the previous JPL orbit for this object.
    const existing = state.orbitLines.get(neoId);

    if (existing) {
        state.scene.remove(existing);
        existing.geometry.dispose();
        existing.material.dispose();
        state.orbitLines.delete(neoId);
    }

    const points = createOrbitPoints(elements);

    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
        color: 0x65e6f0,
        transparent: true,
        opacity: 0.9
    });

    const orbitLine = new THREE.LineLoop(geometry, material);

    state.scene.add(orbitLine);
    state.orbitLines.set(neoId, orbitLine);

    // Calculate the current approximate heliocentric position.
    // Date conversion here is an approximation: UTC and TDB are not
    // identical, so this should not be presented as a precision ephemeris.
    const now = new Date();

    const jdUtc =
        now.getTime() / 86400000 + 2440587.5;

    const position = calculateHeliocentricPosition(
        elements,
        jdUtc
    );

    state.orbitPositions.set(neoId, position);

    const marker = state.asteroidMeshes.get(neoId);

    if (marker) {
        marker.position.copy(position);
    }
}
main();
