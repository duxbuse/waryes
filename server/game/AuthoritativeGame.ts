/**
 * AuthoritativeGame - Headless server-side game simulation.
 *
 * Implements SimGameContext and runs the full game loop at 60Hz.
 * No rendering, DOM, or audio dependencies.
 *
 * Responsibilities:
 * - Manages all SimUnit instances and Sim* managers
 * - Validates and executes player commands each tick
 * - Computes state checksums for desync detection
 * - Broadcasts tick updates to connected clients
 * - Handles phase transitions (deployment → battle → victory)
 */

import * as THREE from 'three';
import type { SimGameContext } from '@shared/core/SimGameContext';
import { GamePhase } from '@shared/core/GamePhase';
import { SimUnit } from '@shared/simulation/SimUnit';
import type { SimUnitConfig } from '@shared/simulation/SimUnit';
import { SimEconomyManager } from '@shared/simulation/SimEconomyManager';
import { SimSmokeManager } from '@shared/simulation/SimSmokeManager';
import { SimTransportManager } from '@shared/simulation/SimTransportManager';
import { SimBuildingManager } from '@shared/simulation/SimBuildingManager';
import { DeterministicRNG } from '@shared/utils/DeterministicRNG';
import { computeGameStateChecksum } from '@shared/multiplayer/StateChecksum';
import type { GameCommand } from '@shared/multiplayer/CommandProtocol';
import { CommandType } from '@shared/multiplayer/CommandProtocol';
import type { GameMap, TerrainCell, Building, WeaponData, UnitData } from '@shared/data/types';
import { getUnitById, getWeaponById } from './ServerDataLoader';

/** Callback to broadcast tick updates to all clients in the session */
export type BroadcastFn = (message: object) => void;

/** Configuration for creating an authoritative game */
export interface AuthoritativeGameConfig {
  mapSeed: number;
  mapSize: 'small' | 'medium' | 'large';
  broadcast: BroadcastFn;
}

export class AuthoritativeGame implements SimGameContext {
  // SimGameContext fields
  currentMap: GameMap | null = null;
  phase: GamePhase = GamePhase.Loading;

  // RNG
  private readonly _rng: DeterministicRNG;
  get rng() { return this._rng; }

  // Managers
  private readonly economyManager: SimEconomyManager;
  private readonly smokeManager: SimSmokeManager;
  private readonly transportManager: SimTransportManager;
  private readonly buildingManager: SimBuildingManager;

  // Units
  private readonly units: Map<string, SimUnit> = new Map();
  private readonly unitsByTeam: {
    player: SimUnit[];
    enemy: SimUnit[];
  } = { player: [], enemy: [] };
  private nextUnitId = 0;

  // Tick state
  private tick = 0;
  private readonly TICK_RATE = 60; // Hz
  private readonly TICK_DT = 1 / 60;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private commandBuffer: GameCommand[] = []; // Commands received for current/next tick

  // Broadcasting
  private readonly broadcast: BroadcastFn;

  // Deployment
  private readonly DEPLOYMENT_DURATION = 60; // seconds
  private deploymentTimer = 0;

  constructor(config: AuthoritativeGameConfig) {
    this._rng = new DeterministicRNG(config.mapSeed);
    this.broadcast = config.broadcast;

    // Initialize managers
    this.economyManager = new SimEconomyManager();
    this.smokeManager = new SimSmokeManager();
    this.transportManager = new SimTransportManager();
    this.transportManager.setRNG(() => this._rng.next());
    this.buildingManager = new SimBuildingManager();
    this.buildingManager.setRNG(() => this._rng.next());
  }

  /** Initialize the game with a generated map */
  initialize(map: GameMap): void {
    this.currentMap = map;

    // Initialize economy with capture zones
    this.economyManager.initialize(
      map.captureZones,
      (zone, team) => this.getUnitsInZone(zone, team),
    );

    // Initialize buildings
    if (map.buildings.length > 0) {
      this.buildingManager.initialize(map.buildings);
    }

    this.phase = GamePhase.Setup;
    this.deploymentTimer = this.DEPLOYMENT_DURATION;

    this.broadcast({
      type: 'phase_change',
      phase: 'deployment',
      deploymentDuration: this.DEPLOYMENT_DURATION,
    });

    console.log(`[AuthGame] Initialized with map seed ${map.seed}, ${map.captureZones.length} zones, ${map.buildings.length} buildings`);
  }

  /** Start the 60Hz tick loop */
  start(): void {
    if (this.tickInterval) return;

    this.tickInterval = setInterval(() => {
      this.processTick();
    }, 1000 / this.TICK_RATE);

    console.log(`[AuthGame] Started tick loop at ${this.TICK_RATE}Hz`);
  }

  /** Stop the tick loop */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    console.log(`[AuthGame] Stopped at tick ${this.tick}`);
  }

  /** Receive a command from a player */
  receiveCommand(command: GameCommand): void {
    // Commands are buffered and executed on the next tick
    this.commandBuffer.push(command);
  }

  // ─── Tick Processing ──────────────────────────────────────────

  private processTick(): void {
    this.tick++;

    // Collect commands for this tick
    const commands = [...this.commandBuffer];
    this.commandBuffer = [];

    // Validate and execute commands
    const validCommands: GameCommand[] = [];
    for (const cmd of commands) {
      if (this.validateCommand(cmd)) {
        this.executeCommand(cmd);
        validCommands.push(cmd);
      }
    }

    // Update phase-specific logic
    if (this.phase === GamePhase.Setup) {
      this.deploymentTimer -= this.TICK_DT;
      if (this.deploymentTimer <= 0) {
        this.transitionToBattle();
      }
    } else if (this.phase === GamePhase.Battle) {
      // Update all simulation managers
      this.updateSimulation(this.TICK_DT);
    }

    // Compute checksum
    const checksumUnits = Array.from(this.units.values()).map(u => ({
      id: u.id,
      health: u.health,
      morale: u.morale,
      suppression: u.suppression,
      isFrozen: u.isFrozen,
      isRouting: u.isRouting,
      position: { x: u.simPosition.x, z: u.simPosition.z },
    }));
    const checksum = computeGameStateChecksum(checksumUnits);

    // Broadcast tick update
    this.broadcast({
      type: 'tick_update',
      tick: this.tick,
      commands: validCommands,
      checksum,
    });

    // Check victory
    const winner = this.economyManager.getVictoryWinner();
    if (winner) {
      this.phase = GamePhase.Victory;
      this.broadcast({
        type: 'game_event',
        eventType: 'victory',
        winner,
        score: this.economyManager.getScore(),
      });
      this.stop();
    }
  }

  private transitionToBattle(): void {
    this.phase = GamePhase.Battle;

    // Unfreeze all units
    for (const unit of this.units.values()) {
      unit.setFrozen(false);
    }

    this.broadcast({
      type: 'phase_change',
      phase: 'battle',
    });

    console.log(`[AuthGame] Transitioned to battle phase with ${this.units.size} units`);
  }

  private updateSimulation(dt: number): void {
    // Update units
    for (const unit of this.units.values()) {
      if (unit.health > 0) {
        unit.fixedUpdate(dt);
      }
    }

    // Update managers
    this.economyManager.update(dt);
    this.smokeManager.update(dt);
    this.transportManager.update(dt);
  }

  // ─── Command Validation & Execution ───────────────────────────

  private validateCommand(cmd: GameCommand): boolean {
    // Basic validation
    if (!cmd.playerId || cmd.type === undefined) return false;

    // For unit commands, verify unit ownership
    if (cmd.unitIds && cmd.unitIds.length > 0) {
      for (const unitId of cmd.unitIds) {
        const unit = this.units.get(unitId);
        if (!unit) return false;
        if (unit.ownerId !== cmd.playerId && unit.team !== this.getPlayerTeam(cmd.playerId)) {
          return false;
        }
        if (unit.health <= 0) return false;
      }
    }

    return true;
  }

  private executeCommand(cmd: GameCommand): void {
    switch (cmd.type) {
      case CommandType.Move:
        this.executeMoveCommand(cmd);
        break;
      case CommandType.FastMove:
        this.executeFastMoveCommand(cmd);
        break;
      case CommandType.Reverse:
        this.executeReverseCommand(cmd);
        break;
      case CommandType.Attack:
        this.executeAttackCommand(cmd);
        break;
      case CommandType.AttackMove:
        this.executeAttackMoveCommand(cmd);
        break;
      case CommandType.Stop:
        this.executeStopCommand(cmd);
        break;
      case CommandType.SpawnUnit:
        this.executeSpawnCommand(cmd);
        break;
      case CommandType.Unload:
        this.executeUnloadCommand(cmd);
        break;
    }
  }

  private executeMoveCommand(cmd: GameCommand): void {
    if (cmd.targetX === undefined || cmd.targetZ === undefined) return;
    const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);

    for (const unitId of cmd.unitIds) {
      const unit = this.units.get(unitId);
      if (unit) {
        if (cmd.queue) {
          unit.queueMoveCommand(target);
        } else {
          unit.setMoveCommand(target);
        }
      }
    }
  }

  private executeFastMoveCommand(cmd: GameCommand): void {
    if (cmd.targetX === undefined || cmd.targetZ === undefined) return;
    const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);

    for (const unitId of cmd.unitIds) {
      const unit = this.units.get(unitId);
      if (unit) unit.setFastMoveCommand(target);
    }
  }

  private executeReverseCommand(cmd: GameCommand): void {
    if (cmd.targetX === undefined || cmd.targetZ === undefined) return;
    const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);

    for (const unitId of cmd.unitIds) {
      const unit = this.units.get(unitId);
      if (unit) unit.setReverseCommand(target);
    }
  }

  private executeAttackCommand(cmd: GameCommand): void {
    if (!cmd.targetUnitId) return;
    const targetUnit = this.units.get(cmd.targetUnitId);
    if (!targetUnit) return;

    for (const unitId of cmd.unitIds) {
      const unit = this.units.get(unitId);
      if (unit) unit.setAttackCommand(targetUnit);
    }
  }

  private executeAttackMoveCommand(cmd: GameCommand): void {
    if (cmd.targetX === undefined || cmd.targetZ === undefined) return;
    const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);

    for (const unitId of cmd.unitIds) {
      const unit = this.units.get(unitId);
      if (unit) unit.setAttackMoveCommand(target);
    }
  }

  private executeStopCommand(cmd: GameCommand): void {
    for (const unitId of cmd.unitIds) {
      const unit = this.units.get(unitId);
      if (unit) unit.clearCommands();
    }
  }

  private executeSpawnCommand(cmd: GameCommand): void {
    if (!cmd.unitType) return;
    if (cmd.targetX === undefined || cmd.targetZ === undefined) return;

    const unitData = getUnitById(cmd.unitType);
    if (!unitData) {
      console.warn(`[AuthGame] Unknown unit type: ${cmd.unitType}`);
      return;
    }

    // Check credits
    const team = this.getPlayerTeam(cmd.playerId);
    if (team === 'player') {
      if (!this.economyManager.spendCredits(unitData.cost)) {
        console.warn(`[AuthGame] Insufficient credits for ${cmd.unitType}`);
        return;
      }
    } else {
      if (!this.economyManager.spendEnemyCredits(unitData.cost)) return;
    }

    const position = new THREE.Vector3(
      cmd.targetX,
      this.getElevationAt(cmd.targetX, cmd.targetZ),
      cmd.targetZ,
    );

    this.spawnUnit({
      id: `unit_${this.nextUnitId++}`,
      name: unitData.name,
      unitType: unitData.id,
      team,
      ownerId: cmd.playerId,
      position,
      maxHealth: unitData.health,
      speed: unitData.speed.offRoad,
      rotationSpeed: unitData.speed.rotation,
      unitData,
    });
  }

  private executeUnloadCommand(cmd: GameCommand): void {
    for (const unitId of cmd.unitIds) {
      const unit = this.units.get(unitId);
      if (unit) this.transportManager.unloadAll(unit);
    }
  }

  // ─── Unit Management ──────────────────────────────────────────

  spawnUnit(config: SimUnitConfig): SimUnit {
    const unit = new SimUnit(config, this);
    this.units.set(unit.id, unit);

    if (unit.team === 'player') {
      this.unitsByTeam.player.push(unit);
    } else {
      this.unitsByTeam.enemy.push(unit);
    }

    return unit;
  }

  // ─── SimGameContext Implementation ────────────────────────────

  getElevationAt(x: number, z: number): number {
    if (!this.currentMap) return 0;

    const terrain = this.currentMap.terrain;
    const cellSize = this.currentMap.cellSize;

    // Convert world coords to grid coords
    const gridX = x / cellSize + terrain[0]!.length / 2;
    const gridZ = z / cellSize + terrain.length / 2;

    const ix = Math.floor(gridX);
    const iz = Math.floor(gridZ);

    if (iz < 0 || iz >= terrain.length || ix < 0 || ix >= terrain[0]!.length) {
      return 0;
    }

    return terrain[iz]?.[ix]?.elevation ?? 0;
  }

  getTerrainAt(x: number, z: number): TerrainCell | null {
    if (!this.currentMap) return null;

    const terrain = this.currentMap.terrain;
    const cellSize = this.currentMap.cellSize;

    const gridX = Math.floor(x / cellSize + terrain[0]!.length / 2);
    const gridZ = Math.floor(z / cellSize + terrain.length / 2);

    if (gridZ < 0 || gridZ >= terrain.length || gridX < 0 || gridX >= terrain[0]!.length) {
      return null;
    }

    return terrain[gridZ]?.[gridX] ?? null;
  }

  getWeaponData(id: string): WeaponData | undefined {
    return getWeaponById(id);
  }

  getUnitData(id: string): UnitData | undefined {
    return getUnitById(id);
  }

  getUnitsInRadius(position: THREE.Vector3, radius: number, team?: 'player' | 'enemy'): SimUnit[] {
    const radiusSq = radius * radius;
    const results: SimUnit[] = [];

    const unitsToCheck = team ? this.unitsByTeam[team] : [...this.unitsByTeam.player, ...this.unitsByTeam.enemy];

    for (const unit of unitsToCheck) {
      if (unit.health <= 0) continue;
      const dx = unit.simPosition.x - position.x;
      const dz = unit.simPosition.z - position.z;
      if (dx * dx + dz * dz <= radiusSq) {
        results.push(unit);
      }
    }

    return results;
  }

  getAllUnits(team: 'player' | 'enemy'): SimUnit[] {
    return this.unitsByTeam[team];
  }

  destroyUnit(unit: SimUnit): void {
    this.units.delete(unit.id);

    // Remove from team arrays
    const teamArr = this.unitsByTeam[unit.team];
    const idx = teamArr.indexOf(unit);
    if (idx >= 0) teamArr.splice(idx, 1);

    console.log(`[AuthGame] Unit ${unit.name} (${unit.id}) destroyed`);
  }

  findPath(_from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    // Server uses direct path (no obstacle avoidance for now)
    // A full A* pathfinding implementation can be added later
    return [to.clone()];
  }

  findNearestReachablePosition(_from: THREE.Vector3, to: THREE.Vector3, _maxRadius: number): THREE.Vector3 | null {
    return to.clone();
  }

  findNearestBuilding(position: THREE.Vector3, radius: number): Building | null {
    return this.buildingManager.findNearestBuilding(position, radius);
  }

  hasBuildingCapacity(building: Building): boolean {
    return this.buildingManager.hasCapacity(building);
  }

  tryGarrison(unit: SimUnit, building: Building): boolean {
    return this.buildingManager.tryGarrison(unit, building);
  }

  ungarrison(unit: SimUnit, building: Building): THREE.Vector3 | null {
    return this.buildingManager.ungarrison(unit, building);
  }

  spawnDefensiveStructure(unit: SimUnit): Building | null {
    // Check for heavy weapons
    const unitData = getUnitById(unit.unitType);
    const isHeavy = unitData?.weapons?.some(w => {
      const wData = getWeaponById(w.weaponId);
      return (wData as any)?.tags?.includes('heavy');
    }) ?? false;

    return this.buildingManager.spawnDefensiveStructure(
      unit.simPosition,
      unit.simRotationY,
      isHeavy,
    );
  }

  tryMount(passenger: SimUnit, transport: SimUnit): boolean {
    return this.transportManager.tryMount(passenger, transport);
  }

  unloadAll(transport: SimUnit): SimUnit[] {
    return this.transportManager.unloadAll(transport);
  }

  isFogOfWarEnabled(): boolean {
    // Server always has full visibility (no fog)
    return false;
  }

  isPositionVisible(_x: number, _z: number): boolean {
    return true;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private getUnitsInZone(
    zone: { x: number; z: number; width: number; height: number },
    team: 'player' | 'enemy',
  ): Array<{ id: string; x: number; z: number }> {
    const units = this.unitsByTeam[team];
    const result: Array<{ id: string; x: number; z: number }> = [];

    for (const unit of units) {
      if (unit.health <= 0) continue;
      const dx = unit.simPosition.x - zone.x;
      const dz = unit.simPosition.z - zone.z;
      if (Math.abs(dx) <= zone.width / 2 && Math.abs(dz) <= zone.height / 2) {
        result.push({ id: unit.id, x: unit.simPosition.x, z: unit.simPosition.z });
      }
    }

    return result;
  }

  /** Map player ID to team. Override this for actual team assignment. */
  private playerTeams: Map<string, 'player' | 'enemy'> = new Map();

  setPlayerTeam(playerId: string, team: 'player' | 'enemy'): void {
    this.playerTeams.set(playerId, team);
  }

  private getPlayerTeam(playerId: string): 'player' | 'enemy' {
    return this.playerTeams.get(playerId) ?? 'player';
  }

  // ─── Game State Queries ───────────────────────────────────────

  getTick(): number { return this.tick; }
  getPhase(): GamePhase { return this.phase; }
  getScore() { return this.economyManager.getScore(); }
  getUnitCount(): number { return this.units.size; }

  /** Get full state snapshot for client resync */
  getStateSnapshot(): object {
    const unitSnapshots = Array.from(this.units.values()).map(u => ({
      id: u.id,
      unitType: u.unitType,
      team: u.team,
      ownerId: u.ownerId,
      x: u.simPosition.x,
      y: u.simPosition.y,
      z: u.simPosition.z,
      health: u.health,
      morale: u.morale,
      rotationY: u.simRotationY,
    }));

    return {
      type: 'state_snapshot',
      tick: this.tick,
      units: unitSnapshots,
      economy: {
        playerCredits: this.economyManager.getPlayerCredits(),
        enemyCredits: this.economyManager.getEnemyCredits(),
      },
      score: this.economyManager.getScore(),
      phase: this.phase,
    };
  }

  /** Clean up all resources */
  dispose(): void {
    this.stop();
    this.units.clear();
    this.unitsByTeam.player = [];
    this.unitsByTeam.enemy = [];
    this.smokeManager.clear();
    this.transportManager.clear();
    this.buildingManager.clear();
  }
}
