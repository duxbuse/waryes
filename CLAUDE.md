# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Stellar Siege** is a WARNO-style Real-Time Strategy game with Warhammer 40k aesthetics. It's a browser-based RTS featuring deck-building, 5v5 team-based planetary siege scenarios, and WebSocket multiplayer. The project is a playable prototype (~55-60% feature complete).

**Tech Stack:**
- **Language:** TypeScript (strict mode)
- **Runtime:** Bun
- **3D Engine:** Three.js (v0.170.0)
- **Build Tool:** Vite
- **Testing:** Vitest + Playwright

## ⚠️ CRITICAL: 60 FPS Performance Target

**This game MUST maintain 60 FPS at all times.** Performance is a core requirement, not an optimization task. All new features and code changes must be evaluated for performance impact.

**Frame Budget: 16.67ms per frame**
- Game logic: ~10ms
- Rendering: ~6ms
- Buffer: ~0.67ms

**Before implementing ANY new feature:**
1. Profile the performance impact with realistic load (100+ units)
2. Verify FPS remains at 60 with the in-game FPS overlay
3. Use `BenchmarkManager` to measure specific system costs
4. If a feature drops FPS below 60, it must be optimized or redesigned before merging

## Development Commands

All commands should be run from the `web/` directory:

```bash
# Development
bun run dev              # Start dev server (localhost:5173)
bun run build            # TypeScript check + production build
bun run preview          # Preview production build

# Testing
bun test                 # Run unit tests (Vitest)
bun test:ui              # Visual test UI
bun test:e2e             # End-to-end tests (Playwright)

# Code Quality
bun run lint             # Run ESLint on TypeScript files
bun run typecheck        # Type check without emitting files
```

### Multiplayer Server

From the `server/` directory:

```bash
bun start                # Run WebSocket server
bun dev                  # Run with auto-reload
```

## Architecture Overview

### Central Hub Pattern

The game uses a **manager pattern** where `Game.ts` acts as the central orchestrator for all game systems. Each system is a dedicated manager class that handles a specific domain.

**Core Loop:**
1. Fixed timestep: 60 Hz (1/60 second)
2. Update order: Input → Movement → Combat → AI → Economy → Render
3. Managers are called via `fixedUpdate(dt)` or `update(dt)` methods

**Key Managers (14 total):**
- `InputManager` - Keyboard/mouse input
- `SelectionManager` - Unit selection and control groups
- `UnitManager` - Unit lifecycle and spatial queries
- `CombatManager` - Damage calculations, weapon fire
- `AIManager` - Enemy AI decision-making
- `DeploymentManager` - Setup phase unit placement
- `EconomyManager` - Credits and income
- `FogOfWarManager` - Visibility system
- `MultiplayerManager` - Server connection, lobby
- `MultiplayerBattleSync` - Lockstep synchronization
- `BuildingManager`, `TransportManager`, `ReinforcementManager`, `SmokeManager` - Feature-specific systems

### Game State Machine

**Phase Flow:**
```
Loading → MainMenu → DeckBuilder
                  ↓
          SkirmishSetup
                  ↓
           Setup (Deployment)
                  ↓
              Battle
                  ↓
             Victory
```

Each phase is managed by `ScreenManager` which handles transitions and screen lifecycle.

### Data-Driven Design

All game content (units, weapons, factions) is defined in `web/src/data/factions.ts` as TypeScript objects. This allows adding new units without modifying game logic.

**Data Structure:**
```
Faction
├── Units (UNITS array)
│   ├── Stats (health, speed, armor)
│   ├── Weapon slots (primary, secondary, etc.)
│   └── Category (LOG, INF, TNK, REC, AA, ART, HEL, AIR)
├── Weapons (WEAPONS array)
│   ├── Damage, penetration, range
│   └── Special effects (smoke, suppression)
└── Divisions (DIVISIONS array)
    └── Unit rosters (available units per division)
```

### Multiplayer Architecture

**Command-Based Lockstep:**
- `CommandProtocol.ts` - Command serialization (move, attack, deploy)
- `TickManager.ts` - 60 Hz tick synchronization
- `StateChecksum.ts` - Desync detection via CRC32 checksums
- Deterministic RNG ensures identical simulations across clients

**WebSocket Flow:**
1. Client creates/joins lobby (4-digit code: XXXX-NNNN)
2. Host configures match (map, teams)
3. Game starts → lockstep begins
4. Commands sent to server → broadcast to all clients
5. All clients execute commands on same tick

### Rendering Optimizations

**Instanced Rendering:**
- `InstancedUnitRenderer.ts` - Batches units of same type into single draw call
- Shared geometry cache reduces memory usage
- Three.js layers for selective rendering (minimap, main scene, UI)

**Performance Systems:**
- `VectorPool.ts` - Object pooling for per-frame Vector3 allocations
- Spatial hashing in managers for O(1) proximity queries
- Projectile pooling (reusable projectile objects)

## Performance Guidelines

### Mandatory Performance Checks

**Every new feature must pass these checks:**

1. **Load Test:** Test with 100+ units on screen simultaneously
2. **FPS Verification:** Maintain 60 FPS constant during:
   - Heavy combat (20+ units firing)
   - Large selections (50+ units)
   - Rapid camera movement
   - Map generation
3. **Profiling:** Use browser DevTools Performance tab to identify bottlenecks
4. **Memory:** No memory leaks over 5+ minute sessions

### Performance Best Practices

**DO:**
- ✅ Use object pooling for frequently allocated objects (VectorPool)
- ✅ Cache expensive calculations (don't recalculate each frame)
- ✅ Use spatial hashing for proximity queries (O(1) instead of O(n²))
- ✅ Batch similar operations (instanced rendering)
- ✅ Early-exit loops when possible
- ✅ Use fixed timestep (60 Hz) for deterministic logic
- ✅ Reuse geometries and materials across units
- ✅ Limit draw calls (aim for <100 per frame)
- ✅ Use `requestAnimationFrame` for rendering
- ✅ Profile before and after changes

**DON'T:**
- ❌ Allocate objects in update loops (use pooling)
- ❌ Use `Array.filter()`, `.map()`, `.find()` in hot paths (creates new arrays)
- ❌ Perform O(n²) operations every frame
- ❌ Create new Vector3/Quaternion every frame
- ❌ Use `forEach` in performance-critical code (slower than for-loops)
- ❌ Add expensive operations to `update()` without measuring impact
- ❌ Create new materials/geometries at runtime
- ❌ Use raycasting excessively (limit to user input)
- ❌ Iterate over all units every frame (use spatial queries)
- ❌ Add features without profiling first

### Critical Performance Patterns

**1. Object Pooling (REQUIRED for per-frame allocations):**
```typescript
// Bad - allocates 60 Vector3s per second
function update(dt: number) {
  const direction = new THREE.Vector3();
  direction.copy(target).sub(position);
}

// Good - reuses pooled vectors
function update(dt: number) {
  const direction = VectorPool.acquire();
  direction.copy(target).sub(position);
  // ... use direction ...
  VectorPool.release(direction);
}
```

**2. Spatial Queries (REQUIRED for proximity checks):**
```typescript
// Bad - O(n²) every frame
for (const unit of allUnits) {
  for (const other of allUnits) {
    if (unit.position.distanceTo(other.position) < range) {
      // do something
    }
  }
}

// Good - O(1) with spatial hashing
const nearbyUnits = unitManager.getUnitsInRadius(position, range);
for (const unit of nearbyUnits) {
  // do something
}
```

**3. Cached Calculations:**
```typescript
// Bad - recalculates every frame
function update() {
  const maxRange = Math.max(...weapons.map(w => w.range));
}

// Good - calculate once, cache result
private cachedMaxRange: number = -1;

function getMaxRange(): number {
  if (this.cachedMaxRange === -1) {
    this.cachedMaxRange = Math.max(...weapons.map(w => w.range));
  }
  return this.cachedMaxRange;
}
```

**4. Early Exit Patterns:**
```typescript
// Bad - checks all units even after finding match
for (const unit of units) {
  if (unit.id === targetId) {
    result = unit;
  }
}

// Good - exits immediately
for (const unit of units) {
  if (unit.id === targetId) {
    return unit;
  }
}
```

### Performance Measurement

**FPS Overlay:**
The game displays FPS in the top-right corner. If it drops below 60, investigate immediately.

**BenchmarkManager:**
```typescript
// Measure performance of a code block
const startTime = performance.now();
// ... code to measure ...
const elapsed = performance.now() - startTime;
console.log(`Operation took ${elapsed.toFixed(2)}ms`);
```

**Browser DevTools:**
1. Open DevTools (F12)
2. Performance tab → Record
3. Perform the action to test
4. Stop recording
5. Analyze flame graph for bottlenecks

**Target Metrics:**
- `fixedUpdate()` total: <10ms
- `render()` call: <6ms
- Individual manager updates: <1ms each
- Particle systems: <0.5ms
- UI updates: <0.5ms

### Existing Optimizations (DO NOT BREAK)

These systems are critical for maintaining 60 FPS:

1. **VectorPool** - Reuses Vector3 objects (saves ~10-20ms per frame)
2. **Instanced Rendering** - Batches unit rendering (reduces draw calls by 90%)
3. **Spatial Hashing** - Fast proximity queries in UnitManager
4. **Shared Geometry Cache** - Units of same type share meshes
5. **Fixed Timestep** - Consistent 60 Hz logic updates
6. **Projectile Pooling** - Reusable projectile objects
7. **Lazy Material Creation** - Materials created once, reused
8. **Shadow Map Optimization** - Limited shadow updates

**If you modify these systems, verify performance is maintained.**

### Performance Testing Checklist

Before committing new features:

- [ ] Tested with 100+ units on screen
- [ ] FPS stays at 60 during heavy combat
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] No new allocations in update loops
- [ ] Used object pooling where applicable
- [ ] Profiled with DevTools Performance tab
- [ ] Verified no O(n²) operations in hot paths
- [ ] Checked that existing optimizations still work
- [ ] Measured specific feature cost (<1ms preferred)

### File Organization

```
web/src/
├── core/                    # Engine foundation
│   ├── Game.ts             # Central orchestrator (main loop, manager registration)
│   ├── CameraController.ts # WASD/mouse camera control
│   ├── ScreenManager.ts    # UI screen state machine
│   └── UINotifications.ts  # Modal dialogs
├── game/
│   ├── managers/           # 14 game system managers
│   ├── units/Unit.ts       # Unit class (health, morale, combat, movement)
│   ├── map/                # Terrain generation and rendering
│   ├── multiplayer/        # Lockstep sync, command protocol
│   ├── rendering/          # Instanced rendering, path visualization
│   ├── combat/             # Damage calculation utilities
│   ├── audio/              # Audio manager
│   ├── effects/            # Damage numbers, visual effects
│   ├── ui/                 # Minimap renderer
│   ├── economy/            # Credit system
│   ├── debug/              # Benchmark tools
│   ├── utils/              # VectorPool, LayerConstants
│   └── world/              # World state
├── data/                   # Game content database
│   ├── factions.ts         # Units, weapons, divisions (main data file)
│   ├── types.ts            # TypeScript type definitions
│   ├── starterDecks.ts     # Pre-made decks
│   └── biomeConfigs.ts     # Map biome settings
└── screens/                # UI screen implementations
    ├── MainMenuScreen.ts
    ├── DeckBuilderScreen.ts
    ├── SkirmishSetupScreen.ts
    ├── GameLobbyScreen.ts
    └── SettingsScreen.ts
```

## Key Systems

### Unit System

**Unit Categories:**
- `LOG` - Logistics/commanders (can capture zones)
- `INF` - Infantry
- `TNK` - Tanks
- `REC` - Reconnaissance
- `AA` - Anti-air
- `ART` - Artillery
- `HEL` - Helicopters
- `AIR` - Fixed-wing aircraft

**Core Mechanics:**
- **Directional armor** - 4 facings (front > side > rear > top)
- **Morale system** - 0-100%, affects accuracy, routing at 0%
- **Suppression** - Reduces effectiveness without dealing damage
- **Movement types** - Normal, fast move, reverse, attack-move
- **Command queuing** - Shift+RightClick to queue orders

### Terrain System

**Elevation:**
- `game.getElevationAt(x, z)` - O(1) bilinear interpolated height lookup
- `TerrainCell` grid with elevation data
- Units clamp to terrain height every frame

**Terrain-Aware Movement:**
- Ground units check slope before moving (max 45° = slope 1.0)
- Aircraft (HEL, AIR) maintain 20m altitude above terrain
- Slope validation prevents cliff clipping

### Combat System

**Damage Calculation:**
1. Base damage from weapon
2. Range modifier (damage falloff over distance)
3. Armor penetration check (penetration vs armor value)
4. Hit chance based on accuracy × morale
5. Facing modifier (front armor strongest)
6. Suppression applied separately

**Weapon Slots:**
- Units can have multiple weapons (primary, secondary, AA, smoke)
- Each weapon has independent firing logic
- Auto-targeting based on unit category (ground vs air)

## Adding New Content

### Adding a New Unit

1. **Define the unit in `web/src/data/factions.ts`:**
   ```typescript
   {
     id: 'my_unit',
     name: 'My Unit',
     category: 'INF',
     maxHealth: 100,
     speed: 5,
     rotationSpeed: 3,
     frontArmor: 2,
     sideArmor: 1,
     rearArmor: 1,
     topArmor: 1,
     // ... other stats
   }
   ```

2. **Add to division roster:**
   ```typescript
   divisions: [{
     id: 'my_division',
     units: ['my_unit', /* ... */]
   }]
   ```

3. Unit appears in deck builder automatically.

### Adding a New Manager

1. Create manager class in `web/src/game/managers/`
2. Implement `fixedUpdate(dt: number)` and/or `update(dt: number)`
3. Register in `Game.ts` constructor
4. Initialize in `Game.initialize()`
5. Call update method in game loop
6. **CRITICAL:** Profile the update method - it must complete in <1ms with 100+ units

### Adding a New Weapon

1. **Add to WEAPONS array in `web/src/data/factions.ts`:**
   ```typescript
   {
     id: 'my_weapon',
     name: 'My Weapon',
     damage: 50,
     rateOfFire: 10, // rounds per minute
     range: 100,
     accuracy: 0.8,
     penetration: 5,
     suppression: 10,
     isAntiAir: false,
     canTargetGround: true
   }
   ```

2. **Assign to unit weapon slots:**
   ```typescript
   primaryWeapon: 'my_weapon'
   ```

## Testing Guidelines

**Unit Tests (`web/tests/unit/`):**
- Use Vitest `describe`/`it`/`expect` syntax
- Mock `Game` class for isolation
- Test pure logic functions independently
- Current coverage: 19+ tests

**Test Structure:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Unit } from '../../src/game/units/Unit';
import { mockGame } from '../mocks/Game';

describe('Unit', () => {
  let game: Game;

  beforeEach(() => {
    game = mockGame();
  });

  it('should take damage correctly', () => {
    const unit = new Unit(game, unitData, team, position);
    unit.takeDamage(30);
    expect(unit.health).toBe(70);
  });
});
```

## TypeScript Configuration

**Strict Mode Enabled:**
- All strict checks active (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`)
- Target: ES2022
- Module resolution: Bundler
- Path aliases configured in `vite.config.ts`

**Type Safety:**
- Prefer explicit types over `any`
- Use union types for state enums
- Null safety enforced (`strictNullChecks`)

## Common Patterns

### Manager Pattern
```typescript
export class MyManager {
  constructor(private game: Game) {}

  initialize(): void {
    // Setup code
  }

  fixedUpdate(dt: number): void {
    // 60 Hz game logic
  }

  update(dt: number): void {
    // Variable framerate rendering
  }
}
```

### Screen Pattern
```typescript
export class MyScreen {
  private container: HTMLElement;

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  destroy(): void {
    this.container.remove();
  }
}
```

### Vector Pooling (Performance)
```typescript
// Bad - allocates new Vector3 every frame
const direction = targetPos.clone().sub(currentPos);

// Good - use pool
const direction = VectorPool.acquire();
direction.copy(targetPos).sub(currentPos);
// ... use direction ...
VectorPool.release(direction);
```

## Game Constants

Key constants are in `web/src/data/types.ts` under `GAME_CONSTANTS`:
- `STARTING_CREDITS: 1500`
- `INCOME_PER_TICK: 10` (every 4 seconds)
- `VICTORY_THRESHOLD: 2000`
- `MAX_TRAVERSABLE_SLOPE: 1.0` (45 degrees)
- `HELICOPTER_FLIGHT_ALTITUDE: 20` (meters)

## Known Limitations

The prototype is missing these planned features:
- Path visualization (waypoint lines)
- Formation controls (line drawing)
- Tactical view icons (zoom-out unit icons)
- Unit status UI (health/morale bars)
- Complete fog of war
- Functional minimap
- Battle reinforcements (mid-game deployments)
- Transport/garrison mechanics

See README.md for full status.

## Debugging

**Browser Console:**
- Press F12 to open developer console
- Game logs important events
- Check for Three.js warnings

**FPS Overlay (CRITICAL):**
- Displayed in top-right corner during gameplay
- Shows current framerate
- **MUST stay at 60 FPS - if it drops, find and fix the bottleneck immediately**

**Performance Profiling:**
1. **Chrome DevTools Performance Tab:**
   - Record gameplay session
   - Analyze flame graph for expensive functions
   - Look for long frames (>16.67ms)
   - Identify allocation hot spots

2. **BenchmarkManager:**
   - Tracks performance metrics per system
   - Use for profiling optimization changes
   - Measure before/after comparisons

3. **Memory Profiling:**
   - Chrome DevTools Memory tab
   - Take heap snapshots
   - Check for memory leaks (growing heap over time)
   - Verify object pooling is working

**Performance Red Flags:**
- FPS drops below 60
- Frame times spike above 16.67ms
- Memory usage continuously grows
- Garbage collection pauses visible
- Manager update takes >1ms

## Key Gameplay Mechanics

### Deck Building
- 50 activation point limit
- Each unit costs activation points
- Decks saved to localStorage

### Deployment Phase
- 1500 starting credits
- Units cost credits to deploy
- Must deploy in designated zone

### Battle Phase
- Income: +10 credits every 4 seconds
- Victory: First to 2000 points
- Points earned by holding capture zones
- Only LOG category units can capture

### Controls Reference
- **Selection:** Left-click, drag for box select
- **Movement:** Right-click
- **Attack:** Right-click enemy
- **Control Groups:** Ctrl+1-9 to assign, 1-9 to recall
- **Camera:** WASD, mouse wheel zoom, edge pan
- **Special Orders:** R+Click (reverse), F+Click (fast move), A+Click (attack-move)

## Project Status

**Version:** 0.5.0-alpha
**Playable:** Yes
**Multiplayer:** WebSocket server functional
**Feature Complete:** ~55-60%

Focus areas for future development:
1. UI polish (health bars, status indicators)
2. Path visualization
3. Fog of war completion
4. Transport/garrison system
5. Battle reinforcements

## Final Reminder: Performance is Non-Negotiable

**Every feature, no matter how small, must maintain 60 FPS.**

This is not a suggestion or a nice-to-have. The game's core experience depends on smooth, responsive performance. If a feature cannot be implemented while maintaining 60 FPS, it must be:
1. Redesigned with performance in mind
2. Implemented with optimizations (pooling, caching, batching)
3. Deferred until a performant approach is found

**Test every change with 100+ units on screen. Profile every new system. Measure every optimization.**

The game loop runs at 60 Hz. Each frame has 16.67ms. Budget accordingly:
- 10ms for game logic (movement, combat, AI)
- 6ms for rendering (Three.js, draw calls)
- 0.67ms buffer for browser overhead

Use the tools provided: FPS overlay, BenchmarkManager, Chrome DevTools. Performance degradation is a bug and must be fixed before merging.
