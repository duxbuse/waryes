/**
 * SimSmokeManager - Pure simulation logic for smoke clouds.
 *
 * Tracks smoke positions, durations, LOS blocking.
 * No rendering, scene, or material dependencies.
 */

import * as THREE from 'three';

export type SmokeType = 'grenade' | 'launcher' | 'artillery';

export interface SimSmokeCloud {
  id: string;
  position: THREE.Vector3;
  radius: number;
  duration: number;
  elapsed: number;
  type: SmokeType;
  /** 0 = fully opaque, 1 = fully faded */
  fadeProgress: number;
}

/** Events emitted for the rendering layer */
export interface SmokeEvent {
  type: 'deployed' | 'expired';
  cloud: SimSmokeCloud;
}

const SMOKE_CONFIG: Record<SmokeType, { radius: number; duration: number }> = {
  grenade:   { radius: 5,  duration: 20 },
  launcher:  { radius: 15, duration: 20 },
  artillery: { radius: 50, duration: 60 },
};

export class SimSmokeManager {
  private readonly smokeClouds: Map<string, SimSmokeCloud> = new Map();
  private smokeIdCounter = 0;
  private readonly pendingEvents: SmokeEvent[] = [];

  /**
   * Deploy smoke at a position. Returns the smoke cloud ID.
   */
  deploySmoke(position: THREE.Vector3, type: SmokeType = 'grenade'): string {
    const id = `smoke_${this.smokeIdCounter++}`;
    const config = SMOKE_CONFIG[type];

    const cloud: SimSmokeCloud = {
      id,
      position: position.clone(),
      radius: config.radius,
      duration: config.duration,
      elapsed: 0,
      type,
      fadeProgress: 0,
    };

    this.smokeClouds.set(id, cloud);
    this.pendingEvents.push({ type: 'deployed', cloud });
    return id;
  }

  /**
   * Update smoke clouds - advance timers and remove expired.
   */
  update(dt: number): void {
    this.pendingEvents.length = 0;
    const expired: string[] = [];

    for (const [id, cloud] of this.smokeClouds) {
      cloud.elapsed += dt;
      cloud.fadeProgress = Math.min(1, cloud.elapsed / cloud.duration);

      if (cloud.elapsed >= cloud.duration) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      const cloud = this.smokeClouds.get(id);
      if (cloud) {
        this.pendingEvents.push({ type: 'expired', cloud });
        this.smokeClouds.delete(id);
      }
    }
  }

  /** Check if a position is inside any smoke cloud */
  isInSmoke(position: THREE.Vector3): boolean {
    for (const cloud of this.smokeClouds.values()) {
      if (position.distanceTo(cloud.position) <= cloud.radius) {
        return true;
      }
    }
    return false;
  }

  /** Check if line of sight is blocked by smoke */
  blocksLOS(start: THREE.Vector3, end: THREE.Vector3): boolean {
    for (const cloud of this.smokeClouds.values()) {
      if (this.lineIntersectsSphere(start, end, cloud.position, cloud.radius)) {
        return true;
      }
    }
    return false;
  }

  private lineIntersectsSphere(
    lineStart: THREE.Vector3,
    lineEnd: THREE.Vector3,
    sphereCenter: THREE.Vector3,
    sphereRadius: number,
  ): boolean {
    const startToCenter = sphereCenter.clone().sub(lineStart);
    const lineDirection = lineEnd.clone().sub(lineStart);
    const lineLength = lineDirection.length();
    lineDirection.normalize();

    const projection = startToCenter.dot(lineDirection);
    const clamped = Math.max(0, Math.min(lineLength, projection));
    const closestPoint = lineStart.clone().add(lineDirection.multiplyScalar(clamped));

    return closestPoint.distanceTo(sphereCenter) <= sphereRadius;
  }

  /** Get all active smoke clouds (read-only) */
  getSmokeClouds(): readonly SimSmokeCloud[] {
    return Array.from(this.smokeClouds.values());
  }

  /** Get pending events this frame (deployed/expired) */
  getPendingEvents(): readonly SmokeEvent[] {
    return this.pendingEvents;
  }

  /** Clear all smoke */
  clear(): void {
    for (const cloud of this.smokeClouds.values()) {
      this.pendingEvents.push({ type: 'expired', cloud });
    }
    this.smokeClouds.clear();
  }
}
