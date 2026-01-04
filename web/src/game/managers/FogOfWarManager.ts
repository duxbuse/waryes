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

export enum VisibilityState {
  Unexplored = 0,  // Never seen (black)
  Explored = 1,    // Previously seen (grayed)
  Visible = 2,     // Currently visible (full color)
}

export class FogOfWarManager {
  private readonly game: Game;
  private enabled = true;

  // Vision map (grid-based for performance)
  private readonly cellSize = 10; // 10m cells

  // Current visibility (cleared each frame)
  private currentVision: Map<string, boolean> = new Map();

  // Explored state (persistent - once explored, stays explored)
  private exploredGrid: Map<string, boolean> = new Map();

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initialize fog of war
   */
  initialize(): void {
    this.currentVision.clear();
    this.exploredGrid.clear();
  }

  /**
   * Update fog of war based on unit positions
   */
  update(_dt: number): void {
    if (!this.enabled) return;

    // Clear current vision (but keep explored state)
    this.currentVision.clear();

    // Get all friendly units (player + allies) - they share vision
    const playerUnits = this.game.unitManager.getAllUnits().filter(u => u.team === 'player');

    // Update vision for each unit
    for (const unit of playerUnits) {
      this.updateVisionForUnit(unit);
    }

    // Hide enemy units outside vision
    this.updateEnemyVisibility();
  }

  /**
   * Update vision around a unit
   */
  private updateVisionForUnit(unit: Unit): void {
    const visionRadius = this.getVisionRadius(unit);
    const unitPos = unit.position;

    // Mark cells within vision radius as visible
    const cellRadius = Math.ceil(visionRadius / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const worldX = unitPos.x + dx * this.cellSize;
        const worldZ = unitPos.z + dz * this.cellSize;

        // Check if within circle
        const distSq = (worldX - unitPos.x) ** 2 + (worldZ - unitPos.z) ** 2;
        if (distSq <= visionRadius ** 2) {
          // Check line of sight - blocked by smoke
          const targetPos = new THREE.Vector3(worldX, unitPos.y, worldZ);
          if (!this.isLOSBlocked(unitPos, targetPos)) {
            const key = this.getCellKey(worldX, worldZ);
            this.currentVision.set(key, true);
            // Also mark as explored (permanent)
            this.exploredGrid.set(key, true);
          }
        }
      }
    }
  }

  /**
   * Get vision radius for a unit
   */
  private getVisionRadius(_unit: Unit): number {
    // Base vision radius (50m default)
    // In a full implementation, this would read from unit's optics stat
    const baseVision = 50;
    return baseVision;
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
   * Get visibility state for a position
   */
  getVisibilityState(x: number, z: number): VisibilityState {
    if (!this.enabled) return VisibilityState.Visible;

    const key = this.getCellKey(x, z);

    if (this.currentVision.has(key)) {
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
    // Player's own units are always visible
    if (unit.team === 'player') return true;

    // Enemy units only visible if currently in vision (not just explored)
    return this.isVisible(unit.position.x, unit.position.z);
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

  /**
   * Check if line of sight is blocked between two positions
   */
  private isLOSBlocked(start: THREE.Vector3, end: THREE.Vector3): boolean {
    // Check smoke blocking
    if (this.game.smokeManager.blocksLOS(start, end)) {
      return true;
    }

    // Check building blocking
    if (this.isBuildingBlocking(start, end)) {
      return true;
    }

    // Check forest blocking
    if (this.isForestBlocking(start, end)) {
      return true;
    }

    return false;
  }

  /**
   * Check if buildings block line of sight
   */
  private isBuildingBlocking(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const buildings = this.game.currentMap?.buildings ?? [];

    for (const building of buildings) {
      // Check if line segment intersects building AABB
      const buildingPos = new THREE.Vector3(building.x, 0, building.z);
      const halfWidth = building.width / 2;
      const halfDepth = building.depth / 2;

      // Simple 2D line-box intersection test
      if (this.lineIntersectsBox2D(start, end, buildingPos, halfWidth, halfDepth)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if forests block line of sight
   */
  private isForestBlocking(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const map = this.game.currentMap;
    if (!map) return false;

    const terrain = map.terrain;
    const cellSize = 4; // Match MapRenderer cell size
    const cols = terrain[0]?.length ?? 0;
    const rows = terrain.length;

    // Sample points along the line
    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = direction.length();
    const steps = Math.ceil(distance / cellSize);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = new THREE.Vector3().lerpVectors(start, end, t);

      // Convert world position to grid coordinates
      const gridX = Math.floor((point.x + map.width / 2) / cellSize);
      const gridZ = Math.floor((point.z + map.height / 2) / cellSize);

      // Check if in bounds
      if (gridZ >= 0 && gridZ < rows && gridX >= 0 && gridX < cols) {
        const cell = terrain[gridZ]?.[gridX];
        if (cell?.type === 'forest') {
          return true; // LOS blocked by forest
        }
      }
    }

    return false;
  }

  /**
   * 2D line-box intersection test
   */
  private lineIntersectsBox2D(
    start: THREE.Vector3,
    end: THREE.Vector3,
    boxCenter: THREE.Vector3,
    halfWidth: number,
    halfDepth: number
  ): boolean {
    // AABB boundaries
    const minX = boxCenter.x - halfWidth;
    const maxX = boxCenter.x + halfWidth;
    const minZ = boxCenter.z - halfDepth;
    const maxZ = boxCenter.z + halfDepth;

    // Check if either endpoint is inside the box
    if (this.pointInBox2D(start, minX, maxX, minZ, maxZ) ||
        this.pointInBox2D(end, minX, maxX, minZ, maxZ)) {
      return true;
    }

    // Check line segment intersection with box edges
    // This is a simplified test - check if line crosses any edge
    const dx = end.x - start.x;
    const dz = end.z - start.z;

    // Parametric line equation: P = start + t * direction
    // Check intersection with vertical edges (x = minX, x = maxX)
    for (const x of [minX, maxX]) {
      if (dx !== 0) {
        const t = (x - start.x) / dx;
        if (t >= 0 && t <= 1) {
          const z = start.z + t * dz;
          if (z >= minZ && z <= maxZ) {
            return true;
          }
        }
      }
    }

    // Check intersection with horizontal edges (z = minZ, z = maxZ)
    for (const z of [minZ, maxZ]) {
      if (dz !== 0) {
        const t = (z - start.z) / dz;
        if (t >= 0 && t <= 1) {
          const x = start.x + t * dx;
          if (x >= minX && x <= maxX) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if a point is inside a 2D box
   */
  private pointInBox2D(
    point: THREE.Vector3,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): boolean {
    return point.x >= minX && point.x <= maxX &&
           point.z >= minZ && point.z <= maxZ;
  }

  /**
   * Check if fog of war is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
