# AGENTS.md

This file provides guidance for AI coding agents working in this repository.

## IMPORTANT: No Automatic Git Operations

**NEVER automatically commit or push changes.** Always ask the user to commit and push manually. This ensures the user has full control over their git history and can review changes before committing.

## Project Overview

This is a browser-based 3D forest exploration game built with TypeScript and Three.js.
The game runs directly in the browser using Babel to transpile TypeScript at runtime.

### Tech Stack

- **Language**: TypeScript (transpiled in-browser via Babel)
- **3D Engine**: Three.js (loaded via CDN as UMD/global build)
- **Runtime**: Browser (no Node.js server required)
- **Package Manager**: Bun
- **Linter**: oxlint

## CRITICAL: TypeScript Only - No JavaScript

**ALWAYS use TypeScript (`.ts` files), NEVER plain JavaScript (`.js` files).**

This project uses a no-build-step architecture:
- TypeScript files are fetched and transpiled by Babel at runtime in the browser
- There is NO precompilation, NO bundler, NO build process
- Simply serve files with a static HTTP server and load `index.html`

### Why TypeScript Only

1. **Type safety**: Catch errors at development time
2. **Better tooling**: IDE autocomplete, refactoring support
3. **Documentation**: Types serve as inline documentation
4. **Consistency**: Single language across the entire codebase

### External Libraries

External libraries (like Three.js) are loaded via `<script>` tags as UMD/global builds:
- They expose global variables (e.g., `THREE`)
- TypeScript accesses them via `declare const` declarations
- No `import`/`export` statements - Babel standalone doesn't handle ES modules

The exception is `GLTFLoader` which requires ES modules and is loaded via an import map.

Example for Three.js:
```typescript
// Declare the global THREE namespace (provided by script tag in index.html)
declare const THREE: typeof import('three');
```

### 3D Models

The game loads `.glb` models from the `meshes/` directory using `GLTFLoader`:
- Models are loaded asynchronously and cached per entity type
- GLTFLoader is imported as an ES module via the import map in `index.html`
- Loaded models are cloned for each instance (trees, rocks, flowers, player)
- Model names should match file names: `tree.glb`, `rock.glb`, `flower.glb`, `player.glb`

Example model loading:
```typescript
async function loadModel(path: string): Promise<THREE.Group> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new (GLTFLoader as any)();
  return new Promise((resolve, reject) => {
    loader.load(path, (gltf: any) => resolve(gltf.scene), undefined, reject);
  });
}

// Usage in entity files:
grassModel = await loadModel('meshes/grass.glb');
```

## Build/Lint/Test Commands

### Installation

```bash
bun install
```

### Linting

```bash
# Lint all project files (excludes node_modules via .gitignore)
bunx oxlint . --ignore-path .gitignore

# Lint a specific file
bunx oxlint src/game.ts
```

### Running the Game

Open `index.html` directly in a browser, or serve it:

```bash
bunx serve .
```

### No Build Step Required

The project uses in-browser TypeScript transpilation via Babel. TypeScript files
in the `src/` folder are fetched and transpiled at runtime in `index.html`.

**IMPORTANT**: Do NOT introduce any build steps, bundlers, or precompilation.
The architecture must remain: serve files → browser fetches `.ts` → Babel transpiles → runs.

## Code Style Guidelines

### File Organization

- `src/` - TypeScript source files
  - `game.ts` - Main game loop and state management
  - `utils.ts` - Helper functions and model loading
  - `world.ts` - World generation, clouds, pollen particles
  - `player.ts` - Player entity
  - `grass.ts`, `water.ts`, `path.ts` - Ground tile types
  - `flower.ts`, `tree.ts`, `rock.ts` - Decoration tile types
- `index.html` - Entry point, loads and transpiles TypeScript
- `style.css` - Game styling
- `meshes/` - Directory containing `.glb` 3D model files

### TypeScript Conventions

#### Interfaces

Define interfaces at the top of the file, before constants:

```typescript
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
```

#### Constants

Use `UPPER_SNAKE_CASE` for constants. Define them after interfaces:

```typescript
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 700;
const WORLD_SIZE = 20;
const TILE_SIZE = 32;
```

#### Variables

Use `camelCase` for variables. Global mutable state uses `let`:

```typescript
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let player: Player;
```

#### Functions

Use `camelCase` for function names. Prefer explicit return types:

```typescript
function isoToScreen(x: number, y: number, z = 0): Vector2 {
  return {
    x: (x - y) * TILE_SIZE,
    y: (x + y) * TILE_SIZE * ISOMETRIC_RATIO - z
  };
}
```

### Type Annotations

- Always annotate function parameters
- Use explicit return types for functions
- Use union types for constrained string values: `'grass' | 'water' | 'path'`
- Use optional properties with `?` syntax: `health?: number`
- Use `Record<string, T>` for typed object maps

### Naming Conventions

| Element       | Convention        | Example                    |
|---------------|-------------------|----------------------------|
| Interfaces    | PascalCase        | `Player`, `InputState`     |
| Type aliases  | PascalCase        | `TileColors`               |
| Constants     | UPPER_SNAKE_CASE  | `CANVAS_WIDTH`, `TILE_SIZE`|
| Variables     | camelCase         | `lastTime`, `isMoving`     |
| Functions     | camelCase         | `updatePlayer`, `render`   |
| Parameters    | camelCase         | `deltaTime`, `screenX`     |

### Code Structure Pattern

Follow this order in the main file:

1. Interface definitions
2. Constants
3. Global variables
4. Helper/utility functions
5. Game logic functions (create, update, render)
6. Main game loop
7. Initialization

### Error Handling

- Use early returns for guard clauses
- Check array bounds before access:
  ```typescript
  if (tileX < 0 || tileX >= world.length) return false;
  ```
- Use nullish coalescing for defaults: `tile.decoration.health ?? 100`

### Imports

This project does not use ES modules - all code is in a single file transpiled
by Babel at runtime. Do not add import/export statements.

### Comments

- Use `//` for single-line comments
- Add comments for non-obvious logic, especially:
  - Isometric coordinate transformations
  - Game mechanics (e.g., tree chopping cooldown)
  - Rendering order/depth sorting

## Game Architecture

### Coordinate Systems

- **World coordinates**: Grid-based (x, y) tile positions
- **3D coordinates**: Three.js scene with Y-up convention
- World center is at `(WORLD_SIZE/2, 0, WORLD_SIZE/2)`

### Game Loop

The game uses `requestAnimationFrame` for the main loop:
1. `update(deltaTime)` - Game state updates
2. `render(time)` - Draw everything

### 3D Models

All game objects use `.glb` models loaded from the `meshes/` directory:
- **Trees**: Loaded from `tree.glb` - variants distinguished by color
- **Rocks**: Loaded from `rock.glb` - mossy variants exist
- **Flowers**: Loaded from `flower.glb` - 4 color variants
- **Player**: Loaded from `player.glb` - humanoid character

Models are cloned per instance and material properties are applied dynamically.

### Camera

- Orthographic camera for isometric-style view
- Custom orbit controls (mouse drag to rotate, scroll to zoom)
- Default angle: 45° azimuth, 60° polar (classic isometric)

### Lighting

- `AmbientLight` - Base illumination
- `HemisphereLight` - Sky/ground color gradient
- `DirectionalLight` - Sun with shadow casting (PCFSoftShadowMap)
