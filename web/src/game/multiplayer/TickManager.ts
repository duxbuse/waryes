/**
 * TickManager - Manages game ticks for lockstep synchronization
 *
 * In lockstep multiplayer, all clients execute the same commands on the same
 * game tick to ensure deterministic simulation. The TickManager:
 * - Tracks the current simulation tick
 * - Buffers commands to be executed on future ticks
 * - Manages confirmed ticks (acknowledged by all clients)
 * - Cleans up old command history
 */

import type { GameCommand } from './CommandProtocol';

export class TickManager {
  private currentTick: number = 0;
  private commandBuffer: Map<number, GameCommand[]> = new Map();
  private confirmedTick: number = 0;

  // Configuration
  private readonly COMMAND_HISTORY_LENGTH = 100; // Keep commands for rollback

  /**
   * Get current simulation tick
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Get last confirmed tick (acknowledged by all clients)
   */
  getConfirmedTick(): number {
    return this.confirmedTick;
  }

  /**
   * Advance to next tick
   */
  advanceTick(): void {
    this.currentTick++;
  }

  /**
   * Set current tick (used for sync/rollback)
   */
  setTick(tick: number): void {
    this.currentTick = tick;
  }

  /**
   * Queue a command for execution at its specified tick
   */
  queueCommand(cmd: GameCommand): void {
    const tick = cmd.tick;
    if (!this.commandBuffer.has(tick)) {
      this.commandBuffer.set(tick, []);
    }
    this.commandBuffer.get(tick)!.push(cmd);
  }

  /**
   * Queue multiple commands
   */
  queueCommands(cmds: GameCommand[]): void {
    for (const cmd of cmds) {
      this.queueCommand(cmd);
    }
  }

  /**
   * Get all commands to execute on a specific tick
   */
  getCommandsForTick(tick: number): GameCommand[] {
    return this.commandBuffer.get(tick) || [];
  }

  /**
   * Check if we have commands waiting for a tick
   */
  hasCommandsForTick(tick: number): boolean {
    const cmds = this.commandBuffer.get(tick);
    return cmds !== undefined && cmds.length > 0;
  }

  /**
   * Confirm a tick (acknowledged by all clients)
   * This cleans up old command history
   */
  confirmTick(tick: number): void {
    this.confirmedTick = tick;
    // Clean up old commands beyond history length
    for (const [t] of this.commandBuffer) {
      if (t < tick - this.COMMAND_HISTORY_LENGTH) {
        this.commandBuffer.delete(t);
      }
    }
  }

  /**
   * Get number of ticks ahead of confirmed
   * Used to determine if we need to wait for network
   */
  getTicksAheadOfConfirmed(): number {
    return this.currentTick - this.confirmedTick;
  }

  /**
   * Check if we're too far ahead of confirmed (should wait)
   */
  shouldWaitForNetwork(maxAhead: number = 5): boolean {
    return this.getTicksAheadOfConfirmed() > maxAhead;
  }

  /**
   * Reset the tick manager (new game)
   */
  reset(): void {
    this.currentTick = 0;
    this.confirmedTick = 0;
    this.commandBuffer.clear();
  }

  /**
   * Get buffer statistics for debugging
   */
  getStats(): { currentTick: number; confirmedTick: number; bufferedTicks: number } {
    return {
      currentTick: this.currentTick,
      confirmedTick: this.confirmedTick,
      bufferedTicks: this.commandBuffer.size,
    };
  }
}

// Global tick manager instance
export const tickManager = new TickManager();
