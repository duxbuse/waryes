/**
 * GameSessionManager - Creates and manages active game sessions.
 *
 * Tracks all running games, handles session creation/destruction,
 * and provides capacity information for load balancing.
 */

import { GameSession } from './GameSession';
import type { GameSessionConfig } from './GameSession';
import type { GameMap } from '@shared/data/types';

const MAX_CONCURRENT_GAMES = parseInt(process.env['MAX_CONCURRENT_GAMES'] ?? '20', 10);

export class GameSessionManager {
  private readonly sessions: Map<string, GameSession> = new Map(); // lobbyCode -> session

  /** Create a new game session for a lobby */
  createSession(config: GameSessionConfig): GameSession | null {
    if (this.sessions.size >= MAX_CONCURRENT_GAMES) {
      console.warn(`[SessionManager] Max concurrent games reached (${MAX_CONCURRENT_GAMES})`);
      return null;
    }

    if (this.sessions.has(config.lobbyCode)) {
      console.warn(`[SessionManager] Session already exists for lobby ${config.lobbyCode}`);
      return null;
    }

    const session = new GameSession(config);

    // Register cleanup on game end
    session.onGameEnd = (sess, _winner) => {
      // Delay cleanup to allow final messages
      setTimeout(() => {
        this.destroySession(sess.lobbyCode);
      }, 5000);
    };

    this.sessions.set(config.lobbyCode, session);
    console.log(`[SessionManager] Created session for ${config.lobbyCode}. Active: ${this.sessions.size}/${MAX_CONCURRENT_GAMES}`);

    return session;
  }

  /** Start a session with a generated map */
  startSession(lobbyCode: string, map: GameMap): boolean {
    const session = this.sessions.get(lobbyCode);
    if (!session) return false;

    session.startGame(map);
    return true;
  }

  /** Get an active session by lobby code */
  getSession(lobbyCode: string): GameSession | undefined {
    return this.sessions.get(lobbyCode);
  }

  /** Destroy a session and free resources */
  destroySession(lobbyCode: string): void {
    const session = this.sessions.get(lobbyCode);
    if (session) {
      session.dispose();
      this.sessions.delete(lobbyCode);
      console.log(`[SessionManager] Destroyed session ${lobbyCode}. Active: ${this.sessions.size}/${MAX_CONCURRENT_GAMES}`);
    }
  }

  /** Get current load info for health checks */
  getLoadInfo(): { activeGames: number; maxGames: number; activePlayers: number } {
    let activePlayers = 0;
    for (const session of this.sessions.values()) {
      activePlayers += session.getPlayers().filter(p => p.connected).length;
    }

    return {
      activeGames: this.sessions.size,
      maxGames: MAX_CONCURRENT_GAMES,
      activePlayers,
    };
  }

  /** Check if server has capacity for a new game */
  hasCapacity(): boolean {
    return this.sessions.size < MAX_CONCURRENT_GAMES;
  }

  /** Get all active sessions (for debugging/admin) */
  getActiveSessions(): Array<{
    lobbyCode: string;
    playerCount: number;
    tick: number;
    phase: string;
  }> {
    return Array.from(this.sessions.values()).map(s => ({
      lobbyCode: s.lobbyCode,
      playerCount: s.getPlayers().length,
      tick: s.game.getTick(),
      phase: s.game.getPhase(),
    }));
  }

  /** Clean up all sessions */
  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }
}
