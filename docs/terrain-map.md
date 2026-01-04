# Terrain & Map Systems

[← Back to Main](../RALPH_PROMPT.md)

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
