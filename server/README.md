# Stellar Siege Multiplayer Server

WebSocket server for Stellar Siege multiplayer functionality.

## Requirements

- Bun (https://bun.sh)

## Quick Start

```bash
# From the server directory
bun start

# Or with auto-reload during development
bun dev
```

The server will start on `ws://localhost:3001`

## Features

- Game code generation (XXXX-NNNN format)
- Lobby creation and management
- Real-time player synchronization
- 30-second reconnection window
- Host privileges (kick players, start game)
- HTTP endpoint for lobby browsing: `http://localhost:3001/lobbies`
- Rate limiting protection against message floods

## Environment Variables

- `PORT` - Server port (default: 3001)

## Architecture

### WebSocket Messages

**Client → Server:**
- `create_lobby` - Create a new game lobby
- `join_lobby` - Join existing lobby by code
- `leave_lobby` - Leave current lobby
- `update_state` - Update player state (team, deck, ready)
- `kick_player` - Kick a player (host only)
- `start_game` - Start the game (host only)
- `reconnect` - Reconnect after disconnect
- `game_state_update` - Broadcast game state during battle

**Server → Client:**
- `lobby_created` - Lobby creation confirmed
- `lobby_joined` - Successfully joined lobby
- `player_joined` - Another player joined
- `player_left` - Player left lobby
- `player_updated` - Player state changed
- `game_starting` - Game is starting
- `kicked` - You were kicked
- `error` - Error occurred
- `player_disconnected` - Player disconnected
- `player_reconnected` - Player reconnected
- `rate_limit_exceeded` - Message rate limit exceeded

### Rate Limiting

The server implements per-connection rate limiting using a token bucket algorithm to protect against message floods and denial-of-service attacks.

**Rate Limits by Message Type:**

| Message Type | Limit | Time Window |
|--------------|-------|-------------|
| `game_command` | 60 messages | per minute |
| `update_state`, `game_state_update` | 30 messages | per minute |
| `create_lobby`, `join_lobby`, `leave_lobby` | 10 messages | per minute |
| `kick_player`, `start_game` | 5 messages | per minute |
| `reconnect` | unlimited | (not rate limited) |

**Rate Limit Exceeded Response:**

When a client exceeds the rate limit, the server responds with:

```json
{
  "type": "rate_limit_exceeded",
  "messageType": "game_command",
  "retryAfter": 1000
}
```

- `messageType`: The type of message that was rate limited
- `retryAfter`: Milliseconds to wait before retrying (when next token available)

**Implementation Details:**

- Rate limits are enforced per WebSocket connection
- Token bucket algorithm allows bursts while maintaining average rate
- Rate limit state is automatically cleaned up when connection closes
- Reconnection attempts are never rate limited to allow quick recovery

**Adjusting Rate Limits:**

To modify rate limits, edit the `RateLimiter` constructor calls in `server.ts`:

```typescript
// Example: Increase game command limit to 120 per minute
this.rateLimitGameCommand = new RateLimiter(120, 60000);
```

Parameters: `new RateLimiter(capacity, windowMs)`
- `capacity`: Maximum tokens (messages allowed per window)
- `windowMs`: Time window in milliseconds

## Testing

Start the server and connect from the game client:

1. Start server: `bun start`
2. Start game client: `cd ../web && bun run dev`
3. Click "JOIN GAME" or create lobby from Skirmish Setup

## Troubleshooting

**Server won't start:**
- Check if port 3001 is already in use
- Ensure Bun is installed: `bun --version`

**Clients can't connect:**
- Verify server is running on correct port
- Check firewall settings
- Ensure WebSocket URL in client matches server address
