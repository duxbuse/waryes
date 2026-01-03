/**
 * UnitManager - Manages all units in the game
 *
 * Responsibilities:
 * - Spawn and destroy units
 * - Track all active units
 * - Issue commands to units
 * - Unit queries (by team, type, position)
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { Unit, type UnitConfig } from '../units/Unit';

export interface SpawnConfig {
  position: THREE.Vector3;
  team: 'player' | 'enemy';
  unitType: string;
  name?: string;
}

export class UnitManager {
  private readonly game: Game;
  private readonly units: Map<string, Unit> = new Map();
  private nextUnitId = 1;

  constructor(game: Game) {
    this.game = game;
  }

  initialize(): void {
    // Nothing to initialize currently
  }

  /**
   * Spawn a new unit
   */
  spawnUnit(config: SpawnConfig): Unit {
    const id = `unit_${this.nextUnitId++}`;

    const unitConfig: UnitConfig = {
      id,
      name: config.name || `${config.unitType}_${id}`,
      unitType: config.unitType,
      team: config.team,
      position: config.position.clone(),
      maxHealth: config.unitType === 'tank' ? 100 : 50,
      speed: config.unitType === 'tank' ? 8 : 5,
      rotationSpeed: config.unitType === 'tank' ? 2 : 5,
    };

    const unit = new Unit(unitConfig, this.game);
    this.units.set(id, unit);

    // Add to scene
    this.game.scene.add(unit.mesh);

    return unit;
  }

  /**
   * Remove a unit from the game
   */
  destroyUnit(unit: Unit): void {
    // Remove from selection
    this.game.selectionManager.removeFromSelection(unit);

    // Remove from scene
    this.game.scene.remove(unit.mesh);

    // Remove from tracking
    this.units.delete(unit.id);

    // Cleanup
    unit.dispose();
  }

  /**
   * Get a unit by ID
   */
  getUnitById(id: string): Unit | null {
    return this.units.get(id) || null;
  }

  /**
   * Get all units (optionally filtered by team)
   */
  getAllUnits(team?: 'player' | 'enemy'): Unit[] {
    const units = Array.from(this.units.values());
    if (team) {
      return units.filter(u => u.team === team);
    }
    return units;
  }

  /**
   * Get units by type and optionally team
   */
  getUnitsByType(unitType: string, team?: 'player' | 'enemy'): Unit[] {
    return this.getAllUnits(team).filter(u => u.unitType === unitType);
  }

  /**
   * Get all unit meshes for raycasting
   */
  getAllUnitMeshes(): THREE.Object3D[] {
    return Array.from(this.units.values()).map(u => u.mesh);
  }

  /**
   * Get units within a screen rectangle
   */
  getUnitsInScreenRect(
    left: number,
    top: number,
    right: number,
    bottom: number,
    camera: THREE.Camera
  ): Unit[] {
    const result: Unit[] = [];

    for (const unit of this.units.values()) {
      // Project unit position to screen
      const screenPos = unit.position.clone().project(camera);
      const screenX = (screenPos.x + 1) / 2 * window.innerWidth;
      const screenY = (-screenPos.y + 1) / 2 * window.innerHeight;

      // Check if in rect
      if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom) {
        result.push(unit);
      }
    }

    return result;
  }

  /**
   * Issue move command to units
   */
  issueMoveCommand(units: Unit[], target: THREE.Vector3, queue: boolean): void {
    if (units.length === 0) return;

    // Formation offset calculation
    const spacing = 4;
    const unitsPerRow = Math.ceil(Math.sqrt(units.length));

    units.forEach((unit, index) => {
      const row = Math.floor(index / unitsPerRow);
      const col = index % unitsPerRow;

      // Center the formation
      const offsetX = (col - (unitsPerRow - 1) / 2) * spacing;
      const offsetZ = row * spacing;

      const unitTarget = target.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));

      if (queue) {
        unit.queueMoveCommand(unitTarget);
      } else {
        unit.setMoveCommand(unitTarget);
      }
    });
  }

  /**
   * Issue attack command to units
   */
  issueAttackCommand(units: Unit[], target: Unit, queue: boolean): void {
    for (const unit of units) {
      if (queue) {
        unit.queueAttackCommand(target);
      } else {
        unit.setAttackCommand(target);
      }
    }
  }

  /**
   * Sell selected units (refund credits)
   */
  sellSelected(): void {
    const selected = this.game.selectionManager.getSelectedUnits();
    for (const unit of selected) {
      if (unit.team === 'player') {
        // TODO: Refund credits based on unit cost
        this.destroyUnit(unit);
      }
    }
  }

  /**
   * Unfreeze all units (start of battle)
   */
  unfreezeAll(): void {
    for (const unit of this.units.values()) {
      unit.setFrozen(false);
    }
  }

  /**
   * Fixed timestep update for game logic
   */
  fixedUpdate(dt: number): void {
    for (const unit of this.units.values()) {
      unit.fixedUpdate(dt);
    }
  }

  /**
   * Variable update for visuals
   */
  update(dt: number): void {
    for (const unit of this.units.values()) {
      unit.update(dt);
    }
  }
}
