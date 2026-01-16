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

export class AIManager {
  private readonly game: Game;
  private readonly aiStates: Map<string, AIUnitState> = new Map();
  private difficulty: AIDifficulty = 'medium';

  // Timing parameters based on difficulty
  private readonly decisionIntervals: Record<AIDifficulty, number> = {
    easy: 3.0,    // 3 seconds between decisions
    medium: 1.5,  // 1.5 seconds
    hard: 0.5,    // 0.5 seconds
  };

  // Strategic parameters
  private readonly engageRange = 80;
  private readonly retreatHealthThreshold = 0.25;
  private readonly smokeCooldown = 15; // seconds between smoke deployments
  private readonly damageThresholdForSmoke = 0.15; // 15% health lost triggers smoke
  private readonly suppressionThresholdForRetreat = 70; // High suppression triggers retreat

  // Strategic state
  private lastStrategicUpdate = 0;
  private readonly strategicUpdateInterval = 2.0; // Update strategy every 2 seconds
  private zoneAssessments: ZoneAssessment[] = [];
  private threatAssessment: ThreatAssessment = {
    totalEnemyStrength: 0,
    totalFriendlyStrength: 0,
    isWinning: false,
    shouldBeAggressive: false,
  };

  constructor(game: Game) {
    this.game = game;
  }

  initialize(difficulty: AIDifficulty = 'medium'): void {
    this.difficulty = difficulty;
    this.aiStates.clear();
    this.zoneAssessments = [];
    this.lastStrategicUpdate = 0;
  }

  setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty;
  }

  /**
   * Update AI for all enemy units
   */
  update(dt: number): void {
    const currentTime = performance.now() / 1000;

    // Update strategic assessment periodically
    if (currentTime - this.lastStrategicUpdate >= this.strategicUpdateInterval) {
      this.updateStrategicAssessment();
      this.allocateUnitsToObjectives();
      this.lastStrategicUpdate = currentTime;
    }

    const enemyUnits = this.game.unitManager.getAllUnits('enemy');
    const decisionInterval = this.decisionIntervals[this.difficulty];

    for (const unit of enemyUnits) {
      if (unit.health <= 0) continue;

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
   * Update strategic assessment of the battlefield
   */
  private updateStrategicAssessment(): void {
    const captureZones = this.game.economyManager.getCaptureZones();
    const enemyUnits = this.game.unitManager.getAllUnits('enemy');
    const playerUnits = this.game.unitManager.getAllUnits('player');

    // Assess overall threat level
    this.threatAssessment = this.assessThreat(enemyUnits, playerUnits);

    // Assess each zone
    this.zoneAssessments = captureZones.map(zone => this.assessZone(zone, enemyUnits, playerUnits));

    // Sort by priority (highest first)
    this.zoneAssessments.sort((a, b) => b.priority - a.priority);
  }

  private assessThreat(friendlyUnits: Unit[], enemyUnits: Unit[]): ThreatAssessment {
    // Calculate strength based on health and unit count
    const friendlyStrength = friendlyUnits.reduce((sum, u) => sum + (u.health / u.maxHealth) * 100, 0);
    const enemyStrength = enemyUnits.reduce((sum, u) => sum + (u.health / u.maxHealth) * 100, 0);

    // Count zones
    const zones = this.game.economyManager.getCaptureZones();
    const friendlyZones = zones.filter(z => z.owner === 'enemy').length;
    const enemyZones = zones.filter(z => z.owner === 'player').length;

    const isWinning = friendlyStrength > enemyStrength * 1.2 || friendlyZones > enemyZones;
    const shouldBeAggressive = isWinning || friendlyStrength > enemyStrength;

    return {
      totalEnemyStrength: enemyStrength,
      totalFriendlyStrength: friendlyStrength,
      isWinning,
      shouldBeAggressive,
    };
  }

  private assessZone(zone: CaptureZone, friendlyUnits: Unit[], enemyUnits: Unit[]): ZoneAssessment {
    // Count units in/near zone
    const zoneY = this.game.getElevationAt(zone.x, zone.z);
    const zonePos = new THREE.Vector3(zone.x, zoneY, zone.z);
    const detectionRadius = Math.max(zone.width, zone.height) / 2 + 30; // Include units approaching

    let friendlyPresence = 0;
    let enemyPresence = 0;
    let nearestFriendlyDist = Infinity;

    for (const unit of friendlyUnits) {
      const dist = unit.position.distanceTo(zonePos);
      if (dist < detectionRadius) {
        friendlyPresence += unit.health / unit.maxHealth;
      }
      if (dist < nearestFriendlyDist) {
        nearestFriendlyDist = dist;
      }
    }

    for (const unit of enemyUnits) {
      const dist = unit.position.distanceTo(zonePos);
      if (dist < detectionRadius) {
        enemyPresence += unit.health / unit.maxHealth;
      }
    }

    // Determine zone status
    const isOurs = zone.owner === 'enemy';
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

    if (needsCapture && zone.owner === 'player') {
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
    const enemyUnits = this.game.unitManager.getAllUnits('enemy');
    const availableUnits = enemyUnits.filter(u => {
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

      // Find nearest available units
      const zoneY = this.game.getElevationAt(assessment.zone.x, assessment.zone.z);
      const zonePos = new THREE.Vector3(assessment.zone.x, zoneY, assessment.zone.z);
      const sortedUnits = [...availableUnits].sort((a, b) =>
        a.position.distanceTo(zonePos) - b.position.distanceTo(zonePos)
      );

      for (let i = 0; i < Math.min(unitsNeeded, sortedUnits.length); i++) {
        const unit = sortedUnits[i];
        if (!unit) continue;
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

    // Get remaining smoke ammo for logging
    const smokeIndex = unit.findSmokeWeaponIndex();
    const remaining = smokeIndex >= 0 ? unit.getWeaponAmmo(smokeIndex) : 0;
    console.log(`AI ${unit.name} deployed ${smokeType} smoke (${remaining} remaining)`);
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
        const zoneY = this.game.getElevationAt(zone.zone.x, zone.zone.z);
        const zonePos = new THREE.Vector3(zone.zone.x, zoneY, zone.zone.z);
        const distToZone = unit.position.distanceTo(zonePos);
        const zoneRadiusEstimate = Math.max(zone.zone.width, zone.zone.height) / 2;

        if (distToZone <= zoneRadiusEstimate + 5) {
          // At the zone - defend or capture
          const nearestEnemy = this.findNearestEnemyInRange(unit, this.engageRange);

          if (nearestEnemy) {
            this.orderAttack(unit, state, nearestEnemy);
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
    const nearestEnemy = this.findNearestEnemyInRange(unit, this.engageRange);
    if (nearestEnemy) {
      this.orderAttack(unit, state, nearestEnemy);
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

  private findNearestEnemy(unit: Unit): Unit | null {
    // Use spatial query with max search radius for efficiency
    const SEARCH_RADIUS = 500; // Max engagement search range
    const playerUnits = this.game.unitManager.getUnitsInRadius(
      unit.position,
      SEARCH_RADIUS,
      'player'
    );

    let nearest: Unit | null = null;
    let nearestDist = Infinity;

    for (const enemy of playerUnits) {
      if (enemy.health <= 0) continue;

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
    const playerUnits = this.game.unitManager.getUnitsInRadius(
      unit.position,
      range,
      'player'
    );

    let nearest: Unit | null = null;
    let nearestDist = range;

    for (const enemy of playerUnits) {
      if (enemy.health <= 0) continue;

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

    let bestZone: CaptureZone | null = null;
    let bestScore = -Infinity;

    for (const zone of captureZones) {
      if (zone.owner === 'enemy') continue; // Already ours

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

      // Aggressive AI prefers attacking
      if (this.threatAssessment.shouldBeAggressive && zone.owner === 'player') {
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

    // Otherwise, move toward player units
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

  private orderMove(unit: Unit, state: AIUnitState, position: THREE.Vector3): void {
    state.behavior = 'moving';
    state.targetUnit = null;
    state.targetPosition = position.clone();

    // Issue move command
    unit.setMoveCommand(position);
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

    console.log(`AI ${unit.name} retreating!`);
  }

  private findRetreatPosition(unit: Unit): THREE.Vector3 | null {
    // Priority 1: Retreat to a friendly-held zone
    const friendlyZones = this.zoneAssessments.filter(z =>
      z.zone.owner === 'enemy' && !z.isContested
    );

    if (friendlyZones.length > 0) {
      // Find nearest safe zone
      let nearest = friendlyZones[0];
      if (!nearest) return this.fallbackRetreatPosition(unit);
      let nearestDist = unit.position.distanceTo(new THREE.Vector3(nearest.zone.x, this.game.getElevationAt(nearest.zone.x, nearest.zone.z), nearest.zone.z));

      for (const zone of friendlyZones) {
        const zoneY = this.game.getElevationAt(zone.zone.x, zone.zone.z);
        const dist = unit.position.distanceTo(new THREE.Vector3(zone.zone.x, zoneY, zone.zone.z));
        if (dist < nearestDist) {
          nearestDist = dist;
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
    const enemyZones = this.game.currentMap?.deploymentZones.filter(z => z.team === 'enemy');
    if (enemyZones && enemyZones.length > 0) {
      // Find nearest enemy zone
      let nearestZone = enemyZones[0]!;
      let minDist = Infinity;

      for (const zone of enemyZones) {
        const centerX = (zone.minX + zone.maxX) / 2;
        const centerZ = (zone.minZ + zone.maxZ) / 2;
        const centerY = this.game.getElevationAt(centerX, centerZ);
        const dist = unit.position.distanceTo(new THREE.Vector3(centerX, centerY, centerZ));
        if (dist < minDist) {
          minDist = dist;
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
      const awayDir = unit.position.clone().sub(nearestEnemy.position).normalize();
      return unit.position.clone().add(awayDir.multiplyScalar(50));
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
  }

  /**
   * Clear all AI state
   */
  clear(): void {
    this.aiStates.clear();
    this.zoneAssessments = [];
  }
}
