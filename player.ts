// Player object with highlight marker

declare const THREE: typeof import('three');

// ============================================================================
// CONSTANTS
// ============================================================================

const PLAYER_SKIN_COLOR = 0xffe0bd;
const PLAYER_SHIRT_COLOR = 0x4a90d9;
const PLAYER_PANTS_COLOR = 0x5d4037;
const PLAYER_HAT_COLOR = 0xa0522d;
const PLAYER_EYE_COLOR = 0x333333;
const PLAYER_SHOE_COLOR = 0x3e2723;
const HIGHLIGHT_COLOR = 0xffeb3b;

// ============================================================================
// INTERFACES
// ============================================================================

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

interface Highlight {
  mesh: THREE.Group;
  x: number;
  y: number;
  update(playerX: number, playerY: number, isMoving: boolean, targetX: number, targetY: number, deltaTime: number): void;
}

// ============================================================================
// MODELS
// ============================================================================

var playerModel: THREE.Group | null = null;
var highlightModel: THREE.Group | null = null;

async function loadPlayerModel(): Promise<void> {
  playerModel = await loadModel('models/player.glb');
}

async function loadHighlightModel(): Promise<void> {
  highlightModel = await loadModel('models/highlight.glb');
}

// ============================================================================
// MESH CREATION
// ============================================================================

function createPlayerMesh(): THREE.Group {
  const player = playerModel!.clone();

  player.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'torso') {
      mesh.material = createStandardMaterial(PLAYER_SHIRT_COLOR, 0.7);
    } else if (child.name === 'head') {
      mesh.material = createStandardMaterial(PLAYER_SKIN_COLOR, 0.6);
    } else if (child.name === 'hatBrim' || child.name === 'hatTop') {
      mesh.material = createStandardMaterial(PLAYER_HAT_COLOR, 0.8);
    } else if (child.name === 'leftEye' || child.name === 'rightEye') {
      mesh.material = createStandardMaterial(PLAYER_EYE_COLOR);
    } else if (child.name === 'leftArm' || child.name === 'rightArm') {
      mesh.material = createStandardMaterial(PLAYER_SKIN_COLOR, 0.6);
    } else if (child.name === 'leftLeg' || child.name === 'rightLeg') {
      mesh.material = createStandardMaterial(PLAYER_PANTS_COLOR, 0.8);
    } else if (child.name === 'leftFoot' || child.name === 'rightFoot') {
      mesh.material = createStandardMaterial(PLAYER_SHOE_COLOR, 0.9);
    }
  });

  enableShadowCast(player);
  return player;
}

function createHighlightMesh(): THREE.Group {
  const highlight = highlightModel!.clone();
  highlight.position.y = 0.02;

  highlight.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = new THREE.MeshBasicMaterial({ color: HIGHLIGHT_COLOR });
    }
  });

  return highlight;
}

// ============================================================================
// FACTORY
// ============================================================================

function createPlayer(scene: THREE.Scene, x: number, y: number): Player {
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

function createHighlight(scene: THREE.Scene, x: number, y: number): Highlight {
  if (!highlightModel) {
    console.error('highlightModel is null!');
  }
  const highlight = highlightModel!.clone();
  highlight.position.y = 0.01;
  console.log('Creating highlight at', x, y, 'model:', highlight);

  highlight.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = new THREE.MeshBasicMaterial({ color: HIGHLIGHT_COLOR });
    }
  });

  scene.add(highlight);

  let currentX = x;
  let currentY = y;
  highlight.position.set(currentX, 0.01, currentY);

  return {
    mesh: highlight,
    get x() { return currentX; },
    get y() { return currentY; },

    update(playerX: number, playerY: number, isMoving: boolean, targetX: number, targetY: number, deltaTime: number) {
      const dt = deltaTime / 1000;
      const targetTileX = isMoving ? targetX : Math.floor(playerX);
      const targetTileY = isMoving ? targetY : Math.floor(playerY);

      const speed = 12;
      currentX += (targetTileX - currentX) * speed * dt;
      currentY += (targetTileY - currentY) * speed * dt;

      if (Math.abs(targetTileX - currentX) < 0.01) currentX = targetTileX;
      if (Math.abs(targetTileY - currentY) < 0.01) currentY = targetTileY;

      highlight.position.set(currentX, 0.01, currentY);
    }
  };
}
