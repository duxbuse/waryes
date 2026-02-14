/**
 * GameSession - Manages the lifecycle of a single multiplayer game.
 *
 * Ties a lobby to an AuthoritativeGame, tracks player connections,
 * and handles the full game lifecycle from deployment to victory.
 */

import { AuthoritativeGame } from './AuthoritativeGame';
import type { GameCommand } from '@shared/multiplayer/CommandProtocol';
import type { GameMap } from '@shared/data/types';

export interface SessionPlayer {
  id: string;
  name: string;
  team: 'player' | 'enemy';
  deckId: string | null;
  ws: any; // WebSocket connection
  connected: boolean;
  lastSeen: number;
}

export interface GameSessionConfig {
  lobbyCode: string;
  mapSeed: number;
  mapSize: 'small' | 'medium' | 'large';
  players: SessionPlayer[];
}

export class GameSession {
  readonly lobbyCode: string;
  readonly game: AuthoritativeGame;
  private readonly players: Map<string, SessionPlayer> = new Map();
  private readonly startedAt: number;
  private endedAt: number | null = null;
  private _isActive = true;

  /** Callback for when the game ends */
  onGameEnd: ((session: GameSession, winner: 'player' | 'enemy') => void) | null = null;

  constructor(config: GameSessionConfig) {
    this.lobbyCode = config.lobbyCode;
    this.startedAt = Date.now();

    // Register players
    for (const player of config.players) {
      this.players.set(player.id, player);
    }

    // Create authoritative game
    this.game = new AuthoritativeGame({
      mapSeed: config.mapSeed,
      mapSize: config.mapSize,
      broadcast: (msg) => this.broadcastToAll(msg),
    });

    // Set up player teams
    for (const player of config.players) {
      this.game.setPlayerTeam(player.id, player.team);
    }

    console.log(`[GameSession] Created for lobby ${config.lobbyCode} with ${config.players.length} players`);
  }

  /** Initialize with a generated map and start the game */
  startGame(map: GameMap): void {
    this.game.initialize(map);
    this.game.start();
    console.log(`[GameSession] Game started for lobby ${this.lobbyCode}`);
  }

  /** Handle a command from a player */
  handleCommand(playerId: string, command: GameCommand): boolean {
    if (!this._isActive) return false;

    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`[GameSession] Unknown player ${playerId} sent command`);
      return false;
    }

    // Tag command with player ID
    command.playerId = playerId;
    this.game.receiveCommand(command);
    return true;
  }

  /** Handle player disconnect */
  handleDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      player.lastSeen = Date.now();
      console.log(`[GameSession] Player ${player.name} disconnected from ${this.lobbyCode}`);
    }

    // Check if all players disconnected
    const anyConnected = Array.from(this.players.values()).some(p => p.connected);
    if (!anyConnected) {
      console.log(`[GameSession] All players disconnected, ending game ${this.lobbyCode}`);
      this.endGame('player'); // Default winner if everyone leaves
    }
  }

  /** Handle player reconnect */
  handleReconnect(playerId: string, ws: any): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    player.ws = ws;
    player.connected = true;
    player.lastSeen = Date.now();

    // Send state snapshot for resync
    const snapshot = this.game.getStateSnapshot();
    this.sendToPlayer(playerId, snapshot);

    console.log(`[GameSession] Player ${player.name} reconnected to ${this.lobbyCode}`);
    return true;
  }

  /** End the game with a winner */
  endGame(winner: 'player' | 'enemy'): void {
    if (!this._isActive) return;

    this._isActive = false;
    this.endedAt = Date.now();
    this.game.stop();

    this.broadcastToAll({
      type: 'game_event',
      eventType: 'game_ended',
      winner,
      score: this.game.getScore(),
      duration: this.getDuration(),
    });

    this.onGameEnd?.(this, winner);
    console.log(`[GameSession] Game ended for ${this.lobbyCode}. Winner: ${winner}`);
  }

  /** Get game duration in seconds */
  getDuration(): number {
    const end = this.endedAt ?? Date.now();
    return Math.round((end - this.startedAt) / 1000);
  }

  /** Check if the session is still active */
  get isActive(): boolean {
    return this._isActive;
  }

  /** Get all players in this session */
  getPlayers(): SessionPlayer[] {
    return Array.from(this.players.values());
  }

  /** Get player by ID */
  getPlayer(playerId: string): SessionPlayer | undefined {
    return this.players.get(playerId);
  }

  // ─── Communication ────────────────────────────────────────────

  private broadcastToAll(message: object): void {
    const data = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.connected && player.ws) {
        try {
          player.ws.send(data);
        } catch (e) {
          console.warn(`[GameSession] Failed to send to ${player.name}:`, e);
          player.connected = false;
        }
      }
    }
  }

  private sendToPlayer(playerId: string, message: object): void {
    const player = this.players.get(playerId);
    if (player?.connected && player.ws) {
      try {
        player.ws.send(JSON.stringify(message));
      } catch (e) {
        console.warn(`[GameSession] Failed to send to ${player.name}:`, e);
        player.connected = false;
      }
    }
  }

  /** Clean up */
  dispose(): void {
    this.game.dispose();
    this.players.clear();
  }
}
