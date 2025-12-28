# AGENTS.md

This file provides guidance for AI coding agents working in this repository.

## Project Overview

This is a browser-based isometric forest exploration game built with TypeScript.
The game runs directly in the browser using Babel to transpile TypeScript at runtime.

### Tech Stack

- **Language**: TypeScript (transpiled in-browser via Babel)
- **Runtime**: Browser (no Node.js server required)
- **Package Manager**: Bun
- **Linter**: oxlint

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
bunx oxlint game.ts
```

### Running the Game

Open `index.html` directly in a browser, or serve it:

```bash
bunx serve .
```

### No Build Step Required

The project uses in-browser TypeScript transpilation via Babel. The `game.ts`
file is fetched and transpiled at runtime in `index.html`.

## Code Style Guidelines

### File Organization

- `game.ts` - Main game logic (single-file architecture)
- `index.html` - Entry point, loads and transpiles TypeScript
- `style.css` - Game styling
- `assets/svg/` - SVG assets for game sprites

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

### Canvas Rendering

- Use `ctx.save()` and `ctx.restore()` when modifying canvas state
- Reset `ctx.globalAlpha` to 1 after transparency changes
- Use `ctx.beginPath()` before drawing new shapes

### Imports

This project does not use ES modules - all code is in a single file transpiled
by Babel at runtime. Do not add import/export statements.

### Comments

- Use `//` for single-line comments
- Add comments for non-obvious logic, especially:
  - Isometric coordinate transformations
  - Game mechanics (e.g., tree chopping cooldown)
  - Rendering order/depth sorting

## Assets

SVG assets are stored in `assets/svg/`:
- `player.svg` - Player character sprite
- `tree.svg` - Tree decoration
- `rock.svg` - Rock decoration
- `flower.svg` - Flower decoration

Load assets using the `loadSVG()` helper function.

## Game Architecture

### Coordinate Systems

- **World coordinates**: Grid-based (x, y) tile positions
- **Screen coordinates**: Isometric projection for rendering
- Use `isoToScreen(x, y, z)` to convert world to screen coordinates

### Game Loop

The game uses `requestAnimationFrame` for the main loop:
1. `update(deltaTime)` - Game state updates
2. `render(time)` - Draw everything

### Depth Sorting

Entities are sorted by depth (x + y) before rendering to ensure correct
overlap in isometric view. The player, decorations, and highlights are
all sorted together.
