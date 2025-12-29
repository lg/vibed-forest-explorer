// Main game file - GameState, renderer, player logic, game loop

declare const THREE: typeof import('three');

// ============================================================================
// HIGHLIGHT MODEL (loaded here so it's in same scope as usage)
// ============================================================================

let gameHighlightModel: THREE.Group | null = null;

async function loadGameHighlightModel(): Promise<void> {
  gameHighlightModel = await loadModel('models/highlight.glb');
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MOVE_SPEED = 5;
const ROTATION_SPEED = 25;
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

const ISO_AZIMUTH = Math.PI / 4;
const ISO_POLAR = Math.PI / 3;
const CAMERA_DISTANCE = 25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const DEFAULT_ZOOM = 2.0;

// ============================================================================
// INTERFACES
// ============================================================================

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

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
// GAME STATE SINGLETON
// ============================================================================

const GameState = {
  scene: null as THREE.Scene | null,
  camera: null as THREE.OrthographicCamera | null,
  renderer: null as THREE.WebGLRenderer | null,
  orbitState: null as OrbitState | null,

  world: [] as Tile[][],
  player: null as Player | null,
  highlightMesh: null as THREE.Group | null,
  highlightCurrentX: 0,
  highlightCurrentY: 0,
  input: null as InputState | null,

  flowers: [] as Flower[],
  trees: [] as Tree[],
  clouds: [] as Cloud[],

  pollenParticles: [] as PollenParticle[],
  pollenSprites: [] as THREE.Sprite[],

  canvasWidth: window.innerWidth,
  canvasHeight: window.innerHeight,
  lastTime: 0,
  fps: 0,
  fpsElement: null as HTMLElement | null,

  isMoving: false,
  chopCooldown: 0
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

function createOrbitState(): OrbitState {
  return {
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
}

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
// RENDERER SETUP
// ============================================================================

function updateCameraPosition(): void {
  const { camera, orbitState } = GameState;
  if (!camera || !orbitState) return;

  const x = CAMERA_DISTANCE * Math.sin(orbitState.polar) * Math.sin(orbitState.azimuth);
  const y = CAMERA_DISTANCE * Math.cos(orbitState.polar);
  const z = CAMERA_DISTANCE * Math.sin(orbitState.polar) * Math.cos(orbitState.azimuth);
  camera.position.set(x + WORLD_SIZE / 2, y, z + WORLD_SIZE / 2);
  camera.lookAt(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
}

function setupOrbitControls(): void {
  const { renderer, orbitState } = GameState;
  if (!renderer || !orbitState) return;

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
    orbitState.targetPolar = Math.max(0.2, Math.min(Math.PI / 2 - 0.1, orbitState.targetPolar));
    orbitState.previousMouseX = e.clientX;
    orbitState.previousMouseY = e.clientY;
  });

  canvas.addEventListener('mouseup', () => orbitState.isDragging = false);
  canvas.addEventListener('mouseleave', () => orbitState.isDragging = false);

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

  canvas.addEventListener('touchend', () => orbitState.isDragging = false);

  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.001;
    orbitState.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, orbitState.targetZoom + zoomDelta));
  }, { passive: false });
}

function updateOrbitControls(): void {
  const { camera, orbitState, canvasWidth, canvasHeight } = GameState;
  if (!camera || !orbitState) return;

  const damping = 0.1;
  orbitState.azimuth += (orbitState.targetAzimuth - orbitState.azimuth) * damping;
  orbitState.polar += (orbitState.targetPolar - orbitState.polar) * damping;
  orbitState.zoom += (orbitState.targetZoom - orbitState.zoom) * damping;

  const aspect = canvasWidth / canvasHeight;
  const frustumSize = 15 / orbitState.zoom;
  camera.left = -frustumSize * aspect;
  camera.right = frustumSize * aspect;
  camera.top = frustumSize;
  camera.bottom = -frustumSize;
  camera.updateProjectionMatrix();

  updateCameraPosition();
}

function setupLighting(scene: THREE.Scene): void {
  const ambientLight = new THREE.AmbientLight(0xb4d4ff, 0.5);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.3);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
  dirLight.position.set(15, 25, 15);
  dirLight.castShadow = true;
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

function onWindowResize(): void {
  const { camera, renderer, orbitState } = GameState;
  if (!camera || !renderer || !orbitState) return;

  GameState.canvasWidth = window.innerWidth;
  GameState.canvasHeight = window.innerHeight;

  const aspect = GameState.canvasWidth / GameState.canvasHeight;
  const frustumSize = 15 / orbitState.zoom;

  camera.left = -frustumSize * aspect;
  camera.right = frustumSize * aspect;
  camera.top = frustumSize;
  camera.bottom = -frustumSize;
  camera.updateProjectionMatrix();

  renderer.setSize(GameState.canvasWidth, GameState.canvasHeight);
}

function initThreeJS(): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);

  const aspect = GameState.canvasWidth / GameState.canvasHeight;
  const frustumSize = 15;
  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect,
    frustumSize * aspect,
    frustumSize,
    -frustumSize,
    0.1,
    1000
  );

  const orbitState = createOrbitState();

  GameState.scene = scene;
  GameState.camera = camera;
  GameState.orbitState = orbitState;

  updateCameraPosition();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(GameState.canvasWidth, GameState.canvasHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  GameState.renderer = renderer;

  const container = document.getElementById('game-container');
  if (container) {
    container.insertBefore(renderer.domElement, container.firstChild);
  }

  setupOrbitControls();
  window.addEventListener('resize', onWindowResize);
  setupLighting(scene);
}

// ============================================================================
// PLAYER LOGIC
// ============================================================================

function updatePlayer(deltaTime: number): void {
  const { player, input, world } = GameState;
  if (!player || !input) return;

  const dt = deltaTime / 1000;

  if (player.isRotating) {
    const diff = angleDifference(player.direction, player.targetDirection);
    const step = ROTATION_SPEED * dt;

    if (Math.abs(diff) < step) {
      player.direction = player.targetDirection;
      player.isRotating = false;
      if (player.targetX !== player.x || player.targetY !== player.y) {
        GameState.isMoving = true;
        player.isMoving = true;
      }
    } else {
      player.direction += Math.sign(diff) * step;
      player.direction = normalizeAngle(player.direction);
    }

  } else if (GameState.isMoving) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.01) {
      player.x = player.targetX;
      player.y = player.targetY;
      GameState.isMoving = false;
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
      const tileX = Math.floor(targetX);
      const tileY = Math.floor(targetY);

      if (tileX >= 0 && tileX < WORLD_SIZE && tileY >= 0 && tileY < WORLD_SIZE) {
        const tile = world[tileX][tileY];

        if (tile.isWalkable) {
          player.prevTileX = Math.round(player.x);
          player.prevTileY = Math.round(player.y);
          player.targetX = targetX;
          player.targetY = targetY;
          player.targetDirection = Math.atan2(dy, dx);

          const diff = Math.abs(angleDifference(player.direction, player.targetDirection));
          if (diff > 0.1) {
            player.isRotating = true;
          } else {
            player.direction = player.targetDirection;
            GameState.isMoving = true;
            player.isMoving = true;
          }
        } else {
          player.targetDirection = Math.atan2(dy, dx);
          const diff = Math.abs(angleDifference(player.direction, player.targetDirection));
          if (diff > 0.1) {
            player.isRotating = true;
          } else {
            player.direction = player.targetDirection;
          }

          // Try to chop tree
          if (!player.isRotating && GameState.chopCooldown <= 0 && tile.type === 'tree') {
            const dx = tile.x + 0.5 - player.x;
            const dy = tile.y + 0.5 - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            tile.damage(new THREE.Vector3(dx / dist, 0, dy / dist));
            GameState.chopCooldown = 300;
          }
        }
      }
    }
  }

  // Update mesh position
  const bobOffset = player.isMoving ? Math.sin(player.animTime * 10) * 0.05 : 0;
  player.mesh.position.set(player.x + 0.5, bobOffset, player.y + 0.5);
  player.mesh.rotation.y = -player.direction + Math.PI / 2;

  // Animate limbs
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

  // Update highlight position with smooth transition
  const highlightTargetX = GameState.isMoving ? player.targetX : Math.floor(player.x);
  const highlightTargetY = GameState.isMoving ? player.targetY : Math.floor(player.y);
  
  const highlightSpeed = 12;
  GameState.highlightCurrentX += (highlightTargetX - GameState.highlightCurrentX) * highlightSpeed * dt;
  GameState.highlightCurrentY += (highlightTargetY - GameState.highlightCurrentY) * highlightSpeed * dt;
  
  if (Math.abs(highlightTargetX - GameState.highlightCurrentX) < 0.01) GameState.highlightCurrentX = highlightTargetX;
  if (Math.abs(highlightTargetY - GameState.highlightCurrentY) < 0.01) GameState.highlightCurrentY = highlightTargetY;
  
  if (GameState.highlightMesh) {
    GameState.highlightMesh.position.set(GameState.highlightCurrentX, 0.09, GameState.highlightCurrentY);
  }
}

function updateEntities(deltaTime: number, time: number): void {
  const { world, trees, flowers, clouds, pollenParticles, pollenSprites } = GameState;

  // Update trees (remove destroyed ones)
  trees.forEach(tree => tree.update(deltaTime));
  for (let i = trees.length - 1; i >= 0; i--) {
    if (trees[i].isDestroyed) {
      // Update the tile reference
      const tile = world[trees[i].x][trees[i].y];
      if (tile.type === 'tree') {
        // Tile stays a tree but is now walkable (isWalkable is already true)
      }
      trees.splice(i, 1);
    }
  }

  // Update flowers
  flowers.forEach(flower => flower.update(time));

  // Update clouds
  clouds.forEach(cloud => cloud.update(time));

  // Update pollen
  updatePollenParticles(pollenParticles, pollenSprites, deltaTime, time);
}

// ============================================================================
// GAME LOOP
// ============================================================================

function update(deltaTime: number, time: number): void {
  if (GameState.chopCooldown > 0) {
    GameState.chopCooldown -= deltaTime;
  }
  updatePlayer(deltaTime);
  updateEntities(deltaTime, time);
}

function render(time: number): void {
  const { scene, camera, renderer, fps, fpsElement } = GameState;
  if (!scene || !camera || !renderer) return;

  updateOrbitControls();
  renderer.render(scene, camera);

  if (fpsElement) {
    fpsElement.textContent = `FPS: ${Math.round(fps)}`;
  }
}

function gameLoop(currentTime: number): void {
  requestAnimationFrame(gameLoop);

  const elapsed = currentTime - GameState.lastTime;
  if (elapsed < FRAME_INTERVAL) return;

  const deltaTime = Math.min(elapsed, 50);
  GameState.fps = 1000 / elapsed;
  GameState.lastTime = currentTime - (elapsed % FRAME_INTERVAL);

  update(deltaTime, currentTime);
  render(currentTime);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init(): Promise<void> {
  const fpsElement = document.createElement('div');
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

  GameState.fpsElement = fpsElement;

  // Load all models in parallel
  await Promise.all([
    loadGrassModel(),
    loadWaterModel(),
    loadPathModel(),
    loadFlowerModel(),
    loadTreeModel(),
    loadRockModel(),
    loadCloudModels(),
    loadPlayerModel(),
    loadGameHighlightModel()
  ]);

  // Initialize Three.js
  initThreeJS();
  const { scene } = GameState;
  if (!scene) return;

  // Generate world
  GameState.world = generateWorld(scene);

  // Collect flowers and trees for updates
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_SIZE; y++) {
      const tile = GameState.world[x][y];
      if (tile.type === 'flower') {
        GameState.flowers.push(tile);
      } else if (tile.type === 'tree') {
        GameState.trees.push(tile);
      }
    }
  }

  // Spawn player
  const spawnPos = getSpawnPosition(GameState.world);
  GameState.player = createPlayer(scene, spawnPos.x, spawnPos.y);
  
  // Create highlight mesh (same pattern as original game.ts)
  const highlightMesh = gameHighlightModel!.clone();
  highlightMesh.position.y = 0.02;
  highlightMesh.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = new THREE.MeshBasicMaterial({ color: 0xffeb3b });
    }
  });
  scene.add(highlightMesh);
  GameState.highlightMesh = highlightMesh;
  GameState.highlightCurrentX = spawnPos.x;
  GameState.highlightCurrentY = spawnPos.y;
  highlightMesh.position.set(spawnPos.x, 0.09, spawnPos.y);

  // Setup input
  GameState.input = createInputHandler();

  // Initialize clouds
  GameState.clouds = initClouds(scene);

  // Initialize particles
  const { particles, sprites } = initParticles(scene);
  GameState.pollenParticles = particles;
  GameState.pollenSprites = sprites;

  // Start game loop
  GameState.lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// Start the game
window.addEventListener('DOMContentLoaded', () => init());
if (document.readyState !== 'loading') {
  init();
}
