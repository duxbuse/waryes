# Economy & Reinforcements

[← Back to Main](../RALPH_PROMPT.md)

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

### Capture Zone Visualization

Capture zones have a distinct visual representation showing ownership and capture progress:

```
CAPTURE ZONE VISUAL STATES:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  NEUTRAL ZONE              CAPTURING                  CONTROLLED                │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       │
│  │                 │       │   ╔═══╗         │       │█████████████████│       │
│  │     ╔═════╗     │       │ ╔═╝   ╚═╗       │       │█████████████████│       │
│  │    ╔╝     ╚╗    │       │╔╝ ●→→→  ╚╗      │       │███████████████████       │
│  │    ║       ║    │       │║  ░░░░   ║      │       │█████████████████│       │
│  │    ╚╗     ╔╝    │       │╚╗  ░░░  ╔╝      │       │█████████████████│       │
│  │     ╚═════╝     │       │ ╚═╗   ╔═╝       │       │█████████████████│       │
│  │                 │       │   ╚═══╝         │       │█████████████████│       │
│  └─────────────────┘       └─────────────────┘       └─────────────────┘       │
│   Gray border only          Radial fill from         Solid team color          │
│   No fill                   entry point (●)          fill with border          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Zone Border:**
- Visible border around the capture zone boundary
- Border color indicates current owner:
  - **Gray** = Neutral (no owner)
  - **Blue/Green** = Team 1 controlled
  - **Red** = Team 2 controlled
  - **Flashing/Pulsing** = Contested (both teams present)

**Capture Progress Animation:**

```
RADIAL FILL CAPTURE PROGRESS:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  Commander enters zone at position (●), fill radiates outward:                  │
│                                                                                 │
│  0%              25%              50%              75%              100%        │
│  ┌─────┐         ┌─────┐         ┌─────┐         ┌─────┐         ┌─────┐      │
│  │     │         │ ░   │         │░░░  │         │░░░░░│         │█████│      │
│  │  ●  │    →    │ ●░  │    →    │░●░░ │    →    │░●░░░│    →    │█●███│      │
│  │     │         │     │         │░░   │         │░░░░ │         │█████│      │
│  └─────┘         └─────┘         └─────┘         └─────┘         └─────┘      │
│                                                                                 │
│  ● = Commander entry point (origin of radial fill)                             │
│  ░ = Fill progress (team color, semi-transparent)                              │
│  █ = Complete capture (solid team color)                                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Visibility Rules for Capture Progress:**

| Observer's LOS | What They See |
|----------------|---------------|
| Has LOS to zone | Full radial fill animation from entry point |
| No LOS to zone | Only final color change when 100% captured |
| Had LOS, then lost it | Last seen state frozen until LOS regained or capture completes |

```
LOS-BASED CAPTURE VISIBILITY:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  WITH LINE OF SIGHT:                    WITHOUT LINE OF SIGHT:                  │
│  ┌───────────────────────────┐          ┌───────────────────────────┐          │
│  │                           │          │                           │          │
│  │   Player can see:         │          │   Player sees:            │          │
│  │   - Commander entry point │          │   - Zone border only      │          │
│  │   - Radial fill direction │          │   - Last known color      │          │
│  │   - Capture % progress    │          │   - NO progress visible   │          │
│  │   - Which team is capping │          │                           │          │
│  │                           │          │   When capture completes: │          │
│  │   ┌─────────┐             │          │   - Border color changes  │          │
│  │   │ ░░░░    │ 45%         │          │   - Fill snaps to 100%    │          │
│  │   │ ●░░░░   │             │          │                           │          │
│  │   │  ░░░    │             │          │   ┌─────────┐             │          │
│  │   └─────────┘             │          │   │█████████│ !           │          │
│  │                           │          │   │█████████│ (sudden)    │          │
│  │                           │          │   └─────────┘             │          │
│  └───────────────────────────┘          └───────────────────────────┘          │
│                                                                                 │
│  Strategic value: Players with vision can see WHERE enemy entered,             │
│  giving intel on enemy commander position and approach direction.              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Contested Zone Behavior:**

```
CONTESTED ZONE (multiple teams present):
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  When commanders from both teams are in the zone:                               │
│                                                                                 │
│  ┌───────────────────┐                                                          │
│  │▓▓▓░░░░░░░░░░░░▓▓▓│   - Border flashes/pulses between team colors           │
│  │▓▓▓░░░░░░░░░░░░▓▓▓│   - Capture progress FROZEN (no change)                  │
│  │▓▓▓░░░░░░░░░░░░▓▓▓│   - Both team fills shown (if both started capture)      │
│  │▓▓▓░░░░░░░░░░░░▓▓▓│   - "CONTESTED" indicator shown                          │
│  └───────────────────┘                                                          │
│                                                                                 │
│  ▓ = Team 1 fill    ░ = Team 2 fill                                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Zone Visual Properties:**

```typescript
interface CaptureZoneVisual {
  // Zone geometry
  radius: number;                    // Size of capture zone
  borderWidth: number;               // Thickness of border (2-4 pixels)

  // Ownership display
  ownerTeamId: string | null;        // null = neutral
  borderColor: string;               // Based on owner
  fillColor: string;                 // Based on owner (semi-transparent)
  fillOpacity: number;               // 0.3-0.6 when controlled

  // Capture progress
  captureProgress: number;           // 0.0 to 1.0
  captureOrigin: Vector3;            // Where commander entered (radial center)
  capturingTeamId: string | null;    // Which team is currently capturing

  // State
  isContested: boolean;              // Multiple commanders present
  isVisible: boolean;                // Does local player have LOS?
  lastKnownState: CaptureZoneState;  // State when LOS was lost
}
```

### Resupply
- **Universal**: Supply units can refuel, rearm, repair, heal
- **FOB**: Massive supply depot, refills supply trucks
- **Aircraft**: Must land (Grounded) OR evacuate off-map

### Resupply Points (Map Feature)
- **Fixed locations**: Placed during map generation at strategic positions
- **Neutral**: Not owned by either team, always accessible
- **Function**: Units in radius automatically resupply from nearby supply units
- **Visual**: Shown on minimap and map preview as ⬡ hexagon icon
- **Placement**: Near towns, road intersections, or strategic chokepoints
- **Typical count**: 2-4 per map depending on size

### Transports
- **Deck Choice**: Select transport during deck building
- **Basic Transport Refund**: 100% cost back if despawned
- **Combat Transport**: No refund, stays as combat unit
- **Destruction**: Passengers take heavy damage, usually fatal

---

## REINFORCEMENT & ENTRY POINTS

### Deployment Phase (Setup)
During the deployment/setup phase before battle begins:

```
DEPLOYMENT PHASE PLACEMENT:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    DEPLOYMENT ZONE                       │   │
│  │                                                         │   │
│  │   Click anywhere in zone → Unit appears instantly       │   │
│  │   Drag placed units → Reposition freely                 │   │
│  │   Right-click unit → Remove (refund credits)            │   │
│  │                                                         │   │
│  │      🚗  🚗  🚗     (units just "pop in")               │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────     │
│                     BATTLEFIELD                                 │
│  ─────────────────────────────────────────────────────────     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Deployment Phase Rules:**
- Units appear instantly at click location
- Can drag to reposition within deployment zone
- Can remove units for full credit refund
- FOB can ONLY be placed during this phase
- Forward Deploy units can place ahead of normal zone

### Battle Phase Reinforcements
Once battle begins, new units must enter through **Entry Points**:

```
REINFORCEMENT ENTRY POINTS:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  TEAM 1 SIDE                                                    │
│  ════════════════════════════════════════════════════════════  │
│       ║                    ║                    ║               │
│       ║                    ║                    ║               │
│    [ENTRY 1]           [ENTRY 2]            [ENTRY 3]          │
│    Highway             Secondary             Dirt Road         │
│    (fast)              (medium)              (slow)            │
│       ║                    ║                    ║               │
│       ▼                    ▼                    ▼               │
│                                                                 │
│                      BATTLEFIELD                                │
│                                                                 │
│       ▲                    ▲                    ▲               │
│       ║                    ║                    ║               │
│    [ENTRY A]           [ENTRY B]            [ENTRY C]          │
│       ║                    ║                    ║               │
│  ════════════════════════════════════════════════════════════  │
│  TEAM 2 SIDE                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Entry Point Types

| Type | Road | Spawn Rate | Best For |
|------|------|------------|----------|
| Primary | Highway | Fast (vehicles spawn quickly) | Armor, fast reinforcements |
| Secondary | Main Road | Medium | Mixed forces |
| Tertiary | Dirt Road | Slow | Infantry, light vehicles |
| Air | Off-map edge | Instant (fly in) | Helicopters, Aircraft |

### Calling Reinforcements (Battle Phase)

```
REINFORCEMENT CALL-IN PROCESS:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. Select unit card from reinforcement panel                   │
│                                                                 │
│  2. Click on an ENTRY POINT (not anywhere on map)               │
│     ┌──────────────────────────────────────────────────────┐   │
│     │  Available Entry Points highlighted when card selected│   │
│     │  Hover shows: travel time to various map locations    │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                 │
│  3. Unit spawns at entry point and drives onto map              │
│     ┌──────────────────────────────────────────────────────┐   │
│     │        ENTRY POINT                                    │   │
│     │            ║                                          │   │
│     │            ║                                          │   │
│     │     🚗 → 🚗 → 🚗 →  (units drive in one by one)      │   │
│     │            ║                                          │   │
│     │            ▼                                          │   │
│     │       TO BATTLEFIELD                                  │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                 │
│  4. Optionally: Set rally point (Shift+Click destination)       │
│     Units will auto-move to rally point after spawning          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Entry Point Queue System

Multiple units called to same entry point form a queue:

```
SPAWN QUEUE AT ENTRY POINT:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Entry Point: Highway North                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │   OFF-MAP STAGING AREA (queue)                         │   │
│  │   ┌───┐ ┌───┐ ┌───┐ ┌───┐                             │   │
│  │   │ 4 │ │ 3 │ │ 2 │ │ 1 │  →  SPAWN POINT  →  MAP    │   │
│  │   └───┘ └───┘ └───┘ └───┘      (one at a time)        │   │
│  │   (waiting)                                            │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Queue UI shows:                                                │
│  - Units waiting to spawn                                       │
│  - Estimated spawn time for each                               │
│  - Total queue time                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Queue Rules:**
- Units spawn one at a time per entry point
- Spawn interval based on road type (highway = 3s, dirt = 6s)
- Larger units (tanks) take longer to spawn than infantry
- Multiple entry points = parallel spawning (faster overall)
- Queue visible in UI showing wait times

### Entry Point Placement (Map Generation)

Entry points are placed during map generation:

```
ENTRY POINT PLACEMENT RULES:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ✓ Aligned with roads leading into map                         │
│  ✓ At map edge, within team's deployment side                  │
│  ✓ 2-4 entry points per team                                   │
│  ✓ At least one highway entry (if highway exists)              │
│  ✓ Spaced apart to allow strategic choice                      │
│                                                                 │
│  Entry Point Properties:                                        │
│  - position: Vector3 (at map edge)                             │
│  - roadType: 'highway' | 'secondary' | 'dirt' | 'air'          │
│  - teamId: which team uses this entry                          │
│  - spawnDirection: angle units face when spawning              │
│  - connectedRoadId: road they spawn onto                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Aircraft Entry (Special Case)

Aircraft don't use ground entry points:

```
AIRCRAFT REINFORCEMENT:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Helicopters:                                                   │
│  - Spawn at map edge (any edge on friendly side)               │
│  - Fly in at altitude                                          │
│  - Can be given destination immediately                        │
│                                                                 │
│  Fixed-Wing Aircraft:                                           │
│  - Called in via off-map sorties                               │
│  - Enter from friendly map edge at high speed                  │
│  - Execute attack run then exit map                            │
│  - OR loiter if air superiority role                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Entry Point UI

```
ENTRY POINT VISUAL (on map):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Normal state:         Selected card:        Queue active:      │
│  ┌─────────┐           ┌─────────┐           ┌─────────┐       │
│  │   ═══   │           │  ★═══★  │           │  ★═══★  │       │
│  │    ▼    │   →       │    ▼    │   →       │  3 │▼   │       │
│  │         │           │ (glow)  │           │ queued  │       │
│  └─────────┘           └─────────┘           └─────────┘       │
│  (subtle marker)       (highlighted)         (shows count)     │
│                                                                 │
│  Tooltip on hover:                                              │
│  ┌────────────────────────────────┐                            │
│  │ Highway Entry Point            │                            │
│  │ Spawn Rate: Fast (3s/unit)     │                            │
│  │ Queue: 2 units (6s total)      │                            │
│  │ Road leads to: Town Center     │                            │
│  └────────────────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Rally Points

Set a destination for reinforcements automatically:

```
RALLY POINT SYSTEM:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  With reinforcement card selected:                              │
│                                                                 │
│  1. Click entry point (spawn location)                         │
│  2. Shift+Click destination (rally point)                      │
│                                                                 │
│         [ENTRY]                                                 │
│            ║                                                    │
│            ║ (auto-move path shown)                            │
│            ║                                                    │
│            ▼                                                    │
│           ●━━━━━━━━━━━━━━━━━━━━━━━━●                          │
│                                   [RALLY]                       │
│                                                                 │
│  Units spawn → Auto-move to rally → Await orders               │
│                                                                 │
│  Rally point persists for that entry point until changed       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

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
