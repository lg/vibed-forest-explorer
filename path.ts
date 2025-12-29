// Path tile - walkable dirt path

declare const THREE: typeof import('three');

// ============================================================================
// INTERFACE
// ============================================================================

interface Path {
  type: 'path';
  mesh: THREE.Group;
  x: number;
  y: number;
  isWalkable: true;
}

// ============================================================================
// MODEL
// ============================================================================

let pathModel: THREE.Group | null = null;

async function loadPathModel(): Promise<void> {
  if (!pathModel) {
    pathModel = await loadModel('models/path.glb');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

function createPath(scene: THREE.Scene, x: number, y: number): Path {
  const mesh = pathModel!.clone();
  positionTileMesh(mesh, x, y);
  enableShadowReceive(mesh);
  scene.add(mesh);

  return { type: 'path', mesh, x, y, isWalkable: true };
}
