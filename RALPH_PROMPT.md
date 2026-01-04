# Stellar Siege: Three.js RTS Game

You are building **Stellar Siege**, a Real-Time Strategy game being migrated from Godot/C# to Three.js/TypeScript. This is an iterative development loop - review your previous work in the codebase and continue from where you left off.

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
- **UI**: HTML/CSS overlays (no React - keep it simple)
- **Testing**: Vitest for unit tests, Playwright for E2E
- **Project Root**: `./web/` directory

---

## GAME FLOW & UI SCREENS

**CRITICAL**: All screens must be reachable via UI buttons. No console commands required.

```
┌──────────────────────────────────────────────────────────────────┐
│                         MAIN MENU                                │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                  │
│         ▼                  ▼                  ▼                  │
│   [SKIRMISH]         [DECK BUILDER]      [SETTINGS]              │
│         │                  │                  │                  │
│         │            (Back to Menu)     (Back to Menu)           │
│         ▼                                                        │
│  [SKIRMISH SETUP]                                                │
│    - Select deck                                                 │
│    - Configure map                                               │
│    - [START BATTLE] / [BACK]                                     │
│         │                                                        │
│         ▼                                                        │
│  [BATTLE: SETUP PHASE]                                           │
│    - Deploy units                                                │
│    - [ESC] → Pause Menu                                          │
│    - [ENTER] or [START] → Battle Phase                           │
│         │                                                        │
│         ▼                                                        │
│  [BATTLE: COMBAT PHASE]                                          │
│    - Real-time combat                                            │
│    - [ESC] → Pause Menu                                          │
│         │                                                        │
│         ▼                                                        │
│  [VICTORY/DEFEAT SCREEN]                                         │
│    - Stats summary                                               │
│    - [MAIN MENU] / [PLAY AGAIN]                                  │
└──────────────────────────────────────────────────────────────────┘

PAUSE MENU (accessible via ESC during battle):
┌─────────────────┐
│  GAME PAUSED    │
│  [RESUME]       │
│  [SETTINGS]     │
│  [SURRENDER]    │
│  [QUIT TO MENU] │
└─────────────────┘
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

**Requirements:**
- All buttons must navigate to their respective screens
- Background: Animated 3D scene or static artwork
- Title with faction insignias

### Screen 2: Settings

```
┌─────────────────────────────────────────────────┐
│  SETTINGS                          [X] Close   │
├─────────────────────────────────────────────────┤
│  GRAPHICS                                       │
│    Resolution:     [Dropdown]                   │
│    Quality:        [Low/Med/High/Ultra]         │
│    Shadows:        [Toggle]                     │
│    VSync:          [Toggle]                     │
│                                                 │
│  AUDIO                                          │
│    Master Volume:  [────●────]                  │
│    Music:          [────●────]                  │
│    SFX:            [────●────]                  │
│                                                 │
│  GAMEPLAY                                       │
│    Edge Pan Speed: [────●────]                  │
│    Scroll Speed:   [────●────]                  │
│    Show Grid:      [Toggle]                     │
│    Show Health Bars: [Always/Selected/Never]   │
│                                                 │
│  CONTROLS                                       │
│    [View Keybindings]                           │
│                                                 │
│           [APPLY]    [RESET DEFAULTS]           │
└─────────────────────────────────────────────────┘
```

**Requirements:**
- Save settings to localStorage
- Apply without restart where possible
- Back button returns to previous screen (Menu or Pause)

### Screen 3: Deck Builder

```
┌────────────────────────────────────────────────────────────────────────┐
│  DECK BUILDER                                         [BACK TO MENU]  │
├────────────────────────────────────────────────────────────────────────┤
│  Faction: [▼ PDF / Vanguard]    Division: [▼ Armored/Infantry/...]    │
│  Deck Name: [____________]      Points: 32/50 AP                      │
├────────────────────────────────────────────────────────────────────────┤
│  [LOG] [INF] [TNK] [REC] [AA] [ART] [HEL] [AIR]     ← Category Tabs   │
├─────────────────────────────────┬──────────────────────────────────────┤
│  UNIT LIBRARY                   │  UNIT STATS                         │
│  ┌─────┐ ┌─────┐ ┌─────┐       │  Name: Leman Russ                   │
│  │     │ │     │ │     │       │  Cost: 120 credits                  │
│  │ Img │ │ Img │ │ Img │       │  HP: 10  Armor: 12/8/4/2            │
│  │     │ │     │ │     │       │  Speed: 70/50 km/h                  │
│  └─────┘ └─────┘ └─────┘       │  Optics: 150m  Stealth: 0           │
│  Leman    Baneblade  Chimera   │                                      │
│  Russ                          │  WEAPONS:                            │
│  120cr    280cr      65cr      │  - Battle Cannon (AP:14, DMG:4)     │
│                                │  - Heavy Bolter (AP:2, DMG:1)       │
│  [Click to add to deck]        │                                      │
│                                │  [PIN] for comparison                │
├────────────────────────────────┴──────────────────────────────────────┤
│  YOUR DECK                                          Slots: 8/12 INF   │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐               1AP  1AP  2AP ... │
│  │ U │ │ U │ │ U │ │ U │ │ U │ │ + │  ← Drag to reorder, click to   │
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘     remove                      │
├────────────────────────────────────────────────────────────────────────┤
│  [SAVE DECK]  [LOAD DECK]  [NEW DECK]  [DELETE DECK]                  │
└────────────────────────────────────────────────────────────────────────┘
```

**Deck Building Mechanics:**
- **50 Activation Points** maximum per deck
- **Progressive Slot Costs**: Each category has escalating costs per slot
  - Example (Infantry Division): INF slots cost [1,1,1,1,2,2,3,3], TNK slots cost [2,3,4,5]
- **Unit Availability**: Cards give X units (e.g., "4x Guardsmen" or "2x Leman Russ")
- **Veterancy Trade-off**: Higher vet = fewer units per card
- **Commander Limit**: Max 1-2 commander cards per deck
- **Transport Selection**: Popup for infantry to choose transport type

### Screen 4: Skirmish Setup

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SKIRMISH SETUP                                              [BACK]     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TEAM 1 (DEFENDERS)                 TEAM 2 (ATTACKERS)                  │
│  ┌────────────────────────────┐     ┌────────────────────────────┐      │
│  │ 1. [YOU]  [▼ Your Deck   ] │     │ 1. [CPU] [▼ Easy/Med/Hard] │      │
│  │ 2. [CPU]  [▼ Easy        ] │     │ 2. [CPU] [▼ Medium      ] │      │
│  │ 3. [CPU]  [▼ Medium      ] │     │ 3. [CPU] [▼ Medium      ] │      │
│  │ 4. [CPU]  [▼ Hard        ] │     │ 4. [CPU] [▼ Hard        ] │      │
│  │ 5. [OPEN] [Waiting...]     │     │ 5. [CPU] [▼ Easy        ] │      │
│  └────────────────────────────┘     └────────────────────────────┘      │
│                                                                          │
│  Player Slot Options: [YOU] [CPU] [OPEN] [CLOSED]                       │
│  CPU Difficulty: Easy / Medium / Hard                                    │
│                                                                          │
│  MAP CONFIGURATION                                                       │
│  Size:    ( ) Small   (●) Medium   ( ) Large                            │
│  Seed:    [________] [RANDOM]                                           │
│                                                                          │
│  MAP PREVIEW                                                             │
│  ┌───────────────────────────────────────┐                              │
│  │                                       │                              │
│  │   Team 1 Deploy ←─────→ Team 2 Deploy │                              │
│  │        (Minimap preview here)         │                              │
│  │                                       │                              │
│  └───────────────────────────────────────┘                              │
│                                                                          │
│              [ START BATTLE ]    [ HOST ONLINE ]                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Team Configuration:**
- **5v5 Format**: Each team has 5 player slots
- **Slot Types**:
  - **YOU**: Your controlled slot with deck selection
  - **CPU**: AI player with difficulty selection (Easy/Medium/Hard)
  - **OPEN**: Waiting for online player to join (if hosting)
  - **CLOSED**: Remove this slot (for smaller matches)
- **AI Auto-fill**: When starting, any OPEN slots become CPU (Medium)
- **Minimum**: At least 1 player per team required

### Screen 5: Battle Screen - Setup Phase

```
┌────────────────────────────────────────────────────────────────────────┐
│  SETUP PHASE                    Credits: 1500      Time: --:--        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                    3D BATTLEFIELD VIEW                                 │
│              (Deployment zone highlighted)                             │
│                                                                        │
│       ┌──────────────────────────────────────────────┐                │
│       │                                              │                │
│       │   Click in zone to place selected unit       │                │
│       │   Drag placed units to reposition            │                │
│       │                                              │                │
│       └──────────────────────────────────────────────┘                │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  [LOG] [INF] [TNK] [REC] [AA] [ART] [HEL] [AIR]                       │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                             │
│  │ 4x  │ │ 2x  │ │ 1x  │ │ 3x  │ │ 2x  │   ← Available cards         │
│  │Guard│ │Tank │ │Arty │ │Recon│ │ AA  │      Click to select        │
│  │ 45cr│ │120cr│ │200cr│ │ 60cr│ │ 80cr│                             │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                             │
├────────────────────────────────────────────────────────────────────────┤
│  Selected: Infantry Squad (45cr)          [ START BATTLE ] [ENTER]    │
└────────────────────────────────────────────────────────────────────────┘
```

**Setup Phase Rules:**
- FOB (Forward Operating Base) can ONLY be placed during setup phase
- Forward Deploy units can place ahead of normal deployment zone
- Commander units deploy at max veterancy

### Screen 6: Battle Screen - Combat Phase

```
┌────────────────────────────────────────────────────────────────────────┐
│  VP: 450/2000 vs 380/2000        Credits: 890      Time: 12:34        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                    3D BATTLEFIELD VIEW                                 │
│                                                                        │
│   ┌─────────┐                                                         │
│   │ MINIMAP │   Capture zones shown with ownership colors             │
│   │         │   Unit icons, fog of war                                │
│   └─────────┘                                                         │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  SELECTED: 3x Infantry Squad                                          │
│  HP: ████████░░  Morale: ██████░░░░  Status: In Cover                │
│  [WEAPONS ON/OFF] [SMOKE] [RETREAT] [UNLOAD]                         │
├────────────────────────────────────────────────────────────────────────┤
│  REINFORCEMENTS (click to call in)                                    │
│  ┌─────┐ ┌─────┐ ┌─────┐                                             │
│  │ 2x  │ │ 1x  │ │ 4x  │                                             │
│  │Tank │ │Cmdr │ │Inf  │                                             │
│  └─────┘ └─────┘ └─────┘                                             │
└────────────────────────────────────────────────────────────────────────┘
```

### Screen 7: Pause Menu (ESC during battle)

```
┌─────────────────────────────────┐
│         GAME PAUSED             │
│                                 │
│         [ RESUME ]              │
│         [ SETTINGS ]            │
│         [ SURRENDER ]           │
│         [ QUIT TO MENU ]        │
│                                 │
│   Are you sure? [YES] [NO]      │  ← Confirmation for Surrender/Quit
└─────────────────────────────────┘
```

### Screen 8: Victory/Defeat Screen

```
┌────────────────────────────────────────────────────────────────────────┐
│                          VICTORY!                                      │
│                    "The Emperor Protects"                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Final Score:  2000 vs 1456                                          │
│   Time:         23:45                                                  │
│                                                                        │
│   YOUR STATS                                                           │
│   ─────────────────────────────────                                   │
│   Units Deployed:     42                                               │
│   Units Lost:         18                                               │
│   Units Destroyed:    31                                               │
│   Zones Captured:     4                                                │
│   Credits Earned:     4,200                                            │
│   Credits Spent:      3,850                                            │
│                                                                        │
│   TOP PERFORMERS                                                       │
│   ─────────────────────────────────                                   │
│   1. Leman Russ "Steel Fury" - 8 kills                                │
│   2. Infantry Squad Alpha - 5 kills                                   │
│                                                                        │
│            [ PLAY AGAIN ]    [ MAIN MENU ]                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## FACTIONS & DIVISIONS

### Planetary Defense Force (PDF)
Industrial, militaristic, disciplined. Strength in numbers and firepower.
- **Strengths**: Mass infantry, artillery, fortifications
- **Weaknesses**: Lower individual unit quality, slower elites

### Vanguard Legions
Elite shock troops. Few but devastating units.
- **Strengths**: Superior individual units, deep strike, psychic powers
- **Weaknesses**: Low unit count, expensive, no chaff

### Division System
Each division specializes in certain unit categories with cheaper slot costs:

| Division Type | Cheap Slots | Expensive Slots |
|---------------|-------------|-----------------|
| Armored | TNK, AA | INF, REC |
| Infantry | INF, LOG | TNK, AIR |
| Mechanized | INF, TNK | ART, AIR |
| Recon | REC, HEL | TNK, ART |
| Air Assault | HEL, AIR | TNK, ART |
| Artillery | ART, LOG | REC, AIR |

---

## UNIT CATEGORIES

### LOG (Logistics)
- **FOB (Forward Operating Base)**: 16,000 supply capacity, setup-phase only, explosive
- **Supply Trucks**: Small (200 supply) or Heavy (1200 supply)
- **Supply Helicopters**: Faster but vulnerable
- **Engineering Vehicles**: Repair, construction

### INF (Infantry)
- **Squad Size**: 4-20 troops per unit
- **Commanders**: Found here, provide aura buffs
- **Types**: Line infantry, shock troops, heavy weapons teams
- **Garrison**: Can enter buildings

### TNK (Tanks)
- **Main Battle Tanks**: Heavy armor, main cannons
- **Walkers**: Traverse difficult terrain, can garrison
- **Tank Commanders**: Superior vehicle with aura

### REC (Recon)
- **High Optics**: Spot enemies at range
- **Stealth**: Hard to detect
- **Artillery Synergy**: Remove accuracy penalty for arty

### AA (Anti-Air)
- **Flak Tanks**: Close-range AA
- **SAM Sites**: Long-range missiles

### ART (Artillery)
- **Indirect Fire**: Shoot over terrain
- **High Suppression**: Morale damage
- **Smoke Shells**: Create smoke screens

### HEL (Helicopters)
- **Gunships**: Close air support
- **Transports**: Rapid deployment
- **Altitude**: Hover level

### AIR (Aircraft)
- **Fighters**: Air superiority
- **Bombers**: Heavy ordnance
- **Altitude Levels**: Fly, Soar, Space

---

## COMBAT MECHANICS

### Directional Armor
Units have 4 armor values: **Front > Side > Rear > Top**

```
         FRONT (highest)
            ▲
            │
   SIDE ◄───┼───► SIDE
            │
            ▼
         REAR (lowest)

   TOP (aircraft, artillery)
```

**Tactical Reversing**: Vehicles can reverse at reduced speed keeping front armor facing enemy.

### Weapon System

```typescript
interface Weapon {
  name: string;
  damage: number;           // Base damage per hit
  armorPenetration: number; // Must exceed armor to deal damage
  suppression: number;      // Morale damage (even on misses)
  range: { min: number; max: number };
  accuracy: { close: number; far: number }; // Percentage
  rateOfFire: number;       // Rounds per minute
  isKinetic: boolean;       // Gains AP at close range
  requiresLOS: boolean;     // Missiles lose tracking if LOS broken
}
```

**Kinetic Scaling**: Kinetic weapons gain penetration at close range
- Main cannons: Significant bonus (flanking light tank can kill heavy tank)
- Small arms: Negligible (limited range anyway)

### Missiles & Rockets
- **Slow Projectile**: Can be dodged by fast targets
- **LOS Requirement**: Loses tracking if LOS broken (smoke counter)
- **Fixed Damage**: Consistent lethality when they hit

### Health & Critical Hits
- **Standardized HP**: Light ~8, Medium ~10, Heavy ~11
- **Critical Hits**: Low chance on damaging hits
  - **Effect**: +1 damage + random Malus
  - **Vehicle Maluses**: Stunned, Optics Destroyed, Engine Disabled, Turret Jammed, Radio Destroyed
  - **Infantry Maluses**: Stunned, Radio Destroyed
  - **Repair**: Supply units fix permanent maluses

### Morale & Suppression
- **Cohesion**: Squadmates must stay together
- **Morale States**:
  - Normal → Low (reduced accuracy/speed) → Routing (uncontrollable, flees)
- **Rally**: Officers/Commanders can rally routing units
- **Suppression**: Heavy weapons suppress area even on miss

### Vision & Stealth

```
Effective Range = Optics - Target Stealth

Example:
- Your optics: 500m
- Enemy stealth: 200m
- You see them at: 500 - 200 = 300m range
- But they're actually at 500m (accuracy penalty, no AP penalty)
```

**Ghost Signals**: Units outside visual range that fire or make noise appear as category icons (fades after seconds)

**LOS Tool**: Preview LOS from any point before moving

### Smoke Mechanics
| Type | Radius | Duration | Notes |
|------|--------|----------|-------|
| Grenades (Infantry) | 5m | 20s | Single use |
| Launchers (Vehicle) | 50m arc | 20s | Single use, semi-circle |
| Artillery Shells | 50m | 60s | Large area |
| Aerial Curtain | 1km line | 30s | Blocks ground and air vision |

---

## TERRAIN & MOVEMENT

### Vehicle Speeds
| Type | Road | Off-Road |
|------|------|----------|
| Tracked | 70 km/h | 50 km/h |
| Wheeled | 140 km/h | 100 km/h |
| Hover | 200 km/h | 200 km/h |
| Fly | 250 km/h | N/A |
| Aircraft | 1000-3000 km/h | N/A |

### Altitude Levels
1. **Grounded**: Surface level, required for resupply
2. **Hover**: 3-10 feet, terrain masking, vulnerable to all ground weapons
3. **Fly**: 100-5000 feet, standard CAS altitude
4. **Soar**: 10,000-50,000 feet, only long-range SAMs effective
5. **Space**: 400km orbital, immune to ground AA, requires Forward Observer

### Terrain Types
| Terrain | Move % | Cover | LOS | Special |
|---------|--------|-------|-----|---------|
| Road | 100% | None | Clear | - |
| Field/Plains | 80% | Light | Clear | - |
| Forest | 50% | Heavy | Blocked | Fire risk |
| Building | - | Full | Blocked | Garrisonable |
| River | 0% | - | Clear | Amphibious/Hover only |
| Hill | 70% | Light | Elevated | Crest advantage |
| Marsh/Mud | Special | None | Clear | Bogging risk |
| Rubble | Special | Light | Partial | Blowout/derail risk |

### Special Terrain Effects

**Soft Ground (Marsh, Mud, Snow)**
- Wheeled: 50% speed, 10% bog chance per 5km
- Tracked: 75% speed, 5% bog chance
- Infantry: 90% speed, no penalty
- Hover: 100% speed, immune

**Rough Ground (Rubble, Rocky, Dense Forest)**
- Wheeled: 10% speed, 15% tire blowout chance (1 spare)
- Tracked: 25% speed, 5% derail chance (crew repair, no supply needed)
- Infantry: 85% speed, no penalty
- Hover: 85% speed, no penalty

### Terrain Destructibility
- Buildings → Ruins (rough terrain, not garrisonable)
- Forests → Can burn (damage over time, creates smoke)

---

## COVER & GARRISON

### Garrison System
- **Sectors**: Buildings grouped into sectors, not individual rooms
- **Who Can Enter**: Infantry, Walkers, Bikers
- **Entry Time**: Infantry fast, Walkers/Bikers slow
- **Height Advantage**: Taller buildings see further but are more visible

### Field Works (Infantry can build)
- **Sandbags**: Light cover, quick build
- **Trenches**: Heavy cover, protects from indirect fire
- **Tank Traps/Barbed Wire**: Slows enemy movement

---

## ABILITIES & KEYWORDS

### Passive Keywords
- **Assault**: +Suppression at close range (<300m)
- **Recon**: Spotting radius removes arty accuracy penalty
- **Resolute**: +1 effective veterancy for morale checks
- **Infiltrator**: +Stealth when stationary in cover
- **Forward Deploy**: Can deploy ahead of normal zone (+Xm)
- **Amphibious**: Can cross water

### Active Abilities (Special Units)
- **Smoke Grenades/Launchers**: Deploy smoke screen
- **Deep Strike**: Deploy mid-match behind enemy lines
- **Psychic Powers**: Smite (damage), Warp Storm (AoE), Precognition (reveal)

---

## ECONOMY & LOGISTICS

### Credits
- **Starting**: 1500 credits
- **Income**: +10 credits per tick (4 seconds)
- **Usage**: Call in reinforcements from deck

### Capture Zones
- **Only Commanders can capture**
- **States**: Neutral → Capturing → Controlled → Contested
- **Capture Time**: 10-30 seconds uninterrupted
- **Points**: 1-3 VP per second depending on zone importance

### Resupply
- **Universal**: Supply units can refuel, rearm, repair, heal
- **FOB**: Massive supply depot, refills supply trucks
- **Aircraft**: Must land (Grounded) OR evacuate off-map

### Transports
- **Deck Choice**: Select transport during deck building
- **Basic Transport Refund**: 100% cost back if despawned
- **Combat Transport**: No refund, stays as combat unit
- **Destruction**: Passengers take heavy damage, usually fatal

---

## VETERANCY SYSTEM

### Ranks (0-4)
| Rank | Name | Effects |
|------|------|---------|
| 0 | Rookie | Base stats |
| 1 | Trained | +5% accuracy, morale |
| 2 | Regular | +10% accuracy, morale, reload |
| 3 | Veteran | +15% all combat stats |
| 4 | Elite | +20% all, faster morale recovery |

### Gaining Experience
- Destroying enemies
- Surviving under fire (damaged but repaired)

### Commander Aura
All friendly units within commander's radius gain +1 effective rank

### Deck Trade-off
Higher veterancy = fewer units per card
- Rookie card: 8x units
- Veteran card: 4x units
- Elite card: 2x units

---

## AI PLAYERS (CPU)

### Difficulty Levels
| Difficulty | Reaction Time | Micro | Macro | Cheats |
|------------|---------------|-------|-------|--------|
| Easy | Slow (2-3s) | Poor | Basic | None |
| Medium | Normal (1s) | Average | Decent | None |
| Hard | Fast (0.5s) | Good | Strategic | None |

### AI Behaviors
- **Deployment**: Place units in reasonable positions based on division type
- **Economy**: Manage credits, call in reinforcements appropriately
- **Combat**:
  - Engage enemies within range
  - Use cover when available
  - Retreat damaged units
  - Focus fire on weakened targets
- **Objectives**:
  - Capture zones with commanders
  - Defend held zones
  - Support allied units
- **Team Coordination**: AI players coordinate attacks and defense with teammates

### AI Deck Selection
- CPU players use pre-built decks appropriate to their team's needs
- Deck variety: Armored, Infantry, Recon, Support compositions
- AI tries to fill team gaps (if team lacks recon, AI might pick recon division)

---

## PROCEDURAL MAP GENERATION

Generate European-style town maps with:

### Visual Elements
- Cobblestone streets, brick/stone buildings
- Churches, town squares, factories
- Forests, hedgerows, fields
- Rivers with bridges, elevation changes

---

## TERRAIN RENDERING & FORESTS

### Ground Rendering
The terrain should have smooth, continuous coloring with soft transitions:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    ░░░░░▒▒▒▓▓▓███████████████████▓▓▓▒▒▒░░░░░                  │
│   ░░░░▒▒▒▓▓████  FOREST ZONE  █████▓▓▒▒▒░░░░                   │
│    ░░▒▒▓▓████  (5+ trees = zone) ████▓▓▓▒▒░░                   │
│     ░▒▓███   🌲🌲🌲🌲🌲🌲🌲   ███▓▒░                            │
│      ▓██   🌲🌲  🌲🌲  🌲🌲   ██▓                               │
│       █   🌲  🌲🌲🌲🌲  🌲   █                                  │
│           🌲🌲  🌲  🌲🌲                                        │
│                                                                 │
│   Gradient: Field → Forest Edge → Dense Forest                 │
│             (light) → (medium) → (dark green)                   │
└─────────────────────────────────────────────────────────────────┘
```

### Forest Zone Rules

**Forest Zones (5+ trees clustered)**
- Draw smooth ground color underneath showing forest boundary
- Gradient from field color → darker forest floor color
- Edge should be soft/feathered, not jagged
- Provides cover bonus to ALL units inside
- Blocks LOS through the zone
- Reduces movement speed

**Isolated Trees (< 5 trees)**
- NO ground color change (just individual tree models)
- Purely visual decoration for most units
- **Exception**: 2-man infantry teams can use single trees as cover
- Does NOT block LOS for larger units
- Does NOT affect movement speed

```
FOREST ZONE (5+ trees)              ISOLATED TREES (< 5)
┌─────────────────────┐             ┌─────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │             │                     │
│ ▓▓🌲🌲  🌲🌲  🌲🌲▓▓ │             │   🌲     🌲         │
│ ▓▓  🌲🌲🌲🌲🌲  ▓▓ │             │      🌲              │
│ ▓▓🌲  🌲  🌲  🌲▓▓ │             │                     │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │             │                     │
│                     │             │                     │
│ ✓ Ground color      │             │ ✗ No ground color   │
│ ✓ Cover for all     │             │ ✓ Cover for 2-man   │
│ ✓ Blocks LOS        │             │ ✗ No LOS blocking   │
│ ✓ Slows movement    │             │ ✗ No movement penalty│
└─────────────────────┘             └─────────────────────┘
```

### Tree Clustering Algorithm
1. Place trees based on noise/procedural generation
2. Run clustering algorithm to group nearby trees (within 20m)
3. Clusters with 5+ trees become "Forest Zones"
4. Generate smooth convex hull or alpha shape for zone boundary
5. Render ground color with soft edge (10-15m feather)
6. Remaining isolated trees are decoration only

### Terrain Transitions
All terrain types should have smooth transitions:

| Transition | Edge Style | Width |
|------------|------------|-------|
| Field → Forest | Soft gradient | 10-15m |
| Field → Road | Hard edge | 1-2m |
| Field → Water | Soft gradient (shoreline) | 5-10m |
| Forest → Building | Hard edge | 2-3m |
| Hill → Flat | Smooth height blend | 20-30m |

### Ground Textures
| Terrain | Base Color | Texture |
|---------|------------|---------|
| Field | Light green/tan | Grass, wheat |
| Forest Floor | Dark green/brown | Leaves, undergrowth |
| Road | Gray/brown | Cobblestone, dirt |
| Urban | Gray | Concrete, pavement |
| Water | Blue | Animated ripples |
| Hill | Green/brown | Rocky grass |

### Small Unit Cover Rules
| Unit Size | Can Use Single Tree | Can Use Forest Zone |
|-----------|---------------------|---------------------|
| 2-man team (snipers, scouts) | ✓ Full cover | ✓ Full cover |
| 4-6 man squad | ✗ No cover | ✓ Full cover |
| 10+ man squad | ✗ No cover | ✓ Full cover |
| Vehicles | ✗ No cover | ✓ Partial cover |

---

## ROAD SYSTEM & NETWORK

### Road Hierarchy
Maps feature a realistic road network with 4 tiers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  DEPLOY A                                                    DEPLOY B  │
│     ║                                                           ║      │
│     ║ ═══════════════════ HIGHWAY ═══════════════════════════ ║      │
│     ║         ║                              ║                  ║      │
│     ║    ─────╫───── SECONDARY ──────────────╫─────            ║      │
│     ║         ║           │                  ║                  ║      │
│     ║    ┌────╫───┐      │            ┌─────╫────┐            ║      │
│     ║    │  TOWN  │   ···│····        │   TOWN   │            ║      │
│     ║    │ street │   dirt road       │  street  │            ║      │
│     ║    │ ─┬─┬─  │      │    🏚️     │  ─┬─┬─   │            ║      │
│     ║    │  │ │   │   ···│···farm     │   │ │    │            ║      │
│     ║    └──┴─┴───┘      │            └───┴─┴────┘            ║      │
│     ║                    │                                      ║      │
│     ╚════════════════════╧══════════════════════════════════════╝      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Road Types

| Type | Width | Lanes | Units Side-by-Side | Speed Bonus | Surface |
|------|-------|-------|-------------------|-------------|---------|
| Highway | 12-16m | 2-3 | 3 vehicles or 6 infantry | 100% | Paved asphalt |
| Secondary Road | 8-10m | 2 | 2 vehicles or 4 infantry | 90% | Paved/gravel |
| Town Street | 5-7m | 1-2 | 1-2 vehicles or 3 infantry | 85% | Cobblestone |
| Dirt Road | 3-4m | 1 | 1 vehicle or 2 infantry | 70% | Dirt/gravel |

### Lane Mechanics

**Single-Lane Roads (Dirt, Narrow Streets)**
```
    ───────────────────────────
    →  🚗  →  🚗  →  🚗  →     Single file only
    ───────────────────────────
```
- Units must travel single-file
- No overtaking possible unless road widens
- Slower units block faster units behind them
- Creates natural chokepoints

**Multi-Lane Roads (Highways, Main Roads)**
```
    ═══════════════════════════
    →  🚗  →  🚗  →            Lane 1
    ───────────────────────────
    →  🚗  →  🚗  →  🚗  →     Lane 2
    ═══════════════════════════
```
- Faster units automatically overtake slower ones
- Convoys can travel in parallel
- Mixed unit types sort by speed when possible

### Overtaking System

**Conditions for Overtaking:**
1. Road has 2+ lanes available
2. Adjacent lane is clear (no unit blocking)
3. Overtaking unit is faster than unit ahead
4. Sufficient space to complete overtake

**Overtaking Behavior:**
```
BEFORE:                        DURING:                       AFTER:
═══════════════════           ═══════════════════           ═══════════════════
    🚗 fast (blocked)             🚗→ (moving out)              🚗 fast (ahead)
───────────────────           ───────────────────           ───────────────────
    🚜 slow                       🚜 slow                       🚜 slow
═══════════════════           ═══════════════════           ═══════════════════
```

**Priority Rules:**
1. Faster units have overtake priority
2. Combat units prioritized over logistics
3. Units on "Fast Move" command actively seek overtakes
4. Units on normal move wait for natural opportunities

### Road Network Generation

**Highway (1-2 per map)**
- Primary route connecting deployment zones
- Relatively straight with gentle curves
- Passes through or near major towns
- Strategic importance: fastest route but predictable

**Secondary Roads (3-5 per map)**
- Branch off from highways
- Connect towns to each other
- Provide flanking routes
- Medium speed, less predictable

**Town Streets**
- Grid or organic layout within settlements
- Connect all buildings to road network
- Intersections every 50-100m
- Some one-way or narrow sections

**Dirt Roads (Farmland)**
- Connect isolated buildings (farms, barns, windmills)
- Often wind through fields and forests
- May dead-end at farms
- Unpaved, slower but provide alternate routes

### Building Connections

| Building Type | Road Connection | Typical Road Type |
|---------------|-----------------|-------------------|
| Town Center | Multiple | Secondary + Streets |
| Residential | At least 1 | Town Street |
| Factory | 1-2 | Secondary Road |
| Farm | 1 | Dirt Road |
| Barn | 0-1 | Dirt Road (may be off-road) |
| Church | 1-2 | Town Street |
| Gas Station | 1 | Highway or Secondary |

### Traffic Flow Considerations

**Chokepoints**
- Bridges (single lane usually)
- Town centers (narrow streets)
- Dirt road sections
- Strategic value for defense/ambush

**Road Damage**
- Artillery can crater roads
- Damaged sections reduce speed to off-road
- Engineers can repair
- Craters block narrow roads completely

---

## MOVEMENT PATH VISUALIZATION

### Path Display
When units are given movement orders, display a clear visual path on the ground:

```
SINGLE ORDER                      QUEUED ORDERS (Shift+Click)
┌─────────────────────────┐       ┌─────────────────────────┐
│                         │       │                         │
│  🚗━━━━━━━━━━━━━━━●    │       │  🚗━━━━━━●══════●       │
│     (green path)   dest │       │    move    attack       │
│                         │       │   (green)  (red)        │
│                         │       │                  ●      │
│                         │       │                reverse  │
│                         │       │                (blue)   │
└─────────────────────────┘       └─────────────────────────┘
```

### Path Colors by Order Type

| Order Type | Color | Line Style | Description |
|------------|-------|------------|-------------|
| Move | Green | Solid | Standard movement |
| Fast Move | Bright Green | Dashed | High speed, no stealth |
| Attack Move | Orange | Solid + dots | Move, engage enemies |
| Hunt | Red | Solid | Move to attack target |
| Reverse | Blue | Solid | Back up, front armor facing |
| Unload | Yellow | Dotted | Move then dismount |
| Retreat | White | Dashed | Fall back to safety |

### Path Rendering

**Visual Style:**
```
           Waypoint marker (circle)
                  │
    ━━━━━━━━━━━━━●━━━━━━━━━━━━━━●
    │                            │
Path line (colored)         Destination marker
(follows terrain/roads)      (larger circle or flag)
```

**Path Properties:**
- Path hugs terrain (follows hills, goes around obstacles)
- Shows actual A* pathfinding result, not straight line
- Road sections clearly visible (path snaps to roads)
- Slightly elevated above ground to prevent z-fighting
- Semi-transparent to not obscure units/terrain
- Width: ~1-2m in world space

### Real-Time Path Updates

**Path updates as unit moves:**
```
TIME 0:                    TIME 1:                    TIME 2:
━━━━━━━━━━━━━━●           ━━━━━━━━━━●               ━━━━●
🚗                          🚗                          🚗
(full path shown)         (passed sections gone)    (almost there)
```

- Path always shows REMAINING route only
- Completed path segments disappear immediately
- No "trail" or history - always forward-looking
- Path recalculates if blocked or new order given

### Order Queue System

**Shift+Click to Queue:**
- Hold Shift while issuing orders to append to queue
- Each queued order connects to previous destination
- Different order types show different colors per segment

**Queue Visualization:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🚗━━━━━━━━━●═══════════●- - - - - ●●●●●●●●●●●●●●●●●●●●●●● │
│     Move      Attack      Reverse     Hunt (to enemy)       │
│    (green)    (orange)    (blue)      (red)                 │
│                                                             │
│  Queue: [1.Move→A] [2.Attack→B] [3.Reverse→C] [4.Hunt→Enemy]│
└─────────────────────────────────────────────────────────────┘
```

**Waypoint Markers:**
| Marker | Meaning |
|--------|---------|
| ● Small circle | Intermediate waypoint |
| ◉ Large circle | Final destination |
| ⊕ Crosshair | Attack target |
| ◐ Half circle | Reverse end point |
| ▼ Triangle | Unload point |

### Setup Phase Pre-Orders

During deployment/setup phase, players can issue orders that execute when battle starts:

```
SETUP PHASE:                           BATTLE STARTS:
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│  DEPLOYMENT ZONE                │   │                                 │
│  ┌───┐                          │   │  ┌───┐                          │
│  │🚗│╌╌╌╌╌╌╌╌╌╌╌●              │   │  │🚗│━━━━━━━━━━━●              │
│  └───┘ (pending - dashed)       │   │  └───┘ (executing - solid)      │
│                                 │   │                                 │
│  Orders pending: "Move to A"    │   │  Order executing!               │
└─────────────────────────────────┘   └─────────────────────────────────┘
```

**Pre-Order Rules:**
- Orders shown as dashed/faded lines during setup
- Cannot order outside deployment zone until battle starts
- Can queue multiple orders for battle start
- Units execute immediately when phase changes
- Allows coordinated team pushes at game start

### Path Interaction

**Modifying Queued Orders:**
- Click waypoint to select that order
- Drag waypoint to modify destination
- Press Delete to remove order from queue
- Right-click waypoint for context menu (change order type)

**Canceling Orders:**
- Press Escape: Cancel current/selected order
- Press S (Stop): Clear entire queue, halt unit
- Right-click unit: Cancel all, issue new order

### Multi-Unit Paths

When multiple units selected:
```
┌─────────────────────────────────────┐
│                                     │
│  🚗━━━━━━━━┓                        │
│  🚗━━━━━━━━╋━━━━━━━●  (converge)    │
│  🚗━━━━━━━━┛                        │
│                                     │
│  OR with formation:                 │
│                                     │
│  🚗━━━━━━━━━━━━━━●                 │
│  🚗━━━━━━━━━━━━━━━●  (parallel)    │
│  🚗━━━━━━━━━━━━━━━━●               │
│                                     │
└─────────────────────────────────────┘
```

- Individual paths shown for each unit
- Paths may overlap on roads (show as thicker line)
- Formation orders show parallel paths maintaining spacing

---

## FORMATION MOVEMENT & LINE DRAWING

### Line Formation (Right-Click Drag)

When multiple units are selected and given a movement order, holding right-click and dragging draws a formation line:

```
DRAWING A LINE FORMATION:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Selected: 🚗🚗🚗🚗🚗 (5 tanks)                                │
│                                                                 │
│  1. Right-click at start point                                  │
│  2. HOLD and drag to draw line                                  │
│  3. Release to confirm                                          │
│                                                                 │
│  ╭─────────────────────────────────────────────────╮            │
│  │                                                 │            │
│  │    Start ●━━━━━━━━━━━━━━━━━━━━━━━━━● End       │            │
│  │          ↑     ↑     ↑     ↑     ↑             │            │
│  │          🚗    🚗    🚗    🚗    🚗            │            │
│  │       (units distributed evenly along line)    │            │
│  │                                                 │            │
│  ╰─────────────────────────────────────────────────╯            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Line Formation Rules:**
1. Units are evenly spaced along the drawn line
2. Spacing calculated: `line_length / (num_units - 1)`
3. Each unit receives individual destination point
4. Works with all movement orders (Move, Fast Move, Hunt, Reverse, etc.)

### Facing Direction (Automatic)

Units automatically determine facing based on line shape:

```
STRAIGHT LINE = BATTLE LINE (all face forward)
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│         ←  ←  ←  ←  ←   (all facing same direction)            │
│         🚗 🚗 🚗 🚗 🚗                                          │
│         ●━━●━━●━━●━━●   (line is mostly straight)              │
│                                                                 │
│  Facing: Perpendicular to line, toward "forward"               │
│  Forward = far side of the line from current position(the drive up to the line, they dont turn around)           │
│            
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

CURVED LINE = DEFENSIVE ARC (face outward)
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│              ↑                                                  │
│            🚗                                                   │
│         ↖ ● ↗                                                  │
│       🚗●     ●🚗    (curved/arc formation)                    │
│      ↙         ↘                                               │
│     🚗●       ●🚗                                              │
│      ↓         ↓                                                │
│                                                                 │
│  Facing: Outward from curve center (covering each other's rear)│
│  Curve detection: If total angle change > 45° across line      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Facing Calculation:**
| Line Type | Detection | Facing Direction |
|-----------|-----------|------------------|
| Straight | Angle variance < 45° | Perpendicular to line (toward enemy/center) |
| Curved | Angle variance ≥ 45° | Outward from curve's center of curvature |
| U-Shape | Endpoints closer than midpoint | Outward (defensive perimeter) |

### Single Point Orders (No Drag / Click Only)

When multiple units receive a move command to a single point (right-click without drag):

```
PROBLEM: All units try to reach same point
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  🚗🚗🚗 ─────────────────────────→ ●  (target)                 │
│                                    ↑                            │
│                              All 3 units trying                 │
│                              to occupy same spot!               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

SOLUTION: Auto-spread around target point
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  🚗🚗🚗 ───────────────────→  🚗                               │
│                              🚗 ● 🚗  (clustered around target) │
│                                                                 │
│  Unit destinations:                                             │
│  - 1st unit: Exact target point (center)                       │
│  - Others: Evenly spaced in ring around center                 │
│  - Spacing: Minimum to avoid collision (unit size + buffer)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Auto-Spread Algorithm:**
1. First unit goes to exact click position
2. Calculate minimum safe distance (based on unit collision radii)
3. Remaining units placed in concentric rings:
   - Ring 1: Up to 6 units at `min_distance` from center
   - Ring 2: Up to 12 units at `2 × min_distance`
   - Continue as needed
4. Units assigned to nearest available slot

```
AUTO-SPREAD PATTERN (9 units example):
┌───────────────────────────────────┐
│                                   │
│           7   2   8              │
│                                   │
│           3   1   4   ← Ring 1   │
│               ●                   │
│           9   5   6              │
│                                   │
│         Ring 2 (outer)           │
│                                   │
└───────────────────────────────────┘
```

### Short Line = Facing Direction

If the drawn line is too short for all units to fit without colliding:

```
LINE TOO SHORT FOR FORMATION:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  5 units selected, but line drawn is only 10m                  │
│  (tanks need ~15m spacing each = 60m minimum for 5)            │
│                                                                 │
│  User draws: ●━━● (short drag downward)                        │
│                                                                 │
│  Result: Move to point + FACE in drag direction                │
│                                                                 │
│           🚗                                                    │
│         🚗 ● 🚗   All units cluster at destination             │
│           🚗     but FACE DOWNWARD (drag direction)            │
│           ↓↓↓↓↓                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Threshold Calculation:**
```
min_line_length = (num_units - 1) × min_unit_spacing

Example:
- 5 tanks selected
- Tank spacing = 12m (collision radius × 2 + buffer)
- Minimum line = 4 × 12m = 48m

If drawn line < 48m:
  → Treat as "point order with facing direction"
  → Auto-spread units around midpoint
  → All units face in drag direction
```

### Single Unit Selection

For a single unit, line drawing ALWAYS means facing direction:

```
SINGLE UNIT + DRAG = FACING DIRECTION
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  🚗 ─────────────────────→ ●━━━● (drag down-right)             │
│                             ↘                                   │
│                            🚗  (arrives facing down-right)      │
│                                                                 │
│  Line formations don't make sense for 1 unit                   │
│  So ANY drag = facing direction at destination                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Formation Types Summary

| Units | Line Length | Result |
|-------|-------------|--------|
| 1 | Any drag | Move to start point, face toward end point |
| 2+ | No drag (click) | Auto-spread around click point, default facing |
| 2+ | Short drag | Auto-spread around midpoint, face in drag direction |
| 2+ | Long drag (straight) | Line formation, all face perpendicular (battle line) |
| 2+ | Long drag (curved) | Arc formation, face outward (defensive) |

### Visual Feedback While Dragging

```
DRAG PREVIEW (shown while holding right-click):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Selected units: 🚗🚗🚗🚗                                       │
│                                                                 │
│  Mouse down ●                                                   │
│              ╲                                                  │
│               ╲                                                 │
│                ╲                                                │
│                 ● Current mouse position                        │
│                                                                 │
│  PREVIEW SHOWS:                                                 │
│  ─ Line/arc being drawn (dashed during drag)                   │
│  ─ Ghost positions where units will go (semi-transparent)      │
│  ─ Facing arrows for each ghost unit                           │
│  ─ "LINE" or "FACING" mode indicator                           │
│                                                                 │
│  Preview line color matches order type (green/red/blue/etc)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Order Types with Formation

All movement orders support line/formation drawing:

| Order | Key + Right Drag | Behavior |
|-------|------------------|----------|
| Move | Right Drag | Line formation, normal speed |
| Fast Move | F + Right Drag | Line formation, max speed |
| Attack Move | A + Right Drag | Line formation, engage en route |
| Hunt | H + Right Drag | Line toward target, all attack same enemy |
| Reverse | R + Right Drag | Line formation, backing up (front armor forward) |
| Unload | E + Right Drag | Line formation, dismount at positions |

---

### Fast Move & Road Preference

When units are given "Fast Move" orders:
1. Pathfinding heavily weights road travel
2. Units will take longer road routes if faster overall
3. Automatically uses best available road tier
4. Actively seeks overtaking opportunities
5. Ignores stealth (engines at full power)

**Path Cost Calculation:**
```
Cost = Distance / (Speed × Road Modifier)

Example: 1km to target
- Direct off-road: 1000m / (50 km/h × 0.8) = 25 units
- Via highway (+500m): 1500m / (70 km/h × 1.0) = 21.4 units ← Faster!
```

### Layout Structure
- Deployment zones at opposite edges
- 3-7 capture zones at strategic points
- 1-2 highways connecting deployment zones
- Secondary roads providing flanking routes
- Town streets forming urban networks
- Dirt roads connecting rural buildings

### Map Sizes
| Size | Area | Zones | Towns |
|------|------|-------|-------|
| Small | 1km² | 3 | 1-2 |
| Medium | 2km² | 4-5 | 2-3 |
| Large | 3km² | 5-7 | 3-4 |

---

## INPUT CONTROLS

### Mouse
| Input | Action |
|-------|--------|
| Left Click | Select / Place unit |
| Left Drag | Box selection |
| Double-Click | Select all same type in view |
| Right Click (ground) | Move |
| Right Click (enemy) | Attack |
| Right Click (transport) | Mount |
| Right Click (building) | Garrison |
| Right Drag | Formation/facing line |
| Middle Drag | Pan camera |
| Scroll | Zoom |

### Keyboard
| Key | Action |
|-----|--------|
| WASD / Arrows | Pan camera |
| Tab | Cycle selection types |
| Shift+Click | Add to selection |
| Ctrl+A | Select all |
| Escape | Cancel / Pause menu |
| Enter | Start battle / Confirm |
| Q | Quick unload |
| L / Delete | Sell unit |
| C | LOS preview when held down |
| Space | Center on selection |
| 1-9 | Control groups |
| Ctrl+1-9 | Assign control group |

### Movement Modifiers (Hold + Right Click)
| Key | Mode |
|-----|------|
| R | Reverse (back up, front armor facing) |
| F | Fast move (ignore stealth) |
| A | Attack move (engage enemies en route) |
| E | Unload at position |
| Z | Toggle weapons hold (return fire only) |

### Camera
- WASD/Arrows/Edge Pan: Pan camera
- Middle Drag: Pan camera
- Scroll: Zoom (5-150m height)
- Height > 60m: Tactical view (unit icons)

---

## SELECTION & SUB-SELECTION SYSTEM

### Multi-Unit Selection Defaults
When multiple units are selected, commands apply to ALL selected units by default.

### Tab Sub-Selection Cycling
Press Tab to cycle through unit type sub-groups within your selection:

```
EXAMPLE: Box select 3 tanks + 2 infantry + 1 recon

Tab Cycle:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [ALL SELECTED] → Tab → [TANKS ONLY] → Tab → [INFANTRY ONLY]   │
│        ↑                                                   │    │
│        └──────────────── Tab ──────────────────────────────┘    │
│                          ↓                                      │
│                   [RECON ONLY] → Tab →                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Visual indicator shows current sub-selection:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  SELECTED: 6 units                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [ALL]  [TNK: 3]  [INF: 2]  [REC: 1]                     │   │
│  │   ▲                                                      │   │
│  │  active                                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  After pressing Tab:                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [ALL]  [TNK: 3]  [INF: 2]  [REC: 1]                     │   │
│  │            ▲                                             │   │
│  │         active (only tanks receive commands now)         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Sub-Selection Rules:**
| State | Commands Apply To | Visual |
|-------|-------------------|--------|
| ALL (default) | Every selected unit | All units highlighted |
| Type sub-selection | Only that unit type | Only sub-type highlighted, others dimmed |

**Sub-Selection Behaviors:**
1. Orders only affect the active sub-selection
2. Sub-selection resets to ALL when:
   - New selection is made (click, box select)
   - Units are added to selection (Shift+Click)
   - Escape is pressed
3. Sub-selection persists through multiple orders
4. Categories cycle in order: ALL → first type → second type → ... → ALL

**Use Case - Combined Arms Assault:**
```
1. Box select mixed force (tanks + infantry + support)
2. Press Tab → sub-select tanks
3. Right-click to send tanks forward
4. Press Tab → sub-select infantry
5. Right-click to send infantry to buildings
6. Press Tab → sub-select support
7. Right-click to position support vehicles
8. Press Tab → back to ALL for next maneuver
```

### Double-Click Same-Type Selection

Double-clicking a unit selects all units of the **same type currently visible on screen**:

```
DOUBLE-CLICK BEHAVIOR:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  VISIBLE ON SCREEN:           OFF-SCREEN (NOT selected):        │
│  ┌─────────────────────┐     ┌─────────────────────────────┐   │
│  │  🚗 🚗 🚗           │     │  🚗 🚗 (same type but       │   │
│  │  (3 Leman Russ)     │     │   not visible = ignored)    │   │
│  │                     │     │                             │   │
│  │  🚙 🚙              │     │  🚙 (also ignored)          │   │
│  │  (2 Chimeras)       │     │                             │   │
│  └─────────────────────┘     └─────────────────────────────┘   │
│                                                                 │
│  Double-click on one Leman Russ → selects all 3 visible        │
│  The 2 off-screen Leman Russ are NOT selected                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Same-Type Matching:**
- Matches by exact unit type (not just category)
- "Leman Russ" ≠ "Baneblade" (both TNK, but different types)
- Infantry squads of same type match each other

**Visibility Rules:**
- Unit must be within current camera viewport
- Unit must not be in fog of war (must be visible to player)
- Unit must belong to player's team

**Modifier Combinations:**
| Action | Result |
|--------|--------|
| Double-Click | Select all same type in view |
| Shift + Double-Click | ADD all same type in view to current selection |
| Ctrl + Double-Click | Select all same type on ENTIRE MAP |

---

## TACTICAL VIEW & UNIT UI

### Tactical View (Zoomed Out)
When camera height exceeds **60m**, switch from 3D models to 2D tactical icons:

```
NORMAL VIEW (< 60m)              TACTICAL VIEW (> 60m)
┌─────────────────────┐          ┌─────────────────────┐
│                     │          │                     │
│    [3D Tank Model]  │    →     │    ◆ TNK           │
│                     │          │    ━━━━ (health)   │
│                     │          │                     │
└─────────────────────┘          └─────────────────────┘
```

**Tactical Icons by Category:**
| Category | Icon | Color |
|----------|------|-------|
| LOG | ⬡ (hexagon) | Yellow |
| INF | ● (circle) | Green |
| TNK | ◆ (diamond) | Blue |
| REC | ◇ (hollow diamond) | Cyan |
| AA | ▲ (triangle up) | Orange |
| ART | ◐ (half circle) | Purple |
| HEL | ⬢ (hexagon) | Light Blue |
| AIR | ✈ (plane) | White |
| CMD | ★ (star) | Gold |

**Tactical View Features:**
- Icons scale with unit size (squads larger than single vehicles)
- Team colors: Friendly = Blue/Green, Enemy = Red, Neutral = Gray
- Selected units have white outline
- Grouped units show count badge
- Fog of war dims icons

### Unit UI Indicators (Always Visible)

```
          ┌─ Veterancy Stars (★★★☆☆)
          │
    ┌─────┴─────┐
    │  ★★★☆☆   │
    │   UNIT    │
    │  [MODEL]  │
    └───────────┘
          │
    ┌─────┴─────────────────────────────────┐
    │  ████████░░░░  HP (green → yellow → red)
    │  ██████░░░░░░  Morale (blue → gray)
    └───────────────────────────────────────┘
          │
    ┌─────┴─────────────────────────────────┐
    │         Aim Indicator (circular)       │
    │              ╭───╮                     │
    │           ╭──┤   ├──╮  ← Cone shows   │
    │          ╱   │ ● │   ╲   aim direction│
    │         ╱    ╰───╯    ╲  + accuracy   │
    │        ╱_______________╲               │
    └───────────────────────────────────────┘
          │
    ┌─────┴─────────────────────────────────┐
    │        Reload Indicator (per weapon)   │
    │                                        │
    │   Main Gun:  ████████░░ 80%           │
    │   MG:        ██████████ READY         │
    │   Missiles:  ░░░░░░░░░░ RELOADING     │
    └───────────────────────────────────────┘
```

### Health Bar
- **Position**: Below unit, always facing camera (billboard)
- **Colors**:
  - Green (100-60%)
  - Yellow (60-30%)
  - Red (30-0%)
- **Width**: Scales with unit max HP
- **Critical Damage**: Flashing red when < 20%

### Morale Bar
- **Position**: Below health bar
- **Colors**:
  - Blue (100-50%) - Steady
  - Gray (50-25%) - Shaken
  - Flashing Gray (25-0%) - Breaking/Routing
- **Icon overlay**: 💀 skull when routing

### Aim Indicator (Circular Arc)
- **Shape**: Cone/arc from unit center toward target
- **Width**: Represents accuracy (narrow = accurate, wide = inaccurate)
- **Color**:
  - Green: Target in optimal range
  - Yellow: Target at long range
  - Red: Target out of range or no LOS
- **Rotation**: Updates in real-time as unit aims
- **Turret sync**: For vehicles, shows turret rotation progress

### Reload Indicators
- **Position**: Small circular indicators around unit or in selection panel
- **Per-weapon display**: Each weapon has own indicator
- **Style**: Radial fill (like a pie chart filling up)
- **States**:
  - Empty: Reloading (shows progress %)
  - Full + Green: Ready to fire
  - Red X: Out of ammo
  - Gray: Weapon disabled (malus)

### Status Icons (Above Unit)
Small icons indicating current status:
| Icon | Meaning |
|------|---------|
| 🔧 | Being repaired |
| ⛽ | Refueling |
| 📦 | Rearming |
| 🏃 | Fast moving |
| 🔙 | Reversing |
| 🎯 | Attack move |
| ⚠️ | Suppressed |
| 💨 | In smoke |
| 🏠 | Garrisoned |
| 🚗 | In transport |

### Selection Panel (Bottom of Screen)
When units selected, show detailed info:

```
┌────────────────────────────────────────────────────────────────────────┐
│  SELECTED: Leman Russ "Steel Thunder"           Vet: ★★★☆☆            │
├────────────────────────────────────────────────────────────────────────┤
│  HP: ████████░░ 8/10     Morale: ██████████ 100%                      │
│                                                                        │
│  WEAPONS                           STATUS                              │
│  ┌──────────────────────────┐     ┌──────────────────────────┐        │
│  │ Battle Cannon    [████] │     │ ✓ Weapons Enabled        │        │
│  │ Coax MG         [████] │     │ ✓ Engine OK              │        │
│  │ Smoke Launcher  [1/1]  │     │ ✗ Optics Damaged         │        │
│  └──────────────────────────┘     └──────────────────────────┘        │
│                                                                        │
│  [WEAPONS ON/OFF]  [SMOKE]  [RETREAT]  [REVERSE]  [UNLOAD]           │
└────────────────────────────────────────────────────────────────────────┘
```

### Multi-Unit Selection
When multiple units selected:

```
┌────────────────────────────────────────────────────────────────────────┐
│  SELECTED: 3 Units (2x Infantry, 1x Tank)                             │
├────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                               │
│  │ INF Sqd │  │ INF Sqd │  │ Leman   │   Average HP: 78%             │
│  │ ████░░  │  │ ██████  │  │ ████░░  │   Average Morale: 85%         │
│  │ 6/10 HP │  │ 10/10   │  │ 8/10    │                               │
│  └─────────┘  └─────────┘  └─────────┘                               │
│                                                                        │
│  [WEAPONS ON/OFF]  [SMOKE]  [RETREAT]  [ATTACK MOVE]  [STOP]         │
└────────────────────────────────────────────────────────────────────────┘
```

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
29. Tree clustering algorithm (5+ = forest zone)
30. Smooth terrain transitions (gradient edges)
31. Ground textures and colors
32. Forest zone ground rendering (soft feathered edges)

### Phase 5: Battle Foundation
33. Input system (all mouse/keyboard controls)
34. RTS camera (pan, zoom, edge scroll)
35. Tactical view (icons at height > 60m)
36. Selection system (click, box, control groups)
37. Double-click same-type selection (visible units only)
38. Tab sub-selection cycling (ALL → type1 → type2 → ALL)
39. Sub-selection UI indicator (category tabs with counts)
40. Shift+Double-click to add same type to selection
41. Ctrl+Double-click to select same type map-wide
42. Unit class with all stats
43. Unit manager
44. Unit UI (health bars, morale bars, veterancy stars)
45. Aim indicators (circular arc with accuracy)
46. Reload indicators (radial fill per weapon)
47. Status icons (suppressed, repairing, etc.)
48. Selection panel (single and multi-unit)

### Phase 6: Deployment Phase
49. Deployment manager
50. Deployment UI (category tabs, unit cards)
51. Unit placement in zone
52. Unit repositioning (drag)
53. FOB placement (setup only)
54. Forward deploy support
55. Phase transition (Enter/Button → Combat)

### Phase 7: Movement & Pathfinding
56. A* pathfinding on terrain and roads
57. Road lane system (width determines capacity)
58. Overtaking mechanics on multi-lane roads
59. Movement modes (normal, fast, reverse, attack-move)
60. Fast move road preference calculation
61. Terrain speed modifiers
62. Vehicle terrain penalties (bog, blowout)
63. Path visualization renderer (line on ground)
64. Path color system (green/red/blue/orange/etc. per order type)
65. Real-time path updates (shrinks as unit moves)
66. Order queue system (Shift+Click to queue)
67. Queued path visualization (multi-colored segments)
68. Waypoint markers (intermediate, destination, target)
69. Setup phase pre-orders (pending paths, execute on battle start)
70. Path interaction (modify, cancel, context menu)
71. Right-click drag line formation drawing
72. Line formation unit distribution (evenly spaced)
73. Auto-facing for straight lines (battle line, perpendicular)
74. Auto-facing for curved lines (defensive arc, face outward)
75. Single-point auto-spread (prevent unit overlap)
76. Short line = facing direction detection
77. Single unit drag = facing direction
78. Formation drag preview (ghost positions, facing arrows)
79. Formation line minimum length threshold calculation

### Phase 8: Combat System
80. Weapon system with stats
81. Directional armor calculation
82. Kinetic scaling
83. Projectile simulation
84. Hit/damage calculation
85. Critical hits and maluses
86. Morale/suppression system
87. Routing and rally

### Phase 9: Vision & Detection
88. LOS calculation with terrain
89. Fog of war
90. Stealth/optics system
91. Ghost signals
92. LOS preview tool
93. Recon spotting bonus

### Phase 10: Advanced Systems
94. Veterancy gain and effects
95. Commander aura
96. Economy (income ticks)
97. Reinforcement calling
98. Supply system
99. Transport mount/dismount
100. Garrison system
101. Smoke mechanics
102. Altitude levels (aircraft)
103. Road damage and repair

### Phase 11: AI System
104. AI player framework
105. AI deployment logic
106. AI combat behaviors (engage, retreat, cover)
107. AI economy management
108. AI objective prioritization
109. AI difficulty scaling
110. AI team coordination

### Phase 12: Victory & Polish
111. Capture zone mechanics
112. Victory point tracking
113. Victory condition (2000 VP)
114. Pause menu
115. Victory/Defeat screen with stats
116. Minimap
117. UI polish and feedback
118. Sound effects (placeholder)

### Phase 13: Testing & Balance
119. Unit tests for all systems
120. E2E tests for game flow
121. AI behavior testing
122. Balance pass on units/weapons
123. Performance optimization
124. Bug fixes

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
- [ ] Unit stats display with comparison
- [ ] Veterancy selection affects unit count
- [ ] Transport selection popup
- [ ] Save/Load/Delete decks

### Map Generation
- [ ] Seed-based procedural generation
- [ ] European town aesthetic (buildings, roads)
- [ ] Terrain variety (forests, fields, rivers, hills)
- [ ] Strategic capture zone placement
- [ ] Deployment zones at map edges

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
- [ ] Routing and rally

### Advanced Systems
- [ ] Veterancy gain and effects
- [ ] Commander aura
- [ ] Economy with income ticks
- [ ] Transport mount/dismount
- [ ] Garrison system
- [ ] Smoke deployment
- [ ] Vision/stealth/fog of war
- [ ] Recon spotting bonus

### Victory
- [ ] Capture zones (commander-only capture)
- [ ] Victory point generation
- [ ] First to 2000 wins
- [ ] Victory screen with statistics

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

---

**START NOW**: Check `web/src/` state and continue from where you left off. Begin with Phase 1 if fresh. Ensure every screen is reachable via UI.
