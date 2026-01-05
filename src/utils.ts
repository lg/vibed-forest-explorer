// Declare Three.js global (provided by script tag in index.html)
declare const THREE: typeof import('three');

// ============================================================================
// MODEL LOADING
// ============================================================================

async function loadModel(path: string): Promise<THREE.Group> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new (GLTFLoader as any)();

  return new Promise((resolve, reject) => {
    loader.load(path, (gltf: any) => {
      resolve(gltf.scene);
    }, undefined, reject);
  });
}

// ============================================================================
// SHADOW HELPERS
// ============================================================================

function enableShadowReceive(group: THREE.Group): void {
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.receiveShadow = true;
    }
  });
}

function enableShadowCast(group: THREE.Group): void {
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

// ============================================================================
// POSITION HELPERS
// ============================================================================

function positionTileMesh(mesh: THREE.Group, x: number, y: number, yOffset: number = 0): void {
  mesh.position.set(x + 0.5, yOffset, y + 0.5);
}

// ============================================================================
// ANGLE HELPERS
// ============================================================================

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function angleDifference(from: number, to: number): number {
  return normalizeAngle(to - from);
}

// ============================================================================
// MATERIAL HELPERS
// ============================================================================

function createStandardMaterial(
  color: number,
  roughness: number = 0.8,
  options: { flatShading?: boolean; transparent?: boolean; opacity?: number } = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    flatShading: options.flatShading ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1
  });
}
