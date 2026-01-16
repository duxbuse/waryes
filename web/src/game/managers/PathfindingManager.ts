/**
 * PathfindingManager - A* pathfinding for unit navigation
 *
 * Features:
 * - Grid-based navigation with terrain awareness
 * - A* algorithm for optimal paths
 * - Obstacle avoidance (cliffs, buildings, water)
 * - Path smoothing for natural movement
 * - Dynamic rerouting when blocked
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';

interface PathNode {
  x: number;
  z: number;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // Total cost
  parent: PathNode | null;
}

export class PathfindingManager {
  private readonly game: Game;
  private navGrid: boolean[][] = []; // true = passable, false = blocked
  private gridSize = 4; // meters per grid cell
  private mapWidth = 0;
  private mapHeight = 0;
  private gridWidth = 0;
  private gridHeight = 0;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initialize navigation grid from map data
   */
  initialize(): void {
    const map = this.game.currentMap;
    if (!map) return;

    this.mapWidth = map.width;
    this.mapHeight = map.height;
    this.gridWidth = Math.ceil(this.mapWidth / this.gridSize);
    this.gridHeight = Math.ceil(this.mapHeight / this.gridSize);

    // Initialize grid as all passable
    this.navGrid = [];
    for (let z = 0; z < this.gridHeight; z++) {
      this.navGrid[z] = [];
      for (let x = 0; x < this.gridWidth; x++) {
        this.navGrid[z]![x] = true;
      }
    }

    // Mark impassable areas based on terrain
    this.buildNavigationGrid();
  }

  /**
   * Build navigation grid by analyzing terrain
   */
  private buildNavigationGrid(): void {
    for (let gridZ = 0; gridZ < this.gridHeight; gridZ++) {
      for (let gridX = 0; gridX < this.gridWidth; gridX++) {
        const worldX = (gridX * this.gridSize) - this.mapWidth / 2;
        const worldZ = (gridZ * this.gridSize) - this.mapHeight / 2;

        // Check if this cell is passable
        const passable = this.isCellPassable(worldX, worldZ);
        this.navGrid[gridZ]![gridX] = passable;
      }
    }
  }

  /**
   * Check if a world position is passable
   */
  private isCellPassable(worldX: number, worldZ: number): boolean {
    // Check terrain height and slope
    const height = this.game.getElevationAt(worldX, worldZ);

    // Check slope in all directions
    const sampleDist = this.gridSize / 2;
    const heightN = this.game.getElevationAt(worldX, worldZ + sampleDist);
    const heightS = this.game.getElevationAt(worldX, worldZ - sampleDist);
    const heightE = this.game.getElevationAt(worldX + sampleDist, worldZ);
    const heightW = this.game.getElevationAt(worldX - sampleDist, worldZ);

    const MAX_SLOPE = 1.0; // 45 degrees
    const slopeN = Math.abs(heightN - height) / sampleDist;
    const slopeS = Math.abs(heightS - height) / sampleDist;
    const slopeE = Math.abs(heightE - height) / sampleDist;
    const slopeW = Math.abs(heightW - height) / sampleDist;

    if (slopeN > MAX_SLOPE || slopeS > MAX_SLOPE ||
        slopeE > MAX_SLOPE || slopeW > MAX_SLOPE) {
      return false;
    }

    // Check terrain type
    const terrain = this.game.getTerrainAt(worldX, worldZ);
    if (terrain) {
      // Water is impassable for ground units
      if (terrain.type === 'water' || terrain.type === 'river') {
        return false;
      }
      // Buildings are impassable
      if (terrain.type === 'building') {
        return false;
      }
    }

    return true;
  }

  /**
   * Find path from start to goal using A*
   */
  findPath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] | null {
    // Convert world coordinates to grid coordinates
    const startGrid = this.worldToGrid(start.x, start.z);
    const goalGrid = this.worldToGrid(goal.x, goal.z);

    // Check if start and goal are valid
    if (!this.isGridPassable(startGrid.x, startGrid.z) ||
        !this.isGridPassable(goalGrid.x, goalGrid.z)) {
      return null;
    }

    // A* algorithm
    const openList: PathNode[] = [];
    const closedSet = new Set<string>();

    const startNode: PathNode = {
      x: startGrid.x,
      z: startGrid.z,
      g: 0,
      h: this.heuristic(startGrid.x, startGrid.z, goalGrid.x, goalGrid.z),
      f: 0,
      parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);

    while (openList.length > 0) {
      // Find node with lowest f score
      let currentIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i]!.f < openList[currentIdx]!.f) {
          currentIdx = i;
        }
      }

      const current = openList[currentIdx]!;

      // Found goal?
      if (current.x === goalGrid.x && current.z === goalGrid.z) {
        return this.reconstructPath(current);
      }

      // Move current from open to closed
      openList.splice(currentIdx, 1);
      closedSet.add(`${current.x},${current.z}`);

      // Check neighbors (8-directional)
      const neighbors = [
        { x: 0, z: -1 }, // N
        { x: 1, z: -1 }, // NE
        { x: 1, z: 0 },  // E
        { x: 1, z: 1 },  // SE
        { x: 0, z: 1 },  // S
        { x: -1, z: 1 }, // SW
        { x: -1, z: 0 }, // W
        { x: -1, z: -1 } // NW
      ];

      for (const offset of neighbors) {
        const nx = current.x + offset.x;
        const nz = current.z + offset.z;

        // Skip if out of bounds or impassable
        if (!this.isGridPassable(nx, nz)) continue;

        // Skip if in closed set
        const key = `${nx},${nz}`;
        if (closedSet.has(key)) continue;

        // Calculate costs
        const isDiagonal = offset.x !== 0 && offset.z !== 0;
        const moveCost = isDiagonal ? 1.414 : 1.0;
        const g = current.g + moveCost;
        const h = this.heuristic(nx, nz, goalGrid.x, goalGrid.z);
        const f = g + h;

        // Check if neighbor is in open list
        let neighborNode = openList.find(n => n.x === nx && n.z === nz);

        if (!neighborNode) {
          // Add to open list
          neighborNode = { x: nx, z: nz, g, h, f, parent: current };
          openList.push(neighborNode);
        } else if (g < neighborNode.g) {
          // Update if better path found
          neighborNode.g = g;
          neighborNode.f = f;
          neighborNode.parent = current;
        }
      }
    }

    // No path found
    return null;
  }

  /**
   * Reconstruct path from goal node
   */
  private reconstructPath(goalNode: PathNode): THREE.Vector3[] {
    const path: THREE.Vector3[] = [];
    let current: PathNode | null = goalNode;

    while (current) {
      const worldPos = this.gridToWorld(current.x, current.z);
      path.unshift(new THREE.Vector3(worldPos.x, 0, worldPos.z));
      current = current.parent;
    }

    // Smooth the path (remove unnecessary waypoints)
    return this.smoothPath(path);
  }

  /**
   * Smooth path by removing unnecessary waypoints
   */
  private smoothPath(path: THREE.Vector3[]): THREE.Vector3[] {
    if (path.length <= 2) return path;

    const smoothed: THREE.Vector3[] = [path[0]!];
    let current = 0;

    while (current < path.length - 1) {
      // Try to skip ahead as far as possible
      let farthest = current + 1;
      for (let i = path.length - 1; i > current + 1; i--) {
        if (this.hasLineOfSight(path[current]!, path[i]!)) {
          farthest = i;
          break;
        }
      }
      smoothed.push(path[farthest]!);
      current = farthest;
    }

    return smoothed;
  }

  /**
   * Check if there's line of sight between two points (for path smoothing)
   */
  private hasLineOfSight(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(distance / (this.gridSize / 2));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = start.x + dx * t;
      const z = start.z + dz * t;
      const grid = this.worldToGrid(x, z);

      if (!this.isGridPassable(grid.x, grid.z)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Heuristic function (Euclidean distance)
   */
  private heuristic(x1: number, z1: number, x2: number, z2: number): number {
    const dx = x2 - x1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Check if grid cell is passable
   */
  private isGridPassable(gridX: number, gridZ: number): boolean {
    if (gridX < 0 || gridX >= this.gridWidth ||
        gridZ < 0 || gridZ >= this.gridHeight) {
      return false;
    }
    return this.navGrid[gridZ]?.[gridX] ?? false;
  }

  /**
   * Convert world coordinates to grid coordinates
   */
  private worldToGrid(worldX: number, worldZ: number): { x: number; z: number } {
    const x = Math.floor((worldX + this.mapWidth / 2) / this.gridSize);
    const z = Math.floor((worldZ + this.mapHeight / 2) / this.gridSize);
    return { x, z };
  }

  /**
   * Convert grid coordinates to world coordinates (center of cell)
   */
  private gridToWorld(gridX: number, gridZ: number): { x: number; z: number } {
    const x = (gridX * this.gridSize) - this.mapWidth / 2 + this.gridSize / 2;
    const z = (gridZ * this.gridSize) - this.mapHeight / 2 + this.gridSize / 2;
    return { x, z };
  }

  /**
   * Update navigation grid dynamically (e.g., when buildings are destroyed)
   */
  updateCell(worldX: number, worldZ: number): void {
    const grid = this.worldToGrid(worldX, worldZ);
    if (grid.x >= 0 && grid.x < this.gridWidth &&
        grid.z >= 0 && grid.z < this.gridHeight) {
      const passable = this.isCellPassable(worldX, worldZ);
      this.navGrid[grid.z]![grid.x] = passable;
    }
  }
}
