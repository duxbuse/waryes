/**
 * SmokeManager - Manages smoke clouds that block vision
 *
 * Features:
 * - Deploy smoke at positions
 * - Smoke blocks line of sight
 * - Smoke has duration and fades over time
 * - Different smoke types (grenade, launcher, artillery)
 */

import type { Game } from '../../core/Game';
import * as THREE from 'three';

export interface SmokeCloud {
  id: string;
  position: THREE.Vector3;
  radius: number;
  duration: number; // total duration in seconds
  elapsed: number; // time elapsed
  type: 'grenade' | 'launcher' | 'artillery';
  mesh: THREE.Mesh;
}

export class SmokeManager {
  private readonly game: Game;
  private readonly smokeClouds: Map<string, SmokeCloud> = new Map();
  private smokeIdCounter = 0;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Deploy smoke at a position
   */
  deploySmoke(
    position: THREE.Vector3,
    type: 'grenade' | 'launcher' | 'artillery' = 'grenade'
  ): string {
    const id = `smoke_${this.smokeIdCounter++}`;

    // Determine radius and duration based on type
    let radius: number;
    let duration: number;

    switch (type) {
      case 'grenade':
        radius = 5;
        duration = 20;
        break;
      case 'launcher':
        radius = 15;
        duration = 20;
        break;
      case 'artillery':
        radius = 50;
        duration = 60;
        break;
    }

    // Create visual representation (translucent sphere)
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.position.y = radius / 2; // Lift to ground level
    this.game.scene.add(mesh);

    const cloud: SmokeCloud = {
      id,
      position: position.clone(),
      radius,
      duration,
      elapsed: 0,
      type,
      mesh,
    };

    this.smokeClouds.set(id, cloud);

    console.log(`Deployed ${type} smoke at (${position.x}, ${position.z}), radius: ${radius}m, duration: ${duration}s`);
    return id;
  }

  /**
   * Update smoke clouds - fade over time and remove expired
   */
  update(dt: number): void {
    const expired: string[] = [];

    for (const [id, cloud] of this.smokeClouds) {
      cloud.elapsed += dt;

      // Calculate fade (full opacity at start, fade to 0 at end)
      const fadeProgress = cloud.elapsed / cloud.duration;
      const opacity = Math.max(0, 1 - fadeProgress) * 0.6;

      // Update visual opacity
      (cloud.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;

      // Mark for removal if expired
      if (cloud.elapsed >= cloud.duration) {
        expired.push(id);
      }
    }

    // Remove expired smoke
    for (const id of expired) {
      this.removeSmoke(id);
    }
  }

  /**
   * Remove a smoke cloud
   */
  private removeSmoke(id: string): void {
    const cloud = this.smokeClouds.get(id);
    if (!cloud) return;

    // Remove from scene
    this.game.scene.remove(cloud.mesh);

    // Dispose geometry and material
    cloud.mesh.geometry.dispose();
    (cloud.mesh.material as THREE.Material).dispose();

    // Remove from map
    this.smokeClouds.delete(id);

    console.log(`Smoke ${id} expired`);
  }

  /**
   * Check if a position is inside smoke
   */
  isInSmoke(position: THREE.Vector3): boolean {
    for (const cloud of this.smokeClouds.values()) {
      const distance = position.distanceTo(cloud.position);
      if (distance <= cloud.radius) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if line of sight is blocked by smoke
   */
  blocksLOS(start: THREE.Vector3, end: THREE.Vector3): boolean {
    // Check if the line segment intersects any smoke cloud
    for (const cloud of this.smokeClouds.values()) {
      if (this.lineIntersectsSphere(start, end, cloud.position, cloud.radius)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a line segment intersects a sphere (smoke cloud)
   */
  private lineIntersectsSphere(
    lineStart: THREE.Vector3,
    lineEnd: THREE.Vector3,
    sphereCenter: THREE.Vector3,
    sphereRadius: number
  ): boolean {
    // Vector from line start to sphere center
    const startToCenter = sphereCenter.clone().sub(lineStart);

    // Vector representing the line
    const lineDirection = lineEnd.clone().sub(lineStart);
    const lineLength = lineDirection.length();
    lineDirection.normalize();

    // Project sphere center onto line
    const projection = startToCenter.dot(lineDirection);

    // Clamp projection to line segment
    const clampedProjection = Math.max(0, Math.min(lineLength, projection));

    // Find closest point on line to sphere center
    const closestPoint = lineStart.clone().add(lineDirection.multiplyScalar(clampedProjection));

    // Check distance from closest point to sphere center
    const distance = closestPoint.distanceTo(sphereCenter);

    return distance <= sphereRadius;
  }

  /**
   * Get all active smoke clouds
   */
  getSmokeClouds(): SmokeCloud[] {
    return Array.from(this.smokeClouds.values());
  }

  /**
   * Clear all smoke (for map change, game end)
   */
  clear(): void {
    for (const id of Array.from(this.smokeClouds.keys())) {
      this.removeSmoke(id);
    }
  }
}
