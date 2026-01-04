/**
 * EconomyManager - Manages credits, income, and capture zone scoring
 */

import type { Game } from '../../core/Game';
import type { CaptureZone } from '../../data/types';
import { GAME_CONSTANTS } from '../../data/types';

export interface TeamScore {
  player: number;
  enemy: number;
}

export class EconomyManager {
  private readonly game: Game;

  // Credits
  private playerCredits: number = GAME_CONSTANTS.STARTING_CREDITS;
  private enemyCredits: number = GAME_CONSTANTS.STARTING_CREDITS;

  // Income
  private baseIncome: number = GAME_CONSTANTS.INCOME_PER_TICK;
  private tickTimer: number = 0;
  private readonly tickDuration: number = GAME_CONSTANTS.TICK_DURATION;

  // Capture zones
  private captureZones: CaptureZone[] = [];

  // Scoring
  private score: TeamScore = { player: 0, enemy: 0 };
  private readonly victoryThreshold: number = GAME_CONSTANTS.VICTORY_THRESHOLD;

  // UI elements
  private creditsEl: HTMLElement | null = null;
  private incomeEl: HTMLElement | null = null;
  private playerScoreEl: HTMLElement | null = null;
  private enemyScoreEl: HTMLElement | null = null;

  // Callbacks
  private onVictory: ((winner: 'player' | 'enemy') => void) | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  initialize(captureZones: CaptureZone[]): void {
    this.captureZones = captureZones;
    this.score = { player: 0, enemy: 0 };
    this.tickTimer = 0;

    this.setupUI();
    this.updateUI();
  }

  private setupUI(): void {
    this.creditsEl = document.getElementById('credits-value');
    this.incomeEl = document.getElementById('income-value');
    this.playerScoreEl = document.getElementById('score-blue');
    this.enemyScoreEl = document.getElementById('score-red');
  }

  setVictoryCallback(callback: (winner: 'player' | 'enemy') => void): void {
    this.onVictory = callback;
  }

  update(dt: number): void {
    // Update tick timer
    this.tickTimer += dt;

    if (this.tickTimer >= this.tickDuration) {
      this.tickTimer -= this.tickDuration;
      this.processTick();
    }

    // Update capture zone progress
    this.updateCaptureZones(dt);
  }

  private processTick(): void {
    // Add base income
    this.playerCredits += this.baseIncome;

    // Calculate bonus income from zones
    let playerZoneIncome = 0;
    let enemyZoneIncome = 0;

    for (const zone of this.captureZones) {
      if (zone.owner === 'player') {
        playerZoneIncome += zone.pointsPerTick;
        this.score.player += zone.pointsPerTick;
      } else if (zone.owner === 'enemy') {
        enemyZoneIncome += zone.pointsPerTick;
        this.score.enemy += zone.pointsPerTick;
      }
    }

    this.playerCredits += playerZoneIncome;
    this.enemyCredits += this.baseIncome + enemyZoneIncome;

    this.updateUI();

    // Check victory condition
    this.checkVictory();
  }

  private updateCaptureZones(dt: number): void {
    for (const zone of this.captureZones) {
      // Count units in zone
      const playerUnits = this.countUnitsInZone(zone, 'player');
      const enemyUnits = this.countUnitsInZone(zone, 'enemy');

      // Determine capture direction
      if (playerUnits > 0 && enemyUnits === 0) {
        // Player capturing
        if (zone.owner !== 'player') {
          zone.captureProgress += GAME_CONSTANTS.CAPTURE_RATE * dt * playerUnits;

          if (zone.captureProgress >= 100) {
            zone.owner = 'player';
            zone.captureProgress = 100;
            this.onZoneCaptured(zone, 'player');
          }
        }
      } else if (enemyUnits > 0 && playerUnits === 0) {
        // Enemy capturing
        if (zone.owner !== 'enemy') {
          zone.captureProgress += GAME_CONSTANTS.CAPTURE_RATE * dt * enemyUnits;

          if (zone.captureProgress >= 100) {
            zone.owner = 'enemy';
            zone.captureProgress = 100;
            this.onZoneCaptured(zone, 'enemy');
          }
        }
      } else if (playerUnits > 0 && enemyUnits > 0) {
        // Contested - no progress change
      } else {
        // Empty - decay towards neutral
        if (zone.owner !== 'neutral' && zone.captureProgress > 0) {
          zone.captureProgress -= GAME_CONSTANTS.CAPTURE_RATE * dt * 0.5;

          if (zone.captureProgress <= 0) {
            zone.owner = 'neutral';
            zone.captureProgress = 0;
          }
        }
      }

      // Update zone visuals
      this.game.mapRenderer?.updateCaptureZone(zone.id, zone.owner, zone.captureProgress / 100);
    }
  }

  private countUnitsInZone(zone: CaptureZone, team: 'player' | 'enemy'): number {
    const units = this.game.unitManager.getAllUnits(team);
    let count = 0;

    for (const unit of units) {
      const dx = unit.position.x - zone.x;
      const dz = unit.position.z - zone.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= zone.radius) {
        count++;
      }
    }

    return count;
  }

  private onZoneCaptured(zone: CaptureZone, team: 'player' | 'enemy'): void {
    console.log(`${zone.name} captured by ${team}!`);
    // Could add UI notification here
  }

  private checkVictory(): void {
    if (this.score.player >= this.victoryThreshold) {
      this.onVictory?.('player');
    } else if (this.score.enemy >= this.victoryThreshold) {
      this.onVictory?.('enemy');
    }
  }

  private updateUI(): void {
    if (this.creditsEl) {
      this.creditsEl.textContent = this.playerCredits.toString();
    }

    if (this.incomeEl) {
      // Calculate total income
      let zoneIncome = 0;
      for (const zone of this.captureZones) {
        if (zone.owner === 'player') {
          zoneIncome += zone.pointsPerTick;
        }
      }
      this.incomeEl.textContent = `+${this.baseIncome + zoneIncome}/tick`;
    }

    if (this.playerScoreEl) {
      this.playerScoreEl.textContent = this.score.player.toString();
    }

    if (this.enemyScoreEl) {
      this.enemyScoreEl.textContent = this.score.enemy.toString();
    }
  }

  getPlayerCredits(): number {
    return this.playerCredits;
  }

  spendCredits(amount: number): boolean {
    if (this.playerCredits >= amount) {
      this.playerCredits -= amount;
      this.updateUI();
      return true;
    }
    return false;
  }

  addPlayerCredits(amount: number): void {
    this.playerCredits += amount;
    this.updateUI();
  }

  getScore(): TeamScore {
    return { ...this.score };
  }

  getCaptureZones(): CaptureZone[] {
    return this.captureZones;
  }
}
