/**
 * AIManager - Handles AI behavior for CPU-controlled units
 *
 * Strategic AI that:
 * - Captures and defends zones
 * - Coordinates unit groups
 * - Uses smoke for protection
 * - Retreats damaged units
 * - Plans attacks on enemy positions
 *
 * ## Difficulty Levels
 *
 * ### Easy - Forgiving AI for Beginners
 * - Vision: Sees ALL units (fog of war disabled) - helps new players understand threats
 * - Targeting: 30% chance to pick suboptimal targets (makes mistakes)
 * - Tactics: No flanking maneuvers (simpler frontal assault only)
 * - Retreat: 40% health threshold (more cautious, easier to push back)
 * - Decision Speed: 4 seconds between decisions (slower reactions)
 * - Resources: Same income as player (no bonuses)
 *
 * ### Medium (Normal) - Fair Challenge for Intermediate Players
 * - Vision: Respects fog of war (only sees visible units) - FAIR PLAY
 * - Targeting: Optimal target selection (best targets always chosen)
 * - Tactics: All features enabled (flanking, combined arms, focus fire)
 * - Retreat: 25% health threshold (standard tactical retreat)
 * - Decision Speed: 2 seconds between decisions (moderate reactions)
 * - Resources: Same income as player (no bonuses) - FAIR PLAY
 * - **This is the baseline "fair but challenging" AI with no cheats**
 *
 * ### Hard - Aggressive AI for Veterans
 * - Vision: Respects fog of war (only sees visible units) - FAIR PLAY
 * - Targeting: Optimal target selection with enhanced focus fire coordination
 * - Tactics: Enhanced tactical execution (more flankers, larger coordinated assaults)
 * - Aggression: More willing to attack (aggressive even when slightly outnumbered)
 * - Engagement: 100m engagement range vs 80m (proactive engagement)
 * - Focus Fire: Stronger coordination bonuses (45 max vs 30 for medium)
 * - Flanking: 3 flankers + 6 frontal units (vs 2+4 for medium)
 * - Zone Priority: Strongly prefers attacking enemy zones (aggressive capture)
 * - Retreat: 25% health threshold (same as medium)
 * - Decision Speed: 1 second between decisions (fast reactions)
 * - Resources: Same income as player (no bonuses) - FAIR PLAY
 * - **Hard AI wins through better tactics and execution, NOT cheating**
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import { UnitCommand } from '../units/Unit';
import type { CaptureZone } from '../../data/types';
import { VectorPool } from '../utils/VectorPool';
import { gameRNG } from '../utils/DeterministicRNG';

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

interface FlankingOpportunity {
  id: string; // Unique identifier for this flanking opportunity
  cluster: Unit[];
  flankPositions: {
    left: THREE.Vector3;
    right: THREE.Vector3;
    center: THREE.Vector3;
    frontLine: THREE.Vector3;
  };
  availableFlankers: Unit[];
  priority: number;
  assignedUnits: Set<string>; // Unit IDs assigned to this flank
  frontalUnits: Set<string>; // Unit IDs assigned to frontal assault (INF, TNK)
  flankersInPosition: boolean; // True when flankers are near their positions
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
    easy: 15.0,    // 15 seconds - AI issues orders and waits for units to execute
    medium: 10.0,  // 10 seconds - slightly more responsive
    hard: 8.0,     // 8 seconds - most responsive, but still gives time to execute orders
  };

  // CRITICAL PERFORMANCE: Limit decision-making to prevent frame rate drops
  private readonly MAX_DECISIONS_PER_FRAME = 3; // Never make more than 3 decisions in a single frame

  // Strategic parameters
  private readonly engageRange = 80;
  private readonly retreatHealthThreshold = 0.25; // Base threshold (medium/hard)
  private readonly smokeCooldown = 15; // seconds between smoke deployments
  private readonly damageThresholdForSmoke = 0.15; // 15% health lost triggers smoke
  private readonly suppressionThresholdForRetreat = 70; // High suppression triggers retreat
  private readonly flankingSpeed = 15; // Minimum speed required for flanking maneuvers
  private readonly flankWaypointDistance = 60; // Distance of waypoint from unit's start position (for curved path)

  // Hard difficulty tactical parameters (more aggressive, better coordination)
  private readonly hardDifficultyAggressionBonus = 1.5; // 50% more aggressive on Hard
  private readonly hardDifficultyFlankersPerOpportunity = 3; // Assign 3 flankers instead of 2
  private readonly hardDifficultyFrontalUnits = 6; // Assign 6 frontal units instead of 4
  private readonly hardDifficultyEngageRange = 100; // Longer engagement range (vs 80 on Easy/Medium)

  // Difficulty-dependent retreat thresholds
  private readonly retreatThresholds: Record<AIDifficulty, number> = {
    easy: 0.40,    // Easy AI retreats earlier (40% health) - more cautious, easier to beat
    medium: 0.25,  // Normal retreat threshold (25% health)
    hard: 0.25,    // Hard AI also retreats at 25% (same as medium)
  };

  // Strategic state
  private lastStrategicUpdate = 0;
  private readonly strategicUpdateInterval = 10.0; // Update strategy every 10 seconds (AI only needs to reassess occasionally)
  private lastFlankingUpdate = 0;
  private readonly flankingUpdateInterval = 20.0; // Update flanking opportunities every 20 seconds (expensive operation)
  private zoneAssessments: ZoneAssessment[] = [];
  private flankingOpportunities: FlankingOpportunity[] = [];

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
   * Initialize AI strategy at battle start
   * Runs strategic assessment and assigns initial orders so AI units move immediately
   */
  initializeBattle(): void {
    const currentTime = performance.now() / 1000;

    console.log('[AIManager] Initializing battle strategy...');

    // Force immediate cache update
    this.updateCpuUnitsCache(currentTime);

    if (this.cachedCpuUnits.length === 0) {
      console.log('[AIManager] No CPU units to initialize');
      return;
    }

    // Run strategic assessment immediately
    this.updateStrategicAssessment();
    this.allocateUnitsToObjectives();
    this.lastStrategicUpdate = currentTime;

    // Run flanking assessment
    if (this.cachedCpuUnits[0]) {
      this.updateFlankingOpportunities(this.cachedCpuUnits[0].team);
      this.lastFlankingUpdate = currentTime;
    }

    // Initialize all AI unit states with staggered decision times
    // This ensures they have orders queued and ready to execute
    const decisionInterval = this.decisionIntervals[this.difficulty];
    let staggerOffset = 0;

    for (const unit of this.cachedCpuUnits) {
      if (!unit || unit.health <= 0) continue;

      // Create or get AI state
      let state = this.aiStates.get(unit.id);
      if (!state) {
        state = this.createInitialState(unit);
        this.aiStates.set(unit.id, state);
      }

      // Make initial decision for this unit with staggered timing
      // Offset by 0.5 seconds per unit to spread decisions across first few seconds
      state.lastDecisionTime = currentTime - decisionInterval + staggerOffset;
      this.makeDecision(unit, state, currentTime);

      staggerOffset += 0.5; // Stagger by 0.5 seconds
      if (staggerOffset > decisionInterval) staggerOffset = 0; // Wrap around
    }

    console.log(`[AIManager] Initialized ${this.cachedCpuUnits.length} AI units with initial orders`);
  }

  /**
   * Update AI for all CPU-controlled units (enemy team + allied AI)
   */
  update(dt: number): void {
    const updateStart = performance.now();
    const currentTime = updateStart / 1000;

    // OPTIMIZATION: Update CPU units cache periodically
    this.updateCpuUnitsCache(currentTime);

    // OPTIMIZATION: Early exit if no CPU units
    if (this.cachedCpuUnits.length === 0) return;

    // Update strategic assessment periodically
    let strategicTime = 0;
    if (currentTime - this.lastStrategicUpdate >= this.strategicUpdateInterval) {
      const t0 = performance.now();
      this.updateStrategicAssessment();
      const t1 = performance.now();
      this.allocateUnitsToObjectives();
      const t2 = performance.now();
      strategicTime = t2 - t0;
      console.log(`[AI PROFILE] Strategic update: ${strategicTime.toFixed(1)}ms (assessment: ${(t1-t0).toFixed(1)}ms, allocation: ${(t2-t1).toFixed(1)}ms)`);
      this.lastStrategicUpdate = currentTime;
    }

    // Update flanking opportunities less frequently (expensive operation)
    let flankingTime = 0;
    if (currentTime - this.lastFlankingUpdate >= this.flankingUpdateInterval) {
      if (this.cachedCpuUnits.length > 0 && this.cachedCpuUnits[0]) {
        const t0 = performance.now();
        this.updateFlankingOpportunities(this.cachedCpuUnits[0].team);
        flankingTime = performance.now() - t0;
        console.log(`[AI PROFILE] Flanking update: ${flankingTime.toFixed(1)}ms`);
      }
      this.lastFlankingUpdate = currentTime;
    }

    // OPTIMIZATION: Stagger AI updates - only process subset of units per frame
    this.updateFrameCounter++;

    // Use cached CPU units instead of filtering every frame
    const cpuUnits = this.cachedCpuUnits;
    const decisionInterval = this.decisionIntervals[this.difficulty];

    let decisionsTime = 0;
    let decisionsCount = 0;
    const loopStart = performance.now();

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
      // CRITICAL PERFORMANCE: Two-layer throttling to maintain 60 FPS
      // 1. Units have staggered decision times (randomized on creation)
      // 2. Maximum 3 decisions per frame (prevents clustering)
      // This spreads expensive operations (pathfinding, target selection) across frames
      if (currentTime - state.lastDecisionTime >= decisionInterval && decisionsCount < this.MAX_DECISIONS_PER_FRAME) {
        const t0 = performance.now();
        this.makeDecision(unit, state, currentTime);
        decisionsTime += performance.now() - t0;
        decisionsCount++;
        state.lastDecisionTime = currentTime;
      }

      // Execute current behavior (lightweight, just checks unit state)
      this.executeBehavior(unit, state, dt);

      // Update health tracking
      state.healthAtLastCheck = unit.health;
    }

    const loopTime = performance.now() - loopStart;
    const totalTime = performance.now() - updateStart;

    if (totalTime > 10 || decisionsCount > 0) {
      console.log(`[AI PROFILE] Total: ${totalTime.toFixed(1)}ms | Loop: ${loopTime.toFixed(1)}ms | Decisions: ${decisionsCount} (${decisionsTime.toFixed(1)}ms) | Units: ${cpuUnits.length}`);
    }
  }

  private createInitialState(unit: Unit): AIUnitState {
    // CRITICAL: Stagger initial decision times to spread load across frames
    // Randomize within the decision interval so not all units decide at once
    const decisionInterval = this.decisionIntervals[this.difficulty];
    const currentTime = performance.now() / 1000;
    const randomOffset = Math.random() * decisionInterval;

    return {
      behavior: 'idle',
      targetUnit: null,
      targetPosition: null,
      targetZone: null,
      lastDecisionTime: currentTime - randomOffset, // Offset so decisions spread over time
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

    // Hard difficulty: More aggressive threshold (attacks even when slightly outnumbered)
    // Medium: Only aggressive when winning or equal
    // Easy: Same as medium (but other mechanics make it easier)
    let isWinning: boolean;
    let shouldBeAggressive: boolean;

    if (this.difficulty === 'hard') {
      // Hard AI: More willing to fight (considers winning with less advantage)
      isWinning = friendlyStrength > enemyStrength * 1.1 || friendlyZones > enemyZones;
      // Hard AI: Aggressive even when slightly behind (down to 0.85x enemy strength)
      shouldBeAggressive = isWinning || friendlyStrength > enemyStrength * 0.85;
    } else {
      // Easy/Medium: More conservative aggression thresholds
      isWinning = friendlyStrength > enemyStrength * 1.2 || friendlyZones > enemyZones;
      shouldBeAggressive = isWinning || friendlyStrength > enemyStrength;
    }

    return {
      totalEnemyStrength: enemyStrength,
      totalFriendlyStrength: friendlyStrength,
      isWinning,
      shouldBeAggressive,
    };
  }

  /**
   * Update flanking opportunities for fast units
   * Identifies enemy clusters that can be flanked and assigns fast units to flank them
   */
  private updateFlankingOpportunities(aiTeam: number): void {
    // Clear previous assignments
    this.flankingOpportunities = [];

    // Get flanking opportunities using existing method from subtask 4-1
    const opportunities = this.identifyFlankingOpportunities(aiTeam);

    // Convert to FlankingOpportunity with unique IDs and assignment tracking
    let opportunityIndex = 0;
    for (const opp of opportunities) {
      const flankingOpp: FlankingOpportunity = {
        id: `flank-${opportunityIndex}`,
        cluster: opp.cluster,
        flankPositions: opp.flankPositions,
        availableFlankers: opp.availableFlankers,
        priority: opp.priority,
        assignedUnits: new Set<string>(),
        frontalUnits: new Set<string>(),
        flankersInPosition: false,
      };

      this.flankingOpportunities.push(flankingOpp);
      opportunityIndex++;
    }
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

    // Release pooled vector
    VectorPool.release(zonePos);

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

    // STRATEGIC: Categorize zones by SPATIAL POSITION (not ownership)
    // Calculate friendly and enemy average positions to determine "sides" of the map
    const avgFriendlyPos = VectorPool.acquire().set(0, 0, 0);
    const avgEnemyPos = VectorPool.acquire().set(0, 0, 0);

    for (const unit of this.cachedFriendlyUnits) {
      avgFriendlyPos.add(unit.position);
    }
    if (this.cachedFriendlyUnits.length > 0) {
      avgFriendlyPos.divideScalar(this.cachedFriendlyUnits.length);
    }

    for (const unit of this.cachedEnemyUnits) {
      avgEnemyPos.add(unit.position);
    }
    if (this.cachedEnemyUnits.length > 0) {
      avgEnemyPos.divideScalar(this.cachedEnemyUnits.length);
    }

    const backfieldZones: ZoneAssessment[] = [];
    const contestedZones: ZoneAssessment[] = [];
    const frontlineZones: ZoneAssessment[] = [];

    for (const assessment of this.zoneAssessments) {
      const zonePos = VectorPool.acquire().set(assessment.zone.x, 0, assessment.zone.z);
      const distToFriendly = zonePos.distanceTo(avgFriendlyPos);
      const distToEnemy = zonePos.distanceTo(avgEnemyPos);
      VectorPool.release(zonePos);

      // Categorize by spatial position
      // Backfield: Much closer to friendly side (>30m difference)
      // Frontline: Much closer to enemy side (>30m difference)
      // Contested: In the middle (within 30m difference)

      if (distToFriendly < distToEnemy - 30) {
        // Zone is on our side of the map - backfield
        backfieldZones.push(assessment);
      } else if (distToEnemy < distToFriendly - 30) {
        // Zone is on enemy side of the map - frontline (deep strike)
        frontlineZones.push(assessment);
      } else {
        // Zone is in the middle - contested ground
        contestedZones.push(assessment);
      }
    }

    VectorPool.release(avgFriendlyPos);
    VectorPool.release(avgEnemyPos);

    // STRATEGIC ALLOCATION:
    // 1. Secure backfield zones first (1-2 units each for quick capture)
    // 2. Contest middle zones (2-3 units each)
    // 3. Mass units at frontline (flexible allocation based on threat)

    // Phase 1: Assign minimal units to backfield zones for quick capture
    for (const assessment of backfieldZones) {
      if (availableUnits.length === 0) break;

      // Only need 1-2 units for uncontested zones
      const unitsNeeded = assessment.needsCapture ? 2 : 1;
      const selectedUnits = this.selectCombinedArmsGroup(availableUnits, assessment, unitsNeeded);

      for (const unit of selectedUnits) {
        const state = this.aiStates.get(unit.id);
        if (state) {
          state.assignedObjective = assessment.zone.id;
          state.targetZone = assessment.zone;
          const idx = availableUnits.indexOf(unit);
          if (idx > -1) availableUnits.splice(idx, 1);
        }
      }
    }

    // Phase 2: Assign units to contested middle zones (moderate force)
    for (const assessment of contestedZones) {
      if (availableUnits.length === 0) break;

      // 2-4 units for contested zones depending on situation
      let unitsNeeded = assessment.needsCapture ? 3 : 2;
      if (assessment.enemyPresence > 0) {
        unitsNeeded = Math.max(unitsNeeded, Math.ceil(assessment.enemyPresence * 1.2));
      }
      unitsNeeded = Math.min(unitsNeeded, 4); // Cap at 4 units per contested zone

      const selectedUnits = this.selectCombinedArmsGroup(availableUnits, assessment, unitsNeeded);

      for (const unit of selectedUnits) {
        const state = this.aiStates.get(unit.id);
        if (state) {
          state.assignedObjective = assessment.zone.id;
          state.targetZone = assessment.zone;
          const idx = availableUnits.indexOf(unit);
          if (idx > -1) availableUnits.splice(idx, 1);
        }
      }
    }

    // Phase 3: Commit remaining units to frontline zones (main force)
    for (const assessment of frontlineZones) {
      if (availableUnits.length === 0) break;

      // Flexible allocation - commit force based on threat
      let unitsNeeded = 3; // Base frontline force

      if (assessment.needsDefense) {
        // Under attack - reinforce
        unitsNeeded = Math.max(4, Math.ceil(assessment.enemyPresence * 1.5));
      } else if (assessment.needsCapture && assessment.enemyPresence > 0) {
        // Contested capture - strong force needed
        unitsNeeded = Math.max(4, Math.ceil(assessment.enemyPresence * 1.3));
      }

      // Don't commit more than available or more than 8 units per zone
      unitsNeeded = Math.min(unitsNeeded, availableUnits.length, 8);

      if (unitsNeeded <= 0) continue;

      const selectedUnits = this.selectCombinedArmsGroup(availableUnits, assessment, unitsNeeded);

      for (const unit of selectedUnits) {
        const state = this.aiStates.get(unit.id);
        if (state) {
          state.assignedObjective = assessment.zone.id;
          state.targetZone = assessment.zone;
          const idx = availableUnits.indexOf(unit);
          if (idx > -1) availableUnits.splice(idx, 1);
        }
      }
    }

    // Allocate fast units to flanking maneuvers (before roaming assignment)
    this.allocateFlankers(availableUnits);

    // Remaining units become roaming attackers (reserve/mobile force)
    for (const unit of availableUnits) {
      const state = this.aiStates.get(unit.id);
      if (state) {
        state.assignedObjective = 'roam';
      }
    }
  }

  /**
   * Allocate units to coordinated flanking maneuvers
   * Assigns fast units to flank and slow units to frontal assault
   * Removes assigned units from the availableUnits array
   */
  private allocateFlankers(availableUnits: Unit[]): void {
    // Easy AI does not use flanking maneuvers (simpler tactics, easier to beat)
    if (this.difficulty === 'easy') return;

    // Only proceed if we have flanking opportunities
    if (this.flankingOpportunities.length === 0) return;

    // Get fast units from available units (speed > 15, REC or HEL categories)
    const fastUnits = availableUnits.filter(u =>
      (u.unitData.category === 'REC' || u.unitData.category === 'HEL') &&
      u.unitData.speed > this.flankingSpeed
    );

    // Get slow units for frontal assault (INF, TNK, ART)
    const slowUnits = availableUnits.filter(u =>
      (u.unitData.category === 'INF' || u.unitData.category === 'TNK' || u.unitData.category === 'ART')
    );

    if (fastUnits.length === 0) return; // Need flankers for coordination

    // Assign units to flanking opportunities (highest priority first)
    for (const opportunity of this.flankingOpportunities) {
      if (fastUnits.length === 0) break;

      // Hard difficulty: More units committed to flanking (3 flankers + 6 frontal)
      // Medium/Easy: Standard commitment (2 flankers + 4 frontal)
      const flankersToAssign = this.difficulty === 'hard'
        ? Math.min(this.hardDifficultyFlankersPerOpportunity, fastUnits.length)
        : Math.min(2, fastUnits.length);

      for (let i = 0; i < flankersToAssign; i++) {
        const unit = fastUnits[i];
        if (!unit) continue;

        const state = this.aiStates.get(unit.id);
        if (state) {
          // Assign to flanking objective
          state.assignedObjective = opportunity.id;
          state.targetZone = null; // Flanking maneuvers don't target zones directly

          // Track assignment
          opportunity.assignedUnits.add(unit.id);

          // Remove from available pools
          const availableIdx = availableUnits.indexOf(unit);
          if (availableIdx > -1) availableUnits.splice(availableIdx, 1);

          const fastIdx = fastUnits.indexOf(unit);
          if (fastIdx > -1) fastUnits.splice(fastIdx, 1);
        }
      }

      // Assign slow units for coordinated frontal assault
      // Only assign frontal units if we have flankers assigned
      if (opportunity.assignedUnits.size > 0 && slowUnits.length > 0) {
        // Hard difficulty: More frontal assault units (6 instead of 4)
        const frontalUnitsToAssign = this.difficulty === 'hard'
          ? Math.min(this.hardDifficultyFrontalUnits, slowUnits.length)
          : Math.min(4, slowUnits.length);

        for (let i = 0; i < frontalUnitsToAssign; i++) {
          const unit = slowUnits[i];
          if (!unit) continue;

          const state = this.aiStates.get(unit.id);
          if (state) {
            // Assign to frontal assault objective (same flank ID but different role)
            state.assignedObjective = `${opportunity.id}-frontal`;
            state.targetZone = null;

            // Track assignment
            opportunity.frontalUnits.add(unit.id);

            // Remove from available pools
            const availableIdx = availableUnits.indexOf(unit);
            if (availableIdx > -1) availableUnits.splice(availableIdx, 1);

            const slowIdx = slowUnits.indexOf(unit);
            if (slowIdx > -1) slowUnits.splice(slowIdx, 1);
          }
        }
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

    // Release pooled vector
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

    // Emergency retreat for low health (threshold depends on difficulty)
    // Easy: 40% health (retreats earlier, more cautious)
    // Medium/Hard: 25% health (fights longer)
    const retreatThreshold = this.retreatThresholds[this.difficulty] ?? 0.25;
    if (unit.health / unit.maxHealth <= retreatThreshold &&
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
      // Check if this is a flanking objective
      if (state.assignedObjective.startsWith('flank-') && !state.assignedObjective.endsWith('-frontal')) {
        this.executeFlanking(unit, state);
        return;
      }

      // Check if this is a frontal assault objective (coordinated with flankers)
      if (state.assignedObjective.endsWith('-frontal')) {
        this.executeFrontalAssault(unit, state);
        return;
      }

      // Handle zone objectives
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

        // Release pooled vector
        VectorPool.release(zonePos);
        return;
      }
    }

    // Priority 3: Attack nearby enemies
    // Hard difficulty: Longer engagement range (100m vs 80m)
    const range = this.difficulty === 'hard' ? this.hardDifficultyEngageRange : this.engageRange;
    const bestTarget = this.selectBestTarget(unit, range);
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
   * Hard difficulty: Stronger focus fire (better coordination)
   * - 0 points if no allies are attacking this target
   * - +20 points if 1 ally is attacking (strong concentration)
   * - +35 points if 2 allies are attacking (+15 for second)
   * - +45 points if 3+ allies are attacking (+10 for third+, capped at 45)
   *
   * Medium/Easy difficulty: Standard focus fire
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

    // Hard difficulty: Stronger focus fire bonuses (better coordination)
    if (this.difficulty === 'hard') {
      if (attackerCount === 0) return 0;
      if (attackerCount === 1) return 20;
      if (attackerCount === 2) return 35;
      // Cap at 45 for 3+ attackers (harder to overwhelm with focus fire)
      return 45;
    }

    // Easy/Medium: Standard focus fire
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

    // Easy AI: 30% chance to pick a suboptimal target (makes mistakes)
    // This makes the AI less accurate and easier to beat for beginners
    if (this.difficulty === 'easy' && bestTarget && enemyUnits.length > 1) {
      const shouldMakeMistake = gameRNG.next() < 0.30; // 30% chance

      if (shouldMakeMistake) {
        // Pick a random enemy instead of the best target
        const validEnemies = [];
        for (const enemy of enemyUnits) {
          if (enemy.health <= 0) continue;

          // Skip fog of war check on easy (sees all units)
          const distance = unit.position.distanceTo(enemy.position);
          if (distance <= range) {
            validEnemies.push(enemy);
          }
        }

        if (validEnemies.length > 0) {
          const randomIndex = Math.floor(gameRNG.next() * validEnemies.length);
          bestTarget = validEnemies[randomIndex] ?? bestTarget;
        }
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
    // STRATEGIC: Check if unit completed backfield objective and should move to frontline
    if (state.targetZone) {
      // Check if this is a backfield zone that we've already captured
      const isBackfieldCaptured = state.targetZone.owner === unit.team;

      if (isBackfieldCaptured) {
        // Zone captured! Check if there are frontline zones that need support
        const captureZones = this.game.economyManager.getCaptureZones();
        const enemyTeam = unit.team === 'enemy' ? 'player' : 'enemy';

        // Find contested or enemy zones (frontline)
        let bestFrontlineZone: CaptureZone | null = null;
        let bestScore = -Infinity;

        for (const zone of captureZones) {
          // Only consider zones that need our presence
          if (zone.owner === unit.team) continue; // Skip our secure zones

          // Assess if this is a frontline zone
          const zonePos = VectorPool.acquire().set(zone.x, 0, zone.z);
          const nearbyEnemies = this.game.unitManager.getUnitsInRadius(zonePos, 100, enemyTeam);
          VectorPool.release(zonePos);

          const isContested = nearbyEnemies.length > 0 || zone.owner === enemyTeam;

          if (isContested) {
            // This is a frontline zone
            const distance = Math.sqrt(
              Math.pow(unit.position.x - zone.x, 2) +
              Math.pow(unit.position.z - zone.z, 2)
            );

            let score = zone.pointsPerTick * 10 - distance * 0.1;

            // Prefer zones with enemy presence (active combat)
            if (nearbyEnemies.length > 0) {
              score += 30;
            }

            if (score > bestScore) {
              bestScore = score;
              bestFrontlineZone = zone;
            }
          }
        }

        // If we found a frontline zone, reassign to it
        if (bestFrontlineZone) {
          state.targetZone = bestFrontlineZone;
          const zoneY = this.game.getElevationAt(bestFrontlineZone.x, bestFrontlineZone.z);
          return new THREE.Vector3(bestFrontlineZone.x, zoneY, bestFrontlineZone.z);
        }

        // No frontline zones found, keep current zone (defend it)
      }

      // Still moving to assigned zone or defending it
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

      // Hard difficulty: Strongly prefers attacking enemy zones (aggressive)
      // Medium/Easy: Prefers neutral zones (more conservative)
      if (this.difficulty === 'hard') {
        // Hard AI: Prioritize enemy zones for aggressive play
        if (zone.owner === enemyTeam) {
          score += 30; // Higher bonus for enemy zones
        }
        if (zone.owner === 'neutral') {
          score += 10; // Lower bonus for neutral zones (less priority)
        }
        // Hard AI: Always aggressive, no threshold check needed
        if (zone.owner === enemyTeam) {
          score += 15; // Additional aggression bonus
        }
      } else {
        // Easy/Medium: Prefer neutral zones (easier to capture)
        if (zone.owner === 'neutral') {
          score += 20;
        }
        // Only attack enemy zones if AI is feeling aggressive
        if (this.threatAssessment.shouldBeAggressive && zone.owner === enemyTeam) {
          score += 15;
        }
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

  /**
   * Execute flanking maneuver for a fast unit
   * Fast units move in a curved path around enemy flanks instead of direct approach
   */
  private executeFlanking(unit: Unit, state: AIUnitState): void {
    // Find the flanking opportunity this unit is assigned to
    const opportunity = this.flankingOpportunities.find(opp => opp.id === state.assignedObjective);

    if (!opportunity) {
      // Flanking opportunity no longer exists, revert to roaming
      state.assignedObjective = 'roam';
      state.behavior = 'idle';
      return;
    }

    // Check if enemy cluster still exists (units still alive)
    const aliveEnemies = opportunity.cluster.filter(u => u.health > 0);
    if (aliveEnemies.length === 0) {
      // Cluster destroyed, clear objective
      state.assignedObjective = null;
      state.behavior = 'idle';
      return;
    }

    // Determine which flank position to use (left or right)
    // Choose the flank closest to the unit's current position
    const distToLeft = unit.position.distanceTo(opportunity.flankPositions.left);
    const distToRight = unit.position.distanceTo(opportunity.flankPositions.right);
    const targetFlankPos = distToLeft < distToRight
      ? opportunity.flankPositions.left
      : opportunity.flankPositions.right;

    // Check if we're already at the flank position
    const distToFlank = unit.position.distanceTo(targetFlankPos);

    if (distToFlank < 10) {
      // At flank position - mark flankers as in position
      opportunity.flankersInPosition = true;

      // Engage enemies
      // Hard difficulty: Longer engagement range (100m vs 80m)
      const range = this.difficulty === 'hard' ? this.hardDifficultyEngageRange : this.engageRange;
      const bestTarget = this.selectBestTarget(unit, range);

      if (bestTarget) {
        this.orderAttack(unit, state, bestTarget);
      } else {
        // No targets in range, advance toward cluster center
        const clusterCenter = opportunity.flankPositions.center;
        this.orderMove(unit, state, clusterCenter);
      }
    } else {
      // Not at flank yet - move with curved path
      const curvedPath = this.calculateCurvedFlankPath(unit, targetFlankPos, opportunity.flankPositions.center);
      this.orderMove(unit, state, curvedPath);
    }
  }

  /**
   * Execute coordinated frontal assault
   * Slow units (INF, TNK, ART) wait for flankers to get into position, then attack
   */
  private executeFrontalAssault(unit: Unit, state: AIUnitState): void {
    // Extract the flank ID from the frontal objective (e.g., "flank-0-frontal" -> "flank-0")
    const flankId = state.assignedObjective?.replace('-frontal', '') ?? '';
    const opportunity = this.flankingOpportunities.find(opp => opp.id === flankId);

    if (!opportunity) {
      // Flanking opportunity no longer exists, revert to roaming
      state.assignedObjective = 'roam';
      state.behavior = 'idle';
      return;
    }

    // Check if enemy cluster still exists (units still alive)
    const aliveEnemies = opportunity.cluster.filter(u => u.health > 0);
    if (aliveEnemies.length === 0) {
      // Cluster destroyed, clear objective
      state.assignedObjective = null;
      state.behavior = 'idle';
      return;
    }

    // Timing coordination: Check if flankers are in position
    // If not, hold position (wait for flankers)
    if (!opportunity.flankersInPosition) {
      // Check distance to cluster - if close, wait; if far, advance slowly
      const distToCluster = unit.position.distanceTo(opportunity.flankPositions.center);

      if (distToCluster < 60) {
        // Close enough - hold position and wait for flankers
        state.behavior = 'defending';
        state.targetUnit = null;
        state.targetPosition = null;
        return;
      } else {
        // Still far away - advance slowly toward cluster (but stop at 60m)
        // Calculate position 60m from cluster
        const direction = VectorPool.acquire();
        direction.copy(unit.position).sub(opportunity.flankPositions.center).normalize();
        const waitPosition = VectorPool.acquire();
        waitPosition.copy(opportunity.flankPositions.center).add(direction.multiplyScalar(60));
        waitPosition.y = this.game.getElevationAt(waitPosition.x, waitPosition.z);

        const finalWaitPos = new THREE.Vector3(waitPosition.x, waitPosition.y, waitPosition.z);

        // Release pooled vectors
        VectorPool.release(direction);
        VectorPool.release(waitPosition);

        this.orderMove(unit, state, finalWaitPos);
        return;
      }
    }

    // Flankers are in position - execute frontal assault
    const distToCluster = unit.position.distanceTo(opportunity.flankPositions.center);

    if (distToCluster < 30) {
      // Close to cluster - engage enemies
      // Hard difficulty: Longer engagement range (100m vs 80m)
      const range = this.difficulty === 'hard' ? this.hardDifficultyEngageRange : this.engageRange;
      const bestTarget = this.selectBestTarget(unit, range);

      if (bestTarget) {
        this.orderAttack(unit, state, bestTarget);
      } else {
        // No targets in range, hold position
        state.behavior = 'defending';
      }
    } else {
      // Not at cluster yet - advance toward front line (direct frontal approach)
      const frontLinePos = opportunity.flankPositions.frontLine.clone();
      frontLinePos.add(opportunity.flankPositions.center);
      frontLinePos.y = this.game.getElevationAt(frontLinePos.x, frontLinePos.z);

      this.orderMove(unit, state, frontLinePos);
    }
  }

  /**
   * Calculate curved path for flanking maneuver
   * Creates a waypoint that curves around enemy position instead of direct line
   */
  private calculateCurvedFlankPath(
    unit: Unit,
    flankPosition: THREE.Vector3,
    enemyCenter: THREE.Vector3
  ): THREE.Vector3 {
    const currentPos = unit.position;
    const distToFlank = currentPos.distanceTo(flankPosition);

    // If close to flank position, move directly to it
    if (distToFlank < 30) {
      return flankPosition.clone();
    }

    // Calculate waypoint that curves around enemy position
    // The waypoint is perpendicular to the line between current position and enemy center
    const toEnemy = VectorPool.acquire();
    toEnemy.copy(enemyCenter).sub(currentPos).normalize();

    // Create perpendicular vector (rotate 90 degrees in XZ plane)
    const perpendicular = VectorPool.acquire();
    perpendicular.set(-toEnemy.z, toEnemy.y, toEnemy.x);

    // Determine which direction to curve (toward the flank position)
    const toFlank = VectorPool.acquire();
    toFlank.copy(flankPosition).sub(currentPos);

    // Check if perpendicular points toward flank or away from it
    const dot = perpendicular.dot(toFlank);
    if (dot < 0) {
      // Perpendicular points away, flip it
      perpendicular.multiplyScalar(-1);
    }

    // Create waypoint at perpendicular offset from current position
    const waypoint = VectorPool.acquire();
    waypoint.copy(currentPos).add(perpendicular.multiplyScalar(this.flankWaypointDistance));

    // Clamp to terrain height
    const waypointY = this.game.getElevationAt(waypoint.x, waypoint.z);
    const result = new THREE.Vector3(waypoint.x, waypointY, waypoint.z);

    // Release all pooled vectors
    VectorPool.release(toEnemy);
    VectorPool.release(perpendicular);
    VectorPool.release(toFlank);
    VectorPool.release(waypoint);

    return result;
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
      return objectivePosition.clone();
    }

    // Calculate adjusted position
    const adjustedPosition = objectivePosition.clone();
    adjustedPosition.x += direction.x * offset;
    adjustedPosition.z += direction.z * offset;

    // Clamp to terrain height
    const y = this.game.getElevationAt(adjustedPosition.x, adjustedPosition.z);
    adjustedPosition.y = y;

    // Release pooled vector
    VectorPool.release(direction);

    return adjustedPosition;
  }

  private orderMove(unit: Unit, state: AIUnitState, position: THREE.Vector3): void {
    state.behavior = 'moving';
    state.targetUnit = null;

    // Apply role-based positioning for combined arms tactics
    const adjustedPosition = this.calculateRoleBasedPosition(unit, position);
    state.targetPosition = adjustedPosition.clone();

    // PERFORMANCE: Use simple direct movement without pathfinding for AI
    // Set up direct movement (straight line to target)
    unit.commandQueue = [];
    unit.currentCommand = { type: UnitCommand.Move, target: adjustedPosition.clone() };
    unit.waypoints = [adjustedPosition.clone()]; // Direct path to target
    unit.currentWaypointIndex = 0;
    unit.targetPosition = adjustedPosition.clone();
    unit.stuckTimer = 0;

    // Skip pathfinding and path visualization for AI (performance)
    // Units will navigate using separation/avoidance
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
        VectorPool.release(zonePos); // Release in loop
      }

      // Release the initial zone position
      VectorPool.release(zonePos0);

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
        VectorPool.release(centerPos); // Release in loop
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
      const result = new THREE.Vector3(retreatPos.x, retreatPos.y, retreatPos.z);

      // Release pooled vectors
      VectorPool.release(awayDir);
      VectorPool.release(retreatPos);

      return result;
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
   * Identify clustered enemy units that could be flanked
   * Returns clusters of 3+ enemy units within 40m of each other
   */
  private identifyEnemyClusters(
    enemyUnits: readonly Unit[],
    minClusterSize: number = 3,
    clusterRadius: number = 40
  ): Unit[][] {
    const clusters: Unit[][] = [];
    const processed = new Set<string>();

    // OPTIMIZATION: Use spatial query instead of O(n²) nested loop
    for (const unit of enemyUnits) {
      if (processed.has(unit.id)) continue;

      // Use spatial query to find nearby units (O(1) with spatial hashing)
      const nearbyUnits = this.game.unitManager.getUnitsInRadius(
        unit.position,
        clusterRadius,
        unit.team === 'enemy' ? 'enemy' : 'player'
      );

      // Filter to only include enemy units not yet processed
      const clusterUnits: Unit[] = [];
      for (const nearby of nearbyUnits) {
        if (!processed.has(nearby.id) && enemyUnits.includes(nearby)) {
          clusterUnits.push(nearby);
          processed.add(nearby.id);
        }
      }

      // Only consider groups of minClusterSize or more
      if (clusterUnits.length >= minClusterSize) {
        clusters.push(clusterUnits);
      }
    }

    return clusters;
  }

  /**
   * Calculate flanking vectors (left and right) for an enemy cluster
   * Returns positions to the left and right of the enemy formation
   */
  private calculateFlankingVectors(cluster: Unit[]): {
    left: THREE.Vector3;
    right: THREE.Vector3;
    center: THREE.Vector3;
    frontLine: THREE.Vector3;
  } | null {
    if (cluster.length === 0) return null;

    // Calculate cluster center
    const center = VectorPool.acquire();
    center.set(0, 0, 0);
    for (const unit of cluster) {
      center.add(unit.position);
    }
    center.divideScalar(cluster.length);

    // Calculate average facing direction (front line orientation)
    // Use the average forward vector of all units in the cluster
    const avgForward = VectorPool.acquire();
    avgForward.set(0, 0, 0);
    for (const unit of cluster) {
      const unitForward = VectorPool.acquire();
      unitForward.set(0, 0, -1);
      unitForward.applyQuaternion(unit.mesh.quaternion);
      avgForward.add(unitForward);
      VectorPool.release(unitForward); // Release immediately after use
    }
    avgForward.divideScalar(cluster.length);
    avgForward.normalize();

    // Calculate perpendicular vectors (flanks)
    // Left flank: rotate avgForward 90° counterclockwise
    const leftFlankDir = VectorPool.acquire();
    leftFlankDir.set(-avgForward.z, 0, avgForward.x);
    leftFlankDir.normalize();

    // Right flank: rotate avgForward 90° clockwise
    const rightFlankDir = VectorPool.acquire();
    rightFlankDir.set(avgForward.z, 0, -avgForward.x);
    rightFlankDir.normalize();

    // Calculate flank positions (40m to the sides)
    const flankDistance = 40;
    const leftPos = VectorPool.acquire();
    leftPos.copy(center).add(leftFlankDir.multiplyScalar(flankDistance));
    leftPos.y = this.game.getElevationAt(leftPos.x, leftPos.z);

    const rightPos = VectorPool.acquire();
    rightPos.copy(center).add(rightFlankDir.multiplyScalar(flankDistance));
    rightPos.y = this.game.getElevationAt(rightPos.x, rightPos.z);

    // Copy results before releasing
    const result = {
      left: leftPos.clone(),
      right: rightPos.clone(),
      center: center.clone(),
      frontLine: avgForward.clone(),
    };

    // Release all pooled vectors
    VectorPool.release(center);
    VectorPool.release(avgForward);
    VectorPool.release(leftFlankDir);
    VectorPool.release(rightFlankDir);
    VectorPool.release(leftPos);
    VectorPool.release(rightPos);

    return result;
  }

  /**
   * Get available fast units suitable for flanking maneuvers
   * Returns REC and HEL units with speed > 15
   */
  private getAvailableFastUnits(friendlyUnits: readonly Unit[]): Unit[] {
    const fastUnits: Unit[] = [];

    for (const unit of friendlyUnits) {
      const category = unit.unitData.category;
      const speed = unit.unitData.speed;

      // REC and HEL units are fast and suitable for flanking
      // Must have speed > 15 to be effective flankers
      if ((category === 'REC' || category === 'HEL') && speed > 15) {
        fastUnits.push(unit);
      }
    }

    return fastUnits;
  }

  /**
   * Identify flanking opportunities for AI units
   * Returns array of flanking opportunities with target clusters and flank positions
   */
  identifyFlankingOpportunities(aiTeam: number): Array<{
    cluster: Unit[];
    flankPositions: {
      left: THREE.Vector3;
      right: THREE.Vector3;
      center: THREE.Vector3;
      frontLine: THREE.Vector3;
    };
    availableFlankers: Unit[];
    priority: number;
  }> {
    const opportunities: Array<{
      cluster: Unit[];
      flankPositions: {
        left: THREE.Vector3;
        right: THREE.Vector3;
        center: THREE.Vector3;
        frontLine: THREE.Vector3;
      };
      availableFlankers: Unit[];
      priority: number;
    }> = [];

    // Get friendly and enemy units
    const friendlyUnits = this.game.unitManager.getAllUnits(aiTeam);
    const enemyUnits = this.game.unitManager
      .getAllUnits()
      .filter(u => u.team !== aiTeam && u.health > 0);

    // Filter by fog of war (except on easy difficulty)
    const visibleEnemies =
      this.difficulty === 'easy'
        ? enemyUnits
        : enemyUnits.filter(u => this.game.fogOfWarManager.isUnitVisibleToTeam(u, aiTeam));

    // Get available fast units for flanking
    const availableFlankers = this.getAvailableFastUnits(friendlyUnits);

    // Only proceed if we have fast units and visible enemies
    if (availableFlankers.length === 0 || visibleEnemies.length === 0) {
      return opportunities;
    }

    // Identify enemy clusters
    const clusters = this.identifyEnemyClusters(visibleEnemies);

    // For each cluster, calculate flanking vectors and priority
    for (const cluster of clusters) {
      const flankPositions = this.calculateFlankingVectors(cluster);
      if (!flankPositions) continue;

      // Calculate priority based on cluster size and unit value
      let priority = 0;

      // Base priority: cluster size (more units = higher priority)
      priority += cluster.length * 10;

      // Bonus for high-value targets in cluster
      for (const unit of cluster) {
        const categoryValue = this.getUnitCategoryValue(unit);
        priority += categoryValue / 10; // Add 10% of category value
      }

      // Distance factor: closer clusters are higher priority
      let minDistance = Infinity;
      for (const flanker of availableFlankers) {
        const dist = flanker.position.distanceTo(flankPositions.center);
        if (dist < minDistance) minDistance = dist;
      }

      // Closer is better (inverse distance bonus, max 30 points)
      if (minDistance < 200) {
        priority += (200 - minDistance) / 200 * 30;
      }

      opportunities.push({
        cluster,
        flankPositions,
        availableFlankers,
        priority,
      });
    }

    // Sort by priority (highest first)
    opportunities.sort((a, b) => b.priority - a.priority);

    return opportunities;
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
