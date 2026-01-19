# Stellar Siege: RTS Game

You are building **Stellar Siege**, a Real-Time Strategy game. This is an iterative development loop - review your previous work in the codebase and continue from where you left off.

## Project Context

This is a WARNO-style RTS with Warhammer 40k aesthetics featuring:
- Asymmetric factions (Planetary Defense Force vs Vanguard Legions)
- Deck-building pre-match system with divisions and activation points
- 5v5 team-based planetary siege scenarios
- Directional armor, morale, veterancy, critical hit systems
- **Procedurally generated maps** resembling European towns

## Tech Stack

- **Runtime**: Three.js with TypeScript
- **Build**: Vite
- **Package Manager**: Bun (not npm)
- **UI**: HTML/CSS overlays (no React - keep it simple)
- **Testing**: Vitest for unit tests, Playwright for E2E
- **Project Root**: `./web/` directory

---

## Documentation Sections

This documentation is split into focused sections. Read the relevant section(s) for the feature you're implementing:

### Core Systems
| Section | Description |
|---------|-------------|
| [UI & Screens](docs/ui-screens.md) | Game flow, all 8 UI screens, deployment zone visualization |
| [Factions & Units](docs/factions-units.md) | PDF vs Vanguard factions, divisions, unit categories |
| [Combat Mechanics](docs/combat.md) | Armor, weapons, morale, routing behavior, vision |

### World & Movement
| Section | Description |
|---------|-------------|
| [Terrain & Map](docs/terrain-map.md) | Terrain types, cover, roads, forest rendering, map generation |
| [Movement & Formations](docs/movement-formations.md) | Path visualization, formation drawing, order queues |
| [Economy & Reinforcements](docs/economy-reinforcements.md) | Credits, entry points, spawn queues, veterancy |

### Controls & AI
| Section | Description |
|---------|-------------|
| [Selection & UI](docs/selection-ui.md) | Input controls, sub-selection, tactical view, unit indicators |
| [AI System](docs/ai-system.md) | CPU player behaviors and difficulty levels |

### Development
| Section | Description |
|---------|-------------|
| [Implementation Guide](docs/implementation.md) | Phases 1-13, data types, constants, completion criteria |

---

## Quick Reference

### Key Game Rules
- **Economy**: Start 1500 credits, +10/tick (4s), call in reinforcements
- **Victory**: First to 2000 VP wins, only commanders capture zones
- **Combat**: Directional armor (Front > Side > Rear > Top), kinetic weapons scale at range
- **Morale**: 100→50% Normal, 50→25% Shaken, 25→0% Breaking, 0% Routing
- **Accuracy**: `finalAccuracy = baseAccuracy × (morale / 100)` - routing units don't fire

### Unit Categories
| Code | Type | Role |
|------|------|------|
| LOG | Logistics | Supply, repair, FOB |
| INF | Infantry | Garrisonable, commanders |
| TNK | Tanks | Heavy armor, main guns |
| REC | Recon | High optics, stealth |
| AA | Anti-Air | Flak, SAMs |
| ART | Artillery | Indirect fire, suppression |
| HEL | Helicopters | Gunships, transports |
| AIR | Aircraft | Fighters, bombers |

### Camera Controls
- WASD/Arrows/Edge: Pan
- Scroll: Zoom (5-150m)
- Middle Drag: Pan
- Height > 60m: Tactical view (icons)

### Selection
- Click: Select unit
- Box Drag: Multi-select
- Double-Click: Same type in view
- Tab: Cycle sub-selection
- Ctrl+1-9: Assign group
- 1-9: Recall group

### Movement Orders
| Key | Order |
|-----|-------|
| Right-Click | Move |
| A + Right | Attack Move |
| F + Right | Fast Move |
| R + Right | Reverse |
| H + Right | Hunt |
| E + Right | Unload |
| Shift+Click | Queue order |

---

## Development Workflow

1. **Check current state**: Review `web/src/` for existing implementation
2. **Read relevant docs**: Open the appropriate section(s) from above
3. **Implement features**: Follow the phase order in [Implementation Guide](docs/implementation.md)
4. **Test**: Run `bun test` and verify in browser
5. **Continue**: Pick up where you left off in the next session

---

**START NOW**: Check `web/src/` state and continue from where you left off. Begin with Phase 1 if fresh. Ensure every screen is reachable via UI.
