/**
 * Multiplayer WebSocket Server for Stellar Siege
 *
 * Handles:
 * - Lobby creation and management
 * - Game code generation (XXXX-NNNN format)
 * - Player connections and state sync
 * - Game state synchronization during battle
 * - Reconnection support (30 second window)
 */

interface Player {
  id: string;
  name: string;
  team: 'team1' | 'team2' | 'spectator';
  deckId: string | null;
  isReady: boolean;
  isHost: boolean;
  connectionId: string;
  lastSeen: number;
}

interface GameLobby {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  maxPlayers: number;
  mapSize: 'small' | 'medium' | 'large';
  mapSeed: number;
  status: 'waiting' | 'in_progress' | 'finished';
  createdAt: number;
}

class MultiplayerServer {
  private lobbies: Map<string, GameLobby> = new Map();
  private playerConnections: Map<string, any> = new Map(); // connectionId -> ws
  private reconnectWindows: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.startCleanupTask();
  }

  /**
   * Generate a unique game code in XXXX-NNNN format
   */
  generateGameCode(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';

    let code: string;
    do {
      const letterPart = Array.from({ length: 4 }, () =>
        letters[Math.floor(Math.random() * letters.length)]
      ).join('');

      const numberPart = Array.from({ length: 4 }, () =>
        numbers[Math.floor(Math.random() * numbers.length)]
      ).join('');

      code = `${letterPart}-${numberPart}`;
    } while (this.lobbies.has(code));

    return code;
  }

  /**
   * Create a new game lobby
   */
  createLobby(hostId: string, hostName: string, mapSize: 'small' | 'medium' | 'large'): { success: boolean; error?: string; lobby?: GameLobby } {
    // Validate player name
    const validation = this.validatePlayerName(hostName);
    if (!validation.valid) {
      return { success: false, error: `Invalid player name: ${validation.error}` };
    }

    const code = this.generateGameCode();
    const connectionId = this.getConnectionIdForPlayer(hostId);

    const lobby: GameLobby = {
      code,
      hostId,
      players: new Map(),
      maxPlayers: 10, // 5v5
      mapSize,
      mapSeed: Math.floor(Math.random() * 1000000),
      status: 'waiting',
      createdAt: Date.now(),
    };

    const hostPlayer: Player = {
      id: hostId,
      name: hostName,
      team: 'team1',
      deckId: null,
      isReady: false,
      isHost: true,
      connectionId,
      lastSeen: Date.now(),
    };

    lobby.players.set(hostId, hostPlayer);
    this.lobbies.set(code, lobby);

    console.log(`[Lobby Created] ${code} by ${hostName}`);
    return { success: true, lobby };
  }

  /**
   * Join an existing lobby
   */
  joinLobby(code: string, playerId: string, playerName: string): { success: boolean; error?: string; lobby?: GameLobby } {
    // Validate player name
    const validation = this.validatePlayerName(playerName);
    if (!validation.valid) {
      return { success: false, error: `Invalid player name: ${validation.error}` };
    }

    const lobby = this.lobbies.get(code);

    if (!lobby) {
      return { success: false, error: 'Lobby not found' };
    }

    if (lobby.status !== 'waiting') {
      return { success: false, error: 'Game already in progress' };
    }

    if (lobby.players.size >= lobby.maxPlayers) {
      return { success: false, error: 'Lobby is full' };
    }

    const connectionId = this.getConnectionIdForPlayer(playerId);

    const player: Player = {
      id: playerId,
      name: playerName,
      team: 'team1', // Default team, can be changed in lobby
      deckId: null,
      isReady: false,
      isHost: false,
      connectionId,
      lastSeen: Date.now(),
    };

    lobby.players.set(playerId, player);

    console.log(`[Player Joined] ${playerName} joined ${code}`);
    this.broadcastToLobby(code, {
      type: 'player_joined',
      player: this.serializePlayer(player),
    });

    return { success: true, lobby };
  }

  /**
   * Leave a lobby
   */
  leaveLobby(code: string, playerId: string): void {
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    lobby.players.delete(playerId);

    // If host left, assign new host or close lobby
    if (lobby.hostId === playerId) {
      const remainingPlayers = Array.from(lobby.players.values());
      if (remainingPlayers.length > 0) {
        const newHost = remainingPlayers[0];
        lobby.hostId = newHost.id;
        newHost.isHost = true;
        console.log(`[Host Changed] ${newHost.name} is new host of ${code}`);
      } else {
        // No players left, close lobby
        this.lobbies.delete(code);
        console.log(`[Lobby Closed] ${code} - no players remaining`);
        return;
      }
    }

    this.broadcastToLobby(code, {
      type: 'player_left',
      playerId,
    });
  }

  /**
   * Update player state in lobby
   */
  updatePlayerState(code: string, playerId: string, updates: Partial<Pick<Player, 'team' | 'deckId' | 'isReady'>>): void {
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    const player = lobby.players.get(playerId);
    if (!player) return;

    Object.assign(player, updates);
    player.lastSeen = Date.now();

    this.broadcastToLobby(code, {
      type: 'player_updated',
      playerId,
      updates,
    });
  }

  /**
   * Kick a player (host only)
   */
  kickPlayer(code: string, hostId: string, targetPlayerId: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(code);
    if (!lobby) return { success: false, error: 'Lobby not found' };
    if (lobby.hostId !== hostId) return { success: false, error: 'Only host can kick players' };
    if (targetPlayerId === hostId) return { success: false, error: 'Cannot kick yourself' };

    this.leaveLobby(code, targetPlayerId);

    // Notify kicked player
    const ws = this.getConnectionForPlayer(targetPlayerId);
    if (ws) {
      ws.send(JSON.stringify({ type: 'kicked' }));
    }

    return { success: true };
  }

  /**
   * Start the game (host only)
   */
  startGame(code: string, hostId: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(code);
    if (!lobby) return { success: false, error: 'Lobby not found' };
    if (lobby.hostId !== hostId) return { success: false, error: 'Only host can start game' };

    // Check if at least one player per team is ready
    const team1Ready = Array.from(lobby.players.values()).some(p => p.team === 'team1' && p.isReady);
    const team2Ready = Array.from(lobby.players.values()).some(p => p.team === 'team2' && p.isReady);

    if (!team1Ready || !team2Ready) {
      return { success: false, error: 'Need at least 1 ready player per team' };
    }

    lobby.status = 'in_progress';

    this.broadcastToLobby(code, {
      type: 'game_starting',
      mapSeed: lobby.mapSeed,
      mapSize: lobby.mapSize,
    });

    console.log(`[Game Started] ${code}`);
    return { success: true };
  }

  /**
   * Get all open lobbies
   */
  getOpenLobbies(): any[] {
    return Array.from(this.lobbies.values())
      .filter(lobby => lobby.status === 'waiting')
      .map(lobby => ({
        code: lobby.code,
        host: Array.from(lobby.players.values()).find(p => p.isHost)?.name || 'Unknown',
        mapSize: lobby.mapSize,
        playerCount: lobby.players.size,
        maxPlayers: lobby.maxPlayers,
        status: lobby.status,
      }));
  }

  /**
   * Handle player disconnect with reconnection window
   */
  handleDisconnect(playerId: string): void {
    console.log(`[Disconnect] Player ${playerId}`);

    // Find lobbies this player is in
    for (const [code, lobby] of this.lobbies) {
      const player = lobby.players.get(playerId);
      if (!player) continue;

      // Start 30 second reconnection window
      const timeoutId = setTimeout(() => {
        console.log(`[Timeout] Player ${playerId} did not reconnect to ${code}`);

        if (lobby.status === 'in_progress') {
          // Convert to CPU
          this.broadcastToLobby(code, {
            type: 'player_disconnected',
            playerId,
            replacedWithCPU: true,
          });
        } else {
          // Remove from lobby
          this.leaveLobby(code, playerId);
        }

        this.reconnectWindows.delete(playerId);
      }, 30000);

      this.reconnectWindows.set(playerId, timeoutId);

      this.broadcastToLobby(code, {
        type: 'player_disconnected',
        playerId,
        reconnectWindow: 30,
      });
    }
  }

  /**
   * Handle player reconnection
   */
  handleReconnect(playerId: string, connectionId: string): void {
    const timeout = this.reconnectWindows.get(playerId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectWindows.delete(playerId);
      console.log(`[Reconnect] Player ${playerId} reconnected`);
    }

    // Update connection ID
    for (const lobby of this.lobbies.values()) {
      const player = lobby.players.get(playerId);
      if (player) {
        player.connectionId = connectionId;
        player.lastSeen = Date.now();

        this.broadcastToLobby(lobby.code, {
          type: 'player_reconnected',
          playerId,
        });
      }
    }
  }

  /**
   * Broadcast game state update during battle
   */
  broadcastGameState(code: string, state: any): void {
    this.broadcastToLobby(code, {
      type: 'game_state',
      state,
    });
  }

  /**
   * Handle incoming game command and broadcast to all players
   * Returns true if command was valid and broadcast
   */
  handleGameCommand(code: string, playerId: string, command: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(code);
    if (!lobby) return { success: false, error: 'Lobby not found' };
    if (lobby.status !== 'in_progress') return { success: false, error: 'Game not in progress' };

    // Parse and validate command
    let cmd: any;
    try {
      cmd = JSON.parse(command);
    } catch {
      return { success: false, error: 'Invalid command format' };
    }

    // Validate command structure
    if (!this.validateCommand(lobby, playerId, cmd)) {
      return { success: false, error: 'Command validation failed' };
    }

    // Broadcast to all players in lobby
    this.broadcastToLobby(code, {
      type: 'game_command',
      playerId,
      command,
    });

    return { success: true };
  }

  /**
   * Validate a player name for security
   * Checks: length (1-64 chars), rejects HTML tags, rejects script keywords,
   * allows alphanumeric + basic punctuation only
   */
  private validatePlayerName(name: string): { valid: boolean; error?: string } {
    // Check if name exists
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Player name is required' };
    }

    // Trim whitespace
    const trimmedName = name.trim();

    // Check length (1-64 characters)
    if (trimmedName.length < 1) {
      return { valid: false, error: 'Player name cannot be empty' };
    }
    if (trimmedName.length > 64) {
      return { valid: false, error: 'Player name must be 64 characters or less' };
    }

    // Reject HTML tags (< and > characters)
    if (trimmedName.includes('<') || trimmedName.includes('>')) {
      return { valid: false, error: 'Player name cannot contain HTML tags' };
    }

    // Reject script keywords (case-insensitive)
    const dangerousKeywords = ['script', 'javascript:', 'onerror', 'onload', 'onclick', 'onmouseover', 'svg', 'iframe', 'embed', 'object'];
    const lowerName = trimmedName.toLowerCase();
    for (const keyword of dangerousKeywords) {
      if (lowerName.includes(keyword)) {
        return { valid: false, error: 'Player name contains prohibited keywords' };
      }
    }

    // Allow only alphanumeric + basic punctuation (spaces, hyphens, underscores, periods, apostrophes)
    // This regex matches strings that contain ONLY allowed characters
    const allowedPattern = /^[a-zA-Z0-9\s\-_.'\u0080-\uFFFF]+$/;
    if (!allowedPattern.test(trimmedName)) {
      return { valid: false, error: 'Player name contains invalid characters. Use letters, numbers, spaces, hyphens, underscores, periods, or apostrophes only' };
    }

    // Name is valid
    return { valid: true };
  }

  /**
   * Validate a game command
   * Checks: player exists, command structure valid, tick is reasonable
   */
  private validateCommand(lobby: GameLobby, playerId: string, cmd: any): boolean {
    // Check player is in the lobby
    if (!lobby.players.has(playerId)) {
      console.log(`[Command Rejected] Player ${playerId} not in lobby`);
      return false;
    }

    // Check basic command structure
    if (typeof cmd.type !== 'number' || typeof cmd.tick !== 'number') {
      console.log(`[Command Rejected] Invalid command structure`);
      return false;
    }

    // Check command type is valid (1-13 based on CommandType enum)
    if (cmd.type < 1 || cmd.type > 13) {
      console.log(`[Command Rejected] Invalid command type ${cmd.type}`);
      return false;
    }

    // Check unitIds is an array
    if (!Array.isArray(cmd.unitIds)) {
      console.log(`[Command Rejected] unitIds must be array`);
      return false;
    }

    // Command is valid
    return true;
  }

  /**
   * Broadcast message to all players in a lobby
   */
  private broadcastToLobby(code: string, message: any): void {
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    const messageStr = JSON.stringify(message);

    for (const player of lobby.players.values()) {
      const ws = this.playerConnections.get(player.connectionId);
      if (ws && ws.readyState === 1) { // OPEN
        ws.send(messageStr);
      }
    }
  }

  /**
   * Helper to get connection for player
   */
  private getConnectionForPlayer(playerId: string): any {
    for (const lobby of this.lobbies.values()) {
      const player = lobby.players.get(playerId);
      if (player) {
        return this.playerConnections.get(player.connectionId);
      }
    }
    return null;
  }

  /**
   * Helper to get connection ID for player
   */
  private getConnectionIdForPlayer(playerId: string): string {
    // In a real implementation, this would come from the WebSocket connection
    // For now, return a placeholder
    return `conn_${playerId}_${Date.now()}`;
  }

  /**
   * Serialize player for sending over network
   */
  private serializePlayer(player: Player): any {
    return {
      id: player.id,
      name: player.name,
      team: player.team,
      deckId: player.deckId,
      isReady: player.isReady,
      isHost: player.isHost,
    };
  }

  /**
   * Periodic cleanup of stale lobbies
   */
  private startCleanupTask(): void {
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 3600000; // 1 hour

      for (const [code, lobby] of this.lobbies) {
        if (lobby.status === 'waiting' && now - lobby.createdAt > staleThreshold) {
          console.log(`[Cleanup] Removing stale lobby ${code}`);
          this.lobbies.delete(code);
        }
      }
    }, 300000); // Check every 5 minutes
  }

  /**
   * Register a WebSocket connection
   */
  registerConnection(connectionId: string, ws: any): void {
    this.playerConnections.set(connectionId, ws);
  }

  /**
   * Unregister a WebSocket connection
   */
  unregisterConnection(connectionId: string): void {
    this.playerConnections.delete(connectionId);
  }
}

// Create server instance
const server = new MultiplayerServer();

// Start Bun WebSocket server
const PORT = process.env.PORT || 3001;

Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade to WebSocket
    if (server.upgrade(req)) {
      return; // WebSocket connection established
    }

    // Handle HTTP endpoints for lobby browsing
    const url = new URL(req.url);

    if (url.pathname === '/lobbies') {
      const lobbies = server.data.getOpenLobbies();
      return new Response(JSON.stringify(lobbies), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Stellar Siege Multiplayer Server', { status: 200 });
  },
  websocket: {
    open(ws) {
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      ws.data = { connectionId };
      server.data.registerConnection(connectionId, ws);
      console.log(`[Connection] ${connectionId}`);
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message as string);
        const { connectionId } = ws.data;

        // Handle different message types
        switch (data.type) {
          case 'create_lobby':
            {
              const result = server.data.createLobby(data.playerId, data.playerName, data.mapSize);
              if (result.success && result.lobby) {
                ws.send(JSON.stringify({
                  type: 'lobby_created',
                  code: result.lobby.code,
                  lobby: {
                    ...result.lobby,
                    players: Array.from(result.lobby.players.values()),
                  },
                }));
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  error: result.error,
                }));
              }
            }
            break;

          case 'join_lobby':
            {
              const result = server.data.joinLobby(data.code, data.playerId, data.playerName);
              ws.send(JSON.stringify({
                type: result.success ? 'lobby_joined' : 'error',
                ...result,
              }));
            }
            break;

          case 'leave_lobby':
            server.data.leaveLobby(data.code, data.playerId);
            break;

          case 'update_state':
            server.data.updatePlayerState(data.code, data.playerId, data.updates);
            break;

          case 'kick_player':
            {
              const result = server.data.kickPlayer(data.code, data.hostId, data.targetPlayerId);
              ws.send(JSON.stringify({
                type: result.success ? 'kick_success' : 'error',
                ...result,
              }));
            }
            break;

          case 'start_game':
            {
              const result = server.data.startGame(data.code, data.hostId);
              ws.send(JSON.stringify({
                type: result.success ? 'start_success' : 'error',
                ...result,
              }));
            }
            break;

          case 'game_state_update':
            server.data.broadcastGameState(data.code, data.state);
            break;

          case 'game_command':
            {
              const result = server.data.handleGameCommand(data.code, data.playerId, data.command);
              if (!result.success) {
                ws.send(JSON.stringify({
                  type: 'command_rejected',
                  reason: result.error,
                }));
              }
            }
            break;

          case 'reconnect':
            server.data.handleReconnect(data.playerId, connectionId);
            break;
        }
      } catch (error) {
        console.error('[Message Error]', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    },
    close(ws) {
      const { connectionId } = ws.data;
      console.log(`[Close] ${connectionId}`);

      // Find player by connection and handle disconnect
      for (const lobby of server.data.lobbies.values()) {
        for (const player of lobby.players.values()) {
          if (player.connectionId === connectionId) {
            server.data.handleDisconnect(player.id);
            break;
          }
        }
      }

      server.data.unregisterConnection(connectionId);
    },
  },
  data: { server } as any,
});

console.log(`\n🚀 Stellar Siege Multiplayer Server running on ws://localhost:${PORT}`);
console.log(`📡 Lobby browser available at http://localhost:${PORT}/lobbies\n`);
