import * as THREE from 'three';
import type { Unit } from '../units/Unit';
import type { Game } from '../../core/Game';
import { LAYERS } from '../utils/LayerConstants';
import { getUnitGeometry } from '../utils/SharedGeometryCache';
import { getUnitMaterial, getWireframeMaterial } from '../units/SharedMaterials';

/**
 * InstancedUnitRenderer - Batches unit rendering using THREE.InstancedMesh
 *
 * Benefits:
 * - Reduces draw calls from ~200 to ~20 (10x improvement)
 * - GPU processes all instances in single draw call
 * - Massive FPS improvement for large unit counts
 *
 * How it works:
 * - Groups units by (category, team, ownerId)
 * - Creates one InstancedMesh per group
 * - Updates instance matrices each frame
 * - Uses RENDER_ONLY layer (rendered but not raycast)
 * - Unit bodyMesh uses RAYCAST_ONLY layer (raycasted but not rendered)
 */

interface InstanceGroup {
  bodyMesh: THREE.InstancedMesh;
  wireframeMesh: THREE.InstancedMesh;
  units: Set<string>; // Set of unit IDs in this group
  category: string;
  team: string;
  ownerId: string;
}

export class InstancedUnitRenderer {
  private game: Game;
  private scene: THREE.Scene;
  private groups: Map<string, InstanceGroup> = new Map(); // Key: "category_team_ownerId"
  private unitToGroupKey: Map<string, string> = new Map(); // Map unit ID to group key

  // Maximum instances per InstancedMesh (can be adjusted if needed)
  private readonly MAX_INSTANCES = 200;

  // Reusable temp objects (avoid creating new objects every frame)
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3(1, 1, 1);

  constructor(game: Game, scene: THREE.Scene) {
    this.game = game;
    this.scene = scene;
  }

  /**
   * Initialize the renderer - called once at game start
   */
  initialize(): void {
    console.log('[InstancedUnitRenderer] Initialized');
  }

  /**
   * Register a unit for instanced rendering
   */
  registerUnit(unit: Unit): void {
    const category = unit.category;
    const team = unit.team;
    const ownerId = unit.ownerId;
    const groupKey = `${category}_${team}_${ownerId}`;

    // Get or create group
    let group = this.groups.get(groupKey);
    if (!group) {
      group = this.createGroup(category, team, ownerId, groupKey);
      this.groups.set(groupKey, group);
    }

    // Add unit to group
    group.units.add(unit.id);
    this.unitToGroupKey.set(unit.id, groupKey);
  }

  /**
   * Unregister a unit (when it dies or is removed)
   */
  unregisterUnit(unit: Unit): void {
    const groupKey = this.unitToGroupKey.get(unit.id);
    if (!groupKey) return;

    const group = this.groups.get(groupKey);
    if (!group) return;

    // Remove unit from group
    group.units.delete(unit.id);
    this.unitToGroupKey.delete(unit.id);

    // If group is empty, clean it up
    if (group.units.size === 0) {
      this.destroyGroup(groupKey);
    }
  }

  /**
   * Create a new instance group
   */
  private createGroup(category: string, team: string, ownerId: string, groupKey: string): InstanceGroup {
    const geometry = getUnitGeometry(category);
    const material = getUnitMaterial(team as 'player' | 'enemy', ownerId);
    const wireframeMaterial = getWireframeMaterial();

    // Create instanced mesh for bodies
    const bodyMesh = new THREE.InstancedMesh(geometry, material, this.MAX_INSTANCES);
    bodyMesh.layers.set(LAYERS.RENDER_ONLY); // Rendered but not raycast
    bodyMesh.renderOrder = 999;
    bodyMesh.castShadow = false;
    bodyMesh.receiveShadow = false;
    bodyMesh.count = 0; // Start with no instances
    this.scene.add(bodyMesh);

    // Create instanced mesh for wireframes
    const wireframeGeometry = new THREE.EdgesGeometry(geometry);
    const wireframeMesh = new THREE.InstancedMesh(wireframeGeometry, wireframeMaterial, this.MAX_INSTANCES);
    wireframeMesh.layers.set(LAYERS.RENDER_ONLY);
    wireframeMesh.renderOrder = 1000;
    wireframeMesh.count = 0;
    this.scene.add(wireframeMesh);

    console.log(`[InstancedUnitRenderer] Created group: ${groupKey}`);

    return {
      bodyMesh,
      wireframeMesh,
      units: new Set(),
      category,
      team,
      ownerId,
    };
  }

  /**
   * Destroy an instance group
   */
  private destroyGroup(groupKey: string): void {
    const group = this.groups.get(groupKey);
    if (!group) return;

    this.scene.remove(group.bodyMesh);
    this.scene.remove(group.wireframeMesh);
    group.bodyMesh.dispose();
    group.wireframeMesh.dispose();

    this.groups.delete(groupKey);
    console.log(`[InstancedUnitRenderer] Destroyed group: ${groupKey}`);
  }

  /**
   * Update instance matrices - called every frame
   */
  update(): void {
    // Use reusable temp objects to avoid GC pressure
    const tempMatrix = this.tempMatrix;
    const tempPosition = this.tempPosition;
    const tempQuaternion = this.tempQuaternion;
    const tempScale = this.tempScale;

    // Update each group
    for (const [_groupKey, group] of this.groups) {
      let instanceIndex = 0;

      // Update matrices for all units in this group
      for (const unitId of group.units) {
        const unit = this.game.unitManager.getUnitById(unitId);
        if (!unit || unit.health <= 0) continue;

        // Get unit transform
        const unitMesh = unit.mesh;
        tempPosition.copy(unitMesh.position);
        tempQuaternion.copy(unitMesh.quaternion);

        // Apply body offset (units have bodyMesh at position.y = height/2)
        const height = this.getCategoryHeight(group.category);
        tempPosition.y += height / 2;

        // Build matrix
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);

        // Set instance matrix
        group.bodyMesh.setMatrixAt(instanceIndex, tempMatrix);
        group.wireframeMesh.setMatrixAt(instanceIndex, tempMatrix);

        instanceIndex++;
      }

      // Update instance count
      group.bodyMesh.count = instanceIndex;
      group.wireframeMesh.count = instanceIndex;

      // Mark matrices as needing update
      if (group.bodyMesh.instanceMatrix) {
        group.bodyMesh.instanceMatrix.needsUpdate = true;
      }
      if (group.wireframeMesh.instanceMatrix) {
        group.wireframeMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Get height for a unit category
   */
  private getCategoryHeight(category: string): number {
    const CATEGORY_HEIGHTS: Record<string, number> = {
      'INF': 1.5,
      'TANK': 2.5,
      'ART': 2.0,
      'HELO': 3.0,
      'AIR': 3.5,
      'LOG': 2.5,
      'REC': 2.0,
    };
    return CATEGORY_HEIGHTS[category] ?? 2.5;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    for (const groupKey of Array.from(this.groups.keys())) {
      this.destroyGroup(groupKey);
    }
    this.unitToGroupKey.clear();
    console.log('[InstancedUnitRenderer] Disposed');
  }

  /**
   * Get current stats for debugging
   */
  getStats() {
    let totalUnits = 0;
    for (const group of this.groups.values()) {
      totalUnits += group.units.size;
    }

    return {
      groupCount: this.groups.size,
      totalUnits,
      drawCallsSaved: totalUnits > 0 ? totalUnits * 2 - this.groups.size * 2 : 0,
    };
  }
}
