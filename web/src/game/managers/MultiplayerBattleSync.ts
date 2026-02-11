/**
 * MultiplayerBattleSync - Battle state synchronization
 *
 * Supports two modes:
 * 1. Host-authoritative (legacy): Host broadcasts state, clients render
 * 2. Command-replication (lockstep): All clients receive commands, simulate deterministically
 *
 * Command-replication mode uses:
 * - TickManager for synchronized game ticks
 * - CommandProtocol for serializable commands
 * - StateChecksum for desync detection
 */

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
  }

  /**
   * Update - called every frame
   */
  update(_dt: number): void {
    if (!this.isMultiplayer) return;

    // Host broadcasts state periodically
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

    // Update scores
    // (EconomyManager would need a method to set scores)
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
    // Update position
    unit.position.x = state.x;
    unit.position.y = state.y;
    unit.position.z = state.z;

    // Update mesh position and rotation
    unit.mesh.position.set(state.x, state.y, state.z);
    unit.mesh.rotation.y = state.rotation;

    // Update stats (these are readonly, so we need to use private methods or skip)
    // For minimal sync, just syncing position is acceptable
    // unit.health = state.health; // readonly
    // unit.morale = state.morale; // readonly

    // Note: This doesn't handle unit death, creation, health, morale etc.
    // A full implementation would need more comprehensive state sync
    // For now, we just sync positions which is the minimum requirement
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

  // ============ Command-Based Sync Methods ============

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
    if (!this.useCommandSync) return;

    // Add to pending and send to server
    this.pendingCommands.push(cmd);
    this.sendCommandToServer(cmd);
  }

  /**
   * Send move command for units
   */
  sendMoveCommand(unitIds: string[], targetX: number, targetZ: number, queue: boolean = false): void {
    if (!this.useCommandSync) return;

    const cmd = createMoveCommand(
      tickManager.getCurrentTick() + 2, // Execute 2 ticks in future (input delay)
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
    if (!this.useCommandSync) return;

    const cmd = createAttackCommand(
      tickManager.getCurrentTick() + 2,
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
    if (!this.useCommandSync) return;

    const cmd = createQueueReinforcementCommand(
      tickManager.getCurrentTick() + 2,
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

    if (units.length === 0) return;

    switch (cmd.type) {
      case CommandType.Move:
        if (cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const target = new (window as any).THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
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
          const target = new (window as any).THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
          unitManager.issueFastMoveCommand(units, target, cmd.queue ?? false);
        }
        break;

      case CommandType.AttackMove:
        if (cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const target = new (window as any).THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
          unitManager.issueAttackMoveCommand(units, target, cmd.queue ?? false);
        }
        break;

      case CommandType.Reverse:
        if (cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const target = new (window as any).THREE.Vector3(cmd.targetX, 0, cmd.targetZ);
          unitManager.issueReverseCommand(units, target, cmd.queue ?? false);
        }
        break;

      case CommandType.Stop:
        for (const unit of units) {
          unit.clearCommands();
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

      // Add more command types as needed
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

    // Send checksum to server for verification
    // Server would compare all client checksums
    console.log(`[MP Battle] Tick ${tick} checksum: ${formatChecksum(checksum)}`);

    // In a full implementation, we'd send this to server:
    // this.game.multiplayerManager.sendChecksum(tick, checksum);
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
    return tickManager.getCurrentTick();
  }
}
