# Implementation Guide

[← Back to Main](../RALPH_PROMPT.md)

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation & Core UI
1. Three.js scene, renderer, lights
2. Game loop with fixed timestep
3. Screen manager with transitions
4. Main Menu screen (all buttons work)
5. Settings screen (save to localStorage)
6. Data loading from JSON (factions, divisions, units)

### Phase 2: Deck Builder
7. Deck builder screen with back button
8. Faction/Division selection
9. Unit library with category tabs
10. Stats panel with comparison (pin)
11. Deck strip with activation point costs
12. Transport selection popup
13. Save/Load decks to localStorage

### Phase 3: Skirmish Setup
14. Skirmish setup screen
15. Deck dropdown populated from saved decks
16. Map configuration (size, seed)
17. Map preview generation
18. Start Battle → Battle screen

### Phase 4: Map Generation
19. Seed-based procedural generator
20. Highway generation (1-2 connecting deployment zones)
21. Secondary road branching from highways
22. Town street networks (grid/organic)
23. Dirt road connections to rural buildings
24. European town building placement
25. Rural building placement (farms, barns)
26. Natural terrain (forests, fields, rivers, hills)
27. Capture zone strategic placement
28. Deployment zone creation
29. Entry point placement (aligned with roads at map edge)
30. Entry point types (highway/secondary/dirt/air)
31. Resupply point placement (near towns, intersections)
32. Tree clustering algorithm (5+ = forest zone)
33. Smooth terrain transitions (gradient edges)
34. Ground textures and colors
35. Forest zone ground rendering (soft feathered edges)

### Phase 5: Battle Foundation
36. Input system (all mouse/keyboard controls)
37. RTS camera (pan, zoom, edge scroll)
38. Tactical view (icons at height > 60m)
39. Selection system (click, box, control groups)
40. Double-click same-type selection (visible units only)
41. Tab sub-selection cycling (ALL → type1 → type2 → ALL)
42. Sub-selection UI indicator (category tabs with counts)
43. Shift+Double-click to add same type to selection
44. Ctrl+Double-click to select same type map-wide
45. Unit class with all stats
46. Unit manager
47. Unit UI (health bars, morale bars, veterancy stars)
48. Aim indicators (circular arc with accuracy)
49. Reload indicators (radial fill per weapon)
50. Status icons (suppressed, repairing, etc.)
51. Selection panel (single and multi-unit)

### Phase 6: Deployment Phase
52. Deployment manager
53. Deployment UI (category tabs, unit cards)
54. Deployment zone visualization (ground overlay, boundary line)
55. Zone fill rendering (semi-transparent team color)
56. Forward deploy zone visualization (dashed boundary, lighter tint)
57. Placement ghost preview (green=valid, red=invalid, yellow=forward)
58. Unit placement in zone (instant appear)
59. Unit repositioning (drag within zone)
60. FOB placement (setup only)
61. Forward deploy support
62. Phase transition (Enter/Button → Combat)

### Phase 7: Movement & Pathfinding
63. A* pathfinding on terrain and roads
64. Road lane system (width determines capacity)
65. Overtaking mechanics on multi-lane roads
66. Movement modes (normal, fast, reverse, attack-move)
67. Fast move road preference calculation
68. Terrain speed modifiers
69. Vehicle terrain penalties (bog, blowout)
70. Path visualization renderer (line on ground)
71. Path color system (green/red/blue/orange/etc. per order type)
72. Real-time path updates (shrinks as unit moves)
73. Order queue system (Shift+Click to queue)
74. Queued path visualization (multi-colored segments)
75. Waypoint markers (intermediate, destination, target)
76. Setup phase pre-orders (pending paths, execute on battle start)
77. Path interaction (modify, cancel, context menu)
78. Right-click drag line formation drawing
79. Line formation unit distribution (evenly spaced)
80. Auto-facing for straight lines (battle line, perpendicular)
81. Auto-facing for curved lines (defensive arc, face outward)
82. Single-point auto-spread (prevent unit overlap)
83. Short line = facing direction detection
84. Single unit drag = facing direction
85. Formation drag preview (ghost positions, facing arrows)
86. Formation line minimum length threshold calculation

### Phase 8: Combat System
87. Weapon system with stats
88. Directional armor calculation
89. Kinetic scaling
90. Projectile simulation
91. Hit/damage calculation
92. Critical hits and maluses
93. Morale/suppression system
94. Routing and rally

### Phase 9: Vision & Detection
95. LOS calculation with terrain
96. Fog of war
97. Stealth/optics system
98. Ghost signals
99. LOS preview tool
100. Recon spotting bonus

### Phase 10: Advanced Systems
101. Veterancy gain and effects
102. Commander aura
103. Economy (income ticks)
104. Reinforcement calling via entry points
105. Entry point spawn queue system
106. Entry point UI (highlight, queue display)
107. Rally point system for reinforcements
108. Aircraft entry (fly in from map edge)
109. Supply system
110. Transport mount/dismount
111. Garrison system
112. Smoke mechanics
113. Altitude levels (aircraft)
114. Road damage and repair

### Phase 11: AI System
115. AI player framework
116. AI deployment logic
117. AI combat behaviors (engage, retreat, cover)
118. AI economy management
119. AI objective prioritization
120. AI difficulty scaling
121. AI team coordination

### Phase 12: Victory & Polish
122. Capture zone mechanics
123. Victory point tracking
124. Victory condition (2000 VP)
125. Pause menu
126. Victory/Defeat screen with stats
127. Minimap
128. UI polish and feedback
129. Sound effects (placeholder)

### Phase 13: Multiplayer
130. WebSocket server setup
131. Game code generation (XXXX-NNNN format)
132. Lobby creation and management
133. Join Game screen with code entry
134. Game browser showing all open lobbies
135. Game Lobby screen (team selection, ready state)
136. Player state synchronization
137. Host privileges (kick, assign teams, start game)
138. Ready-up system
139. Game state synchronization during battle
140. Reconnection support (30 second window)
141. Disconnect handling (player leaves mid-game)
142. Spectator mode for games in progress

### Phase 14: Testing & Balance
143. Unit tests for all systems
144. E2E tests for game flow
145. AI behavior testing
146. Balance pass on units/weapons
147. Performance optimization
148. Bug fixes

---

## DATA TYPES

```typescript
interface UnitData {
  id: string;
  name: string;
  factionId: string;
  category: 'LOG' | 'INF' | 'TNK' | 'REC' | 'AA' | 'ART' | 'HEL' | 'AIR';
  cost: number;
  health: number;

  // Movement
  speed: { road: number; offRoad: number; reverse: number; rotation: number };
  movementType: 'tracked' | 'wheeled' | 'infantry' | 'hover' | 'fly';
  altitude: 'grounded' | 'hover' | 'fly' | 'soar' | 'space';

  // Combat
  armor: { front: number; side: number; rear: number; top: number };
  weapons: Weapon[];

  // Detection
  optics: number;
  stealth: number;

  // Special
  isCommander: boolean;
  commanderAuraRadius?: number;
  transportCapacity: number;
  squadSize?: number; // For infantry

  // Keywords
  keywords: string[]; // 'assault', 'recon', 'resolute', 'infiltrator', 'forward_deploy', 'amphibious'
  forwardDeployDistance?: number;

  // Abilities
  abilities: Ability[];

  // Veterancy
  availableRanks: number[]; // e.g., [0,1,2] for units that can't be elite
  unitsPerCard: Record<number, number>; // rank -> count, e.g., {0: 8, 1: 6, 2: 4}
}

interface Weapon {
  id: string;
  name: string;
  damage: number;
  armorPenetration: number;
  suppression: number;
  range: { min: number; max: number };
  accuracy: { close: number; far: number };
  rateOfFire: number;
  isKinetic: boolean;
  requiresLOS: boolean;
  ammo: number; // -1 for unlimited
  isSmoke: boolean;
}

interface DivisionData {
  id: string;
  name: string;
  factionId: string;
  description: string;
  roster: DivisionRosterEntry[];
  slotCosts: Record<string, number[]>; // category -> [cost1, cost2, ...]
  maxCommanders: number;
}

interface DivisionRosterEntry {
  unitId: string;
  maxCards: number;
  transportOptions?: string[]; // unit IDs of available transports
}

interface Deck {
  id: string;
  name: string;
  factionId: string;
  divisionId: string;
  cards: DeckCard[];
  totalActivationPoints: number;
}

interface DeckCard {
  unitId: string;
  veterancy: number;
  transportId?: string;
  slotIndex: number; // Which slot in category this uses
}

interface GameMap {
  seed: number;
  size: 'small' | 'medium' | 'large';
  width: number;
  height: number;
  terrain: TerrainCell[][];
  roads: Road[];
  buildings: Building[];
  captureZones: CaptureZone[];
  deploymentZones: DeploymentZone[];
}

interface CaptureZone {
  id: string;
  name: string;
  position: Vector3;
  radius: number;
  pointsPerSecond: number;
  owner: 'neutral' | 'team1' | 'team2';
  captureProgress: number; // 0-100
  capturingTeam: 'none' | 'team1' | 'team2';
}

interface Unit {
  id: string;
  dataId: string; // Reference to UnitData
  teamId: string;
  position: Vector3;
  rotation: number;

  // State
  health: number;
  morale: number;
  veterancy: number;
  suppression: number;

  // Status effects
  maluses: Malus[];
  isRouting: boolean;
  isGarrisoned: boolean;
  garrisonBuildingId?: string;

  // Orders
  currentOrder: Order | null;
  orderQueue: Order[];

  // Weapons state
  weaponsEnabled: boolean;
  ammo: Record<string, number>; // weaponId -> remaining
}

interface Malus {
  type: 'stunned' | 'optics_destroyed' | 'engine_disabled' | 'turret_jammed' | 'radio_destroyed';
  permanent: boolean;
  duration?: number; // For temporary maluses
}
```

---

## GAME CONSTANTS

```typescript
const GAME_CONSTANTS = {
  // Economy
  STARTING_CREDITS: 1500,
  INCOME_PER_TICK: 10,
  TICK_DURATION: 4, // seconds

  // Victory
  VICTORY_THRESHOLD: 2000,

  // Camera
  CAMERA_MIN_HEIGHT: 5,
  CAMERA_MAX_HEIGHT: 150,
  TACTICAL_VIEW_HEIGHT: 60,
  EDGE_PAN_MARGIN: 20,
  EDGE_PAN_SPEED: 500, // units/sec

  // Deck
  MAX_ACTIVATION_POINTS: 50,
  MAX_COMMANDERS: 2,

  // Combat
  GARRISON_DAMAGE_REDUCTION: 0.5,
  COVER_DAMAGE_REDUCTION: { light: 0.2, heavy: 0.4, full: 0.6 },
  KINETIC_CLOSE_RANGE_BONUS: 0.5, // +50% AP at close range
  CRITICAL_HIT_CHANCE: 0.1, // 10%
  CRITICAL_HIT_BONUS_DAMAGE: 1,

  // Morale
  ROUTING_THRESHOLD: 0,
  MORALE_RECOVERY_RATE: 5, // per second when not under fire
  SUPPRESSION_DECAY_RATE: 10, // per second

  // Vision
  GHOST_SIGNAL_DURATION: 5, // seconds

  // Capture
  CAPTURE_TIME_BASE: 20, // seconds

  // Veterancy
  VETERANCY_ACCURACY_BONUS: [0, 0.05, 0.10, 0.15, 0.20],
  VETERANCY_MORALE_BONUS: [0, 0.05, 0.10, 0.15, 0.20],
  COMMANDER_AURA_BONUS: 1, // +1 rank

  // Terrain
  BOG_CHANCE_WHEELED: 0.10,
  BOG_CHANCE_TRACKED: 0.05,
  BLOWOUT_CHANCE: 0.15,
  DERAIL_CHANCE: 0.05,
};
```

---

## COMPLETION CRITERIA

Output `<promise>GAME COMPLETE</promise>` when ALL of the following are true:

### UI Navigation (No Console Required)
- [ ] Main Menu → all buttons navigate correctly
- [ ] Settings → accessible from Menu AND Pause, saves/loads
- [ ] Deck Builder → full functionality, back to menu
- [ ] Skirmish Setup → 5v5 team config, deck selection, map config, start battle
- [ ] Battle → setup phase, combat phase, pause menu works
- [ ] Victory Screen → stats shown, can return to menu or replay
- [ ] All screens have working back/close buttons

### Deck Building
- [ ] Faction and Division selection
- [ ] Category tabs with unit library
- [ ] Activation point system with progressive costs
- [ ] Division-specific slot costs (each division has different tiering per category)
- [ ] Transports do NOT count toward activation points
- [ ] Unit icons displayed in library and deck strip
- [ ] Unit stats display with comparison
- [ ] Veterancy selection affects unit count
- [ ] Transport selection popup (free, no AP cost)
- [ ] Save/Load/Delete decks
- [ ] Starter decks available for new players (6 pre-built decks)

### Map Generation
- [ ] Seed-based procedural generation
- [ ] European town aesthetic (buildings, roads)
- [ ] Terrain variety (forests, fields, rivers, hills)
- [ ] Strategic capture zone placement
- [ ] Deployment zones at map edges
- [ ] Entry points placed at map edge aligned with roads
- [ ] 2-4 entry points per team (highway/secondary/dirt)
- [ ] Resupply points placed at strategic locations (2-4 per map)

### Reinforcement System
- [ ] Deployment phase: units appear instantly at click location
- [ ] Deployment phase: drag to reposition within zone
- [ ] Battle phase: units must spawn at entry points
- [ ] Entry point selection when calling reinforcements
- [ ] Entry point queue system (units spawn one at a time)
- [ ] Spawn rate varies by road type (highway fast, dirt slow)
- [ ] Entry point UI shows queue count and wait times
- [ ] Rally points: Shift+Click sets auto-move destination
- [ ] Aircraft enter from map edge (no ground entry point)

### Deployment Zone Visualization
- [ ] Deployment zones visible during setup phase
- [ ] Team-colored zone boundary (green for player, red for enemy)
- [ ] Semi-transparent fill showing valid placement area
- [ ] Forward deploy extension zone (hatched/striped pattern)
- [ ] Placement ghost preview follows cursor
- [ ] Ghost color indicates validity (green=valid, red=invalid, yellow=forward deploy)
- [ ] Zone border rendered on ground (not floating)
- [ ] Zones hidden during battle phase

### Road System
- [ ] Highway (1-2) connecting deployment zones
- [ ] Secondary roads branching to towns
- [ ] Town street networks connecting buildings
- [ ] Dirt roads to rural buildings (farms, barns)
- [ ] Road width determines lane count
- [ ] Lane capacity limits units side-by-side
- [ ] Faster units overtake slower on multi-lane roads
- [ ] Fast move prefers roads when faster overall
- [ ] Single-lane roads force single-file movement

### Terrain Rendering
- [ ] Smooth ground color transitions (no jagged edges)
- [ ] Forest zones (5+ trees) have dark ground color with soft edge
- [ ] Isolated trees (< 5) are visual only, no ground color
- [ ] 2-man teams can use single trees as cover
- [ ] Gradient terrain transitions (field → forest = 10-15m feather)
- [ ] Proper ground textures (grass, forest floor, cobblestone, etc.)

### Selection System
- [ ] Click to select single unit
- [ ] Box drag to select multiple units
- [ ] Control groups (1-9 to recall, Ctrl+1-9 to assign)
- [ ] Double-click selects all same type visible on screen
- [ ] Shift+Double-click adds same type to selection
- [ ] Ctrl+Double-click selects same type map-wide
- [ ] Tab cycles sub-selection (ALL → type1 → type2 → ALL)
- [ ] Sub-selection UI shows category tabs with counts
- [ ] Commands only apply to active sub-selection
- [ ] Sub-selection resets on new selection or Escape

### Battle Systems
- [ ] All camera controls (WASD, edge pan, zoom, tactical view)
- [ ] All mouse controls (select, box, move, attack, garrison)
- [ ] All keyboard shortcuts working
- [ ] All movement modes (normal, fast, reverse, attack-move)

### Movement Path Visualization
- [ ] Path lines rendered on ground showing planned routes
- [ ] Color-coded paths (green=move, red=hunt, blue=reverse, orange=attack, etc.)
- [ ] Paths update in real-time as unit moves (shows remaining path only)
- [ ] Order queue system (Shift+Click to append orders)
- [ ] Queued paths show multi-colored segments for different order types
- [ ] Waypoint markers (circles, crosshairs, flags) at key points
- [ ] Setup phase pre-orders (dashed lines, execute on battle start)
- [ ] Path modification (drag waypoints, delete orders, context menu)
- [ ] Multi-unit paths (individual or formation-based parallel lines)

### Formation Movement
- [ ] Right-click drag draws formation line for multiple units
- [ ] Units evenly distributed along drawn line
- [ ] Straight lines: all units face perpendicular (battle line)
- [ ] Curved lines: units face outward (defensive arc)
- [ ] Single-point orders: auto-spread units to prevent overlap
- [ ] Short line drag: treated as facing direction instead of formation
- [ ] Single unit drag: always sets facing direction at destination
- [ ] Formation preview while dragging (ghost positions, facing arrows)
- [ ] Works with all movement order types (Move, Fast, Attack, Hunt, Reverse, Unload)

### Tactical View & Unit UI
- [ ] Tactical view activates at camera height > 60m
- [ ] Units switch to category icons when zoomed out
- [ ] Icons colored by team (friendly/enemy/neutral)
- [ ] Health bars (green → yellow → red)
- [ ] Morale bars (blue → gray, skull on routing)
- [ ] Aim indicator (circular arc showing direction + accuracy)
- [ ] Reload indicators (radial fill per weapon)
- [ ] Veterancy stars display
- [ ] Status icons (repairing, suppressed, garrisoned, etc.)
- [ ] Selection panel with detailed unit info
- [ ] Multi-unit selection summary

### AI Players
- [ ] 5v5 team setup with slot configuration
- [ ] CPU players fill empty slots
- [ ] AI difficulty levels (Easy/Medium/Hard)
- [ ] AI deploys units appropriately
- [ ] AI manages economy and reinforcements
- [ ] AI engages in combat, uses cover, retreats when damaged
- [ ] AI captures objectives with commanders
- [ ] AI coordinates with teammates

### Units & Combat
- [ ] Unit spawning with correct stats
- [ ] Selection and control groups
- [ ] Pathfinding with terrain costs
- [ ] Directional armor damage calculation
- [ ] Weapon firing with accuracy/range
- [ ] Kinetic scaling at close range
- [ ] Critical hits and maluses
- [ ] Morale and suppression
- [ ] Morale states (Normal → Shaken → Breaking → Routing)
- [ ] Morale-accuracy scaling (accuracy malus = 100 - morale%)
- [ ] Routing units ignore player commands and do not fire
- [ ] Routing units flee away from threat source
- [ ] Routing units seek cover (forest, buildings, hills)
- [ ] Routing units hide to break LOS to enemies
- [ ] Routing units abandon cover if shot and no better position available
- [ ] Routing units flee off map if no cover found
- [ ] Morale recovery when hidden and not under fire
- [ ] Rally by commanders restores control

### Advanced Systems
- [ ] Veterancy gain and effects
- [ ] Commander aura
- [ ] Economy with income ticks
- [ ] Transport mount/dismount
- [ ] Garrison system
- [ ] Smoke deployment
- [ ] Vision/stealth/fog of war
- [ ] Recon spotting bonus

### Fog of War
- [ ] Three visibility states: Visible, Explored (grayed), Unexplored (black)
- [ ] Visible areas show full color terrain and all units
- [ ] Explored areas show grayed/desaturated terrain only (no enemy units)
- [ ] Unexplored areas completely hidden (black)
- [ ] Vision radius based on unit Optics stat
- [ ] Vision blocked by buildings, dense forest, hills
- [ ] Team shares vision (all teammates see what any unit sees)
- [ ] Fog updates in real-time as units move
- [ ] Minimap reflects fog of war state

### Minimap
- [ ] Top-down view of entire battlefield
- [ ] Shows terrain (ground, roads, buildings, forests)
- [ ] Shows capture zones with ownership colors
- [ ] Shows resupply points (hexagon markers)
- [ ] Shows entry points (square markers)
- [ ] Shows friendly units (always visible, blue/green dots)
- [ ] Shows enemy units (only in visible areas, red dots)
- [ ] Camera viewport rectangle shown
- [ ] Click to move camera
- [ ] Right-click to issue move orders
- [ ] Respects fog of war (explored=grayed, unexplored=black)
- [ ] Unit icons match tactical view category icons

### Capture Zone Visualization
- [ ] Visible border around capture zone boundary
- [ ] Border color indicates owner (gray=neutral, team color=controlled)
- [ ] Border flashes/pulses when contested (multiple commanders present)
- [ ] Radial fill animation from commander entry point when capturing
- [ ] Fill progresses from 0% to 100% as capture timer progresses
- [ ] Fill color matches capturing team's color
- [ ] Completed capture shows solid team color fill
- [ ] With LOS: see entry point, radial fill direction, and progress %
- [ ] Without LOS: only see final color change when capture completes
- [ ] Lost LOS during capture: last seen state frozen until regained
- [ ] Contested zones show frozen progress with pulsing border
- [ ] Capture zones visible on minimap with owner colors

### Multiplayer
- [ ] Main Menu has JOIN GAME button
- [ ] HOST ONLINE button in Skirmish Setup generates game code
- [ ] Game code format: XXXX-NNNN (4 letters + 4 numbers)
- [ ] Game code displayed with COPY button
- [ ] Join Game screen with code entry field
- [ ] Game browser lists all open lobbies
- [ ] Game browser shows: code, host, map size, player count, status
- [ ] Game browser auto-refreshes every 5 seconds
- [ ] Filter options for full games and games in progress
- [ ] Join button for open lobbies, Spectate for games in progress
- [ ] Game Lobby screen shows all players and their ready state
- [ ] Players can select team and deck in lobby
- [ ] Players can mark themselves as Ready
- [ ] Host can kick players and assign teams
- [ ] Host can fill empty slots with CPU
- [ ] Game starts when host clicks Start (requires 1+ player per team ready)
- [ ] WebSocket connection for real-time lobby updates
- [ ] Game state synchronized between all players during battle
- [ ] Reconnection support (30 second window after disconnect)
- [ ] Disconnect handling (slot becomes CPU or removed)

### Victory
- [ ] Capture zones (commander-only capture)
- [ ] Victory point generation
- [ ] First to 2000 wins
- [ ] Victory screen with statistics
- [ ] Kill tracking (killer, victim, cost, timestamp)
- [ ] Unit Kill Counts table (sorted by kills, shows kill value and status)
- [ ] Unit Losses table (shows cost, killed by, timestamp)
- [ ] Hero of the Match (highest kill value)
- [ ] Most Cost Effective (highest kill value / own cost ratio)
- [ ] Partial squad losses tracked proportionally

### Quality
- [ ] All Vitest unit tests pass
- [ ] No console errors during gameplay
- [ ] Game is playable end-to-end without bugs

---

## DO NOT

- Skip UI screens or require console navigation
- Skip testing
- Over-engineer beyond requirements
- Ignore TypeScript errors
- Generate flat/boring maps
- Forget back buttons on screens
- Lie about completion status
- Implement features partially
