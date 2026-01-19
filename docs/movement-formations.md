# Movement & Formations

[← Back to Main](../RALPH_PROMPT.md)

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
│  Forward = far side of the line from current position          │
│  (units drive up to the line, they don't turn around)          │
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
