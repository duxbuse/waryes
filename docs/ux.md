# UX & Keyboard Controls

[← Back to Main](../RALPH_PROMPT.md)

---

## KEYBOARD SHORTCUTS

### Unit Bar Hotkeys (F-Keys)

The unit deployment bar along the top of the screen can be controlled via keyboard:

| Key | Action |
|-----|--------|
| `F1` - `F12` | Select unit 1-12 in current category |
| `Ctrl+F1` - `Ctrl+F12` | Switch to category tab 1-12 |

**Notes:**
- Only active when unit bar is visible (Setup and Battle phases)
- Won't select units you can't afford
- Categories are ordered: LOG, INF, TNK, REC, AA, ART, HEL, AIR

### Control Groups (1-9)

Control groups allow quick selection of unit groups:

| Key | Action |
|-----|--------|
| `Ctrl+1` - `Ctrl+9` | Assign selected units to control group 1-9 |
| `1` - `9` | Select units in control group |
| Double-press `1` - `9` | Select units AND focus camera on them |

**Notes:**
- Dead units are automatically removed from control groups
- Double-press threshold is 300ms
- Camera smoothly pans to center on the group

### Movement Modifiers

Hold these keys while right-clicking to modify movement commands:

| Key | Action |
|-----|--------|
| `A` + Right-click | Attack move (engage enemies along path) |
| `R` + Right-click | Reverse move (back up toward destination) |
| `F` + Right-click | Fast move (max speed, less caution) |
| `E` + Right-click | Unload at position |
| `Shift` + Right-click | Queue command (add to order queue) |

### Selection Controls

| Key | Action |
|-----|--------|
| `Ctrl+A` | Select all player units |
| `Tab` | Cycle through unit types in selection |
| `Escape` | Clear selection / Toggle pause menu |
| Double-click unit | Select all units of same type |

### Combat Controls

| Key | Action |
|-----|--------|
| `Z` | Toggle return-fire-only mode for selected units |
| `Delete` or `L` | Sell/delete selected units (Setup phase only) |

### Phase Controls

| Key | Action |
|-----|--------|
| `Enter` | Start battle (Setup phase only) |
| `Escape` | Toggle pause menu (during battle) |

---

## UNIT DEPLOYMENT BAR

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [INF(4)] [TNK(2)] [REC(1)]                                              │  <- Category tabs
├─────────────────────────────────────────────────────────────────────────┤
│ [Trooper 35] [Militia 15] [HWT 40]                                      │  <- Unit cards
└─────────────────────────────────────────────────────────────────────────┘
```

### Behavior

- **Position**: Top-left of screen, extends to center credits bar
- **Visibility**: Shown during both Setup and Battle phases
- **Category Tabs**: Only show categories with available units
- **Unit Cards**: Show unit name (truncated), cost, and available count

### Phase-Specific Actions

| Phase | Click Action |
|-------|--------------|
| Setup | Start ghost placement mode (click on map to place) |
| Battle | Queue unit at auto-selected entry point |

### Entry Point Auto-Selection (Battle Phase)

When queueing reinforcements, entry points are auto-selected by priority:

1. **Highway** (highest priority)
2. **Secondary road**
3. **Dirt road**
4. **Air** (lowest priority)

If multiple entry points of same type exist, the one with shortest queue is selected.

---

## CAMERA CONTROLS

### Movement

| Input | Action |
|-------|--------|
| `W/A/S/D` or Arrow keys | Pan camera |
| Mouse at screen edge | Edge panning |
| Middle mouse drag | Drag panning |
| Scroll wheel | Zoom in/out |

### Focus

| Input | Action |
|-------|--------|
| Double-press control group | Focus camera on group |
| Click minimap | Move camera to location |

---

## UI VISIBILITY BY PHASE

| Element | Menu | Setup | Battle | Victory |
|---------|------|-------|--------|---------|
| Unit Bar | Hidden | Visible | Visible | Hidden |
| Phase Indicator | Hidden | Visible | Hidden | Hidden |
| Start Battle Button | Hidden | Visible | Hidden | Hidden |
| Top Resource Bar | Hidden | Visible | Visible | Hidden |
| Score Display | Hidden | Visible | Visible | Hidden |
| Minimap | Hidden | Visible | Visible | Hidden |
| Selection Panel | Hidden | Visible | Visible | Hidden |

---

## SELECTION FEEDBACK

### Visual States

| State | Indicator |
|-------|-----------|
| Unit selected | Selection ring around unit |
| Unit in control group | (No persistent indicator) |
| Ghost placement (valid) | Green semi-transparent unit |
| Ghost placement (invalid) | Red semi-transparent unit |

### Audio Feedback

| Action | Sound |
|--------|-------|
| Select unit(s) | `unit_select` beep |
| Issue move command | `unit_move` acknowledgement |
| Unit destroyed | `unit_death` descending tone |
| Button click | `button_click` quick click |
| Victory | Ascending major chord |
| Defeat | Descending minor chord |

---

## FORMATION DRAWING

Right-click and drag to draw formation lines:

1. **Short drag (< 5m)**: Auto-spread units in grid at endpoint
2. **Long drag**: Distribute units evenly along the drawn path

**Curved Formations:**
- The system tracks the mouse path as you drag
- Units are distributed evenly along the curved path you draw
- Draw arcs, curves, or any shape - units will follow the line
- Points are sampled every 3 world units for smooth curves

Formation preview shown as green ghost circles while dragging, updating in real-time to follow the curved path.

---

## UNIT UI INDICATORS

### Health & Morale Bars

Each unit displays billboarded UI elements above it:

| Element | Position | Description |
|---------|----------|-------------|
| Health Bar | Top | Green → Yellow → Red based on % |
| Morale Bar | Below health | Blue when normal, orange when shaken, gray when routing |
| Veterancy Stars | Above bars | Gold stars (1-2) for hardened/elite units |
| Status Icons | Above all | Suppressed (red), garrisoned (orange), mounted (green) |

**Zoom Compensation**: Health bars automatically scale larger when zoomed out to remain visible. Bars scale from 1x at close range to 4x at far range.

**Billboard Independence**: UI elements always face the camera regardless of which direction the unit is facing.

### Ground Ring Indicators

Concentric rings appear on the ground around units during combat:

```
     ╭─────────╮
    ╱ ╭───────╮ ╲    ← Outer: Blue aim arc (60°)
   │ ╱ ╭─────╮ ╲ │   ← Middle: Green weapon reload
   │ │ ╱ ╭───╮ ╲ │ │  ← Inner: Green weapon reload
   │ │ │ ·Unit· │ │ │
```

| Ring | Color | Purpose |
|------|-------|---------|
| Outer ring | Blue | Shows aim direction toward target enemy |
| Inner ring(s) | Green | Weapon reload progress (fills clockwise) |

**Aim Ring**:
- Visible when unit has an attack target or is attack-moving
- 60° arc pointing toward the target direction
- Blue color (#4a9eff)

**Reload Rings**:
- One ring per weapon (up to 3)
- Background: Dark gray circle outline
- Foreground: Green arc that fills clockwise as reload completes
- Progress: 0% = empty, 100% = full circle (ready to fire)
- Rings get smaller toward center (outer = main weapon)

---

## MINIMAP

### Features

The minimap shows:

| Element | Visual |
|---------|--------|
| Terrain | Color-coded cells (green=field, dark green=forest, gray=road, blue=water) |
| Buildings | Gray rectangles |
| Deployment Zones | Semi-transparent team color rectangles with borders |
| Capture Zones | Circles with team color fill |
| Entry Points | Colored arrows showing spawn direction |
| Units | Small colored dots (blue=player, green=ally, red=enemy) |
| Camera Viewport | White rectangle showing current view |

### Interactions

| Input | Action |
|-------|--------|
| Left-click | Move camera to location |
| Right-click | Issue move command to selected units |

### Fog of War

- Unexplored areas: Black
- Explored but not visible: Darkened terrain
- Visible areas: Full color
- Enemy units only shown in visible areas

---

## DEPLOYMENT ZONES

### Setup Phase

During deployment:

| Element | Description |
|---------|-------------|
| Zone Overlay | Semi-transparent team color (blue/red) fill |
| Zone Border | Colored border line around deployment area |
| Ghost Preview | Green (valid) or Red (invalid) placement preview |

### Battle Phase

When battle starts:
- **Deployment zone boundaries are automatically hidden**
- The semi-transparent overlay and border disappear
- Map shows only terrain and capture zones
- This declutters the battlefield view

### Minimap

Deployment zones are **always shown on the minimap** during both Setup and Battle phases for reference.
