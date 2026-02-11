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
 * - Only processes player units (enemy vision irrelevant for fog overlay)
 * - Differential/crescent updates: only adds/removes changed cells when units move
 * - No LOS raycasting during incremental updates (circle-based, LOS only on forceImmediateUpdate)
 * - Dirty cell tracking: renderer only updates changed texture pixels
 * - Reference counting for shared vision cells
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
  private blockingGridCellSize = 4; // High resolution for accurate LOS

  // Vision state
  private currentVision = new Map<string, Map<string, boolean>>(); // team -> set of visible cell keys
  private exploredGrid = new Map<string, boolean>(); // set of explored cell keys (player only)
  private cellSize = 4; // Resolution of vision grid

  // Position tracking for incremental updates
  private lastUnitPositions = new Map<string, THREE.Vector3>();
  private readonly MOVE_THRESHOLD_SQ = 9; // 3 meters squared

  // CRITICAL PERFORMANCE: Frame budget to prevent frame rate collapse
  private visionUpdatesThisFrame = 0;
  private readonly MAX_VISION_UPDATES_PER_FRAME = 8; // Differential updates are cheap, can do more

  // Track which units own which vision cells for efficient clearing
  private unitVisionCells = new Map<string, Set<string>>(); // unitId -> set of cell keys
  private unitTeams = new Map<string, string>(); // unitId -> team name
  // Reference count per team per cell: how many units on that team see the cell
  private cellRefCounts = new Map<string, Map<string, number>>(); // team -> (cellKey -> refCount)

  // Dirty tracking for renderer: cells that changed since last consume
  private _dirtyCells: number[] = []; // Flat array of [cellX, cellZ, cellX, cellZ, ...]
  private _fullRescanNeeded = true; // Start with full scan

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initialize fog of war
   */
  initialize(): void {
    this.currentVision.clear();
    this.exploredGrid.clear();
    this.lastUnitPositions.clear();
    this.unitVisionCells.clear();
    this.unitTeams.clear();
    this.cellRefCounts.clear();
    this.blockingGrid = null;
    this.visionUpdatesThisFrame = 0;
    this._dirtyCells.length = 0;
    this._fullRescanNeeded = true;
  }

  /**
   * Dirty tracking API for renderer
   */
  get fullRescanNeeded(): boolean { return this._fullRescanNeeded; }

  consumeDirtyCells(): number[] {
    const cells = this._dirtyCells;
    this._dirtyCells = [];
    this._fullRescanNeeded = false;
    return cells;
  }

  private markDirty(cellX: number, cellZ: number): void {
    this._dirtyCells.push(cellX, cellZ);
  }

  /**
   * Force an immediate fog of war update for all units (uses full LOS)
   * Used after initialization to reveal areas around already-deployed units
   */
  forceImmediateUpdate(teamFilter?: 'player' | 'enemy'): void {
    if (!this.enabled) return;

    // Initialize blocking grid if needed
    if (!this.blockingGrid && this.game.currentMap) {
      this.initializeBlockingGrid();
    }

    // Get units (optionally filtered by team)
    const allUnits = teamFilter
      ? this.game.unitManager.getAllUnits(teamFilter)
      : this.game.unitManager.getAllUnits();

    // Clear current vision and rebuild completely
    this.currentVision.clear();
    this.lastUnitPositions.clear();
    this.unitVisionCells.clear();
    this.unitTeams.clear();
    this.cellRefCounts.clear();

    // Reset frame budget for forced update
    this.visionUpdatesThisFrame = 0;

    // Update vision for units immediately with full LOS (no throttling or budget)
    for (const unit of allUnits) {
      if (unit.health <= 0) continue;

      // Track position
      this.lastUnitPositions.set(unit.id, unit.position.clone());

      // Update vision with full LOS
      this.updateVisionForUnitLOS(unit);
    }

    // Update enemy visibility
    this.updateEnemyVisibility();

    // Clear unit vision tracking so the first regular update() rebuilds with circle-based vision.
    // forceImmediateUpdate uses LOS which creates irregular holes in unitVisionCells.
    // The differential update assumes a full circle baseline, so we must re-establish it.
    // currentVision and exploredGrid are kept (they have the correct initial reveal).
    this.unitVisionCells.clear();
    this.unitTeams.clear();
    this.cellRefCounts.clear();

    // Signal renderer to do full rescan
    this._fullRescanNeeded = true;

    console.log('FOW: Forced immediate update for', allUnits.length, 'units', teamFilter ? `(${teamFilter} only)` : '');
  }

  /**
   * Update fog of war based on unit positions
   * Runs every frame during battle phase
   */
  update(_dt: number): void {
    if (!this.enabled) return;

    // CRITICAL PERFORMANCE: Reset frame budget
    this.visionUpdatesThisFrame = 0;

    // Initialize blocking grid if needed
    if (!this.blockingGrid && this.game.currentMap) {
      this.initializeBlockingGrid();
    }

    // OPT 1: Only process player units - enemy vision doesn't affect fog overlay
    const playerUnits = this.game.unitManager.getAllUnits('player');

    // Track which units moved significantly
    let anyUnitMoved = false;
    const currentUnitIds = new Set<string>();
    const unitsToUpdate: Unit[] = [];

    for (const unit of playerUnits) {
      if (unit.health <= 0) continue;
      currentUnitIds.add(unit.id);

      const lastPos = this.lastUnitPositions.get(unit.id);
      if (!lastPos) {
        // New unit - needs full circle vision
        this.lastUnitPositions.set(unit.id, unit.position.clone());
        anyUnitMoved = true;
        unitsToUpdate.push(unit);
      } else {
        const distSq = lastPos.distanceToSquared(unit.position);
        if (distSq > this.MOVE_THRESHOLD_SQ) {
          anyUnitMoved = true;
          unitsToUpdate.push(unit);
        }
      }
    }

    // Clean up dead/removed player units
    for (const trackedId of this.lastUnitPositions.keys()) {
      if (!currentUnitIds.has(trackedId)) {
        this.lastUnitPositions.delete(trackedId);
        this.clearVisionForUnit(trackedId);
        this.unitVisionCells.delete(trackedId);
        this.unitTeams.delete(trackedId);
        anyUnitMoved = true;
      }
    }

    if (!anyUnitMoved) {
      this.updateEnemyVisibility();
      return;
    }

    // OPT 2+4: Differential updates without LOS
    for (const unit of unitsToUpdate) {
      if (this.visionUpdatesThisFrame >= this.MAX_VISION_UPDATES_PER_FRAME) {
        break;
      }

      const lastPos = this.lastUnitPositions.get(unit.id);
      if (lastPos && this.unitVisionCells.has(unit.id)) {
        // Existing unit that moved - check how far
        const moveDist = lastPos.distanceTo(unit.position);
        if (moveDist < this.cellSize * 3) {
          // Small move: differential crescent update (fast, ~50 cells changed)
          this.updateVisionDifferential(unit, lastPos);
        } else {
          // Large move (fast unit like helicopter/aircraft): clear and rebuild full circle
          // Prevents banding from gaps between old and new positions
          this.clearVisionForUnit(unit.id);
          this.addFullCircleVision(unit);
        }
      } else {
        // New unit or first update after forceImmediateUpdate - full circle
        this.addFullCircleVision(unit);
      }
      this.visionUpdatesThisFrame++;

      // Update tracked position AFTER vision recalculated
      const pos = this.lastUnitPositions.get(unit.id);
      if (pos) {
        pos.copy(unit.position);
      }
    }

    this.updateEnemyVisibility();
  }

  /**
   * OPT 4: Differential crescent update
   * Only processes cells that changed between old and new position circles.
   * For a 3m move with 150m radius, ~99% of cells are unchanged and skipped.
   */
  private updateVisionDifferential(unit: Unit, oldPos: THREE.Vector3): void {
    const visionRadius = this.getVisionRadius(unit);
    const team = unit.team;
    const newX = unit.position.x;
    const newZ = unit.position.z;
    const oldX = oldPos.x;
    const oldZ = oldPos.z;

    const teamVision = this.ensureTeamVision(team);
    const teamRefCounts = this.ensureTeamRefCounts(team);
    this.unitTeams.set(unit.id, team);

    const unitCells = this.unitVisionCells.get(unit.id)!;
    const radiusSq = visionRadius * visionRadius;
    const cellSize = this.cellSize;
    const cellRadius = Math.ceil(visionRadius / cellSize);

    // Expand search area by move distance to cover both circles
    const moveDist = Math.sqrt((newX - oldX) ** 2 + (newZ - oldZ) ** 2);
    const expandCells = Math.ceil(moveDist / cellSize) + 1;
    const searchRadius = cellRadius + expandCells;

    const isPlayer = team === 'player';

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dz = -searchRadius; dz <= searchRadius; dz++) {
        const worldX = newX + dx * cellSize;
        const worldZ = newZ + dz * cellSize;

        const newDistSq = (worldX - newX) ** 2 + (worldZ - newZ) ** 2;
        const oldDistSq = (worldX - oldX) ** 2 + (worldZ - oldZ) ** 2;

        const inNew = newDistSq <= radiusSq;
        const inOld = oldDistSq <= radiusSq;

        if (inNew === inOld) continue; // No change - skip (this is 99% of cells)

        const cellX = Math.floor(worldX / cellSize);
        const cellZ = Math.floor(worldZ / cellSize);
        const key = `${cellX},${cellZ}`;

        if (inNew) {
          // Newly visible cell
          teamVision.set(key, true);
          if (!unitCells.has(key)) {
            unitCells.add(key);
            teamRefCounts.set(key, (teamRefCounts.get(key) ?? 0) + 1);
          }
          if (isPlayer) {
            this.exploredGrid.set(key, true);
            this.markDirty(cellX, cellZ);
          }
        } else {
          // No longer visible cell
          if (unitCells.has(key)) {
            unitCells.delete(key);
            const count = teamRefCounts.get(key) ?? 0;
            if (count <= 1) {
              teamRefCounts.delete(key);
              teamVision.delete(key);
            } else {
              teamRefCounts.set(key, count - 1);
            }
            if (isPlayer) {
              this.markDirty(cellX, cellZ);
            }
          }
        }
      }
    }
  }

  /**
   * OPT 2: Add full circle vision for a new unit (no LOS, simple circle)
   */
  private addFullCircleVision(unit: Unit): void {
    const visionRadius = this.getVisionRadius(unit);
    const team = unit.team;
    const unitX = unit.position.x;
    const unitZ = unit.position.z;

    const teamVision = this.ensureTeamVision(team);
    const teamRefCounts = this.ensureTeamRefCounts(team);
    this.unitTeams.set(unit.id, team);

    let unitCells = this.unitVisionCells.get(unit.id);
    if (!unitCells) {
      unitCells = new Set<string>();
      this.unitVisionCells.set(unit.id, unitCells);
    }

    const radiusSq = visionRadius * visionRadius;
    const cellSize = this.cellSize;
    const cellRadius = Math.ceil(visionRadius / cellSize);
    const isPlayer = team === 'player';

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const worldX = unitX + dx * cellSize;
        const worldZ = unitZ + dz * cellSize;
        const distSq = (worldX - unitX) ** 2 + (worldZ - unitZ) ** 2;
        if (distSq <= radiusSq) {
          const cellX = Math.floor(worldX / cellSize);
          const cellZ = Math.floor(worldZ / cellSize);
          const key = `${cellX},${cellZ}`;
          teamVision.set(key, true);
          if (!unitCells.has(key)) {
            unitCells.add(key);
            teamRefCounts.set(key, (teamRefCounts.get(key) ?? 0) + 1);
          }
          if (isPlayer) {
            this.exploredGrid.set(key, true);
            this.markDirty(cellX, cellZ);
          }
        }
      }
    }
  }

  private ensureTeamVision(team: string): Map<string, boolean> {
    if (!this.currentVision.has(team)) {
      this.currentVision.set(team, new Map());
    }
    return this.currentVision.get(team)!;
  }

  private ensureTeamRefCounts(team: string): Map<string, number> {
    if (!this.cellRefCounts.has(team)) {
      this.cellRefCounts.set(team, new Map());
    }
    return this.cellRefCounts.get(team)!;
  }

  /**
   * Initialize the blocking grid with terrain, buildings, and forests
   * This allows O(1) height lookups instead of iterating all buildings per ray
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
   * Clear vision cells for a specific unit using reference counting
   */
  private clearVisionForUnit(unitId: string): void {
    const cellsToRemove = this.unitVisionCells.get(unitId);
    if (!cellsToRemove) return;

    const team = this.unitTeams.get(unitId);
    if (!team) {
      cellsToRemove.clear();
      return;
    }

    const teamVision = this.currentVision.get(team);
    const teamRefCounts = this.cellRefCounts.get(team);
    const isPlayer = team === 'player';

    if (teamVision && teamRefCounts) {
      for (const key of cellsToRemove) {
        const count = teamRefCounts.get(key) ?? 0;
        if (count <= 1) {
          teamRefCounts.delete(key);
          teamVision.delete(key);
        } else {
          teamRefCounts.set(key, count - 1);
        }
        if (isPlayer) {
          // Parse key for dirty marking
          const commaIdx = key.indexOf(',');
          this.markDirty(
            parseInt(key.substring(0, commaIdx)),
            parseInt(key.substring(commaIdx + 1))
          );
        }
      }
    }

    cellsToRemove.clear();
  }

  /**
   * Full LOS vision update for a unit (used only in forceImmediateUpdate)
   * Includes elevation bonus and line-of-sight checks
   */
  private updateVisionForUnitLOS(unit: Unit): void {
    const baseVisionRadius = this.getVisionRadius(unit);
    const unitPos = unit.position;
    const team = unit.team;

    const ELEVATION_MULTIPLIER = 2.0;
    const MAX_BONUS_PERCENT = 0.5;
    const maxElevationBonus = baseVisionRadius * MAX_BONUS_PERCENT;
    const unitElevation = this.getTerrainHeight(unitPos.x, unitPos.z);

    const teamVision = this.ensureTeamVision(team);
    const teamRefCounts = this.ensureTeamRefCounts(team);
    this.unitTeams.set(unit.id, team);

    let unitCells = this.unitVisionCells.get(unit.id);
    if (!unitCells) {
      unitCells = new Set<string>();
      this.unitVisionCells.set(unit.id, unitCells);
    }

    const maxVisionRadius = baseVisionRadius + maxElevationBonus;
    const cellRadius = Math.ceil(maxVisionRadius / this.cellSize);

    // Full circle reveal (no LOS). LOS-based gaps create visual artifacts
    // (rings on slopes) and get overwritten by circle-based vision on the
    // very next frame, so LOS here has no lasting benefit.
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const worldX = unitPos.x + dx * this.cellSize;
        const worldZ = unitPos.z + dz * this.cellSize;

        const targetElevation = this.getTerrainHeight(worldX, worldZ);
        const elevationDifference = unitElevation - targetElevation;
        const elevationBonus = Math.max(0, elevationDifference * ELEVATION_MULTIPLIER);
        const cappedBonus = Math.min(elevationBonus, maxElevationBonus);
        const effectiveVisionRadius = baseVisionRadius + cappedBonus;

        const distSq = (worldX - unitPos.x) ** 2 + (worldZ - unitPos.z) ** 2;
        if (distSq <= effectiveVisionRadius ** 2) {
          const key = this.getCellKey(worldX, worldZ);

          if (team === 'player') {
            this.exploredGrid.set(key, true);
          }

          teamVision.set(key, true);
          if (!unitCells.has(key)) {
            unitCells.add(key);
            teamRefCounts.set(key, (teamRefCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  /**
   * Get vision radius for a unit
   */
  private getVisionRadius(unit: Unit): number {
    if (!unit.data) return 50;
    return getVisionRadiusForOptics(unit.data.optics);
  }

  /**
   * Get grid cell key for a world position
   */
  private getCellKey(x: number, z: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);
    return `${cellX},${cellZ}`;
  }

  /**
   * Reveal a rectangular area for a team (marks cells as visible + explored)
   * Used to reveal deployment zones during setup phase
   */
  revealArea(minX: number, minZ: number, maxX: number, maxZ: number, team: string = 'player'): void {
    if (!this.currentVision.has(team)) {
      this.currentVision.set(team, new Map());
    }
    const teamVision = this.currentVision.get(team)!;

    for (let x = minX; x <= maxX; x += this.cellSize) {
      for (let z = minZ; z <= maxZ; z += this.cellSize) {
        const key = this.getCellKey(x, z);
        teamVision.set(key, true);
        this.exploredGrid.set(key, true);
      }
    }
    this._fullRescanNeeded = true;
  }

  /**
   * Get visibility state for a position from player perspective
   */
  getVisibilityState(x: number, z: number): VisibilityState {
    if (!this.enabled) return VisibilityState.Visible;

    const key = this.getCellKey(x, z);

    if (this.currentVision.get('player')?.has(key)) {
      return VisibilityState.Visible;
    }

    if (this.exploredGrid.has(key)) {
      return VisibilityState.Explored;
    }

    return VisibilityState.Unexplored;
  }

  /**
   * Check if a position is currently visible to player
   */
  isVisible(x: number, z: number): boolean {
    return this.getVisibilityState(x, z) === VisibilityState.Visible;
  }

  /**
   * Check if a position has been explored (seen at some point)
   */
  isExplored(x: number, z: number): boolean {
    if (!this.enabled) return true;
    const key = this.getCellKey(x, z);
    return this.exploredGrid.has(key);
  }

  /**
   * Check if a unit is visible to player
   */
  isUnitVisible(unit: Unit): boolean {
    return this.isUnitVisibleToTeam(unit, 'player');
  }

  /**
   * Check if a unit is visible to a specific team
   */
  isUnitVisibleToTeam(unit: Unit, viewerTeam: string): boolean {
    if (!this.enabled) return true;
    if (unit.team === viewerTeam) return true;

    const key = this.getCellKey(unit.position.x, unit.position.z);
    return this.currentVision.get(viewerTeam)?.has(key) ?? false;
  }

  /**
   * Update enemy unit visibility
   */
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

  /**
   * Enable/disable fog of war
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this._fullRescanNeeded = true;

    if (!enabled) {
      const allUnits = this.game.unitManager.getAllUnits();
      allUnits.forEach(u => u.mesh.visible = true);
    }
  }

  /**
   * Get terrain height at a position
   */
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

  /**
   * Check if fog of war is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
