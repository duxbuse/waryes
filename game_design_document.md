# Stellar Siege: Planetary Conflict - Game Design Document

## 1. Overview
**Stellar Siege** is a Real-Time Strategy (RTS) game that blends the tactical depth and deck-building mechanics of *WARNO* with the grim, gothic sci-fi aesthetic and melee intensity of *Warhammer 40k*.

The game focuses on asymmetric planetary warfare. Matches typically revolve around a **Siege Scenario**: one player (or team) acts as the **Defender** (protecting a Hive City or strategic planet), while the other acts as the **Attacker** (an invading force).

### Visual Theme & Atmosphere
*   **Aesthetic:** Grim dark, brooding, and industrial. The world is war-torn, polluted, and hostile.
*   **Lighting:** Dark, high-contrast lighting to emphasize the brutality of combat and the importance of vision.
*   **Day/Night Cycle:**
    *   **Cycle Duration:** A full in-game day/night cycle lasts **2 hours**.
    *   **Match Duration:** Typical matches last **30-60 minutes** (fast games ~15 mins).
    *   **Impact:** Purely visual. Lighting conditions change to enhance atmosphere but do **not** affect unit stats or vision ranges.

## 2. Factions
The game features highly asymmetrical factions, each with unique command available in their respective faction documentss.

*   **[Planetary Defense Force](./factions/planetary_defense_force.md):** Industrial, militaristic, disciplined. The Hammer of the Emperor.
*   **[Vanguard Legions](./factions/vanguard_legions.md):** Elite, low model count, shock assault. The Angels of Death.

For full faction details, mechanics, and division breakdowns, please refer to the specific faction documents.



## 3. Deck Building & Divisions
Before a match, players build a **Battlegroup** (Deck) from their chosen faction and division.

### The Deck System
Deck building revolves around a **Deck Point System**.
1.  **Deck Capacity:** Each deck has a maximum of **50 Activation Points**.
2.  **Slot Activation:** Adding unit cards to your deck consumes Activation Points.
3.  **Progressive Cost:** The cost to unlock slots within a specific category increases as you unlock more slots.
    *   *Example:* An Infantry Division might have cheap Infantry slots (1, 1, 1, 1, 1, 2, 2, 2, 3, 3) but expensive Tank slots (2, 3, 4).
    *   *Impact:* This forces specialization. You can take a few off-meta units cheaply, but heavily investing in a category outside your division's focus becomes prohibitively expensive.

### Deck Building Process
1.  **Choose Faction:** Select Planetary Defense Force or Vanguard Legions.
2.  **Choose Division:** Select a specific specialized division (e.g., Armored, Infantry).
3.  **Fill Slots:** Select unit cards to fill your available slots, managing your **50 Point** budget.
    *   **Unit Cost:** In-game deployment cost (Credits).
    *   **Card Availability:** Number of units per card.
    *   **Veterancy:** Higher veterancy reduces unit count per card.

### The Division System
Divisions represent specialized corps with distinct strengths and weaknesses, designed to encourage **5-player Team Coordination**.

*   **Specialization:** Each division focuses on a specific combat doctrine.
    *   *Armored Division:* Access to the heaviest tanks and walkers, but limited Recon and Air slots.
    *   *Recon/Vanguard Division:* High speed, stealth, and superior optics, but lacks heavy armor and sustained firepower.
    *   *Mechanized Infantry:* Massive infantry numbers and transport options, balanced support, but lacks the punch of pure Armor or the speed of Recon.
    *   *Air Assault:* Dominate the skies with gunships and drop troops, but fragile on the ground.
*   **Team Synergy:** A balanced team requires a mix of divisions. An Armored player needs a Recon teammate to spot targets, while an Infantry player needs Air support to crack heavy defenses.

### Unit Categories
The deck is composed of unit cards divided into the following categories.

> [!NOTE]
> **Commander Units:** Commanders are **not** a separate category. They are specialized units found within their respective categories (e.g., an **Infantry Commander** is found in the **Infantry** tab).
> *   **Deck Cost:** Selecting a Commander card consumes a standard slot allocation for that category (e.g., uses 1 Infantry Slot).
> *   **Role:** Essential for capturing Command Zones and providing Veterancy bonuses (Aura).
> *   **Limited Availability:** Decks have a hard cap on Commanders (typically 1-2 cards total across the whole deck).
> *   **Forced Veterancy:** Commanders deploy at max rank by default.

1.  **Logistics:**
    *   **Forward Operating Base (FOB):** A unique static building loaded with massive supplies.
        *   *Capacity:* Holds **~16,000 Supply Points**. Can refill other supply units.
        *   *Deployment:* Can **only** be deployed during the initial Setup Phase.
        *   *Function:* Acts as a supply bank. Critical to protect.
        *   *Availability:* Not all Divisions have access to FOBs (e.g., some Recon/Airborne divisions must rely on trucks/airdrops).
        *   *Vulnerability:* Highly explosive.
    *   **Supply Units:** Trucks and helicopters that ferry supplies.
        *   *Trade-off:* Supply cards offer a fixed **Total Supply Volume** (e.g., one card gives 12x Small Trucks @ 200 supply, or 2x Heavy Haulers @ 1200 supply).
        *   *Strategy:* Small trucks are flexible but cost more credits to deploy the full fleet. Heavy haulers are efficient but risky high-value targets.
    *   **Support:** Repair cranes, engineering vehicles.
2.  **Infantry:**
    *   **Infantry Commanders:** Command squads that inspire nearby troops.
    *   **Squad Mechanics:** Each infantry unit card represents a full squad of **4 to 20 troops**.
        *   *Small Squads (4-6):* Elite commandos, heavy weapon teams.
        *   *Large Squads (10-20):* Conscript waves.
    *   *Line Infantry:* Standard riflemen.
    *   *Shock Troops:* Close-quarters specialists.
    *   *Heavy Weapons:* Anti-tank or heavy bolter teams.
3.  **Tanks:**
    *   **Tank Commanders:** Ace crews in superior vehicles.
    *   *Main Battle Tanks:* Heavily armored, directional firing.
    *   *Walkers:* More mobile, can traverse rough terrain.
4.  **Recon:** Scouts, sniper teams, light hover-bikes, sensor drones. Critical for spotting.
5.  **Aircraft & Spacecraft:**
    *   **Categories:**
        *   **Grounded:** Aircraft landed on the ground. **Required state for standard resupply.**
        *   **Hover:** Low altitude CAS, gunships.
        *   **Fly:** Standard atmospheric flight.
        *   **Soar:** High altitude interceptors/bombers.
        *   **Space:** Orbital assets.
    *   **Resupply Mechanic:**
        *   **Standard:** Units must be **Grounded** (landed) to receive supplies from trucks/FOBs.
        *   **Evacuation:** Units capable of **Fly** (or higher) can **Evacuate** off-map to resupply safely (but takes time to return).
    *   **Deployment Mechanic:**
        *   High altitude units are **called in** from reserves.
        *   Fly at extreme height and speed.
        *   Can **evacuate** the battlefield at any time.
    *   **Dynamic Resupply Timer:** Time until the unit is available again is determined by fuel/ammo consumed.
    *   **Altitude Mechanics:**
        *   *Dive Bombers:* Travel at **Soar**, dive to **Hover/Fly** for attack.
        *   *High Altitude Bombers:* Stay at **Soar**. Safe from short-range AA.
6.  **Anti-Air:** Flak tanks, SAM sites.
7.  **Artillery:** Long-range indirect fire units (Basilisks). Critical for breaking static defenses and punishing clustered enemies.

## 4. Combat Mechanics

### Directional Armor & Ballistics
*   **Directional Armor:** Vehicles have distinct **Front**, **Side**, **Rear**, and **Top** armor values.
*   **Tactical Reversing:** Vehicles possess a specific "Reverse" move command. This allows them to retreat at reduced speed while keeping their thickest **Front Armor** facing the enemy.
*   **Ballistics:**
    *   **Max Range:** Accuracy is generally poor. Long-range engagements are about suppression and area denial.
    *   **Close Range:** Accuracy and penetration ramp up drastically. Fights become decisive and lethal quickly as ranges close.
    *   **Time To Kill (TTK):** Low. A flank shot on a tank or a clean burst on an infantry squad is often fatal.

### Weapon Stats
All weapons have multiple stat values:
*   **Damage:** The raw damage dealt on a successful hit.
*   **Armor Penetration (AP):** The ability to pierce armor. Must exceed the target's armor value to deal any damage.
    *   **Kinetic Scaling:** Kinetic weapons gain penetration at close range. This is dramatic for main cannons (a flanking light tank can destroy a heavy tank in close quarters) but negligible for small arms due to their limited range.
*   **Suppression:** The morale shock inflicted, **even on near-misses**. High suppression weapons (artillery, heavy machine guns) affect all units in the blast/impact area, degrading their combat effectiveness.

### Unit Weapon Loadouts
Combat units typically carry **1-4 distinct weapon systems**:
*   **Infantry Squads:**
    *   *Example (10-man squad):* 8x Rifles, 1x Sniper Rifle, 1x Anti-Tank Rocket Launcher, Grenades.
*   **Vehicles:**
    *   *Example (Tank):* 1x Main Cannon, 1x Coaxial Machine Gun, Smoke Launchers
*   **Aircraft:**
    *   *Example (Fighter-Bomber):* 1x Main Cannon, 1x Bomb, 2x Anti-Air Missiles.

### Missiles & Rockets
The primary anti-vehicle weapons, offering unique tactical depth:
*   **Damage:** Fixed damage per hit (consistent lethality).
*   **Range:** Good effective range.
*   **Travel Speed:** Slow projectile speed.
*   **Line of Sight Requirement:** Missiles require **maintained LOS** from launch to impact. If LOS is broken, the missile loses tracking.
*   **Counterplay - Smoke:** Enemies can deploy smoke to break LOS and cause missiles to miss.
*   **Lateral Agility:** Limited maneuverability.
    *   *Stationary Targets:* Easy to hit, even at maximum range.
    *   *Fast-Moving Targets:* Harder to hit at range due to limited tracking ability.

### Health & Critical Hits
*   **Health System:** Units use a standardized ~10 HP system.
    *   *Light Vehicles:* ~8 HP
    *   *Medium Vehicles:* ~10 HP
    *   *Heavy Vehicles:* ~11 HP
    *   Weapons are balanced to require multiple hits to destroy targets.
*   **Critical Hits:**
    *   **Trigger:** Low chance on any hit that would deal damage (e.g., pistols cannot crit tanks).
    *   **Effect:** Deals **+1 damage** and applies a random **Malus** from the unit's crit table.
    *   **Malus Examples (Vehicles):** Stunned (temporary), Optics Destroyed, Engine Disabled, Crew Bailed Out, Radio Destroyed, Turret Jammed.
    *   **Malus Examples (Infantry):** Stunned (temporary), Radio Destroyed.
    *   **Repair:** Permanent maluses (optics, engine, radio) can be repaired by resupply units. Temporary ones (stun) wear off.
    *   **Impact:** Vehicles experience crits more often (higher HP = more shots taken), but infantry squads typically die outright before accumulating maluses.

### Morale & Cohesion
*   **Cohesion:** Units must stay near their squadmates. Breaking cohesion drastically reduces accuracy and makes them vulnerable.
*   **Morale:** Taking fire, casualties, or being near terrifying units (like Artillery or Monsters) lowers morale.
    *   **Low Morale:** Reduces accuracy and movement speed.
    *   **Routing:** If morale hits zero, the unit flees and becomes uncontrollable until rallied by an Officer or Commander.
*   **Artillery Fear:** Indirect fire causes massive morale damage, forcing players to **spread units out** to minimize suppression and panic.

### Vision, Stealth & Optics
*   **Line of Sight (LOS):**
    *   *Forests/Natural Cover:* Severely limit LOS in all directions. Harder to spot units inside.
    *   *Urban:* Complex LOS due to buildings, but long sightlines down streets.
    *   *Elevation (Hills, Cliffs, Ridges):* Terrain elevation creates significant LOS advantages and disadvantages.
        *   **Below the Crest:** Units positioned on the lower slopes or at the base cannot see over the terrain feature. LOS is blocked by the ridgeline.
        *   **On the Crest:** Units positioned at the peak or ridgeline gain superior LOS:
            *   Can see over the terrain feature in both directions.
            *   Gain vision advantage over units below.
            *   **Exposure Trade-off:** While gaining vision, units on the crest are silhouetted against the skyline, making them easier to spot from a distance.
        *   **Reverse Slope Defense:** Units positioned just behind the crest (reverse slope) are hidden from enemy LOS while still being able to quickly advance to firing positions on the crest.
        *   **Tactical Importance:** Controlling high ground provides critical vision control, making hills and ridges key strategic positions.
*   **Optics vs. Stealth:**
    *   **Optics:** Determines the maximum range a unit can detect enemies.
    *   **Stealth Value:** Determines how much **further away** a unit appears to be to enemy sensors.
    *   *The Mechanic:* A unit with high stealth might be at 500m, but the enemy targets it as if it were at 1000m. This drastically reduces **Accuracy** (harder to hit) but does **not** reduce **Kinetic Damage** (if a shot lands, it hits with full force for the actual distance).
*   **LOS Tool:**
    *   **Dedicated Button:** A specific keybind/button allows players to preview the Line of Sight from any point on the map.
    *   **Functionality:** When active, the player clicks a location to see exactly what a selected unit *would* see from that spot, accounting for the unit's specific optics and terrain obstructions.
*   **Ghost Signals (Audio/Projectile Detection):**
    *   If a unit is outside visual range but generates noise (engines, firing) or fires visible projectiles, it appears as a **Ghost Signal**.
    *   **Icon Only:** The enemy sees a category icon (e.g., "Tank", "Infantry") but not the specific unit type.
    *   **Static & Fading:** The icon remains at the location of the last event but **fades and disappears** after a few seconds, as it represents outdated information.
*   **Recon Spotting:**
    *   Recon units project a **Spotting Radius**.
    *   **Artillery Synergy:** Artillery firing at targets within a friendly Recon unit's spotting radius eliminates the standard long-range accuracy penalty, allowing for pinpoint precision.
### Smoke Mechanics
Smoke is a critical tool for breaking Line of Sight (LOS) and protecting units.
*   **Ammo:** Smoke capabilities are **Single Use Only**. Units must Resupply to use smoke again.
*   **Types & Duration:**
    *   **Smoke Grenades (Infantry/Commanders):**
        *   *Radius:* ~5m (Small)
        *   *Duration:* ~20 seconds (Short)
    *   **Smoke Launchers (Tanks/Vehicles):**
        *   *Radius:* ~50m like half doughnut firing 6 smoke grenades in a semi-circle about the vehicle (Medium)
        *   *Duration:* ~20 seconds (Short)
    *   **Artillery Shells:**
        *   *Radius:* ~50m (Large Area)
        *   *Duration:* ~1 minute (Long)
    *   **Aerial Smoke Curtains:**
        *   *Shape:* Wall of smoke ~1km long.
        *   *Effect:* Blocks both ground and **Aerial** vision.
        *   *Duration:* ~20-30 seconds.

### Terrain & Movement

#### Vehicle Speed by Type
Different propulsion systems have distinct performance characteristics:
*   **Tracked Vehicles:** 
    *   Roads: **70 km/h** (top speed)
    *   Open Country: **50 km/h** (cruising speed)
*   **Wheeled Vehicles:** 
    *   Roads: **140 km/h** (top speed)
    *   Open Country: **100 km/h** (cruising speed)
*   **Hover Vehicles:** 
    *   Hover: **200 km/h** (top speed)
    *   Fly: **250 km/h** (top speed)
*   **Planes:** 
    *   Fly: **1000 km/h** (top speed)
    *   Soar: **3000 km/h** (top speed)


#### Altitude Levels
Units operate across **5 distinct altitude bands**:
1.  **Grounded:** Surface level. Standard movement for tanks, infantry, and landed aircraft.
2.  **Hover:** 3-10 feet (Nap of the Earth).
    *   Hover vehicles skim just above the surface.
    *   Can use terrain masking for cover.
    *   Vulnerable to all ground-based weapons.
3.  **Fly:** 100 feet to 5,000 feet.
    *   Standard engagement altitude for CAS units and Gunships.
    *   Moderate AA vulnerability.
4.  **Soar:** 10,000 feet to 50,000 feet.
    *   High altitude bombers and interceptors.
    *   Reduced AA threat (only long-range SAMs effective).
    *   Greater bomb dispersion due to altitude.
5.  **Space:** 400 km orbital altitude.
    *   Spacecraft and orbital platforms.
    *   Immune to ground-based AA.
    *   Precision orbital strikes or wide-area bombardment.
    *   **Counterplay:** Cannot be attacked directly. Players must locate and destroy the **Forward Observer** unit calling in the strikes to stop the bombardment. Long cooldowns prevent spam.

#### Basic Terrain Types
*   **Roads:** Units travel at **Maximum Speed** (100% of top speed).
*   **Off-Road (Fields, Plains):** **cruising speed**
*   **Defensive Terrain (Forests, Swamps):** **Slowest** movement speed.
*   **Water Bodies:** Rivers and lakes block most units. Only **Amphibious** or **Hover** units can traverse them.
*   **Difficult Terrain:** Ruins, buildings, dense forest, and small cliffs are **only traversable** by:
    *   Infantry
    *   Walker vehicles
    *   Bikes
    *   Standard tanks and large vehicles **cannot** pass through these areas.

#### Special Terrain Effects

##### Soft Ground (Marsh, Sand, Snow, Mud)
Unstable terrain that penalizes ground vehicles. Risk of becoming **Bogged** (critical status).
*   **Wheeled Vehicles:**
    *   Move at **50% maximum speed**.
    *   **10% chance to become Bogged** when:
        *   Attempting to move from a stationary position, *or*
        *   For every 5 km traveled through soft ground.
    *   **Bogged Status:** Vehicle is immobilized until repaired by engineering units.
*   **Tracked Vehicles:**
    *   Move at **75% maximum speed**.
    *   **5% chance to lose traction** (same triggers as wheeled).
    *   More resistant to bogging due to weight distribution.
*   **Infantry:**
    *   Move at **90% maximum speed**.
    *   No bogging penalty.
*   **Hover Vehicles:**
    *   Move at **100% maximum speed**.
    *   Immune to soft ground penalties (glide over surface).

##### Rough Ground (Rubble, Rocky Terrain, Ice, Fallen Logs, Dense Forest)
Hazardous terrain that damages mechanical systems and risks catastrophic failures.
*   **Wheeled Vehicles:**
    *   Move at **10% maximum speed** (extremely slow).
    *   **15% chance of Tyre Blowout** per movement action through rough ground.
    *   **Tyre Blowout:** Critical status. Each vehicle carries **only 1 spare tyre** per resupply cycle (similar to smoke grenades).
        *   First blowout can be repaired using the spare.
        *   Second blowout requires a supply unit to rearm/repair.
        *   Drastically reduces mobility until repaired.
*   **Tracked Vehicles:**
    *   Move at **25% maximum speed**.
    *   **5% chance of Derailed Track** per movement action through rough ground.
    *   **Derailed Track:** Critical status. Immobilizes the vehicle.
        *   Repair takes **significant time** but does **not** consume supplies (field repair by crew).
        *   Vehicle is vulnerable while crew conducts repairs.
*   **Infantry:**
    *   Move at **85% maximum speed**.
    *   No critical failure risk.
*   **Hover Vehicles:**
    *   Move at **85% maximum speed**.
    *   Reduced agility over uneven terrain but no risk of mechanical failure.

#### Terrain Destructibility
Heavy firepower can collapse buildings and flatten forests.
*   **Ruins:** Destroyed buildings become "Ruins" (rough terrain/cover) and can no longer be garrisoned.
*   **Fire:** Forests and buildings can be set on fire, dealing damage over time to occupants and generating large clouds of **Smoke** that obstruct vision.

### Cover & Fortifications
*   **Defensive Bonus:** Cover provides damage reduction against incoming fire.
*   **Garrison System:**
    *   **Sectors:** Buildings are grouped into "Sectors" (e.g., a city block, a warehouse complex). Units garrison the sector, not individual windows.
    *   **Who can Enter:** Infantry, **Walkers**, and **Bikers**.
        *   *Entry Time:* Infantry enter quickly. Walkers/Bikers take significantly **longer** to enter/exit.
    *   **Who cannot:** Tanks and large vehicles cannot enter buildings.
    *   **Height Advantage:** Tall buildings (skyscrapers) provide superior LOS (seeing over obstacles) but make the garrisoned unit more visible to enemies (Asymmetric Vision).
*   **Field Works:** Infantry can spend time to construct defenses:
    *   **Sandbags:** Light cover, quick to build.
    *   **Trenches:** Heavy cover, protects against indirect fire.
    *   **Tank Traps/Barbed Wire:** Slows enemy movement.

## 5. Abilities & Powers
Beyond standard unit toggles (Weapons On/Off, Smoke), "Special" units possess game-changing active abilities.

### Universal Keywords
Traits that apply passively to specific units across all factions:
*   **Assault:** Deals significantly increased **Suppression** to enemies within close range (e.g., <300m).
*   **Recon:** Projects a spotting radius that removes the long-range accuracy penalty for friendly artillery.
*   **Resolute:** Counts as **+1 Veterancy Level** for calculations regarding Morale damage and Suppression resistance (harder to break).
*   **Infiltrator:** Increases the unit's **Stealth Value** when stationary in cover.

### Active Abilities
*   **Psychic Powers:**
    *   *Smite:* Direct damage to a single target.
    *   *Warp Storm:* Area denial that slows and damages units.
    *   *Precognition:* Briefly reveals a sector of the map.
*   **Deep Strike / Subterranean Assault:**
    *   Elite units (Terminators) can deploy mid-match deep behind enemy lines via drop pods, bypassing the standard reinforcement lanes.


## 6. Economy & Logistics

### Resource Generation
*   **Standard Economy (Defenders):**
    *   **Starting Budget:** Players begin the match with **1500 Credits** to spend on initial deployment.
    *   **Income:** Players receive a steady passive stream of Credits per tick (Tick Rate).
    *   **Usage:** Credits are used to call in reinforcements from your Deck. Once your credit bank is empty, you must wait for the next tick.


### Resupply & Logistics
*   **Universal Resupply:** Supply units (trucks, helicopters) can service **all** unit types:
    *   **Refuel:** Restore vehicle fuel.
    *   **Rearm:** Replenish ammunition for all weapons.
    *   **Repair:** Fix damage to vehicles, armor, and even heal infantry squads (representing field medics).
*   **Strategic Importance:** Keeping supply lines safe and active is critical for sustained combat operations.

### Transports & Refunds
*   **Deck Building Choice:** Players select specific transport options for their infantry units during deck building. Availability is unique per unit.
*   **Refunds:**
    *   *Basic Transports:* Unarmed or lightly armed trucks can be sent back to base (despawned) to refund **100%** of their cost.
    *   *Combat Transports:* Heavily armed or specialized transports (e.g., IFVs with autocannons) cannot be refunded and remain as combat units.
*   **Destruction:**
    *   If a transport is destroyed while carrying troops, the passengers take **heavy damage**.
    *   Usually results in the **complete destruction** of the infantry squad.
    *   **High Risk (Commanders):** If a Commander is in a destroyed transport, they are likely killed. This makes **Tank Commanders** (with their own high armor) a safer but significantly more expensive investment.
    *   **Tactical Implication:** Encourages players to dismount infantry before entering dangerous zones.

## 7. Winning Conditions & Game Scale

### Victory Conditions
### Victory Conditions
*   **Race to Victory:** The first team to reach **2000 Victory Points (VP)** wins.
*   **Control Zones:** The map contains key strategic sectors (Command Zones) that generate VP.
    *   *Value:* Zones typically generate **1 to 3 Points Per Second** depending on strategic importance.
    *   *Total Yield:* Controlling all zones yields ~10-15 Points Per Second (fast win).
*   **Capture Mechanic:**
    *   **Requirement:** Zones can **only** be captured by **Commander Units**.
    *   **State - Logic:**
        1.  **Neutral:** Zone generates no points.
        2.  **Capturing:** Commander stays in zone to convert it to friendly control.
        3.  **Controlled:** Zone generates points for the owner. Commander can leave, and the zone remains controlled.
        4.  **Decapturing:** Enemy Commander enters a Controlled zone. It first reverts to **Neutral** (stops generating points), then begins capturing for the enemy.
        5.  **Contested:** If **both** teams have Commanders in the zone, it counts as Neutral (no points generated) until one force is removed.
    *   **Capture Time:** Requires **10-30 seconds** (depending on Zone size) of uninterrupted presence to convert control.
    *   **Loss of Command:** If a player loses all Commanders, they retain currently held zones but **cannot** capture new ones or re-capture lost ones. This puts them at a severe strategic disadvantage.

### Game Scale
*   **Format:** Predominantly **5v5**.
*   **Scope:** Maps are massive (Sector Scale), creating a sense of immense planetary warfare.
*   **Unit Cap:** To maintain manageability, each player controls a limited number of units.
    *   *Typical Active Count:* 20-40 units.
    *   *Hard Cap:* ~100 units maximum per player.

### Deployment & Resupply
*   **Resupply Points:** Located at map edges (land and air corridors). Shared by the team but asymmetrically placed.
*   **Setup Phase:**
    *   Players deploy initial units within a **Bounding Box** around their team's supply points.
*   **Forward Deploy:**
    *   Specific units (e.g., Recon, Infiltrators) have a **Forward Deploy** trait (e.g., +1000m).
    *   These units can start the match significantly ahead of the standard deployment zone, allowing for early land grabs or ambushes.

## 8. Veterancy & Progression
All units possess a Veterancy Level that significantly impacts performance.

*   **Scale:** 5-Point Scale (0 to 4).
*   **Stats Affected:** Accuracy, Aim Speed, Reload Speed, Off-road Speed, Cohesion, Morale (harder to break), and Morale Recovery Speed.
*   **Dynamic Progression:**
    *   Units gain veterancy experience **in-match** by:
        *   **Destroying Enemies:** Earn XP for each kill.
        *   **Survival Under Fire:** Units that take heavy damage but are **repaired/healed** gain XP, rewarding players for preserving their forces.
    *   **Incentive:** Veteran units are significantly more effective, encouraging careful unit management and preservation.
*   **Commander Aura:** Nearby Commanders passively increase the Veterancy Rank of all friendly units in range by +1.
*   **Deck Building Trade-off:**
    *   Players choose the base veterancy of cards in their deck.
    *   **Higher Veterancy = Lower Availability.** (e.g., You might get 8 Rookies per card, but only 4 Veterans).
    *   **Unit Restrictions:** Not all units have access to all ranks.
        *   *Reservists/Conscripts:* Locked to lower ranks (e.g., Green/Rookie only).
        *   *Standard Troops:* Access to mid-range ranks (e.g., 1-3).
        *   *Special Forces:* Locked to high ranks (e.g., Elite only).
