import * as THREE from "../vendor/three.module.js";

const specimens = [
  {
    id: "hyphae",
    name: "버섯 균사",
    idealFocus: 72,
    idealLight: 66,
    color: "#d9c8a6",
  },
  {
    id: "mold",
    name: "곰팡이",
    idealFocus: 68,
    idealLight: 58,
    color: "#b6c8a2",
  },
  {
    id: "spirogyra",
    name: "해캄",
    idealFocus: 76,
    idealLight: 62,
    color: "#67a94e",
  },
  {
    id: "paramecium",
    name: "짚신벌레",
    idealFocus: 74,
    idealLight: 70,
    color: "#d8d1a5",
  },
];

const zoomLevels = [
  { label: "40x", scale: 0.62, ring: 0 },
  { label: "100x", scale: 1.08, ring: Math.PI * 0.6 },
  { label: "400x", scale: 2.35, ring: Math.PI * 1.2 },
];

const hyphaePhotoSources = [
  "./assets/specimens/hyphae-40x.png",
  "./assets/specimens/hyphae-100x.png",
  "./assets/specimens/hyphae-400x.png",
];
const hyphaePhotos = hyphaePhotoSources.map((src) => {
  const image = new Image();
  image.src = src;
  return image;
});

const OPTICAL_AXIS_X = -0.38;

const state = {
  specimen: specimens[0],
  focus: 35,
  light: 64,
  zoom: 1,
  time: 0,
  pointerDown: false,
  lastX: 0,
  lastY: 0,
  orbitYaw: 0.61,
  orbitPitch: 0.27,
  viewZoom: 1,
  completed: new Set(),
};

const specimenGrid = document.querySelector("#specimenGrid");
const lightControl = document.querySelector("#lightControl");
const focusControl = document.querySelector("#focusControl");
const zoomControl = document.querySelector("#zoomControl");
const lightValue = document.querySelector("#lightValue");
const focusValue = document.querySelector("#focusValue");
const zoomValue = document.querySelector("#zoomValue");
const scopeCanvas = document.createElement("canvas");
scopeCanvas.width = 520;
scopeCanvas.height = 520;
const scopeContext = scopeCanvas.getContext("2d");
const eyepieceGlowTexture = makeEyepieceGlowTexture();
const fullScopeCanvas = document.querySelector("#fullScopeCanvas");
const fullScopeContext = fullScopeCanvas.getContext("2d");
const eyepieceObservePrompt = document.querySelector("#eyepieceObservePrompt");
const exitObserveButton = document.querySelector("#exitObserveButton");
const observationOverlay = document.querySelector("#observationOverlay");
const overlaySpecimen = document.querySelector("#overlaySpecimen");
const overlayState = document.querySelector("#overlayState");

let microscopeGroup;
let focusCarrier;
let objectiveLens;
let focusKnobLeft;
let focusKnobRight;
let lightKnob;
let revolvingRing;
let objectiveHousing;
let zoomMarker;
let focusMarker;
let lightMarker;
let lamp;
let specimenPlate;
let slideGlass;
let sceneCamera;
const defaultCameraPosition = new THREE.Vector3(5.0, 4.0, 7.3);
const defaultCameraLookAt = new THREE.Vector3(-0.05, 1.55, 0.08);
const defaultCameraOffset = defaultCameraPosition.clone().sub(defaultCameraLookAt);
const defaultCameraDistance = defaultCameraOffset.length();
const defaultOrbitYaw = Math.atan2(defaultCameraOffset.x, defaultCameraOffset.z);
const defaultOrbitPitch = Math.asin(defaultCameraOffset.y / defaultCameraDistance);
let cameraLookAt = defaultCameraLookAt.clone();
const scenePointers = new Map();
let lastPinchDistance = 0;
const activeControl = {
  part: "",
  until: 0,
};

function initSpecimenButtons() {
  specimenGrid.innerHTML = "";
  specimens.forEach((specimen) => {
    const button = document.createElement("button");
    button.className = "specimen-button";
    button.type = "button";
    button.setAttribute("aria-pressed", specimen.id === state.specimen.id ? "true" : "false");
    button.dataset.specimen = specimen.id;
    button.innerHTML = `<strong>${specimen.name}</strong>`;
    button.addEventListener("click", () => selectSpecimen(specimen.id));
    specimenGrid.append(button);
  });
}

function selectSpecimen(id) {
  const specimen = specimens.find((item) => item.id === id);
  if (!specimen) return;
  state.specimen = specimen;
  document.querySelectorAll(".specimen-button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.specimen === id ? "true" : "false");
  });
  updateUi();
}

function updateUi() {
  lightValue.value = state.light;
  focusValue.value = state.focus;
  zoomValue.value = zoomLevels[state.zoom].label;
  overlaySpecimen.textContent = state.specimen.name;

  const focusDelta = Math.abs(state.focus - state.specimen.idealFocus);
  const lightDelta = Math.abs(state.light - state.specimen.idealLight);

  if (focusDelta < 9 && lightDelta < 18) {
    overlayState.textContent = "관찰 성공";
    state.completed.add(state.specimen.id);
  } else if (focusDelta < 18) {
    overlayState.textContent = "초점 거의 맞음";
  } else {
    overlayState.textContent = "초점 조절 중";
  }

  if (lamp) {
    lamp.intensity = 0.45 + state.light / 58;
  }
  if (specimenPlate) {
    specimenPlate.material.color.set(state.specimen.color);
  }
  if (slideGlass) {
    slideGlass.material.color.set(state.specimen.id === "spirogyra" || state.specimen.id === "paramecium" ? 0xc8eef1 : 0xf2f5ed);
  }

  refreshButtons();
}

lightControl.addEventListener("input", (event) => {
  state.light = Number(event.target.value);
  pulseControl("light");
  updateUi();
});

focusControl.addEventListener("input", (event) => {
  state.focus = Number(event.target.value);
  pulseControl("focus");
  updateUi();
});

zoomControl.addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  pulseControl("zoom");
  updateUi();
});

eyepieceObservePrompt.addEventListener("click", () => {
  openObservationOverlay();
});

exitObserveButton.addEventListener("click", () => {
  closeObservationOverlay();
});

observationOverlay.addEventListener("click", (event) => {
  if (event.target === observationOverlay) {
    closeObservationOverlay();
  }
});

function refreshButtons() {
  document.querySelectorAll(".specimen-button").forEach((button) => {
    const specimen = specimens.find((item) => item.id === button.dataset.specimen);
    const done = state.completed.has(button.dataset.specimen);
    button.classList.toggle("is-complete", done);
    button.innerHTML = `<strong>${specimen.name}${done ? " ✓" : ""}</strong>`;
  });
}

function createScene() {
  const host = document.querySelector("#scene");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeaf1f3);

  const camera = new THREE.PerspectiveCamera(41, host.clientWidth / host.clientHeight, 0.1, 100);
  sceneCamera = camera;
  camera.position.set(5.0, 4.0, 7.3);
  camera.lookAt(cameraLookAt);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8aa0a9, 1.25);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  lamp = new THREE.PointLight(0xdff8ff, 1.55, 9);
  lamp.position.set(OPTICAL_AXIS_X, 0.55, 0.2);
  scene.add(lamp);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.28, 6),
    new THREE.MeshStandardMaterial({ color: 0xb9c7c9, roughness: 0.62, metalness: 0.05 }),
  );
  table.position.y = -0.16;
  table.receiveShadow = true;
  scene.add(table);

  microscopeGroup = new THREE.Group();
  scene.add(microscopeGroup);

  buildMicroscope(microscopeGroup);

  const resize = () => {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  };
  window.addEventListener("resize", resize);

  renderer.domElement.addEventListener("pointerdown", (event) => {
    state.pointerDown = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    scenePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (scenePointers.size === 2) {
      lastPinchDistance = getPinchDistance();
    }
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!state.pointerDown) return;
    scenePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (scenePointers.size === 2) {
      const pinchDistance = getPinchDistance();
      if (lastPinchDistance > 0) {
        state.viewZoom = THREE.MathUtils.clamp(state.viewZoom + (pinchDistance - lastPinchDistance) * 0.006, 0.45, 4.2);
      }
      lastPinchDistance = pinchDistance;
      return;
    }
    const deltaX = event.clientX - state.lastX;
    const deltaY = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.orbitYaw -= deltaX * 0.006;
    state.orbitPitch = THREE.MathUtils.clamp(state.orbitPitch + deltaY * 0.004, -1.18, 1.18);
  });

  renderer.domElement.addEventListener("pointerup", (event) => {
    scenePointers.delete(event.pointerId);
    state.pointerDown = scenePointers.size > 0;
    lastPinchDistance = scenePointers.size === 2 ? getPinchDistance() : 0;
  });

  renderer.domElement.addEventListener("pointercancel", (event) => {
    scenePointers.delete(event.pointerId);
    state.pointerDown = scenePointers.size > 0;
    lastPinchDistance = scenePointers.size === 2 ? getPinchDistance() : 0;
  });

  renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.viewZoom = THREE.MathUtils.clamp(state.viewZoom - event.deltaY * 0.002, 0.45, 4.2);
  }, { passive: false });

  renderer.domElement.addEventListener("dblclick", () => {
    state.orbitYaw = defaultOrbitYaw;
    state.orbitPitch = defaultOrbitPitch;
    state.viewZoom = 1;
  });

  function animate() {
    requestAnimationFrame(animate);
    state.time += 0.016;
    updateOrbitCamera(camera);
    camera.zoom += (1 - camera.zoom) * 0.12;
    camera.updateProjectionMatrix();
    const focusHeight = THREE.MathUtils.mapLinear(state.focus, 0, 100, -0.34, 0.34);
    focusCarrier.position.y += (focusHeight - focusCarrier.position.y) * 0.12;
    focusKnobLeft.rotation.z = state.focus * 0.045;
    focusKnobRight.rotation.z = -state.focus * 0.045;
    lightKnob.rotation.z = state.light * 0.05;
    const zoom = zoomLevels[state.zoom];
    revolvingRing.rotation.y += (zoom.ring - revolvingRing.rotation.y) * 0.14;
    objectiveHousing.rotation.y += (zoom.ring * 0.55 - objectiveHousing.rotation.y) * 0.14;
    updateControlMarkers(performance.now());
    specimenPlate.position.x = OPTICAL_AXIS_X;
    camera.lookAt(cameraLookAt);
    updateEyepiecePrompt(camera, host);
    renderer.render(scene, camera);
    drawScope(scopeContext, scopeCanvas);
    if (observationOverlay.classList.contains("is-open")) {
      drawScope(fullScopeContext, fullScopeCanvas);
    }
  }

  animate();
}

function updateOrbitCamera(camera) {
  const distance = defaultCameraDistance / state.viewZoom;
  const horizontalDistance = Math.cos(state.orbitPitch) * distance;
  const targetPosition = new THREE.Vector3(
    cameraLookAt.x + Math.sin(state.orbitYaw) * horizontalDistance,
    cameraLookAt.y + Math.sin(state.orbitPitch) * distance,
    cameraLookAt.z + Math.cos(state.orbitYaw) * horizontalDistance,
  );
  camera.position.lerp(targetPosition, 0.12);
}

function updateEyepiecePrompt(camera, host) {
  if (!microscopeGroup || observationOverlay.classList.contains("is-open")) {
    eyepieceObservePrompt.classList.remove("is-visible");
    eyepieceObservePrompt.setAttribute("aria-hidden", "true");
    return;
  }

  const eyepiecePosition = microscopeGroup.localToWorld(new THREE.Vector3(OPTICAL_AXIS_X + 0.05, 3.9, -0.82));
  const distance = camera.position.distanceTo(eyepiecePosition);
  const projected = eyepiecePosition.clone().project(camera);
  const nearScreenCenter = Math.abs(projected.x) < 0.46 && Math.abs(projected.y) < 0.54;
  const inFrontOfCamera = projected.z > -1 && projected.z < 1;
  const shouldShow = distance < 3.25 && nearScreenCenter && inFrontOfCamera;

  eyepieceObservePrompt.classList.toggle("is-visible", shouldShow);
  eyepieceObservePrompt.setAttribute("aria-hidden", shouldShow ? "false" : "true");

  if (shouldShow) {
    const x = (projected.x * 0.5 + 0.5) * host.clientWidth;
    const y = (-projected.y * 0.5 + 0.5) * host.clientHeight;
    eyepieceObservePrompt.style.left = `${x}px`;
    eyepieceObservePrompt.style.top = `${y}px`;
  }
}

function getPinchDistance() {
  const points = Array.from(scenePointers.values());
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function openObservationOverlay() {
  resizeFullScopeCanvas();
  overlaySpecimen.textContent = state.specimen.name;
  overlayState.textContent = "현미경 확대 화면";
  eyepieceObservePrompt.classList.remove("is-visible");
  eyepieceObservePrompt.setAttribute("aria-hidden", "true");
  observationOverlay.classList.add("is-open");
  observationOverlay.setAttribute("aria-hidden", "false");
  drawScope(fullScopeContext, fullScopeCanvas);
}

function closeObservationOverlay() {
  observationOverlay.classList.remove("is-open");
  observationOverlay.setAttribute("aria-hidden", "true");
}

function resizeFullScopeCanvas() {
  const rect = document.querySelector(".lab").getBoundingClientRect();
  const size = Math.min(rect.width - 32, rect.height - 92, 1400);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  fullScopeCanvas.style.width = `${size}px`;
  fullScopeCanvas.style.height = `${size}px`;
  fullScopeCanvas.width = Math.max(520, Math.floor(size * pixelRatio));
  fullScopeCanvas.height = Math.max(520, Math.floor(size * pixelRatio));
}

window.addEventListener("resize", () => {
  if (observationOverlay.classList.contains("is-open")) {
    resizeFullScopeCanvas();
  }
});

function material(color, roughness = 0.46, metalness = 0.18) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, mat, position, rotation = [0, 0, 0], cast = true) {
  const item = new THREE.Mesh(geometry, mat);
  item.position.set(...position);
  item.rotation.set(...rotation);
  item.castShadow = cast;
  item.receiveShadow = true;
  return item;
}

function pulseControl(part) {
  activeControl.part = part;
  activeControl.until = performance.now() + 850;
}

function createControlMarker(size = 0.06) {
  const group = new THREE.Group();
  const dotMaterial = new THREE.MeshStandardMaterial({
    color: 0xd72f2f,
    emissive: 0x8b1010,
    emissiveIntensity: 0.35,
    roughness: 0.28,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(size, 24, 16), dotMaterial));
  group.userData.baseScale = 1;
  group.userData.dotMaterial = dotMaterial;
  return group;
}

function updateControlMarkers(now) {
  updateMarker(zoomMarker, activeControl.part === "zoom" && now < activeControl.until);
  updateMarker(focusMarker, activeControl.part === "focus" && now < activeControl.until);
  updateMarker(lightMarker, activeControl.part === "light" && now < activeControl.until);
}

function updateMarker(marker, active) {
  if (!marker) return;
  const targetScale = active ? 1.28 : 1;
  marker.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.18);
  marker.userData.dotMaterial.emissiveIntensity += ((active ? 0.75 : 0.35) - marker.userData.dotMaterial.emissiveIntensity) * 0.18;
}

function makeEyepieceGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const center = canvas.width / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const lensGlow = context.createRadialGradient(center, center, 0, center, center, 112);
  lensGlow.addColorStop(0, "rgba(236, 255, 247, 0.62)");
  lensGlow.addColorStop(0.18, "rgba(184, 226, 202, 0.28)");
  lensGlow.addColorStop(0.34, "rgba(70, 90, 78, 0.18)");
  lensGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = lensGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.beginPath();
  context.arc(center, center, 31, 0, Math.PI * 2);
  context.clip();
  context.globalAlpha = 0.46;
  context.filter = "blur(5px)";
  context.strokeStyle = "rgba(73, 120, 82, 0.9)";
  context.lineWidth = 3;
  for (let i = 0; i < 5; i += 1) {
    const y = center - 18 + i * 9;
    context.beginPath();
    context.moveTo(center - 34, y);
    context.quadraticCurveTo(center - 10, y - 10, center + 10, y + 3);
    context.quadraticCurveTo(center + 24, y + 12, center + 36, y - 2);
    context.stroke();
  }
  context.filter = "none";
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildMicroscope(root) {
  const enamel = material(0xe8edf0, 0.36, 0.12);
  enamel.map = makeNoiseTexture("#e7edf0", "#d0d9dd", 0.08);
  enamel.map.colorSpace = THREE.SRGBColorSpace;
  const black = material(0x101719, 0.54, 0.2);
  const metal = material(0x6f7c83, 0.31, 0.5);
  const rubber = material(0x242b2f, 0.72, 0.05);
  rubber.map = makeGrooveTexture();
  rubber.map.colorSpace = THREE.SRGBColorSpace;
  const pale = material(0xf3f6f4, 0.34, 0.08);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fd2e1,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.35,
    transparent: true,
    opacity: 0.62,
  });
  const eyepieceGlass = new THREE.MeshPhysicalMaterial({
    map: eyepieceGlowTexture,
    color: 0xdff8ff,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.18,
    transparent: true,
    opacity: 0.92,
  });

  root.add(mesh(new THREE.BoxGeometry(3.5, 0.18, 2.75), metal, [0, 0.02, 0]));
  root.add(mesh(new THREE.BoxGeometry(3.32, 0.42, 2.55), pale, [0, 0.18, 0]));
  root.add(mesh(new THREE.BoxGeometry(2.9, 0.08, 2.1), material(0xdce5e6, 0.45, 0.16), [0, 0.43, 0]));
  root.add(mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), black, [1.32, 0.52, 0.78]));

  specimenPlate = mesh(
    new THREE.CylinderGeometry(0.56, 0.56, 0.035, 72),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe6ea, roughness: 0.04, transmission: 0.22, transparent: true, opacity: 0.5 }),
    [OPTICAL_AXIS_X, 0.66, 0.08],
    [0, 0, 0],
    false,
  );
  root.add(specimenPlate);
  slideGlass = mesh(
    new THREE.BoxGeometry(1.18, 0.025, 0.54),
    new THREE.MeshPhysicalMaterial({ color: 0xf2f5ed, roughness: 0.08, transmission: 0.25, transparent: true, opacity: 0.55 }),
    [OPTICAL_AXIS_X, 0.72, 0.08],
    [0, 0.08, 0],
    false,
  );
  root.add(slideGlass);

  const arm = new THREE.Group();
  arm.position.set(0.66, 0.38, -0.42);
  arm.rotation.z = -0.05;
  arm.add(mesh(new THREE.BoxGeometry(0.5, 2.85, 0.62), pale, [0, 1.4, 0]));
  arm.add(mesh(new THREE.BoxGeometry(0.32, 2.15, 0.54), enamel, [-0.16, 1.48, 0.08]));
  root.add(arm);

  focusCarrier = new THREE.Group();
  focusCarrier.position.x = OPTICAL_AXIS_X;
  root.add(focusCarrier);

  const head = new THREE.Group();
  head.position.set(0.18, 2.76, -0.08);
  head.rotation.set(0.02, 0.04, -0.02);
  focusCarrier.add(head);

  head.add(mesh(new THREE.BoxGeometry(1.08, 0.72, 0.8), pale, [0, 0, 0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.72, 48), pale, [-0.36, 0.46, -0.28], [-0.52, 0.04, -0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.72, 48), pale, [0.36, 0.46, -0.28], [-0.52, 0.04, 0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 48), black, [-0.42, 0.78, -0.56], [-0.52, 0.04, -0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 48), black, [0.42, 0.78, -0.56], [-0.52, 0.04, 0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.035, 48), black, [-0.44, 1.0, -0.69], [-0.52, 0.04, -0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.035, 48), black, [0.4, 1.0, -0.69], [-0.52, 0.04, 0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.045, 64), eyepieceGlass, [-0.44, 1.015, -0.7], [-0.52, 0.04, -0.08], false));
  head.add(mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.045, 64), eyepieceGlass, [0.4, 1.015, -0.7], [-0.52, 0.04, 0.08], false));

  const headBridge = new THREE.Group();
  headBridge.add(mesh(new THREE.BoxGeometry(0.74, 0.44, 0.56), pale, [0.58, 2.76, 0.02]));
  headBridge.add(mesh(new THREE.BoxGeometry(0.34, 0.82, 0.42), enamel, [0.95, 2.52, -0.08]));
  headBridge.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.24, 48), black, [0, 2.34, 0.08]));
  focusCarrier.add(headBridge);

  const nosepiece = new THREE.Group();
  nosepiece.position.set(0, 2.15, 0.08);
  focusCarrier.add(nosepiece);
  revolvingRing = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.28, 72), rubber, [0, 0, 0]);
  nosepiece.add(revolvingRing);
  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2;
    const grip = mesh(
      new THREE.BoxGeometry(0.025, 0.2, 0.08),
      rubber,
      [Math.cos(angle) * 0.45, 0, Math.sin(angle) * 0.45],
      [0, angle, 0],
    );
    revolvingRing.add(grip);
  }
  zoomMarker = createControlMarker(0.04);
  zoomMarker.position.set(0.43, 0.16, 0.06);
  zoomMarker.rotation.x = Math.PI / 2;
  revolvingRing.add(zoomMarker);

  const ringLabel = makeLabelSprite("회전판", 0.82, 0.22);
  ringLabel.position.set(-0.58, -0.14, 0.52);
  ringLabel.rotation.y = 0.18;
  nosepiece.add(ringLabel);

  objectiveHousing = new THREE.Group();
  nosepiece.add(objectiveHousing);
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.12, 48), black, [0, -0.17, 0]));
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.29, 0.2, 0.32, 48), black, [0, -0.39, 0]));
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.21, 0.15, 0.12, 48), black, [0, -0.61, 0]));
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.035, 40), glass, [0, -0.69, 0], [0, 0, 0], false));
  objectiveLens = objectiveHousing;

  const objectiveLabel = makeLabelSprite("대물렌즈", 0.78, 0.2);
  objectiveLabel.position.set(-0.58, -0.48, 0.32);
  objectiveLabel.rotation.y = 0.2;
  nosepiece.add(objectiveLabel);

  focusKnobLeft = createKnob(rubber);
  focusKnobLeft.position.set(0.34, 2.02, -0.72);
  focusKnobLeft.rotation.y = Math.PI / 2;
  root.add(focusKnobLeft);

  focusKnobRight = createKnob(rubber);
  focusKnobRight.position.set(1.12, 2.02, -0.72);
  focusKnobRight.rotation.y = Math.PI / 2;
  focusMarker = createControlMarker(0.045);
  focusMarker.position.set(0.34, 0.24, 0.16);
  focusMarker.rotation.x = Math.PI / 2;
  focusKnobRight.add(focusMarker);
  root.add(focusKnobRight);
  root.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.96, 32), metal, [0.72, 2.02, -0.72], [0, 0, Math.PI / 2]));
  root.add(mesh(new THREE.BoxGeometry(0.4, 0.62, 0.4), pale, [0.72, 2.0, -0.54]));

  root.add(mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.42, 48), glass, [OPTICAL_AXIS_X, 0.42, 0.08]));
  root.add(mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.16, 48), metal, [OPTICAL_AXIS_X, 0.74, 0.08]));
  lightKnob = createSmallKnob(rubber);
  lightKnob.position.set(1.28, 0.56, 1.08);
  lightKnob.rotation.y = Math.PI / 2;
  lightMarker = createControlMarker(0.034);
  lightMarker.position.set(0.19, 0.13, 0.09);
  lightMarker.rotation.x = Math.PI / 2;
  lightKnob.add(lightMarker);
  root.add(lightKnob);
  root.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 24), metal, [1.14, 0.56, 1.08], [Math.PI / 2, 0, 0]));
  root.add(mesh(new THREE.BoxGeometry(0.34, 0.24, 0.32), pale, [0.98, 0.56, 1.08]));

  const focusLabel = makeLabelSprite("초점 조절 나사", 1.08, 0.2);
  focusLabel.position.set(1.82, 2.34, -1.1);
  focusLabel.rotation.y = -0.04;
  root.add(focusLabel);

  const lightLabel = makeLabelSprite("조명 조절 나사", 1.0, 0.19);
  lightLabel.position.set(1.36, 1.02, 1.32);
  lightLabel.rotation.y = -0.4;
  root.add(lightLabel);

  const eyepieceLabel = makeLabelSprite("접안렌즈", 0.82, 0.2);
  eyepieceLabel.position.set(0.84, 3.9, -0.86);
  eyepieceLabel.rotation.y = -0.24;
  focusCarrier.add(eyepieceLabel);

  const stageLabel = makeLabelSprite("조리대", 0.68, 0.19);
  stageLabel.position.set(OPTICAL_AXIS_X - 0.82, 0.98, 0.36);
  stageLabel.rotation.y = 0.24;
  root.add(stageLabel);
}

function makeNoiseTexture(base, fleck, strength) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 900; i += 1) {
    context.globalAlpha = Math.random() * strength;
    context.fillStyle = fleck;
    context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 2.4);
  return texture;
}

function makeGrooveTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#242b2f";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,0.11)";
  context.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += 8) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 18, canvas.height);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  return texture;
}

function createKnob(knobMaterial) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 48), knobMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]));
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    const grip = mesh(
      new THREE.BoxGeometry(0.055, 0.12, 0.24),
      knobMaterial,
      [Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0],
      [0, 0, angle],
    );
    group.add(grip);
  }
  return group;
}

function createSmallKnob(knobMaterial) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 40), knobMaterial, [0, 0, 0], [Math.PI / 2, 0, 0]));
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    group.add(
      mesh(
        new THREE.BoxGeometry(0.04, 0.07, 0.12),
        knobMaterial,
        [Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, 0],
        [0, 0, angle],
      ),
    );
  }
  return group;
}

function makeLabelSprite(text, width, height) {
  const labelTexture = makeLabelTexture(text);
  const group = new THREE.Group();
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true }),
  );
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true }),
  );
  front.position.z = 0.003;
  back.position.z = -0.003;
  back.rotation.y = Math.PI;
  group.add(front);
  group.add(back);
  return group;
}

function makeLabelTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(255,255,255,0.86)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#182126";
  context.font = "700 46px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawScope(ctx, canvas) {
  const size = Math.min(canvas.width, canvas.height);
  const center = size / 2;
  const radius = size * 0.43;
  const specimen = state.specimen;
  const focusDelta = Math.abs(state.focus - specimen.idealFocus);
  const blur = Math.min(15, focusDelta * 0.5);
  const brightness = 0.35 + state.light / 95;
  const overexposed = Math.max(0, state.light - 84) / 28;
  const zoomScale = zoomLevels[state.zoom].scale;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.clip();

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, `rgba(${Math.floor(232 * brightness)}, ${Math.floor(226 * brightness)}, ${Math.floor(205 * brightness)}, 1)`);
  gradient.addColorStop(1, `rgba(${Math.floor(116 * brightness)}, ${Math.floor(128 * brightness)}, ${Math.floor(115 * brightness)}, 1)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.18;
  drawParticles(ctx, size);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(center, center);
  if (specimen.id !== "hyphae") {
    ctx.scale(zoomScale, zoomScale);
  }
  ctx.translate(-center, -center);
  ctx.filter = `blur(${blur}px)`;
  if (specimen.id === "hyphae") drawHyphaePhoto(ctx, size, state.zoom) || drawHyphae(ctx, size, state.zoom);
  if (specimen.id === "mold") drawMold(ctx, size, state.zoom);
  if (specimen.id === "spirogyra") drawSpirogyra(ctx, size, state.zoom);
  if (specimen.id === "paramecium") drawParamecium(ctx, size, state.zoom);
  ctx.filter = "none";
  ctx.restore();

  if (overexposed > 0) {
    ctx.fillStyle = `rgba(255, 255, 245, ${Math.min(0.55, overexposed)})`;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.restore();
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.74)";
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.arc(center, center, radius, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  ctx.restore();
}

function drawParticles(ctx, size) {
  ctx.fillStyle = "#344146";
  for (let i = 0; i < 42; i += 1) {
    const x = ((i * 91.7 + state.time * 7) % size);
    const y = ((i * 47.3 + state.time * 4) % size);
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 4) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHyphaePhoto(ctx, size, zoomIndex) {
  const image = hyphaePhotos[zoomIndex];
  if (!image || !image.complete || image.naturalWidth === 0) return false;

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return true;
}

function drawHyphae(ctx, size, zoomIndex = 1) {
  ctx.strokeStyle = "rgba(93, 71, 43, 0.68)";
  ctx.lineWidth = zoomIndex === 2 ? 5 : 3;
  const rowCount = zoomIndex === 0 ? 15 : zoomIndex === 1 ? 22 : 12;
  const spacing = zoomIndex === 0 ? 25 : zoomIndex === 1 ? 17 : 34;
  for (let i = 0; i < rowCount; i += 1) {
    const y = 76 + i * spacing + Math.sin(state.time * 0.7 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(-30, y);
    const segment = zoomIndex === 2 ? 74 : 56;
    for (let x = -30; x < size + 30; x += segment) {
      ctx.quadraticCurveTo(x + segment / 2, y + Math.sin(i + x * 0.03) * 18, x + segment, y + Math.cos(i + x * 0.02) * 12);
    }
    ctx.stroke();

    if (zoomIndex === 2 && i % 2 === 0) {
      ctx.fillStyle = "rgba(98, 72, 44, 0.42)";
      for (let x = 45; x < size; x += 120) {
        ctx.beginPath();
        ctx.arc(x + Math.sin(i) * 8, y + Math.cos(x) * 4, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawMold(ctx, size, zoomIndex = 1) {
  drawHyphae(ctx, size, zoomIndex);
  ctx.fillStyle = "rgba(84, 102, 65, 0.74)";
  ctx.strokeStyle = "rgba(58, 71, 45, 0.65)";
  const sporeCount = zoomIndex === 0 ? 9 : zoomIndex === 1 ? 16 : 26;
  for (let i = 0; i < sporeCount; i += 1) {
    const x = 90 + ((i * 83) % 360);
    const y = 95 + ((i * 59) % 330);
    const pulse = Math.sin(state.time * 0.9 + i) * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y + 32);
    ctx.lineTo(x + Math.sin(i) * 18, y + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + Math.sin(i) * 18, y, 8 + zoomIndex * 5 + (i % 3) * 2 + pulse, 0, Math.PI * 2);
    ctx.fill();

    if (zoomIndex === 2) {
      ctx.fillStyle = "rgba(48, 62, 38, 0.5)";
      for (let j = 0; j < 4; j += 1) {
        ctx.beginPath();
        ctx.arc(x + Math.sin(i) * 18 + Math.cos(j * 1.7) * 9, y + Math.sin(j * 1.7) * 9, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(84, 102, 65, 0.74)";
    }
  }
}

function drawSpirogyra(ctx, size, zoomIndex = 1) {
  ctx.lineCap = "round";
  const rows = zoomIndex === 0 ? 5 : zoomIndex === 1 ? 4 : 2;
  const tubeWidth = zoomIndex === 0 ? 14 : zoomIndex === 1 ? 22 : 42;
  const rowGap = zoomIndex === 2 ? 138 : 78;
  for (let row = 0; row < rows; row += 1) {
    const offsetY = zoomIndex === 2 ? 170 + row * rowGap : 110 + row * rowGap;
    ctx.strokeStyle = "rgba(41, 125, 54, 0.72)";
    ctx.lineWidth = tubeWidth;
    ctx.beginPath();
    for (let x = -20; x < size + 30; x += 18) {
      const y = offsetY + Math.sin(x * 0.018 + state.time * 0.8 + row) * 20;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(209, 237, 170, 0.8)";
    ctx.lineWidth = zoomIndex === 2 ? 5 : 3;
    const spiralStep = zoomIndex === 2 ? 30 : 42;
    for (let x = 30; x < size; x += spiralStep) {
      ctx.beginPath();
      ctx.moveTo(x, offsetY - tubeWidth * 0.8);
      ctx.lineTo(x + 14, offsetY + tubeWidth * 0.8);
      ctx.stroke();
    }

    if (zoomIndex === 2) {
      ctx.strokeStyle = "rgba(22, 89, 36, 0.36)";
      ctx.lineWidth = 1.5;
      for (let x = 56; x < size; x += 72) {
        ctx.beginPath();
        ctx.moveTo(x, offsetY - tubeWidth * 0.55);
        ctx.lineTo(x, offsetY + tubeWidth * 0.55);
        ctx.stroke();
      }
    }
  }
}

function drawParamecium(ctx, size, zoomIndex = 1) {
  const x = size / 2 + Math.sin(state.time * 0.55) * 96;
  const y = size / 2 + Math.cos(state.time * 0.42) * 70;
  const angle = Math.sin(state.time * 0.65) * 0.9;
  const bodyScale = zoomIndex === 0 ? 0.58 : zoomIndex === 1 ? 1 : 1.72;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(bodyScale, bodyScale);
  ctx.fillStyle = "rgba(202, 190, 137, 0.78)";
  ctx.strokeStyle = "rgba(101, 88, 62, 0.65)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 52, 112, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(80, 72, 58, 0.42)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * Math.PI * 2;
    const px = Math.cos(a) * 50;
    const py = Math.sin(a) * 108;
    ctx.beginPath();
    ctx.moveTo(px * 0.94, py * 0.94);
    ctx.lineTo(px * 1.12, py * 1.12);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(114, 97, 69, 0.34)";
  ctx.beginPath();
  ctx.ellipse(-8, -8, 18, 38, -0.3, 0, Math.PI * 2);
  ctx.fill();

  if (zoomIndex === 2) {
    ctx.fillStyle = "rgba(92, 76, 52, 0.32)";
    ctx.beginPath();
    ctx.ellipse(18, 32, 8, 18, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(80, 72, 58, 0.28)";
    ctx.lineWidth = 1;
    for (let i = -44; i <= 44; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, -80);
      ctx.quadraticCurveTo(i + 8, -8, i - 5, 82);
      ctx.stroke();
    }
  }
  ctx.restore();
}

initSpecimenButtons();
createScene();
updateUi();
