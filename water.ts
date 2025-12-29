// Water tile - not walkable

declare const THREE: typeof import('three');

// ============================================================================
// INTERFACE
// ============================================================================

interface Water {
  type: 'water';
  mesh: THREE.Group;
  x: number;
  y: number;
  isWalkable: false;
}

// ============================================================================
// MODEL
// ============================================================================

let waterModel: THREE.Group | null = null;

async function loadWaterModel(): Promise<void> {
  if (!waterModel) {
    waterModel = await loadModel('models/water.glb');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

function createWater(scene: THREE.Scene, x: number, y: number): Water {
  const mesh = waterModel!.clone();
  positionTileMesh(mesh, x, y);
  enableShadowReceive(mesh);
  scene.add(mesh);

  return { type: 'water', mesh, x, y, isWalkable: false };
}
