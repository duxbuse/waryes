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

import { RateLimiter } from './RateLimiter';
import { createAuthRouter } from './routes/auth';
import { handleDeckRoute } from './routes/decks';
import { handleMatchRoute } from './routes/matches';
import { GameSessionManager } from './game/GameSessionManager';
import { loadGameData } from './game/ServerDataLoader';
import type { SessionPlayer } from './game/GameSession';
import { logger } from './logger';
import { RedisCoordinator } from './RedisCoordinator';
import { verifyToken } from './auth/jwt';

interface WsData {
  connectionId: string;
  playerId: string | null;
  username: string | null;
  wsPlayerId?: string | null;
  wsUsername?: string | null;
}

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
  readonly lobbies: Map<string, GameLobby> = new Map();
  private playerConnections: Map<string, any> = new Map(); // connectionId -> ws
  private reconnectWindows: Map<string, NodeJS.Timeout> = new Map();

  // Authoritative game sessions
  readonly sessionManager = new GameSessionManager();

  // Redis-based coordination for horizontal scaling
  readonly coordinator: RedisCoordinator;

  // Rate limiters for different message types
  private rateLimitGameCommand: RateLimiter;
  private rateLimitUpdateState: RateLimiter;
  private rateLimitLobbyActions: RateLimiter;
  private rateLimitHostActions: RateLimiter;

  constructor() {
    // Initialize rate limiters with different limits per message type
    this.rateLimitGameCommand = new RateLimiter(60, 60000); // 60 commands per minute
    this.rateLimitUpdateState = new RateLimiter(30, 60000); // 30 updates per minute
    this.rateLimitLobbyActions = new RateLimiter(10, 60000); // 10 lobby actions per minute
    this.rateLimitHostActions = new RateLimiter(5, 60000); // 5 host actions per minute

    const maxGames = parseInt(process.env['MAX_CONCURRENT_GAMES'] ?? '20', 10);
    this.coordinator = new RedisCoordinator(parseInt(process.env['PORT'] ?? '3001', 10), maxGames);

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
        const newHost = remainingPlayers[0]!;
        lobby.hostId = newHost.id;
        newHost.isHost = true;
        console.log(`[Host Changed] ${newHost.name} is new host of ${code}`);
      } else {
        // No players left, close lobby and destroy game session
        this.lobbies.delete(code);
        this.sessionManager.destroySession(code);
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

    // Only update allowed fields (prevent prototype pollution / privilege escalation)
    if (updates.team !== undefined && (updates.team === 'team1' || updates.team === 'team2' || updates.team === 'spectator')) {
      player.team = updates.team;
    }
    if (updates.deckId !== undefined) {
      player.deckId = typeof updates.deckId === 'string' ? updates.deckId : null;
    }
    if (updates.isReady !== undefined && typeof updates.isReady === 'boolean') {
      player.isReady = updates.isReady;
    }
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

    // Check server capacity
    if (!this.sessionManager.hasCapacity()) {
      return { success: false, error: 'Server is at maximum game capacity' };
    }

    lobby.status = 'in_progress';

    // Create authoritative game session
    const sessionPlayers: SessionPlayer[] = Array.from(lobby.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      team: (p.team === 'team1' ? 'player' : 'enemy') as 'player' | 'enemy',
      deckId: p.deckId,
      ws: this.playerConnections.get(p.connectionId),
      connected: true,
      lastSeen: Date.now(),
    }));

    const session = this.sessionManager.createSession({
      lobbyCode: code,
      mapSeed: lobby.mapSeed,
      mapSize: lobby.mapSize,
      players: sessionPlayers,
    });

    if (!session) {
      lobby.status = 'waiting';
      return { success: false, error: 'Failed to create game session' };
    }

    this.broadcastToLobby(code, {
      type: 'game_starting',
      mapSeed: lobby.mapSeed,
      mapSize: lobby.mapSize,
    });

    // Note: Map generation and session.startGame(map) will be called
    // once the shared map generator is available. For now the session
    // is created but awaits a map to begin the authoritative tick loop.

    console.log(`[Game Started] ${code} (authoritative session created)`);
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

      // Notify game session of disconnect
      const session = this.sessionManager.getSession(code);
      if (session) {
        session.handleDisconnect(playerId);
      }

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

        // Reconnect to game session
        const ws = this.playerConnections.get(connectionId);
        const session = this.sessionManager.getSession(lobby.code);
        if (session && ws) {
          session.handleReconnect(playerId, ws);
        }

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

    // Route through authoritative game session if available
    const session = this.sessionManager.getSession(code);
    if (session) {
      const accepted = session.handleCommand(playerId, cmd);
      if (!accepted) {
        return { success: false, error: 'Command rejected by authoritative server' };
      }
      // The AuthoritativeGame broadcasts tick updates itself
      return { success: true };
    }

    // Fallback: relay mode (no authoritative session)
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

    // Allow only ASCII alphanumeric + basic punctuation (spaces, hyphens, underscores, periods, apostrophes)
    // Excludes Unicode to prevent homoglyph attacks (e.g., Cyrillic 'а' posing as Latin 'a')
    const allowedPattern = /^[a-zA-Z0-9\s\-_.']+$/;
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
    const commandPlayer = lobby.players.get(playerId);
    if (!commandPlayer) {
      logger.warn({ playerId }, 'Command rejected: player not in lobby');
      return false;
    }

    // Spectators cannot send game commands
    if (commandPlayer.team === 'spectator') {
      logger.warn({ playerId }, 'Command rejected: spectators cannot send commands');
      return false;
    }

    // Check basic command structure
    if (typeof cmd.type !== 'number' || typeof cmd.tick !== 'number') {
      console.log(`[Command Rejected] Invalid command structure`);
      return false;
    }

    // Check command type is valid (1-14 based on CommandType enum, includes QueueReinforcement=14)
    if (cmd.type < 1 || cmd.type > 14) {
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
          this.sessionManager.destroySession(code);
        }
      }
    }, 300000); // Check every 5 minutes
  }

  /**
   * Check rate limit for a connection and message type
   * @returns true if allowed, false if rate limited
   */
  checkRateLimit(connectionId: string, messageType: string): boolean {
    switch (messageType) {
      case 'game_command':
        return this.rateLimitGameCommand.tryConsume(connectionId);

      case 'update_state':
      case 'game_state_update':
        return this.rateLimitUpdateState.tryConsume(connectionId);

      case 'create_lobby':
      case 'join_lobby':
      case 'leave_lobby':
        return this.rateLimitLobbyActions.tryConsume(connectionId);

      case 'kick_player':
      case 'start_game':
        return this.rateLimitHostActions.tryConsume(connectionId);

      case 'reconnect':
        // Don't rate limit reconnection attempts
        return true;

      default:
        // Unknown message types use lobby action limit as default
        return this.rateLimitLobbyActions.tryConsume(connectionId);
    }
  }

  /**
   * Get retry-after time for a connection and message type
   * @returns milliseconds to wait before retrying
   */
  getRetryAfter(connectionId: string, messageType: string): number {
    switch (messageType) {
      case 'game_command':
        return this.rateLimitGameCommand.getRetryAfter(connectionId);

      case 'update_state':
      case 'game_state_update':
        return this.rateLimitUpdateState.getRetryAfter(connectionId);

      case 'create_lobby':
      case 'join_lobby':
      case 'leave_lobby':
        return this.rateLimitLobbyActions.getRetryAfter(connectionId);

      case 'kick_player':
      case 'start_game':
        return this.rateLimitHostActions.getRetryAfter(connectionId);

      case 'reconnect':
        return 0;

      default:
        return this.rateLimitLobbyActions.getRetryAfter(connectionId);
    }
  }

  /**
   * Clear rate limit data for a connection (called on disconnect)
   */
  clearRateLimits(connectionId: string): void {
    this.rateLimitGameCommand.clear(connectionId);
    this.rateLimitUpdateState.clear(connectionId);
    this.rateLimitLobbyActions.clear(connectionId);
    this.rateLimitHostActions.clear(connectionId);
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
    this.clearRateLimits(connectionId);
  }
}

// Create server instance
const mpServer = new MultiplayerServer();

// Load game data (units, weapons, divisions) for authoritative simulation
await loadGameData();

// Auth rate limiter (separate from WS rate limiters)
const authRateLimiter = new RateLimiter(5, 60000); // 5 per minute default
const handleAuthRoute = createAuthRouter(authRateLimiter);

// CORS headers for all API responses
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Track active WebSocket connections for connection limiting
let activeConnectionCount = 0;
const MAX_CONNECTIONS = parseInt(process.env.MAX_WS_CONNECTIONS ?? '500', 10);

// Start Bun WebSocket server
const PORT = process.env.PORT || 3001;

Bun.serve<WsData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Upgrade to WebSocket for /ws path or if upgrade header present
    if (req.headers.get('upgrade') === 'websocket') {
      // Validate origin to prevent Cross-Site WebSocket Hijacking
      const origin = req.headers.get('origin');
      if (origin && origin !== ALLOWED_ORIGIN) {
        logger.warn({ origin }, 'WebSocket upgrade rejected: invalid origin');
        return new Response('Forbidden', { status: 403 });
      }

      // Connection limit to prevent resource exhaustion
      if (activeConnectionCount >= MAX_CONNECTIONS) {
        logger.warn({ count: activeConnectionCount }, 'WebSocket upgrade rejected: max connections reached');
        return new Response('Service Unavailable', { status: 503 });
      }

      // Authenticate WebSocket connection via JWT in query param
      const token = url.searchParams.get('token');
      let wsPlayerId: string | null = null;
      let wsUsername: string | null = null;
      if (token) {
        try {
          const payload = await verifyToken(token);
          if (payload.type === 'access' && payload.sub) {
            wsPlayerId = payload.sub;
            wsUsername = payload.username;
          }
        } catch {
          logger.warn('WebSocket upgrade rejected: invalid JWT');
          return new Response('Unauthorized', { status: 401 });
        }
      }
      // If no token provided, allow anonymous connection (for backward compat)
      // but authenticated users get their verified identity bound to the socket

      if (server.upgrade(req, { data: { wsPlayerId, wsUsername } as unknown as WsData })) {
        return; // WebSocket connection established
      }
    }

    // Health check - minimal public info only
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // REST API routes
    try {
      if (url.pathname.startsWith('/api/auth/')) {
        return await handleAuthRoute(req, url.pathname);
      }

      if (url.pathname.startsWith('/api/decks')) {
        return await handleDeckRoute(req, url.pathname);
      }

      if (url.pathname.startsWith('/api/matches')) {
        return await handleMatchRoute(req, url.pathname);
      }

      // Legacy lobby browser endpoint
      if (url.pathname === '/lobbies') {
        const lobbies = mpServer.getOpenLobbies();
        return new Response(JSON.stringify(lobbies), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'API request error');
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
  websocket: {
    maxPayloadLength: 65536, // 64KB max message size
    open(ws) {
      const connectionId = crypto.randomUUID();
      const { wsPlayerId, wsUsername } = ws.data ?? {};
      ws.data = { connectionId, playerId: wsPlayerId ?? null, username: wsUsername ?? null };
      mpServer.registerConnection(connectionId, ws);
      activeConnectionCount++;
      logger.info({ connectionId, authenticated: !!wsPlayerId }, 'WebSocket connection opened');
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message as string);
        const { connectionId } = ws.data;

        // Check rate limit before processing message
        if (!mpServer.checkRateLimit(connectionId, data.type)) {
          const retryAfter = mpServer.getRetryAfter(connectionId, data.type);
          ws.send(JSON.stringify({
            type: 'rate_limit_exceeded',
            messageType: data.type,
            retryAfter,
          }));
          return;
        }

        // Handle different message types
        switch (data.type) {
          case 'create_lobby':
            {
              const result = mpServer.createLobby(data.playerId, data.playerName, data.mapSize);
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
              const result = mpServer.joinLobby(data.code, data.playerId, data.playerName);
              ws.send(JSON.stringify({
                type: result.success ? 'lobby_joined' : 'error',
                ...result,
              }));
            }
            break;

          case 'leave_lobby':
            mpServer.leaveLobby(data.code, data.playerId);
            break;

          case 'update_state':
            mpServer.updatePlayerState(data.code, data.playerId, data.updates);
            break;

          case 'kick_player':
            {
              const result = mpServer.kickPlayer(data.code, data.hostId, data.targetPlayerId);
              ws.send(JSON.stringify({
                type: result.success ? 'kick_success' : 'error',
                ...result,
              }));
            }
            break;

          case 'start_game':
            {
              const result = mpServer.startGame(data.code, data.hostId);
              ws.send(JSON.stringify({
                type: result.success ? 'start_success' : 'error',
                ...result,
              }));
            }
            break;

          // game_state_update removed: authoritative server handles state broadcasts
          case 'game_command':
            {
              const result = mpServer.handleGameCommand(data.code, data.playerId, data.command);
              if (!result.success) {
                ws.send(JSON.stringify({
                  type: 'command_rejected',
                  reason: result.error,
                }));
              }
            }
            break;

          case 'reconnect':
            mpServer.handleReconnect(data.playerId, connectionId);
            break;
        }
      } catch (error) {
        logger.error({ err: error }, 'WebSocket message handling error');
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    },
    close(ws) {
      const { connectionId } = ws.data;
      activeConnectionCount = Math.max(0, activeConnectionCount - 1);
      logger.info({ connectionId }, 'WebSocket connection closed');

      // Find player by connection and handle disconnect
      for (const lobby of mpServer.lobbies.values()) {
        for (const player of lobby.players.values()) {
          if (player.connectionId === connectionId) {
            mpServer.handleDisconnect(player.id);
            break;
          }
        }
      }

      mpServer.unregisterConnection(connectionId);
    },
  },
});

logger.info({ port: PORT }, 'Stellar Siege Multiplayer Server started');
logger.info(`Lobby browser at http://localhost:${PORT}/lobbies`);
logger.info(`Auth API at http://localhost:${PORT}/api/auth/`);
logger.info(`Deck API at http://localhost:${PORT}/api/decks/`);
logger.info(`Match API at http://localhost:${PORT}/api/matches/`);
logger.info(`Health check at http://localhost:${PORT}/health`);

// Connect Redis coordinator for multi-instance coordination
mpServer.coordinator
  .connect(() => mpServer.sessionManager.getLoadInfo())
  .catch(err => logger.warn({ err }, 'Redis coordinator startup failed (non-fatal)'));

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down...');
  mpServer.sessionManager.dispose();
  await mpServer.coordinator.dispose();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
