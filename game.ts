// Declare Three.js global (provided by script tag in index.html)
declare const THREE: typeof import('three');

// Cached loaded models (populated by loadModels)
let modelCache: Record<string, THREE.Group> = {};

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
  shakeEndTime?: number;
}

interface Player {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  prevTileX: number;
  prevTileY: number;
  direction: number;
  targetDirection: number;
  isMoving: boolean;
  isRotating: boolean;
  animTime: number;
  mesh: THREE.Group;
}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface Cloud {
  mesh: THREE.Group;
  speed: number;
  initialX: number;
  amplitude: number;
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

let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;
const WORLD_SIZE = 20;
const TILE_SIZE = 1;
const MOVE_SPEED = 5;
const TILE_HEIGHT = 0.15;
const ROTATION_SPEED = 25; // radians per second
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// Camera angle for isometric view (45 degrees azimuth, ~35 degrees elevation)
const ISO_AZIMUTH = Math.PI / 4;
const ISO_POLAR = Math.PI / 3;
const CAMERA_DISTANCE = 25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const DEFAULT_ZOOM = 2.0;

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
let pollenParticles: PollenParticle[] = [];
let pollenSprites: THREE.Sprite[] = [];

let waterTiles: THREE.Mesh[] = [];
let flowerMeshes: THREE.Group[] = [];

interface FlowerState {
  basePhase: number;
  disturbance: number;
  disturbanceEndTime: number;
  triggeredForCurrentVisit: boolean;
}

let flowerStates: FlowerState[] = [];
let fallingTrees: Decoration[] = [];
let clouds: Cloud[] = [];

let fps = 0;
let fpsElement: HTMLElement;
let waterFrameCount = 0;

// ============================================================================
// THREE.JS SETUP
// ============================================================================

function initThreeJS(): void {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);

  // Orthographic camera for isometric view
  const aspect = canvasWidth / canvasHeight;
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
  renderer.setSize(canvasWidth, canvasHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const container = document.getElementById('game-container');
  if (container) {
    container.insertBefore(renderer.domElement, container.firstChild);
  }

  // Setup manual orbit controls
  setupOrbitControls();

  // Handle window resize
  window.addEventListener('resize', onWindowResize);

  // Lighting
  setupLighting();
}

function onWindowResize(): void {
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;

  const aspect = canvasWidth / canvasHeight;
  const frustumSize = 15 / orbitState.zoom;

  camera.left = -frustumSize * aspect;
  camera.right = frustumSize * aspect;
  camera.top = frustumSize;
  camera.bottom = -frustumSize;
  camera.updateProjectionMatrix();

  renderer.setSize(canvasWidth, canvasHeight);
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
  const aspect = canvasWidth / canvasHeight;
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
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
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
// MODEL LOADING
// ============================================================================

async function loadModels(): Promise<void> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new (GLTFLoader as any)();

  const modelNames = ['tree', 'rock', 'flower', 'player'];
  const promises = modelNames.map(name =>
    new Promise<void>((resolve, reject) => {
      loader.load(
        `models/${name}.glb`,
        (gltf: any) => {
          modelCache[name] = gltf.scene;
          resolve();
        },
        undefined,
        (error: Error) => reject(error)
      );
    })
  );
  await Promise.all(promises);
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
  const tree = modelCache['tree'].clone();

  // Apply variant-specific trunk color
  const trunkColors = [COLORS.trunk, 0x6d4c41, COLORS.trunkDark];
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: trunkColors[variant] ?? COLORS.trunk,
    roughness: 0.9
  });

  tree.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'trunk' || child.name.startsWith('root_')) {
      mesh.material = trunkMaterial;
    } else if (child.name.startsWith('foliage_')) {
      const idx = parseInt(child.name.split('_')[1]);
      mesh.material = new THREE.MeshStandardMaterial({
        color: COLORS.leaves[idx],
        roughness: 0.8
      });
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  // Random rotation and slight scale variation
  tree.rotation.y = Math.random() * Math.PI * 2;
  const scale = 0.9 + Math.random() * 0.2;
  tree.scale.set(scale, scale, scale);

  return tree;
}

function createRockMesh(variant: number): THREE.Group {
  const rock = modelCache['rock'].clone();

  const isMossy = variant === 1;
  const mainColor = isMossy ? COLORS.rockMoss : COLORS.rock;
  const smallColor = isMossy ? 0x558b2f : COLORS.rockDark;

  rock.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'main') {
      mesh.material = new THREE.MeshStandardMaterial({
        color: mainColor,
        roughness: 0.9,
        flatShading: true
      });
      // Add random rotation to main rock
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
    } else if (child.name.startsWith('small_')) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: smallColor,
        roughness: 0.95,
        flatShading: true
      });
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return rock;
}

function createFlowerMesh(variant: number): THREE.Group {
  const flower = modelCache['flower'].clone();

  const flowerColor = COLORS.flowerColors[variant];

  flower.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'stem' || child.name.startsWith('leaf_')) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: COLORS.stem,
        roughness: child.name === 'stem' ? 0.8 : 0.7
      });
    } else if (child.name.startsWith('petal_')) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: flowerColor,
        roughness: 0.6
      });
    } else if (child.name === 'center') {
      mesh.material = new THREE.MeshStandardMaterial({
        color: COLORS.flowerCenter,
        roughness: 0.5
      });
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return flower;
}

function createPlayerMesh(): THREE.Group {
  const player = modelCache['player'].clone();

  player.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'torso') {
      mesh.material = new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.7 });
    } else if (child.name === 'head') {
      mesh.material = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.6 });
    } else if (child.name === 'hatBrim' || child.name === 'hatTop') {
      mesh.material = new THREE.MeshStandardMaterial({ color: COLORS.hat, roughness: 0.8 });
    } else if (child.name === 'leftEye' || child.name === 'rightEye') {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0x333333 });
    } else if (child.name === 'leftArm' || child.name === 'rightArm') {
      mesh.material = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.6 });
    } else if (child.name === 'leftLeg' || child.name === 'rightLeg') {
      mesh.material = new THREE.MeshStandardMaterial({ color: COLORS.pants, roughness: 0.8 });
    } else if (child.name === 'leftFoot' || child.name === 'rightFoot') {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 });
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return player;
}

function createCloudMesh(): THREE.Group {
  const cloud = new THREE.Group();

  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 1,
    flatShading: true,
    transparent: true,
    opacity: 0.65
  });

  const numPuffs = 2 + Math.floor(Math.random() * 3);
  const puffPositions: { x: number; y: number; z: number; scale: number }[] = [];

  for (let i = 0; i < numPuffs; i++) {
    puffPositions.push({
      x: (Math.random() - 0.5) * 3,
      y: (Math.random() - 0.5) * 0.6,
      z: (Math.random() - 0.5) * 1.5,
      scale: 0.6 + Math.random() * 0.6
    });
  }

  puffPositions.forEach((puff) => {
    const geometry = new THREE.SphereGeometry(puff.scale, 8, 6);
    const mesh = new THREE.Mesh(geometry, cloudMaterial);
    mesh.position.set(puff.x, puff.y, puff.z);
    cloud.add(mesh);
  });

  cloud.scale.set(1.5 + Math.random() * 0.5, 0.6 + Math.random() * 0.2, 1 + Math.random() * 0.4);

  return cloud;
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
      flowerStates.push({
        basePhase: Math.random() * Math.PI * 2,
        disturbance: 0,
        disturbanceEndTime: 0,
        triggeredForCurrentVisit: false
      });
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
    prevTileX: x,
    prevTileY: y,
    direction: 0,
    targetDirection: 0,
    isMoving: false,
    isRotating: false,
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
    tile.decoration.shakeEndTime = Date.now() + 150;
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

// Helper to normalize angle to [-PI, PI]
function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Helper to get shortest angle difference
function angleDifference(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function updatePlayer(deltaTime: number): void {
  const dt = deltaTime / 1000;

  // Handle rotation first
  if (player.isRotating) {
    const diff = angleDifference(player.direction, player.targetDirection);
    const rotationStep = ROTATION_SPEED * dt;
    
    if (Math.abs(diff) < rotationStep) {
      // Rotation complete
      player.direction = player.targetDirection;
      player.isRotating = false;
      // Now start moving if we have a target
      if (player.targetX !== player.x || player.targetY !== player.y) {
        isMoving = true;
        player.isMoving = true;
      }
    } else {
      // Continue rotating
      player.direction += Math.sign(diff) * rotationStep;
      player.direction = normalizeAngle(player.direction);
    }
  } else if (isMoving) {
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
      const newDirection = Math.atan2(dy, dx);

      if (isWalkable(targetX, targetY)) {
        player.prevTileX = Math.round(player.x);
        player.prevTileY = Math.round(player.y);
        player.targetX = targetX;
        player.targetY = targetY;
        player.targetDirection = newDirection;
        
        // Check if we need to rotate first
        const diff = Math.abs(angleDifference(player.direction, newDirection));
        if (diff > 0.1) {
          // Need to rotate first
          player.isRotating = true;
        } else {
          // Already facing the right direction, start moving immediately
          player.direction = newDirection;
          isMoving = true;
          player.isMoving = true;
        }
      } else {
        // Blocked - face the obstacle (rotate towards it)
        player.targetDirection = newDirection;
        const diff = Math.abs(angleDifference(player.direction, newDirection));
        if (diff > 0.1) {
          player.isRotating = true;
        } else {
          player.direction = newDirection;
        }
        
        // Try to chop tree if facing it
        if (!player.isRotating && chopCooldown <= 0) {
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

  // Update player rotation to face movement direction
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
  const now = Date.now();

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
        const isShaking = tile.decoration.shakeEndTime !== undefined && now < tile.decoration.shakeEndTime;
        if (health < 100 && isShaking) {
          const intensity = (100 - health) / 100 * 0.2;
          const shake = Math.sin(now / 30) * intensity;
          tile.decoration.mesh.rotation.z = shake;
          tile.decoration.mesh.rotation.x = Math.cos(now / 25) * intensity * 0.5;
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
  waterFrameCount++;
  if (waterFrameCount % 2 !== 0) return;

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
  const playerTileX = Math.round(player.x);
  const playerTileY = Math.round(player.y);
  const now = Date.now();

  flowerMeshes.forEach((flower, index) => {
    const state = flowerStates[index];
    const flowerTileX = Math.round(flower.position.x - 0.5);
    const flowerTileY = Math.round(flower.position.z - 0.5);

    const isOnTile = playerTileX === flowerTileX && playerTileY === flowerTileY;
    const justEnteredTile = isOnTile && (player.prevTileX !== flowerTileX || player.prevTileY !== flowerTileY) && !isMoving;

    if (justEnteredTile && !state.triggeredForCurrentVisit) {
      state.disturbance = 0.2;
      state.disturbanceEndTime = now + 250;
      state.triggeredForCurrentVisit = true;
    }

    if (!isOnTile) {
      state.triggeredForCurrentVisit = false;
    }

    if (now > state.disturbanceEndTime) {
      state.disturbance *= 0.95;
    }

    const baseSway = Math.sin(time * 0.003 + state.basePhase) * 0.08;
    const disturbanceSway = Math.sin(time * 0.015 + state.basePhase) * state.disturbance;

    flower.rotation.x = baseSway + disturbanceSway;
    flower.rotation.z = baseSway * 0.5 + disturbanceSway * 0.5;
  });
}

function animateClouds(time: number): void {
  clouds.forEach((cloud) => {
    const offset = Math.sin(time * 0.001 * cloud.speed) * cloud.amplitude;
    cloud.mesh.position.x = cloud.initialX + offset;
  });
}

// ============================================================================
// PARTICLES
// ============================================================================

const POLLEN_COLORS = [0xfffacd, 0xfff8dc, 0xfffaf0, 0xfffff0, 0xfff5ee, 0xfff, 0xfffdd0];
const POLLEN_COUNT = 100;

function createPollenParticle(): PollenParticle {
  const color = POLLEN_COLORS[Math.floor(Math.random() * POLLEN_COLORS.length)];
  return {
    x: Math.random() * WORLD_SIZE,
    y: Math.random() * WORLD_SIZE,
    z: Math.random() * 3 + 0.5,
    vx: (Math.random() - 0.5) * 0.002,
    vy: (Math.random() - 0.5) * 0.002,
    vz: Math.random() * 0.001 + 0.0005,
    life: Math.random(),
    maxLife: 3 + Math.random() * 4,
    color,
    size: 0.3 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2
  };
}

function initParticles(): void {
  pollenParticles = [];
  pollenSprites = [];

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);

  for (let i = 0; i < POLLEN_COUNT; i++) {
    const particle = createPollenParticle();
    pollenParticles.push(particle);

    const material = new THREE.SpriteMaterial({
      map: texture,
      color: particle.color,
      transparent: true,
      opacity: 0.2 + Math.random() * 0.7,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.set(particle.x, particle.z, particle.y);
    sprite.scale.set(0.03, 0.03, 1.0);

    scene.add(sprite);
    pollenSprites.push(sprite);
  }
}

function updateParticles(deltaTime: number, time: number): void {
  pollenParticles.forEach((p, i) => {
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.z += p.vz * deltaTime + Math.sin(time * 0.001 + p.phase) * 0.0005;
    p.life += deltaTime * 0.001;

    if (p.life >= p.maxLife) {
      const newP = createPollenParticle();
      p.x = newP.x;
      p.y = newP.y;
      p.z = newP.z;
      p.vx = newP.vx;
      p.vy = newP.vy;
      p.vz = newP.vz;
      p.life = 0;
    }

    pollenSprites[i].position.set(p.x, p.z, p.y);
  });
}

function initClouds(): void {
  const cloudCount = 4 + Math.floor(Math.random() * 4);

  for (let i = 0; i < cloudCount; i++) {
    const cloud = createCloudMesh();
    const x = Math.random() * WORLD_SIZE * 1.5 - WORLD_SIZE * 0.25;
    const z = Math.random() * WORLD_SIZE;
    cloud.position.set(x, 2 + Math.random() * 2.5, z);

    scene.add(cloud);

    clouds.push({
      mesh: cloud,
      speed: 0.3 + Math.random() * 0.4,
      initialX: x,
      amplitude: 1 + Math.random() * 2
    });
  }
}

// ============================================================================
// GAME LOOP
// ============================================================================

function update(deltaTime: number, time: number): void {
  if (chopCooldown > 0) {
    chopCooldown -= deltaTime;
  }
  updatePlayer(deltaTime);
  updateFallingTrees(deltaTime);
  updateParticles(deltaTime, time);
}

function render(time: number): void {
  animateWater(time);
  animateFlowers(time);
  animateClouds(time);

  updateOrbitControls();
  renderer.render(scene, camera);

  // Update FPS display
  if (fpsElement) {
    fpsElement.textContent = `FPS: ${Math.round(fps)}`;
  }
}

function gameLoop(currentTime: number): void {
  requestAnimationFrame(gameLoop);

  const elapsed = currentTime - lastTime;
  if (elapsed < FRAME_INTERVAL) return;

  const deltaTime = Math.min(elapsed, 50);
  fps = 1000 / elapsed;
  lastTime = currentTime - (elapsed % FRAME_INTERVAL);

  update(deltaTime, currentTime);
  render(currentTime);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init(): Promise<void> {
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

  // Load models first
  await loadModels();

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

  // Initialize clouds
  initClouds();

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// Start the game
window.addEventListener('DOMContentLoaded', () => init());
if (document.readyState !== 'loading') {
  init();
}
