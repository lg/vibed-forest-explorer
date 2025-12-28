// Declare Three.js global (provided by script tag in index.html)
declare const THREE: typeof import('three');

// ============================================================================
// INTERFACES
// ============================================================================

interface Tile {
  x: number;
  y: number;
  type: 'grass' | 'water' | 'path';
  decoration: Decoration | null;
  mesh: THREE.Mesh;
  waterMesh?: THREE.Mesh;
}

interface Decoration {
  type: 'tree' | 'rock' | 'flower';
  variant: number;
  offsetX: number;
  offsetY: number;
  health?: number;
  mesh: THREE.Group;
  state?: 'healthy' | 'falling' | 'fading';
  fallAngle?: number;
  fallDirection?: THREE.Vector3;
  opacity?: number;
}

interface Player {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  direction: number;
  isMoving: boolean;
  animTime: number;
  mesh: THREE.Group;
}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
}

// Simple orbit controls state
interface OrbitState {
  isDragging: boolean;
  previousMouseX: number;
  previousMouseY: number;
  azimuth: number;
  polar: number;
  targetAzimuth: number;
  targetPolar: number;
  zoom: number;
  targetZoom: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 700;
const WORLD_SIZE = 20;
const TILE_SIZE = 1;
const MOVE_SPEED = 5;
const TILE_HEIGHT = 0.15;

// Camera angle for isometric view (45 degrees azimuth, ~35 degrees elevation)
const ISO_AZIMUTH = Math.PI / 4;
const ISO_POLAR = Math.PI / 3;
const CAMERA_DISTANCE = 25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const DEFAULT_ZOOM = 1.5;

// Colors
const COLORS = {
  sky: 0x87ceeb,
  grass: 0x27ae60,
  grassDark: 0x1e8449,
  water: 0x3498db,
  waterDeep: 0x2980b9,
  path: 0x8b7355,
  pathDark: 0x7a6348,
  trunk: 0x5d4037,
  trunkDark: 0x4e342e,
  leaves: [0x1b5e20, 0x2e7d32, 0x388e3c, 0x43a047],
  rock: 0x757575,
  rockDark: 0x616161,
  rockMoss: 0x689f38,
  flowerColors: [0xe74c3c, 0xf39c12, 0x9b59b6, 0xe91e63],
  flowerCenter: 0xf1c40f,
  stem: 0x2e7d32,
  skin: 0xffe0bd,
  shirt: 0x4a90d9,
  pants: 0x5d4037,
  hat: 0xa0522d,
  highlight: 0xffeb3b,
  gridLine: 0x000000
};

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let renderer: THREE.WebGLRenderer;
let orbitState: OrbitState;

let world: Tile[][];
let player: Player;
let input: InputState;
let lastTime = 0;
let isMoving = false;
let chopCooldown = 0;

let highlightMesh: THREE.LineLoop;
let particles: Particle[] = [];
let particlesMesh: THREE.Points;

let waterTiles: THREE.Mesh[] = [];
let flowerMeshes: THREE.Group[] = [];
let fallingTrees: Decoration[] = [];

let fps = 0;
let fpsElement: HTMLElement;

// ============================================================================
// THREE.JS SETUP
// ============================================================================

function initThreeJS(): void {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);

  // Orthographic camera for isometric view
  const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  const frustumSize = 15;
  camera = new THREE.OrthographicCamera(
    -frustumSize * aspect,
    frustumSize * aspect,
    frustumSize,
    -frustumSize,
    0.1,
    1000
  );

  // Initialize orbit state with isometric defaults
  orbitState = {
    isDragging: false,
    previousMouseX: 0,
    previousMouseY: 0,
    azimuth: ISO_AZIMUTH,
    polar: ISO_POLAR,
    targetAzimuth: ISO_AZIMUTH,
    targetPolar: ISO_POLAR,
    zoom: DEFAULT_ZOOM,
    targetZoom: DEFAULT_ZOOM
  };

  // Position camera at isometric angle
  updateCameraPosition();

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const container = document.getElementById('game-container');
  if (container) {
    container.insertBefore(renderer.domElement, container.firstChild);
  }

  // Setup manual orbit controls
  setupOrbitControls();

  // Lighting
  setupLighting();
}

function updateCameraPosition(): void {
  const x = CAMERA_DISTANCE * Math.sin(orbitState.polar) * Math.sin(orbitState.azimuth);
  const y = CAMERA_DISTANCE * Math.cos(orbitState.polar);
  const z = CAMERA_DISTANCE * Math.sin(orbitState.polar) * Math.cos(orbitState.azimuth);
  camera.position.set(x + WORLD_SIZE / 2, y, z + WORLD_SIZE / 2);
  camera.lookAt(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
}

function setupOrbitControls(): void {
  const canvas = renderer.domElement;

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    orbitState.isDragging = true;
    orbitState.previousMouseX = e.clientX;
    orbitState.previousMouseY = e.clientY;
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!orbitState.isDragging) return;

    const deltaX = e.clientX - orbitState.previousMouseX;
    const deltaY = e.clientY - orbitState.previousMouseY;

    orbitState.targetAzimuth -= deltaX * 0.005;
    orbitState.targetPolar -= deltaY * 0.005;

    // Clamp polar angle to prevent flipping
    orbitState.targetPolar = Math.max(0.2, Math.min(Math.PI / 2 - 0.1, orbitState.targetPolar));

    orbitState.previousMouseX = e.clientX;
    orbitState.previousMouseY = e.clientY;
  });

  canvas.addEventListener('mouseup', () => {
    orbitState.isDragging = false;
  });

  canvas.addEventListener('mouseleave', () => {
    orbitState.isDragging = false;
  });

  // Touch support
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 1) {
      orbitState.isDragging = true;
      orbitState.previousMouseX = e.touches[0].clientX;
      orbitState.previousMouseY = e.touches[0].clientY;
    }
  });

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (!orbitState.isDragging || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - orbitState.previousMouseX;
    const deltaY = e.touches[0].clientY - orbitState.previousMouseY;

    orbitState.targetAzimuth -= deltaX * 0.005;
    orbitState.targetPolar -= deltaY * 0.005;

    orbitState.targetPolar = Math.max(0.2, Math.min(Math.PI / 2 - 0.1, orbitState.targetPolar));

    orbitState.previousMouseX = e.touches[0].clientX;
    orbitState.previousMouseY = e.touches[0].clientY;
  });

  canvas.addEventListener('touchend', () => {
    orbitState.isDragging = false;
  });

  // Mouse wheel zoom
  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.001;
    orbitState.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, orbitState.targetZoom + zoomDelta));
  }, { passive: false });
}

function updateOrbitControls(): void {
  // Smooth damping
  const damping = 0.1;
  orbitState.azimuth += (orbitState.targetAzimuth - orbitState.azimuth) * damping;
  orbitState.polar += (orbitState.targetPolar - orbitState.polar) * damping;
  orbitState.zoom += (orbitState.targetZoom - orbitState.zoom) * damping;

  // Update camera frustum for zoom
  const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  const frustumSize = 15 / orbitState.zoom;
  camera.left = -frustumSize * aspect;
  camera.right = frustumSize * aspect;
  camera.top = frustumSize;
  camera.bottom = -frustumSize;
  camera.updateProjectionMatrix();

  updateCameraPosition();
}

function setupLighting(): void {
  // Ambient light (soft blue sky color)
  const ambientLight = new THREE.AmbientLight(0xb4d4ff, 0.5);
  scene.add(ambientLight);

  // Hemisphere light for natural outdoor feel
  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.3);
  scene.add(hemiLight);

  // Directional light (sun) with shadows
  const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
  dirLight.position.set(15, 25, 15);
  dirLight.castShadow = true;

  // Shadow settings for quality
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  dirLight.shadow.bias = -0.0001;

  scene.add(dirLight);
}

// ============================================================================
// MODEL CREATION FUNCTIONS
// ============================================================================

function createTileMesh(type: 'grass' | 'water' | 'path', x: number, y: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
  
  let color: number;
  switch (type) {
    case 'water':
      color = COLORS.water;
      break;
    case 'path':
      color = COLORS.path;
      break;
    default:
      color = COLORS.grass;
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: type === 'water' ? 0.2 : 0.8,
    metalness: type === 'water' ? 0.1 : 0
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x + 0.5, -TILE_HEIGHT / 2, y + 0.5);
  mesh.receiveShadow = true;

  return mesh;
}

function createWaterSurface(x: number, y: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, 10, 10);
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.water,
    transparent: true,
    opacity: 0.85,
    roughness: 0.1,
    metalness: 0.2
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x + 0.5, 0.02, y + 0.5);
  mesh.receiveShadow = true;

  return mesh;
}

function createGridLines(): void {
  const material = new THREE.LineBasicMaterial({
    color: COLORS.gridLine,
    transparent: true,
    opacity: 0.15
  });

  // Create grid lines
  for (let i = 0; i <= WORLD_SIZE; i++) {
    // X-axis lines
    const xPoints = [
      new THREE.Vector3(0, 0.01, i),
      new THREE.Vector3(WORLD_SIZE, 0.01, i)
    ];
    const xGeometry = new THREE.BufferGeometry().setFromPoints(xPoints);
    const xLine = new THREE.Line(xGeometry, material);
    scene.add(xLine);

    // Z-axis lines
    const zPoints = [
      new THREE.Vector3(i, 0.01, 0),
      new THREE.Vector3(i, 0.01, WORLD_SIZE)
    ];
    const zGeometry = new THREE.BufferGeometry().setFromPoints(zPoints);
    const zLine = new THREE.Line(zGeometry, material);
    scene.add(zLine);
  }
}

function createHighlight(): THREE.LineLoop {
  const points = [
    new THREE.Vector3(0, 0.02, 0),
    new THREE.Vector3(1, 0.02, 0),
    new THREE.Vector3(1, 0.02, 1),
    new THREE.Vector3(0, 0.02, 1)
  ];

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: COLORS.highlight,
    linewidth: 2
  });

  const highlight = new THREE.LineLoop(geometry, material);
  scene.add(highlight);

  return highlight;
}

function createTreeMesh(variant: number): THREE.Group {
  const group = new THREE.Group();

  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 0.8, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: variant === 0 ? COLORS.trunk : variant === 1 ? 0x6d4c41 : COLORS.trunkDark,
    roughness: 0.9
  });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.4;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Roots (3 small cylinders)
  for (let i = 0; i < 3; i++) {
    const rootGeometry = new THREE.CylinderGeometry(0.04, 0.07, 0.25, 6);
    const root = new THREE.Mesh(rootGeometry, trunkMaterial);
    const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.5;
    root.position.set(
      Math.cos(angle) * 0.15,
      0.08,
      Math.sin(angle) * 0.15
    );
    root.rotation.z = Math.cos(angle) * 0.4;
    root.rotation.x = Math.sin(angle) * 0.4;
    root.castShadow = true;
    group.add(root);
  }

  // Foliage layers (4 cones stacked)
  const foliageColors = [
    COLORS.leaves[0],
    COLORS.leaves[1],
    COLORS.leaves[2],
    COLORS.leaves[3]
  ];

  const layerParams = [
    { radius: 0.7, height: 0.9, y: 1.0 },
    { radius: 0.55, height: 0.75, y: 1.6 },
    { radius: 0.4, height: 0.6, y: 2.1 },
    { radius: 0.25, height: 0.5, y: 2.5 }
  ];

  layerParams.forEach((params, i) => {
    const coneGeometry = new THREE.ConeGeometry(params.radius, params.height, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
      color: foliageColors[i],
      roughness: 0.8
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.y = params.y;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
  });

  // Random rotation and slight scale variation
  group.rotation.y = Math.random() * Math.PI * 2;
  const scale = 0.9 + Math.random() * 0.2;
  group.scale.set(scale, scale, scale);

  return group;
}

function createRockMesh(variant: number): THREE.Group {
  const group = new THREE.Group();

  const isMossy = variant === 1;
  const mainColor = isMossy ? COLORS.rockMoss : COLORS.rock;

  // Main rock
  const mainGeometry = new THREE.DodecahedronGeometry(0.35, 0);
  const mainMaterial = new THREE.MeshStandardMaterial({
    color: mainColor,
    roughness: 0.9,
    flatShading: true
  });
  const mainRock = new THREE.Mesh(mainGeometry, mainMaterial);
  mainRock.scale.set(1, 0.6, 1);
  mainRock.position.y = 0.15;
  mainRock.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );
  mainRock.castShadow = true;
  mainRock.receiveShadow = true;
  group.add(mainRock);

  // Secondary smaller rocks
  for (let i = 0; i < 2; i++) {
    const smallGeometry = new THREE.DodecahedronGeometry(0.12, 0);
    const smallMaterial = new THREE.MeshStandardMaterial({
      color: isMossy ? 0x558b2f : COLORS.rockDark,
      roughness: 0.95,
      flatShading: true
    });
    const smallRock = new THREE.Mesh(smallGeometry, smallMaterial);
    const angle = (i / 2) * Math.PI + Math.random();
    smallRock.position.set(
      Math.cos(angle) * 0.3,
      0.06,
      Math.sin(angle) * 0.3
    );
    smallRock.rotation.set(Math.random(), Math.random(), Math.random());
    smallRock.castShadow = true;
    group.add(smallRock);
  }

  return group;
}

function createFlowerMesh(variant: number): THREE.Group {
  const group = new THREE.Group();

  const flowerColor = COLORS.flowerColors[variant];

  // Stem
  const stemGeometry = new THREE.CylinderGeometry(0.02, 0.025, 0.35, 6);
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.stem,
    roughness: 0.8
  });
  const stem = new THREE.Mesh(stemGeometry, stemMaterial);
  stem.position.y = 0.175;
  stem.castShadow = true;
  group.add(stem);

  // Petals (5-6 arranged in circle)
  const petalCount = 5 + Math.floor(Math.random() * 2);
  const petalGeometry = new THREE.SphereGeometry(0.08, 8, 4);
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: flowerColor,
    roughness: 0.6
  });

  for (let i = 0; i < petalCount; i++) {
    const petal = new THREE.Mesh(petalGeometry, petalMaterial);
    petal.scale.set(1, 0.3, 0.6);
    const angle = (i / petalCount) * Math.PI * 2;
    petal.position.set(
      Math.cos(angle) * 0.08,
      0.38,
      Math.sin(angle) * 0.08
    );
    petal.rotation.z = -Math.cos(angle) * 0.5;
    petal.rotation.x = Math.sin(angle) * 0.5;
    petal.castShadow = true;
    group.add(petal);
  }

  // Center (stamen)
  const centerGeometry = new THREE.SphereGeometry(0.05, 8, 8);
  const centerMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.flowerCenter,
    roughness: 0.5
  });
  const center = new THREE.Mesh(centerGeometry, centerMaterial);
  center.position.y = 0.38;
  group.add(center);

  // Leaves on stem
  const leafGeometry = new THREE.SphereGeometry(0.06, 6, 4);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.stem,
    roughness: 0.7
  });
  for (let i = 0; i < 2; i++) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.scale.set(1, 0.2, 0.5);
    leaf.position.set(
      (i === 0 ? 1 : -1) * 0.06,
      0.1 + i * 0.08,
      0
    );
    leaf.rotation.z = (i === 0 ? -1 : 1) * 0.8;
    group.add(leaf);
  }

  return group;
}

function createPlayerMesh(): THREE.Group {
  const group = new THREE.Group();

  // Body/Torso
  const torsoGeometry = new THREE.BoxGeometry(0.35, 0.4, 0.2);
  const torsoMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.shirt,
    roughness: 0.7
  });
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  torso.position.y = 0.55;
  torso.castShadow = true;
  group.add(torso);

  // Head
  const headGeometry = new THREE.SphereGeometry(0.18, 16, 16);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.skin,
    roughness: 0.6
  });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 0.95;
  head.castShadow = true;
  group.add(head);

  // Hat
  const hatBrimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.03, 16);
  const hatMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.hat,
    roughness: 0.8
  });
  const hatBrim = new THREE.Mesh(hatBrimGeometry, hatMaterial);
  hatBrim.position.y = 1.08;
  hatBrim.castShadow = true;
  group.add(hatBrim);

  const hatTopGeometry = new THREE.ConeGeometry(0.18, 0.35, 16);
  const hatTop = new THREE.Mesh(hatTopGeometry, hatMaterial);
  hatTop.position.y = 1.28;
  hatTop.castShadow = true;
  group.add(hatTop);

  // Eyes
  const eyeGeometry = new THREE.SphereGeometry(0.035, 8, 8);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.06, 0.97, 0.15);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.06, 0.97, 0.15);
  group.add(rightEye);

  // Eye highlights
  const highlightGeometry = new THREE.SphereGeometry(0.015, 6, 6);
  const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
  leftHighlight.position.set(-0.055, 0.98, 0.175);
  group.add(leftHighlight);

  const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
  rightHighlight.position.set(0.065, 0.98, 0.175);
  group.add(rightHighlight);

  // Arms
  const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8);
  const armMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.skin,
    roughness: 0.6
  });

  const leftArm = new THREE.Mesh(armGeometry, armMaterial);
  leftArm.position.set(-0.25, 0.55, 0);
  leftArm.rotation.z = 0.2;
  leftArm.castShadow = true;
  leftArm.name = 'leftArm';
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeometry, armMaterial);
  rightArm.position.set(0.25, 0.55, 0);
  rightArm.rotation.z = -0.2;
  rightArm.castShadow = true;
  rightArm.name = 'rightArm';
  group.add(rightArm);

  // Legs
  const legGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8);
  const legMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.pants,
    roughness: 0.8
  });

  const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
  leftLeg.position.set(-0.1, 0.2, 0);
  leftLeg.castShadow = true;
  leftLeg.name = 'leftLeg';
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
  rightLeg.position.set(0.1, 0.2, 0);
  rightLeg.castShadow = true;
  rightLeg.name = 'rightLeg';
  group.add(rightLeg);

  // Feet
  const footGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.15);
  const footMaterial = new THREE.MeshStandardMaterial({
    color: 0x3e2723,
    roughness: 0.9
  });

  const leftFoot = new THREE.Mesh(footGeometry, footMaterial);
  leftFoot.position.set(-0.1, 0.025, 0.02);
  leftFoot.castShadow = true;
  group.add(leftFoot);

  const rightFoot = new THREE.Mesh(footGeometry, footMaterial);
  rightFoot.position.set(0.1, 0.025, 0.02);
  rightFoot.castShadow = true;
  group.add(rightFoot);

  return group;
}

// ============================================================================
// WORLD GENERATION
// ============================================================================

function createTile(x: number, y: number): Tile {
  const distFromCenter = Math.sqrt((x - WORLD_SIZE / 2) ** 2 + (y - WORLD_SIZE / 2) ** 2);
  const distFromEdge = Math.min(x, y, WORLD_SIZE - 1 - x, WORLD_SIZE - 1 - y);

  let type: 'grass' | 'water' | 'path' = 'grass';

  if (distFromCenter < 3) {
    type = 'water';
  } else if (Math.random() < 0.05 && distFromEdge > 1) {
    type = 'path';
  }

  const mesh = createTileMesh(type, x, y);
  scene.add(mesh);

  let waterMesh: THREE.Mesh | undefined;
  if (type === 'water') {
    waterMesh = createWaterSurface(x, y);
    scene.add(waterMesh);
    waterTiles.push(waterMesh);
  }

  let decoration: Decoration | null = null;

  if (type === 'grass' && distFromEdge > 0) {
    const rand = Math.random();
    const offsetX = (Math.random() - 0.5) * 0.6;
    const offsetY = (Math.random() - 0.5) * 0.6;

    if (rand < 0.30) {
      const variant = Math.floor(Math.random() * 3);
      const treeMesh = createTreeMesh(variant);
      treeMesh.position.set(x + 0.5 + offsetX, 0, y + 0.5 + offsetY);
      scene.add(treeMesh);
      decoration = {
        type: 'tree',
        variant,
        offsetX,
        offsetY,
        health: 100,
        mesh: treeMesh,
        state: 'healthy'
      };
    } else if (rand < 0.35) {
      const variant = Math.floor(Math.random() * 2);
      const rockMesh = createRockMesh(variant);
      rockMesh.position.set(x + 0.5 + offsetX, 0, y + 0.5 + offsetY);
      scene.add(rockMesh);
      decoration = {
        type: 'rock',
        variant,
        offsetX,
        offsetY,
        mesh: rockMesh
      };
    } else if (rand < 0.45) {
      const variant = Math.floor(Math.random() * 4);
      const flowerMesh = createFlowerMesh(variant);
      flowerMesh.position.set(x + 0.5 + offsetX, 0, y + 0.5 + offsetY);
      scene.add(flowerMesh);
      flowerMeshes.push(flowerMesh);
      decoration = {
        type: 'flower',
        variant,
        offsetX,
        offsetY,
        mesh: flowerMesh
      };
    }
  }

  return { x, y, type, decoration, mesh, waterMesh };
}

function generateWorld(): void {
  world = [];
  for (let x = 0; x < WORLD_SIZE; x++) {
    world[x] = [];
    for (let y = 0; y < WORLD_SIZE; y++) {
      world[x][y] = createTile(x, y);
    }
  }

  createGridLines();
}

function getSpawnPosition(): { x: number; y: number } {
  const validPositions: { x: number; y: number }[] = [];

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_SIZE; y++) {
      const tile = world[x][y];
      if (tile.type !== 'water' && (!tile.decoration || (tile.decoration.type !== 'tree' && tile.decoration.type !== 'rock'))) {
        validPositions.push({ x, y });
      }
    }
  }

  if (validPositions.length > 0) {
    const randomIndex = Math.floor(Math.random() * validPositions.length);
    return validPositions[randomIndex];
  }

  return { x: Math.floor(WORLD_SIZE / 2), y: Math.floor(WORLD_SIZE / 2) };
}

function createPlayer(x: number, y: number): Player {
  const mesh = createPlayerMesh();
  mesh.position.set(x + 0.5, 0, y + 0.5);
  scene.add(mesh);

  return {
    x,
    y,
    targetX: x,
    targetY: y,
    direction: 0,
    isMoving: false,
    animTime: 0,
    mesh
  };
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function createInputHandler(): InputState {
  const pressed: InputState = { up: false, down: false, left: false, right: false };

  function handleKey(e: KeyboardEvent, isPressed: boolean): void {
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': pressed.up = isPressed; e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': pressed.down = isPressed; e.preventDefault(); break;
      case 'ArrowLeft': case 'KeyA': pressed.left = isPressed; e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': pressed.right = isPressed; e.preventDefault(); break;
    }
  }

  window.addEventListener('keydown', (e: KeyboardEvent) => handleKey(e, true));
  window.addEventListener('keyup', (e: KeyboardEvent) => handleKey(e, false));

  return pressed;
}

// ============================================================================
// GAME LOGIC
// ============================================================================

function isWalkable(x: number, y: number): boolean {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  if (tileX < 0 || tileX >= world.length || tileY < 0 || tileY >= world[0].length) return false;
  const tile = world[tileX][tileY];
  if (tile.type === 'water') return false;
  if (!tile.decoration) return true;
  if (tile.decoration.type === 'rock') return false;
  if (tile.decoration.type === 'tree') {
    return (tile.decoration.health ?? 100) <= 0;
  }
  return true;
}

function damageTree(x: number, y: number): boolean {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  if (tileX < 0 || tileX >= world.length || tileY < 0 || tileY >= world[0].length) return false;
  const tile = world[tileX][tileY];
  if (tile.decoration && tile.decoration.type === 'tree' && (tile.decoration.health ?? 100) > 0) {
    tile.decoration.health = (tile.decoration.health ?? 100) - 34;
    if (tile.decoration.health <= 0) {
      // Start falling animation
      tile.decoration.state = 'falling';
      tile.decoration.fallAngle = 0;
      
      // Calculate fall direction (away from player)
      const dx = tile.x + 0.5 - player.x;
      const dy = tile.y + 0.5 - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      tile.decoration.fallDirection = new THREE.Vector3(dx / dist, 0, dy / dist);
      tile.decoration.opacity = 1;
      
      fallingTrees.push(tile.decoration);
      return true;
    }
    return false;
  }
  return false;
}

function updatePlayer(deltaTime: number): void {
  const dt = deltaTime / 1000;

  if (isMoving) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.01) {
      player.x = player.targetX;
      player.y = player.targetY;
      isMoving = false;
      player.isMoving = false;
    } else {
      const step = Math.min(MOVE_SPEED * dt, dist);
      player.x += (dx / dist) * step;
      player.y += (dy / dist) * step;
      player.direction = Math.atan2(dy, dx);
      player.animTime += deltaTime * 0.01;
      player.isMoving = true;
    }
  } else {
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const targetX = Math.round(player.x) + dx;
      const targetY = Math.round(player.y) + dy;

      // Always face the direction we're trying to move
      player.direction = Math.atan2(dy, dx);

      if (isWalkable(targetX, targetY)) {
        player.targetX = targetX;
        player.targetY = targetY;
        isMoving = true;
      } else {
        // Blocked - face the obstacle
        if (chopCooldown <= 0) {
          const tileX = Math.floor(targetX);
          const tileY = Math.floor(targetY);
          if (tileX >= 0 && tileX < world.length && tileY >= 0 && tileY < world[0].length) {
            const tile = world[tileX][tileY];
            if (tile.decoration && tile.decoration.type === 'tree') {
              damageTree(targetX, targetY);
              chopCooldown = 300;
            }
          }
        }
      }
    }
  }

  // Update player mesh position
  const bobOffset = player.isMoving ? Math.sin(player.animTime * 10) * 0.05 : 0;
  player.mesh.position.set(player.x + 0.5, bobOffset, player.y + 0.5);

  // Update player rotation to face movement direction (or attempted direction when blocked)
  // Convert direction to face the movement direction
  // In our coordinate system: +X is right, +Z is down
  player.mesh.rotation.y = -player.direction + Math.PI / 2;

  // Animate arms and legs when moving
  const leftArm = player.mesh.getObjectByName('leftArm') as THREE.Mesh;
  const rightArm = player.mesh.getObjectByName('rightArm') as THREE.Mesh;
  const leftLeg = player.mesh.getObjectByName('leftLeg') as THREE.Mesh;
  const rightLeg = player.mesh.getObjectByName('rightLeg') as THREE.Mesh;

  if (player.isMoving && leftArm && rightArm && leftLeg && rightLeg) {
    const swing = Math.sin(player.animTime * 10) * 0.3;
    leftArm.rotation.x = swing;
    rightArm.rotation.x = -swing;
    leftLeg.rotation.x = -swing;
    rightLeg.rotation.x = swing;
  } else if (leftArm && rightArm && leftLeg && rightLeg) {
    leftArm.rotation.x = 0;
    rightArm.rotation.x = 0;
    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
  }

  // Update highlight position
  const highlightX = isMoving ? player.targetX : Math.floor(player.x);
  const highlightY = isMoving ? player.targetY : Math.floor(player.y);
  highlightMesh.position.set(highlightX, 0.02, highlightY);
}

function updateFallingTrees(deltaTime: number): void {
  const dt = deltaTime / 1000;

  for (let i = fallingTrees.length - 1; i >= 0; i--) {
    const tree = fallingTrees[i];

    if (tree.state === 'falling') {
      // Increase fall angle
      tree.fallAngle = (tree.fallAngle ?? 0) + dt * 2.5;

      if (tree.fallAngle >= Math.PI / 2) {
        tree.fallAngle = Math.PI / 2;
        tree.state = 'fading';
      }

      // Apply rotation around the fall direction
      const dir = tree.fallDirection!;
      // Rotate around the axis perpendicular to fall direction (cross product with Y-up)
      // This makes the tree tip over in the direction away from the player
      const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
      tree.mesh.setRotationFromAxisAngle(axis, tree.fallAngle);
      
      // Also translate the tree slightly in the fall direction as it falls
      // This makes the base stay roughly in place while the top falls away
      const fallOffset = Math.sin(tree.fallAngle) * 1.2; // Tree height offset
      const baseX = tree.mesh.userData.baseX ?? tree.mesh.position.x;
      const baseZ = tree.mesh.userData.baseZ ?? tree.mesh.position.z;
      
      // Store original position on first frame
      if (tree.mesh.userData.baseX === undefined) {
        tree.mesh.userData.baseX = tree.mesh.position.x;
        tree.mesh.userData.baseZ = tree.mesh.position.z;
      }
      
      tree.mesh.position.x = baseX + dir.x * fallOffset * 0.3;
      tree.mesh.position.z = baseZ + dir.z * fallOffset * 0.3;
    } else if (tree.state === 'fading') {
      // Fade out
      tree.opacity = (tree.opacity ?? 1) - dt * 2;

      if (tree.opacity <= 0) {
        // Remove tree completely
        scene.remove(tree.mesh);
        fallingTrees.splice(i, 1);

        // Clear the decoration from the tile
        for (let x = 0; x < WORLD_SIZE; x++) {
          for (let y = 0; y < WORLD_SIZE; y++) {
            if (world[x][y].decoration === tree) {
              world[x][y].decoration = null;
              break;
            }
          }
        }
        continue;
      }

      // Update opacity of all meshes in the tree group
      tree.mesh.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).material) {
          const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (!material.transparent) {
            material.transparent = true;
          }
          material.opacity = tree.opacity ?? 0;
        }
      });
    }
  }

  // Update tree shake for trees being chopped
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_SIZE; y++) {
      const tile = world[x][y];
      if (tile.decoration && tile.decoration.type === 'tree' && tile.decoration.state === 'healthy') {
        const health = tile.decoration.health ?? 100;
        if (health < 100 && chopCooldown > 0) {
          // Dramatic shake - intensity based on damage
          const intensity = (100 - health) / 100 * 0.2;
          const shake = Math.sin(Date.now() / 30) * intensity;
          tile.decoration.mesh.rotation.z = shake;
          tile.decoration.mesh.rotation.x = Math.cos(Date.now() / 25) * intensity * 0.5;
        } else {
          tile.decoration.mesh.rotation.z = 0;
          tile.decoration.mesh.rotation.x = 0;
        }
      }
    }
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function animateWater(time: number): void {
  waterTiles.forEach((mesh) => {
    const geometry = mesh.geometry as THREE.PlaneGeometry;
    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = Math.sin(time * 0.002 + x * 3 + y * 3) * 0.03 +
                Math.sin(time * 0.003 + x * 2 - y * 2) * 0.02;
      positions.setZ(i, z);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  });
}

function animateFlowers(time: number): void {
  flowerMeshes.forEach((flower, index) => {
    const sway = Math.sin(time * 0.002 + index * 1.5) * 0.1;
    flower.rotation.z = sway;
    flower.rotation.x = Math.cos(time * 0.0015 + index) * 0.05;
  });
}

// ============================================================================
// PARTICLES
// ============================================================================

function initParticles(): void {
  particles = [];
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      z: Math.random() * 5 + 1,
      vx: (Math.random() - 0.5) * 0.001,
      vy: (Math.random() - 0.5) * 0.001,
      life: Math.random()
    });
  }

  const positions = new Float32Array(particles.length * 3);
  particles.forEach((p, i) => {
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.z;
    positions[i * 3 + 2] = p.y;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  });

  particlesMesh = new THREE.Points(geometry, material);
  scene.add(particlesMesh);
}

function updateParticles(deltaTime: number): void {
  const positions = particlesMesh.geometry.attributes.position as THREE.BufferAttribute;

  particles.forEach((p, i) => {
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= 0.0003 * deltaTime;

    if (p.life <= 0) {
      p.x = Math.random() * WORLD_SIZE;
      p.y = Math.random() * WORLD_SIZE;
      p.z = Math.random() * 5 + 1;
      p.life = 1;
    }

    positions.setXYZ(i, p.x, p.z, p.y);
  });

  positions.needsUpdate = true;
}

// ============================================================================
// GAME LOOP
// ============================================================================

function update(deltaTime: number): void {
  if (chopCooldown > 0) {
    chopCooldown -= deltaTime;
  }
  updatePlayer(deltaTime);
  updateFallingTrees(deltaTime);
  updateParticles(deltaTime);
}

function render(time: number): void {
  animateWater(time);
  animateFlowers(time);

  updateOrbitControls();
  renderer.render(scene, camera);

  // Update FPS display
  if (fpsElement) {
    fpsElement.textContent = `FPS: ${Math.round(fps)}`;
  }
}

function gameLoop(currentTime: number): void {
  const deltaTime = Math.min(currentTime - lastTime, 50);
  fps = 1000 / (currentTime - lastTime);
  lastTime = currentTime;

  update(deltaTime);
  render(currentTime);

  requestAnimationFrame(gameLoop);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(): void {
  // Create FPS display element
  fpsElement = document.createElement('div');
  fpsElement.style.position = 'absolute';
  fpsElement.style.top = '36px';
  fpsElement.style.left = '16px';
  fpsElement.style.color = '#fff';
  fpsElement.style.fontFamily = 'monospace';
  fpsElement.style.fontSize = '14px';
  fpsElement.style.textShadow = '2px 2px 0 #000';
  fpsElement.style.pointerEvents = 'none';
  const container = document.getElementById('game-container');
  if (container) {
    container.appendChild(fpsElement);
  }

  // Initialize Three.js
  initThreeJS();

  // Generate world
  generateWorld();

  // Create highlight
  highlightMesh = createHighlight();

  // Spawn player
  const spawnPos = getSpawnPosition();
  player = createPlayer(spawnPos.x, spawnPos.y);

  // Setup input
  input = createInputHandler();

  // Initialize particles
  initParticles();

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// Start the game
window.addEventListener('DOMContentLoaded', () => init());
if (document.readyState !== 'loading') {
  init();
}
