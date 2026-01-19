# Combat Mechanics

[← Back to Main](../RALPH_PROMPT.md)

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
  - Normal (100-50%) → Shaken (50-25%) → Breaking (25-0%) → Routing (0%)
  - **Shaken**: -10% speed
  - **Breaking**: -30% speed, may refuse orders
  - **Routing**: Uncontrollable, flees, **will not fire** (see Routing Behavior below)
- **Rally**: Officers/Commanders can rally routing units within aura range
- **Suppression**: Heavy weapons suppress area even on miss
- **Morale Recovery**: +5/second when not under fire, +10/second near commander

### Morale-Accuracy Relationship

Accuracy scales **linearly** with current morale:

```
ACCURACY MALUS = (100 - Morale)%

┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  Morale %    Accuracy Malus    Effective Accuracy (base 80%)                   │
│  ─────────────────────────────────────────────────────────────                 │
│    100%         0%             80% (full accuracy)                             │
│     75%        25%             60% (80% × 0.75)                                │
│     50%        50%             40% (80% × 0.50)                                │
│     25%        75%             20% (80% × 0.25)                                │
│     10%        90%              8% (80% × 0.10)                                │
│      1%        99%            0.8% (80% × 0.01)                                │
│      0%       100%             WILL NOT FIRE (routing)                         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

Formula: finalAccuracy = baseAccuracy × (morale / 100)
```

**Key Points:**
- Accuracy degrades smoothly as morale drops (not stepped thresholds)
- A unit at 50% morale has 50% of its normal accuracy
- Units at 0% morale (routing) do not fire - they are too busy fleeing
- This applies to ALL weapon systems on the unit
- Veterancy bonuses apply to base accuracy before morale modifier

### Routing Behavior (Detailed AI)

When a unit's morale hits 0, it enters **Routing** state with complex flee behavior:

```
ROUTING BEHAVIOR FLOWCHART:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  UNIT MORALE → 0                                                               │
│        │                                                                        │
│        ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  PHASE 1: INITIAL FLEE                                                  │   │
│  │  • No longer responds to player commands                                │   │
│  │  • Identify THREAT SOURCE (unit that fired the routing shot)           │   │
│  │  • Run DIRECTLY AWAY from threat source at max speed                   │   │
│  └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  PHASE 2: SEEK COVER (if terrain found while fleeing)                  │   │
│  │                                                                         │   │
│  │  While fleeing, scan for cover terrain:                                │   │
│  │  • Forest zones (5+ trees)                                             │   │
│  │  • Building clusters                                                    │   │
│  │  • Hills/ridges that block LOS                                         │   │
│  │                                                                         │   │
│  │  IF cover found AND cover is AWAY from threat (not toward):            │   │
│  │  → Divert toward cover instead of straight flee                        │   │
│  │                                                                         │   │
│  │  IF cover would require moving toward threat:                          │   │
│  │  → Ignore cover, continue fleeing away                                 │   │
│  └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  PHASE 3: HIDE IN COVER                                                 │   │
│  │                                                                         │   │
│  │  Once in cover terrain:                                                 │   │
│  │  • STOP running                                                         │   │
│  │  • Calculate LOS to ALL known enemy positions                          │   │
│  │  • Move within terrain to break LOS to all enemies                     │   │
│  │                                                                         │   │
│  │  Forest hiding:                                                         │   │
│  │  → Move deeper into forest center                                      │   │
│  │  → Prioritize positions with most tree cover                           │   │
│  │                                                                         │   │
│  │  Building hiding:                                                       │   │
│  │  → Move behind multiple buildings                                      │   │
│  │  → Stack building cover (2+ buildings between unit and enemies)        │   │
│  │                                                                         │   │
│  │  Hill hiding:                                                           │   │
│  │  → Move to reverse slope (enemy side blocked)                          │   │
│  └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  PHASE 4: REACT TO NEW THREATS                                          │   │
│  │                                                                         │   │
│  │  WHILE hiding, IF shot at by ANY enemy:                                │   │
│  │                                                                         │   │
│  │  CAN find better hiding spot within current terrain?                   │   │
│  │  → Move to better spot (more cover, better LOS blocking)               │   │
│  │                                                                         │   │
│  │  CANNOT find better spot (terrain too small/exposed)?                  │   │
│  │  → ABANDON cover                                                        │   │
│  │  → Flee AWAY from new threat source                                    │   │
│  │  → Return to PHASE 1 (seek new cover or flee off map)                  │   │
│  └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  PHASE 5: RECOVERY OR FLEE OFF MAP                                      │   │
│  │                                                                         │   │
│  │  IF successfully hidden (no LOS to enemies, not taking fire):          │   │
│  │  → Begin morale recovery (+5/sec, +10/sec near commander)              │   │
│  │  → When morale > 25%, exit routing state                               │   │
│  │  → Unit becomes controllable again (still shaken)                      │   │
│  │                                                                         │   │
│  │  IF cannot find cover OR continuously flushed from cover:              │   │
│  │  → Continue fleeing toward friendly map edge                           │   │
│  │  → If reaches map edge: unit LOST ("Routing - fled map")               │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Routing Rules:**
- **No Player Control**: Routing units ignore ALL player commands
- **Threat Memory**: Remember which unit caused the rout for 30 seconds
- **Cover Priority**: Forest > Buildings > Hills > Open ground flee
- **LOS Checking**: Every 0.5s, verify no enemy has LOS to hiding position
- **Flee Speed**: 120% of normal max speed (panic sprint)
- **Recovery Threshold**: Must reach 25% morale to regain control

**Cover Quality Calculation:**
```typescript
interface CoverQuality {
  losBlockedCount: number;    // How many enemies can't see this position
  distanceFromThreat: number; // Further = better
  terrainDensity: number;     // More trees/buildings = better
  escapeRoutes: number;       // Alternative flee paths if flushed
}

// Position score = (losBlocked * 10) + (distance * 0.1) + (density * 5) + (escapeRoutes * 3)
```

**Example Routing Sequence:**
```
1. Infantry squad takes artillery hit, morale → 0
2. Squad immediately runs AWAY from artillery direction
3. While running, spots forest 50m to the left (away from artillery)
4. Diverts into forest, slows down
5. Moves to forest center, checks LOS - enemy tank has LOS through trees
6. Moves deeper, now behind dense tree cluster - no enemy LOS
7. Stops, begins morale recovery
8. Enemy recon unit spots them, fires
9. Squad checks for better position - none available (small forest)
10. Squad abandons forest, flees away from recon
11. No more cover found, continues to friendly map edge
12. Reaches edge - unit lost
```

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

### Fog of War

The battlefield is divided into three visibility states based on friendly unit vision:

```
FOG OF WAR STATES:
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                       │
│  │   VISIBLE     │  │   EXPLORED    │  │  UNEXPLORED   │                       │
│  │   (clear)     │  │   (grayed)    │  │   (black)     │                       │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤                       │
│  │ Full color    │  │ Desaturated   │  │ Completely    │                       │
│  │ terrain       │  │ terrain       │  │ hidden        │                       │
│  │               │  │               │  │               │                       │
│  │ Enemy units   │  │ NO enemy      │  │ NO terrain    │                       │
│  │ VISIBLE       │  │ units shown   │  │ NO units      │                       │
│  │               │  │               │  │               │                       │
│  │ Buildings,    │  │ Last known    │  │ Nothing       │                       │
│  │ roads, trees  │  │ building      │                       │
│  │ all visible   │  │ positions     │  │               │                       │
│  └───────────────┘  └───────────────┘  └───────────────┘                       │
│                                                                                 │
│  Friendly unit    Previously seen    Never visited                             │
│  currently sees   by friendly unit   by friendly unit                          │
│  this area        (memory)           (unknown)                                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Visibility Rules:**

| State | Terrain | Friendly Units | Enemy Units | Buildings |
|-------|---------|----------------|-------------|-----------|
| Visible | Full color | Shown | Shown | Shown |
| Explored | Grayed/desaturated | Shown | HIDDEN | Last known state |
| Unexplored | Black/hidden | N/A | HIDDEN | Hidden |

**Vision Sources:**
- Each friendly unit has a vision radius based on Optics stat
- Vision blocked by terrain (buildings, dense forest, hills)
- Recon units have larger vision radius
- Higher ground provides extended vision
- Aircraft at altitude see further but can't see into buildings

**Fog of War Behavior:**
```
DYNAMIC FOG EXAMPLE:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  TIME 1: Unit moves forward                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ████████████████████████████████████████████████████   │   │
│  │ ████████████████████████████████████████████████████   │   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓██████████████████████████████████   │   │
│  │ ░░░░░░░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓██████████████████████   │   │
│  │ ░░░░🚗░░░░░░░░░░░░░░░░░░░░░▓▓▓▓▓▓████████████████   │   │
│  │ ░░░░░░░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓██████████████████████   │   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓██████████████████████████████████   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  █ = Unexplored  ▓ = Explored (grayed)  ░ = Visible (clear)   │
│                                                                 │
│  TIME 2: Unit moves right, reveals more                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ████████████████████████████████████████████████████   │   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████████████████████████████████   │   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░██████████████████████   │   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░🚗░░░░░░░░████████████████████   │   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░██████████████████████   │   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████████████████████████████████   │   │
│  │ ████████████████████████████████████████████████████   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  Previous position now EXPLORED (grayed), new area VISIBLE     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Important Mechanics:**
- Enemy units in explored (grayed) areas are NOT visible - only terrain
- If enemy enters previously explored area, you won't see them until a friendly unit has vision
- Buildings/terrain in explored areas shown in desaturated colors
- Unexplored areas completely black on minimap and main view
- Vision updates in real-time as units move
- Team shares vision - all teammates see what any teammate's units see

**Vision Blocking:**
| Blocker | Effect |
|---------|--------|
| Buildings | Blocks vision through, not around |
| Dense Forest | Blocks vision through zone |
| Hills | Blocks vision on far side (reverse slope) |
| Smoke | Temporarily blocks all vision |

### Smoke Mechanics
| Type | Radius | Duration | Notes |
|------|--------|----------|-------|
| Grenades (Infantry) | 5m | 20s | Single use |
| Launchers (Vehicle) | 50m arc | 20s | Single use, semi-circle |
| Artillery Shells | 50m | 60s | Large area |
| Aerial Curtain | 1km line | 30s | Blocks ground and air vision |
