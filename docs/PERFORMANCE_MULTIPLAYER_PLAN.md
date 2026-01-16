# Performance Optimization & Multiplayer Architecture Plan

## Ralph Loop Instructions

This document is designed for iterative implementation using the ralph loop technique. Each phase is broken into discrete, self-contained tasks that can be completed one at a time.

### How to Use This Plan with Ralph Loop

1. **Start at Phase 1, Task 1** - Work sequentially through tasks
2. **One task per iteration** - Complete, test, and commit each task before moving on
3. **Mark tasks complete** - Update the checkbox when done: `[ ]` → `[x]`
4. **Run tests after each task** - `cd web && npm test`
5. **If blocked** - Note the blocker and move to next independent task

### Task Format
Each task includes:
- **Goal**: What to accomplish
- **Files**: Which files to create/modify
- **Implementation**: Specific code changes needed
- **Verification**: How to confirm it works
- **Commit message**: Suggested commit format

---

## Phase 1: Object Pooling & Vector Reuse

### Task 1.1: Create Generic Object Pool
- [x] **Status: Completed**

**Goal:** Create reusable object pool infrastructure

**Files to create:**
- `web/src/game/utils/ObjectPool.ts`

**Implementation:**
```typescript
export interface IPoolable {
  reset(): void;
  active: boolean;
}

export class ObjectPool<T extends IPoolable> {
  private pool: T[] = [];
  private factory: () => T;
  private maxSize: number;

  constructor(factory: () => T, initialSize: number, maxSize: number) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.preWarm(initialSize);
  }

  preWarm(count: number): void {
    for (let i = 0; i < count; i++) {
      const obj = this.factory();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  acquire(): T | null {
    for (const obj of this.pool) {
      if (!obj.active) {
        obj.active = true;
        return obj;
      }
    }
    if (this.pool.length < this.maxSize) {
      const obj = this.factory();
      obj.active = true;
      this.pool.push(obj);
      return obj;
    }
    return null;
  }

  release(obj: T): void {
    obj.active = false;
    obj.reset();
  }

  getStats(): { active: number; total: number } {
    const active = this.pool.filter(o => o.active).length;
    return { active, total: this.pool.length };
  }
}
```

**Verification:**
- File compiles without errors
- Write a simple test: create pool, acquire/release objects

**Commit:** `feat: add generic ObjectPool utility for object reuse`

---

### Task 1.2: Create Vector3 Pool
- [x] **Status: Completed**

**Goal:** Pool for reusing THREE.Vector3 instances within a frame

**Files to create:**
- `web/src/game/utils/VectorPool.ts`

**Implementation:**
```typescript
import * as THREE from 'three';

class VectorPoolClass {
  private vectors: THREE.Vector3[] = [];
  private index: number = 0;
  private readonly POOL_SIZE = 200;

  constructor() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      this.vectors.push(new THREE.Vector3());
    }
  }

  acquire(): THREE.Vector3 {
    if (this.index >= this.vectors.length) {
      // Expand pool if needed
      this.vectors.push(new THREE.Vector3());
    }
    return this.vectors[this.index++].set(0, 0, 0);
  }

  reset(): void {
    this.index = 0;
  }
}

export const VectorPool = new VectorPoolClass();
```

**Verification:**
- File compiles without errors
- Test: acquire multiple vectors, reset, acquire again

**Commit:** `feat: add VectorPool for per-frame Vector3 reuse`

---

### Task 1.3: Integrate VectorPool Reset in Game Loop
- [x] **Status: Completed**

**Goal:** Reset vector pool at start of each frame

**Files to modify:**
- `web/src/core/Game.ts`

**Implementation:**
1. Add import at top: `import { VectorPool } from '../game/utils/VectorPool';`
2. In `update()` method (around line 415), add at the very start:
```typescript
VectorPool.reset();
```

**Verification:**
- Game runs without errors
- Add console.log in reset() temporarily to verify it's called each frame

**Commit:** `feat: integrate VectorPool reset into game loop`

---

### Task 1.4: Create Pooled Projectile Class
- [x] **Status: Completed**

**Goal:** Create a poolable projectile mesh wrapper

**Files to create:**
- `web/src/game/combat/PooledProjectile.ts`

**Implementation:**
```typescript
import * as THREE from 'three';
import type { IPoolable } from '../utils/ObjectPool';

export class PooledProjectile implements IPoolable {
  mesh: THREE.Mesh;
  active: boolean = false;

  // Projectile data
  start: THREE.Vector3 = new THREE.Vector3();
  target: THREE.Vector3 = new THREE.Vector3();
  progress: number = 0;
  speed: number = 0;
  sourceTeam: 'player' | 'enemy' | 'ally' = 'player';
  damage: number = 0;
  targetUnitId: string = '';
  weaponId: string = '';
  attackerId: string = '';

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
  }

  reset(): void {
    this.mesh.visible = false;
    this.progress = 0;
    this.speed = 0;
    this.damage = 0;
    this.targetUnitId = '';
    this.weaponId = '';
    this.attackerId = '';
  }

  activate(
    start: THREE.Vector3,
    target: THREE.Vector3,
    speed: number,
    damage: number,
    sourceTeam: 'player' | 'enemy' | 'ally',
    targetUnitId: string,
    weaponId: string,
    attackerId: string,
    material: THREE.Material
  ): void {
    this.start.copy(start);
    this.target.copy(target);
    this.speed = speed;
    this.damage = damage;
    this.sourceTeam = sourceTeam;
    this.targetUnitId = targetUnitId;
    this.weaponId = weaponId;
    this.attackerId = attackerId;
    this.progress = 0;
    this.mesh.material = material;
    this.mesh.position.copy(start);
    this.mesh.visible = true;
    this.active = true;
  }
}
```

**Verification:**
- File compiles without errors

**Commit:** `feat: add PooledProjectile class for projectile pooling`

---

### Task 1.5: Integrate Projectile Pool into CombatManager
- [x] **Status: Completed**

**Goal:** Replace per-shot mesh creation with pooled projectiles

**Files to modify:**
- `web/src/game/managers/CombatManager.ts`

**Implementation:**
1. Add imports:
```typescript
import { ObjectPool } from '../utils/ObjectPool';
import { PooledProjectile } from '../combat/PooledProjectile';
```

2. Add pool property (after line 50):
```typescript
private projectilePool: ObjectPool<PooledProjectile>;
```

3. Initialize pool in constructor (after geometry/material setup):
```typescript
this.projectilePool = new ObjectPool<PooledProjectile>(
  () => new PooledProjectile(this.projectileGeometry, this.projectileMaterials.player),
  100,  // initial size
  500   // max size
);

// Add all pooled meshes to scene
for (let i = 0; i < 100; i++) {
  const proj = this.projectilePool.acquire();
  if (proj) {
    this.game.scene.add(proj.mesh);
    this.projectilePool.release(proj);
  }
}
```

4. Replace mesh creation in fireProjectile (around lines 146-180):
```typescript
// OLD: const mesh = new THREE.Mesh(...)
// NEW:
const pooledProj = this.projectilePool.acquire();
if (!pooledProj) return; // Pool exhausted

const material = attacker.team === 'player'
  ? this.projectileMaterials.player
  : this.projectileMaterials.enemy;

pooledProj.activate(
  startPos,
  targetPos,
  projectileSpeed,
  baseDamage,
  attacker.team,
  target.id,
  weapon.id,
  attacker.id,
  material
);

// Store reference (may need to change projectiles Map to use PooledProjectile)
```

5. Update projectile removal in update() to release back to pool

**Verification:**
- Game compiles and runs
- Projectiles appear and disappear correctly
- Monitor `renderer.info.memory.geometries` - should stay constant during combat

**Commit:** `feat: integrate projectile pooling in CombatManager`

---

### Task 1.6: Use VectorPool in CombatManager
- [x] **Status: Completed**

**Goal:** Replace Vector3 allocations with pooled vectors

**Files to modify:**
- `web/src/game/managers/CombatManager.ts`

**Implementation:**
1. Add import: `import { VectorPool } from '../utils/VectorPool';`

2. In projectile update loop (around line 191), replace:
```typescript
// OLD:
const direction = proj.target.clone().sub(proj.start).normalize();

// NEW:
const direction = VectorPool.acquire();
direction.copy(proj.target).sub(proj.start).normalize();
```

3. In checkLOSPath (around lines 455, 462), replace:
```typescript
// OLD:
const direction = new THREE.Vector3().subVectors(endPos, startPos);
const point = new THREE.Vector3().lerpVectors(startPos, endPos, t);

// NEW:
const direction = VectorPool.acquire().subVectors(endPos, startPos);
const point = VectorPool.acquire().lerpVectors(startPos, endPos, t);
```

4. In fireProjectile forward vector calculation (lines 107, 116, 131):
```typescript
// OLD:
const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(attacker.mesh.quaternion);

// NEW:
const forward = VectorPool.acquire().set(0, 0, 1).applyQuaternion(attacker.mesh.quaternion);
```

**Verification:**
- Game runs without visual changes
- Profile shows reduced GC pressure

**Commit:** `perf: use VectorPool in CombatManager to reduce allocations`

---

## Phase 2: Spatial Partitioning

### Task 2.1: Create Spatial Hash Grid
- [x] **Status: Completed**

**Goal:** Create efficient spatial lookup structure for units

**Files to create:**
- `web/src/game/utils/SpatialHashGrid.ts`

**Implementation:**
```typescript
import * as THREE from 'three';

export class SpatialHashGrid<T extends { position: THREE.Vector3; id: string }> {
  private cells: Map<string, Set<T>> = new Map();
  private entityCells: Map<string, string> = new Map(); // entity id -> cell key
  private cellSize: number;

  constructor(cellSize: number = 50) {
    this.cellSize = cellSize;
  }

  private getCellKey(x: number, z: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);
    return `${cellX},${cellZ}`;
  }

  insert(entity: T): void {
    const key = this.getCellKey(entity.position.x, entity.position.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(entity);
    this.entityCells.set(entity.id, key);
  }

  remove(entity: T): void {
    const key = this.entityCells.get(entity.id);
    if (key) {
      this.cells.get(key)?.delete(entity);
      this.entityCells.delete(entity.id);
    }
  }

  update(entity: T): void {
    const oldKey = this.entityCells.get(entity.id);
    const newKey = this.getCellKey(entity.position.x, entity.position.z);

    if (oldKey !== newKey) {
      if (oldKey) {
        this.cells.get(oldKey)?.delete(entity);
      }
      if (!this.cells.has(newKey)) {
        this.cells.set(newKey, new Set());
      }
      this.cells.get(newKey)!.add(entity);
      this.entityCells.set(entity.id, newKey);
    }
  }

  queryRadius(center: THREE.Vector3, radius: number): T[] {
    const results: T[] = [];
    const radiusSq = radius * radius;

    const minCellX = Math.floor((center.x - radius) / this.cellSize);
    const maxCellX = Math.floor((center.x + radius) / this.cellSize);
    const minCellZ = Math.floor((center.z - radius) / this.cellSize);
    const maxCellZ = Math.floor((center.z + radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const cell = this.cells.get(`${cx},${cz}`);
        if (cell) {
          for (const entity of cell) {
            const dx = entity.position.x - center.x;
            const dz = entity.position.z - center.z;
            if (dx * dx + dz * dz <= radiusSq) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  clear(): void {
    this.cells.clear();
    this.entityCells.clear();
  }
}
```

**Verification:**
- File compiles without errors
- Unit test: insert entities, query radius, verify results

**Commit:** `feat: add SpatialHashGrid for O(1) proximity queries`

---

### Task 2.2: Integrate Spatial Grid into UnitManager
- [x] **Status: Completed**

**Goal:** Add spatial indexing to UnitManager

**Files to modify:**
- `web/src/game/managers/UnitManager.ts`

**Implementation:**
1. Add import: `import { SpatialHashGrid } from '../utils/SpatialHashGrid';`

2. Add properties (around line 26):
```typescript
private spatialGrid: SpatialHashGrid<Unit>;
private unitsByTeam: {
  player: Unit[];
  enemy: Unit[];
  ally: Unit[];
  all: Unit[];
} = { player: [], enemy: [], ally: [], all: [] };
```

3. Initialize in constructor:
```typescript
this.spatialGrid = new SpatialHashGrid<Unit>(50); // 50m cells
```

4. Update `addUnit()` method:
```typescript
addUnit(unit: Unit): void {
  this.units.set(unit.id, unit);
  this.spatialGrid.insert(unit);
  this.rebuildTeamArrays();
}
```

5. Update `removeUnit()` method:
```typescript
removeUnit(unit: Unit): void {
  this.units.delete(unit.id);
  this.spatialGrid.remove(unit);
  this.rebuildTeamArrays();
}
```

6. Add helper method:
```typescript
private rebuildTeamArrays(): void {
  this.unitsByTeam.all = Array.from(this.units.values());
  this.unitsByTeam.player = this.unitsByTeam.all.filter(u => u.team === 'player');
  this.unitsByTeam.enemy = this.unitsByTeam.all.filter(u => u.team === 'enemy');
  this.unitsByTeam.ally = this.unitsByTeam.all.filter(u => u.team === 'ally');
}
```

7. Replace `getAllUnits()`:
```typescript
getAllUnits(team?: 'player' | 'enemy' | 'ally'): readonly Unit[] {
  if (team) return this.unitsByTeam[team];
  return this.unitsByTeam.all;
}
```

8. Add new method:
```typescript
getUnitsInRadius(center: THREE.Vector3, radius: number, team?: 'player' | 'enemy' | 'ally'): Unit[] {
  const units = this.spatialGrid.queryRadius(center, radius);
  if (team) {
    return units.filter(u => u.team === team);
  }
  return units;
}
```

9. In `fixedUpdate()`, update spatial positions for all units:
```typescript
fixedUpdate(dt: number): void {
  for (const unit of this.units.values()) {
    this.spatialGrid.update(unit);
    unit.fixedUpdate(dt);
  }
}
```

**Verification:**
- Game runs without errors
- Units still selectable and commandable
- Test: spawn units, verify getUnitsInRadius returns correct results

**Commit:** `feat: integrate SpatialHashGrid into UnitManager`

---

### Task 2.3: Optimize Commander Aura with Spatial Queries
- [x] **Status: Completed**

**Goal:** Reduce O(n²) commander aura to O(k) using spatial queries

**Files to modify:**
- `web/src/game/units/Unit.ts`

**Implementation:**
Find `calculateCommanderAura()` (around lines 324-350) and replace:
```typescript
// OLD (around line 330):
const friendlyUnits = this.game.unitManager.getAllUnits(this.team);

// NEW:
const MAX_AURA_RADIUS = 100; // Max possible aura range
const friendlyUnits = this.game.unitManager.getUnitsInRadius(
  this.position,
  MAX_AURA_RADIUS,
  this.team
);
```

**Verification:**
- Commander aura still applies to nearby units
- Profile shows reduced time in calculateCommanderAura()

**Commit:** `perf: optimize commander aura calculation with spatial queries`

---

### Task 2.4: Optimize AI Nearest Enemy with Spatial Queries
- [x] **Status: Completed**

**Goal:** Reduce O(n) nearest enemy search using spatial grid

**Files to modify:**
- `web/src/game/managers/AIManager.ts`

**Implementation:**
Find `findNearestEnemy()` (around lines 480-510) and replace:
```typescript
// OLD:
const playerUnits = this.game.unitManager.getAllUnits('player');

// NEW:
const SEARCH_RADIUS = 300; // Max engagement range
const playerUnits = this.game.unitManager.getUnitsInRadius(
  unit.position,
  SEARCH_RADIUS,
  'player'
);
```

Do the same for `findNearestEnemyInRange()` if it exists.

**Verification:**
- AI still targets and attacks player units
- Profile shows reduced time in AI decision loop

**Commit:** `perf: optimize AI nearest enemy search with spatial queries`

---

## Phase 3: Geometry Sharing & FOW Optimization

### Task 3.1: Create Shared Geometry Cache
- [x] **Status: Completed**

**Goal:** Share geometries across all units of same type

**Files to create:**
- `web/src/game/utils/SharedGeometryCache.ts`

**Implementation:**
```typescript
import * as THREE from 'three';

const geometryCache = new Map<string, THREE.BufferGeometry>();

const CATEGORY_GEOMETRIES: Record<string, () => THREE.BufferGeometry> = {
  'INF': () => new THREE.BoxGeometry(0.8, 1.8, 0.5),
  'REC': () => new THREE.BoxGeometry(2, 1.2, 3),
  'TNK': () => new THREE.BoxGeometry(3, 1.5, 4),
  'VHC': () => new THREE.BoxGeometry(2.5, 1.5, 4),
  'ART': () => new THREE.BoxGeometry(2.5, 1.2, 5),
  'AA': () => new THREE.BoxGeometry(2.5, 2, 4),
  'HEL': () => new THREE.BoxGeometry(3, 1.5, 8),
  'PLN': () => new THREE.BoxGeometry(4, 1, 10),
  'LOG': () => new THREE.BoxGeometry(2.5, 2, 5),
};

export const CATEGORY_HEIGHTS: Record<string, number> = {
  'INF': 1.8, 'REC': 1.2, 'TNK': 1.5, 'VHC': 1.5,
  'ART': 1.2, 'AA': 2, 'HEL': 1.5, 'PLN': 1, 'LOG': 2,
};

export function getUnitGeometry(category: string): THREE.BufferGeometry {
  const key = category || 'INF';
  if (!geometryCache.has(key)) {
    const factory = CATEGORY_GEOMETRIES[key] || CATEGORY_GEOMETRIES['INF'];
    const geometry = factory();
    geometry.computeBoundingSphere();
    geometryCache.set(key, geometry);
  }
  return geometryCache.get(key)!;
}

export function disposeAllGeometries(): void {
  for (const geometry of geometryCache.values()) {
    geometry.dispose();
  }
  geometryCache.clear();
}
```

**Verification:**
- File compiles without errors

**Commit:** `feat: add SharedGeometryCache for unit geometry reuse`

---

### Task 3.2: Integrate Shared Geometry in Unit.ts
- [x] **Status: Completed**

**Goal:** Use shared geometries instead of per-unit creation

**Files to modify:**
- `web/src/game/units/Unit.ts`

**Implementation:**
1. Add import:
```typescript
import { getUnitGeometry, CATEGORY_HEIGHTS } from '../utils/SharedGeometryCache';
```

2. Replace `createGeometry()` method (around lines 216-239):
```typescript
private createGeometry(): { geometry: THREE.BufferGeometry; height: number } {
  const category = this.unitData?.category ?? 'INF';
  return {
    geometry: getUnitGeometry(category),
    height: CATEGORY_HEIGHTS[category] ?? 1.8
  };
}
```

3. Update `dispose()` method (around lines 1372-1384) - remove geometry disposal:
```typescript
dispose(): void {
  // Remove from scene
  this.game.scene.remove(this.mesh);

  // Dispose materials (but NOT shared geometry)
  if (this.mesh.material instanceof THREE.Material) {
    // Only dispose if it's a unique material
    // this.mesh.material.dispose();
  }

  // ... rest of cleanup
}
```

**Verification:**
- Units still render correctly with proper shapes
- Check `renderer.info.memory.geometries` is lower with many units

**Commit:** `perf: use shared geometries for units`

---

### Task 3.3: FOW Incremental Update - Add Position Tracking
- [x] **Status: Completed**

**Goal:** Track unit positions to enable incremental FOW updates

**Files to modify:**
- `web/src/game/managers/FogOfWarManager.ts`

**Implementation:**
1. Add property (around line 40):
```typescript
private lastUnitPositions: Map<string, THREE.Vector3> = new Map();
private readonly MOVE_THRESHOLD_SQ = 25; // 5 meters squared
```

2. Modify `update()` method to use incremental updates (around lines 73-82):
```typescript
// Instead of clearing all vision:
// OLD: this.currentVision.clear();

// NEW: Only update units that moved significantly
const allUnits = this.game.unitManager.getAllUnits();
const movedUnits: Unit[] = [];

for (const unit of allUnits) {
  if (!unit.isAlive) continue;

  const lastPos = this.lastUnitPositions.get(unit.id);
  if (!lastPos) {
    // New unit - add to tracking
    this.lastUnitPositions.set(unit.id, unit.position.clone());
    movedUnits.push(unit);
  } else {
    const distSq = lastPos.distanceToSquared(unit.position);
    if (distSq > this.MOVE_THRESHOLD_SQ) {
      // Unit moved - update tracking
      lastPos.copy(unit.position);
      movedUnits.push(unit);
    }
  }
}

// Only recalculate vision for moved units
// (Full implementation would also clear old vision cells)
```

**Verification:**
- FOW still reveals/hides correctly
- Profile shows reduced FOW update time

**Commit:** `perf: add position tracking for incremental FOW updates`

---

## Phase 4: Deterministic Multiplayer Foundation

### Task 4.1: Create Deterministic RNG
- [x] **Status: Completed**

**Goal:** Replace Math.random() with seeded deterministic PRNG

**Files to create:**
- `web/src/game/utils/DeterministicRNG.ts`

**Implementation:**
```typescript
// Mulberry32 - fast, deterministic 32-bit PRNG
export class DeterministicRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  nextBool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

// Global game RNG instance
export const gameRNG = new DeterministicRNG(12345);

export function setGameSeed(seed: number): void {
  gameRNG.setState(seed);
}
```

**Verification:**
- Same seed produces same sequence of numbers
- Test: call next() 100 times, verify identical results with same seed

**Commit:** `feat: add DeterministicRNG for reproducible game simulation`

---

### Task 4.2: Replace Math.random() in CombatManager
- [x] **Status: Completed**

**Goal:** Make combat deterministic

**Files to modify:**
- `web/src/game/managers/CombatManager.ts`

**Implementation:**
1. Add import: `import { gameRNG } from '../utils/DeterministicRNG';`

2. Replace all Math.random() calls:
```typescript
// Line ~103 (hit chance):
// OLD: if (Math.random() > hitChance)
// NEW: if (gameRNG.next() > hitChance)

// Line ~141-142 (miss offset):
// OLD: const missOffset = (Math.random() - 0.5) * missRadius * 2;
// NEW: const missOffset = (gameRNG.next() - 0.5) * missRadius * 2;

// Line ~270 (penetration):
// OLD: if (Math.random() < penetrationChance)
// NEW: if (gameRNG.next() < penetrationChance)

// Line ~284 (critical hit):
// OLD: if (Math.random() < 0.1)
// NEW: if (gameRNG.nextBool(0.1))
```

**Verification:**
- Combat still works correctly
- Same battle with same seed produces identical results

**Commit:** `feat: use DeterministicRNG in CombatManager`

---

### Task 4.3: Replace Math.random() in Unit.ts
- [x] **Status: Completed**

**Goal:** Make unit behavior deterministic

**Files to modify:**
- `web/src/game/units/Unit.ts`

**Implementation:**
1. Add import: `import { gameRNG } from '../utils/DeterministicRNG';`

2. Find and replace all Math.random() calls with gameRNG equivalents

**Verification:**
- Unit behavior unchanged
- Same seed = same unit actions

**Commit:** `feat: use DeterministicRNG in Unit`

---

### Task 4.4: Replace Math.random() in AIManager
- [ ] **Status: Not Started**

**Goal:** Make AI deterministic

**Files to modify:**
- `web/src/game/managers/AIManager.ts`

**Implementation:**
1. Add import: `import { gameRNG } from '../utils/DeterministicRNG';`
2. Replace all Math.random() calls

**Verification:**
- AI behavior unchanged
- Same seed = same AI decisions

**Commit:** `feat: use DeterministicRNG in AIManager`

---

### Task 4.5: Create Command Protocol
- [ ] **Status: Not Started**

**Goal:** Define serializable command structure for multiplayer

**Files to create:**
- `web/src/game/multiplayer/CommandProtocol.ts`

**Implementation:**
```typescript
export enum CommandType {
  Move = 1,
  FastMove = 2,
  Reverse = 3,
  Attack = 4,
  AttackMove = 5,
  Stop = 6,
  Garrison = 7,
  Ungarrison = 8,
  SpawnUnit = 9,
}

export interface GameCommand {
  type: CommandType;
  tick: number;
  playerId: string;
  unitIds: string[];
  targetX?: number;
  targetZ?: number;
  targetUnitId?: string;
  queue?: boolean;
}

export function serializeCommand(cmd: GameCommand): string {
  return JSON.stringify(cmd);
}

export function deserializeCommand(data: string): GameCommand {
  return JSON.parse(data);
}

// Binary serialization can be added later for bandwidth optimization
```

**Verification:**
- Round-trip serialize/deserialize preserves all data

**Commit:** `feat: add CommandProtocol for multiplayer command serialization`

---

### Task 4.6: Create Tick Manager
- [ ] **Status: Not Started**

**Goal:** Manage game ticks for lockstep synchronization

**Files to create:**
- `web/src/game/multiplayer/TickManager.ts`

**Implementation:**
```typescript
import type { GameCommand } from './CommandProtocol';

export class TickManager {
  private currentTick: number = 0;
  private commandBuffer: Map<number, GameCommand[]> = new Map();
  private confirmedTick: number = 0;

  getCurrentTick(): number {
    return this.currentTick;
  }

  advanceTick(): void {
    this.currentTick++;
  }

  queueCommand(cmd: GameCommand): void {
    const tick = cmd.tick;
    if (!this.commandBuffer.has(tick)) {
      this.commandBuffer.set(tick, []);
    }
    this.commandBuffer.get(tick)!.push(cmd);
  }

  getCommandsForTick(tick: number): GameCommand[] {
    return this.commandBuffer.get(tick) || [];
  }

  confirmTick(tick: number): void {
    this.confirmedTick = tick;
    // Clean up old commands
    for (const [t] of this.commandBuffer) {
      if (t < tick - 100) {
        this.commandBuffer.delete(t);
      }
    }
  }

  reset(): void {
    this.currentTick = 0;
    this.confirmedTick = 0;
    this.commandBuffer.clear();
  }
}
```

**Verification:**
- Commands queue and retrieve correctly by tick

**Commit:** `feat: add TickManager for lockstep multiplayer`

---

## Phase 5: Server Validation & Client Prediction

### Task 5.1: Create State Checksum
- [ ] **Status: Not Started**

**Goal:** Detect desynchronization between clients

**Files to create:**
- `web/src/game/multiplayer/StateChecksum.ts`

**Implementation:**
```typescript
import type { Unit } from '../units/Unit';

// Fast hash combine
function hashCombine(h: number, v: number): number {
  return ((h << 5) - h + v) | 0;
}

export function computeGameStateChecksum(units: readonly Unit[]): number {
  let hash = 0;

  // Sort by ID for deterministic ordering
  const sorted = [...units].sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of sorted) {
    if (!unit.isAlive) continue;

    hash = hashCombine(hash, Math.floor(unit.position.x * 100));
    hash = hashCombine(hash, Math.floor(unit.position.z * 100));
    hash = hashCombine(hash, Math.floor(unit.health));
    hash = hashCombine(hash, Math.floor(unit.morale * 100));
  }

  return hash >>> 0; // Unsigned 32-bit
}
```

**Verification:**
- Same state produces same checksum
- Different states produce different checksums

**Commit:** `feat: add StateChecksum for desync detection`

---

### Task 5.2: Add Command Validation to Server
- [ ] **Status: Not Started**

**Goal:** Server validates commands before broadcasting

**Files to modify:**
- `server/server.ts`

**Implementation:**
Add command validation in message handler:
```typescript
case 'game_command':
  const cmd = JSON.parse(data.command);

  // Validate command
  if (this.validateCommand(ws, lobby, cmd)) {
    // Broadcast to all players in lobby
    this.broadcastToLobby(lobby.code, {
      type: 'game_command',
      command: data.command,
    });
  } else {
    ws.send(JSON.stringify({
      type: 'command_rejected',
      reason: 'Invalid command'
    }));
  }
  break;

// Add validation method
private validateCommand(ws: any, lobby: any, cmd: any): boolean {
  // Check player owns the units
  // Check tick is reasonable (not too far in future/past)
  // Check command type is valid
  return true; // Basic validation for now
}
```

**Verification:**
- Commands are broadcast to all clients
- Invalid commands are rejected

**Commit:** `feat: add command validation to multiplayer server`

---

### Task 5.3: Integrate Commands in MultiplayerBattleSync
- [ ] **Status: Not Started**

**Goal:** Process commands through TickManager instead of state sync

**Files to modify:**
- `web/src/game/multiplayer/MultiplayerBattleSync.ts`

**Implementation:**
1. Import TickManager and CommandProtocol
2. Replace state broadcasting with command sending
3. Process incoming commands through TickManager
4. Execute commands at appropriate tick

**Verification:**
- Commands sent from one client apply on other clients
- Game state stays synchronized

**Commit:** `feat: integrate command-based sync in MultiplayerBattleSync`

---

## Verification Checklist

### Performance Verification
- [ ] Frame time with 200 units < 16ms (60 FPS)
- [ ] GC pauses < 10ms during combat
- [ ] Memory stable during extended play
- [ ] `renderer.info.memory.geometries` constant after init

### Multiplayer Verification
- [ ] Same seed produces identical single-player battles
- [ ] Two clients stay synchronized for 5-minute battle
- [ ] Commands work with 200ms simulated latency
- [ ] Checksum matches between clients every 100 ticks

### Run All Tests
```bash
cd web && npm test
```
