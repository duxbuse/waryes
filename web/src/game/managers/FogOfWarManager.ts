/**
 * FogOfWarManager - Manages vision and fog of war
 *
 * Features:
 * - Three visibility states: Visible, Explored, Unexplored
 * - Vision radius based on unit Optics stat
 * - Team vision sharing
 * - Real-time fog updates as units move
 * - Hides enemy units outside vision
 */

import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import * as THREE from 'three';

import { opticsToNumber } from '../../data/types';
import { VectorPool } from '../utils/VectorPool';

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
  private cellSize = 4; // Resolution of vision grid (increased from 2 for performance)
  private timeSinceLastUpdate = 0;
  private updateInterval = 0.1; // 10Hz updates

  // Position tracking for incremental updates
  private lastUnitPositions = new Map<string, THREE.Vector3>();
  private readonly MOVE_THRESHOLD_SQ = 25; // 5 meters squared - units must move this much to trigger update

  // Vision update throttling to spread expensive LOS checks across frames
  private visionUpdateFrameCounter = 0;
  private readonly VISION_UPDATE_THROTTLE = 20; // Update 1/20th of units per frame (more aggressive)

  // CRITICAL PERFORMANCE: Frame budget to prevent frame rate collapse
  private visionUpdatesThisFrame = 0;
  private readonly MAX_VISION_UPDATES_PER_FRAME = 3; // Max 3 units update vision per frame (~10-15ms total)

  // Track which units own which vision cells for efficient clearing
  private unitVisionCells = new Map<string, Set<string>>(); // unitId -> set of cell keys

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
    this.blockingGrid = null;
    this.visionUpdatesThisFrame = 0;
  }

  /**
   * Force an immediate fog of war update for all units
   * Used after initialization to reveal areas around already-deployed units
   */
  forceImmediateUpdate(): void {
    if (!this.enabled) return;

    // Initialize blocking grid if needed
    if (!this.blockingGrid && this.game.currentMap) {
      this.initializeBlockingGrid();
    }

    // Get all units
    const allUnits = this.game.unitManager.getAllUnits();

    // Clear current vision and rebuild completely
    this.currentVision.clear();
    this.lastUnitPositions.clear();
    this.unitVisionCells.clear();

    // Reset frame budget for forced update
    this.visionUpdatesThisFrame = 0;

    // Update vision for all units immediately (no throttling or budget for forced update)
    for (const unit of allUnits) {
      if (unit.health <= 0) continue;

      // Track position
      this.lastUnitPositions.set(unit.id, unit.position.clone());

      // Update vision
      this.updateVisionForUnit(unit);
    }

    // Update enemy visibility
    this.updateEnemyVisibility();

    console.log('FOW: Forced immediate update for', allUnits.length, 'units');
  }

  /**
   * Update fog of war based on unit positions
   */
  update(dt: number): void {
    if (!this.enabled) return;

    // CRITICAL PERFORMANCE: Reset frame budget
    this.visionUpdatesThisFrame = 0;

    // Initialize or update blocking grid if needed
    if (!this.blockingGrid && this.game.currentMap) {
      this.initializeBlockingGrid();
    }

    // Throttle updates for performance
    this.timeSinceLastUpdate += dt;
    if (this.timeSinceLastUpdate < this.updateInterval) {
      return;
    }
    this.timeSinceLastUpdate = 0;

    // Get all units
    const allUnits = this.game.unitManager.getAllUnits();

    // Track which units moved significantly for incremental optimization
    let anyUnitMoved = false;
    const currentUnitIds = new Set<string>();
    const unitsToUpdate: Unit[] = []; // Units that need vision updates

    for (const unit of allUnits) {
      if (unit.health <= 0) continue;
      currentUnitIds.add(unit.id);

      const lastPos = this.lastUnitPositions.get(unit.id);
      if (!lastPos) {
        // New unit - track position and mark as moved
        this.lastUnitPositions.set(unit.id, unit.position.clone());
        anyUnitMoved = true;
        unitsToUpdate.push(unit);
      } else {
        // Check if unit moved significantly
        const distSq = lastPos.distanceToSquared(unit.position);
        if (distSq > this.MOVE_THRESHOLD_SQ) {
          // Unit moved - update tracked position
          lastPos.copy(unit.position);
          anyUnitMoved = true;
          unitsToUpdate.push(unit);
        }
      }
    }

    // Clean up dead/removed units from position tracking and vision
    for (const trackedId of this.lastUnitPositions.keys()) {
      if (!currentUnitIds.has(trackedId)) {
        this.lastUnitPositions.delete(trackedId);
        // Clear vision cells for removed unit
        this.clearVisionForUnit(trackedId);
        anyUnitMoved = true; // Need to recalculate since a unit is gone
      }
    }

    // Skip full vision recalculation if no units moved
    // This provides significant optimization when units are stationary
    if (!anyUnitMoved) {
      // Still need to update enemy visibility in case smoke changed
      this.updateEnemyVisibility();
      return;
    }

    // OPTIMIZATION: Throttle vision updates with frame budget
    // Only update units that moved, up to budget limit
    this.visionUpdateFrameCounter++;
    const currentBatch = this.visionUpdateFrameCounter % this.VISION_UPDATE_THROTTLE;

    // Update vision for moved units (with budget and throttle)
    let unitIndex = 0;
    for (const unit of unitsToUpdate) {
      // CRITICAL PERFORMANCE: Check frame budget
      if (this.visionUpdatesThisFrame >= this.MAX_VISION_UPDATES_PER_FRAME) {
        break; // Budget exhausted - defer remaining updates to next frame
      }

      // Only update units in current batch (staggered across frames)
      if (unitIndex % this.VISION_UPDATE_THROTTLE === currentBatch) {
        // Clear old vision for this unit
        this.clearVisionForUnit(unit.id);
        // Update new vision
        this.updateVisionForUnit(unit);
        this.visionUpdatesThisFrame++;
      }
      unitIndex++;
    }

    // Hide enemy units outside vision
    this.updateEnemyVisibility();
  }

  /**
   * Initialize the blocking grid with terrain, buildings, and forests
   * This allows O(1) height lookups instead of iterating all buildings per ray
   */
  private initializeBlockingGrid(): void {
    const map = this.game.currentMap;
    if (!map) return;

    // Use map's cell size or a fixed high resolution one?
    // Using a finer grid (e.g. 2m or 4m) is better for buildings
    // Map cell size is adaptive (can be large), so let's stick to 2m or 4m for FOW accuracy
    // However, aligning with terrain cells makes terrain lookup cheaper.
    // Let's use 2m resolution for good building fidelity
    this.blockingGridCellSize = 2;

    this.blockingGridWidth = Math.ceil(map.width / this.blockingGridCellSize);
    this.blockingGridHeight = Math.ceil(map.height / this.blockingGridCellSize);

    // Create grid initialized with 0
    this.blockingGrid = new Float32Array(this.blockingGridWidth * this.blockingGridHeight);

    // 1. Fill with terrain height and forests
    const mapCols = map.terrain[0]?.length || 0;
    const mapRows = map.terrain.length;

    for (let z = 0; z < this.blockingGridHeight; z++) {
      for (let x = 0; x < this.blockingGridWidth; x++) {
        // Convert grid coord to world coord
        const worldX = (x * this.blockingGridCellSize) - (map.width / 2);
        const worldZ = (z * this.blockingGridCellSize) - (map.height / 2);

        // Get terrain height (interpolated)
        const terrainHeight = this.getTerrainHeight(worldX, worldZ);

        let blockingHeight = terrainHeight;

        // Check for forest - match terrain grid cell
        const terrainGridX = Math.floor((worldX + map.width / 2) / map.cellSize);
        const terrainGridZ = Math.floor((worldZ + map.height / 2) / map.cellSize);

        if (terrainGridX >= 0 && terrainGridX < mapCols && terrainGridZ >= 0 && terrainGridZ < mapRows) {
          const cell = map.terrain[terrainGridZ]?.[terrainGridX];
          if (cell?.type === 'forest') {
            // Forest canopy height ~15m above terrain
            blockingHeight = terrainHeight + 15;
          }
        }

        this.blockingGrid[z * this.blockingGridWidth + x] = blockingHeight;
      }
    }

    // 2. Rasterize buildings onto the grid
    // Iterating buildings once during init is much better than per-frame
    for (const building of map.buildings) {
      // Calculate building bounds in grid coordinates
      const minX = Math.floor(((building.x - building.width / 2) + map.width / 2) / this.blockingGridCellSize);
      const maxX = Math.ceil(((building.x + building.width / 2) + map.width / 2) / this.blockingGridCellSize);
      const minZ = Math.floor(((building.z - building.depth / 2) + map.height / 2) / this.blockingGridCellSize);
      const maxZ = Math.ceil(((building.z + building.depth / 2) + map.height / 2) / this.blockingGridCellSize);

      // Clamp to grid
      const cMinX = Math.max(0, minX);
      const cMaxX = Math.min(this.blockingGridWidth - 1, maxX);
      const cMinZ = Math.max(0, minZ);
      const cMaxZ = Math.min(this.blockingGridHeight - 1, maxZ);

      // Apply building height
      // Note: building.y is usually terrain height. If not explicitly set, we fetch it.
      // But buildings in data structure don't always have 'y'. MapGenerator usually places them on terrain.
      // We'll estimate base height from center (approximate, but faster)
      // Actually, let's use the local terrain height at the cell for maximum accuracy.

      for (let z = cMinZ; z <= cMaxZ; z++) {
        for (let x = cMinX; x <= cMaxX; x++) {
          const idx = z * this.blockingGridWidth + x;
          // We assume building sits on the terrain at that specific cell
          // Since we already populated grid with terrain height, we can just add building height to terrain height?
          // No, building usually has a flat base.
          // Ideally: blockingHeight = Math.max(currentHeight, baseHeight + buildingHeight)
          // If we assume the previously stored height IS the terrain height (mostly true, except forests)

          // If it's a forest cell, currentHeight includes tree height.
          // A building in a forest? Building usually clears forest or overrides it.
          // Let's just say: max(currentHeight, terrainAtCell + buildingHeight)

          // To be safe, re-fetch terrain height implicitly or assume building overrides trees
          // Let's assume building max height overrides whatever is there if it's taller

          // Approximate building base height as the terrain height at that cell
          // (Since we prefilled with terrain height, we can recover terrain height approx if we knew it wasn't a tree)
          // Simplified: If it was a tree (base+15), and building is (base+8), tree is taller. 
          // But usually buildings remove trees.

          // For simplicity and performance: just apply absolute max height check
          // We need to know the terrain height at valid building pixels.
          // Let's re-calculate terrain height to be precise? No, that's heavy.
          // We can assume the value in the grid IS at least terrain height.
          // If we just add building height to terrain height? 
          // Problem: 'currentHeight' might be 'terrain + 15' (forest).
          // If we place a house (height 5), result should probably be house height if house replaces tree, 
          // OR tree height if tree remains.
          // In MapGenerator, buildings don't modify terrain cells to remove forest type usually, 
          // but visually they might.

          // Let's assume buildings replace trees.
          // But we don't know if `currentHeight` is tree or flat terrain without checking terrain grid again.
          // Let's check terrain grid again here, it's init time so O(B * Area) is fine.

          const worldX = (x * this.blockingGridCellSize) - (map.width / 2);
          const worldZ = (z * this.blockingGridCellSize) - (map.height / 2);
          const terrainHeight = this.getTerrainHeight(worldX, worldZ);

          // Building top absolute elevation
          // Note: buildings are placed on the ground.
          const buildingTop = terrainHeight + building.height;

          this.blockingGrid[idx] = Math.max(this.blockingGrid[idx] ?? 0, buildingTop);
        }
      }
    }

    console.log(`FOW: Initialized blocking grid ${this.blockingGridWidth}x${this.blockingGridHeight}`);
  }

  /**
   * Check if line of sight is blocked between two positions
   * Uses optimized 2.5D raymarching on cached height grid
   */
  private isLOSBlocked(start: THREE.Vector3, end: THREE.Vector3): boolean {
    // Check smoke blocking (dynamic)
    if (this.game.smokeManager.blocksLOS(start, end)) {
      return true;
    }

    if (!this.blockingGrid || !this.game.currentMap) return false;

    const mapWidth = this.game.currentMap.width;
    const mapHeight = this.game.currentMap.height;

    // Ray properties
    const dist = start.distanceTo(end);
    const dirX = (end.x - start.x) / dist;
    const dirY = (end.y - start.y) / dist;
    const dirZ = (end.z - start.z) / dist;

    // Step size for ray marching
    // OPTIMIZED: Step by 2.5x cell size - we won't miss obstacles and it's 2.5x faster
    // Previously was 1x cell size which was overkill
    const stepSize = this.blockingGridCellSize * 2.5;
    const numSteps = Math.ceil(dist / stepSize);

    // Check points along the ray
    let currentX = start.x;
    let currentY = start.y;
    let currentZ = start.z;

    for (let i = 1; i < numSteps; i++) { // Start at 1 to skip checking self roughly
      currentX += dirX * stepSize;
      currentY += dirY * stepSize;
      currentZ += dirZ * stepSize;

      // Convert to grid coords
      const gridX = Math.floor((currentX + mapWidth / 2) / this.blockingGridCellSize);
      const gridZ = Math.floor((currentZ + mapHeight / 2) / this.blockingGridCellSize);

      // Bounds check
      if (gridX >= 0 && gridX < this.blockingGridWidth && gridZ >= 0 && gridZ < this.blockingGridHeight) {
        // Get blocking height at this cell
        const blockingHeight = this.blockingGrid[gridZ * this.blockingGridWidth + gridX] ?? 0;

        // If the blocking height is above our current ray height, LOS is blocked
        // We use a small epsilon or margin? Maybe not needed if exact.
        if (blockingHeight > currentY) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Clear vision cells for a specific unit
   */
  private clearVisionForUnit(unitId: string): void {
    const cellsToRemove = this.unitVisionCells.get(unitId);
    if (!cellsToRemove) return;

    // Remove cells from all team vision maps
    for (const teamVision of this.currentVision.values()) {
      for (const key of cellsToRemove) {
        teamVision.delete(key);
      }
    }

    // Clear the tracking
    cellsToRemove.clear();
  }

  /**
   * Update vision around a unit
   *
   * Elevation Bonus System:
   * - Units at higher elevation see farther than units at lower elevation
   * - Bonus formula: bonusRange = (unitElevation - targetElevation) * ELEVATION_MULTIPLIER
   * - ELEVATION_MULTIPLIER = 2.0 means 2m extra range per 1m elevation advantage
   * - No penalty for being lower (clamped to 0)
   * - Maximum bonus capped at +50% of base vision range
   */
  private updateVisionForUnit(unit: Unit): void {
    const baseVisionRadius = this.getVisionRadius(unit);
    const unitPos = unit.position;
    const team = unit.team;

    // Elevation bonus constants
    const ELEVATION_MULTIPLIER = 2.0; // 2m extra range per 1m elevation advantage
    const MAX_BONUS_PERCENT = 0.5; // Cap at +50% of base range
    const maxElevationBonus = baseVisionRadius * MAX_BONUS_PERCENT;

    // Calculate unit elevation once (performance optimization)
    const unitElevation = this.getTerrainHeight(unitPos.x, unitPos.z);

    // Ensure team map exists
    if (!this.currentVision.has(team)) {
      this.currentVision.set(team, new Map());
    }
    const teamVision = this.currentVision.get(team)!;

    // Track which cells this unit reveals
    let unitCells = this.unitVisionCells.get(unit.id);
    if (!unitCells) {
      unitCells = new Set<string>();
      this.unitVisionCells.set(unit.id, unitCells);
    }

    // Calculate maximum possible vision radius (base + max bonus) for loop bounds
    const maxVisionRadius = baseVisionRadius + maxElevationBonus;
    const cellRadius = Math.ceil(maxVisionRadius / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const worldX = unitPos.x + dx * this.cellSize;
        const worldZ = unitPos.z + dz * this.cellSize;

        // Calculate target elevation for elevation bonus
        const targetElevation = this.getTerrainHeight(worldX, worldZ);

        // Calculate elevation advantage (high ground bonus)
        // Only positive values (no penalty for being lower)
        const elevationDifference = unitElevation - targetElevation;
        const elevationBonus = Math.max(0, elevationDifference * ELEVATION_MULTIPLIER);

        // Cap elevation bonus at maximum
        const cappedBonus = Math.min(elevationBonus, maxElevationBonus);

        // Effective vision radius for this cell includes elevation bonus
        const effectiveVisionRadius = baseVisionRadius + cappedBonus;

        // Check if within effective vision circle
        const distSq = (worldX - unitPos.x) ** 2 + (worldZ - unitPos.z) ** 2;
        if (distSq <= effectiveVisionRadius ** 2) {
          const key = this.getCellKey(worldX, worldZ);

          // OPTIMIZATION: Skip expensive LOS check for cells very close to unit
          // Cells within 60m are almost always visible (most combat happens <100m)
          const dist = Math.sqrt(distSq);
          if (dist < 60) {
            // Close cells are automatically visible (no LOS check needed)
            teamVision.set(key, true);
            unitCells.add(key);
            if (team === 'player') {
              this.exploredGrid.set(key, true);
            }
          } else {
            // Only do expensive LOS check for distant cells
            // OPTIMIZATION: Use VectorPool to avoid GC pressure
            const startPos = VectorPool.acquire();
            startPos.copy(unitPos);
            startPos.y += 2;

            const targetPos = VectorPool.acquire();
            targetPos.set(worldX, targetElevation + 2, worldZ);

            const blocked = this.isLOSBlocked(startPos, targetPos);

            VectorPool.release(startPos);
            VectorPool.release(targetPos);

            if (!blocked) {
              teamVision.set(key, true);
              unitCells.add(key);
              if (team === 'player') {
                this.exploredGrid.set(key, true);
              }
            }
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

    // Use unit data optics rating
    const opticsVal = opticsToNumber(unit.data.optics);

    // OPTIMIZED: Reduced vision ranges for performance
    // Scale vision: Poor(2) = 100m, Normal(3) = 150m, Good(4) = 200m, Exceptional(6) = 300m
    const scales: Record<number, number> = {
      2: 100,
      3: 150,
      4: 200,
      5: 250,
      6: 300
    };

    return scales[opticsVal] ?? 150;
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

    // For units, check 2m above ground (head height)
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
        // Player units always visible
        unit.mesh.visible = true;
      } else {
        // Enemy units only visible in current vision (not just explored)
        unit.mesh.visible = this.isUnitVisible(unit);
      }
    }
  }

  /**
   * Enable/disable fog of war
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      // Show all units when fog disabled
      const allUnits = this.game.unitManager.getAllUnits();
      allUnits.forEach(u => u.mesh.visible = true);
    }
  }

  // REMOVED: Duplicate broken isLOSBlocked method that called non-existent methods
  // The optimized raymarching implementation above (line 267) is now used instead

  /**
   * Get terrain height at a position
   */
  private getTerrainHeight(x: number, z: number): number {
    if (!this.game.currentMap) return 0;
    const map = this.game.currentMap;

    // Use logic from MapGenerator.getElevationAt but using the existing map data
    // Convert world coords to grid coords
    const gridX = (x + map.width / 2) / map.cellSize;
    const gridZ = (z + map.height / 2) / map.cellSize;

    // Get the four surrounding grid cells
    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    // Clamp to terrain bounds
    const cols = map.terrain[0]!.length;
    const rows = map.terrain.length;
    const cx0 = Math.max(0, Math.min(cols - 1, x0));
    const cx1 = Math.max(0, Math.min(cols - 1, x1));
    const cz0 = Math.max(0, Math.min(rows - 1, z0));
    const cz1 = Math.max(0, Math.min(rows - 1, z1));

    // Get elevations at corners
    const e00 = map.terrain[cz0]![cx0]!.elevation;
    const e10 = map.terrain[cz0]![cx1]!.elevation;
    const e01 = map.terrain[cz1]![cx0]!.elevation;
    const e11 = map.terrain[cz1]![cx1]!.elevation;

    // Bilinear interpolation
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
