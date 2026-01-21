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
  private navGrid: number[][] = []; // Cost grid: 1.0 = normal, 2-5 = high cost, Infinity = impassable
  private gridSize = 4; // meters per grid cell
  private mapWidth = 0;
  private mapHeight = 0;
  private gridWidth = 0;
  private gridHeight = 0;

  // CRITICAL PERFORMANCE: Pathfinding budget to prevent frame rate collapse
  // Limit A* searches per frame to maintain 60 FPS
  private pathfindingCallsThisFrame = 0;
  private readonly MAX_PATHFINDING_PER_FRAME = 5; // Max 5 A* searches per frame (~20-50ms total)

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Reset pathfinding budget at start of each frame
   * Called by Game.fixedUpdate()
   */
  resetFrameBudget(): void {
    this.pathfindingCallsThisFrame = 0;
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

    // Initialize grid with default cost (1.0 = normal passable)
    this.navGrid = [];
    for (let z = 0; z < this.gridHeight; z++) {
      this.navGrid[z] = [];
      for (let x = 0; x < this.gridWidth; x++) {
        this.navGrid[z]![x] = 1.0;
      }
    }

    // Calculate terrain costs based on slope and obstacles
    this.buildNavigationGrid();
  }

  /**
   * Build navigation grid by analyzing terrain
   * Uses cost-based system with obstacle inflation to prevent stuck units
   */
  private buildNavigationGrid(): void {
    let passableCount = 0;
    let blockedCount = 0;
    let highCostCount = 0;

    // Step 1: Calculate base costs for each cell
    for (let gridZ = 0; gridZ < this.gridHeight; gridZ++) {
      for (let gridX = 0; gridX < this.gridWidth; gridX++) {
        const worldX = (gridX * this.gridSize) - this.mapWidth / 2;
        const worldZ = (gridZ * this.gridSize) - this.mapHeight / 2;

        // Get cell cost (1.0 = passable, Infinity = impassable, 2-5 = high cost)
        const cost = this.getCellCost(worldX, worldZ);
        this.navGrid[gridZ]![gridX] = cost;

        if (cost === Infinity) {
          blockedCount++;
        } else if (cost > 1.0) {
          highCostCount++;
        } else {
          passableCount++;
        }
      }
    }

    // Step 2: Inflate obstacles - mark adjacent cells as high cost
    // This prevents units from pathing too close to impassable terrain
    const inflatedGrid = this.inflateObstacles();
    this.navGrid = inflatedGrid;

    // Recalculate stats after inflation
    passableCount = 0;
    blockedCount = 0;
    highCostCount = 0;
    for (let gridZ = 0; gridZ < this.gridHeight; gridZ++) {
      for (let gridX = 0; gridX < this.gridWidth; gridX++) {
        const cost = this.navGrid[gridZ]![gridX]!;
        if (cost === Infinity) {
          blockedCount++;
        } else if (cost > 1.0) {
          highCostCount++;
        } else {
          passableCount++;
        }
      }
    }

    const totalCells = this.gridWidth * this.gridHeight;
    const passablePercent = ((passableCount / totalCells) * 100).toFixed(1);
    const highCostPercent = ((highCostCount / totalCells) * 100).toFixed(1);
    console.log(`[PathfindingManager] Navigation grid built: ${passableCount}/${totalCells} normal (${passablePercent}%), ${highCostCount} high-cost (${highCostPercent}%), ${blockedCount} blocked`);
  }

  /**
   * Inflate obstacles by marking adjacent cells as high cost
   * This creates a "danger zone" that pathfinding avoids unless necessary
   */
  private inflateObstacles(): number[][] {
    const inflated: number[][] = [];

    // Copy existing grid
    for (let z = 0; z < this.gridHeight; z++) {
      inflated[z] = [];
      for (let x = 0; x < this.gridWidth; x++) {
        inflated[z]![x] = this.navGrid[z]![x]!;
      }
    }

    // Inflate around impassable cells
    for (let gridZ = 0; gridZ < this.gridHeight; gridZ++) {
      for (let gridX = 0; gridX < this.gridWidth; gridX++) {
        const cost = this.navGrid[gridZ]![gridX]!;

        // If this cell is impassable, inflate neighbors
        if (cost === Infinity) {
          // Check 8 neighbors + 2-cell radius for graduated cost
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dz === 0) continue; // Skip center

              const nx = gridX + dx;
              const nz = gridZ + dz;

              // Check bounds
              if (nx < 0 || nx >= this.gridWidth || nz < 0 || nz >= this.gridHeight) continue;

              const neighborCost = inflated[nz]![nx]!;

              // Don't inflate already-impassable cells
              if (neighborCost === Infinity) continue;

              // Calculate distance from obstacle
              const dist = Math.sqrt(dx * dx + dz * dz);

              // Graduated cost: closer to obstacle = higher cost
              let inflationCost = 1.0;
              if (dist <= 1.5) {
                inflationCost = 5.0; // Adjacent cells: 5x cost
              } else if (dist <= 2.5) {
                inflationCost = 2.0; // 2 cells away: 2x cost
              }

              // Use maximum of existing cost or inflation cost
              inflated[nz]![nx] = Math.max(neighborCost, inflationCost);
            }
          }
        }
      }
    }

    return inflated;
  }

  /**
   * Calculate cost for a cell based on terrain and slope
   * Returns 1.0 for normal terrain, 2-5 for rough/steep terrain, Infinity for impassable
   */
  private getCellCost(worldX: number, worldZ: number): number {
    // Check terrain type first
    const terrain = this.game.getTerrainAt(worldX, worldZ);
    if (!terrain) {
      // No terrain data - mark map edges as impassable
      const gridPos = this.worldToGrid(worldX, worldZ);
      const isEdge = gridPos.x === 0 || gridPos.x === this.gridWidth - 1 ||
                     gridPos.z === 0 || gridPos.z === this.gridHeight - 1;
      return isEdge ? Infinity : 1.0;
    }

    // Water and buildings are impassable
    if (terrain.type === 'water' || terrain.type === 'river' || terrain.type === 'building') {
      return Infinity;
    }

    // Check slope in all directions
    const height = this.game.getElevationAt(worldX, worldZ);
    const sampleDist = this.gridSize / 2;
    const heightN = this.game.getElevationAt(worldX, worldZ + sampleDist);
    const heightS = this.game.getElevationAt(worldX, worldZ - sampleDist);
    const heightE = this.game.getElevationAt(worldX + sampleDist, worldZ);
    const heightW = this.game.getElevationAt(worldX - sampleDist, worldZ);

    const MAX_SLOPE = 1.0; // 45 degrees - impassable beyond this
    const HIGH_SLOPE = 0.7; // 35 degrees - high cost but passable

    const slopeN = Math.abs(heightN - height) / sampleDist;
    const slopeS = Math.abs(heightS - height) / sampleDist;
    const slopeE = Math.abs(heightE - height) / sampleDist;
    const slopeW = Math.abs(heightW - height) / sampleDist;
    const maxSlope = Math.max(slopeN, slopeS, slopeE, slopeW);

    // Impassable if slope exceeds maximum
    if (maxSlope > MAX_SLOPE) {
      return Infinity;
    }

    // High cost for steep terrain (0.7-1.0 slope = 35-45 degrees)
    if (maxSlope > HIGH_SLOPE) {
      const steepnessFactor = (maxSlope - HIGH_SLOPE) / (MAX_SLOPE - HIGH_SLOPE);
      return 1.0 + steepnessFactor * 4.0; // Cost ranges from 1.0 to 5.0
    }

    // Normal cost for gentle terrain
    return 1.0;
  }


  /**
   * Find path from start to goal using A*
   */
  findPath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] | null {
    // CRITICAL PERFORMANCE: Check pathfinding budget to prevent frame rate collapse
    // If budget exhausted, return null and let unit try again next frame
    if (this.pathfindingCallsThisFrame >= this.MAX_PATHFINDING_PER_FRAME) {
      // Budget exhausted - defer pathfinding to next frame
      return null;
    }
    this.pathfindingCallsThisFrame++;

    // Convert world coordinates to grid coordinates
    const startGrid = this.worldToGrid(start.x, start.z);
    const goalGrid = this.worldToGrid(goal.x, goal.z);

    // Early termination: if goal is extremely far (>500m), likely unreachable
    const straightLineDistance = Math.sqrt(
      Math.pow(goalGrid.x - startGrid.x, 2) + Math.pow(goalGrid.z - startGrid.z, 2)
    );
    if (straightLineDistance > 125) { // 125 grid cells * 4m = 500m
      return null;
    }

    // Check if start and goal are valid
    if (!this.isGridPassable(startGrid.x, startGrid.z)) {
      // Reduce console spam - only log occasionally
      if (Math.random() < 0.1) {
        console.warn('[PathfindingManager] Start position is blocked');
      }
      return null;
    }
    if (!this.isGridPassable(goalGrid.x, goalGrid.z)) {
      // Reduce console spam - only log occasionally
      if (Math.random() < 0.1) {
        console.warn('[PathfindingManager] Goal position is blocked');
      }
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

    // Safety limit to prevent infinite loops on large maps
    // Lowered from 10000 to 2000 for faster failure and better performance
    const MAX_ITERATIONS = 2000;
    let iterations = 0;

    while (openList.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
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

        // Calculate costs with terrain cost multiplier
        const isDiagonal = offset.x !== 0 && offset.z !== 0;
        const baseCost = isDiagonal ? 1.414 : 1.0;
        const terrainCost = this.navGrid[nz]?.[nx] ?? 1.0;
        const moveCost = baseCost * terrainCost; // Apply terrain cost multiplier
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
    if (iterations >= MAX_ITERATIONS) {
      // Reduce console spam - only log occasionally (10% of the time)
      if (Math.random() < 0.1) {
        console.warn('[PathfindingManager] A* exceeded max iterations');
      }
    }
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
   * Check if grid cell is passable (cost < Infinity)
   */
  private isGridPassable(gridX: number, gridZ: number): boolean {
    if (gridX < 0 || gridX >= this.gridWidth ||
        gridZ < 0 || gridZ >= this.gridHeight) {
      return false;
    }
    const cost = this.navGrid[gridZ]?.[gridX] ?? Infinity;
    return cost < Infinity;
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
      const cost = this.getCellCost(worldX, worldZ);
      this.navGrid[grid.z]![grid.x] = cost;
    }
  }

  /**
   * Find nearest reachable position to a target (spiral search)
   * Useful when the direct target is impassable
   */
  findNearestReachablePosition(
    start: THREE.Vector3,
    goal: THREE.Vector3,
    maxRadius: number = 50
  ): THREE.Vector3 | null {
    // CRITICAL PERFORMANCE: Check pathfinding budget
    // This method calls findPath internally, so check budget before expensive work
    if (this.pathfindingCallsThisFrame >= this.MAX_PATHFINDING_PER_FRAME) {
      return null; // Budget exhausted
    }

    const goalGrid = this.worldToGrid(goal.x, goal.z);
    const maxSteps = Math.ceil(maxRadius / this.gridSize);

    // Spiral search outward from goal
    for (let radius = 1; radius <= maxSteps; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check cells on ring edge (not interior)
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;

          const testX = goalGrid.x + dx;
          const testZ = goalGrid.z + dz;

          if (this.isGridPassable(testX, testZ)) {
            const worldPos = this.gridToWorld(testX, testZ);
            const testVec = new THREE.Vector3(worldPos.x, 0, worldPos.z);

            // Verify path actually exists to this position
            const path = this.findPath(start, testVec);
            if (path && path.length > 0) {
              return testVec;
            }
          }
        }
      }
    }

    return null;
  }
}
