/**
 * EconomyManager - Manages credits, income, and capture zone scoring
 */

import type { Game } from '../../core/Game';
import type { CaptureZone } from '../../data/types';
import { GAME_CONSTANTS } from '../../data/types';
import type { FillEntry } from '../map/ZoneFillRenderer';

export interface TeamScore {
  player: number;
  enemy: number;
}

/** Tracks a unit's entry into a zone */
export interface ZoneUnitEntry {
  unitId: string;
  team: 'player' | 'enemy';
  /** Position where unit first entered the zone */
  entryX: number;
  entryZ: number;
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

  // Track unit entries per zone (unit circles anchored at entry positions)
  private zoneUnitEntries: Map<string, ZoneUnitEntry[]> = new Map();

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

    // Debug: Log score every tick
    if (this.score.player > 0 || this.score.enemy > 0) {
      console.log(`[SCORE] Blue: ${this.score.player}, Red: ${this.score.enemy} (playerZoneIncome: ${playerZoneIncome}, enemyZoneIncome: ${enemyZoneIncome})`);
    }

    this.updateUI();

    // Check victory condition
    this.checkVictory();
  }

  private updateCaptureZones(dt: number): void {
    for (const zone of this.captureZones) {
      // Get units currently in zone with their positions
      const playerUnitsInZone = this.getUnitsInZone(zone, 'player');
      const enemyUnitsInZone = this.getUnitsInZone(zone, 'enemy');
      const playerCount = playerUnitsInZone.length;
      const enemyCount = enemyUnitsInZone.length;

      // Get or create entry tracking for this zone
      let entries = this.zoneUnitEntries.get(zone.id);
      if (!entries) {
        entries = [];
        this.zoneUnitEntries.set(zone.id, entries);
      }

      // Build set of unit IDs currently in zone
      const currentUnitIds = new Set<string>();
      for (const u of playerUnitsInZone) currentUnitIds.add(u.id);
      for (const u of enemyUnitsInZone) currentUnitIds.add(u.id);

      // Remove entries for units that left the zone
      entries = entries.filter(e => currentUnitIds.has(e.unitId));

      // Add new entries for units entering the zone (record entry position)
      for (const unit of playerUnitsInZone) {
        if (!entries.find(e => e.unitId === unit.id)) {
          console.log(`Unit ${unit.id} entered zone ${zone.id} at (${unit.x.toFixed(1)}, ${unit.z.toFixed(1)})`);
          entries.push({
            unitId: unit.id,
            team: 'player',
            entryX: unit.x,
            entryZ: unit.z,
          });
        }
      }

      for (const unit of enemyUnitsInZone) {
        if (!entries.find(e => e.unitId === unit.id)) {
          entries.push({
            unitId: unit.id,
            team: 'enemy',
            entryX: unit.x,
            entryZ: unit.z,
          });
        }
      }

      this.zoneUnitEntries.set(zone.id, entries);

      // Convert to FillEntry format for the renderer
      const fillEntries: FillEntry[] = entries.map(e => ({
        unitId: e.unitId,
        team: e.team,
        entryX: e.entryX,
        entryZ: e.entryZ,
      }));

      // Update zone fill visualization
      this.game.mapRenderer?.updateZoneFill(zone.id, fillEntries, dt);

      // Get fill state to determine ownership
      const fillState = this.game.mapRenderer?.getZoneFillState(zone.id);
      const isContested = playerCount > 0 && enemyCount > 0;

      // Determine zone ownership based on fill state
      if (fillState) {
        // Check if zone was captured
        if (fillState.isCaptured && fillState.capturedBy) {
          if (fillState.capturedBy === 'player' && zone.owner !== 'player') {
            console.log(`[CAPTURE] ${zone.name} owner changing from '${zone.owner}' to 'player'`);
            zone.owner = 'player';
            zone.captureProgress = 100;
            this.onZoneCaptured(zone, 'player');
          } else if (fillState.capturedBy === 'enemy' && zone.owner !== 'enemy') {
            console.log(`[CAPTURE] ${zone.name} (id=${zone.id}) owner changing from '${zone.owner}' to 'enemy'. captureZones length: ${this.captureZones.length}, zone ref: ${this.captureZones.indexOf(zone)}`);
            zone.owner = 'enemy';
            zone.captureProgress = 100;
            this.onZoneCaptured(zone, 'enemy');
          }
        }

        // Update capture progress based on fill percentage
        if (zone.owner === 'player') {
          zone.captureProgress = fillState.playerPercent * 100;
        } else if (zone.owner === 'enemy') {
          zone.captureProgress = fillState.enemyPercent * 100;
        }
      }

      // Update zone border/flag visuals
      this.game.mapRenderer?.updateCaptureZone(zone.id, zone.owner, zone.captureProgress / 100, isContested);
    }
  }

  private getUnitsInZone(zone: CaptureZone, team: 'player' | 'enemy'): Array<{ id: string; x: number; z: number }> {
    const units = this.game.unitManager.getAllUnits(team);
    const result: Array<{ id: string; x: number; z: number }> = [];

    for (const unit of units) {
      const dx = unit.position.x - zone.x;
      const dz = unit.position.z - zone.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= zone.radius) {
        result.push({ id: unit.id, x: unit.position.x, z: unit.position.z });
      }
    }

    return result;
  }

  private onZoneCaptured(zone: CaptureZone, team: 'player' | 'enemy'): void {
    console.log(`${zone.name} captured by ${team}!`);
    // Could add UI notification here
  }

  private checkVictory(): void {
    if (this.score.player >= this.victoryThreshold) {
      this.game.audioManager.playSound('victory');
      this.onVictory?.('player');
    } else if (this.score.enemy >= this.victoryThreshold) {
      this.game.audioManager.playSound('defeat');
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
