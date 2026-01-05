// Flower tile - walkable, has sway animation and can be disturbed

declare const THREE: typeof import('three');

// ============================================================================
// CONSTANTS
// ============================================================================

const FLOWER_COLORS = [0xe74c3c, 0xf39c12, 0x9b59b6, 0xe91e63];
const FLOWER_CENTER_COLOR = 0xf1c40f;
const FLOWER_STEM_COLOR = 0x2e7d32;

// ============================================================================
// INTERFACE
// ============================================================================

interface Flower {
  type: 'flower';
  mesh: THREE.Group;
  flowerMesh: THREE.Group;
  x: number;
  y: number;
  isWalkable: true;
  basePhase: number;
  disturbance: number;
  disturbanceEndTime: number;
  disturb(): void;
  update(time: number): void;
}

// ============================================================================
// MODELS
// ============================================================================

let flowerGrassModel: THREE.Group | null = null;
let flowerFlowerModel: THREE.Group | null = null;

async function loadFlowerModel(): Promise<void> {
  if (!flowerFlowerModel) {
    [flowerGrassModel, flowerFlowerModel] = await Promise.all([
      loadModel('meshes/grass.glb'),
      loadModel('meshes/flower.glb')
    ]);
  }
}

// ============================================================================
// MESH CREATION
// ============================================================================

function createFlowerMesh(variant: number): THREE.Group {
  const flower = flowerFlowerModel!.clone();
  const flowerColor = FLOWER_COLORS[variant];

  flower.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'stem' || child.name.startsWith('leaf_')) {
      mesh.material = createStandardMaterial(
        FLOWER_STEM_COLOR,
        child.name === 'stem' ? 0.8 : 0.7
      );
    } else if (child.name.startsWith('petal_')) {
      mesh.material = createStandardMaterial(flowerColor, 0.6);
    } else if (child.name === 'center') {
      mesh.material = createStandardMaterial(FLOWER_CENTER_COLOR, 0.5);
    }
  });

  enableShadowCast(flower);
  return flower;
}

// ============================================================================
// FACTORY
// ============================================================================

function createFlower(scene: THREE.Scene, x: number, y: number, variant: number): Flower {
  // Ground mesh
  const mesh = flowerGrassModel!.clone();
  positionTileMesh(mesh, x, y);
  enableShadowReceive(mesh);
  scene.add(mesh);

  // Flower mesh on top
  const offsetX = (Math.random() - 0.5) * 0.6;
  const offsetY = (Math.random() - 0.5) * 0.6;
  const flowerMesh = createFlowerMesh(variant);
  flowerMesh.position.set(x + 0.5 + offsetX, 0, y + 0.5 + offsetY);
  scene.add(flowerMesh);

  const flower: Flower = {
    type: 'flower',
    mesh,
    flowerMesh,
    x,
    y,
    isWalkable: true,
    basePhase: Math.random() * Math.PI * 2,
    disturbance: 0,
    disturbanceEndTime: 0,

    disturb() {
      this.disturbance = 0.2;
      this.disturbanceEndTime = Date.now() + 250;
    },

    update(time: number) {
      const now = Date.now();
      if (now > this.disturbanceEndTime) {
        this.disturbance *= 0.95;
      }

      const baseSway = Math.sin(time * 0.003 + this.basePhase) * 0.08;
      const disturbanceSway = Math.sin(time * 0.015 + this.basePhase) * this.disturbance;

      this.flowerMesh.rotation.x = baseSway + disturbanceSway;
      this.flowerMesh.rotation.z = baseSway * 0.5 + disturbanceSway * 0.5;
    }
  };

  return flower;
}
