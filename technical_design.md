# Stellar Siege: Technical Design & Architecture

## 1. Executive Summary
This document outlines the technical architecture for **Stellar Siege**, a sci-fi RTS game designed for **solo indie development**. The focus is on simplicity, rapid iteration, and using proven technologies rather than building for scale.

**Core Principles:**
- Simple, stylized graphics (low poly, hand-painted textures)
- Proven, mature technologies with strong community support
- Fast iteration over optimization
- Deterministic gameplay for easier debugging and potential future multiplayer
- Robust AI for single-player and multiplayer drop-in replacement

---

## 2. Technology Stack

### 2.1 Game Engine
**Recommendation: Godot 4.x (.NET Version)**

**Rationale:**
- **C# Performance:** Essential for the 1000+ unit simulation ticks.
- **Lightweight:** Fast iteration compared to Unreal.
- **Customizable:** Source access allows fixing engine-level determinism issues if they arise.

### 2.2 Programming Language
**Primary: C# (.NET 6+)**
- **Mandatory** for: Simulation, Pathfinding, Combat, Vision, Networking.
- **Performance:** Orders of magnitude faster than GDScript for tight loops.

**Secondary: GDScript**
- **UI Logic:** HUD, Menus.
- **High-level Glue:** Scene composition, signals.

### 2.3 Data Formats
- **JSON:** Strictly schema-validated (see `schemas/`).
    - `units/*.json`
    - `weapons/*.json`
    - `factions/*.json`
    - `divisions/*.json`
- **CSV:** Strings/Localization.

### 2.4 Art Pipeline
- **3D Modeling:** Blender (free, open-source)
- **Texturing:** Krita or GIMP (hand-painted, stylized textures)
- **Icons/UI:** Figma or Inkscape
- **VFX:** Godot's particle systems + simple hand-painted sprite sheets

### 2.5 Version Control
- **Git + GitHub:** Code and small assets
- **Git LFS:** Large binary files (models, textures)

---

## 3. Architecture Overview

### 3.1 High-Level Architecture Pattern
**ECS-Inspired Component System** (using Godot's scene tree)

```
GameManager (Singleton)
├── MatchController
│   ├── TeamManager (5v5 player/AI management)
│   ├── VictoryConditionManager
│   └── TimeManager (day/night cycle)
├── MapController
│   ├── TerrainSystem
│   ├── FogOfWarSystem
│   └── DestructibleEnvironment
├── UnitManager
│   ├── UnitFactory (spawning from decks)
│   ├── PathfindingSystem
│   └── CombatSystem
├── EconomyManager
│   ├── ResourceSystem (Credits/Biomass)
│   └── SupplyLineSystem
├── AIManager
│   ├── AICommander (one per AI player)
│   └── DecisionEngine
└── UIController
    ├── HUD
    ├── MinimapSystem
    └── CommandInterface
```

### 3.2 Core Systems

#### 3.2.1 Unit Management System
**Design:** C# Server-based Architecture
- **Performance:** GDScript is too slow for 1000+ units with complex logic. **All Core Systems (Movement, Combat, Vision) must be C#.**
- **Rendering:** Use `MultiMeshInstance3D` for unit rendering (GPU Instancing) to handle 1000+ counts.
- **Pooling:** Aggressive object pooling.
- **Scale Target:** ~1000 units per match (5v5 × 100 units hard cap).

**Unit Data Structure (JSON):**
Derived from `schemas/unit_stats.json`:
```csharp
public struct UnitData {
    public string id;
    public int health;
    public float roadSpeed;
    public float offRoadSpeed;
    public ArmorData armor; // Front/Side/Rear/Top
    public OpticsLevel optics;
    public StealthLevel stealth;
    public WeaponData[] weapons;
}
```

#### 3.2.2 Pathfinding System
**Technology: A* with Hierarchical Pathfinding**
- **A\* Algorithm:** Industry standard, well-understood
- **Grid-based Navigation:** Divide map into grid cells (e.g., 2m × 2m)
- **Hierarchical Pathfinding:** Divide map into sectors for long-distance paths
- **Flow Fields:** For large groups moving to same destination (cheaper than individual A*)

**Implementation:**
- Use Godot's NavigationServer3D for base pathfinding
- Custom layer for unit-specific rules (infantry, walker, tank traversability)

#### 3.2.3 Combat System
**Deterministic, Tick-Based Simulation**
- Fixed tick rate: 10 ticks/second (100ms per tick)
- All combat calculations happen on tick boundaries
- Random number generation uses seeded RNG for determinism

**Combat Resolution Flow:**
```
1. Check Line of Sight (raycasting)
2. Calculate accuracy (range, stealth, veterancy, suppression)
3. Roll hit/miss
4. If hit: Check penetration vs armor
5. If penetrated: Apply damage
6. Roll for critical hit
7. Apply suppression to target area
```

**Optimization:** Combat calculations only for units in combat (not idle units)

#### 3.2.4 Vision & Fog of War System
**Shader-Based Fog of War**
- Use a low-resolution texture (e.g., 256×256 for a 2km map)
- Each pixel = visibility value (0 = unseen, 0.5 = explored, 1 = visible)
- Update texture each tick based on friendly unit positions + optics
- GPU shader applies fog overlay

**Ghost Signals:**
- Store in separate data structure
- Decay timer (fade after 3-5 seconds)
- Render as simple icons

#### 3.2.5 AI Player System
**Design Goal:** Robust CPU players that can fill empty slots or replace dropped human players mid-match seamlessly.

**AI Architecture: Hierarchical Layered System**
```
AI Commander (per AI player slot)
├── Strategic Layer (every 10 seconds)
│   ├── Territory Control Assessment
│   ├── Resource Allocation
│   ├── Deck Deployment Planning
│   └── Victory Point Strategy
├── Tactical Layer (every 2 seconds)
│   ├── Front Line Management
│   ├── Engagement Decision (attack/defend/retreat)
│   ├── Support Coordination (artillery, air strikes)
│   └── Combined Arms Tactics
└── Micro Layer (every tick/as needed)
    ├── Unit Positioning
    ├── Target Selection
    ├── Ability Usage (smoke, psychic powers)
    └── Retreat/Regroup Execution
```

**Key Features:**
- **Seamless Drop-in/Drop-out:** AI can take over human player's existing units/economy mid-match without disruption
- **Difficulty Levels:**
  - *Easy:* Slow decision-making (5-10s delays), poor unit micro, limited unit variety, no advanced tactics
  - *Medium:* Reasonable decisions (2-5s), basic combined arms, uses smoke/abilities occasionally
  - *Hard:* Fast response (<2s), good positioning, effective ability usage, flanking maneuvers
  - *Expert:* Near-optimal decisions (<1s), aggressive tactics, full roster usage, advanced combined arms
- **Cheating (Optional for Hard+):** Slight vision bonus (10% larger optics) or resource trickle (+5% credits) to compensate for inferior micro compared to humans

**AI Implementation Strategy (Phased):**
1. **Phase 1 (Prototype):** Simple state machine - attack-move toward nearest objective, basic combat response
2. **Phase 2 (Vertical Slice):** Territory control AI - capture/defend zones intelligently, call in reinforcements
3. **Phase 3 (Content Complete):** Tactical AI - combined arms coordination, flanking, smoke usage, ability activation
4. **Phase 4 (Polish):** Difficulty tuning, personality traits (aggressive vs defensive), balance testing

**Technology:**
- **Behavior Trees** (using Godot's BehaviorTree addon or custom GDScript implementation)
- **Utility AI** for decision-making (score potential actions: attack, defend, reinforce, retreat)
- **Influence Maps** for territory assessment (2D heatmap showing friendly/enemy presence strength)

**AI Decision Example (Utility Scoring):**
```gdscript
# Each action gets a score, highest score wins
var score_attack_zone_a = calculate_score(
    enemy_strength, friendly_strength, zone_value, distance
)
var score_defend_zone_b = calculate_score(
    enemy_threat, current_defense, zone_importance
)
# Execute highest scoring action
```

#### 3.2.6 Networking Architecture (Future)
**Deterministic Lockstep**
- All clients simulate the same game state
- Only input commands are networked
- Periodic state hash checks to detect desync
- Replay system comes "for free" (just record inputs)

**Why Lockstep for RTS:**
- Minimal bandwidth (only commands, not unit positions)
- Perfect synchronization
- Replay functionality
- Standard for RTS games (StarCraft, AoE, Company of Heroes)

**AI in Multiplayer:**
- AI players are simulated identically on all clients (deterministic)
- If a human drops, their slot switches to AI control seamlessly
- All players continue with no interruption

---

## 4. Rendering & Graphics

### 4.1 Art Style: Low-Poly Sci-Fi with Hand-Painted Textures
**Reference Games:** Dune: Spice Wars, Homeworld 3 (stylized), Battletech

**Key Characteristics:**
- Low polygon count (500-2000 tris per unit)
- Bold silhouettes for unit readability
- Hand-painted diffuse textures (no PBR complexity)
- Simple palette per faction (Imperial: Grey/Gold, Tyranids: Purple/Bone)
- Strong color coding for team identification

### 4.2 Rendering Pipeline
**Godot Forward+ Renderer**
- Good balance of performance and features
- Excellent for RTS camera (top-down, many units)

**Optimizations:**
- **LOD System:** 3 levels minimum (Full detail, Medium, Billboard sprite)
- **Occlusion Culling:** Use Godot's built-in culling
- **GPU Instancing:** Identical units rendered in batches
- **Static Batching:** Terrain elements combined

### 4.3 Camera System
**RTS-Style Camera**
- Angled top-down view (30-45° from horizontal)
- Free pan (WASD or edge scrolling)
- Zoom (mouse wheel, 3 preset levels)
- Rotation snapping (N/S/E/W cardinal directions)
- Height clamp (prevent seeing under map)

### 4.4 UI/UX Design
**Minimalist HUD:**
- Bottom: Command bar (unit portrait, orders, abilities)
- Top-right: Resources, VP counter, time
- Top-left: Minimap
- Center: Selection info on hover
- **Color-coded feedback:** Green = friendly, Red = enemy, Yellow = neutral/contested

**Control Scheme:**
- Standard RTS controls (Left-click select, Right-click command)
- Drag-box selection
- Control groups (Ctrl+1-9)
- Tactical pause (F1) for accessibility

---

## 5. Data Management

### 5.1 Unit Definition System
**Modular Data-Driven Design**

Units defined in YAML files:
```yaml
unit_id: imperial_guard_infantry_line
name: "Guardsmen Squad"
faction: imperial_guard
category: infantry
squad_size: 10
health: 10
veterancy_options: [0, 1, 2, 3]
weapons:
  - type: lasgun
    count: 8
    damage: 2
    penetration: 1
    suppression: 1
  - type: grenade_launcher
    count: 1
    damage: 5
    penetration: 3
    suppression: 15
movement:
  speed_road: 30
  speed_open: 20
  speed_forest: 10
  can_traverse_water: false
  can_traverse_ruins: true
```

**Benefits:**
- Easy balance iteration (no code changes)
- Modding-friendly
- Version control friendly (text diffs)

### 5.2 Deck Management
**Local Storage:** JSON files in user data directory
- Deck name, faction, division
- Array of unit cards with veterancy choices
- Easy to backup/share decks

### 5.3 Game State Serialization
**For Save/Load and Replays:**
- Serialize entire game state to JSON/binary
- Replay system: Save initial state + all input commands
- AI state is deterministic, so replays include AI perfectly

---

## 6. Performance Targets

### 6.1 Target Specifications
**Minimum Spec:**
- CPU: Intel i5-6600 / AMD Ryzen 5 1600
- GPU: GTX 1050 Ti / RX 560
- RAM: 8 GB
- Storage: 5 GB
- Resolution: 1920×1080 @ 60 FPS

**Recommended Spec:**
- CPU: Intel i5-10400 / AMD Ryzen 5 3600
- GPU: GTX 1660 / RX 5600 XT
- RAM: 16 GB
- Storage: 5 GB SSD
- Resolution: 2560×1440 @ 60+ FPS

### 6.2 Performance Budget
- **Unit Count:** 1000+ active units (Benchmark target)
- **Draw Calls:** <1500 (Heavy use of GPU Instancing required)
- **Physics:** Custom deterministic collision (Simulating 1000+ raycasts/frame). **Do not use Godot Physics for gameplay logic.**
- **Tick Rate:** 10Hz-30Hz Simulation.
- **AI Budget:** 5ms budget per frame (must be widely threaded).

---

## 7. Development Workflow

### 7.1 Milestones (Solo Developer Timeline)

**Phase 1: Prototype (3-4 months)**
- Core engine setup
- Basic pathfinding
- 2 factions, 10 units each
- Simple combat (no crits, no abilities)
- Placeholder art (cubes and spheres)
- **Basic AI opponent** (attack-move only)
- Single-player skirmish vs AI

**Phase 2: Vertical Slice (3-4 months)**
- Full combat system (veterancy, crits, suppression)
- Deck building UI
- 2 factions with full rosters
- Stylized art for all units
- FOB deployment, Forward deploy
- **Improved AI** (territory control, combined arms)
- Polish one 5v5 map

**Phase 3: Content Complete (4-6 months)**
- All 4 factions
- Division system
- 5-10 balanced maps
- Full UI/UX polish
- Menu systems
- **AI difficulty levels** (Easy/Medium/Hard)
- Drop-in/drop-out AI support

**Phase 4: Polish & Release (2-3 months)**
- Bug fixing
- Balance pass
- Performance optimization
- **AI tuning and personality traits**
- Playtesting with community
- Early Access or full release

**Total Dev Time:** ~12-18 months (solo, part-time)

### 7.2 Tools & Workflow
**Daily Workflow:**
1. Version control (commit nightly)
2. Balance iteration (edit YAML, test in-game)
3. Automated builds (GitHub Actions for CI/CD)

**Playtesting:**
- Weekly builds for friends/testers
- Feedback via Discord server
- Balance spreadsheet tracking (Google Sheets)
- **AI vs AI matches** for stress testing and balance

---

## 8. Risks & Mitigation

### 8.1 Technical Risks
| Risk | Impact | Mitigation |
|------|---------|------------|
| Pathfinding performance | High | Start with A*, upgrade to HPA* if needed |
| Unit count scaling | High | Object pooling, LOD, aggressive culling |
| Combat simulation bottleneck | Medium | Profile early, move to C# if needed |
| **AI complexity explosion** | **High** | **Keep AI simple (state machines), iterate slowly** |
| **AI not fun to play against** | **Medium** | **Playtest early, add difficulty levels and handicaps** |
| **AI cheating feels unfair** | **Medium** | **Make cheating opt-in, clearly communicate bonuses** |

### 8.2 Scope Risks
| Risk | Impact | Mitigation |
|------|---------|------------|
| Feature creep | Critical | Lock features after vertical slice |
| Art asset creation time | High | Reuse components, kitbash units |
| Balance complexity (4 factions × divisions) | High | Focus on 2 factions for balance first |
| **AI taking too long to develop** | **High** | **Phase AI development, ship with basic AI first** |

---

## 9. Conclusion

This architecture prioritizes **simplicity**, **maintainability**, and **fast iteration** for a solo indie developer. By using proven technologies (Godot, A*, lockstep networking), a stylized art direction, data-driven design, and **robust AI for single-player and multiplayer resilience**, the project can be completed in a reasonable timeframe while maintaining quality.

**Key Takeaways:**
- **Godot 4** for engine (free, mature, RTS-friendly)
- **Low-poly, hand-painted art** (fast to create, distinctive style)
- **Data-driven unit design** (easy balance iteration)
- **Deterministic simulation** (easier debugging, replay-friendly)
- **Layered AI system** (strategic, tactical, micro layers for depth)
- **Drop-in AI support** (seamless replacement for disconnected players)
- **Aggressive scoping** (2 factions polished > 4 factions half-done)
