/**
 * NavMeshManager - Navigation mesh generation, queries, and serialization
 *
 * Uses recast-navigation to build a navmesh from terrain and building geometry.
 * Provides fast, accurate pathfinding that respects terrain slopes, buildings,
 * and water bodies. Supports serialization for multiplayer sync.
 *
 * Area types:
 *   AREA_GROUND (0)     - default walkable (cost 1.0)
 *   AREA_ROAD (1)       - roads (cost 0.5)
 *   AREA_FOREST (2)     - forests (cost 1.5)
 *   AREA_UNWALKABLE (63) - water, buildings, cliffs (blocked)
 */

import * as THREE from 'three';
import { init, NavMesh, NavMeshQuery, exportNavMesh, importNavMesh } from '@recast-navigation/core';
import { getPositionsAndIndices } from '@recast-navigation/three';
import { generateSoloNavMesh } from '@recast-navigation/generators';
import type { Game } from '../../core/Game';

// Area type constants for terrain cost modifiers
const AREA_GROUND = 0;
const AREA_ROAD = 1;
const AREA_FOREST = 2;

export class NavMeshManager {
  private readonly game: Game;
  private navMesh: NavMesh | null = null;
  private navMeshQuery: NavMeshQuery | null = null;
  private wasmReady = false;

  // Pathfinding budget (same pattern as PathfindingManager)
  private pathfindingCallsThisFrame = 0;
  private readonly MAX_PATHFINDING_PER_FRAME = 10; // NavMesh queries are faster than grid A*

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initialize the recast-navigation WASM module.
   * Must be called once before any navmesh operations.
   */
  async initWasm(): Promise<void> {
    if (this.wasmReady) return;
    await init();
    this.wasmReady = true;
    console.log('[NavMeshManager] WASM initialized');
  }

  /**
   * Reset pathfinding budget at start of each frame
   */
  resetFrameBudget(): void {
    this.pathfindingCallsThisFrame = 0;
  }

  /**
   * Generate navmesh from the current map's rendered terrain.
   * Call after mapRenderer.render(map) has completed.
   */
  generateFromScene(): void {
    if (!this.wasmReady) {
      console.warn('[NavMeshManager] WASM not initialized, skipping navmesh generation');
      return;
    }

    const mapRenderer = this.game.mapRenderer;
    if (!mapRenderer) {
      console.warn('[NavMeshManager] No mapRenderer available');
      return;
    }

    const startTime = performance.now();
    const mapGroup = mapRenderer.getMapGroup();

    // Collect walkable terrain meshes (terrain chunks)
    // Exclude water and buildings — they should block navigation
    const walkableMeshes: THREE.Mesh[] = [];
    const obstacleMeshes: THREE.Mesh[] = [];

    mapGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.geometry) return;

      const name = child.name;

      // Terrain chunks are walkable
      if (name.startsWith('terrain-chunk-')) {
        walkableMeshes.push(child);
        return;
      }

      // Water and buildings are obstacles
      if (name.startsWith('lake-') || name.startsWith('river-')) {
        obstacleMeshes.push(child);
        return;
      }
    });

    // Also collect building meshes from the buildings group
    const buildingsGroup = mapGroup.getObjectByName('buildings');
    if (buildingsGroup) {
      buildingsGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          obstacleMeshes.push(child);
        }
      });
    }

    console.log(`[NavMeshManager] Collected ${walkableMeshes.length} terrain meshes, ${obstacleMeshes.length} obstacle meshes`);

    if (walkableMeshes.length === 0) {
      console.warn('[NavMeshManager] No terrain meshes found, cannot generate navmesh');
      return;
    }

    // Extract positions and indices from terrain meshes
    // We pass only terrain — recast will compute walkability based on slope
    const [positions, indices] = getPositionsAndIndices(walkableMeshes);

    // NavMesh generation config optimized for RTS scale
    const map = this.game.currentMap;
    const mapSize = map ? Math.max(map.width, map.height) : 500;

    // Use tileSize=0 for solo (non-tiled) navmesh which is simpler and sufficient
    // for maps up to ~1000m. For 10x maps, switch to tiled navmesh.
    const result = generateSoloNavMesh(positions, indices, {
      cs: 0.5,                    // cell size (0.5m — good terrain detail)
      ch: 0.3,                    // cell height
      walkableSlopeAngle: 45,     // matches MAX_TRAVERSABLE_SLOPE = 1.0
      walkableHeight: Math.ceil(2.0 / 0.3),   // 2m agent height in voxels
      walkableClimb: Math.ceil(0.3 / 0.3),    // 0.3m max step in voxels
      walkableRadius: Math.ceil(0.5 / 0.5),   // 0.5m agent radius in cells
      maxEdgeLen: Math.ceil(12.0 / 0.5),      // max edge length in voxels
      maxSimplificationError: 1.3,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
    });

    if (!result.success) {
      console.error('[NavMeshManager] NavMesh generation failed:', result.error);
      return;
    }

    this.navMesh = result.navMesh;
    this.navMeshQuery = new NavMeshQuery(this.navMesh, { maxNodes: 4096 });
    this.navMeshQuery.defaultQueryHalfExtents = { x: 5, y: 10, z: 5 };

    // Set area costs on the default filter
    const filter = this.navMeshQuery.defaultFilter;
    filter.setAreaCost(AREA_GROUND, 1.0);
    filter.setAreaCost(AREA_ROAD, 0.5);
    filter.setAreaCost(AREA_FOREST, 1.5);

    const elapsed = (performance.now() - startTime).toFixed(1);
    console.log(`[NavMeshManager] NavMesh generated in ${elapsed}ms (map size: ${mapSize}m)`);
  }

  /**
   * Find a path from start to goal using the navmesh.
   * Returns array of THREE.Vector3 waypoints, or null if no path found.
   */
  findPath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] | null {
    if (!this.navMeshQuery) return null;

    // Budget check
    if (this.pathfindingCallsThisFrame >= this.MAX_PATHFINDING_PER_FRAME) {
      return null;
    }
    this.pathfindingCallsThisFrame++;

    const result = this.navMeshQuery.computePath(
      { x: start.x, y: start.y, z: start.z },
      { x: goal.x, y: goal.y, z: goal.z },
      {
        maxPathPolys: 256,
        maxStraightPathPoints: 64,
      }
    );

    if (!result.success || result.path.length === 0) {
      return null;
    }

    // Convert to THREE.Vector3 array
    const path: THREE.Vector3[] = [];
    for (const p of result.path) {
      path.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    return path;
  }

  /**
   * Find the nearest reachable position on the navmesh to a target.
   * Useful when the direct target is off-mesh.
   */
  findNearestReachablePosition(
    start: THREE.Vector3,
    goal: THREE.Vector3,
    _maxRadius: number
  ): THREE.Vector3 | null {
    if (!this.navMeshQuery) return null;

    // Budget check
    if (this.pathfindingCallsThisFrame >= this.MAX_PATHFINDING_PER_FRAME) {
      return null;
    }

    // Find closest point on navmesh to goal
    const closest = this.navMeshQuery.findClosestPoint(
      { x: goal.x, y: goal.y, z: goal.z },
      { halfExtents: { x: 10, y: 10, z: 10 } }
    );

    if (!closest.success) return null;

    const point = closest.point;
    const nearestPos = new THREE.Vector3(point.x, point.y, point.z);

    // Verify we can actually path to this point
    const path = this.findPath(start, nearestPos);
    if (path && path.length > 0) {
      return nearestPos;
    }

    return null;
  }

  /**
   * Check if a position is on the navmesh (walkable).
   */
  isPositionOnNavMesh(x: number, z: number): boolean {
    if (!this.navMeshQuery) return true; // Fallback: assume walkable if no navmesh

    const result = this.navMeshQuery.findNearestPoly(
      { x, y: this.game.getElevationAt(x, z), z },
      { halfExtents: { x: 1, y: 5, z: 1 } }
    );

    return result.success && result.isOverPoly === true;
  }

  /**
   * Export the current navmesh to binary data for multiplayer sync.
   * Host generates the navmesh, then broadcasts this data to all clients.
   */
  exportNavMeshData(): Uint8Array | null {
    if (!this.navMesh) return null;
    return exportNavMesh(this.navMesh);
  }

  /**
   * Import a navmesh from binary data (received from host in multiplayer).
   * All clients importing the same data get identical navmeshes = deterministic pathfinding.
   */
  importNavMeshData(data: Uint8Array): boolean {
    if (!this.wasmReady) {
      console.warn('[NavMeshManager] WASM not initialized, cannot import navmesh');
      return false;
    }

    try {
      // Destroy existing navmesh
      this.destroy();

      const result = importNavMesh(data);
      this.navMesh = result.navMesh;
      this.navMeshQuery = new NavMeshQuery(this.navMesh, { maxNodes: 4096 });
      this.navMeshQuery.defaultQueryHalfExtents = { x: 5, y: 10, z: 5 };

      // Set area costs
      const filter = this.navMeshQuery.defaultFilter;
      filter.setAreaCost(AREA_GROUND, 1.0);
      filter.setAreaCost(AREA_ROAD, 0.5);
      filter.setAreaCost(AREA_FOREST, 1.5);

      console.log('[NavMeshManager] NavMesh imported from binary data');
      return true;
    } catch (err) {
      console.error('[NavMeshManager] Failed to import navmesh:', err);
      return false;
    }
  }

  /** Whether a navmesh is available for queries */
  get isReady(): boolean {
    return this.navMeshQuery !== null;
  }

  /** Raw NavMesh instance for debug visualization */
  getNavMesh(): NavMesh | null {
    return this.navMesh;
  }

  /**
   * Clean up navmesh resources
   */
  destroy(): void {
    if (this.navMeshQuery) {
      this.navMeshQuery.destroy();
      this.navMeshQuery = null;
    }
    if (this.navMesh) {
      this.navMesh.destroy();
      this.navMesh = null;
    }
  }
}
