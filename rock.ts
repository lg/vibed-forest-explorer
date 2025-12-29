// Rock tile - not walkable

declare const THREE: typeof import('three');

// ============================================================================
// CONSTANTS
// ============================================================================

const ROCK_COLOR = 0x757575;
const ROCK_DARK = 0x616161;
const ROCK_MOSS = 0x689f38;

// ============================================================================
// INTERFACE
// ============================================================================

interface Rock {
  type: 'rock';
  mesh: THREE.Group;
  rockMesh: THREE.Group;
  x: number;
  y: number;
  isWalkable: false;
}

// ============================================================================
// MODELS
// ============================================================================

let rockGrassModel: THREE.Group | null = null;
let rockRockModel: THREE.Group | null = null;

async function loadRockModel(): Promise<void> {
  if (!rockRockModel) {
    [rockGrassModel, rockRockModel] = await Promise.all([
      loadModel('models/grass.glb'),
      loadModel('models/rock.glb')
    ]);
  }
}

// ============================================================================
// MESH CREATION
// ============================================================================

function createRockMesh(variant: number): THREE.Group {
  const rock = rockRockModel!.clone();
  const isMossy = variant === 1;
  const mainColor = isMossy ? ROCK_MOSS : ROCK_COLOR;
  const smallColor = isMossy ? 0x558b2f : ROCK_DARK;

  rock.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'main') {
      mesh.material = createStandardMaterial(mainColor, 0.9, { flatShading: true });
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
    } else if (child.name.startsWith('small_')) {
      mesh.material = createStandardMaterial(smallColor, 0.95, { flatShading: true });
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
    }
  });

  enableShadowCast(rock);
  return rock;
}

// ============================================================================
// FACTORY
// ============================================================================

function createRock(scene: THREE.Scene, x: number, y: number, variant: number): Rock {
  // Ground mesh
  const mesh = rockGrassModel!.clone();
  positionTileMesh(mesh, x, y);
  enableShadowReceive(mesh);
  scene.add(mesh);

  // Rock mesh on top
  const offsetX = (Math.random() - 0.5) * 0.6;
  const offsetY = (Math.random() - 0.5) * 0.6;
  const rockMesh = createRockMesh(variant);
  rockMesh.position.set(x + 0.5 + offsetX, 0, y + 0.5 + offsetY);
  scene.add(rockMesh);

  return { type: 'rock', mesh, rockMesh, x, y, isWalkable: false };
}
