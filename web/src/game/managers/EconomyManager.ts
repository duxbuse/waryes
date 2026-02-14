/**
 * EconomyManager - Client adapter wrapping SimEconomyManager
 *
 * Handles DOM updates, audio, and map renderer integration.
 * All economy/scoring logic lives in SimEconomyManager (shared package).
 */

import type { Game } from '../../core/Game';
import type { CaptureZone } from '../../data/types';
import { SimEconomyManager } from '@shared/simulation/SimEconomyManager';
import type { TeamScore, ZoneUnitEntry } from '@shared/simulation/SimEconomyManager';
import type { FillEntry } from '../map/ZoneFillRenderer';

// Re-export shared types for backward compatibility
export type { TeamScore, ZoneUnitEntry } from '@shared/simulation/SimEconomyManager';

export class EconomyManager {
  private readonly game: Game;
  public readonly sim: SimEconomyManager;

  // UI elements
  private creditsEl: HTMLElement | null = null;
  private incomeEl: HTMLElement | null = null;
  private playerScoreEl: HTMLElement | null = null;
  private enemyScoreEl: HTMLElement | null = null;

  // Callbacks
  private onVictory: ((winner: 'player' | 'enemy') => void) | null = null;

  constructor(game: Game) {
    this.game = game;
    this.sim = new SimEconomyManager();
  }

  initialize(captureZones: CaptureZone[]): void {
    // Provide the unit query function to the simulation layer
    this.sim.initialize(captureZones, (zone, team) => this.getUnitsInZone(zone, team));

    // Pass capture zone bounds to fog of war renderer for fog reduction
    this.game.fogOfWarRenderer?.setCaptureZones(captureZones);

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
    // Run simulation logic
    this.sim.update(dt);

    // Process rendering events from the simulation
    this.processSimEvents(dt);

    // Check if income tick was processed
    if (this.sim.wasTickProcessed()) {
      this.game.audioManager.playSound('income_tick');

      // Debug score logging
      const score = this.sim.getScore();
      if (score.player > 0 || score.enemy > 0) {
        console.log(`[SCORE] Blue: ${score.player}, Red: ${score.enemy}`);
      }

      this.updateUI();
    }

    // Check victory
    const winner = this.sim.getVictoryWinner();
    if (winner) {
      this.game.audioManager.playSound(winner === 'player' ? 'victory' : 'defeat');
      this.onVictory?.(winner);
    }
  }

  private processSimEvents(dt: number): void {
    // Update zone fill visualization and capture detection
    const captureZones = this.sim.getCaptureZones();

    for (const zone of captureZones) {
      // Get entry data from sim for fill rendering
      const entries = this.sim.getZoneUnitEntries(zone.id);
      const fillEntries: FillEntry[] = entries.map((e: ZoneUnitEntry) => ({
        unitId: e.unitId,
        team: e.team,
        entryX: e.entryX,
        entryZ: e.entryZ,
      }));

      // Update zone fill visualization
      this.game.mapRenderer?.updateZoneFill(zone.id, fillEntries, dt);

      // Get fill state to determine ownership (driven by renderer)
      const fillState = this.game.mapRenderer?.getZoneFillState(zone.id);

      if (fillState?.isCaptured && fillState.capturedBy) {
        // Tell sim about the capture (renderer-driven capture detection)
        this.sim.applyZoneCapture(zone.id, fillState.capturedBy);

        // Update capture progress from fill state
        if (zone.owner === 'player') {
          this.sim.setZoneCaptureProgress(zone.id, fillState.playerPercent * 100);
        } else if (zone.owner === 'enemy') {
          this.sim.setZoneCaptureProgress(zone.id, fillState.enemyPercent * 100);
        }
      }
    }

    // Process capture events (audio, fog, visuals)
    for (const evt of this.sim.getCaptureEvents()) {
      const zone = captureZones.find(z => z.id === evt.zoneId);
      if (!zone) continue;

      console.log(`${zone.name} captured by ${evt.capturedBy}!`);
      this.game.audioManager.playSound('zone_capture');

      // Update fog of war over capture zones
      const zoneIdx = captureZones.indexOf(zone);
      if (zoneIdx >= 0) {
        this.game.fogOfWarRenderer?.updateCaptureZoneOwner(zoneIdx, evt.capturedBy === 'player');
      }
    }

    // Process zone presences (audio, border visuals)
    for (const presence of this.sim.getZonePresences()) {
      if (presence.becameContested) {
        this.game.audioManager.playSound('zone_contested');
      }

      const zone = captureZones.find(z => z.id === presence.zoneId);
      if (zone) {
        this.game.mapRenderer?.updateCaptureZone(
          zone.id,
          zone.owner,
          zone.captureProgress / 100,
          presence.isContested,
        );
      }
    }

    this.updateUI();
  }

  private getUnitsInZone(
    zone: CaptureZone,
    team: 'player' | 'enemy',
  ): Array<{ id: string; x: number; z: number }> {
    const units = this.game.unitManager.getAllUnits(team);
    const result: Array<{ id: string; x: number; z: number }> = [];

    for (const unit of units) {
      const dx = unit.position.x - zone.x;
      const dz = unit.position.z - zone.z;
      if (Math.abs(dx) <= zone.width / 2 && Math.abs(dz) <= zone.height / 2) {
        result.push({ id: unit.id, x: unit.position.x, z: unit.position.z });
      }
    }

    return result;
  }

  private updateUI(): void {
    const credits = this.sim.getPlayerCredits();
    const score = this.sim.getScore();
    const captureZones = this.sim.getCaptureZones();

    if (this.creditsEl) {
      this.creditsEl.textContent = credits.toString();
    }

    if (this.incomeEl) {
      let zoneIncome = 0;
      for (const zone of captureZones) {
        if (zone.owner === 'player') {
          zoneIncome += zone.pointsPerTick;
        }
      }
      this.incomeEl.textContent = `+${10 + zoneIncome}/tick`;
    }

    if (this.playerScoreEl) {
      this.playerScoreEl.textContent = score.player.toString();
    }
    if (this.enemyScoreEl) {
      this.enemyScoreEl.textContent = score.enemy.toString();
    }
  }

  // ─── Proxy methods for backward compatibility ──────────────────

  getPlayerCredits(): number { return this.sim.getPlayerCredits(); }
  getEnemyCredits(): number { return this.sim.getEnemyCredits(); }

  spendCredits(amount: number): boolean {
    const result = this.sim.spendCredits(amount);
    if (result) this.updateUI();
    return result;
  }

  addPlayerCredits(amount: number): void {
    this.sim.addPlayerCredits(amount);
    this.updateUI();
  }

  spendEnemyCredits(amount: number): boolean {
    return this.sim.spendEnemyCredits(amount);
  }

  getScore(): TeamScore { return this.sim.getScore(); }
  getCaptureZones(): CaptureZone[] { return this.sim.getCaptureZones(); }
}
