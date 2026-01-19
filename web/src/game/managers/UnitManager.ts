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
import { GamePhase } from '../../core/Game';
import { Unit, type UnitConfig } from '../units/Unit';
import { SpatialHashGrid } from '../utils/SpatialHashGrid';

export interface SpawnConfig {
  position: THREE.Vector3;
  team: 'player' | 'enemy';
  ownerId?: string; // 'player' for human, 'ally1', 'ally2', etc. for CPU allies
  unitType: string;
  name?: string;
}

export class UnitManager {
  private readonly game: Game;
  private readonly units: Map<string, Unit> = new Map();
  private nextUnitId = 1;

  // Track last attacker for kill attribution
  private lastAttackers: Map<string, Unit> = new Map();

  // Spatial partitioning for efficient proximity queries
  private spatialGrid: SpatialHashGrid<Unit>;

  // Cached unit arrays by team (rebuilt on add/remove)
  private unitsByTeam: {
    player: Unit[];
    enemy: Unit[];
    ally: Unit[];
    all: Unit[];
  } = { player: [], enemy: [], ally: [], all: [] };

  constructor(game: Game) {
    this.game = game;
    this.spatialGrid = new SpatialHashGrid<Unit>(50); // 50m cells
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
      ...(config.ownerId !== undefined && { ownerId: config.ownerId }),
      position: config.position.clone(),
      maxHealth: config.unitType === 'tank' ? 100 : 50,
      speed: config.unitType === 'tank' ? 8 : 5,
      rotationSpeed: config.unitType === 'tank' ? 2 : 5,
    };

    const unit = new Unit(unitConfig, this.game);
    this.units.set(id, unit);
    this.spatialGrid.insert(unit);
    this.rebuildTeamArrays();

    // Register with instanced renderer for GPU batching
    this.game.instancedUnitRenderer?.registerUnit(unit);
    this.game.batchedUIRenderer?.registerUnit(unit);

    // If game is already in battle phase, unfreeze immediately
    if (this.game.phase === GamePhase.Battle) {
      unit.setFrozen(false);
    }

    // Add to scene
    this.game.scene.add(unit.mesh);

    return unit;
  }

  /**
   * Register an attack for kill attribution
   */
  registerAttack(attacker: Unit, target: Unit): void {
    this.lastAttackers.set(target.id, attacker);
  }

  /**
   * Remove a unit from the game
   */
  destroyUnit(unit: Unit): void {
    // Attribute kill to last attacker
    const killer = this.lastAttackers.get(unit.id);
    if (killer && this.units.has(killer.id)) {
      killer.addKill();
    }
    this.lastAttackers.delete(unit.id);

    // Track game stats
    if (unit.team === 'player') {
      this.game.incrementUnitsLost();
    } else {
      this.game.incrementUnitsDestroyed();
    }

    // Remove from selection
    this.game.selectionManager.removeFromSelection(unit);

    // Unregister from instanced renderer
    this.game.instancedUnitRenderer?.unregisterUnit(unit);
    this.game.batchedUIRenderer?.unregisterUnit(unit);

    // Remove from scene
    this.game.scene.remove(unit.mesh);

    // Remove from tracking
    this.units.delete(unit.id);
    this.spatialGrid.remove(unit);
    this.rebuildTeamArrays();

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
   * Returns cached array for performance - do not modify!
   */
  getAllUnits(team?: 'player' | 'enemy' | 'ally'): readonly Unit[] {
    if (team) return this.unitsByTeam[team];
    return this.unitsByTeam.all;
  }

  /**
   * Get units within a radius (uses spatial hash for O(1) lookup)
   */
  getUnitsInRadius(center: THREE.Vector3, radius: number, team?: 'player' | 'enemy' | 'ally'): Unit[] {
    const units = this.spatialGrid.queryRadius(center, radius);
    if (team) {
      return units.filter(u => u.team === team);
    }
    return units;
  }

  /**
   * Rebuild cached team arrays (called after add/remove)
   */
  private rebuildTeamArrays(): void {
    this.unitsByTeam.all = Array.from(this.units.values());
    this.unitsByTeam.player = this.unitsByTeam.all.filter(u => u.team === 'player');
    this.unitsByTeam.enemy = this.unitsByTeam.all.filter(u => u.team === 'enemy');
    this.unitsByTeam.ally = this.unitsByTeam.all.filter(u => u.isAllied());
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
  issueMoveCommand(units: readonly Unit[], target: THREE.Vector3, queue: boolean): void {
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
  issueAttackCommand(units: readonly Unit[], target: Unit, queue: boolean): void {
    for (const unit of units) {
      if (queue) {
        unit.queueAttackCommand(target);
      } else {
        unit.setAttackCommand(target);
      }
    }
  }

  /**
   * Issue fast move command to units (F + Right Click)
   */
  issueFastMoveCommand(units: readonly Unit[], target: THREE.Vector3, queue: boolean): void {
    if (units.length === 0) return;

    const spacing = 4;
    const unitsPerRow = Math.ceil(Math.sqrt(units.length));

    units.forEach((unit, index) => {
      const row = Math.floor(index / unitsPerRow);
      const col = index % unitsPerRow;
      const offsetX = (col - (unitsPerRow - 1) / 2) * spacing;
      const offsetZ = row * spacing;
      const unitTarget = target.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));

      if (queue) {
        unit.queueFastMoveCommand(unitTarget);
      } else {
        unit.setFastMoveCommand(unitTarget);
      }
    });
  }

  /**
   * Issue reverse command to units (R + Right Click)
   */
  issueReverseCommand(units: readonly Unit[], target: THREE.Vector3, queue: boolean): void {
    if (units.length === 0) return;

    const spacing = 4;
    const unitsPerRow = Math.ceil(Math.sqrt(units.length));

    units.forEach((unit, index) => {
      const row = Math.floor(index / unitsPerRow);
      const col = index % unitsPerRow;
      const offsetX = (col - (unitsPerRow - 1) / 2) * spacing;
      const offsetZ = row * spacing;
      const unitTarget = target.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));

      if (queue) {
        unit.queueReverseCommand(unitTarget);
      } else {
        unit.setReverseCommand(unitTarget);
      }
    });
  }

  /**
   * Issue attack-move command to units (A + Right Click)
   */
  issueAttackMoveCommand(units: readonly Unit[], target: THREE.Vector3, queue: boolean): void {
    if (units.length === 0) return;

    const spacing = 4;
    const unitsPerRow = Math.ceil(Math.sqrt(units.length));

    units.forEach((unit, index) => {
      const row = Math.floor(index / unitsPerRow);
      const col = index % unitsPerRow;
      const offsetX = (col - (unitsPerRow - 1) / 2) * spacing;
      const offsetZ = row * spacing;
      const unitTarget = target.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));

      if (queue) {
        unit.queueAttackMoveCommand(unitTarget);
      } else {
        unit.setAttackMoveCommand(unitTarget);
      }
    });
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
   * Destroy all units
   */
  destroyAllUnits(): void {
    for (const unit of this.units.values()) {
      this.game.scene.remove(unit.mesh);
      unit.dispose();
    }
    this.units.clear();
    this.game.selectionManager.clearSelection();
  }

  /**
   * Fixed timestep update for game logic
   */
  fixedUpdate(dt: number): void {
    for (const unit of this.units.values()) {
      // Update spatial grid position for this unit
      this.spatialGrid.update(unit);
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

  /**
   * Get unit kill stats for victory screen
   */
  getKillStats(team: 'player' | 'enemy'): {
    heroOfMatch: { name: string; kills: number } | null;
    mostCostEffective: { name: string; ratio: number } | null;
    topKillers: { name: string; kills: number }[];
  } {
    const teamUnits = this.getAllUnits(team);

    // Find hero of match (highest kills)
    let heroOfMatch: { name: string; kills: number } | null = null;
    let maxKills = 0;
    for (const unit of teamUnits) {
      if (unit.kills > maxKills) {
        maxKills = unit.kills;
        heroOfMatch = { name: unit.name, kills: unit.kills };
      }
    }

    // Find most cost effective (best kills/cost ratio)
    let mostCostEffective: { name: string; ratio: number } | null = null;
    let bestRatio = 0;
    for (const unit of teamUnits) {
      if (unit.kills > 0 && unit.cost > 0) {
        const ratio = (unit.kills / unit.cost) * 100; // kills per 100 credits
        if (ratio > bestRatio) {
          bestRatio = ratio;
          mostCostEffective = { name: unit.name, ratio };
        }
      }
    }

    // Get top 5 killers
    const sortedByKills = teamUnits
      .filter(u => u.kills > 0)
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 5)
      .map(u => ({ name: u.name, kills: u.kills }));

    return {
      heroOfMatch,
      mostCostEffective,
      topKillers: sortedByKills,
    };
  }
}
