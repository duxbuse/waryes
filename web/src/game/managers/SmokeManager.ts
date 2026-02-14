/**
 * SmokeManager - Client adapter wrapping SimSmokeManager
 *
 * Handles Three.js mesh creation, scene management, and material updates.
 * All smoke logic (positions, LOS, timing) lives in SimSmokeManager.
 */

import type { Game } from '../../core/Game';
import * as THREE from 'three';
import { SimSmokeManager } from '@shared/simulation/SimSmokeManager';
import type { SimSmokeCloud, SmokeType } from '@shared/simulation/SimSmokeManager';

// Re-export for backward compatibility
export type { SmokeType } from '@shared/simulation/SimSmokeManager';

export interface SmokeCloud extends SimSmokeCloud {
  mesh: THREE.Mesh;
}

export class SmokeManager {
  private readonly game: Game;
  public readonly sim: SimSmokeManager;
  private readonly meshes: Map<string, THREE.Mesh> = new Map();

  constructor(game: Game) {
    this.game = game;
    this.sim = new SimSmokeManager();
  }

  deploySmoke(
    position: THREE.Vector3,
    type: SmokeType = 'grenade',
  ): string {
    const id = this.sim.deploySmoke(position, type);

    // Create visual mesh for the deployed smoke
    for (const evt of this.sim.getPendingEvents()) {
      if (evt.type === 'deployed' && evt.cloud.id === id) {
        this.createSmokeMesh(evt.cloud);
      }
    }

    return id;
  }

  private createSmokeMesh(cloud: SimSmokeCloud): void {
    const geometry = new THREE.SphereGeometry(cloud.radius, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(cloud.position);
    mesh.position.y = cloud.radius / 2;
    this.game.scene.add(mesh);
    this.meshes.set(cloud.id, mesh);
  }

  update(dt: number): void {
    this.sim.update(dt);

    // Update mesh opacities from sim state
    for (const cloud of this.sim.getSmokeClouds()) {
      const mesh = this.meshes.get(cloud.id);
      if (mesh) {
        const opacity = Math.max(0, 1 - cloud.fadeProgress) * 0.6;
        (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      }
    }

    // Remove expired smoke meshes
    for (const evt of this.sim.getPendingEvents()) {
      if (evt.type === 'expired') {
        this.removeSmokeMesh(evt.cloud.id);
      }
    }
  }

  private removeSmokeMesh(id: string): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    this.game.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.meshes.delete(id);
  }

  isInSmoke(position: THREE.Vector3): boolean {
    return this.sim.isInSmoke(position);
  }

  blocksLOS(start: THREE.Vector3, end: THREE.Vector3): boolean {
    return this.sim.blocksLOS(start, end);
  }

  getSmokeClouds(): SmokeCloud[] {
    const result: SmokeCloud[] = [];
    for (const cloud of this.sim.getSmokeClouds()) {
      const mesh = this.meshes.get(cloud.id);
      if (mesh) {
        result.push({ ...cloud, mesh });
      }
    }
    return result;
  }

  clear(): void {
    // Remove all meshes first
    for (const id of this.meshes.keys()) {
      this.removeSmokeMesh(id);
    }
    this.sim.clear();
  }
}
