// Tree tile - walkable when destroyed, has damage/shake/fall/fade behavior

declare const THREE: typeof import('three');

// ============================================================================
// CONSTANTS
// ============================================================================

const TREE_TRUNK_COLOR = 0x5d4037;
const TREE_TRUNK_DARK = 0x4e342e;
const TREE_TRUNK_COLORS = [TREE_TRUNK_COLOR, 0x6d4c41, TREE_TRUNK_DARK];
const TREE_LEAVES_COLORS = [0x1b5e20, 0x2e7d32, 0x388e3c, 0x43a047];

// ============================================================================
// INTERFACE
// ============================================================================

interface Tree {
  type: 'tree';
  mesh: THREE.Group;
  treeMesh: THREE.Group;
  x: number;
  y: number;
  isWalkable: boolean;
  health: number;
  state: 'healthy' | 'falling' | 'fading';
  isDestroyed: boolean;
  fallAngle: number;
  fallDirection: THREE.Vector3 | null;
  opacity: number;
  shakeEndTime: number;
  baseX: number;
  baseZ: number;
  scene: THREE.Scene;
  damage(fallDirection: THREE.Vector3): void;
  update(deltaTime: number): void;
}

// ============================================================================
// MODELS
// ============================================================================

let treeGrassModel: THREE.Group | null = null;
let treeTreeModel: THREE.Group | null = null;

async function loadTreeModel(): Promise<void> {
  if (!treeTreeModel) {
    [treeGrassModel, treeTreeModel] = await Promise.all([
      loadModel('models/grass.glb'),
      loadModel('models/tree.glb')
    ]);
  }
}

// ============================================================================
// MESH CREATION
// ============================================================================

function createTreeMesh(variant: number): THREE.Group {
  const tree = treeTreeModel!.clone();

  const trunkMaterial = createStandardMaterial(
    TREE_TRUNK_COLORS[variant] ?? TREE_TRUNK_COLOR,
    0.9
  );

  tree.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (child.name === 'trunk' || child.name.startsWith('root_')) {
      mesh.material = trunkMaterial;
    } else if (child.name.startsWith('foliage_')) {
      const idx = parseInt(child.name.split('_')[1]);
      mesh.material = createStandardMaterial(TREE_LEAVES_COLORS[idx], 0.8);
    }
  });

  enableShadowCast(tree);

  // Random rotation and scale
  tree.rotation.y = Math.random() * Math.PI * 2;
  const scale = 0.9 + Math.random() * 0.2;
  tree.scale.set(scale, scale, scale);

  return tree;
}

// ============================================================================
// FACTORY
// ============================================================================

function createTree(scene: THREE.Scene, x: number, y: number, variant: number): Tree {
  // Ground mesh
  const mesh = treeGrassModel!.clone();
  positionTileMesh(mesh, x, y);
  enableShadowReceive(mesh);
  scene.add(mesh);

  // Tree mesh on top
  const offsetX = (Math.random() - 0.5) * 0.6;
  const offsetY = (Math.random() - 0.5) * 0.6;
  const treeMesh = createTreeMesh(variant);
  const treeX = x + 0.5 + offsetX;
  const treeZ = y + 0.5 + offsetY;
  treeMesh.position.set(treeX, 0, treeZ);
  scene.add(treeMesh);

  const tree: Tree = {
    type: 'tree',
    mesh,
    treeMesh,
    x,
    y,
    isWalkable: false,
    health: 100,
    state: 'healthy',
    isDestroyed: false,
    fallAngle: 0,
    fallDirection: null,
    opacity: 1,
    shakeEndTime: 0,
    baseX: treeX,
    baseZ: treeZ,
    scene,

    damage(fallDirection: THREE.Vector3) {
      if (this.health <= 0) return;

      this.health -= 34;
      this.shakeEndTime = Date.now() + 150;

      if (this.health <= 0) {
        this.state = 'falling';
        this.fallAngle = 0;
        this.fallDirection = fallDirection;
        this.isWalkable = true;
      }
    },

    update(deltaTime: number) {
      const dt = deltaTime / 1000;
      const now = Date.now();

      if (this.state === 'falling') {
        this.fallAngle += dt * 2.5;

        if (this.fallAngle >= Math.PI / 2) {
          this.fallAngle = Math.PI / 2;
          this.state = 'fading';
        }

        // Rotate around axis perpendicular to fall direction
        const dir = this.fallDirection!;
        const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
        this.treeMesh.setRotationFromAxisAngle(axis, this.fallAngle);

        // Translate slightly in fall direction
        const fallOffset = Math.sin(this.fallAngle) * 1.2;
        this.treeMesh.position.x = this.baseX + dir.x * fallOffset * 0.3;
        this.treeMesh.position.z = this.baseZ + dir.z * fallOffset * 0.3;

      } else if (this.state === 'fading') {
        this.opacity -= dt * 2;

        if (this.opacity <= 0) {
          this.scene.remove(this.treeMesh);
          this.isDestroyed = true;
          return;
        }

        // Update opacity on all materials
        this.treeMesh.traverse((child: THREE.Object3D) => {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (!material.transparent) {
              material.transparent = true;
            }
            material.opacity = this.opacity;
          }
        });

      } else if (this.state === 'healthy') {
        // Shake when damaged
        const isShaking = now < this.shakeEndTime;
        if (this.health < 100 && isShaking) {
          const intensity = (100 - this.health) / 100 * 0.2;
          const shake = Math.sin(now / 30) * intensity;
          this.treeMesh.rotation.z = shake;
          this.treeMesh.rotation.x = Math.cos(now / 25) * intensity * 0.5;
        } else {
          this.treeMesh.rotation.z = 0;
          this.treeMesh.rotation.x = 0;
        }
      }
    }
  };

  return tree;
}
