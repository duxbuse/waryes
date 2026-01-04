/**
 * AIManager - Handles AI behavior for CPU-controlled units
 *
 * Provides basic AI behaviors:
 * - Patrol/hold position
 * - Attack enemies in range
 * - Capture zones with commanders
 * - Retreat when damaged
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import type { CaptureZone } from '../../data/types';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

interface AIState {
  currentBehavior: 'idle' | 'attacking' | 'moving' | 'capturing' | 'retreating';
  targetUnit: Unit | null;
  targetPosition: THREE.Vector3 | null;
  lastDecisionTime: number;
}

export class AIManager {
  private readonly game: Game;
  private readonly aiStates: Map<string, AIState> = new Map();
  private difficulty: AIDifficulty = 'medium';

  // Timing parameters based on difficulty
  private readonly decisionIntervals: Record<AIDifficulty, number> = {
    easy: 3.0,    // 3 seconds between decisions
    medium: 1.5,  // 1.5 seconds
    hard: 0.5,    // 0.5 seconds
  };

  // Behavior parameters
  private readonly engageRange = 80;  // Range to start engaging enemies
  private readonly retreatHealthThreshold = 0.25; // Retreat when below 25% health

  constructor(game: Game) {
    this.game = game;
  }

  initialize(difficulty: AIDifficulty = 'medium'): void {
    this.difficulty = difficulty;
    this.aiStates.clear();
  }

  setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty;
  }

  /**
   * Update AI for all enemy units
   */
  update(dt: number): void {
    const currentTime = performance.now() / 1000;
    const enemyUnits = this.game.unitManager.getAllUnits('enemy');

    for (const unit of enemyUnits) {
      if (unit.health <= 0) continue;

      // Get or create AI state for this unit
      let state = this.aiStates.get(unit.id);
      if (!state) {
        state = this.createInitialState();
        this.aiStates.set(unit.id, state);
      }

      // Check if it's time to make a decision
      const decisionInterval = this.decisionIntervals[this.difficulty];
      if (currentTime - state.lastDecisionTime >= decisionInterval) {
        this.makeDecision(unit, state);
        state.lastDecisionTime = currentTime;
      }

      // Execute current behavior
      this.executeBehavior(unit, state, dt);
    }
  }

  private createInitialState(): AIState {
    return {
      currentBehavior: 'idle',
      targetUnit: null,
      targetPosition: null,
      lastDecisionTime: 0,
    };
  }

  /**
   * Make a decision for the unit based on current game state
   */
  private makeDecision(unit: Unit, state: AIState): void {
    // Priority 1: Retreat if low health
    if (unit.health / unit.maxHealth <= this.retreatHealthThreshold) {
      this.orderRetreat(unit, state);
      return;
    }

    // Priority 2: Attack nearby enemies
    const nearestEnemy = this.findNearestEnemy(unit);
    if (nearestEnemy && unit.position.distanceTo(nearestEnemy.position) <= this.engageRange) {
      this.orderAttack(unit, state, nearestEnemy);
      return;
    }

    // Priority 3: Move toward capture zones or enemy units
    const targetPosition = this.findStrategicTarget(unit);
    if (targetPosition) {
      this.orderMove(unit, state, targetPosition);
      return;
    }

    // Default: Hold position / idle
    state.currentBehavior = 'idle';
    state.targetUnit = null;
    state.targetPosition = null;
  }

  private findNearestEnemy(unit: Unit): Unit | null {
    const playerUnits = this.game.unitManager.getAllUnits('player');
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

  private findStrategicTarget(unit: Unit): THREE.Vector3 | null {
    // Look for uncaptured or enemy-held capture zones
    const captureZones = this.game.economyManager.getCaptureZones();

    // Find nearest zone that isn't ours
    let bestZone: CaptureZone | null = null;
    let bestScore = -Infinity;

    for (const zone of captureZones) {
      if (zone.owner === 'enemy') continue; // Already ours

      const distance = Math.sqrt(
        Math.pow(unit.position.x - zone.x, 2) +
        Math.pow(unit.position.z - zone.z, 2)
      );

      // Score based on points value and proximity
      const score = zone.pointsPerTick * 10 - distance * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestZone = zone;
      }
    }

    if (bestZone) {
      return new THREE.Vector3(bestZone.x, 0, bestZone.z);
    }

    // Otherwise, move toward player units
    const nearestEnemy = this.findNearestEnemy(unit);
    if (nearestEnemy) {
      return nearestEnemy.position.clone();
    }

    return null;
  }

  private orderAttack(unit: Unit, state: AIState, target: Unit): void {
    state.currentBehavior = 'attacking';
    state.targetUnit = target;
    state.targetPosition = null;

    // Issue attack command
    unit.setAttackCommand(target);
  }

  private orderMove(unit: Unit, state: AIState, position: THREE.Vector3): void {
    state.currentBehavior = 'moving';
    state.targetUnit = null;
    state.targetPosition = position.clone();

    // Issue move command
    unit.setMoveCommand(position);
  }

  private orderRetreat(unit: Unit, state: AIState): void {
    state.currentBehavior = 'retreating';
    state.targetUnit = null;

    // Find our deployment zone
    const enemyZone = this.game.currentMap?.deploymentZones.find(z => z.team === 'enemy');
    if (enemyZone) {
      const retreatX = (enemyZone.minX + enemyZone.maxX) / 2;
      const retreatZ = (enemyZone.minZ + enemyZone.maxZ) / 2;
      state.targetPosition = new THREE.Vector3(retreatX, 0, retreatZ);
      unit.setMoveCommand(state.targetPosition);
    }
  }

  /**
   * Execute the current behavior (called every frame)
   */
  private executeBehavior(unit: Unit, state: AIState, _dt: number): void {
    switch (state.currentBehavior) {
      case 'attacking':
        // Check if target is still valid
        if (state.targetUnit && state.targetUnit.health <= 0) {
          state.currentBehavior = 'idle';
          state.targetUnit = null;
        }
        break;

      case 'moving':
        // Check if arrived
        if (state.targetPosition) {
          const dist = unit.position.distanceTo(state.targetPosition);
          if (dist < 5) {
            state.currentBehavior = 'idle';
            state.targetPosition = null;
          }
        }
        break;

      case 'retreating':
        // Continue retreating until safe or healed
        if (unit.health / unit.maxHealth > 0.5) {
          state.currentBehavior = 'idle';
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
  }
}
