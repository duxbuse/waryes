/**
 * MultiplayerManager - Handles multiplayer connections and synchronization
 *
 * Features:
 * - WebSocket connection to server
 * - Lobby creation and joining
 * - Player state synchronization
 * - Game state synchronization during battle
 * - Reconnection support
 */

import type { Game } from '../../core/Game';
import { getAccessToken } from '../../api/ApiClient';
import { WS_URL, API_URL } from '../../config';

export interface MultiplayerPlayer {
  id: string;
  name: string;
  team: 'team1' | 'team2' | 'spectator';
  deckId: string | null;
  isReady: boolean;
  isHost: boolean;
}

export interface MultiplayerLobby {
  code: string;
  hostId: string;
  players: MultiplayerPlayer[];
  maxPlayers: number;
  mapSize: 'small' | 'medium' | 'large';
  mapSeed: number;
  status: 'waiting' | 'in_progress' | 'finished';
}

export interface LobbyListItem {
  code: string;
  host: string;
  mapSize: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
}

export class MultiplayerManager {
  // Game reference (currently unused but kept for future features)
  // private readonly _game: Game;
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private playerId: string;
  private playerName: string;
  private currentLobby: MultiplayerLobby | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // Callbacks
  private onLobbyCreated: ((lobby: MultiplayerLobby) => void) | null = null;
  private onLobbyJoined: ((lobby: MultiplayerLobby) => void) | null = null;
  private onPlayerJoined: ((player: MultiplayerPlayer) => void) | null = null;
  private onPlayerLeft: ((playerId: string) => void) | null = null;
  private onPlayerUpdated: ((playerId: string, updates: any) => void) | null = null;
  private onGameStarting: ((mapSeed: number, mapSize: string) => void) | null = null;
  private onGameState: ((state: any) => void) | null = null;
  private onKicked: (() => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private onTickUpdate: ((tick: number, commands: any[], checksum: number) => void) | null = null;
  private onStateSnapshot: ((snapshot: any) => void) | null = null;
  private onPhaseChange: ((phase: string, data: any) => void) | null = null;
  private onGameEvent: ((eventType: string, data: any) => void) | null = null;

  constructor(_game: Game) {
    // this._game = game; // Currently unused
    this.serverUrl = WS_URL;
    this.playerId = this.generatePlayerId();
    this.playerName = this.loadPlayerName();
  }

  /**
   * Generate a unique player ID
   */
  private generatePlayerId(): string {
    let id = localStorage.getItem('playerId');
    if (!id) {
      id = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('playerId', id);
    }
    return id;
  }

  /**
   * Load player name from localStorage or generate default
   */
  private loadPlayerName(): string {
    let name = localStorage.getItem('playerName');
    if (!name) {
      name = `Player${Math.floor(Math.random() * 10000)}`;
      localStorage.setItem('playerName', name);
    }
    return name;
  }

  /**
   * Set player name
   */
  setPlayerName(name: string): void {
    this.playerName = name;
    localStorage.setItem('playerName', name);
  }

  /**
   * Get player name
   */
  getPlayerName(): string {
    return this.playerName;
  }

  /**
   * Connect to multiplayer server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        // Include JWT token in WS connection for server-side authentication
        const token = getAccessToken();
        const wsUrl = token
          ? `${this.serverUrl}?token=${encodeURIComponent(token)}`
          : this.serverUrl;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[Multiplayer] Connected to server');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (typeof message?.type !== 'string') return;
            this.handleMessage(message);
          } catch {
            console.error('[Multiplayer] Invalid message received');
          }
        };

        this.ws.onerror = (error) => {
          console.error('[Multiplayer] WebSocket error:', error);
          reject(new Error('Failed to connect to server'));
        };

        this.ws.onclose = () => {
          console.log('[Multiplayer] Disconnected from server');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect to server
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Multiplayer] Max reconnect attempts reached');
      if (this.onError) {
        this.onError('Lost connection to server');
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

    console.log(`[Multiplayer] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().then(() => {
        // Notify server of reconnection
        if (this.currentLobby) {
          this.send({
            type: 'reconnect',
            playerId: this.playerId,
          });
        }
      }).catch(() => {
        // Will retry again
      });
    }, delay);
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentLobby = null;
  }

  /**
   * Create a new lobby
   */
  async createLobby(mapSize: 'small' | 'medium' | 'large'): Promise<void> {
    await this.connect();

    this.send({
      type: 'create_lobby',
      playerId: this.playerId,
      playerName: this.playerName,
      mapSize,
    });
  }

  /**
   * Join an existing lobby by code
   */
  async joinLobby(code: string): Promise<void> {
    await this.connect();

    this.send({
      type: 'join_lobby',
      code: code.toUpperCase(),
      playerId: this.playerId,
      playerName: this.playerName,
    });
  }

  /**
   * Leave current lobby
   */
  leaveLobby(): void {
    if (!this.currentLobby) return;

    this.send({
      type: 'leave_lobby',
      code: this.currentLobby.code,
      playerId: this.playerId,
    });

    this.currentLobby = null;
  }

  /**
   * Update player state in lobby
   */
  updatePlayerState(updates: { team?: 'team1' | 'team2' | 'spectator'; deckId?: string | null; isReady?: boolean }): void {
    if (!this.currentLobby) return;

    this.send({
      type: 'update_state',
      code: this.currentLobby.code,
      playerId: this.playerId,
      updates,
    });
  }

  /**
   * Kick a player (host only)
   */
  kickPlayer(targetPlayerId: string): void {
    if (!this.currentLobby) return;

    this.send({
      type: 'kick_player',
      code: this.currentLobby.code,
      hostId: this.playerId,
      targetPlayerId,
    });
  }

  /**
   * Start the game (host only)
   */
  startGame(): void {
    if (!this.currentLobby) return;

    this.send({
      type: 'start_game',
      code: this.currentLobby.code,
      hostId: this.playerId,
    });
  }

  /**
   * Get list of open lobbies
   */
  async getOpenLobbies(): Promise<LobbyListItem[]> {
    try {
      const response = await fetch(`${API_URL}/lobbies`);
      return await response.json();
    } catch (error) {
      console.error('[Multiplayer] Failed to fetch lobbies:', error);
      return [];
    }
  }

  /**
   * Send game state update during battle
   */
  broadcastGameState(state: any): void {
    if (!this.currentLobby) return;
    if (this.currentLobby.status !== 'in_progress') return;

    this.send({
      type: 'game_state_update',
      code: this.currentLobby.code,
      state,
    });
  }

  /**
   * Send game command during battle (for lockstep multiplayer)
   */
  sendGameCommand(serializedCommand: string): void {
    if (!this.currentLobby) return;
    if (this.currentLobby.status !== 'in_progress') return;

    this.send({
      type: 'game_command',
      code: this.currentLobby.code,
      command: serializedCommand,
    });
  }

  /**
   * Handle incoming messages from server
   */
  private handleMessage(message: any): void {
    console.log('[Multiplayer] Received:', message.type);

    switch (message.type) {
      case 'lobby_created':
        this.currentLobby = message.lobby;
        if (this.onLobbyCreated) {
          this.onLobbyCreated(message.lobby);
        }
        break;

      case 'lobby_joined':
        this.currentLobby = message.lobby;
        if (this.onLobbyJoined) {
          this.onLobbyJoined(message.lobby);
        }
        break;

      case 'player_joined':
        if (this.onPlayerJoined) {
          this.onPlayerJoined(message.player);
        }
        break;

      case 'player_left':
        if (this.onPlayerLeft) {
          this.onPlayerLeft(message.playerId);
        }
        break;

      case 'player_updated':
        if (this.onPlayerUpdated) {
          this.onPlayerUpdated(message.playerId, message.updates);
        }
        break;

      case 'game_starting':
        if (this.onGameStarting) {
          this.onGameStarting(message.mapSeed, message.mapSize);
        }
        break;

      case 'kicked':
        this.currentLobby = null;
        if (this.onKicked) {
          this.onKicked();
        }
        break;

      case 'error':
        console.error('[Multiplayer] Server error:', message.error);
        if (this.onError) {
          this.onError(message.error || 'Unknown error');
        }
        break;

      case 'game_state':
        // Handle game state synchronization during battle
        if (this.onGameState) {
          this.onGameState(message.state);
        }
        break;

      case 'tick_update':
        if (this.onTickUpdate) {
          this.onTickUpdate(message.tick, message.commands, message.checksum);
        }
        break;

      case 'state_snapshot':
        if (this.onStateSnapshot) {
          this.onStateSnapshot(message);
        }
        break;

      case 'phase_change':
        if (this.onPhaseChange) {
          this.onPhaseChange(message.phase, message);
        }
        break;

      case 'game_event':
        if (this.onGameEvent) {
          this.onGameEvent(message.eventType, message);
        }
        break;

      case 'player_disconnected':
        console.log(`[Multiplayer] Player disconnected: ${message.playerId}`);
        // Handle disconnection visually
        break;

      case 'player_reconnected':
        console.log(`[Multiplayer] Player reconnected: ${message.playerId}`);
        // Handle reconnection visually
        break;
    }
  }

  /**
   * Send message to server
   */
  private send(data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Multiplayer] Cannot send - not connected');
      return;
    }

    this.ws.send(JSON.stringify(data));
  }

  /**
   * Register callbacks for multiplayer events
   */
  on(event: string, callback: any): void {
    switch (event) {
      case 'lobby_created':
        this.onLobbyCreated = callback;
        break;
      case 'lobby_joined':
        this.onLobbyJoined = callback;
        break;
      case 'player_joined':
        this.onPlayerJoined = callback;
        break;
      case 'player_left':
        this.onPlayerLeft = callback;
        break;
      case 'player_updated':
        this.onPlayerUpdated = callback;
        break;
      case 'game_starting':
        this.onGameStarting = callback;
        break;
      case 'game_state':
        this.onGameState = callback;
        break;
      case 'kicked':
        this.onKicked = callback;
        break;
      case 'error':
        this.onError = callback;
        break;
      case 'tick_update':
        this.onTickUpdate = callback;
        break;
      case 'state_snapshot':
        this.onStateSnapshot = callback;
        break;
      case 'phase_change':
        this.onPhaseChange = callback;
        break;
      case 'game_event':
        this.onGameEvent = callback;
        break;
    }
  }

  /**
   * Get current lobby
   */
  getCurrentLobby(): MultiplayerLobby | null {
    return this.currentLobby;
  }

  /**
   * Check if player is host
   */
  isHost(): boolean {
    return this.currentLobby?.hostId === this.playerId;
  }

  /**
   * Get current player ID
   */
  getPlayerId(): string {
    return this.playerId;
  }
}
