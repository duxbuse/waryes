/**
 * FogOfWarManager - Manages vision and fog of war
 *
 * Features:
 * - Three visibility states: Visible, Explored, Unexplored
 * - Vision radius based on unit Optics stat
 * - Team vision sharing
 * - Real-time fog updates as units move
 * - Hides enemy units outside vision
 *
 * Performance optimizations:
 * - Single Uint8Array fogState grid (0/1/2) - zero GC, O(1) indexed access
 * - Renderer copies fogState directly to texture (no per-cell dirty tracking)
 * - Only processes player units (enemy vision irrelevant for fog overlay)
 * - Differential/crescent updates: only modifies changed cells when units move
 * - Reference counting for shared vision cells (no per-unit Set tracking)
 * - Geometric circle recomputation instead of per-unit index Sets
 */

import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import * as THREE from 'three';

import { getVisionRadiusForOptics } from '../../data/types';


export enum VisibilityState {
  Unexplored = 0,  // Never seen (black)
  Explored = 1,    // Previously seen (grayed)
  Visible = 2,     // Currently visible (full color)
}

export class FogOfWarManager {
  private readonly game: Game;
  private enabled = true;

  // Blocking grid for fast LOS checks (Terrain + Buildings + Forests)
  private blockingGrid: Float32Array | null = null;
  private blockingGridWidth = 0;
  private blockingGridHeight = 0;
  private blockingGridCellSize = 4;

  // Vision grid dimensions (computed from map in initializeGrids)
  private cellSize = 2; // Resolution of vision grid (meters per cell)
  private _gridWidth = 0;
  private _gridHeight = 0;
  private _gridOffsetX = 0;
  private _gridOffsetZ = 0;

  // Continuous fog state: 0=unexplored, 128=explored, 129-255=visible (smooth edge fade)
  // Renderer copies this directly to its R8 texture (bilinear filtering smooths further)
  private _fogState: Uint8Array | null = null;
  private refCountGrid: Uint8Array | null = null; // How many player units see each cell

  // Smooth edge fade: outermost FADE_CELLS of each vision circle get a gradient
  private readonly FADE_CELLS = 8; // 8 cells × 2m = 16m fade zone
  private _fogDirty = true; // Whether renderer needs to re-upload texture

  // Position + radius tracking for incremental updates (geometric recomputation, no per-unit Sets)
  private lastUnitPositions = new Map<string, THREE.Vector3>();
  private lastUnitRadii = new Map<string, number>(); // cached vision radius per unit
  private readonly MOVE_THRESHOLD_SQ = 9; // 3 meters squared

  // CRITICAL PERFORMANCE: Frame budget to prevent frame rate collapse
  private readonly MAX_VISION_UPDATES_PER_FRAME = 8;

  // Reusable set for tracking current unit IDs (avoids per-frame allocation)
  private readonly _currentUnitIds = new Set<string>();
  // Pre-allocated array for units needing vision updates (avoids per-frame array allocation)
  private readonly _unitsToUpdate: (Unit | null)[] = new Array(8).fill(null);

  constructor(game: Game) {
    this.game = game;
  }

  // Public accessors for renderer to copy fog state directly
  get fogState(): Uint8Array | null { return this._fogState; }
  get fogDirty(): boolean { return this._fogDirty; }
  get gridWidth(): number { return this._gridWidth; }
  get gridHeight(): number { return this._gridHeight; }
  get gridCellSize(): number { return this.cellSize; }

  clearFogDirty(): void { this._fogDirty = false; }

  /**
   * Initialize fog of war
   */
  initialize(): void {
    this.lastUnitPositions.clear();
    this.lastUnitRadii.clear();
    this.blockingGrid = null;
    this._fogDirty = true;
    this.initializeGrids();
  }

  /**
   * Allocate flat array grids based on current map size
   */
  private initializeGrids(): void {
    const map = this.game.currentMap;
    if (!map) return;

    this._gridWidth = Math.ceil(map.width / this.cellSize);
    this._gridHeight = Math.ceil(map.height / this.cellSize);
    this._gridOffsetX = Math.floor(map.width / (2 * this.cellSize));
    this._gridOffsetZ = Math.floor(map.height / (2 * this.cellSize));

    const totalCells = this._gridWidth * this._gridHeight;
    this._fogState = new Uint8Array(totalCells);
    this.refCountGrid = new Uint8Array(totalCells);
  }

  /**
   * Force an immediate fog of war update for all units
   * Used after initialization to reveal areas around already-deployed units
   */
  forceImmediateUpdate(teamFilter?: 'player' | 'enemy'): void {
    if (!this.enabled) return;

    if (!this.blockingGrid && this.game.currentMap) {
      this.initializeBlockingGrid();
    }
    if (!this._fogState) {
      this.initializeGrids();
    }

    const allUnits = teamFilter
      ? this.game.unitManager.getAllUnits(teamFilter)
      : this.game.unitManager.getAllUnits();

    // Clear current vision (keep explored state: clamp visible→explored)
    const fogState = this._fogState!;
    const refGrid = this.refCountGrid!;
    for (let i = 0, len = fogState.length; i < len; i++) {
      if (fogState[i]! > 128) fogState[i] = 128; // visible → explored
    }
    refGrid.fill(0);
    this.lastUnitPositions.clear();
    this.lastUnitRadii.clear();


    for (const unit of allUnits) {
      if (unit.health <= 0) continue;
      if (unit.team !== 'player') continue;

      this.lastUnitPositions.set(unit.id, unit.position.clone());
      this.addFullCircleVision(unit);
    }

    this.updateEnemyVisibility();

    // Keep refGrid and lastUnitRadii intact so regular update() can properly
    // clear/rebuild vision. Clearing them caused stationary units to lose
    // vision when other units moved.

    this._fogDirty = true;
    console.log('FOW: Forced immediate update for', allUnits.length, 'units', teamFilter ? `(${teamFilter} only)` : '');
  }

  /**
   * Update fog of war based on unit positions
   */
  update(_dt: number): void {
    if (!this.enabled) return;
    if (!this._fogState) return;

    if (!this.blockingGrid && this.game.currentMap) {
      this.initializeBlockingGrid();
    }

    const playerUnits = this.game.unitManager.getAllUnits('player');

    let anyUnitMoved = false;
    const currentUnitIds = this._currentUnitIds;
    currentUnitIds.clear();

    const updateQueue = this._unitsToUpdate;
    let updateCount = 0;
    const maxUpdates = this.MAX_VISION_UPDATES_PER_FRAME;

    for (const unit of playerUnits) {
      if (unit.health <= 0) continue;
      currentUnitIds.add(unit.id);

      const lastPos = this.lastUnitPositions.get(unit.id);
      if (!lastPos) {
        this.lastUnitPositions.set(unit.id, unit.position.clone());
        anyUnitMoved = true;
        if (updateCount < maxUpdates) {
          updateQueue[updateCount++] = unit;
        }
      } else {
        const dx = lastPos.x - unit.position.x;
        const dy = lastPos.y - unit.position.y;
        const dz = lastPos.z - unit.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > this.MOVE_THRESHOLD_SQ) {
          anyUnitMoved = true;
          if (updateCount < maxUpdates) {
            updateQueue[updateCount++] = unit;
          }
        }
      }
    }

    // Remove dead/despawned units
    for (const trackedId of this.lastUnitPositions.keys()) {
      if (!currentUnitIds.has(trackedId)) {
        this.clearVisionForUnit(trackedId);
        this.lastUnitPositions.delete(trackedId);
        this.lastUnitRadii.delete(trackedId);
        anyUnitMoved = true;
      }
    }

    if (!anyUnitMoved) {
      this.updateEnemyVisibility();
      return;
    }

    for (let i = 0; i < updateCount; i++) {
      const unit = updateQueue[i]!;
      updateQueue[i] = null; // Clear reference for GC

      const lastPos = this.lastUnitPositions.get(unit.id);
      if (lastPos && this.lastUnitRadii.has(unit.id)) {
        const dx = lastPos.x - unit.position.x;
        const dz = lastPos.z - unit.position.z;
        const moveDist = Math.sqrt(dx * dx + dz * dz);
        if (moveDist < this.cellSize * 3) {
          this.updateVisionDifferential(unit, lastPos);
        } else {
          this.clearVisionForUnit(unit.id);
          this.addFullCircleVision(unit);
        }
      } else {
        this.addFullCircleVision(unit);
      }

      const pos = this.lastUnitPositions.get(unit.id);
      if (pos) {
        pos.copy(unit.position);
      }
    }

    this.updateEnemyVisibility();
  }

  /**
   * Differential crescent update - only modifies cells that changed between old and new circles
   * Uses geometric circle checks with smooth edge fade values
   */
  private updateVisionDifferential(unit: Unit, oldPos: THREE.Vector3): void {
    const fogState = this._fogState!;
    const refGrid = this.refCountGrid!;

    const visionRadius = this.getVisionRadius(unit);
    this.lastUnitRadii.set(unit.id, visionRadius);
    const newX = unit.position.x;
    const newZ = unit.position.z;
    const oldX = oldPos.x;
    const oldZ = oldPos.z;

    const radiusSq = visionRadius * visionRadius;
    const cellSize = this.cellSize;
    const cellRadius = Math.ceil(visionRadius / cellSize);

    // Precompute fade zone boundaries
    const fadeWidth = this.FADE_CELLS * cellSize;
    const fadeStart = Math.max(0, visionRadius - fadeWidth);
    const fadeStartSq = fadeStart * fadeStart;
    const fadeRangeSq = radiusSq - fadeStartSq;

    const moveDistX = newX - oldX;
    const moveDistZ = newZ - oldZ;
    const moveDist = Math.sqrt(moveDistX * moveDistX + moveDistZ * moveDistZ);
    const expandCells = Math.ceil(moveDist / cellSize) + 1;
    const searchRadius = cellRadius + expandCells;

    const gridWidth = this._gridWidth;
    const gridHeight = this._gridHeight;
    const offsetX = this._gridOffsetX;
    const offsetZ = this._gridOffsetZ;
    let dirty = false;

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const worldX = newX + dx * cellSize;
      for (let dz = -searchRadius; dz <= searchRadius; dz++) {
        const worldZ = newZ + dz * cellSize;

        const dxNew = worldX - newX;
        const dzNew = worldZ - newZ;
        const newDistSq = dxNew * dxNew + dzNew * dzNew;
        const dxOld = worldX - oldX;
        const dzOld = worldZ - oldZ;
        const oldDistSq = dxOld * dxOld + dzOld * dzOld;

        const inNew = newDistSq <= radiusSq;
        const inOld = oldDistSq <= radiusSq;

        if (inNew === inOld) continue;

        const gx = Math.floor(worldX / cellSize) + offsetX;
        const gz = Math.floor(worldZ / cellSize) + offsetZ;
        if (gx < 0 || gx >= gridWidth || gz < 0 || gz >= gridHeight) continue;
        const idx = gz * gridWidth + gx;

        if (inNew) {
          // Cell entered vision: increment ref count + compute smooth edge value
          refGrid[idx] = refGrid[idx]! + 1;

          let value: number;
          if (newDistSq <= fadeStartSq) {
            value = 255;
          } else {
            const t = (newDistSq - fadeStartSq) / fadeRangeSq;
            value = 255 - ((t * 126) | 0);
          }

          if (value > fogState[idx]!) {
            fogState[idx] = value;
            dirty = true;
          }
        } else {
          // Cell left vision: decrement ref count
          const count = refGrid[idx]!;
          if (count <= 1) {
            refGrid[idx] = 0;
            if (fogState[idx]! > 128) {
              fogState[idx] = 128; // visible → explored
              dirty = true;
            }
          } else {
            refGrid[idx] = count - 1;
          }
        }
      }
    }

    if (dirty) this._fogDirty = true;
  }

  /**
   * Add full circle vision for a new unit (no LOS, simple circle)
   * Uses scanline rasterization with smooth edge fade (no per-unit Set tracking)
   */
  private addFullCircleVision(unit: Unit): void {
    const fogState = this._fogState!;
    const refGrid = this.refCountGrid!;

    const visionRadius = this.getVisionRadius(unit);
    this.lastUnitRadii.set(unit.id, visionRadius);
    const unitX = unit.position.x;
    const unitZ = unit.position.z;

    const radiusSq = visionRadius * visionRadius;
    const cellSize = this.cellSize;
    const cellRadius = Math.ceil(visionRadius / cellSize);

    // Precompute fade zone boundaries (squared, avoids sqrt in inner loop)
    const fadeWidth = this.FADE_CELLS * cellSize;
    const fadeStart = Math.max(0, visionRadius - fadeWidth);
    const fadeStartSq = fadeStart * fadeStart;
    const fadeRangeSq = radiusSq - fadeStartSq; // > 0 since fadeStart < visionRadius

    const gridWidth = this._gridWidth;
    const gridHeight = this._gridHeight;
    const offsetX = this._gridOffsetX;
    const offsetZ = this._gridOffsetZ;
    let dirty = false;

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      const worldX = unitX + dx * cellSize;
      // Scanline optimization: compute max dz for this row
      const dxWorld = dx * cellSize;
      const dxWorldSq = dxWorld * dxWorld;
      const remainingSq = radiusSq - dxWorldSq;
      if (remainingSq < 0) continue;
      const maxDz = Math.floor(Math.sqrt(remainingSq) / cellSize);

      for (let dz = -maxDz; dz <= maxDz; dz++) {
        const worldZ = unitZ + dz * cellSize;
        const gx = Math.floor(worldX / cellSize) + offsetX;
        const gz = Math.floor(worldZ / cellSize) + offsetZ;
        if (gx < 0 || gx >= gridWidth || gz < 0 || gz >= gridHeight) continue;
        const idx = gz * gridWidth + gx;

        refGrid[idx] = refGrid[idx]! + 1;

        // Compute continuous visibility value with smooth edge fade
        const dzWorld = dz * cellSize;
        const distSq = dxWorldSq + dzWorld * dzWorld;
        let value: number;
        if (distSq <= fadeStartSq) {
          value = 255; // fully visible (inside solid core)
        } else {
          // Squared-distance interpolation: 255→129 across fade zone (no sqrt needed)
          const t = (distSq - fadeStartSq) / fadeRangeSq;
          value = 255 - ((t * 126) | 0); // 255 at fadeStart, 129 at radius edge
        }

        // Take max so overlapping vision doesn't lower visibility
        if (value > fogState[idx]!) {
          fogState[idx] = value;
          dirty = true;
        }
      }
    }

    if (dirty) this._fogDirty = true;
  }

  /**
   * Initialize blocking grid with terrain, buildings, and forests
   */
  private initializeBlockingGrid(): void {
    const map = this.game.currentMap;
    if (!map) return;

    this.blockingGridCellSize = 2;
    this.blockingGridWidth = Math.ceil(map.width / this.blockingGridCellSize);
    this.blockingGridHeight = Math.ceil(map.height / this.blockingGridCellSize);

    this.blockingGrid = new Float32Array(this.blockingGridWidth * this.blockingGridHeight);

    const mapCols = map.terrain[0]?.length || 0;
    const mapRows = map.terrain.length;

    for (let z = 0; z < this.blockingGridHeight; z++) {
      for (let x = 0; x < this.blockingGridWidth; x++) {
        const worldX = (x * this.blockingGridCellSize) - (map.width / 2);
        const worldZ = (z * this.blockingGridCellSize) - (map.height / 2);

        const terrainHeight = this.getTerrainHeight(worldX, worldZ);
        let blockingHeight = terrainHeight;

        const terrainGridX = Math.floor((worldX + map.width / 2) / map.cellSize);
        const terrainGridZ = Math.floor((worldZ + map.height / 2) / map.cellSize);

        if (terrainGridX >= 0 && terrainGridX < mapCols && terrainGridZ >= 0 && terrainGridZ < mapRows) {
          const cell = map.terrain[terrainGridZ]?.[terrainGridX];
          if (cell?.type === 'forest') {
            blockingHeight = terrainHeight + 15;
          }
        }

        this.blockingGrid[z * this.blockingGridWidth + x] = blockingHeight;
      }
    }

    for (const building of map.buildings) {
      const minX = Math.floor(((building.x - building.width / 2) + map.width / 2) / this.blockingGridCellSize);
      const maxX = Math.ceil(((building.x + building.width / 2) + map.width / 2) / this.blockingGridCellSize);
      const minZ = Math.floor(((building.z - building.depth / 2) + map.height / 2) / this.blockingGridCellSize);
      const maxZ = Math.ceil(((building.z + building.depth / 2) + map.height / 2) / this.blockingGridCellSize);

      const cMinX = Math.max(0, minX);
      const cMaxX = Math.min(this.blockingGridWidth - 1, maxX);
      const cMinZ = Math.max(0, minZ);
      const cMaxZ = Math.min(this.blockingGridHeight - 1, maxZ);

      for (let z = cMinZ; z <= cMaxZ; z++) {
        for (let x = cMinX; x <= cMaxX; x++) {
          const idx = z * this.blockingGridWidth + x;
          const worldX = (x * this.blockingGridCellSize) - (map.width / 2);
          const worldZ = (z * this.blockingGridCellSize) - (map.height / 2);
          const terrainHeight = this.getTerrainHeight(worldX, worldZ);
          const buildingTop = terrainHeight + building.height;
          this.blockingGrid[idx] = Math.max(this.blockingGrid[idx] ?? 0, buildingTop);
        }
      }
    }

    console.log(`FOW: Initialized blocking grid ${this.blockingGridWidth}x${this.blockingGridHeight}`);
  }

  /**
   * Clear vision cells for a specific unit using geometric circle recomputation
   * Instead of tracking indices in a Set, re-iterates the old circle from stored position + radius
   */
  private clearVisionForUnit(unitId: string): void {
    const fogState = this._fogState;
    const refGrid = this.refCountGrid;
    if (!fogState || !refGrid) return;

    const lastPos = this.lastUnitPositions.get(unitId);
    const lastRadius = this.lastUnitRadii.get(unitId);
    if (!lastPos || lastRadius === undefined) return;

    const unitX = lastPos.x;
    const unitZ = lastPos.z;
    const radiusSq = lastRadius * lastRadius;
    const cellSize = this.cellSize;
    const cellRadius = Math.ceil(lastRadius / cellSize);

    const gridWidth = this._gridWidth;
    const gridHeight = this._gridHeight;
    const offsetX = this._gridOffsetX;
    const offsetZ = this._gridOffsetZ;
    let dirty = false;

    // Recompute circle via scanline (same as addFullCircleVision)
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      const worldX = unitX + dx * cellSize;
      const dxWorld = dx * cellSize;
      const remainingSq = radiusSq - dxWorld * dxWorld;
      if (remainingSq < 0) continue;
      const maxDz = Math.floor(Math.sqrt(remainingSq) / cellSize);

      for (let dz = -maxDz; dz <= maxDz; dz++) {
        const worldZ = unitZ + dz * cellSize;
        const gx = Math.floor(worldX / cellSize) + offsetX;
        const gz = Math.floor(worldZ / cellSize) + offsetZ;
        if (gx < 0 || gx >= gridWidth || gz < 0 || gz >= gridHeight) continue;
        const idx = gz * gridWidth + gx;

        const count = refGrid[idx]!;
        if (count <= 1) {
          refGrid[idx] = 0;
          if (fogState[idx]! > 128) {
            fogState[idx] = 128; // visible → explored
            dirty = true;
          }
        } else {
          refGrid[idx] = count - 1;
        }
      }
    }

    if (dirty) this._fogDirty = true;
  }

  private getVisionRadius(unit: Unit): number {
    if (!unit.data) return 50;
    return getVisionRadiusForOptics(unit.data.optics);
  }

  /**
   * Reveal a rectangular area (marks cells as visible + explored)
   * Used to reveal deployment zones during setup phase
   */
  revealArea(minX: number, minZ: number, maxX: number, maxZ: number, _team: string = 'player'): void {
    if (!this._fogState) this.initializeGrids();
    const fogState = this._fogState!;

    const gridWidth = this._gridWidth;
    const gridHeight = this._gridHeight;
    const offsetX = this._gridOffsetX;
    const offsetZ = this._gridOffsetZ;
    const cellSize = this.cellSize;

    for (let x = minX; x <= maxX; x += cellSize) {
      for (let z = minZ; z <= maxZ; z += cellSize) {
        const gx = Math.floor(x / cellSize) + offsetX;
        const gz = Math.floor(z / cellSize) + offsetZ;
        if (gx < 0 || gx >= gridWidth || gz < 0 || gz >= gridHeight) continue;
        fogState[gz * gridWidth + gx] = 255;
      }
    }
    this._fogDirty = true;
  }

  /**
   * Get visibility state for a position from player perspective
   * fogState encoding: 0=unexplored, 1-128=explored, 129-255=visible
   */
  getVisibilityState(x: number, z: number): VisibilityState {
    if (!this.enabled) return VisibilityState.Visible;
    if (!this._fogState) return VisibilityState.Unexplored;

    const gx = Math.floor(x / this.cellSize) + this._gridOffsetX;
    const gz = Math.floor(z / this.cellSize) + this._gridOffsetZ;
    if (gx < 0 || gx >= this._gridWidth || gz < 0 || gz >= this._gridHeight) {
      return VisibilityState.Unexplored;
    }

    const val = this._fogState[gz * this._gridWidth + gx]!;
    if (val > 128) return VisibilityState.Visible;
    if (val > 0) return VisibilityState.Explored;
    return VisibilityState.Unexplored;
  }

  isVisible(x: number, z: number): boolean {
    return this.getVisibilityState(x, z) === VisibilityState.Visible;
  }

  isExplored(x: number, z: number): boolean {
    if (!this.enabled) return true;
    return this.getVisibilityState(x, z) >= VisibilityState.Explored;
  }

  isUnitVisible(unit: Unit): boolean {
    return this.isUnitVisibleToTeam(unit, 'player');
  }

  isUnitVisibleToTeam(unit: Unit, viewerTeam: string): boolean {
    if (!this.enabled) return true;
    if (unit.team === viewerTeam) return true;
    if (viewerTeam !== 'player') return false;

    return this.isVisible(unit.position.x, unit.position.z);
  }

  private updateEnemyVisibility(): void {
    const allUnits = this.game.unitManager.getAllUnits();
    for (const unit of allUnits) {
      if (unit.team === 'player') {
        unit.mesh.visible = true;
      } else {
        unit.mesh.visible = this.isUnitVisible(unit);
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this._fogDirty = true;
    if (!enabled) {
      const allUnits = this.game.unitManager.getAllUnits();
      allUnits.forEach(u => u.mesh.visible = true);
    }
  }

  private getTerrainHeight(x: number, z: number): number {
    if (!this.game.currentMap) return 0;
    const map = this.game.currentMap;

    const gridX = (x + map.width / 2) / map.cellSize;
    const gridZ = (z + map.height / 2) / map.cellSize;

    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const cols = map.terrain[0]!.length;
    const rows = map.terrain.length;
    const cx0 = Math.max(0, Math.min(cols - 1, x0));
    const cx1 = Math.max(0, Math.min(cols - 1, x1));
    const cz0 = Math.max(0, Math.min(rows - 1, z0));
    const cz1 = Math.max(0, Math.min(rows - 1, z1));

    const e00 = map.terrain[cz0]![cx0]!.elevation;
    const e10 = map.terrain[cz0]![cx1]!.elevation;
    const e01 = map.terrain[cz1]![cx0]!.elevation;
    const e11 = map.terrain[cz1]![cx1]!.elevation;

    const fx = gridX - x0;
    const fz = gridZ - z0;

    const e0 = e00 * (1 - fx) + e10 * fx;
    const e1 = e01 * (1 - fx) + e11 * fx;

    return e0 * (1 - fz) + e1 * fz;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Legacy dirty cell API (kept for interface compatibility, no longer used by renderer)
  get fullRescanNeeded(): boolean { return this._fogDirty; }
  consumeDirtyCells(): number[] {
    this._fogDirty = false;
    return [];
  }
}
