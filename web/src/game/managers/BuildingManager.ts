/**
 * BuildingManager - Manages building garrison system
 *
 * Features:
 * - Track garrisoned units per building
 * - Handle garrison/ungarrison commands
 * - Visual updates for garrisoned buildings
 * - Damage distribution to occupants
 */

import type { Game } from '../../core/Game';
import type { Building } from '../../data/types';
import type { Unit } from '../units/Unit';
import { getWeaponById } from '../../data/factions';
import * as THREE from 'three';

interface GarrisonedBuilding {
  building: Building;
  mesh: THREE.Mesh;
  occupants: Unit[];
  originalMaterial: THREE.Material;
  garrisonedMaterial: THREE.MeshBasicMaterial;
}

export class BuildingManager {
  private readonly game: Game;
  private readonly garrisonedBuildings: Map<Building, GarrisonedBuilding> = new Map();
  // Spatial lookup for buildings (key: "x,z" grid coord)
  private readonly buildingGrid: Map<string, Building> = new Map();
  private readonly cellSize = 2; // Match grid resolution (2m is fine for building bounds)

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initialize building manager with map buildings
   */
  initialize(buildings: Building[]): void {
    // Clear existing
    this.garrisonedBuildings.clear();

    // Find building meshes in scene and track them
    for (const building of buildings) {
      // Find corresponding mesh (building meshes should have userData.building)
      const mesh = this.findBuildingMesh(building);
      if (mesh) {
        const originalMaterial = (mesh.material as THREE.Material).clone();
        const garrisonedMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.6,
        });

        this.garrisonedBuildings.set(building, {
          building,
          mesh,
          occupants: [],
          originalMaterial,
          garrisonedMaterial,
        });
      }


      // Populate spatial grid
      this.addBuildingToGrid(building);
    }
  }

  private addBuildingToGrid(building: Building): void {
    const halfWidth = building.width / 2;
    const halfDepth = building.depth / 2;

    // Calculate grid bounds
    const startX = Math.floor((building.x - halfWidth) / this.cellSize);
    const endX = Math.floor((building.x + halfWidth) / this.cellSize);
    const startZ = Math.floor((building.z - halfDepth) / this.cellSize);
    const endZ = Math.floor((building.z + halfDepth) / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let z = startZ; z <= endZ; z++) {
        const key = `${x},${z}`;
        // Store reference. If overlapping, last one wins (acceptable for now)
        this.buildingGrid.set(key, building);
      }
    }
  }

  /**
   * Get building at world position
   */
  getBuildingAt(position: THREE.Vector3): Building | null {
    const cellX = Math.floor(position.x / this.cellSize);
    const cellZ = Math.floor(position.z / this.cellSize);
    return this.buildingGrid.get(`${cellX},${cellZ}`) ?? null;
  }

  /**
   * Find the Three.js mesh for a building
   */
  private findBuildingMesh(building: Building): THREE.Mesh | null {
    // Building groups are tagged with userData, need to find the body mesh child
    let foundMesh: THREE.Mesh | null = null;

    this.game.scene.traverse((obj) => {
      if (obj.userData['building'] === building && obj instanceof THREE.Group) {
        // Find the body mesh (first child mesh)
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

  /**
   * Attempt to garrison a unit in a building
   */
  tryGarrison(unit: Unit, building: Building): boolean {
    const garrisonData = this.garrisonedBuildings.get(building);
    if (!garrisonData) return false;

    // Check capacity
    if (garrisonData.occupants.length >= building.garrisonCapacity) {
      console.log(`Building at (${building.x}, ${building.z}) is full`);
      return false;
    }

    // Check if already garrisoned
    if (garrisonData.occupants.includes(unit)) {
      return false;
    }

    // Add unit to building
    garrisonData.occupants.push(unit);

    // Set garrison state on unit
    unit.setGarrisonedIn(building);

    // Hide unit mesh
    unit.mesh.visible = false;

    // Update visuals
    this.updateBuildingVisuals(garrisonData);

    // Apply building bonuses to unit (optional, but good for tracking)
    // CombatManager will use these directly from the building anyway

    console.log(`${unit.name} garrisoned in building. Occupants: ${garrisonData.occupants.length}/${building.garrisonCapacity}`);
    return true;
  }

  /**
   * Spawn a defensive structure (Trench or Fighting Position)
   */
  spawnDefensiveStructure(unit: Unit): Building | null {
    const isHeavy = unit.getWeapons().some(w => {
      const data = getWeaponById(w.weaponId);
      return (data as any)?.tags?.includes('heavy');
    });

    const type = isHeavy ? 'fighting_position' : 'trench';
    const building: Building = {
      x: unit.position.x,
      z: unit.position.z,
      width: isHeavy ? 6 : 8,
      depth: isHeavy ? 6 : 4,
      height: 0.2, // Low profile
      type: 'factory', // Fallback type
      subtype: isHeavy ? 'warehouse' : 'workshop', // Fallback subtypes
      garrisonCapacity: isHeavy ? 1 : 2,
      defenseBonus: isHeavy ? 0.75 : 0.5,
      stealthBonus: isHeavy ? 0.8 : 0.5,
      rotation: unit.mesh.rotation.y,
    };

    // Create 3D representation
    this.createDefensiveStructureMesh(building, type);

    // Track it
    if (this.game.currentMap) {
      this.game.currentMap.buildings.push(building);
    }
    this.initialize([building]); // Add to garrisonedBuildings map

    return building;
  }

  private createDefensiveStructureMesh(building: Building, type: 'trench' | 'fighting_position'): void {
    const group = new THREE.Group();
    group.position.set(building.x, 0, building.z);
    group.rotation.y = building.rotation || 0;
    group.userData['building'] = building;

    const material = new THREE.MeshStandardMaterial({ color: 0x554433 }); // Dirt color

    if (type === 'trench') {
      // Small "L" or "W" shape (simplified for now as two boxes)
      const box1 = new THREE.Mesh(new THREE.BoxGeometry(building.width, 0.2, 1), material);
      box1.position.z = -1.5;
      group.add(box1);
      const box2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, building.depth), material);
      box2.position.x = building.width / 2 - 0.5;
      group.add(box2);
    } else {
      // Fighting position: Box
      const box = new THREE.Mesh(new THREE.BoxGeometry(building.width, 0.2, building.depth), material);
      group.add(box);
    }

    this.game.scene.add(group);
  }

  /**
   * Ungarrison a unit from a building
   */
  ungarrison(unit: Unit, building: Building): THREE.Vector3 | null {
    const garrisonData = this.garrisonedBuildings.get(building);
    if (!garrisonData) return null;

    const index = garrisonData.occupants.indexOf(unit);
    if (index === -1) return null;

    // Remove from building
    garrisonData.occupants.splice(index, 1);

    // Clear garrison state on unit
    unit.setGarrisonedIn(null);

    // Show unit mesh
    unit.mesh.visible = true;

    // Update visuals
    this.updateBuildingVisuals(garrisonData);

    // Calculate exit position
    const exitPos = this.getExitPosition(building, unit.position);

    console.log(`${unit.name} exited building`);
    return exitPos;
  }

  /**
   * Get exit position for a unit leaving a building
   */
  private getExitPosition(building: Building, _currentPos: THREE.Vector3): THREE.Vector3 {
    // Simple approach: exit 10m from building center
    const buildingPos = new THREE.Vector3(building.x, 0, building.z);

    // Random direction
    const angle = Math.random() * Math.PI * 2;
    const offset = new THREE.Vector3(
      Math.cos(angle) * 10,
      0,
      Math.sin(angle) * 10
    );

    return buildingPos.add(offset);
  }

  /**
   * Update building visual based on occupants
   */
  private updateBuildingVisuals(garrisonData: GarrisonedBuilding): void {
    if (garrisonData.occupants.length === 0) {
      // Reset to original
      garrisonData.mesh.material = garrisonData.originalMaterial;
      return;
    }

    // Determine team colors
    let hasPlayer = false;
    let hasEnemy = false;

    for (const unit of garrisonData.occupants) {
      if (unit.team === 'player') hasPlayer = true;
      if (unit.team === 'enemy') hasEnemy = true;
    }

    // Set color based on occupants
    let color: THREE.Color;
    if (hasPlayer && hasEnemy) {
      // Contested - orange
      color = new THREE.Color(0xff8800);
    } else if (hasPlayer) {
      // Player - blue
      color = new THREE.Color(0x0088ff);
    } else {
      // Enemy - red
      color = new THREE.Color(0xff0000);
    }

    garrisonData.garrisonedMaterial.color.copy(color);
    garrisonData.mesh.material = garrisonData.garrisonedMaterial;
  }

  /**
   * Distribute damage to occupants of a building
   */
  distributeDamage(building: Building, damage: number, _attacker: Unit | null = null): void {
    const garrisonData = this.garrisonedBuildings.get(building);
    if (!garrisonData || garrisonData.occupants.length === 0) return;

    // Split damage among occupants
    const splitDamage = damage / garrisonData.occupants.length;
    const defenseBonus = building.defenseBonus ?? 0.5;

    // Iterate backwards in case units die
    for (let i = garrisonData.occupants.length - 1; i >= 0; i--) {
      const unit = garrisonData.occupants[i];
      if (unit) {
        // Apply reduced damage (using building's specific bonus)
        unit.takeDamage(splitDamage * (1 - defenseBonus));

        // If unit died, remove from occupants
        if (unit.health <= 0) {
          garrisonData.occupants.splice(i, 1);
        }
      }
    }

    // Update visuals after casualties
    this.updateBuildingVisuals(garrisonData);
  }

  /**
   * Find nearest garrisonable building to a position
   */
  findNearestBuilding(position: THREE.Vector3, maxDistance: number = 50): Building | null {
    let nearest: Building | null = null;
    let nearestDist = maxDistance;

    for (const [building, data] of this.garrisonedBuildings) {
      const dx = building.x - position.x;
      const dz = building.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < nearestDist && data.occupants.length < building.garrisonCapacity) {
        nearest = building;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  /**
   * Check if a building has capacity for more units
   */
  hasCapacity(building: Building): boolean {
    const garrisonData = this.garrisonedBuildings.get(building);
    if (!garrisonData) return false;
    return garrisonData.occupants.length < building.garrisonCapacity;
  }

  /**
   * Get garrisoned unit for a building
   */
  getOccupants(building: Building): Unit[] {
    const garrisonData = this.garrisonedBuildings.get(building);
    return garrisonData ? [...garrisonData.occupants] : [];
  }

  /**
   * Check if a unit is garrisoned
   */
  isUnitGarrisoned(unit: Unit): Building | null {
    for (const [building, data] of this.garrisonedBuildings) {
      if (data.occupants.includes(unit)) {
        return building;
      }
    }
    return null;
  }

  /**
   * Clear all garrisons (for map change, game end, etc.)
   */
  clear(): void {
    // Ungarrison all units
    for (const [_building, data] of this.garrisonedBuildings) {
      for (const unit of data.occupants) {
        unit.mesh.visible = true;
      }
      data.occupants = [];
      data.mesh.material = data.originalMaterial;
    }

    this.garrisonedBuildings.clear();
  }
}
