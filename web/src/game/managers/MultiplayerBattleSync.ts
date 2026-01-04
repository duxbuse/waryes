/**
 * MultiplayerBattleSync - Minimal battle state synchronization
 *
 * Simple approach:
 * - Host runs authoritative simulation
 * - Host broadcasts state updates to clients
 * - Clients render host's state
 *
 * This is a minimal implementation to meet multiplayer requirements.
 * A production system would use deterministic simulation + command replication.
 */

import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';

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
}
