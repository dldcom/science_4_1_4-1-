import * as THREE from "../vendor/three.module.js";

const specimens = [
  {
    id: "hyphae",
    name: "버섯 균사",
    kind: "균류",
    magnification: "40배",
    target: "균사 찾기",
    prompt: "버섯 균사는 어떤 모양인가요?",
    idealFocus: 72,
    idealLight: 66,
    color: "#d9c8a6",
    hint: "가늘고 긴 실 같은 선이 보이면 초점이 거의 맞은 상태예요.",
  },
  {
    id: "mold",
    name: "곰팡이",
    kind: "균류",
    magnification: "40배",
    target: "포자 주머니 찾기",
    prompt: "곰팡이에서 균사와 포자 주머니를 찾아 써 보세요.",
    idealFocus: 68,
    idealLight: 58,
    color: "#b6c8a2",
    hint: "실 같은 균사 끝에 둥근 주머니가 보이는지 살펴보세요.",
  },
  {
    id: "spirogyra",
    name: "해캄",
    kind: "원생생물",
    magnification: "250배",
    target: "긴 초록 실 관찰",
    prompt: "해캄은 어떤 모양으로 보이나요?",
    idealFocus: 76,
    idealLight: 62,
    color: "#67a94e",
    hint: "초록색 긴 실이 물속에서 아주 천천히 흔들려요.",
  },
  {
    id: "paramecium",
    name: "짚신벌레",
    kind: "원생생물",
    magnification: "110배",
    target: "움직임 관찰",
    prompt: "짚신벌레의 모양과 움직임을 관찰해 써 보세요.",
    idealFocus: 74,
    idealLight: 70,
    color: "#d8d1a5",
    hint: "길쭉한 둥근 몸이 천천히 방향을 바꾸며 움직입니다.",
  },
];

const zoomLevels = [
  { label: "1X", scale: 0.82, ring: 0 },
  { label: "2X", scale: 1.08, ring: Math.PI * 0.6 },
  { label: "4X", scale: 1.42, ring: Math.PI * 1.2 },
];

const state = {
  specimen: specimens[0],
  focus: 35,
  light: 64,
  zoom: 1,
  time: 0,
  pointerDown: false,
  lastX: 0,
  lastY: 0,
  rotation: -0.18,
  tilt: 0,
  viewZoom: 1,
  notes: {},
  completed: new Set(),
};

const specimenGrid = document.querySelector("#specimenGrid");
const lightControl = document.querySelector("#lightControl");
const focusControl = document.querySelector("#focusControl");
const zoomControl = document.querySelector("#zoomControl");
const lightValue = document.querySelector("#lightValue");
const focusValue = document.querySelector("#focusValue");
const zoomValue = document.querySelector("#zoomValue");
const magnification = document.querySelector("#magnification");
const targetFeature = document.querySelector("#targetFeature");
const hint = document.querySelector("#hint");
const notePrompt = document.querySelector("#notePrompt");
const observationNote = document.querySelector("#observationNote");
const savedNotes = document.querySelector("#savedNotes");
const missionStatus = document.querySelector("#missionStatus");
const activePart = document.querySelector("#activePart");
const scopeCanvas = document.createElement("canvas");
scopeCanvas.width = 520;
scopeCanvas.height = 520;
const scopeContext = scopeCanvas.getContext("2d");
const fullScopeCanvas = document.querySelector("#fullScopeCanvas");
const fullScopeContext = fullScopeCanvas.getContext("2d");
const observeButton = document.querySelector("#observeButton");
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
let lamp;
let specimenPlate;
let slideGlass;
let sceneCamera;
const defaultCameraPosition = new THREE.Vector3(5.0, 4.0, 7.3);
const defaultCameraLookAt = new THREE.Vector3(-0.05, 1.55, 0.08);
let cameraLookAt = defaultCameraLookAt.clone();
let cameraTravel = null;
const scenePointers = new Map();
let lastPinchDistance = 0;

function initSpecimenButtons() {
  specimenGrid.innerHTML = "";
  specimens.forEach((specimen) => {
    const button = document.createElement("button");
    button.className = "specimen-button";
    button.type = "button";
    button.setAttribute("aria-pressed", specimen.id === state.specimen.id ? "true" : "false");
    button.dataset.specimen = specimen.id;
    button.innerHTML = `<strong>${specimen.name}</strong><span>${specimen.kind} · ${specimen.magnification}</span>`;
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
  observationNote.value = state.notes[id] ?? "";
  activePart.textContent = `${state.specimen.name} 표본을 재물대에 올렸습니다`;
  updateUi();
}

function updateUi() {
  lightValue.value = state.light;
  focusValue.value = state.focus;
  zoomValue.value = zoomLevels[state.zoom].label;
  magnification.textContent = state.specimen.magnification;
  targetFeature.textContent = state.specimen.target;
  overlaySpecimen.textContent = state.specimen.name;
  notePrompt.textContent = state.specimen.prompt;
  hint.textContent = state.specimen.hint;

  const focusDelta = Math.abs(state.focus - state.specimen.idealFocus);
  const lightDelta = Math.abs(state.light - state.specimen.idealLight);
  const lightReady = lightDelta < 18;
  const focusReady = focusDelta < 9;
  const noteReady = (state.notes[state.specimen.id] ?? "").trim().length >= 5;

  updateSteps(lightReady, focusReady, noteReady);

  if (focusDelta < 9 && lightDelta < 18) {
    overlayState.textContent = "관찰 성공";
    if (noteReady) {
      state.completed.add(state.specimen.id);
      missionStatus.textContent = `${state.specimen.name} 기록 완료! 다른 표본도 관찰해 보세요.`;
    } else {
      missionStatus.textContent = `${state.specimen.target} 성공! 관찰 노트에 특징을 적어 보세요.`;
    }
  } else if (focusDelta < 18) {
    overlayState.textContent = "초점 거의 맞음";
    missionStatus.textContent = "초점은 좋아요. 조명을 조금 더 조절해 보세요.";
  } else {
    overlayState.textContent = "초점 조절 중";
    missionStatus.textContent = "아직 관찰 성공 전입니다.";
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
  renderSavedNotes();
}

lightControl.addEventListener("input", (event) => {
  state.light = Number(event.target.value);
  activePart.textContent = "조명 조절 나사를 돌려 받침대 조명을 바꾸는 중입니다";
  updateUi();
});

focusControl.addEventListener("input", (event) => {
  state.focus = Number(event.target.value);
  activePart.textContent = "초점 조절 나사를 돌려 대물렌즈 높이를 맞추는 중입니다";
  updateUi();
});

zoomControl.addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  activePart.textContent = "회전판을 돌려 대물렌즈 배율을 바꾸는 중입니다";
  updateUi();
});

observationNote.addEventListener("input", (event) => {
  state.notes[state.specimen.id] = event.target.value;
  updateUi();
});

observeButton.addEventListener("click", () => {
  startObservationTravel();
});

exitObserveButton.addEventListener("click", () => {
  closeObservationOverlay();
});

observationOverlay.addEventListener("click", (event) => {
  if (event.target === observationOverlay) {
    closeObservationOverlay();
  }
});

function updateSteps(lightReady, focusReady, noteReady) {
  const steps = {
    specimen: true,
    light: lightReady,
    focus: focusReady,
    note: noteReady,
  };
  document.querySelectorAll(".step-list li").forEach((item) => {
    const done = steps[item.dataset.step];
    item.classList.toggle("is-done", done);
    item.classList.toggle("is-active", !done && firstPendingStep(steps) === item.dataset.step);
  });
}

function firstPendingStep(steps) {
  return ["specimen", "light", "focus", "note"].find((key) => !steps[key]);
}

function refreshButtons() {
  document.querySelectorAll(".specimen-button").forEach((button) => {
    const specimen = specimens.find((item) => item.id === button.dataset.specimen);
    const done = state.completed.has(button.dataset.specimen);
    button.classList.toggle("is-complete", done);
    button.innerHTML = `<strong>${specimen.name}${done ? " ✓" : ""}</strong><span>${specimen.kind} · ${specimen.magnification}</span>`;
  });
}

function renderSavedNotes() {
  const entries = specimens
    .map((specimen) => ({ specimen, note: (state.notes[specimen.id] ?? "").trim() }))
    .filter((entry) => entry.note.length > 0);

  savedNotes.innerHTML = entries
    .map(
      (entry) => `
        <article class="saved-note">
          <strong>${entry.specimen.name}</strong>
          <p>${escapeHtml(entry.note)}</p>
        </article>
      `,
    )
    .join("");
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
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
  lamp.position.set(0, 0.55, 0.2);
  scene.add(lamp);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.28, 6),
    new THREE.MeshStandardMaterial({ color: 0xb9c7c9, roughness: 0.62, metalness: 0.05 }),
  );
  table.position.y = -0.16;
  table.receiveShadow = true;
  scene.add(table);

  microscopeGroup = new THREE.Group();
  microscopeGroup.rotation.y = state.rotation;
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
        state.viewZoom = THREE.MathUtils.clamp(state.viewZoom + (pinchDistance - lastPinchDistance) * 0.004, 0.72, 1.7);
      }
      lastPinchDistance = pinchDistance;
      return;
    }
    const deltaX = event.clientX - state.lastX;
    const deltaY = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.rotation += deltaX * 0.006;
    state.tilt = THREE.MathUtils.clamp(state.tilt + deltaY * 0.004, -0.36, 0.34);
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
    state.viewZoom = THREE.MathUtils.clamp(state.viewZoom - event.deltaY * 0.0012, 0.72, 1.7);
  }, { passive: false });

  renderer.domElement.addEventListener("dblclick", () => {
    state.rotation = -0.18;
    state.tilt = 0;
    state.viewZoom = 1;
  });

  function animate() {
    requestAnimationFrame(animate);
    state.time += 0.016;
    microscopeGroup.rotation.y += (state.rotation - microscopeGroup.rotation.y) * 0.08;
    microscopeGroup.rotation.x += (state.tilt - microscopeGroup.rotation.x) * 0.08;
    camera.zoom += (state.viewZoom - camera.zoom) * 0.12;
    camera.updateProjectionMatrix();
    updateCameraTravel();
    const focusHeight = THREE.MathUtils.mapLinear(state.focus, 0, 100, -0.34, 0.34);
    focusCarrier.position.y += (focusHeight - focusCarrier.position.y) * 0.12;
    focusKnobLeft.rotation.z = state.focus * 0.045;
    focusKnobRight.rotation.z = -state.focus * 0.045;
    lightKnob.rotation.z = state.light * 0.05;
    const zoom = zoomLevels[state.zoom];
    revolvingRing.rotation.y += (zoom.ring - revolvingRing.rotation.y) * 0.14;
    objectiveHousing.rotation.y += (zoom.ring * 0.55 - objectiveHousing.rotation.y) * 0.14;
    specimenPlate.position.x = 0;
    camera.lookAt(cameraLookAt);
    renderer.render(scene, camera);
    drawScope(scopeContext, scopeCanvas);
    if (observationOverlay.classList.contains("is-open")) {
      drawScope(fullScopeContext, fullScopeCanvas);
    }
  }

  animate();
}

function getPinchDistance() {
  const points = Array.from(scenePointers.values());
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function startObservationTravel() {
  if (!sceneCamera || !microscopeGroup) return;
  activePart.textContent = "접안렌즈 쪽으로 이동하는 중입니다";
  overlayState.textContent = "접안렌즈로 이동 중";
  observationOverlay.classList.remove("is-open");
  observationOverlay.setAttribute("aria-hidden", "true");

  const startPosition = sceneCamera.position.clone();
  const startLookAt = cameraLookAt.clone();
  const aboveEyepiece = microscopeGroup.localToWorld(new THREE.Vector3(0.05, 4.18, -0.72));
  const eyeAtLens = microscopeGroup.localToWorld(new THREE.Vector3(0.05, 3.78, -1.08));
  const lookAbove = microscopeGroup.localToWorld(new THREE.Vector3(0.02, 3.72, -0.74));
  const lookIntoLens = microscopeGroup.localToWorld(new THREE.Vector3(0.02, 3.36, -0.44));

  cameraTravel = {
    startTime: performance.now(),
    duration: 1450,
    onComplete: openObservationOverlay,
    points: [
      { position: startPosition, lookAt: startLookAt },
      { position: aboveEyepiece, lookAt: lookAbove },
      { position: eyeAtLens, lookAt: lookIntoLens },
    ],
  };
}

function updateCameraTravel() {
  if (!cameraTravel || !sceneCamera) return;
  const elapsed = performance.now() - cameraTravel.startTime;
  const t = Math.min(1, elapsed / cameraTravel.duration);
  const segmentCount = cameraTravel.points.length - 1;
  const rawSegment = Math.min(segmentCount - 1, Math.floor(t * segmentCount));
  const localStart = rawSegment / segmentCount;
  const localEnd = (rawSegment + 1) / segmentCount;
  const localT = (t - localStart) / (localEnd - localStart);
  const eased = localT < 0.5 ? 4 * localT * localT * localT : 1 - Math.pow(-2 * localT + 2, 3) / 2;
  const from = cameraTravel.points[rawSegment];
  const to = cameraTravel.points[rawSegment + 1];

  sceneCamera.position.lerpVectors(from.position, to.position, eased);
  cameraLookAt.lerpVectors(from.lookAt, to.lookAt, eased);

  if (t >= 1) {
    const onComplete = cameraTravel.onComplete;
    cameraTravel = null;
    if (onComplete) onComplete();
  }
}

function openObservationOverlay() {
  resizeFullScopeCanvas();
  overlaySpecimen.textContent = state.specimen.name;
  overlayState.textContent = "현미경 확대 화면";
  observationOverlay.classList.add("is-open");
  observationOverlay.setAttribute("aria-hidden", "false");
  drawScope(fullScopeContext, fullScopeCanvas);
}

function closeObservationOverlay() {
  observationOverlay.classList.remove("is-open");
  observationOverlay.setAttribute("aria-hidden", "true");
  activePart.textContent = "3D 현미경 화면으로 돌아가는 중입니다";
  if (!sceneCamera) return;

  cameraTravel = {
    startTime: performance.now(),
    duration: 800,
    onComplete: () => {
      activePart.textContent = "표본을 골라 관찰을 시작하세요";
    },
    points: [
      { position: sceneCamera.position.clone(), lookAt: cameraLookAt.clone() },
      { position: defaultCameraPosition.clone(), lookAt: defaultCameraLookAt.clone() },
    ],
  };
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

  root.add(mesh(new THREE.BoxGeometry(3.5, 0.18, 2.75), metal, [0, 0.02, 0]));
  root.add(mesh(new THREE.BoxGeometry(3.32, 0.42, 2.55), pale, [0, 0.18, 0]));
  root.add(mesh(new THREE.BoxGeometry(2.9, 0.08, 2.1), material(0xdce5e6, 0.45, 0.16), [0, 0.43, 0]));
  root.add(mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), black, [1.32, 0.52, 0.78]));

  specimenPlate = mesh(
    new THREE.CylinderGeometry(0.56, 0.56, 0.035, 72),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe6ea, roughness: 0.04, transmission: 0.22, transparent: true, opacity: 0.5 }),
    [0, 0.66, 0.08],
    [0, 0, 0],
    false,
  );
  root.add(specimenPlate);
  slideGlass = mesh(
    new THREE.BoxGeometry(1.18, 0.025, 0.54),
    new THREE.MeshPhysicalMaterial({ color: 0xf2f5ed, roughness: 0.08, transmission: 0.25, transparent: true, opacity: 0.55 }),
    [0, 0.72, 0.08],
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
  root.add(focusCarrier);

  const head = new THREE.Group();
  head.position.set(0.18, 2.76, -0.08);
  head.rotation.set(0.05, 0.08, -0.06);
  focusCarrier.add(head);

  head.add(mesh(new THREE.BoxGeometry(1.08, 0.72, 0.8), pale, [0, 0, 0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.72, 48), pale, [-0.36, 0.46, -0.28], [-0.52, 0.04, -0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.72, 48), pale, [0.36, 0.46, -0.28], [-0.52, 0.04, 0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 48), black, [-0.42, 0.78, -0.56], [-0.52, 0.04, -0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 48), black, [0.42, 0.78, -0.56], [-0.52, 0.04, 0.08]));
  head.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 48), glass, [-0.52, 0.96, -0.78], [-0.52, 0.04, -0.08], false));
  head.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 48), glass, [0.52, 0.96, -0.78], [-0.52, 0.04, 0.08], false));

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
  const ringLabel = makeLabelSprite("회전판", 0.54, 0.15);
  ringLabel.position.set(-0.62, 0.08, 0.54);
  ringLabel.rotation.y = 0.2;
  nosepiece.add(ringLabel);

  objectiveHousing = new THREE.Group();
  nosepiece.add(objectiveHousing);
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.12, 48), black, [0, -0.17, 0]));
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.29, 0.2, 0.32, 48), black, [0, -0.39, 0]));
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.21, 0.15, 0.12, 48), black, [0, -0.61, 0]));
  objectiveHousing.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.035, 40), glass, [0, -0.69, 0], [0, 0, 0], false));
  objectiveLens = objectiveHousing;

  const objectiveLabel = makeLabelSprite("2X", 0.34, 0.15);
  objectiveLabel.position.set(0, -0.39, 0.215);
  objectiveHousing.add(objectiveLabel);

  focusKnobLeft = createKnob(rubber);
  focusKnobLeft.position.set(0.34, 2.02, -0.72);
  focusKnobLeft.rotation.y = Math.PI / 2;
  root.add(focusKnobLeft);

  focusKnobRight = createKnob(rubber);
  focusKnobRight.position.set(1.12, 2.02, -0.72);
  focusKnobRight.rotation.y = Math.PI / 2;
  root.add(focusKnobRight);
  root.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.96, 32), metal, [0.72, 2.02, -0.72], [0, 0, Math.PI / 2]));
  root.add(mesh(new THREE.BoxGeometry(0.4, 0.62, 0.4), pale, [0.72, 2.0, -0.54]));

  root.add(mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.42, 48), glass, [0, 0.42, 0.08]));
  root.add(mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.16, 48), metal, [0, 0.74, 0.08]));
  lightKnob = createSmallKnob(rubber);
  lightKnob.position.set(1.28, 0.56, 1.08);
  lightKnob.rotation.y = Math.PI / 2;
  root.add(lightKnob);
  root.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 24), metal, [1.14, 0.56, 1.08], [Math.PI / 2, 0, 0]));
  root.add(mesh(new THREE.BoxGeometry(0.34, 0.24, 0.32), pale, [0.98, 0.56, 1.08]));

  const focusLabel = makeLabelSprite("초점 조절 나사", 1.08, 0.2);
  focusLabel.position.set(1.44, 2.58, 0.42);
  focusLabel.rotation.y = -0.16;
  root.add(focusLabel);

  const lightLabel = makeLabelSprite("조명 조절 나사", 1.0, 0.19);
  lightLabel.position.set(1.24, 0.9, 1.34);
  lightLabel.rotation.y = -0.4;
  root.add(lightLabel);

  const labelCanvas = makeLabelTexture("1X / 2X / 4X");
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.22),
    new THREE.MeshBasicMaterial({ map: labelCanvas, transparent: true }),
  );
  label.position.set(-0.15, 0.68, 1.0);
  label.rotation.x = -0.52;
  root.add(label);
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
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true }),
  );
  return label;
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
  ctx.scale(zoomScale, zoomScale);
  ctx.translate(-center, -center);
  ctx.filter = `blur(${blur}px)`;
  if (specimen.id === "hyphae") drawHyphae(ctx, size);
  if (specimen.id === "mold") drawMold(ctx, size);
  if (specimen.id === "spirogyra") drawSpirogyra(ctx, size);
  if (specimen.id === "paramecium") drawParamecium(ctx, size);
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

function drawHyphae(ctx, size) {
  ctx.strokeStyle = "rgba(93, 71, 43, 0.68)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 22; i += 1) {
    const y = 80 + i * 17 + Math.sin(state.time * 0.7 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(-30, y);
    for (let x = -30; x < size + 30; x += 56) {
      ctx.quadraticCurveTo(x + 28, y + Math.sin(i + x * 0.03) * 18, x + 56, y + Math.cos(i + x * 0.02) * 12);
    }
    ctx.stroke();
  }
}

function drawMold(ctx, size) {
  drawHyphae(ctx, size);
  ctx.fillStyle = "rgba(84, 102, 65, 0.74)";
  ctx.strokeStyle = "rgba(58, 71, 45, 0.65)";
  for (let i = 0; i < 16; i += 1) {
    const x = 90 + ((i * 83) % 360);
    const y = 95 + ((i * 59) % 330);
    const pulse = Math.sin(state.time * 0.9 + i) * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y + 32);
    ctx.lineTo(x + Math.sin(i) * 18, y + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + Math.sin(i) * 18, y, 10 + (i % 3) * 3 + pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSpirogyra(ctx, size) {
  ctx.lineCap = "round";
  for (let row = 0; row < 4; row += 1) {
    const offsetY = 120 + row * 78;
    ctx.strokeStyle = "rgba(41, 125, 54, 0.72)";
    ctx.lineWidth = 22;
    ctx.beginPath();
    for (let x = -20; x < size + 30; x += 18) {
      const y = offsetY + Math.sin(x * 0.018 + state.time * 0.8 + row) * 20;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(209, 237, 170, 0.8)";
    ctx.lineWidth = 3;
    for (let x = 30; x < size; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, offsetY - 18);
      ctx.lineTo(x + 14, offsetY + 18);
      ctx.stroke();
    }
  }
}

function drawParamecium(ctx, size) {
  const x = size / 2 + Math.sin(state.time * 0.55) * 96;
  const y = size / 2 + Math.cos(state.time * 0.42) * 70;
  const angle = Math.sin(state.time * 0.65) * 0.9;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
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
  ctx.restore();
}

initSpecimenButtons();
createScene();
updateUi();
