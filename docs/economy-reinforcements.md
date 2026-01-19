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

## REINFORCEMENT & RESUPPLY SYSTEM

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
Once battle begins, new units spawn at **Resupply Points** and move to your destination:

```
REINFORCEMENT RESUPPLY POINTS:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  TEAM 1 TERRITORY                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │     [⬡ RESUPPLY 1]              [⬡ RESUPPLY 2]         │   │
│  │     (Forward Depot)              (Main Supply Base)     │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                        BATTLEFIELD                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │     [⬡ RESUPPLY A]              [⬡ RESUPPLY B]         │   │
│  │     (Forward Depot)              (Main Supply Base)     │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│  TEAM 2 TERRITORY                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Resupply Point Types

| Type | Location | Spawn Delay | Best For |
|------|----------|-------------|----------|
| Forward Depot | Near front lines | 3 seconds | Quick reinforcements to active combat |
| Main Supply Base | Rear area | 3 seconds | Safe spawn point, longer travel |
| Air Resupply | Off-map edge | 3 seconds | Helicopters, Aircraft (fly in) |

**Note:** The resupply system only applies during the **battle phase**. During deployment phase, units spawn instantly where you click. During battle phase, all ground units spawn at the nearest friendly resupply point after a 3-second delay.

### Calling Reinforcements (Battle Phase)

```
REINFORCEMENT CALL-IN PROCESS:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. Select unit card from reinforcement panel                   │
│                                                                 │
│  2. Click anywhere on the BATTLEFIELD to set destination        │
│     ┌──────────────────────────────────────────────────────┐   │
│     │  All movement type modifiers supported:              │   │
│     │  • Left-click = Normal Move                          │   │
│     │  • A + Click = Attack Move                           │   │
│     │  • F + Click = Fast Move                             │   │
│     │  • R + Click = Reverse Move                          │   │
│     │  The movement type becomes the unit's first order    │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                 │
│  3. After 3 second delay, unit spawns at nearest RESUPPLY POINT │
│     ┌──────────────────────────────────────────────────────┐   │
│     │     [RESUPPLY POINT]                                 │   │
│     │            ║                                          │   │
│     │            ║  (3s spawn delay)                       │   │
│     │            ║                                          │   │
│     │         🚗 ═══════════════════► [DESTINATION]        │   │
│     │            ║                                          │   │
│     │   Unit spawns here, then                             │   │
│     │   executes movement order to destination             │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                 │
│  4. Unit automatically moves to clicked destination             │
│     Using the movement type specified during placement          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Movement Type Examples:**
- **Attack Move (A+Click)**: Unit spawns, then attack-moves to destination (engages enemies en route)
- **Fast Move (F+Click)**: Unit spawns, then fast-moves to destination (max speed, less cautious)
- **Normal Move**: Unit spawns, then moves to destination at standard speed
- **Reverse (R+Click)**: Unit spawns, then reverses to destination (keeps front armor facing threat)

### Resupply Point Spawn System

Units spawn at the nearest friendly resupply point after a 3-second delay:

```
SPAWN AT RESUPPLY POINT:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Resupply Point: Forward Supply Depot                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │   [RESUPPLY POINT ⬡]                                   │   │
│  │          │                                              │   │
│  │          │ (3s delay)                                   │   │
│  │          ▼                                              │   │
│  │        🚗 ════════════════► [PLAYER'S DESTINATION]     │   │
│  │                                                         │   │
│  │   Unit spawns at resupply point, then                  │   │
│  │   immediately executes queued movement order           │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Spawn location selection:                                      │
│  - System chooses nearest friendly resupply point              │
│  - Considers distance to player's requested destination        │
│  - Multiple resupply points = faster parallel spawning         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Spawn Rules:**
- 3-second delay between placement and spawn
- Unit spawns at nearest friendly resupply point
- Movement order (with type) is queued during placement
- Unit immediately executes movement to destination after spawning
- Multiple units can spawn at different resupply points simultaneously

### Resupply Point Placement (Map Generation)

Resupply points are placed during map generation:

```
RESUPPLY POINT PLACEMENT RULES:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ✓ Near towns, road intersections, or strategic positions     │
│  ✓ Within each team's territory                                │
│  ✓ 2-4 resupply points per team                                │
│  ✓ Spaced to provide coverage across the map                   │
│  ✓ Visual marker: ⬡ hexagon icon on map and minimap           │
│                                                                 │
│  Resupply Point Properties:                                     │
│  - position: Vector3 (strategic location)                      │
│  - teamId: which team owns this resupply point                 │
│  - capacity: how many units can spawn simultaneously           │
│  - isActive: can be disabled if captured/destroyed             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Aircraft Reinforcement (Special Case)

Aircraft spawn at air resupply points (map edge):

```
AIRCRAFT REINFORCEMENT:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Helicopters:                                                   │
│  - Spawn at map edge after 3s delay                            │
│  - Fly directly to clicked destination                         │
│  - Movement modifiers affect flight behavior                   │
│                                                                 │
│  Fixed-Wing Aircraft:                                           │
│  - Called in via off-map sorties                               │
│  - Enter from friendly map edge at high speed                  │
│  - Execute attack run then exit map                            │
│  - OR loiter if air superiority role                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Resupply Point UI

```
RESUPPLY POINT VISUAL (on map and minimap):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Normal state:         Card selected:        Spawning unit:     │
│  ┌─────────┐           ┌─────────┐           ┌─────────┐       │
│  │         │           │         │           │    3s   │       │
│  │    ⬡    │   →       │   ⬡★    │   →       │   ⬡→🚗  │       │
│  │         │           │ (glow)  │           │ spawning│       │
│  └─────────┘           └─────────┘           └─────────┘       │
│  (hexagon icon)        (highlighted)         (countdown)       │
│                                                                 │
│  Minimap appearance:                                            │
│  ┌────────────────────────────────┐                            │
│  │ ⬡ = Friendly resupply point   │                            │
│  │ (team colored hexagon)         │                            │
│  └────────────────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Direct Destination Placement

Reinforcement destinations are set directly when placing:

```
DIRECT PLACEMENT SYSTEM:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  With reinforcement card selected:                              │
│                                                                 │
│  Simply click anywhere on the battlefield:                      │
│  - That location becomes the unit's destination                │
│  - Movement modifier keys set the movement type                │
│                                                                 │
│         [RESUPPLY ⬡]                                           │
│              │                                                  │
│              │  (3s delay)                                      │
│              │                                                  │
│              ▼                                                  │
│            🚗 ═══════════════════════► ● [YOUR CLICK]          │
│                                                                 │
│  Unit spawns → Executes movement order → Arrives at destination│
│                                                                 │
│  Movement type is locked in at placement time                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Placement with Movement Modifiers:**
- **Click**: Normal move to destination
- **A + Click**: Attack-move to destination (engage enemies en route)
- **F + Click**: Fast-move to destination (maximum speed)
- **R + Click**: Reverse to destination (maintain front armor facing)

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
