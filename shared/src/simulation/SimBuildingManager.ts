/**
 * SimBuildingManager - Pure simulation logic for building garrisons.
 *
 * Tracks garrisoned units, capacity, damage distribution, spatial lookups.
 * No rendering, mesh, material, or DOM dependencies.
 */

import * as THREE from 'three';
import type { Building } from '../data/types';
import type { SimUnit } from './SimUnit';

/** Events emitted for the rendering layer */
export interface BuildingEvent {
  type: 'garrisoned' | 'ungarrisoned' | 'structure_spawned';
  building: Building;
  unit?: SimUnit;
  exitPosition?: THREE.Vector3;
}

export class SimBuildingManager {
  private readonly garrisonOccupants: Map<Building, SimUnit[]> = new Map();
  private readonly buildingGrid: Map<string, Building> = new Map();
  private readonly cellSize = 2;
  private readonly pendingEvents: BuildingEvent[] = [];
  private buildings: Building[] = [];

  /** Provide RNG function for deterministic exit positions */
  private rng: () => number = Math.random;

  setRNG(rng: () => number): void {
    this.rng = rng;
  }

  /** Initialize with map buildings */
  initialize(buildings: Building[]): void {
    for (const building of buildings) {
      if (!this.garrisonOccupants.has(building)) {
        this.garrisonOccupants.set(building, []);
      }
      this.addBuildingToGrid(building);
      this.buildings.push(building);
    }
  }

  private addBuildingToGrid(building: Building): void {
    const halfWidth = building.width / 2;
    const halfDepth = building.depth / 2;

    const startX = Math.floor((building.x - halfWidth) / this.cellSize);
    const endX = Math.floor((building.x + halfWidth) / this.cellSize);
    const startZ = Math.floor((building.z - halfDepth) / this.cellSize);
    const endZ = Math.floor((building.z + halfDepth) / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let z = startZ; z <= endZ; z++) {
        this.buildingGrid.set(`${x},${z}`, building);
      }
    }
  }

  /** Get building at world position */
  getBuildingAt(position: THREE.Vector3): Building | null {
    const cellX = Math.floor(position.x / this.cellSize);
    const cellZ = Math.floor(position.z / this.cellSize);
    return this.buildingGrid.get(`${cellX},${cellZ}`) ?? null;
  }

  /** Attempt to garrison a unit in a building */
  tryGarrison(unit: SimUnit, building: Building): boolean {
    const occupants = this.garrisonOccupants.get(building);
    if (!occupants) return false;

    if (occupants.length >= building.garrisonCapacity) return false;
    if (occupants.includes(unit)) return false;

    occupants.push(unit);
    unit.setGarrisonedIn(building);

    this.pendingEvents.push({ type: 'garrisoned', building, unit });
    return true;
  }

  /** Ungarrison a unit from a building. Returns exit position. */
  ungarrison(unit: SimUnit, building: Building): THREE.Vector3 | null {
    const occupants = this.garrisonOccupants.get(building);
    if (!occupants) return null;

    const index = occupants.indexOf(unit);
    if (index === -1) return null;

    occupants.splice(index, 1);
    unit.setGarrisonedIn(null);

    const exitPos = this.getExitPosition(building);

    this.pendingEvents.push({ type: 'ungarrisoned', building, unit, exitPosition: exitPos });
    return exitPos;
  }

  /** Distribute damage to occupants of a building */
  distributeDamage(building: Building, damage: number): void {
    const occupants = this.garrisonOccupants.get(building);
    if (!occupants || occupants.length === 0) return;

    const splitDamage = damage / occupants.length;
    const defenseBonus = building.defenseBonus ?? 0.5;

    for (let i = occupants.length - 1; i >= 0; i--) {
      const unit = occupants[i];
      if (unit) {
        unit.takeDamage(splitDamage * (1 - defenseBonus));

        if (unit.health <= 0) {
          occupants.splice(i, 1);
        }
      }
    }
  }

  /** Create a defensive structure building data object */
  spawnDefensiveStructure(
    position: THREE.Vector3,
    rotationY: number,
    isHeavy: boolean,
  ): Building {
    const building: Building = {
      x: position.x,
      z: position.z,
      width: isHeavy ? 6 : 8,
      depth: isHeavy ? 6 : 4,
      height: 0.2,
      type: 'factory',
      subtype: isHeavy ? 'warehouse' : 'workshop',
      garrisonCapacity: isHeavy ? 1 : 2,
      defenseBonus: isHeavy ? 0.75 : 0.5,
      stealthBonus: isHeavy ? 0.8 : 0.5,
      rotation: rotationY,
    };

    this.initialize([building]);
    this.pendingEvents.push({ type: 'structure_spawned', building });
    return building;
  }

  /** Find nearest garrisonable building to a position */
  findNearestBuilding(position: THREE.Vector3, maxDistance: number = 50): Building | null {
    let nearest: Building | null = null;
    let nearestDist = maxDistance;

    for (const [building, occupants] of this.garrisonOccupants) {
      const dx = building.x - position.x;
      const dz = building.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < nearestDist && occupants.length < building.garrisonCapacity) {
        nearest = building;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  /** Check if a building has capacity for more units */
  hasCapacity(building: Building): boolean {
    const occupants = this.garrisonOccupants.get(building);
    if (!occupants) return false;
    return occupants.length < building.garrisonCapacity;
  }

  /** Get occupants of a building */
  getOccupants(building: Building): SimUnit[] {
    return this.garrisonOccupants.get(building) ?? [];
  }

  /** Check if a unit is garrisoned */
  isUnitGarrisoned(unit: SimUnit): Building | null {
    for (const [building, occupants] of this.garrisonOccupants) {
      if (occupants.includes(unit)) return building;
    }
    return null;
  }

  /** Get all tracked buildings */
  getBuildings(): readonly Building[] {
    return this.buildings;
  }

  /** Get pending events this frame */
  getPendingEvents(): readonly BuildingEvent[] {
    return this.pendingEvents;
  }

  /** Clear pending events (call at start of frame) */
  clearPendingEvents(): void {
    this.pendingEvents.length = 0;
  }

  /** Calculate exit position for ungarrisoning */
  private getExitPosition(building: Building): THREE.Vector3 {
    const angle = this.rng() * Math.PI * 2;
    return new THREE.Vector3(
      building.x + Math.cos(angle) * 10,
      0,
      building.z + Math.sin(angle) * 10,
    );
  }

  /** Clear all garrisons */
  clear(): void {
    for (const [, occupants] of this.garrisonOccupants) {
      for (const unit of occupants) {
        unit.setGarrisonedIn(null);
      }
    }
    this.garrisonOccupants.clear();
    this.buildingGrid.clear();
    this.buildings = [];
  }
}
