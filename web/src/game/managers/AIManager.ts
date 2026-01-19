/**
 * AIManager - Handles AI behavior for CPU-controlled units
 *
 * Strategic AI that:
 * - Captures and defends zones
 * - Coordinates unit groups
 * - Uses smoke for protection
 * - Retreats damaged units
 * - Plans attacks on enemy positions
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import type { CaptureZone } from '../../data/types';
import { VectorPool } from '../utils/VectorPool';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

type AIBehavior = 'idle' | 'attacking' | 'moving' | 'capturing' | 'defending' | 'retreating' | 'supporting';

interface AIUnitState {
  behavior: AIBehavior;
  targetUnit: Unit | null;
  targetPosition: THREE.Vector3 | null;
  targetZone: CaptureZone | null;
  lastDecisionTime: number;
  lastDamageTime: number;
  lastSmokeTime: number;
  healthAtLastCheck: number;
  assignedObjective: string | null; // Zone ID or 'attack' or 'defend'
}

interface ZoneAssessment {
  zone: CaptureZone;
  priority: number;
  distanceToNearestUnit: number;
  enemyPresence: number;
  friendlyPresence: number;
  needsDefense: boolean;
  needsCapture: boolean;
  isContested: boolean;
}

interface ThreatAssessment {
  totalEnemyStrength: number;
  totalFriendlyStrength: number;
  isWinning: boolean;
  shouldBeAggressive: boolean;
}

interface GroupComposition {
  totalUnits: number;
  categoryCounts: Record<string, number>; // Category -> count
  totalStrength: number; // Sum of all unit health values
  averageHealth: number; // Average health percentage (0-1)
  hasLogistics: boolean; // Can capture zones
  hasInfantry: boolean; // Good for close combat and urban
  hasArmor: boolean; // TNK - heavy firepower and armor
  hasRecon: boolean; // REC - spotting and flanking
  hasAA: boolean; // Anti-air coverage
  hasArtillery: boolean; // Long-range fire support
  hasAir: boolean; // HEL or AIR units
  maxWeaponRange: number; // Longest weapon range in group
  canCapture: boolean; // Has LOG units to capture zones
  isBalanced: boolean; // Has variety of unit types
  antiArmorCapability: number; // Sum of penetration values
  antiInfantryCapability: number; // Units good against soft targets
}

export class AIManager {
  private readonly game: Game;
  private readonly aiStates: Map<string, AIUnitState> = new Map();
  private difficulty: AIDifficulty = 'medium';

  // Timing parameters based on difficulty
  private readonly decisionIntervals: Record<AIDifficulty, number> = {
    easy: 4.0,    // 4 seconds between decisions (was 3)
    medium: 2.0,  // 2 seconds (was 1.5)
    hard: 1.0,    // 1 second (was 0.5)
  };

  // Strategic parameters
  private readonly engageRange = 80;
  private readonly retreatHealthThreshold = 0.25;
  private readonly smokeCooldown = 15; // seconds between smoke deployments
  private readonly damageThresholdForSmoke = 0.15; // 15% health lost triggers smoke
  private readonly suppressionThresholdForRetreat = 70; // High suppression triggers retreat

  // Strategic state
  private lastStrategicUpdate = 0;
  private readonly strategicUpdateInterval = 4.0; // Update strategy every 4 seconds (was 2)
  private zoneAssessments: ZoneAssessment[] = [];

  // OPTIMIZATION: Stagger AI updates across frames
  private updateFrameCounter = 0;
  private readonly AI_UPDATE_THROTTLE = 10; // Only process 1/10th of units per frame (was 5)
  private threatAssessment: ThreatAssessment = {
    totalEnemyStrength: 0,
    totalFriendlyStrength: 0,
    isWinning: false,
    shouldBeAggressive: false,
  };

  // OPTIMIZATION: Cache CPU-controlled units to avoid filtering every frame
  private cachedCpuUnits: Unit[] = [];
  private lastCpuUnitsCacheUpdate = 0;
  private readonly CPU_CACHE_INTERVAL = 0.5; // Update cache every 0.5 seconds

  // OPTIMIZATION: Cache team unit lists to avoid repeated getAllUnits calls
  private cachedFriendlyUnits: readonly Unit[] = [];
  private cachedEnemyUnits: readonly Unit[] = [];

  constructor(game: Game) {
    this.game = game;
  }

  initialize(difficulty: AIDifficulty = 'medium'): void {
    this.difficulty = difficulty;
    this.aiStates.clear();
    this.zoneAssessments = [];
    this.lastStrategicUpdate = 0;
    this.cachedCpuUnits = [];
    this.lastCpuUnitsCacheUpdate = 0;
    this.cachedFriendlyUnits = [];
    this.cachedEnemyUnits = [];
  }

  setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty;
  }

  /**
   * Analyze the composition of a unit group to determine capabilities and balance
   * Used for tactical decision-making and force assessment
   */
  analyzeGroupComposition(units: Unit[]): GroupComposition {
    const composition: GroupComposition = {
      totalUnits: 0,
      categoryCounts: {},
      totalStrength: 0,
      averageHealth: 0,
      hasLogistics: false,
      hasInfantry: false,
      hasArmor: false,
      hasRecon: false,
      hasAA: false,
      hasArtillery: false,
      hasAir: false,
      maxWeaponRange: 0,
      canCapture: false,
      isBalanced: false,
      antiArmorCapability: 0,
      antiInfantryCapability: 0,
    };

    // Early exit for empty groups
    if (units.length === 0) {
      return composition;
    }

    let totalHealthPercent = 0;
    let uniqueCategories = 0;

    // Analyze each unit in the group
    for (const unit of units) {
      if (!unit || unit.health <= 0) continue;

      composition.totalUnits++;
      totalHealthPercent += unit.health / unit.maxHealth;
      composition.totalStrength += unit.health;

      const category = unit.unitData.category;

      // Count by category
      composition.categoryCounts[category] = (composition.categoryCounts[category] ?? 0) + 1;

      // Set capability flags
      if (category === 'LOG') {
        composition.hasLogistics = true;
        composition.canCapture = true;
      }
      if (category === 'INF') composition.hasInfantry = true;
      if (category === 'TNK') composition.hasArmor = true;
      if (category === 'REC') composition.hasRecon = true;
      if (category === 'AA') composition.hasAA = true;
      if (category === 'ART') composition.hasArtillery = true;
      if (category === 'HEL' || category === 'AIR') composition.hasAir = true;

      // Analyze weapons for capabilities
      for (const weaponSlot of unit.unitData.weapons) {
        const weaponData = this.game.getWeaponById(weaponSlot.weaponId);
        if (!weaponData) continue;

        // Track maximum weapon range
        if (weaponData.range > composition.maxWeaponRange) {
          composition.maxWeaponRange = weaponData.range;
        }

        // Anti-armor capability (high penetration weapons)
        if (weaponData.penetration >= 5) {
          composition.antiArmorCapability += weaponData.penetration * weaponSlot.count;
        }

        // Anti-infantry capability (high damage, low penetration)
        if (weaponData.damage >= 20 && weaponData.penetration < 5) {
          composition.antiInfantryCapability += weaponData.damage * weaponSlot.count;
        }
      }
    }

    // Calculate averages
    if (composition.totalUnits > 0) {
      composition.averageHealth = totalHealthPercent / composition.totalUnits;
    }

    // Determine if group is balanced (has at least 3 different unit types)
    uniqueCategories = Object.keys(composition.categoryCounts).length;
    composition.isBalanced = uniqueCategories >= 3;

    return composition;
  }

  /**
   * OPTIMIZATION: Update cached list of CPU-controlled units
   * Only called periodically to avoid filtering every frame
   */
  private updateCpuUnitsCache(currentTime: number): void {
    if (currentTime - this.lastCpuUnitsCacheUpdate < this.CPU_CACHE_INTERVAL) {
      return; // Cache is still fresh
    }

    const allUnits = this.game.unitManager.getAllUnits();
    this.cachedCpuUnits = allUnits.filter(u =>
      u.health > 0 && (u.team === 'enemy' || (u.team === 'player' && u.ownerId !== 'player'))
    );
    this.lastCpuUnitsCacheUpdate = currentTime;
  }

  /**
   * Update AI for all CPU-controlled units (enemy team + allied AI)
   */
  update(dt: number): void {
    const currentTime = performance.now() / 1000;

    // OPTIMIZATION: Update CPU units cache periodically
    this.updateCpuUnitsCache(currentTime);

    // OPTIMIZATION: Early exit if no CPU units
    if (this.cachedCpuUnits.length === 0) return;

    // Update strategic assessment periodically
    if (currentTime - this.lastStrategicUpdate >= this.strategicUpdateInterval) {
      this.updateStrategicAssessment();
      this.allocateUnitsToObjectives();
      this.lastStrategicUpdate = currentTime;
    }

    // OPTIMIZATION: Stagger AI updates - only process subset of units per frame
    this.updateFrameCounter++;

    // Use cached CPU units instead of filtering every frame
    const cpuUnits = this.cachedCpuUnits;
    const decisionInterval = this.decisionIntervals[this.difficulty];

    // Only process units whose index % throttle == current frame % throttle
    for (let i = 0; i < cpuUnits.length; i++) {
      // Skip units that aren't assigned to this frame
      if (i % this.AI_UPDATE_THROTTLE !== this.updateFrameCounter % this.AI_UPDATE_THROTTLE) {
        continue;
      }

      const unit = cpuUnits[i];
      if (!unit || unit.health <= 0) continue;

      // Get or create AI state for this unit
      let state = this.aiStates.get(unit.id);
      if (!state) {
        state = this.createInitialState(unit);
        this.aiStates.set(unit.id, state);
      }

      // Check for emergency situations (damage taken, high suppression)
      this.checkEmergencySituations(unit, state, currentTime);

      // Check if it's time to make a decision
      if (currentTime - state.lastDecisionTime >= decisionInterval) {
        this.makeDecision(unit, state, currentTime);
        state.lastDecisionTime = currentTime;
      }

      // Execute current behavior
      this.executeBehavior(unit, state, dt);

      // Update health tracking
      state.healthAtLastCheck = unit.health;
    }
  }

  private createInitialState(unit: Unit): AIUnitState {
    return {
      behavior: 'idle',
      targetUnit: null,
      targetPosition: null,
      targetZone: null,
      lastDecisionTime: 0,
      lastDamageTime: 0,
      lastSmokeTime: 0,
      healthAtLastCheck: unit.health,
      assignedObjective: null,
    };
  }

  /**
   * Get friendly units from the perspective of the given unit
   */
  private getFriendlyUnits(unit: Unit): readonly Unit[] {
    return this.game.unitManager.getAllUnits(unit.team);
  }

  /**
   * Get enemy units from the perspective of the given unit
   * Only returns units that are visible according to fog of war (except on easy difficulty)
   */
  private getEnemyUnits(unit: Unit): readonly Unit[] {
    const enemyTeam = unit.team === 'enemy' ? 'player' : 'enemy';
    const allEnemyUnits = this.game.unitManager.getAllUnits(enemyTeam);

    // On easy difficulty, AI sees all units (helps new players)
    // On medium/hard difficulty, AI respects fog of war
    if (this.difficulty !== 'easy' && this.game.fogOfWarManager && this.game.fogOfWarManager.isEnabled()) {
      return allEnemyUnits.filter(enemyUnit =>
        this.game.fogOfWarManager.isUnitVisibleToTeam(enemyUnit, unit.team)
      );
    }

    // If fog of war is disabled or difficulty is easy, return all enemy units
    return allEnemyUnits;
  }

  /**
   * Check if a zone is owned by the given unit's team
   */
  private isZoneOurs(zone: CaptureZone, unit: Unit): boolean {
    return zone.owner === unit.team;
  }

  /**
   * Update strategic assessment of the battlefield
   */
  private updateStrategicAssessment(): void {
    const captureZones = this.game.economyManager.getCaptureZones();

    // Use cached CPU units
    if (this.cachedCpuUnits.length === 0) return;

    // Use first CPU unit as reference for team perspective
    const referenceUnit = this.cachedCpuUnits[0];
    if (!referenceUnit) return;

    // OPTIMIZATION: Cache team units and reuse them for all assessments
    this.cachedFriendlyUnits = this.getFriendlyUnits(referenceUnit);
    this.cachedEnemyUnits = this.getEnemyUnits(referenceUnit);

    // Assess overall threat level
    this.threatAssessment = this.assessThreat(this.cachedFriendlyUnits, this.cachedEnemyUnits, referenceUnit);

    // Assess each zone
    this.zoneAssessments = captureZones.map(zone =>
      this.assessZone(zone, referenceUnit)
    );

    // Sort by priority (highest first)
    this.zoneAssessments.sort((a, b) => b.priority - a.priority);
  }

  private assessThreat(friendlyUnits: readonly Unit[], enemyUnits: readonly Unit[], referenceUnit: Unit): ThreatAssessment {
    // Calculate strength based on health and unit count
    const friendlyStrength = friendlyUnits.reduce((sum, u) => sum + (u.health / u.maxHealth) * 100, 0);
    const enemyStrength = enemyUnits.reduce((sum, u) => sum + (u.health / u.maxHealth) * 100, 0);

    // Count zones
    const zones = this.game.economyManager.getCaptureZones();
    const friendlyZones = zones.filter(z => z.owner === referenceUnit.team).length;
    const enemyTeam = referenceUnit.team === 'enemy' ? 'player' : 'enemy';
    const enemyZones = zones.filter(z => z.owner === enemyTeam).length;

    const isWinning = friendlyStrength > enemyStrength * 1.2 || friendlyZones > enemyZones;
    const shouldBeAggressive = isWinning || friendlyStrength > enemyStrength;

    return {
      totalEnemyStrength: enemyStrength,
      totalFriendlyStrength: friendlyStrength,
      isWinning,
      shouldBeAggressive,
    };
  }

  private assessZone(zone: CaptureZone, referenceUnit: Unit): ZoneAssessment {
    // OPTIMIZATION: Use spatial queries instead of looping all units
    // OPTIMIZATION: Use VectorPool to avoid GC pressure
    const zoneY = this.game.getElevationAt(zone.x, zone.z);
    const zonePos = VectorPool.acquire().set(zone.x, zoneY, zone.z);
    const detectionRadius = Math.max(zone.width, zone.height) / 2 + 30;

    // Get units near zone using spatial query (much faster than looping all units)
    const friendlyTeam = referenceUnit.team;
    const enemyTeam = friendlyTeam === 'enemy' ? 'player' : 'enemy';

    const nearbyFriendlies = this.game.unitManager.getUnitsInRadius(zonePos, detectionRadius, friendlyTeam);
    const nearbyEnemies = this.game.unitManager.getUnitsInRadius(zonePos, detectionRadius, enemyTeam);

    // Calculate presence from nearby units only
    let friendlyPresence = 0;
    let nearestFriendlyDist = Infinity;

    for (const unit of nearbyFriendlies) {
      friendlyPresence += unit.health / unit.maxHealth;
      const distSq = unit.position.distanceToSquared(zonePos);
      if (distSq < nearestFriendlyDist * nearestFriendlyDist) {
        nearestFriendlyDist = Math.sqrt(distSq);
      }
    }

    // If no friendlies nearby, check all friendlies for nearest (but skip presence calculation)
    if (nearbyFriendlies.length === 0) {
      for (const unit of this.cachedFriendlyUnits) {
        const distSq = unit.position.distanceToSquared(zonePos);
        if (distSq < nearestFriendlyDist * nearestFriendlyDist) {
          nearestFriendlyDist = Math.sqrt(distSq);
        }
      }
    }

    let enemyPresence = 0;
    for (const unit of nearbyEnemies) {
      enemyPresence += unit.health / unit.maxHealth;
    }

    // Determine zone status from the AI's team perspective
    const isOurs = this.isZoneOurs(zone, referenceUnit);
    const isContested = friendlyPresence > 0 && enemyPresence > 0;
    const needsDefense = isOurs && enemyPresence > 0;
    const needsCapture = !isOurs;

    // Calculate priority
    let priority = zone.pointsPerTick * 10; // Base priority from zone value

    if (needsDefense) {
      priority += 50; // High priority to defend our zones
    }

    if (needsCapture && zone.owner === 'neutral') {
      priority += 30; // Medium priority for neutral zones
    }

    // Higher priority to capture enemy-owned zones (reuse enemyTeam from above)
    if (needsCapture && zone.owner === enemyTeam) {
      priority += 40; // Higher priority to capture enemy zones
    }

    if (isContested) {
      priority += 20; // Bonus for contested zones
    }

    // Distance penalty
    priority -= nearestFriendlyDist * 0.1;

    // Enemy presence consideration
    if (enemyPresence > friendlyPresence * 1.5) {
      priority -= 20; // Avoid heavily defended positions
    }

    return {
      zone,
      priority,
      distanceToNearestUnit: nearestFriendlyDist,
      enemyPresence,
      friendlyPresence,
      needsDefense,
      needsCapture,
      isContested,
    };
  }

  /**
   * Allocate units to strategic objectives
   */
  private allocateUnitsToObjectives(): void {
    // Use cached CPU units
    const availableUnits = this.cachedCpuUnits.filter(u => {
      const state = this.aiStates.get(u.id);
      return u.health > 0 && state && state.behavior !== 'retreating';
    });

    if (availableUnits.length === 0) return;

    // Reset assignments
    for (const unit of availableUnits) {
      const state = this.aiStates.get(unit.id);
      if (state) {
        state.assignedObjective = null;
      }
    }

    // Allocate units to zones based on priority
    for (const assessment of this.zoneAssessments) {
      if (availableUnits.length === 0) break;

      // Determine how many units to assign
      let unitsNeeded = 0;

      if (assessment.needsDefense) {
        // Need at least enough to counter enemy presence
        unitsNeeded = Math.ceil(assessment.enemyPresence + 1) - Math.floor(assessment.friendlyPresence);
      } else if (assessment.needsCapture) {
        // Need more units to capture
        unitsNeeded = Math.max(1, Math.ceil(assessment.enemyPresence * 1.5 + 1) - Math.floor(assessment.friendlyPresence));
      }

      unitsNeeded = Math.min(unitsNeeded, Math.ceil(availableUnits.length / 2)); // Don't commit more than half

      if (unitsNeeded <= 0) continue;

      // Select combined arms group instead of just nearest units
      const selectedUnits = this.selectCombinedArmsGroup(availableUnits, assessment, unitsNeeded);

      // Assign selected units to this objective
      for (const unit of selectedUnits) {
        const state = this.aiStates.get(unit.id);
        if (state) {
          state.assignedObjective = assessment.zone.id;
          state.targetZone = assessment.zone;

          // Remove from available pool
          const idx = availableUnits.indexOf(unit);
          if (idx > -1) availableUnits.splice(idx, 1);
        }
      }
    }

    // Remaining units become roaming attackers
    for (const unit of availableUnits) {
      const state = this.aiStates.get(unit.id);
      if (state) {
        state.assignedObjective = 'roam';
      }
    }
  }

  /**
   * Select a balanced combined arms group for an objective
   * Prefers mixed unit types over homogeneous groups for better tactical effectiveness
   *
   * Priority for assignment:
   * 1. LOG units (if capturing - needed to capture zones)
   * 2. INF units (screening, urban combat) - ~40-50% of force
   * 3. TNK units (heavy firepower and armor) - ~25-30% of force
   * 4. Support units (ART, AA, REC) - remaining slots
   *
   * Units within each category are selected by distance (closest preferred)
   *
   * @param availableUnits - Pool of available units to select from
   * @param assessment - Zone assessment for the objective
   * @param unitsNeeded - Number of units to assign to this objective
   * @returns Array of selected units forming a balanced combined arms group
   */
  private selectCombinedArmsGroup(
    availableUnits: Unit[],
    assessment: ZoneAssessment,
    unitsNeeded: number
  ): Unit[] {
    const selectedUnits: Unit[] = [];

    // Early exit if no units available
    if (availableUnits.length === 0 || unitsNeeded <= 0) {
      return selectedUnits;
    }

    // OPTIMIZATION: Use VectorPool for zone position
    const zoneY = this.game.getElevationAt(assessment.zone.x, assessment.zone.z);
    const zonePos = VectorPool.acquire().set(assessment.zone.x, zoneY, assessment.zone.z);

    // Group units by category
    const unitsByCategory: Record<string, Unit[]> = {};

    for (const unit of availableUnits) {
      const category = unit.unitData.category;
      if (!unitsByCategory[category]) {
        unitsByCategory[category] = [];
      }
      unitsByCategory[category]!.push(unit);
    }

    // Sort each category by distance to objective (closest first)
    for (const category in unitsByCategory) {
      const units = unitsByCategory[category];
      if (!units) continue;

      units.sort((a, b) => {
        const aDist = a.position.distanceToSquared(zonePos);
        const bDist = b.position.distanceToSquared(zonePos);
        return aDist - bDist;
      });
    }

    // Build combined arms group based on objective type and available units
    // Priority order for balanced group composition:

    // 1. LOG units (if capturing - needed to capture zones)
    if (assessment.needsCapture) {
      const logUnits = unitsByCategory['LOG'] ?? [];
      const logNeeded = Math.min(1, logUnits.length, unitsNeeded - selectedUnits.length);
      for (let i = 0; i < logNeeded; i++) {
        const unit = logUnits[i];
        if (unit) selectedUnits.push(unit);
      }
    }

    // 2. Infantry units (screening, versatile)
    // Allocate ~40-50% of remaining slots to infantry
    const infUnits = unitsByCategory['INF'] ?? [];
    const remainingSlots = unitsNeeded - selectedUnits.length;
    const infNeeded = Math.min(
      Math.ceil(remainingSlots * 0.5),
      infUnits.length
    );
    for (let i = 0; i < infNeeded; i++) {
      const unit = infUnits[i];
      if (unit) selectedUnits.push(unit);
    }

    // 3. Armor units (heavy firepower)
    // Allocate ~25-30% of remaining slots to tanks
    const tnkUnits = unitsByCategory['TNK'] ?? [];
    const slotsAfterInf = unitsNeeded - selectedUnits.length;
    const tnkNeeded = Math.min(
      Math.ceil(slotsAfterInf * 0.4),
      tnkUnits.length
    );
    for (let i = 0; i < tnkNeeded; i++) {
      const unit = tnkUnits[i];
      if (unit) selectedUnits.push(unit);
    }

    // 4. Support units (ART, AA, REC) - fill remaining slots
    const supportCategories = ['ART', 'AA', 'REC', 'HEL'];

    for (const category of supportCategories) {
      if (selectedUnits.length >= unitsNeeded) break;

      const units = unitsByCategory[category] ?? [];
      for (const unit of units) {
        if (selectedUnits.length >= unitsNeeded) break;
        selectedUnits.push(unit);
      }
    }

    // 5. If we still need more units, fill with whatever is available
    // (This handles cases where we don't have balanced forces)
    if (selectedUnits.length < unitsNeeded) {
      for (const unit of availableUnits) {
        if (selectedUnits.length >= unitsNeeded) break;
        if (!selectedUnits.includes(unit)) {
          selectedUnits.push(unit);
        }
      }
    }

    VectorPool.release(zonePos);
    return selectedUnits;
  }

  /**
   * Check for emergency situations that need immediate response
   */
  private checkEmergencySituations(unit: Unit, state: AIUnitState, currentTime: number): void {
    // Check for damage taken
    const damageTaken = state.healthAtLastCheck - unit.health;
    const damagePercent = damageTaken / unit.maxHealth;

    if (damageTaken > 0) {
      state.lastDamageTime = currentTime;

      // Consider deploying smoke if taking significant damage
      if (damagePercent >= this.damageThresholdForSmoke &&
        currentTime - state.lastSmokeTime >= this.smokeCooldown) {
        this.deployDefensiveSmoke(unit, state, currentTime);
      }
    }

    // Check for high suppression
    if (unit.suppression >= this.suppressionThresholdForRetreat) {
      // Deploy smoke if available
      if (currentTime - state.lastSmokeTime >= this.smokeCooldown) {
        this.deployDefensiveSmoke(unit, state, currentTime);
      }

      // Consider retreat
      if (state.behavior !== 'retreating' && unit.suppression >= 80) {
        this.orderRetreat(unit, state);
      }
    }

    // Emergency retreat for very low health
    if (unit.health / unit.maxHealth <= this.retreatHealthThreshold &&
      state.behavior !== 'retreating') {
      // Deploy smoke before retreating
      if (currentTime - state.lastSmokeTime >= this.smokeCooldown) {
        this.deployDefensiveSmoke(unit, state, currentTime);
      }
      this.orderRetreat(unit, state);
    }
  }

  /**
   * Deploy smoke for defensive purposes
   * Infantry use grenades (small, 5m radius), other units use launchers (15m radius)
   */
  private deployDefensiveSmoke(unit: Unit, state: AIUnitState, currentTime: number): void {
    // Check if smoke manager exists
    if (!this.game.smokeManager) return;

    // Check if unit has smoke ammo remaining
    if (!unit.hasSmokeAmmo()) return;

    // Get smoke type from unit
    const smokeType = unit.getSmokeType();
    const isInfantry = smokeType === 'grenade';

    // Deploy smoke at unit's position
    const smokePos = unit.position.clone();

    // Offset slightly toward enemy if possible
    const nearestEnemy = this.findNearestEnemy(unit);
    if (nearestEnemy) {
      const toEnemy = nearestEnemy.position.clone().sub(unit.position).normalize();
      // Infantry grenades thrown closer, vehicle launchers further
      const offset = isInfantry ? 2 : 5;
      smokePos.add(toEnemy.multiplyScalar(offset));
    }

    this.game.smokeManager.deploySmoke(smokePos, smokeType);
    unit.useSmoke();
    state.lastSmokeTime = currentTime;

    // OPTIMIZATION: Disable debug logging in production for performance
    // Get remaining smoke ammo for logging
    // const smokeIndex = unit.findSmokeWeaponIndex();
    // const remaining = smokeIndex >= 0 ? unit.getWeaponAmmo(smokeIndex) : 0;
    // console.log(`AI ${unit.name} deployed ${smokeType} smoke (${remaining} remaining)`);
  }

  /**
   * Make a decision for the unit based on current game state and objectives
   */
  private makeDecision(unit: Unit, state: AIUnitState, _currentTime: number): void {
    // Priority 1: Continue retreating if already retreating and still damaged
    if (state.behavior === 'retreating') {
      if (unit.health / unit.maxHealth > 0.5 && unit.suppression < 30) {
        // Recovered enough to rejoin
        state.behavior = 'idle';
      } else {
        return; // Continue retreating
      }
    }

    // Priority 2: Handle assigned objective
    if (state.assignedObjective && state.assignedObjective !== 'roam') {
      const zone = this.zoneAssessments.find(z => z.zone.id === state.assignedObjective);

      if (zone) {
        // Check if we're at the zone
        // OPTIMIZATION: Use VectorPool
        const zoneY = this.game.getElevationAt(zone.zone.x, zone.zone.z);
        const zonePos = VectorPool.acquire().set(zone.zone.x, zoneY, zone.zone.z);
        const distToZone = unit.position.distanceTo(zonePos);
        const zoneRadiusEstimate = Math.max(zone.zone.width, zone.zone.height) / 2;

        if (distToZone <= zoneRadiusEstimate + 5) {
          // At the zone - defend or capture
          const bestTarget = this.selectBestTarget(unit, this.engageRange);

          if (bestTarget) {
            this.orderAttack(unit, state, bestTarget);
          } else {
            // Hold position in zone
            state.behavior = zone.needsDefense ? 'defending' : 'capturing';
            state.targetZone = zone.zone;
          }
        } else {
          // Move to zone
          this.orderMove(unit, state, zonePos);
          state.targetZone = zone.zone;
        }
        return;
      }
    }

    // Priority 3: Attack nearby enemies
    const bestTarget = this.selectBestTarget(unit, this.engageRange);
    if (bestTarget) {
      this.orderAttack(unit, state, bestTarget);
      return;
    }

    // Priority 4: Move toward strategic targets
    const targetPosition = this.findStrategicTarget(unit, state);
    if (targetPosition) {
      this.orderMove(unit, state, targetPosition);
      return;
    }

    // Default: Hold position / idle
    state.behavior = 'idle';
    state.targetUnit = null;
    state.targetPosition = null;
  }

  /**
   * Calculate priority score for a potential target
   * Higher score = higher priority
   *
   * Factors:
   * 1. Unit category value (LOG > TNK > ART > INF > others)
   * 2. Damage percentage (wounded units higher priority)
   * 3. Distance (closer preferred, normalized)
   * 4. Threat level (units attacking allies)
   * 5. Focus fire bonus (targets already being attacked by allies)
   */
  private calculateTargetPriority(
    attackingUnit: Unit,
    target: Unit,
    alliedUnits: readonly Unit[]
  ): number {
    let score = 0;

    // Factor 1: Unit category value (0-100 points)
    const categoryValue = this.getUnitCategoryValue(target);
    score += categoryValue;

    // Factor 2: Damage percentage (0-50 points)
    // More damaged units are higher priority (finish them off)
    const healthPercent = target.health / target.maxHealth;
    const damageBonus = (1 - healthPercent) * 50;
    score += damageBonus;

    // Factor 3: Distance (0-30 points, inverse - closer is better)
    // Normalize distance: 0m = 30 points, 100m+ = 0 points
    const distance = attackingUnit.position.distanceTo(target.position);
    const distanceBonus = Math.max(0, 30 - (distance / 100) * 30);
    score += distanceBonus;

    // Factor 4: Threat level (0-20 points)
    // Bonus if target is currently attacking any allied unit
    const isThreat = this.isTargetAttackingAllies(target, alliedUnits);
    if (isThreat) {
      score += 20;
    }

    // Factor 5: Focus fire bonus (0-30 points)
    // Bonus for targets already being attacked by allies
    // Encourages concentrating fire on high-value targets
    // Diminishing returns: first ally = +15, second = +10, third+ = +5 (max +30)
    const focusFireBonus = this.calculateFocusFireBonus(target, alliedUnits);
    score += focusFireBonus;

    return score;
  }

  /**
   * Get priority value for unit category
   * LOG (commanders) = 100 (highest priority)
   * TNK (tanks) = 80
   * ART (artillery) = 70
   * INF (infantry) = 60
   * AA (anti-air) = 50
   * REC (reconnaissance) = 40
   * HEL (helicopters) = 30
   * AIR (aircraft) = 20
   */
  private getUnitCategoryValue(unit: Unit): number {
    const category = unit.unitData?.category ?? 'INF';

    const categoryValues: Record<string, number> = {
      'LOG': 100, // Commanders - highest priority
      'TNK': 80,  // Tanks - heavy threats
      'ART': 70,  // Artillery - high value support
      'INF': 60,  // Infantry - standard
      'AA': 50,   // Anti-air - situational
      'REC': 40,  // Reconnaissance - fast but low threat
      'HEL': 30,  // Helicopters - mobile but vulnerable
      'AIR': 20,  // Aircraft - difficult to hit
    };

    return categoryValues[category] ?? 50;
  }

  /**
   * Check if target is currently attacking any allied units
   */
  private isTargetAttackingAllies(target: Unit, alliedUnits: readonly Unit[]): boolean {
    // Check if target has a combat target that is one of our allies
    if (!target.combatTarget) return false;

    for (const ally of alliedUnits) {
      if (target.combatTarget.id === ally.id) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate focus fire bonus for targets already being attacked
   * Encourages coordinated fire on high-value targets
   *
   * Returns:
   * - 0 points if no allies are attacking this target
   * - +15 points if 1 ally is attacking (concentrate fire)
   * - +25 points if 2 allies are attacking (+10 for second)
   * - +30 points if 3+ allies are attacking (+5 for third+, capped at 30)
   *
   * Diminishing returns prevent ALL units from targeting the same enemy
   */
  private calculateFocusFireBonus(target: Unit, alliedUnits: readonly Unit[]): number {
    let attackerCount = 0;

    // Count how many allied units are currently attacking this target
    for (const ally of alliedUnits) {
      // Check AI state to see if this unit is attacking the target
      const allyState = this.aiStates.get(ally.id);
      if (allyState && allyState.targetUnit && allyState.targetUnit.id === target.id) {
        attackerCount++;
      }
    }

    // Calculate bonus with diminishing returns
    if (attackerCount === 0) return 0;
    if (attackerCount === 1) return 15;
    if (attackerCount === 2) return 25;
    // Cap at 30 for 3+ attackers
    return 30;
  }

  /**
   * Select the best target using priority scoring system
   * Returns the enemy unit with the highest priority score within range
   *
   * @param unit - The unit selecting a target
   * @param range - Maximum engagement range
   * @returns The highest priority target, or null if none found
   */
  private selectBestTarget(unit: Unit, range: number): Unit | null {
    // Use spatial query limited to the actual range for efficiency
    const enemyTeam = unit.team === 'enemy' ? 'player' : 'enemy';
    const enemyUnits = this.game.unitManager.getUnitsInRadius(
      unit.position,
      range,
      enemyTeam
    );

    // Get allied units for threat assessment
    const alliedUnits = this.getFriendlyUnits(unit);

    let bestTarget: Unit | null = null;
    let bestScore = -Infinity;

    for (const enemy of enemyUnits) {
      if (enemy.health <= 0) continue;

      // On easy difficulty, AI sees all units (helps new players)
      // On medium/hard difficulty, AI only sees units revealed by fog of war
      if (this.difficulty !== 'easy' && this.game.fogOfWarManager && this.game.fogOfWarManager.isEnabled()) {
        if (!this.game.fogOfWarManager.isUnitVisibleToTeam(enemy, unit.team)) {
          continue; // Skip invisible enemies
        }
      }

      // Check if enemy is within actual range (spatial query might include units slightly outside)
      const distance = unit.position.distanceTo(enemy.position);
      if (distance > range) continue;

      // Calculate priority score for this target
      const score = this.calculateTargetPriority(unit, enemy, alliedUnits);

      if (score > bestScore) {
        bestScore = score;
        bestTarget = enemy;
      }
    }

    return bestTarget;
  }

  private findNearestEnemy(unit: Unit): Unit | null {
    // Use spatial query with max search radius for efficiency
    const SEARCH_RADIUS = 500; // Max engagement search range
    const enemyTeam = unit.team === 'enemy' ? 'player' : 'enemy';
    const enemyUnits = this.game.unitManager.getUnitsInRadius(
      unit.position,
      SEARCH_RADIUS,
      enemyTeam
    );

    let nearest: Unit | null = null;
    let nearestDist = Infinity;

    for (const enemy of enemyUnits) {
      if (enemy.health <= 0) continue;

      // On easy difficulty, AI sees all units (helps new players)
      // On medium/hard difficulty, AI only sees units revealed by fog of war
      if (this.difficulty !== 'easy' && this.game.fogOfWarManager && this.game.fogOfWarManager.isEnabled()) {
        if (!this.game.fogOfWarManager.isUnitVisibleToTeam(enemy, unit.team)) {
          continue; // Skip invisible enemies
        }
      }

      const dist = unit.position.distanceTo(enemy.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }

  private findNearestEnemyInRange(unit: Unit, range: number): Unit | null {
    // Use spatial query limited to the actual range for efficiency
    const enemyTeam = unit.team === 'enemy' ? 'player' : 'enemy';
    const enemyUnits = this.game.unitManager.getUnitsInRadius(
      unit.position,
      range,
      enemyTeam
    );

    let nearest: Unit | null = null;
    let nearestDist = range;

    for (const enemy of enemyUnits) {
      if (enemy.health <= 0) continue;

      // On easy difficulty, AI sees all units (helps new players)
      // On medium/hard difficulty, AI only sees units revealed by fog of war
      if (this.difficulty !== 'easy' && this.game.fogOfWarManager && this.game.fogOfWarManager.isEnabled()) {
        if (!this.game.fogOfWarManager.isUnitVisibleToTeam(enemy, unit.team)) {
          continue; // Skip invisible enemies
        }
      }

      const dist = unit.position.distanceTo(enemy.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }

  private findStrategicTarget(unit: Unit, state: AIUnitState): THREE.Vector3 | null {
    // If we have an assigned zone, go there
    if (state.targetZone) {
      const zoneY = this.game.getElevationAt(state.targetZone.x, state.targetZone.z);
      return new THREE.Vector3(state.targetZone.x, zoneY, state.targetZone.z);
    }

    // Find the best zone to move toward
    const captureZones = this.game.economyManager.getCaptureZones();
    const enemyTeam = unit.team === 'enemy' ? 'player' : 'enemy';

    let bestZone: CaptureZone | null = null;
    let bestScore = -Infinity;

    for (const zone of captureZones) {
      // Skip zones we already own
      if (this.isZoneOurs(zone, unit)) continue;

      const distance = Math.sqrt(
        Math.pow(unit.position.x - zone.x, 2) +
        Math.pow(unit.position.z - zone.z, 2)
      );

      // Score based on points value and proximity
      let score = zone.pointsPerTick * 10 - distance * 0.1;

      // Prefer neutral zones (easier to capture)
      if (zone.owner === 'neutral') {
        score += 20;
      }

      // Aggressive AI prefers attacking enemy zones
      if (this.threatAssessment.shouldBeAggressive && zone.owner === enemyTeam) {
        score += 15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestZone = zone;
      }
    }

    if (bestZone) {
      state.targetZone = bestZone;
      const zoneY = this.game.getElevationAt(bestZone.x, bestZone.z);
      return new THREE.Vector3(bestZone.x, zoneY, bestZone.z);
    }

    // Otherwise, move toward enemy units
    const nearestEnemy = this.findNearestEnemy(unit);
    if (nearestEnemy) {
      return nearestEnemy.position.clone();
    }

    return null;
  }

  private orderAttack(unit: Unit, state: AIUnitState, target: Unit): void {
    state.behavior = 'attacking';
    state.targetUnit = target;
    state.targetPosition = null;

    // Issue attack command
    unit.setAttackCommand(target);
  }

  /**
   * Calculate role-based position for combined arms tactics
   * Infantry leads, tanks follow, artillery stays at range
   */
  private calculateRoleBasedPosition(unit: Unit, objectivePosition: THREE.Vector3): THREE.Vector3 {
    const category = unit.unitData.category;

    // Infantry: Front line (use objective position directly)
    if (category === 'INF') {
      return objectivePosition.clone();
    }

    // Logistics, Recon, AA, Helicopters, Aircraft: Default positioning
    if (category === 'LOG' || category === 'REC' || category === 'AA' ||
        category === 'HEL' || category === 'AIR') {
      return objectivePosition.clone();
    }

    // Calculate direction from objective back toward unit (for positioning behind)
    const direction = VectorPool.acquire();
    direction.copy(unit.position).sub(objectivePosition).normalize();

    let offset: number;

    // Tanks: 10m behind infantry/objective
    if (category === 'TNK') {
      offset = 10;
    }
    // Artillery: 50m behind objective (support from range)
    else if (category === 'ART') {
      offset = 50;
    }
    // Default: Use objective position
    else {
      VectorPool.release(direction);
      return objectivePosition.clone();
    }

    // Calculate adjusted position
    const adjustedPosition = objectivePosition.clone();
    adjustedPosition.x += direction.x * offset;
    adjustedPosition.z += direction.z * offset;

    // Clamp to terrain height
    const y = this.game.getElevationAt(adjustedPosition.x, adjustedPosition.z);
    adjustedPosition.y = y;

    // Clean up pooled vector
    VectorPool.release(direction);

    return adjustedPosition;
  }

  private orderMove(unit: Unit, state: AIUnitState, position: THREE.Vector3): void {
    state.behavior = 'moving';
    state.targetUnit = null;

    // Apply role-based positioning for combined arms tactics
    const adjustedPosition = this.calculateRoleBasedPosition(unit, position);
    state.targetPosition = adjustedPosition.clone();

    // Issue move command
    unit.setMoveCommand(adjustedPosition);
  }

  private orderRetreat(unit: Unit, state: AIUnitState): void {
    state.behavior = 'retreating';
    state.targetUnit = null;
    state.assignedObjective = null;

    // Find a safe position to retreat to
    const retreatPos = this.findRetreatPosition(unit);

    if (retreatPos) {
      state.targetPosition = retreatPos;
      unit.setMoveCommand(retreatPos);
    }

    // OPTIMIZATION: Disable debug logging in production for performance
    // console.log(`AI ${unit.name} retreating!`);
  }

  private findRetreatPosition(unit: Unit): THREE.Vector3 | null {
    // Priority 1: Retreat to a friendly-held zone
    const friendlyZones = this.zoneAssessments.filter(z =>
      z.zone.owner === unit.team && !z.isContested
    );

    if (friendlyZones.length > 0) {
      // Find nearest safe zone
      // OPTIMIZATION: Use squared distance and VectorPool
      let nearest = friendlyZones[0];
      if (!nearest) return this.fallbackRetreatPosition(unit);

      const zoneY0 = this.game.getElevationAt(nearest.zone.x, nearest.zone.z);
      const zonePos0 = VectorPool.acquire().set(nearest.zone.x, zoneY0, nearest.zone.z);
      let nearestDistSq = unit.position.distanceToSquared(zonePos0);

      for (const zone of friendlyZones) {
        const zoneY = this.game.getElevationAt(zone.zone.x, zone.zone.z);
        const zonePos = VectorPool.acquire().set(zone.zone.x, zoneY, zone.zone.z);
        const distSq = unit.position.distanceToSquared(zonePos);
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = zone;
        }
      }

      const finalZoneY = this.game.getElevationAt(nearest.zone.x, nearest.zone.z);
      return new THREE.Vector3(nearest.zone.x, finalZoneY, nearest.zone.z);
    }

    // Priority 2: Retreat toward deployment zone
    return this.fallbackRetreatPosition(unit);
  }

  private fallbackRetreatPosition(unit: Unit): THREE.Vector3 | null {
    // Retreat toward friendly deployment zone
    const deploymentZones = this.game.currentMap?.deploymentZones.filter(z => z.team === unit.team);
    if (deploymentZones && deploymentZones.length > 0) {
      // Find nearest friendly deployment zone
      // OPTIMIZATION: Use squared distance and VectorPool
      let nearestZone = deploymentZones[0]!;
      let minDistSq = Infinity;

      for (const zone of deploymentZones) {
        const centerX = (zone.minX + zone.maxX) / 2;
        const centerZ = (zone.minZ + zone.maxZ) / 2;
        const centerY = this.game.getElevationAt(centerX, centerZ);
        const centerPos = VectorPool.acquire().set(centerX, centerY, centerZ);
        const distSq = unit.position.distanceToSquared(centerPos);
        if (distSq < minDistSq) {
          minDistSq = distSq;
          nearestZone = zone;
        }
      }

      const retreatX = (nearestZone.minX + nearestZone.maxX) / 2;
      const retreatZ = (nearestZone.minZ + nearestZone.maxZ) / 2;
      const retreatY = this.game.getElevationAt(retreatX, retreatZ);
      return new THREE.Vector3(retreatX, retreatY, retreatZ);
    }

    // Last resort: Move away from nearest enemy
    const nearestEnemy = this.findNearestEnemy(unit);
    if (nearestEnemy) {
      const awayDir = VectorPool.acquire().copy(unit.position).sub(nearestEnemy.position).normalize();
      const retreatPos = VectorPool.acquire().copy(unit.position).add(awayDir.multiplyScalar(50));
      // Must create new Vector3 since this persists in state
      return new THREE.Vector3(retreatPos.x, retreatPos.y, retreatPos.z);
    }

    return null;
  }

  /**
   * Execute the current behavior (called every frame)
   */
  private executeBehavior(unit: Unit, state: AIUnitState, _dt: number): void {
    switch (state.behavior) {
      case 'attacking':
        // Check if target is still valid
        if (state.targetUnit && state.targetUnit.health <= 0) {
          state.behavior = 'idle';
          state.targetUnit = null;
        }
        break;

      case 'moving':
        // Check if arrived
        if (state.targetPosition) {
          const dist = unit.position.distanceTo(state.targetPosition);
          if (dist < 5) {
            state.behavior = state.targetZone ? 'capturing' : 'idle';
            state.targetPosition = null;
          }
        }
        break;

      case 'capturing':
      case 'defending':
        // Stay in zone, look for threats
        // Decision making will handle combat
        break;

      case 'retreating':
        // Check if reached safety
        if (state.targetPosition) {
          const dist = unit.position.distanceTo(state.targetPosition);
          if (dist < 10) {
            // Reached retreat position
            if (unit.health / unit.maxHealth > 0.4) {
              state.behavior = 'idle';
            }
            // Otherwise keep resting
          }
        }

        // Also stop retreating if fully healed
        if (unit.health / unit.maxHealth > 0.7 && unit.suppression < 20) {
          state.behavior = 'idle';
        }
        break;
    }
  }

  /**
   * Clean up AI state for destroyed units
   */
  removeUnit(unitId: string): void {
    this.aiStates.delete(unitId);
    // Remove from cached units
    const index = this.cachedCpuUnits.findIndex(u => u.id === unitId);
    if (index !== -1) {
      this.cachedCpuUnits.splice(index, 1);
    }
  }

  /**
   * Clear all AI state
   */
  clear(): void {
    this.aiStates.clear();
    this.zoneAssessments = [];
    this.cachedCpuUnits = [];
    this.cachedFriendlyUnits = [];
    this.cachedEnemyUnits = [];
  }
}
