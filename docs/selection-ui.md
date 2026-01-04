# Selection & UI Systems

[← Back to Main](../RALPH_PROMPT.md)

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
    ┌─────┴─────────────────────────────────────┐
    │  ████████░░░░  HP (green → yellow → red)
    │  ██████░░░░░░  Morale (blue → gray)
    └───────────────────────────────────────────┘
          │
    ┌─────┴─────────────────────────────────────┐
    │         Aim Indicator (circular)       │
    │              ╭───╮                     │
    │           ╭──┤   ├──╮  ← Cone shows   │
    │          ╱   │ ● │   ╲   aim direction│
    │         ╱    ╰───╯    ╲  + accuracy   │
    │        ╱_______________╲               │
    └───────────────────────────────────────────┘
          │
    ┌─────┴─────────────────────────────────────┐
    │        Reload Indicator (per weapon)   │
    │                                        │
    │   Main Gun:  ████████░░ 80%           │
    │   MG:        ██████████ READY         │
    │   Missiles:  ░░░░░░░░░░ RELOADING     │
    └───────────────────────────────────────────┘
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
