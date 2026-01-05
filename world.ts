// World generation, clouds, and pollen particles

declare const THREE: typeof import('three');

// ============================================================================
// CONSTANTS
// ============================================================================

const WORLD_SIZE = 20;

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

const POLLEN_COLORS = [0xfffacd, 0xfff8dc, 0xfffaf0, 0xfffff0, 0xfff5ee, 0xfff, 0xfffdd0];
const POLLEN_COUNT = 100;

// ============================================================================
// TILE TYPE
// ============================================================================

type Tile = Grass | Water | Path | Flower | Tree | Rock;

// ============================================================================
// POLLEN PARTICLES
// ============================================================================

interface PollenParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
  phase: number;
}

interface PollenSystem {
  particles: PollenParticle[];
  sprites: THREE.Sprite[];
  update(deltaTime: number, time: number): void;
}

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

function initParticles(scene: THREE.Scene): PollenSystem {
  const particles: PollenParticle[] = [];
  const sprites: THREE.Sprite[] = [];

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
    particles.push(particle);

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
    sprites.push(sprite);
  }

  return { particles, sprites };
}

function updatePollenParticles(particles: PollenParticle[], sprites: THREE.Sprite[], deltaTime: number, time: number): void {
  particles.forEach((p, i) => {
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

    sprites[i].position.set(p.x, p.z, p.y);
  });
}

// ============================================================================
// CLOUDS
// ============================================================================

interface Cloud {
  mesh: THREE.Group;
  speed: number;
  initialX: number;
  amplitude: number;
  update(time: number): void;
}

let worldCloudModels: THREE.Group[] = [];

async function loadCloudModels(): Promise<void> {
  if (worldCloudModels.length === 0) {
    const names = ['cloud1', 'cloud2', 'cloud3'];
    worldCloudModels = await Promise.all(names.map(name => loadModel(`models/${name}.glb`)));
  }
}

function createCloudMesh(): THREE.Group {
  const variant = 1 + Math.floor(Math.random() * 3);
  const cloud = worldCloudModels[variant - 1].clone();
  cloud.rotation.y = Math.random() * Math.PI * 2;
  const scale = 0.9 + Math.random() * 0.2;
  cloud.scale.multiplyScalar(scale);
  return cloud;
}

function createCloud(scene: THREE.Scene, yBase: number): Cloud {
  const mesh = createCloudMesh();
  const x = Math.random() * WORLD_SIZE * 1.5 - WORLD_SIZE * 0.25;
  const z = Math.random() * WORLD_SIZE;
  mesh.position.set(x, yBase + Math.random() * 2, z);
  scene.add(mesh);

  return {
    mesh,
    speed: 0.3 + Math.random() * 0.4,
    initialX: x,
    amplitude: 1 + Math.random() * 2,

    update(time: number) {
      const offset = Math.sin(time * 0.001 * this.speed) * this.amplitude;
      this.mesh.position.x = this.initialX + offset;
    }
  };
}

function initClouds(scene: THREE.Scene): Cloud[] {
  const clouds: Cloud[] = [];
  const count = 4 + Math.floor(Math.random() * 4);
  const yBase = 3;

  for (let i = 0; i < count; i++) {
    clouds.push(createCloud(scene, yBase));
  }

  return clouds;
}

// ============================================================================
// WORLD GENERATION
// ============================================================================

function generateWorld(scene: THREE.Scene): Tile[][] {
  const world: Tile[][] = [];

  for (let x = 0; x < WORLD_SIZE; x++) {
    world[x] = [];
    for (let y = 0; y < WORLD_SIZE; y++) {
      world[x][y] = createTileAt(scene, x, y);
    }
  }

  createGridLines(scene);
  return world;
}

function createTileAt(scene: THREE.Scene, x: number, y: number): Tile {
  const distFromCenter = Math.sqrt((x - WORLD_SIZE / 2) ** 2 + (y - WORLD_SIZE / 2) ** 2);
  const distFromEdge = Math.min(x, y, WORLD_SIZE - 1 - x, WORLD_SIZE - 1 - y);

  // Water in center
  if (distFromCenter < 3) {
    return createWater(scene, x, y);
  }

  // Random path tiles
  if (Math.random() < 0.05 && distFromEdge > 1) {
    return createPath(scene, x, y);
  }

  // Grass with decorations
  const rand = Math.random();

  if (rand < 0.30 && distFromEdge > 0) {
    const variant = Math.floor(Math.random() * 3);
    return createTree(scene, x, y, variant);
  }

  if (rand < 0.35 && distFromEdge > 0) {
    const variant = Math.floor(Math.random() * 2);
    return createRock(scene, x, y, variant);
  }

  if (rand < 0.45 && distFromEdge > 0) {
    const variant = Math.floor(Math.random() * 4);
    return createFlower(scene, x, y, variant);
  }

  return createGrass(scene, x, y);
}

function getSpawnPosition(world: Tile[][]): { x: number; y: number } {
  const validPositions: { x: number; y: number }[] = [];

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_SIZE; y++) {
      const tile = world[x][y];
      if (tile.isWalkable) {
        validPositions.push({ x, y });
      }
    }
  }

  if (validPositions.length > 0) {
    const idx = Math.floor(Math.random() * validPositions.length);
    return validPositions[idx];
  }

  return { x: Math.floor(WORLD_SIZE / 2), y: Math.floor(WORLD_SIZE / 2) };
}

function createGridLines(scene: THREE.Scene): void {
  const material = new THREE.LineBasicMaterial({
    color: COLORS.gridLine,
    transparent: true,
    opacity: 0.15,
    depthTest: false
  });

  for (let i = 0; i <= WORLD_SIZE; i++) {
    const xPoints = [
      new THREE.Vector3(0, 0.01, i),
      new THREE.Vector3(WORLD_SIZE, 0.01, i)
    ];
    const xGeometry = new THREE.BufferGeometry().setFromPoints(xPoints);
    const xLine = new THREE.Line(xGeometry, material);
    scene.add(xLine);

    const zPoints = [
      new THREE.Vector3(i, 0.01, 0),
      new THREE.Vector3(i, 0.01, WORLD_SIZE)
    ];
    const zGeometry = new THREE.BufferGeometry().setFromPoints(zPoints);
    const zLine = new THREE.Line(zGeometry, material);
    scene.add(zLine);
  }
}
