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

## SETTLEMENT SYSTEM

### Settlement Size Categories

| Category | Buildings | Population Feel | Map Footprint | Road Connections |
|----------|-----------|-----------------|---------------|------------------|
| **Hamlet** | 3-8 | Isolated cluster | 50-100m | 1 dirt road |
| **Village** | 10-25 | Small community | 150-300m | 1-2 roads |
| **Town** | 30-60 | Regional center | 400-700m | 2-4 roads |
| **City** | 80-150+ | Major hub | 800-1500m | 4-8 roads |

### Settlement Layout Types

Settlements have a `layoutType` property that determines street patterns and building placement:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYOUT TYPE COMPARISON                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EUROPEAN ORGANIC              AMERICAN GRID              MIXED/HYBRID      │
│  ─────────────────             ─────────────              ────────────      │
│                                                                             │
│      ╭──╮                      ┌──┬──┬──┬──┐             ╭──╮ ┌──┬──┐      │
│    ╭─┤  ├──╮                   │  │  │  │  │           ╭─┤  ├─┤  │  │      │
│   ╭┤ ╰┬─╯  │                   ├──┼──┼──┼──┤          ╭┤ ╰┬─╯ ├──┼──┤      │
│   │╰──┤⛪ ├─╮                  │  │  │  │  │          │╰──┤⛪ │  │  │      │
│   ╰─╮ ╰──┬╯ │                  ├──┼──┼──┼──┤          ╰─╮ ╰──┼──┼──┤      │
│     ╰────╯                     └──┴──┴──┴──┘            ╰────┴──┴──┘      │
│                                                                             │
│  • Winding streets             • Rectangular blocks      • Old core organic │
│  • Central plaza/church        • Numbered streets        • New areas grid   │
│  • Irregular blocks            • Consistent widths       • Transition zone  │
│  • Grew over centuries         • Planned layout          • Historic + modern│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### European Organic Layout
**Characteristics:**
- Streets radiate from central focal point (church, plaza, market)
- Irregular block shapes and sizes
- Winding roads that follow terrain contours
- Narrow alleys and passages between buildings
- Buildings packed tightly with shared walls
- Street widths vary (3-8m typically)

**Generation Rules:**
1. Place focal point (church/plaza) at settlement center
2. Generate 3-6 main roads radiating outward at irregular angles
3. Connect radiating roads with curved cross-streets
4. Fill blocks with buildings facing streets
5. Add narrow alleys (2-3m) between some buildings
6. Older buildings cluster near center, newer toward edges

**Road Integration:**
```
EUROPEAN ORGANIC - Road enters and curves through center

         dirt road
              ↓
    ═══════╗  ·
           ║  · · ·
      ╭────╫────╮
    ╭─┤ ⛪ ║    ├─╮   Secondary road passes through
    │ ╰────╫────╯ │   but CURVES around plaza
    ╰──────╫──────╯
           ║
    ═══════╝
```

#### American Grid Layout
**Characteristics:**
- Rectangular street grid
- Consistent block sizes (typically 80-120m)
- Numbered/lettered street names
- Wide main streets (10-15m), narrower side streets (6-8m)
- Buildings set back from street with yards/parking
- Perpendicular intersections

**Generation Rules:**
1. Establish primary axis aligned with main road
2. Create grid of blocks (4x4 to 8x8 for towns)
3. Main street runs through center, wider than others
4. All intersections at 90 degrees
5. Buildings placed within blocks with setbacks
6. Corner lots may have commercial buildings

**Road Integration:**
```
AMERICAN GRID - Roads align with grid axes

    ════════════════════════    Highway becomes Main St
           ║    ║    ║
    ───────╫────╫────╫──────    Cross streets
           ║    ║    ║
    ───────╫────╫────╫──────
           ║    ║    ║
    ════════════════════════
```

#### Mixed/Hybrid Layout
**Characteristics:**
- Historic organic core surrounded by planned expansion
- Clear visual distinction between old and new sections
- Transition zone where styles blend
- Common in European towns that grew in 19th-20th century

**Generation Rules:**
1. Generate small organic core (10-20 buildings)
2. Define expansion boundary around core
3. Generate grid layout outside boundary
4. Create transition streets that curve to meet grid
5. Building styles differ: old stone in core, newer in grid

### Building Categories & Types

#### Residential Buildings

| Type | Size | Floors | Footprint | Garrison | Common In |
|------|------|--------|-----------|----------|-----------|
| **Cottage** | Small | 1 | 6x8m | 1 squad | Hamlet, Village |
| **Townhouse** | Small | 2-3 | 5x12m | 1 squad | Town, City (organic) |
| **Detached House** | Medium | 2 | 10x12m | 1-2 squads | Village, Town |
| **Row House** | Medium | 2-3 | 6x15m | 1 squad | Town, City |
| **Apartment Block** | Large | 3-5 | 20x30m | 3-4 squads | City only |
| **Manor/Estate** | Large | 2-3 | 15x20m | 2-3 squads | Village outskirts |

#### Commercial Buildings

| Type | Size | Floors | Footprint | Garrison | Common In |
|------|------|--------|-----------|----------|-----------|
| **Shop** | Small | 1-2 | 8x10m | 1 squad | All |
| **Inn/Pub** | Medium | 2 | 12x15m | 2 squads | Village+ |
| **Market Hall** | Medium | 1-2 | 15x20m | 2 squads | Town+ |
| **Hotel** | Large | 3-5 | 20x25m | 3-4 squads | Town+, City |
| **Office Building** | Large | 4-8 | 25x30m | 4-6 squads | City only |

#### Industrial Buildings

| Type | Size | Floors | Footprint | Garrison | Common In |
|------|------|--------|-----------|----------|-----------|
| **Workshop** | Small | 1 | 10x12m | 1 squad | Village+ |
| **Warehouse** | Medium | 1-2 | 20x30m | 2 squads | Town+ |
| **Small Factory** | Medium | 2 | 25x40m | 3 squads | Town+ |
| **Large Factory** | Large | 2-3 | 40x60m | 4-6 squads | City only |
| **Power Plant** | Large | 2 | 30x40m | 2 squads | City only |

#### Civic & Religious Buildings

| Type | Size | Floors | Footprint | Garrison | Common In |
|------|------|--------|-----------|----------|-----------|
| **Chapel** | Small | 1 | 8x12m | 1 squad | Hamlet, Village |
| **Church** | Medium | 1 + tower | 15x25m | 2 squads | Village+, Town |
| **Cathedral** | Large | 1 + towers | 30x50m | 4 squads | City only |
| **Town Hall** | Medium | 2-3 | 20x25m | 2-3 squads | Town+ |
| **School** | Medium | 2 | 20x30m | 2 squads | Village+ |
| **Hospital** | Large | 3-4 | 30x40m | 3-4 squads | Town+, City |

#### Agricultural Buildings

| Type | Size | Floors | Footprint | Garrison | Common In |
|------|------|--------|-----------|----------|-----------|
| **Farmhouse** | Medium | 2 | 10x15m | 1-2 squads | Rural, Hamlet |
| **Barn** | Medium | 1-2 | 15x25m | 2 squads | Rural, Hamlet |
| **Silo** | Small | 1 (tall) | 5m diameter | Not garrisonable | Rural |
| **Windmill** | Small | 3 | 8m diameter | 1 squad | Rural, Village |
| **Stable** | Small | 1 | 10x15m | 1 squad | Rural, Village |

#### Infrastructure Buildings

| Type | Size | Floors | Footprint | Garrison | Common In |
|------|------|--------|-----------|----------|-----------|
| **Gas Station** | Small | 1 | 10x15m | 1 squad | Along roads |
| **Water Tower** | Small | 1 (tall) | 8m diameter | Not garrisonable | Village+ |
| **Train Station** | Medium | 1-2 | 15x40m | 2 squads | Town+ |
| **Fire Station** | Medium | 2 | 15x20m | 2 squads | Town+ |
| **Police Station** | Medium | 2 | 15x20m | 2 squads | Town+ |

### Settlement Composition by Size

```
HAMLET (3-8 buildings)
┌─────────────────────────────────────────┐
│  🏚️ Farmhouse (1-2)                      │
│  🏠 Cottage (2-4)                        │
│  🏗️ Barn (1-2)                           │
│  ⛪ Chapel (0-1)                         │
│                                          │
│  Layout: Always organic/clustered        │
│  Roads: 1 dirt road connection           │
└─────────────────────────────────────────┘

VILLAGE (10-25 buildings)
┌─────────────────────────────────────────┐
│  🏠 Residential (6-15)                   │
│     - Cottages, Detached houses          │
│  🏪 Commercial (2-4)                     │
│     - Shops, Inn/Pub                     │
│  ⛪ Civic (1-2)                          │
│     - Church, maybe Town Hall            │
│  🏭 Industrial (0-2)                     │
│     - Workshop, small warehouse          │
│  🚜 Agricultural (2-5)                   │
│     - Farms on outskirts                 │
│                                          │
│  Layout: 80% organic, 20% grid           │
│  Roads: 1-2 connections (secondary/dirt) │
└─────────────────────────────────────────┘

TOWN (30-60 buildings)
┌─────────────────────────────────────────┐
│  🏠 Residential (18-35)                  │
│     - Mix of all residential types       │
│  🏪 Commercial (6-12)                    │
│     - Shops, Market, Hotel               │
│  ⛪ Civic (3-6)                          │
│     - Church, Town Hall, School          │
│  🏭 Industrial (3-8)                     │
│     - Factories, Warehouses              │
│  🚜 Agricultural (2-5)                   │
│     - Farms on outskirts only            │
│                                          │
│  Layout: 50% organic, 50% grid           │
│  Roads: 2-4 connections (secondary)      │
│  Features: Central square/plaza          │
└─────────────────────────────────────────┘

CITY (80-150+ buildings)
┌─────────────────────────────────────────┐
│  🏠 Residential (45-80)                  │
│     - Apartments, Row houses dominant    │
│  🏪 Commercial (15-30)                   │
│     - Full range including offices       │
│  ⛪ Civic (8-15)                         │
│     - Cathedral, multiple schools        │
│  🏭 Industrial (12-25)                   │
│     - Industrial district                │
│  🚜 Agricultural (0-3)                   │
│     - Only on far outskirts              │
│                                          │
│  Layout: 30% organic core, 70% grid      │
│  Roads: 4-8 connections (highway+)       │
│  Features: Multiple districts/zones      │
└─────────────────────────────────────────┘
```

### Settlement Generation Algorithm

```
SETTLEMENT GENERATION PSEUDOCODE

Input: size (hamlet|village|town|city), layoutType, position

1. DETERMINE PARAMETERS
   buildingCount = getSizeRange(size)
   layoutType = layoutType OR pickWeightedRandom(size)

2. PLACE FOCAL POINT
   if (layoutType == organic OR layoutType == mixed):
     placeFocalBuilding(church OR plaza) at center
   if (layoutType == grid):
     defineMainStreetAxis() aligned with nearest road

3. GENERATE STREET NETWORK
   switch(layoutType):
     organic:
       generateRadialStreets(center, 3-6 roads)
       generateCurvedCrossStreets()
     grid:
       generateGridStreets(blockSize: 80-120m)
     mixed:
       generateOrganicCore(radius: 100-150m)
       generateGridExpansion(outside core)
       generateTransitionStreets()

4. DEFINE BUILDING ZONES
   zones = {
     center: civic + commercial,
     inner: residential + commercial,
     outer: residential + industrial,
     edge: agricultural (if applicable)
   }

5. PLACE BUILDINGS
   for each zone:
     buildingTypes = getBuildingMix(size, zone)
     for each block in zone:
       placeBuildingsAlongStreets(block, buildingTypes)
       ensureRoadAccess(building)

6. CONNECT TO ROAD NETWORK
   findNearestRoad(settlement.boundary)
   generateConnectionRoad(type based on settlement size)

7. ADD DETAILS
   placeDecoration(trees, fences, wells)
   addParkingAreas(if grid layout)
   addPlazas(if organic layout)
```

### Road Integration by Settlement Type

The `layoutType` property tells the road generator how to approach the settlement:

| Layout Type | Road Behavior | Street Generation |
|-------------|---------------|-------------------|
| `organic` | Roads curve through/around center | Radial from focal point |
| `grid` | Roads align with grid axes | Perpendicular grid |
| `mixed` | Roads curve in core, straighten in expansion | Both patterns |

**Settlement Data Structure for Road Generator:**
```
Settlement {
  id: string
  position: {x, y}
  size: "hamlet" | "village" | "town" | "city"
  layoutType: "organic" | "grid" | "mixed"
  bounds: Polygon
  focalPoint: {x, y}           // Center of organic core
  mainAxis: number             // Angle for grid alignment
  entryPoints: Point[]         // Where roads should connect
  streetNetwork: Graph         // Internal streets
}
```

### Building Placement Rules

**Organic Layout:**
- Buildings face inward toward streets
- Irregular setbacks (0-3m)
- Shared walls common
- Taller buildings near center
- Gardens/yards behind buildings

**Grid Layout:**
- Buildings aligned with lot boundaries
- Consistent setbacks (3-6m)
- Yards/parking between buildings
- Corner buildings may be larger
- Commercial on main street, residential on side streets

**Mixed Layout:**
- Apply organic rules inside core boundary
- Apply grid rules outside core boundary
- Transition zone (20-30m) blends both styles

---

## PROCEDURAL MAP GENERATION

### Generation Order
1. Terrain heightmap and water bodies
2. **Settlement placement** (determines layout types)
3. **Road network** (uses settlement.layoutType)
4. Forest and vegetation
5. Individual buildings and details

### Visual Elements by Region

**European Theater:**
- Cobblestone streets, brick/stone buildings
- Churches with spires, town squares
- Half-timbered houses in villages
- Stone walls and hedgerows

**Eastern Front:**
- Wooden buildings common in villages
- Onion-dome churches
- Wide dirt roads
- Collective farms, industrial complexes

**Pacific/Asian:**
- Wooden construction, paper screens
- Temple complexes
- Terraced farming
- Narrow winding paths

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
- Passes through or near major towns/cities
- Strategic importance: fastest route but predictable
- **Settlement interaction**: Highways pass through cities, bypass or skirt towns

**Secondary Roads (3-5 per map)**
- Branch off from highways
- Connect towns to each other
- Provide flanking routes
- Medium speed, less predictable
- **Settlement interaction**: Connect all towns/villages, may pass through center

**Town Streets (generated per settlement)**
- Layout determined by `settlement.layoutType`:
  - `organic`: Radial/winding streets from focal point
  - `grid`: Perpendicular grid aligned with main road axis
  - `mixed`: Organic core + grid expansion
- Connect all buildings to road network
- Street width varies by settlement size and layout
- Use `settlement.entryPoints[]` to connect external roads

**Dirt Roads (Farmland)**
- Connect hamlets and isolated buildings (farms, barns, windmills)
- Often wind through fields and forests
- May dead-end at farms
- Unpaved, slower but provide alternate routes
- **Settlement interaction**: Only road type for hamlets

### Road-Settlement Integration Algorithm

```
ROAD GENERATION WITH SETTLEMENTS

1. PLACE HIGHWAYS
   - Connect deployment zones
   - Route through/near cities
   - Avoid steep terrain

2. FOR EACH SETTLEMENT (by size, largest first):
   city:
     - Highway MUST pass through or have off-ramp
     - 2+ secondary roads connect
     - Use settlement.mainAxis for grid alignment

   town:
     - Secondary road passes through center
     - Read settlement.layoutType for street behavior:
       organic → road curves around focal point
       grid → road becomes main street axis
       mixed → road curves in core, straightens outside

   village:
     - 1-2 secondary or dirt roads connect
     - Roads typically pass along edge, not through center

   hamlet:
     - Single dirt road connection
     - Road may dead-end at hamlet

3. GENERATE INTERNAL STREETS
   For each settlement:
     streets = generateStreets(settlement.layoutType)
     connectToExternalRoads(streets, nearbyRoads)
     settlement.streetNetwork = streets

4. FILL REMAINING CONNECTIONS
   - Connect isolated farms with dirt roads
   - Ensure all buildings have road access
   - Add scenic routes through forests
```

### Settlement Entry Points

Each settlement defines `entryPoints[]` where external roads should connect:

```
ORGANIC SETTLEMENT                    GRID SETTLEMENT
       N                                    N
       │                              ══════╪══════
   ●───┼───●                               ║
  ╱    │    ╲                          ────╫────
 W─────⛪─────E                        ────╫────
  ╲    │    ╱                          ────╫────
   ●───┼───●                               ║
       │                              ══════╪══════
       S                                    S

● = entry points (flexible)           ╪ = entry points (grid-aligned)
Roads curve to reach entry            Roads align with axes
```

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

## WATER TERRAIN SYSTEM

### Water Body Types

| Type | Size | Frequency | Features |
|------|------|-----------|----------|
| **Lake** | 30-80m radius | 70% of maps | Irregular shape, fed by river |
| **River** | 8-15m wide | 100% (at least one) | Meanders, exits map edges |
| **Tributary** | 4-8m wide | 50% chance | Joins main river |
| **Pond** | 5-15m radius | 2-6 per map | Near farm buildings |

### River Generation Rules

```
RIVER SYSTEM LAYOUT
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│    ≈≈≈≈≈╗                                                              │
│         ║                    ╔≈≈≈≈≈≈≈≈≈≈                              │
│         ║  TRIBUTARY         ║                                         │
│         ║ (4-8m wide)        ║                                         │
│         ╚════════════════════╬═══════════════════╗                     │
│                              ║   MAIN RIVER      ║                     │
│                              ║   (8-15m wide)    ║                     │
│         ┌────────────────────╨─────┐             ║                     │
│         │                          │             ║                     │
│         │         LAKE             │             ║                     │
│         │      (irregular)         │             ║                     │
│         │                          │             ║                     │
│         └──────────────────────────┘             ║                     │
│                                                  ║                     │
│                                             ≈≈≈≈≈╝                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Main Rivers:**
- Must extend off the battlefield on both ends
- OR one end connects to a lake
- Natural meandering using noise displacement
- Variable width along length (8-15m)

**Tributaries (50% chance):**
- 1-2 smaller streams per main river
- Must extend off map on one end
- Joins main river at natural confluence point
- Narrower width (4-8m)

**Lakes:**
- 70% chance of appearing on any map
- Irregular polygon shape (noise-perturbed circle)
- Positioned away from deployment zones (100m buffer)
- Always has at least one river feeding into it
- Prefers lower elevation areas

**Ponds:**
- Small circular water bodies (5-15m radius)
- Placed near farm buildings (within 30m)
- Purely aesthetic, creates tactical variety
- Found near barns, farmhouses, silos

### Road-Water Interaction

```
BRIDGE CROSSING
═══════════════╗═══════════════════
               ║
    ≈≈≈≈≈≈≈≈≈≈≈╬≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈  RIVER
               ║  BRIDGE
═══════════════╩═══════════════════  ROAD

LAKE AVOIDANCE
                    ┌─────────────┐
═══════════════╗    │             │
               ║    │    LAKE     │
               ╚════╗             │
                    │╔════════════╝
                    │║
                    └╨────────────
                     ║
═════════════════════╝  ROAD CURVES AROUND
```

**Bridges:**
- Roads automatically create bridges when crossing rivers
- Stone/concrete material (gray, distinct from asphalt)
- Elevated 2m above water level
- Width matches underlying road type
- Railings on both sides

**Lake Avoidance:**
- Roads path around lakes with 20-30m buffer
- No bridges over lakes (too wide)
- Creates natural chokepoints at river crossings

### Movement Rules

| Unit Type | River | Lake | Pond |
|-----------|-------|------|------|
| Infantry | Impassable | Impassable | Impassable |
| Vehicles | Impassable | Impassable | Impassable |
| Amphibious | Crossable (slow) | Crossable (slow) | Crossable |
| Helicopters | Ignored | Ignored | Ignored |
| Aircraft | Ignored | Ignored | Ignored |

### Tactical Considerations

- **Bridges are chokepoints** - Limited crossing points create defensive opportunities
- **Rivers divide the map** - Forces flanking maneuvers or bridge control
- **Lakes block direct routes** - Roads must go around, lengthening travel
- **Ponds near farms** - Provides cover denial in agricultural areas
- **Tributaries create complexity** - Multiple water crossings on some maps

### Generation Order

Water bodies are generated **before roads** in the map generation pipeline:

```
1. initializeTerrain()
2. generateElevation()
3. generateDeploymentZones()
4. generateSettlements()
5. generateWaterBodies()     ← Lakes, rivers generated HERE
6. generateRoads()           ← Roads avoid lakes, create bridges
7. createBridgesForRoads()   ← Bridge detection at crossings
8. generateCaptureZones()
9. generateBuildings()
10. generatePonds()          ← Ponds near farm buildings
11. generateNaturalTerrain()
12. updateTerrainWithFeatures()
```

### Water Rendering

| Element | Height | Material | Visual |
|---------|--------|----------|--------|
| Lake surface | 0.1m | Blue water | Flat plane overlay |
| River surface | 0.1m | Blue water | Path following bezier |
| Pond surface | 0.1m | Blue water | Small circular overlay |
| Bridge deck | 2.0m | Gray concrete | Elevated plane |
| Bridge railings | 3.0m | Dark gray | Box geometry sides |
