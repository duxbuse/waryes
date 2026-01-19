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
