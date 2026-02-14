/**
 * BuildingManager - Client adapter wrapping SimBuildingManager
 *
 * Handles Three.js mesh creation, materials, occupancy indicators, billboard effects.
 * All garrison logic (occupant tracking, capacity, damage) lives in SimBuildingManager.
 */

import type { Game } from '../../core/Game';
import type { Building } from '../../data/types';
import type { Unit } from '../units/Unit';
import { getWeaponById } from '../../data/factions';
import * as THREE from 'three';
import { SimBuildingManager } from '@shared/simulation/SimBuildingManager';

interface GarrisonedBuildingVisuals {
  building: Building;
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material;
  garrisonedMaterial: THREE.MeshBasicMaterial;
  occupancyIndicator: THREE.Mesh | null;
  occupancyCanvas: HTMLCanvasElement | null;
  occupancyTexture: THREE.CanvasTexture | null;
}

export class BuildingManager {
  private readonly game: Game;
  public readonly sim: SimBuildingManager;
  private readonly buildingVisuals: Map<Building, GarrisonedBuildingVisuals> = new Map();

  constructor(game: Game) {
    this.game = game;
    this.sim = new SimBuildingManager();
  }

  /** Initialize building manager with map buildings */
  initialize(buildings: Building[]): void {
    this.sim.initialize(buildings);

    for (const building of buildings) {
      if (this.buildingVisuals.has(building)) continue;

      const mesh = this.findBuildingMesh(building);
      if (mesh) {
        const originalMaterial = (mesh.material as THREE.Material).clone();
        const garrisonedMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.6,
        });

        const visuals: GarrisonedBuildingVisuals = {
          building,
          mesh,
          originalMaterial,
          garrisonedMaterial,
          occupancyIndicator: null,
          occupancyCanvas: null,
          occupancyTexture: null,
        };

        this.createOccupancyIndicator(visuals);
        this.buildingVisuals.set(building, visuals);
      }
    }
  }

  private findBuildingMesh(building: Building): THREE.Mesh | null {
    let foundMesh: THREE.Mesh | null = null;

    this.game.scene.traverse((obj) => {
      if (obj.userData['building'] === building && obj instanceof THREE.Group) {
        for (const child of obj.children) {
          if (child instanceof THREE.Mesh) {
            foundMesh = child;
            break;
          }
        }
      }
    });

    return foundMesh;
  }

  private createOccupancyIndicator(visuals: GarrisonedBuildingVisuals): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    visuals.occupancyCanvas = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    visuals.occupancyTexture = texture;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    });

    const size = 2.0;
    const geometry = new THREE.PlaneGeometry(size * 2, size);
    const indicator = new THREE.Mesh(geometry, material);

    const building = visuals.building;
    indicator.position.set(building.x, building.height + 5.0, building.z);
    indicator.renderOrder = 1005;
    indicator.visible = false;

    visuals.occupancyIndicator = indicator;
    this.game.scene.add(indicator);
  }

  private updateOccupancyText(visuals: GarrisonedBuildingVisuals): void {
    if (!visuals.occupancyCanvas || !visuals.occupancyTexture) return;

    const context = visuals.occupancyCanvas.getContext('2d');
    if (!context) return;

    const occupants = this.sim.getOccupants(visuals.building);
    const currentCount = occupants.length;
    const maxCapacity = visuals.building.garrisonCapacity;

    context.clearRect(0, 0, visuals.occupancyCanvas.width, visuals.occupancyCanvas.height);

    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(10, 10, 236, 108);

    let borderColor = '#00aaff';
    let hasPlayer = false;
    let hasEnemy = false;
    for (const unit of occupants) {
      if (unit.team === 'player') hasPlayer = true;
      if (unit.team === 'enemy') hasEnemy = true;
    }

    if (hasPlayer && hasEnemy) {
      borderColor = '#ff8800';
    } else if (hasPlayer) {
      borderColor = '#0088ff';
    } else if (hasEnemy) {
      borderColor = '#ff0000';
    }

    context.strokeStyle = borderColor;
    context.lineWidth = 3;
    context.strokeRect(10, 10, 236, 108);

    context.fillStyle = '#ffffff';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${currentCount}/${maxCapacity}`, 128, 64);

    visuals.occupancyTexture.needsUpdate = true;
  }

  /** Attempt to garrison a unit in a building */
  tryGarrison(unit: Unit, building: Building): boolean {
    const success = this.sim.tryGarrison(unit.sim, building);
    if (!success) {
      if (!this.sim.hasCapacity(building)) {
        console.log(`Building at (${building.x}, ${building.z}) is full`);
      }
      return false;
    }

    // Hide unit mesh
    unit.mesh.visible = false;

    // Update visuals
    const visuals = this.buildingVisuals.get(building);
    if (visuals) this.updateBuildingVisuals(visuals);

    const occupants = this.sim.getOccupants(building);
    console.log(`${unit.name} garrisoned in building. Occupants: ${occupants.length}/${building.garrisonCapacity}`);
    return true;
  }

  /** Spawn a defensive structure */
  spawnDefensiveStructure(unit: Unit): Building | null {
    const isHeavy = unit.getWeapons().some(w => {
      const data = getWeaponById(w.weaponId);
      return (data as any)?.tags?.includes('heavy');
    });

    const building = this.sim.spawnDefensiveStructure(
      unit.position,
      unit.mesh.rotation.y,
      isHeavy,
    );

    // Create 3D representation
    const type = isHeavy ? 'fighting_position' : 'trench';
    this.createDefensiveStructureMesh(building, type);

    // Track in game map
    if (this.game.currentMap) {
      this.game.currentMap.buildings.push(building);
    }

    // Set up visuals tracking
    this.initialize([building]);

    return building;
  }

  private createDefensiveStructureMesh(building: Building, type: 'trench' | 'fighting_position'): void {
    const group = new THREE.Group();
    group.position.set(building.x, 0, building.z);
    group.rotation.y = building.rotation || 0;
    group.userData['building'] = building;

    const material = new THREE.MeshStandardMaterial({ color: 0x554433 });

    if (type === 'trench') {
      const box1 = new THREE.Mesh(new THREE.BoxGeometry(building.width, 0.2, 1), material);
      box1.position.z = -1.5;
      group.add(box1);
      const box2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, building.depth), material);
      box2.position.x = building.width / 2 - 0.5;
      group.add(box2);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(building.width, 0.2, building.depth), material);
      group.add(box);
    }

    this.game.scene.add(group);
  }

  /** Ungarrison a unit from a building */
  ungarrison(unit: Unit, building: Building): THREE.Vector3 | null {
    const exitPos = this.sim.ungarrison(unit.sim, building);
    if (!exitPos) return null;

    // Show unit mesh
    unit.mesh.visible = true;

    // Update visuals
    const visuals = this.buildingVisuals.get(building);
    if (visuals) this.updateBuildingVisuals(visuals);

    console.log(`${unit.name} exited building`);
    return exitPos;
  }

  private updateBuildingVisuals(visuals: GarrisonedBuildingVisuals): void {
    const occupants = this.sim.getOccupants(visuals.building);

    if (occupants.length === 0) {
      visuals.mesh.material = visuals.originalMaterial;
      if (visuals.occupancyIndicator) {
        visuals.occupancyIndicator.visible = false;
      }
      return;
    }

    let hasPlayer = false;
    let hasEnemy = false;

    for (const unit of occupants) {
      if (unit.team === 'player') hasPlayer = true;
      if (unit.team === 'enemy') hasEnemy = true;
    }

    let color: THREE.Color;
    if (hasPlayer && hasEnemy) {
      color = new THREE.Color(0xff8800);
    } else if (hasPlayer) {
      color = new THREE.Color(0x0088ff);
    } else {
      color = new THREE.Color(0xff0000);
    }

    visuals.garrisonedMaterial.color.copy(color);
    visuals.mesh.material = visuals.garrisonedMaterial;

    if (visuals.occupancyIndicator) {
      this.updateOccupancyText(visuals);
      visuals.occupancyIndicator.visible = true;
    }
  }

  /** Distribute damage to occupants of a building */
  distributeDamage(building: Building, damage: number, _attacker: Unit | null = null): void {
    this.sim.distributeDamage(building, damage);

    // Update visuals after casualties
    const visuals = this.buildingVisuals.get(building);
    if (visuals) this.updateBuildingVisuals(visuals);
  }

  /** Find nearest garrisonable building to a position */
  findNearestBuilding(position: THREE.Vector3, maxDistance: number = 50): Building | null {
    return this.sim.findNearestBuilding(position, maxDistance);
  }

  /** Check if a building has capacity */
  hasCapacity(building: Building): boolean {
    return this.sim.hasCapacity(building);
  }

  /** Get occupants of a building */
  getOccupants(building: Building): Unit[] {
    const simOccupants = this.sim.getOccupants(building);
    const result: Unit[] = [];
    for (const simUnit of simOccupants) {
      const unit = this.game.unitManager.findUnitBySim(simUnit);
      if (unit) result.push(unit);
    }
    return result;
  }

  /** Check if a unit is garrisoned */
  isUnitGarrisoned(unit: Unit): Building | null {
    return this.sim.isUnitGarrisoned(unit.sim);
  }

  /** Get building at world position */
  getBuildingAt(position: THREE.Vector3): Building | null {
    return this.sim.getBuildingAt(position);
  }

  /** Update - billboard occupancy indicators */
  update(): void {
    this.sim.clearPendingEvents();

    for (const [, visuals] of this.buildingVisuals) {
      if (visuals.occupancyIndicator && visuals.occupancyIndicator.visible) {
        visuals.occupancyIndicator.quaternion.copy(this.game.camera.quaternion);
      }
    }
  }

  /** Clear all garrisons */
  clear(): void {
    // Show all garrisoned units' meshes before clearing
    for (const [, visuals] of this.buildingVisuals) {
      const occupants = this.sim.getOccupants(visuals.building);
      for (const simUnit of occupants) {
        const unit = this.game.unitManager.findUnitBySim(simUnit);
        if (unit) unit.mesh.visible = true;
      }

      visuals.mesh.material = visuals.originalMaterial;

      if (visuals.occupancyIndicator) {
        this.game.scene.remove(visuals.occupancyIndicator);
        visuals.occupancyIndicator.geometry.dispose();
        (visuals.occupancyIndicator.material as THREE.Material).dispose();
        visuals.occupancyIndicator = null;
      }
      if (visuals.occupancyTexture) {
        visuals.occupancyTexture.dispose();
        visuals.occupancyTexture = null;
      }
      visuals.occupancyCanvas = null;
    }

    this.buildingVisuals.clear();
    this.sim.clear();
  }
}
