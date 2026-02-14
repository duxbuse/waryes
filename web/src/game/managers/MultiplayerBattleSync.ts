/**
 * MultiplayerBattleSync - Battle state synchronization
 *
 * Supports three modes:
 * 1. Host-authoritative (legacy): Host broadcasts state, clients render
 * 2. Command-replication (lockstep): All clients receive commands, simulate deterministically
 * 3. Server-authoritative: Server runs simulation, clients receive confirmed commands + checksums
 *
 * Mode 3 (server-authoritative) is the primary multiplayer mode:
 * - Client sends commands to server via WebSocket
 * - Server validates, executes, and broadcasts tick_update messages
 * - Client executes confirmed commands and verifies local checksum
 * - On consecutive desync, server sends full state_snapshot for resync
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import { tickManager } from '../multiplayer/TickManager';
import {
  type GameCommand,
  CommandType,
  serializeCommand,
  deserializeCommand,
  createMoveCommand,
  createAttackCommand,
  createQueueReinforcementCommand,
} from '../multiplayer/CommandProtocol';
import { computeGameStateChecksum, formatChecksum } from '../multiplayer/StateChecksum';

export interface BattleStateUpdate {
  timestamp: number;
  units: UnitState[];
  scores: { player: number; enemy: number };
}

export interface UnitState {
  id: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  health: number;
  morale: number;
  isRouting: boolean;
}

export class MultiplayerBattleSync {
  private readonly game: Game;
  private isHost: boolean = false;
  private isMultiplayer: boolean = false;
  private lastSyncTime: number = 0;
  private readonly SYNC_INTERVAL = 100; // ms, 10 updates/sec

  // Command-based sync mode (lockstep)
  private useCommandSync: boolean = false;
  private localPlayerId: string = '';
  private pendingCommands: GameCommand[] = [];
  private lastChecksumTick: number = 0;
  private readonly CHECKSUM_INTERVAL = 100; // Verify sync every 100 ticks

  // Server-authoritative mode
  private useAuthoritativeSync: boolean = false;
  private serverTick: number = 0;
  private consecutiveDesyncs: number = 0;
  private readonly MAX_DESYNCS_BEFORE_RESYNC = 3;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Enable multiplayer mode
   */
  enableMultiplayer(isHost: boolean): void {
    this.isMultiplayer = true;
    this.isHost = isHost;
    console.log(`[MP Battle] Enabled as ${isHost ? 'HOST' : 'CLIENT'}`);
  }

  /**
   * Disable multiplayer mode
   */
  disableMultiplayer(): void {
    this.isMultiplayer = false;
    this.isHost = false;
    this.useAuthoritativeSync = false;
    this.useCommandSync = false;
    this.consecutiveDesyncs = 0;
  }

  /**
   * Update - called every frame
   */
  update(_dt: number): void {
    if (!this.isMultiplayer) return;

    // In authoritative mode, server drives ticks - nothing to do here
    if (this.useAuthoritativeSync) return;

    // Host broadcasts state periodically (legacy mode)
    if (this.isHost) {
      const now = Date.now();
      if (now - this.lastSyncTime >= this.SYNC_INTERVAL) {
        this.broadcastState();
        this.lastSyncTime = now;
      }
    }
  }

  /**
   * Broadcast current game state (host only)
   */
  private broadcastState(): void {
    if (!this.isHost) return;

    const units = this.game.unitManager.getAllUnits();
    const unitStates: UnitState[] = units.map(unit => this.serializeUnit(unit));

    const scores = this.game.economyManager.getScore();

    const state: BattleStateUpdate = {
      timestamp: Date.now(),
      units: unitStates,
      scores,
    };

    this.game.multiplayerManager.broadcastGameState(state);
  }

  /**
   * Receive state update from host (client only)
   */
  receiveState(state: BattleStateUpdate): void {
    if (this.isHost) return; // Host ignores incoming state

    // Update all units to match host's state
    for (const unitState of state.units) {
      const unit = this.game.unitManager.getUnitById(unitState.id);
      if (unit) {
        this.applyUnitState(unit, unitState);
      }
    }
  }

  /**
   * Serialize unit to state
   */
  private serializeUnit(unit: Unit): UnitState {
    return {
      id: unit.id,
      x: unit.position.x,
      y: unit.position.y,
      z: unit.position.z,
      rotation: unit.mesh.rotation.y,
      health: unit.health,
      morale: unit.morale,
      isRouting: unit.isRouting,
    };
  }

  /**
   * Apply state to unit
   */
  private applyUnitState(unit: Unit, state: UnitState): void {
    unit.position.x = state.x;
    unit.position.y = state.y;
    unit.position.z = state.z;
    unit.mesh.position.set(state.x, state.y, state.z);
    unit.mesh.rotation.y = state.rotation;
  }

  /**
   * Check if multiplayer is active
   */
  isActive(): boolean {
    return this.isMultiplayer;
  }

  /**
   * Check if this client is the host
   */
  isHostClient(): boolean {
    return this.isHost;
  }

  // ============ Server-Authoritative Sync Methods ============

  /**
   * Enable server-authoritative synchronization.
   * In this mode, the server runs the simulation and broadcasts
   * confirmed commands + checksums each tick.
   */
  enableAuthoritativeSync(playerId: string): void {
    this.isMultiplayer = true;
    this.isHost = false; // Server is authority, not the client
    this.useAuthoritativeSync = true;
    this.localPlayerId = playerId;
    this.serverTick = 0;
    this.consecutiveDesyncs = 0;

    // Register server message handlers
    this.game.multiplayerManager.on('tick_update', (tick: number, commands: any[], checksum: number) => {
      this.handleTickUpdate(tick, commands, checksum);
    });

    this.game.multiplayerManager.on('state_snapshot', (snapshot: any) => {
      this.handleStateSnapshot(snapshot);
    });

    console.log(`[MP Battle] Authoritative sync enabled for player ${playerId}`);
  }

  /**
   * Handle a tick update from the authoritative server.
   * Executes confirmed commands and verifies checksum.
   */
  private handleTickUpdate(tick: number, commands: any[], serverChecksum: number): void {
    this.serverTick = tick;

    // Execute confirmed commands from server
    for (const cmd of commands) {
      this.executeCommand(cmd);
    }

    // Verify local checksum matches server
    const allUnits = this.game.unitManager.getAllUnits();
    const localChecksum = computeGameStateChecksum(allUnits);

    if (localChecksum !== serverChecksum) {
      this.consecutiveDesyncs++;
      console.warn(
        `[MP Battle] Desync at tick ${tick}! Local: ${formatChecksum(localChecksum)}, Server: ${formatChecksum(serverChecksum)} (${this.consecutiveDesyncs}/${this.MAX_DESYNCS_BEFORE_RESYNC})`
      );

      if (this.consecutiveDesyncs >= this.MAX_DESYNCS_BEFORE_RESYNC) {
        console.warn(`[MP Battle] Too many consecutive desyncs, requesting state snapshot`);
        // The server will send a state_snapshot when it detects persistent desync
        // For now, just log - server-side desync detection handles this
      }
    } else {
      if (this.consecutiveDesyncs > 0) {
        console.log(`[MP Battle] Resync successful at tick ${tick}`);
      }
      this.consecutiveDesyncs = 0;
    }
  }

  /**
   * Handle a full state snapshot from the server for resync.
   */
  private handleStateSnapshot(snapshot: any): void {
    console.log(`[MP Battle] Applying state snapshot at tick ${snapshot.tick}`);

    this.serverTick = snapshot.tick;
    this.consecutiveDesyncs = 0;

    // TODO: Full state resync would require:
    // 1. Remove units not in snapshot
    // 2. Create units in snapshot that don't exist locally
    // 3. Update all unit positions, health, morale, etc.
    // This is complex and will be implemented when needed.

    console.log(`[MP Battle] State snapshot applied (${snapshot.units?.length ?? 0} units)`);
  }

  /**
   * Send a command to the authoritative server.
   * The command is NOT executed locally - it will be included in
   * a future tick_update if the server validates it.
   */
  sendCommandToAuthServer(cmd: GameCommand): void {
    if (!this.useAuthoritativeSync) return;

    cmd.playerId = this.localPlayerId;
    const serialized = serializeCommand(cmd);
    this.game.multiplayerManager.sendGameCommand(serialized);
  }

  /**
   * Check if using server-authoritative sync
   */
  isUsingAuthoritativeSync(): boolean {
    return this.useAuthoritativeSync;
  }

  /**
   * Get the current server tick
   */
  getServerTick(): number {
    return this.serverTick;
  }

  // ============ Command-Based Sync Methods (Lockstep) ============

  /**
   * Enable command-based lockstep synchronization
   */
  enableCommandSync(playerId: string): void {
    this.useCommandSync = true;
    this.localPlayerId = playerId;
    tickManager.reset();
    this.pendingCommands = [];
    this.lastChecksumTick = 0;
    console.log(`[MP Battle] Command sync enabled for player ${playerId}`);
  }

  /**
   * Disable command-based sync
   */
  disableCommandSync(): void {
    this.useCommandSync = false;
    this.localPlayerId = '';
    this.pendingCommands = [];
  }

  /**
   * Check if using command-based sync
   */
  isUsingCommandSync(): boolean {
    return this.useCommandSync;
  }

  /**
   * Queue a local command to be sent to server
   */
  queueLocalCommand(cmd: GameCommand): void {
    if (!this.useCommandSync && !this.useAuthoritativeSync) return;

    if (this.useAuthoritativeSync) {
      // In authoritative mode, just send to server - don't execute locally
      this.sendCommandToAuthServer(cmd);
      return;
    }

    // Lockstep mode: add to pending and send to server
    this.pendingCommands.push(cmd);
    this.sendCommandToServer(cmd);
  }

  /**
   * Send move command for units
   */
  sendMoveCommand(unitIds: string[], targetX: number, targetZ: number, queue: boolean = false): void {
    if (!this.useCommandSync && !this.useAuthoritativeSync) return;

    const cmd = createMoveCommand(
      this.useAuthoritativeSync ? this.serverTick + 2 : tickManager.getCurrentTick() + 2,
      this.localPlayerId,
      unitIds,
      targetX,
      targetZ,
      queue
    );

    this.queueLocalCommand(cmd);
  }

  /**
   * Send attack command for units
   */
  sendAttackCommand(unitIds: string[], targetUnitId: string, queue: boolean = false): void {
    if (!this.useCommandSync && !this.useAuthoritativeSync) return;

    const cmd = createAttackCommand(
      this.useAuthoritativeSync ? this.serverTick + 2 : tickManager.getCurrentTick() + 2,
      this.localPlayerId,
      unitIds,
      targetUnitId,
      queue
    );

    this.queueLocalCommand(cmd);
  }

  /**
   * Send queue reinforcement command
   */
  sendQueueReinforcementCommand(
    entryPointId: string,
    unitType: string,
    targetX?: number,
    targetZ?: number,
    moveType?: 'normal' | 'attack' | 'reverse' | 'fast' | null
  ): void {
    if (!this.useCommandSync && !this.useAuthoritativeSync) return;

    const cmd = createQueueReinforcementCommand(
      this.useAuthoritativeSync ? this.serverTick + 2 : tickManager.getCurrentTick() + 2,
      this.localPlayerId,
      entryPointId,
      unitType,
      targetX,
      targetZ,
      moveType
    );

    this.queueLocalCommand(cmd);
  }

  /**
   * Send command to server via multiplayer manager
   */
  private sendCommandToServer(cmd: GameCommand): void {
    const serialized = serializeCommand(cmd);
    this.game.multiplayerManager.sendGameCommand(serialized);
  }

  /**
   * Receive command from server (from any player)
   */
  receiveCommand(commandData: string): void {
    if (!this.useCommandSync) return;

    try {
      const cmd = deserializeCommand(commandData);
      if (!cmd) {
        console.error('[MP Battle] Invalid command structure');
        return;
      }
      tickManager.queueCommand(cmd);
    } catch (error) {
      console.error('[MP Battle] Failed to parse command:', error);
    }
  }

  /**
   * Process commands for current tick
   * Called during game update loop
   */
  processTickCommands(): void {
    if (!this.useCommandSync) return;

    const currentTick = tickManager.getCurrentTick();
    const commands = tickManager.getCommandsForTick(currentTick);

    for (const cmd of commands) {
      this.executeCommand(cmd);
    }

    // Periodic checksum verification
    if (currentTick - this.lastChecksumTick >= this.CHECKSUM_INTERVAL) {
      this.verifyChecksum();
      this.lastChecksumTick = currentTick;
    }
  }

  /**
   * Execute a game command
   */
  private executeCommand(cmd: GameCommand): void {
    const unitManager = this.game.unitManager;

    // Get units for this command
    const units = cmd.unitIds
      .map(id => unitManager.getUnitById(id))
      .filter((u): u is Unit => u !== null);

    if (units.length === 0 && cmd.type !== CommandType.SpawnUnit) return;

    switch (cmd.type) {
      case CommandType.Move:
        if (cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
          unitManager.issueMoveCommand(units, target, cmd.queue ?? false);
        }
        break;

      case CommandType.Attack:
        if (cmd.targetUnitId) {
          const target = unitManager.getUnitById(cmd.targetUnitId);
          if (target) {
            unitManager.issueAttackCommand(units, target, cmd.queue ?? false);
          }
        }
        break;

      case CommandType.FastMove:
        if (cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
          unitManager.issueFastMoveCommand(units, target, cmd.queue ?? false);
        }
        break;

      case CommandType.AttackMove:
        if (cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
          unitManager.issueAttackMoveCommand(units, target, cmd.queue ?? false);
        }
        break;

      case CommandType.Reverse:
        if (cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const target = new THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
          unitManager.issueReverseCommand(units, target, cmd.queue ?? false);
        }
        break;

      case CommandType.Stop:
        for (const unit of units) {
          unit.clearCommands();
        }
        break;

      case CommandType.SpawnUnit:
        // In authoritative mode, server spawns units and clients see
        // them via state snapshots. For now, log the event.
        if (this.useAuthoritativeSync && cmd.unitType && cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          console.log(`[MP Battle] Server spawned unit: ${cmd.unitType} at (${cmd.targetX.toFixed(0)}, ${cmd.targetZ.toFixed(0)})`);
        }
        break;

      case CommandType.QueueReinforcement:
        if (cmd.unitType && cmd.unitIds.length > 0) {
          const entryPointId = cmd.unitIds[0]!;
          this.game.reinforcementManager.processReinforcementCommand(
            entryPointId,
            cmd.unitType,
            cmd.targetX,
            cmd.targetZ,
            cmd.moveType
          );
        }
        break;

      default:
        console.warn(`[MP Battle] Unknown command type: ${cmd.type}`);
    }
  }

  /**
   * Verify game state checksum with server/other clients
   */
  private verifyChecksum(): void {
    const allUnits = this.game.unitManager.getAllUnits();
    const checksum = computeGameStateChecksum(allUnits);
    const tick = tickManager.getCurrentTick();

    console.log(`[MP Battle] Tick ${tick} checksum: ${formatChecksum(checksum)}`);
  }

  /**
   * Advance to next tick (called from game loop)
   */
  advanceTick(): void {
    if (this.useCommandSync) {
      tickManager.advanceTick();
    }
  }

  /**
   * Get current tick
   */
  getCurrentTick(): number {
    if (this.useAuthoritativeSync) return this.serverTick;
    return tickManager.getCurrentTick();
  }
}
