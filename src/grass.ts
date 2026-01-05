// Grass tile - walkable empty ground

declare const THREE: typeof import('three');

// ============================================================================
// INTERFACE
// ============================================================================

interface Grass {
  type: 'grass';
  mesh: THREE.Group;
  x: number;
  y: number;
  isWalkable: true;
}

// ============================================================================
// MODEL
// ============================================================================

let grassModel: THREE.Group | null = null;

async function loadGrassModel(): Promise<void> {
  if (!grassModel) {
    grassModel = await loadModel('meshes/grass.glb');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

function createGrass(scene: THREE.Scene, x: number, y: number): Grass {
  const mesh = grassModel!.clone();
  positionTileMesh(mesh, x, y);
  enableShadowReceive(mesh);
  scene.add(mesh);

  return { type: 'grass', mesh, x, y, isWalkable: true };
}
