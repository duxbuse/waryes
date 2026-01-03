# Stellar Siege: Three.js RTS Game Migration

You are building **Stellar Siege**, a Real-Time Strategy game being migrated from Godot/C# to Three.js/TypeScript. This is an iterative development loop - review your previous work in the codebase and continue from where you left off.

## Project Context

This is a WARNO-style RTS with Warhammer 40k aesthetics featuring:
- Asymmetric factions (Planetary Defense Force vs Vanguard Legions)
- Deck-building pre-match system with divisions
- 5v5 team-based planetary siege scenarios
- Directional armor, morale, veterancy systems
- **Procedurally generated maps** resembling European towns

## Tech Stack

- **Runtime**: Three.js with TypeScript
- **Build**: Vite
- **UI**: HTML/CSS overlays (no React - keep it simple)
- **Testing**: Vitest for unit tests, Playwright for E2E
- **Project Root**: `./web/` directory

---

## GAME FLOW & UI SCREENS

```
[Main Menu] → [Deck Builder] ←→ [Main Menu]
     ↓
[Skirmish Setup] → [Battle: Setup Phase] → [Battle Phase] → [Victory]
```

### Screen 1: Main Menu

```
┌─────────────────────────────────────┐
│         STELLAR SIEGE               │
│       Planetary Conflict            │
│                                     │
│       [ SKIRMISH ]                  │
│       [ DECK BUILDER ]              │
│       [ SETTINGS ]                  │
│       [ QUIT ]                      │
└─────────────────────────────────────┘
```

### Screen 2: Deck Builder

Full deck construction with:
- Faction/Division dropdowns
- Category tabs: LOG, INF, TNK, REC, AA, ART, HEL, AIR
- Unit library grid with hover stats
- Deck strip showing added cards with slot costs
- Pin button for unit comparison
- Transport popup for units with transport options
- Save/Load to localStorage

### Screen 3: Skirmish Setup

- Deck selector dropdown
- Map size: Small/Medium/Large
- Map seed input with Random button
- Start Battle button

### Screen 4: Battle Screen

**Setup Phase:**
- Deployment UI with category tabs and unit cards
- Click card → click in deployment zone to place
- Drag placed units to reposition
- Press Enter or START BATTLE button

**Battle Phase:**
- Economy running (income ticks)
- Units mobile and fighting
- Capture zones generating points
- First to 2000 wins

---

## PROCEDURAL MAP GENERATION

Generate European-style town maps with:

### Visual Elements
- Cobblestone streets, brick/stone buildings
- Churches, town squares, factories
- Forests, hedgerows, fields
- Rivers with bridges, elevation changes

### Layout Structure
- Deployment zones at opposite edges
- 3-7 capture zones at strategic points (hills, crossroads, town centers)
- Main road connecting deployment zones
- Multiple flanking routes through terrain

### Terrain Types
| Type | Movement | Cover | LOS |
|------|----------|-------|-----|
| Road | 100% | None | Clear |
| Field | 80% | Light | Clear |
| Forest | 50% | Heavy | Blocked |
| Building | - | Full | Blocked |
| River | Impassable | - | Clear |
| Hill | 70% | Light | Elevated |

### Map Sizes
- Small: 1km², 3 zones, 1-2 towns
- Medium: 2km², 4-5 zones, 2-3 towns
- Large: 3km², 5-7 zones, 3-4 towns

---

## INPUT CONTROLS

### Mouse
| Input | Action |
|-------|--------|
| Left Click | Select / Place unit |
| Left Drag | Box selection |
| Double-Click | Select all of same type |
| Right Click (ground) | Move |
| Right Click (enemy) | Attack |
| Right Click (transport) | Mount |
| Right Click (building) | Garrison |
| Right Drag | Formation line |
| Middle Drag | Pan camera |
| Scroll | Zoom |

### Keyboard
| Key | Action |
|-----|--------|
| WASD / Arrows | Pan camera |
| Tab | Cycle selection types |
| Shift | Queue / Add to selection |
| Ctrl+A | Select all |
| Escape | Cancel / Clear |
| Enter | Start battle |
| Q | Quick unload |
| L / Delete | Sell unit |
| C | Toggle LOS preview |

### Movement Modifiers (Key + Left Click)
| Key | Mode |
|-----|------|
| R | Reverse (back up) |
| F | Fast move |
| A | Attack move |
| E | Unload at position |
| Z | Toggle return-fire-only |

### Camera
- WASD/Arrows/Edge: Pan
- Middle drag: Pan
- Scroll: Zoom (5-150m)
- Height > 60m: Tactical view (icons)

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation & Menus
1. Three.js scene, renderer, lights
2. Game loop with fixed timestep
3. Screen manager
4. Main Menu screen
5. Data loading from JSON

### Phase 2: Deck Builder
6. Full deck builder UI
7. Faction/Division selection
8. Unit library with filtering
9. Deck strip with slot costs
10. Stats panel with pin
11. Save/Load decks

### Phase 3: Map Generation
12. Seed-based generator
13. Road network
14. Building placement (European towns)
15. Natural terrain (forests, fields, rivers)
16. Capture zone placement

### Phase 4: Battle Setup
17. Skirmish setup screen
18. Input system (all controls)
19. RTS camera (full controls)
20. Selection system

### Phase 5: Units & Movement
21. Unit class with stats
22. Unit manager
23. Movement with pathfinding
24. All movement modes

### Phase 6: Deployment
25. Deployment manager
26. Deployment UI
27. Unit placement/drag
28. Phase transition

### Phase 7: Combat
29. Weapon system
30. Combat controller
31. Projectiles
32. Health/armor/damage
33. Morale/suppression

### Phase 8: Advanced
34. Veterancy
35. Economy
36. Transport system
37. Garrison system
38. Capture zones

### Phase 9: Polish
39. Minimap
40. Victory condition
41. Victory screen
42. Visual effects

---

## DATA TYPES

```typescript
interface UnitData {
  id: string; name: string; cost: number;
  category: string; // LOG, INF, TNK, REC, AA, ART, HEL, AIR
  tags: string[]; health: number;
  speed: { road: number; offRoad: number; rotation: number };
  armor: { front: number; side: number; rear: number; top: number };
  optics: number; stealth: number;
  isCommander: boolean; transportCapacity: number;
  weapons: WeaponSlot[];
}

interface DivisionData {
  id: string; name: string; factionId: string;
  roster: DivisionRosterEntry[];
  slotCosts: Record<string, number[]>;
}

interface GameMap {
  seed: number; size: MapSize;
  terrain: TerrainCell[][];
  roads: Road[]; buildings: Building[];
  captureZones: CaptureZone[];
  deploymentZones: DeploymentZone[];
}
```

---

## GAME CONSTANTS

```typescript
const GAME_CONSTANTS = {
  STARTING_CREDITS: 1500,
  INCOME_PER_TICK: 10,
  TICK_DURATION: 4,
  VICTORY_THRESHOLD: 2000,
  CAMERA_MIN_HEIGHT: 5,
  CAMERA_MAX_HEIGHT: 150,
  TACTICAL_VIEW_HEIGHT: 60,
  EDGE_PAN_MARGIN: 20,
  MAX_ACTIVATION_POINTS: 50,
  GARRISON_DAMAGE_REDUCTION: 0.5,
};
```

---

## COMPLETION CRITERIA

Output `<promise>GAME COMPLETE</promise>` when ALL true:

### Screens
- ✅ Main Menu with all buttons
- ✅ Deck Builder with full functionality
- ✅ Skirmish Setup with deck/map selection
- ✅ Battle screen with phases

### Map Generation
- ✅ Procedural from seed
- ✅ European town aesthetic
- ✅ Roads, forests, rivers, elevation
- ✅ Balanced capture zones

### Gameplay
- ✅ All camera controls
- ✅ All mouse controls
- ✅ All keyboard controls
- ✅ Unit spawning, selection, movement
- ✅ All movement modes
- ✅ Combat system
- ✅ Morale/suppression

### Systems
- ✅ Transport/garrison
- ✅ Economy with ticks
- ✅ Deployment phase
- ✅ Capture zones
- ✅ Victory at 2000 points

### Quality
- ✅ All tests pass
- ✅ Playable end-to-end

---

## DO NOT

- Skip testing
- Over-engineer
- Ignore errors
- Generate flat/boring maps
- Skip UI screens
- Lie about completion

---

**START NOW**: Check `web/src/` state and continue. Begin with Phase 1 if fresh.
