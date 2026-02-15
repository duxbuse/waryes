# Stellar Siege - Planetary Conflict RTS

A WARNO-style Real-Time Strategy game with Warhammer 40k aesthetics, featuring asymmetric factions, deck-building, and 5v5 team-based planetary siege scenarios.

## Current Status

**PLAYABLE PROTOTYPE** - Core gameplay functional, advanced features pending.

See [COMPLETION_STATUS.md](./COMPLETION_STATUS.md) for detailed feature status.

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (JavaScript runtime & package manager)
- Modern web browser (Chrome, Firefox, Edge, Safari)

### Installation & Running

#### Option 1: Docker Compose (Recommended for Players)

The easiest way to play without setting up a local development environment:

```bash
# 1. Copy and configure environment variables
cp .env.example .env
# Edit .env and set secure passwords for POSTGRES_PASSWORD and REDIS_PASSWORD

# 2. Start all services (database, Redis, game server, and web client)
docker-compose up -d

# 3. Open your browser to http://localhost:8080
# The game is now ready to play!

# To stop all services
docker-compose down

# To rebuild after code changes
docker-compose up -d --build
```

**What gets started:**
- PostgreSQL database (port 5432)
- Redis cache (port 6379)
- Game server with WebSocket support (port 3001)
- Web client served by nginx (port 8080)

**Cloud Deployment:**
For production deployments, configure these environment variables in `.env`:

```bash
# Backend API URL (use HTTPS in production)
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com

# Web client port
CLIENT_PORT=8080

# CORS - allow your domain to connect
ALLOWED_ORIGIN=https://yourdomain.com

# Set production mode
NODE_ENV=production
```

See [DOCKER.md](./DOCKER.md) for detailed deployment documentation.

#### Option 2: Local Development

For developers who want to modify the code:

```bash
# Install dependencies
cd web
bun install

# Run development server
bun run dev
# Game will be available at http://localhost:5173 (or next available port)

# Run tests
bun test

# Build for production
bun run build
# Output will be in web/dist/
```

## How to Play

### 1. Main Menu
- Click **SKIRMISH** to start a match
- Click **DECK BUILDER** to create custom decks
- Click **SETTINGS** to configure game options

### 2. Deck Builder
1. Select your faction (Planetary Defense Force or Vanguard Legions)
2. Choose a division (each has unique unit rosters)
3. Browse unit categories (LOG, INF, TNK, REC, AA, ART, HEL, AIR)
4. Click units to add them to your deck (max 50 activation points)
5. Save your deck with a name
6. Click **BACK TO MENU**

### 3. Skirmish Setup
1. Select your saved deck from the dropdown
2. Choose map size (Small/Medium/Large)
3. Set map seed (or click dice icon for random)
4. Click **START BATTLE**

### 4. Deployment Phase
1. Your deployment zone is shown on the map
2. Click unit cards on the right panel
3. Click in your deployment zone to place units
4. Units cost credits (you start with 1500)
5. Press **START BATTLE** button when ready

### 5. Battle Phase
- **Select Units**: Left-click to select, drag to box-select
- **Move Units**: Right-click to move selected units
- **Attack**: Right-click on enemy units to attack
- **Capture Zones**: Move commander units (LOG category) into capture zones
- **Win Condition**: First team to 2000 victory points wins

### Controls

#### Camera
- **WASD** / **Arrow Keys**: Pan camera
- **Mouse Wheel**: Zoom in/out
- **Middle Mouse Drag**: Pan camera
- **Move mouse to screen edges**: Pan camera

#### Selection
- **Left Click**: Select unit
- **Drag**: Box select multiple units
- **Double Click**: Select all units of same type
- **Tab**: Cycle through unit types in selection
- **1-9**: Recall control group
- **Ctrl + 1-9**: Assign control group
- **Ctrl + A**: Select all your units
- **Shift + Click**: Add/remove from selection
- **Escape**: Clear selection

#### Commands
- **Right Click**: Move selected units
- **Right Click on Enemy**: Attack enemy
- **Shift + Right Click**: Queue order
- **R + Right Click**: Reverse move (back up)
- **F + Right Click**: Fast move
- **A + Right Click**: Attack move (engage enemies while moving)

#### Game Controls
- **Escape**: Pause menu
- **Enter**: Start battle (during deployment)
- **Z**: Toggle return-fire-only mode

## Factions

### Planetary Defense Force (PDF)
Local garrison forces defending their homeworld. Rely on numbers, entrenchment, and terrain knowledge.

**Key Units:**
- PDF Infantry Squads (cheap, numerous)
- Chimera APCs (transport + firepower)
- Leman Russ Battle Tanks (heavy armor)
- Basilisk Artillery (long-range suppression)

### Vanguard Legions
Elite assault forces specialized in planetary siege warfare. Superior firepower and armor.

**Key Units:**
- Vanguard Marines (elite infantry, power armor)
- Rhino APCs (fast, reliable transport)
- Land Raiders (super-heavy tanks with transport)
- Predator Tanks (versatile, deadly)

## Game Mechanics

### Directional Armor
Units have 4 armor facings: **Front > Side > Rear > Top**
- Flank enemies for maximum damage
- Use reverse (R + Right Click) to keep front armor facing threats
- Artillery and aircraft attack top armor

### Morale System
- Units have morale (0-100%)
- Taking damage and suppression reduces morale
- At 0% morale, units **route** (flee uncontrollably)
- Morale affects accuracy: `finalAccuracy = baseAccuracy × (morale / 100)`
- Routing units cannot fire and ignore commands
- Morale recovers over time when not under fire

### Economy
- Start with 1500 credits
- Earn +10 credits every 4 seconds
- Spend credits to deploy units during setup

### Victory
- Capture zones generate victory points
- Only **commander units** (LOG category) can capture
- First team to **2000 points** wins

## Project Structure

```
waryes/
├── web/                    # Main game directory
│   ├── src/
│   │   ├── core/          # Game engine, camera, managers
│   │   ├── game/
│   │   │   ├── managers/  # Selection, input, combat, AI, etc.
│   │   │   ├── units/     # Unit class
│   │   │   └── map/       # Map generation and rendering
│   │   ├── screens/       # UI screens (menu, deck builder, etc.)
│   │   ├── data/          # Factions, units, weapons data
│   │   └── main.ts        # Entry point
│   ├── tests/             # Unit tests
│   ├── index.html         # HTML template
│   └── package.json
├── docs/                  # Design documentation
└── RALPH_PROMPT.md        # Main development prompt

```

## Testing

```bash
cd web
bun test
```

All tests should pass. Currently 19 tests covering:
- Unit creation and stats
- Morale and routing behavior
- Damage calculation
- Basic game logic

## Known Limitations

The current prototype is missing several planned features:
- ❌ Path visualization (can't see unit routes)
- ❌ Formation controls (no line drawing)
- ❌ Tactical view icons (no zoom-out icons)
- ❌ Fog of war (all units always visible)
- ❌ Functional minimap
- ❌ Battle reinforcements (must deploy all units in setup)
- ❌ Transport/garrison mechanics
- ❌ Advanced routing (seeking cover)

See [COMPLETION_STATUS.md](./COMPLETION_STATUS.md) for full details.

## Development

### Tech Stack
- **Runtime**: Three.js + TypeScript
- **Build**: Vite
- **Package Manager**: Bun
- **Testing**: Vitest
- **UI**: HTML/CSS overlays (no frameworks)

### Key Files
- `web/src/core/Game.ts` - Main game loop and manager orchestration
- `web/src/game/managers/` - Game systems (combat, selection, AI, etc.)
- `web/src/game/units/Unit.ts` - Unit class with all stats and behavior
- `web/src/data/factions.ts` - All unit and weapon data
- `web/src/screens/` - UI screen implementations

### Adding New Units

1. Add weapon to `WEAPONS` array in `web/src/data/factions.ts`
2. Add unit to `UNITS` array with stats and weapon slots
3. Add to division rosters in `DIVISIONS` array
4. Unit will appear in deck builder automatically

### Adding New Features

1. Create manager in `web/src/game/managers/` (if needed)
2. Register manager in `Game.ts` constructor
3. Initialize in `Game.initialize()`
4. Update in game loop (`fixedUpdate` or `update`)
5. Add tests in `web/tests/`

## Troubleshooting

### Game won't load
- Check browser console for errors (F12)
- Ensure dev server is running (`bun run dev`)
- Try clearing browser cache (Ctrl+Shift+R)

### Can't deploy units
- Make sure you selected a deck in Skirmish Setup
- Check that you're clicking inside the deployment zone
- Verify you have enough credits (shown in top bar)

### Units won't move
- Ensure you're in Battle phase (not Setup)
- Check that units are selected (green ring visible)
- Right-click on ground to move (not left-click)

### Performance issues
- Lower graphics quality in browser settings
- Close other browser tabs
- Try smaller map size

## Contributing

This is a prototype/learning project. The codebase is well-structured for expansion:
- Manager pattern for game systems
- Data-driven unit/weapon definitions
- Modular screen system
- Event-driven architecture

Priority areas for contribution:
1. Path visualization system
2. Health/morale UI indicators
3. Tactical view icons
4. Minimap functionality
5. Fog of war system

## License

[Specify license here]

## Credits

Built with:
- [Three.js](https://threejs.org/) - 3D graphics
- [Vite](https://vitejs.dev/) - Build tool
- [Bun](https://bun.sh/) - Runtime & package manager
- [Vitest](https://vitest.dev/) - Testing framework

Inspired by:
- WARNO (Eugen Systems)
- Warhammer 40,000 (Games Workshop)
- Company of Heroes (Relic Entertainment)

---

**Status**: Playable Prototype (~55-60% feature complete)
**Last Updated**: 2026-01-04
**Version**: 0.5.0-alpha
