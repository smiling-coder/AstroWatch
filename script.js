"use strict";

const API_BASE = window.location.protocol === "file:"
    ? "http://127.0.0.1:5000"
    : window.location.origin;

const canvasContainer = document.getElementById("spaceCanvas");

let scene;
let camera;
let renderer;
let earth;
let earthGroup;
let asteroidMeshes = [];
let orbitObjects = [];
let selectedObjectId = null;
let rotationPaused = false;
let animationFrameId = null;

let objects = [];

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const riskDescriptions = {
    HIGH: "This object falls into the prototype's highest demonstration category. It does not indicate a real impact probability.",
    MEDIUM: "This object falls into the prototype's middle demonstration category. More orbital information would be needed for a scientific assessment.",
    LOW: "This object falls into the prototype's lowest demonstration category. This does not guarantee that an object is harmless."
};


// ------------------------------
// API REQUESTS
// ------------------------------

async function fetchObjects() {
    try {
        const response = await fetch(`${API_BASE}/api/objects`);

        if (!response.ok) {
            throw new Error("Could not retrieve object data.");
        }

        const data = await response.json();

        objects = data.objects;

        renderStatistics(data);
        renderTable(objects);
        initialiseScene();
        updateSelectedObject(objects[0]);

    } catch (error) {
        console.error(error);

        canvasContainer.innerHTML = `
            <div style="
                padding: 35px;
                color: #ff9aa9;
                font-size: 13px;
                line-height: 2;
            ">
                <h3>Backend connection unavailable</h3>
                <p>Start the Python Flask server and refresh this page.</p>
                <p>Run: python app.py</p>
            </div>
        `;
    }
}


// ------------------------------
// DASHBOARD STATISTICS
// ------------------------------

function renderStatistics(data) {
    document.getElementById("objectCount").textContent =
        data.statistics.total_objects;

    document.getElementById("approachCount").textContent =
        data.statistics.close_approaches;

    document.getElementById("riskCount").textContent =
        data.statistics.high_risk_demonstrations;
}


// ------------------------------
// ASTEROID TABLE
// ------------------------------

function renderTable(list) {
    const tbody = document.getElementById("asteroidTable");

    if (!list.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">No matching demonstration objects found.</td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = list.map(object => `
        <tr>
            <td>
                <span class="object-name">
                    ${escapeHTML(object.name)}
                </span>
            </td>

            <td>${object.diameter_km} km</td>

            <td>${object.relative_speed_kms} km/s</td>

            <td>${object.closest_approach_km.toLocaleString()} km</td>

            <td>
                <span class="risk-pill risk-${object.risk_category}">
                    ${object.risk_category}
                </span>
            </td>

            <td>
                <button
                    class="view-button"
                    data-object-id="${object.id}"
                >
                    Inspect
                </button>
            </td>
        </tr>
    `).join("");
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

document.getElementById("searchInput").addEventListener("input", filterObjects);

document.getElementById("riskFilter").addEventListener("change", filterObjects);

function filterObjects() {
    const query = document.getElementById("searchInput")
        .value.trim().toLowerCase();

    const category = document.getElementById("riskFilter").value;

    const filtered = objects.filter(object => {
        const matchesName = object.name.toLowerCase().includes(query);

        const matchesRisk =
            category === "all" || object.risk_category === category;

        return matchesName && matchesRisk;
    });

    renderTable(filtered);
}

document.getElementById("asteroidTable").addEventListener("click", event => {
    const button = event.target.closest("[data-object-id]");

    if (!button) return;

    const object = objects.find(
        item => item.id === button.dataset.objectId
    );

    if (object) {
        updateSelectedObject(object);
        focusAsteroid(object.id);
    }
});


// ------------------------------
// SELECTED OBJECT INFORMATION
// ------------------------------

function updateSelectedObject(object) {
    if (!object) return;

    selectedObjectId = object.id;

    document.getElementById("selectedName").textContent = object.name;

    document.getElementById("selectedDescription").textContent =
        object.description;

    document.getElementById("selectedDiameter").textContent =
        `${object.diameter_km} km`;

    document.getElementById("selectedSpeed").textContent =
        `${object.relative_speed_kms} km/s`;

    document.getElementById("selectedDistance").textContent =
        `${object.closest_approach_km.toLocaleString()} km`;

    const riskElement = document.getElementById("selectedRisk");

    riskElement.textContent = object.risk_category;

    riskElement.style.color = {
        HIGH: "#ff6685",
        MEDIUM: "#ffd166",
        LOW: "#62f2bc"
    }[object.risk_category];

    document.getElementById("riskExplanation").textContent =
        riskDescriptions[object.risk_category];

    asteroidMeshes.forEach(mesh => {
        const isSelected = mesh.userData.objectId === object.id;

        mesh.scale.setScalar(isSelected ? 1.6 : 1);
    });
}


// ------------------------------
// THREE.JS INITIALISATION
// ------------------------------

function initialiseScene() {
    if (renderer) {
        cancelAnimationFrame(animationFrameId);
        renderer.dispose();

        canvasContainer.innerHTML = "";

        asteroidMeshes = [];
        orbitObjects = [];
    }

    scene = new THREE.Scene();

    scene.background = new THREE.Color("#050713");

    camera = new THREE.PerspectiveCamera(
        45,
        canvasContainer.clientWidth / canvasContainer.clientHeight,
        0.1,
        1000
    );

    camera.position.set(0, 6, 18);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 2)
    );

    renderer.setSize(
        canvasContainer.clientWidth,
        canvasContainer.clientHeight
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    canvasContainer.appendChild(renderer.domElement);

    earthGroup = new THREE.Group();

    scene.add(earthGroup);

    createLights();
    createEarth();
    createStars();
    createAsteroids();

    renderer.domElement.addEventListener("pointerdown", onScenePointerDown);

    animate();
}

function createLights() {
    const ambient = new THREE.AmbientLight(0x9aabff, 1.8);

    scene.add(ambient);

    const sunlight = new THREE.DirectionalLight(0xffffff, 3);

    sunlight.position.set(8, 10, 8);

    scene.add(sunlight);

    const blueLight = new THREE.PointLight(0x3688ff, 15, 40);

    blueLight.position.set(-7, 2, -5);

    scene.add(blueLight);
}

function createEarth() {
    const geometry = new THREE.SphereGeometry(2, 64, 64);

    const material = new THREE.MeshStandardMaterial({
        color: 0x277bd1,
        roughness: 0.8,
        metalness: 0.05
    });

    earth = new THREE.Mesh(geometry, material);

    earthGroup.add(earth);

    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.1, 48, 48),
        new THREE.MeshBasicMaterial({
            color: 0x55bfff,
            transparent: true,
            opacity: 0.09,
            side: THREE.BackSide
        })
    );

    earthGroup.add(atmosphere);

    // Simplified decorative continents.
    // These shapes are visual placeholders, not geographic data.

    const landMaterial = new THREE.MeshStandardMaterial({
        color: 0x49d9b1,
        roughness: 1
    });

    const landShapes = [
        [0.4, 0.3, 0.7, 0.3],
        [-0.7, 0.4, 0.4, 0.6],
        [0.9, -0.5, 0.3, 0.4],
        [-0.2, -0.8, 0.4, 0.3],
        [1.5, 0.5, 0.25, 0.3]
    ];

    landShapes.forEach(([x, y, sx, sy]) => {
        const shape = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 12),
            landMaterial
        );

        shape.scale.set(sx, sy, 0.02);

        shape.position.set(x, y, 1.85);

        earth.add(shape);
    });
}

function createStars() {
    const count = 1800;

    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
    );

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.055,
        transparent: true,
        opacity: 0.85
    });

    scene.add(new THREE.Points(geometry, material));
}


// ------------------------------
// ORBITAL VISUALISATION
// ------------------------------

function createAsteroids() {
    objects.forEach((object, index) => {
        const orbitRadius = 3.2 + index * 0.48;

        const orbit = new THREE.LineLoop(
            createOrbitGeometry(orbitRadius, object.inclination_deg),
            new THREE.LineBasicMaterial({
                color: object.color,
                transparent: true,
                opacity: 0.3
            })
        );

        earthGroup.add(orbit);

        orbitObjects.push(orbit);

        const geometry = new THREE.SphereGeometry(
            0.09 + Math.min(object.diameter_km, 2) * 0.025,
            16,
            16
        );

        const material = new THREE.MeshStandardMaterial({
            color: object.color,
            emissive: object.color,
            emissiveIntensity: 0.5,
            roughness: 0.5
        });

        const asteroid = new THREE.Mesh(geometry, material);

        asteroid.userData = {
            objectId: object.id,
            orbitRadius,
            orbitSpeed: object.orbit_speed,
            orbitAngle: object.orbit_phase,
            inclination: THREE.MathUtils.degToRad(
                object.inclination_deg
            )
        };

        earthGroup.add(asteroid);

        asteroidMeshes.push(asteroid);
    });
}

function createOrbitGeometry(radius, inclinationDegrees) {
    const points = [];

    const inclination = THREE.MathUtils.degToRad(inclinationDegrees);

    for (let i = 0; i < 160; i++) {
        const angle = (i / 160) * Math.PI * 2;

        points.push(
            new THREE.Vector3(
                Math.cos(angle) * radius,
                Math.sin(angle) * Math.sin(inclination) * radius,
                Math.sin(angle) * Math.cos(inclination) * radius
            )
        );
    }

    return new THREE.BufferGeometry().setFromPoints(points);
}


// ------------------------------
// CAMERA INTERACTION
// ------------------------------

let dragging = false;
let previousPointer = { x: 0, y: 0 };

canvasContainer.addEventListener("pointerdown", event => {
    dragging = true;

    previousPointer = {
        x: event.clientX,
        y: event.clientY
    };
});

window.addEventListener("pointerup", () => {
    dragging = false;
});

window.addEventListener("pointermove", event => {
    if (!dragging || !earthGroup) return;

    const deltaX = event.clientX - previousPointer.x;
    const deltaY = event.clientY - previousPointer.y;

    earthGroup.rotation.y += deltaX * 0.005;
    earthGroup.rotation.x += deltaY * 0.003;

    earthGroup.rotation.x = THREE.MathUtils.clamp(
        earthGroup.rotation.x,
        -1.2,
        1.2
    );

    previousPointer = {
        x: event.clientX,
        y: event.clientY
    };
});

canvasContainer.addEventListener("wheel", event => {
    if (!camera) return;

    event.preventDefault();

    camera.position.z += event.deltaY * 0.008;

    camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        7,
        35
    );
}, { passive: false });

function onScenePointerDown(event) {
    const rect = renderer.domElement.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;

    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(asteroidMeshes);

    if (hits.length > 0) {
        const id = hits[0].object.userData.objectId;

        const object = objects.find(item => item.id === id);

        updateSelectedObject(object);
    }
}

function focusAsteroid(id) {
    const asteroid = asteroidMeshes.find(
        mesh => mesh.userData.objectId === id
    );

    if (!asteroid) return;

    updateSelectedObject(
        objects.find(object => object.id === id)
    );
}


// ------------------------------
// ANIMATION LOOP
// ------------------------------

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (!rotationPaused && earthGroup) {
        earthGroup.rotation.y += 0.0015;

        asteroidMeshes.forEach(mesh => {
            const data = mesh.userData;

            data.orbitAngle += data.orbitSpeed * 0.002;

            const angle = data.orbitAngle;

            mesh.position.set(
                Math.cos(angle) * data.orbitRadius,
                Math.sin(angle) * data.orbitRadius *
                    Math.sin(data.inclination),
                Math.sin(angle) * data.orbitRadius *
                    Math.cos(data.inclination)
            );
        });

        if (earth) {
            earth.rotation.y += 0.001;
        }
    }

    renderer.render(scene, camera);
}

document.getElementById("resetView").addEventListener("click", () => {
    if (!camera || !earthGroup) return;

    camera.position.set(0, 6, 18);

    earthGroup.rotation.set(0, 0, 0);
});

document.getElementById("toggleRotation").addEventListener("click", event => {
    rotationPaused = !rotationPaused;

    event.target.textContent = rotationPaused
        ? "Resume Rotation"
        : "Pause Rotation";
});

window.addEventListener("resize", () => {
    if (!renderer || !camera) return;

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    camera.aspect = width / height;

    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
});


// ------------------------------
// HYPOTHETICAL RISK ANALYSIS
// ------------------------------

document.getElementById("riskForm").addEventListener("submit", async event => {
    event.preventDefault();

    const distance = Number(
        document.getElementById("distanceInput").value
    );

    const speed = Number(
        document.getElementById("speedInput").value
    );

    const indicator = document.getElementById("riskIndicator");

    try {
        const response = await fetch(`${API_BASE}/api/analyze`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                distance_km: distance,
                relative_speed_kms: speed
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Analysis failed.");
        }

        indicator.textContent = result.category;

        indicator.className = `risk-indicator ${result.category}`;

        document.getElementById("resultTitle").textContent =
            result.title;

        document.getElementById("resultText").textContent =
            result.explanation;

    } catch (error) {
        indicator.textContent = "ERROR";

        indicator.className = "risk-indicator";

        document.getElementById("resultTitle").textContent =
            "Analysis unavailable";

        document.getElementById("resultText").textContent =
            error.message;
    }
});


// ------------------------------
// START APPLICATION
// ------------------------------

fetchObjects();
