// Type definitions
interface Vector2 {
  x: number;
  y: number;
}

interface Tile {
  x: number;
  y: number;
  height: number;
  type: 'grass' | 'water' | 'path';
  decoration: Decoration | null;
}

interface Decoration {
  type: 'tree' | 'rock' | 'flower';
  variant: number;
  offsetX: number;
  offsetY: number;
  health?: number; // Only used for trees, starts at 100
}

interface Player {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  direction: number;
  isMoving: boolean;
  animFrame: number;
}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface TileColors {
  top: string;
  side: string;
  highlight: string;
}

// Constants
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 700;
const WORLD_SIZE = 20;
const TILE_SIZE = 32;
const ISOMETRIC_RATIO = 0.5;
const MAP_OFFSET_X = CANVAS_WIDTH / 2;
const MAP_OFFSET_Y = CANVAS_HEIGHT / 2 - (WORLD_SIZE * TILE_SIZE * ISOMETRIC_RATIO);
const MOVE_SPEED = 8;

// Global variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let world: Tile[][];
let player: Player;
let input: InputState;
let lastTime = 0;
let particles: Particle[] = [];
let isMoving = false;
let chopCooldown = 0; // Cooldown timer for chopping trees

// SVG assets
interface SVGAsset {
  img: HTMLImageElement;
  width: number;
  height: number;
}

const svgAssets: Record<string, SVGAsset> = {};

function loadSVG(src: string): Promise<SVGAsset> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({
      img,
      width: img.naturalWidth,
      height: img.naturalHeight
    });
    img.src = src;
  });
}

async function loadAllAssets(): Promise<void> {
  svgAssets['tree'] = await loadSVG('assets/svg/tree.svg');
  svgAssets['rock'] = await loadSVG('assets/svg/rock.svg');
  svgAssets['flower'] = await loadSVG('assets/svg/flower.svg');
  svgAssets['player'] = await loadSVG('assets/svg/player.svg');
}

// Color configurations
const TILE_COLORS: Record<string, TileColors> = {
  grass: { top: '#27ae60', side: '#1e8449', highlight: '#58d68d' },
  water: { top: '#3498db', side: '#2980b9', highlight: '#5dade2' },
  path: { top: '#8b7355', side: '#7a6348', highlight: '#9c8465' }
};

const TREE_COLORS: TreeColors[] = [
  { trunk: '#5d4037', leaves: '#2e7d32' },
  { trunk: '#6d4c41', leaves: '#388e3c' },
  { trunk: '#4e342e', leaves: '#43a047' }
];

const ROCK_COLORS: RockColors[] = [
  { base: '#757575', shadow: '#616161', highlight: '#9e9e9e' },
  { base: '#689f38', shadow: '#558b2f', highlight: '#8bc34a' }
];

// Helper functions
function isoToScreen(x: number, y: number, z = 0): Vector2 {
  return {
    x: (x - y) * TILE_SIZE,
    y: (x + y) * TILE_SIZE * ISOMETRIC_RATIO - z
  };
}

function createTile(x: number, y: number): Tile {
  const distFromCenter = Math.sqrt((x - WORLD_SIZE / 2) ** 2 + (y - WORLD_SIZE / 2) ** 2);
  const distFromEdge = Math.min(x, y, WORLD_SIZE - 1 - x, WORLD_SIZE - 1 - y);

  let type: 'grass' | 'water' | 'path' = 'grass';
  const height = 0;

  if (distFromCenter < 3) {
    type = 'water';
  } else if (Math.random() < 0.05 && distFromEdge > 1) {
    type = 'path';
  }

  let decoration: Decoration | null = null;

  if (type === 'grass' && distFromEdge > 0) {
    const rand = Math.random();
    // Random offset in tile-local coordinates (0 to 1), will be converted to isometric in rendering
    const offsetX = (Math.random() - 0.5) * 0.6;
    const offsetY = (Math.random() - 0.5) * 0.6;
    if (rand < 0.30) {
      decoration = { type: 'tree', variant: Math.floor(Math.random() * 3), offsetX, offsetY, health: 100 };
    } else if (rand < 0.35) {
      decoration = { type: 'rock', variant: Math.floor(Math.random() * 2), offsetX, offsetY };
    } else if (rand < 0.45) {
      decoration = { type: 'flower', variant: Math.floor(Math.random() * 4), offsetX, offsetY };
    }
  }

  return { x, y, height, type, decoration };
}

function generateWorld(): void {
  world = [];
  for (let x = 0; x < WORLD_SIZE; x++) {
    world[x] = [];
    for (let y = 0; y < WORLD_SIZE; y++) {
      world[x][y] = createTile(x, y);
    }
  }
}

function getSpawnPosition(): { x: number; y: number } {
  // Collect all valid spawn positions and pick a random one
  const validPositions: { x: number; y: number }[] = [];

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_SIZE; y++) {
      const tile = world[x][y];
      // Check tile is walkable (not water, not tree, not rock)
      if (tile.type !== 'water' && (!tile.decoration || (tile.decoration.type !== 'tree' && tile.decoration.type !== 'rock'))) {
        validPositions.push({ x, y });
      }
    }
  }

  if (validPositions.length > 0) {
    const randomIndex = Math.floor(Math.random() * validPositions.length);
    return validPositions[randomIndex];
  }

  // Fallback to center if no valid positions found
  return { x: Math.floor(WORLD_SIZE / 2), y: Math.floor(WORLD_SIZE / 2) };
}

function createPlayer(x: number, y: number): Player {
  return {
    x, y, z: 0,
    targetX: x, targetY: y,
    direction: 0, isMoving: false, animFrame: 0
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

function isWalkable(x: number, y: number): boolean {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  if (tileX < 0 || tileX >= world.length || tileY < 0 || tileY >= world[0].length) return false;
  const tile = world[tileX][tileY];
  if (tile.type === 'water') return false;
  if (!tile.decoration) return true;
  if (tile.decoration.type === 'rock') return false;
  if (tile.decoration.type === 'tree') {
    // Tree is walkable only if it's been fully cut down (health <= 0)
    return (tile.decoration.health ?? 100) <= 0;
  }
  return true;
}

function damageTree(x: number, y: number): boolean {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  if (tileX < 0 || tileX >= world.length || tileY < 0 || tileY >= world[0].length) return false;
  const tile = world[tileX][tileY];
  if (tile.decoration && tile.decoration.type === 'tree' && (tile.decoration.health ?? 100) > 0) {
    tile.decoration.health = (tile.decoration.health ?? 100) - 34; // Takes 3 hits to cut down
    if (tile.decoration.health <= 0) {
      tile.decoration = null; // Remove the tree completely
      return true; // Tree was just destroyed, can walk through
    }
    return false; // Tree still standing
  }
  return false;
}

function updatePlayer(deltaTime: number): void {
  if (isMoving) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.01) {
      player.x = player.targetX;
      player.y = player.targetY;
      isMoving = false;
      player.isMoving = false;
    } else {
      const speed = MOVE_SPEED;
      const step = Math.min(speed * deltaTime / 1000, dist);
      player.x += (dx / dist) * step;
      player.y += (dy / dist) * step;
      player.direction = Math.atan2(dy, dx);
      player.animFrame += deltaTime * 0.02;
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

      if (isWalkable(targetX, targetY)) {
        player.targetX = targetX;
        player.targetY = targetY;
        isMoving = true;
      } else if (chopCooldown <= 0) {
        // Try to damage tree if there's one blocking (with cooldown)
        const tileX = Math.floor(targetX);
        const tileY = Math.floor(targetY);
        if (tileX >= 0 && tileX < world.length && tileY >= 0 && tileY < world[0].length) {
          const tile = world[tileX][tileY];
          if (tile.decoration && tile.decoration.type === 'tree') {
            const destroyed = damageTree(targetX, targetY);
            chopCooldown = 300; // 300ms cooldown between chops
            if (destroyed) {
              // Tree was destroyed, now we can walk through
              player.targetX = targetX;
              player.targetY = targetY;
              isMoving = true;
            }
          }
        }
      }
    }
  }
}

function initParticles(): void {
  particles = [];
  for (let i = 0; i < 30; i++) {
    particles.push({
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      z: Math.random() * 5 + 2,
      vx: (Math.random() - 0.5) * 0.001,
      vy: (Math.random() - 0.5) * 0.001,
      life: Math.random(),
      color: ['#ffffff', '#fffaed', '#fff8e1'][Math.floor(Math.random() * 3)],
      size: Math.random() * 1.5 + 0.5
    });
  }
}

function updateParticles(deltaTime: number): void {
  particles.forEach((p: Particle) => {
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= 0.0005 * deltaTime;

    if (p.life <= 0) {
      p.x = Math.random() * WORLD_SIZE;
      p.y = Math.random() * WORLD_SIZE;
      p.life = 1;
    }
  });
}

function renderTileBase(tile: Tile, screenX: number, screenY: number): void {
  const colors: TileColors = TILE_COLORS[tile.type];
  const size = TILE_SIZE;

  const vertices: Vector2[] = [
    { x: screenX, y: screenY },
    { x: screenX + size, y: screenY + size * ISOMETRIC_RATIO },
    { x: screenX, y: screenY + size * 2 * ISOMETRIC_RATIO },
    { x: screenX - size, y: screenY + size * ISOMETRIC_RATIO }
  ];

  // Draw tile sides
  ctx.fillStyle = colors.side;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  ctx.lineTo(vertices[1].x, vertices[1].y);
  ctx.lineTo(vertices[2].x, vertices[2].y);
  ctx.lineTo(vertices[3].x, vertices[3].y);
  ctx.closePath();
  ctx.fill();

  // Draw tile top
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y - 2);
  ctx.lineTo(vertices[1].x, vertices[1].y - 2);
  ctx.lineTo(vertices[2].x, vertices[2].y - 2);
  ctx.lineTo(vertices[3].x, vertices[3].y - 2);
  ctx.closePath();
  ctx.fill();

  // Draw tile border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y - 2);
  ctx.lineTo(vertices[1].x, vertices[1].y - 2);
  ctx.lineTo(vertices[2].x, vertices[2].y - 2);
  ctx.lineTo(vertices[3].x, vertices[3].y - 2);
  ctx.closePath();
  ctx.stroke();
}

function renderDecoration(tile: Tile, screenX: number, screenY: number, time: number): void {
  if (!tile.decoration) return;
  
  const size = TILE_SIZE;
  // Convert tile-local offset to isometric screen offset
  // The offset is in tile coordinates, so we need to apply isometric transformation
  const localX = tile.decoration.offsetX;
  const localY = tile.decoration.offsetY;
  // Isometric conversion: screenX = (localX - localY) * TILE_SIZE, screenY = (localX + localY) * TILE_SIZE * 0.5
  const isoOffsetX = (localX - localY) * size;
  const isoOffsetY = (localX + localY) * size * ISOMETRIC_RATIO;
  const centerX = screenX + isoOffsetX;
  const centerY = screenY + size * ISOMETRIC_RATIO + isoOffsetY;

  if (tile.decoration.type === 'tree') {
    const health = tile.decoration.health ?? 100;
    // Check if this tree is being chopped (damaged and cooldown active)
    const isBeingChopped = health < 100 && chopCooldown > 0;
    const shakeAngle = isBeingChopped ? Math.sin(time / 20) * 0.15 : 0;
    
    if (health <= 50) {
      // Draw just the stem (stump)
      const stumpWidth = 10;
      const stumpHeight = 15;
      const trunkColors = TREE_COLORS[tile.decoration.variant];
      
      ctx.save();
      // Translate to base, rotate for shake, then draw
      ctx.translate(centerX, centerY);
      ctx.rotate(shakeAngle);
      
      // Draw trunk stump (relative to base at 0,0)
      ctx.fillStyle = trunkColors.trunk;
      ctx.fillRect(-stumpWidth / 2, -stumpHeight, stumpWidth, stumpHeight);
      
      // Add some shading
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(-stumpWidth / 2, -stumpHeight, stumpWidth / 3, stumpHeight);
      
      // Draw top of stump (cut surface)
      ctx.fillStyle = '#8d6e63';
      ctx.beginPath();
      ctx.ellipse(0, -stumpHeight, stumpWidth / 2, stumpWidth / 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // Draw full tree
      const asset = svgAssets['tree'];
      if (asset) {
        ctx.save();
        ctx.filter = TREE_COLORS[tile.decoration.variant].leaves === '#2e7d32' ? 'hue-rotate(0deg)' : 
                     TREE_COLORS[tile.decoration.variant].leaves === '#388e3c' ? 'hue-rotate(30deg)' : 
                     'hue-rotate(60deg)';
        // Translate to base, rotate for shake, then draw
        ctx.translate(centerX, centerY);
        ctx.rotate(shakeAngle);
        // Position so tree base (bottom of image) is at origin
        ctx.drawImage(asset.img, -asset.width / 2, -asset.height);
        ctx.restore();
      }
    }
  } else if (tile.decoration.type === 'rock') {
    const asset = svgAssets['rock'];
    if (asset) {
      ctx.save();
      ctx.filter = ROCK_COLORS[tile.decoration.variant].base === '#757575' ? 'hue-rotate(0deg) sepia(0.3)' : 
                   'hue-rotate(60deg)';
      // Position so rock base is at centerX, centerY (rock is roughly centered)
      ctx.drawImage(asset.img, centerX - asset.width / 2, centerY - asset.height * 0.7);
      ctx.restore();
    }
  } else if (tile.decoration.type === 'flower') {
    // Rotate from stem base instead of translating
    const swayAngle = Math.sin(time / 500 + tile.x * 1.3 + tile.y * 0.9) * 0.15;
    const asset = svgAssets['flower'];
    if (asset) {
      ctx.save();
      const flowerColors = ['#e74c3c', '#f39c12', '#9b59b6', '#e91e63'];
      ctx.filter = flowerColors[tile.decoration.variant] === '#e74c3c' ? 'hue-rotate(0deg)' : 
                   flowerColors[tile.decoration.variant] === '#f39c12' ? 'hue-rotate(30deg)' : 
                   flowerColors[tile.decoration.variant] === '#9b59b6' ? 'hue-rotate(200deg)' : 
                   'hue-rotate(320deg)';
      // Translate to stem base, rotate, then draw with origin at base
      // Offset up to place on tile surface instead of bottom edge
      ctx.translate(centerX, centerY - 16);
      ctx.rotate(swayAngle);
      ctx.drawImage(asset.img, -asset.width / 2, -asset.height);
      ctx.restore();
    }
  }
}

function renderTileHighlight(screenX: number, screenY: number): void {
  const size = TILE_SIZE;

  const vertices: Vector2[] = [
    { x: screenX, y: screenY },
    { x: screenX + size, y: screenY + size * ISOMETRIC_RATIO },
    { x: screenX, y: screenY + size * 2 * ISOMETRIC_RATIO },
    { x: screenX - size, y: screenY + size * ISOMETRIC_RATIO }
  ];

  ctx.strokeStyle = '#ffeb3b';
  ctx.lineJoin = 'round';

  const topEdgeWidth = 1.5;
  const bottomEdgeWidth = 2;

  // Top-right edge
  ctx.lineWidth = topEdgeWidth;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y - 3);
  ctx.lineTo(vertices[1].x, vertices[1].y - 3);
  ctx.stroke();

  // Bottom-right edge
  ctx.lineWidth = bottomEdgeWidth;
  ctx.beginPath();
  ctx.moveTo(vertices[1].x, vertices[1].y - 3);
  ctx.lineTo(vertices[2].x, vertices[2].y - 3);
  ctx.stroke();

  // Bottom-left edge
  ctx.lineWidth = bottomEdgeWidth;
  ctx.beginPath();
  ctx.moveTo(vertices[2].x, vertices[2].y - 3);
  ctx.lineTo(vertices[3].x, vertices[3].y - 3);
  ctx.stroke();

  // Top-left edge
  ctx.lineWidth = topEdgeWidth;
  ctx.beginPath();
  ctx.moveTo(vertices[3].x, vertices[3].y - 3);
  ctx.lineTo(vertices[0].x, vertices[0].y - 3);
  ctx.stroke();
}

function renderPlayer(screenX: number, screenY: number): void {
  const bobOffset = player.isMoving ? Math.sin(player.animFrame) * 2 : 0;
  const drawY = screenY - 20 - bobOffset;
  
  const asset = svgAssets['player'];
  if (asset) {
    ctx.save();
    ctx.translate(screenX, drawY);
    ctx.scale(1, 1);
    // Center horizontally, position so feet are at the draw point
    ctx.drawImage(asset.img, -asset.width / 2, -asset.height / 2);
    ctx.restore();
  }
}

function renderParticles(screenCenterX: number, screenCenterY: number): void {
  particles.forEach((p: Particle) => {
    const screenPos = isoToScreen(p.x, p.y, p.z);
    const x = screenPos.x + screenCenterX;
    const y = screenPos.y + screenCenterY;

    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function update(deltaTime: number): void {
  if (chopCooldown > 0) {
    chopCooldown -= deltaTime;
  }
  updatePlayer(deltaTime);
  updateParticles(deltaTime);
}

let fps = 0;

function render(time: number): void {
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const screenCenterX = MAP_OFFSET_X;
  const screenCenterY = MAP_OFFSET_Y;

  const playerTileX = isMoving ? player.targetX : Math.floor(player.x);
  const playerTileY = isMoving ? player.targetY : Math.floor(player.y);

  // First pass: render all tile bases (ground only, no decorations)
  for (let sum = 0; sum < WORLD_SIZE * 2; sum++) {
    for (let x = 0; x <= sum; x++) {
      const y = sum - x;
      if (x < WORLD_SIZE && y < WORLD_SIZE && y >= 0) {
        const tile = world[x][y];
        const screenPos = isoToScreen(x, y);
        renderTileBase(tile, screenPos.x + screenCenterX, screenPos.y + screenCenterY);
      }
    }
  }

  // Second pass: render decorations and player in depth order
  // Build a list of all entities (decorations + player) to sort
  interface Entity {
    depth: number;
    render: () => void;
  }
  const entities: Entity[] = [];

  // Add all decorations
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_SIZE; y++) {
      const tile = world[x][y];
      if (tile.decoration) {
        const screenPos = isoToScreen(x, y);
        const depth = x + y;
        entities.push({
          depth,
          render: () => renderDecoration(tile, screenPos.x + screenCenterX, screenPos.y + screenCenterY, time)
        });
      }
    }
  }

  // Add highlight - use player's current position so it stays behind the player
  const playerDepth = player.x + player.y;
  const highlightScreenPos = isoToScreen(playerTileX, playerTileY);
  entities.push({
    depth: playerDepth - 0.001,
    render: () => renderTileHighlight(highlightScreenPos.x + screenCenterX, highlightScreenPos.y + screenCenterY)
  });

  // Add player - use interpolated position for smooth depth transitions
  const playerScreenPos = isoToScreen(player.x, player.y, 0);
  entities.push({
    depth: playerDepth,
    render: () => renderPlayer(playerScreenPos.x + screenCenterX, playerScreenPos.y + screenCenterY)
  });

  // Sort by depth and render
  entities.sort((a, b) => a.depth - b.depth);
  entities.forEach(e => e.render());

  renderParticles(screenCenterX, screenCenterY);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw FPS
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`FPS: ${Math.round(fps)}`, 10, 20);
}

function gameLoop(currentTime: number): void {
  const deltaTime = Math.min(currentTime - lastTime, 50);
  fps = 1000 / deltaTime;
  lastTime = currentTime;

  update(deltaTime);
  render(currentTime);

  requestAnimationFrame(gameLoop);
}

async function init(): Promise<void> {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  ctx.imageSmoothingEnabled = false;

  await loadAllAssets();

  generateWorld();
  const spawnPos = getSpawnPosition();
  player = createPlayer(spawnPos.x, spawnPos.y);
  input = createInputHandler();
  initParticles();

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', () => init());
if (document.readyState !== 'loading') {
  init();
}
