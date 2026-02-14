/**
 * SimEconomyManager - Pure simulation logic for economy, scoring, and zone capture.
 *
 * No rendering, DOM, or audio dependencies.
 * Used by both client (wrapped in EconomyManager adapter) and server (headless).
 */

import type { CaptureZone } from '../data/types';
import { GAME_CONSTANTS } from '../data/types';

export interface TeamScore {
  player: number;
  enemy: number;
}

/** Result of a capture zone update, for the rendering layer to consume */
export interface ZoneCaptureEvent {
  zoneId: string;
  capturedBy: 'player' | 'enemy';
}

/** Describes units inside a zone by team */
export interface ZonePresence {
  zoneId: string;
  playerCount: number;
  enemyCount: number;
  isContested: boolean;
  /** True only on transition into contested state */
  becameContested: boolean;
}

/** A unit's presence in a zone (position for fill visualization) */
export interface ZoneUnitEntry {
  unitId: string;
  team: 'player' | 'enemy';
  entryX: number;
  entryZ: number;
}

/** Callback to query which units (by id, team, position) are inside a zone */
export type GetUnitsInZoneFn = (
  zone: CaptureZone,
  team: 'player' | 'enemy'
) => Array<{ id: string; x: number; z: number }>;

export class SimEconomyManager {
  // Credits
  private playerCredits: number = GAME_CONSTANTS.STARTING_CREDITS;
  private enemyCredits: number = GAME_CONSTANTS.STARTING_CREDITS;

  // Income
  private baseIncome: number = GAME_CONSTANTS.INCOME_PER_TICK;
  private tickTimer: number = 0;
  private readonly tickDuration: number = GAME_CONSTANTS.TICK_DURATION;

  // Capture zones
  private captureZones: CaptureZone[] = [];

  // Zone unit tracking
  private zoneUnitEntries: Map<string, ZoneUnitEntry[]> = new Map();
  private zoneContestedStates: Map<string, boolean> = new Map();

  // Scoring
  private score: TeamScore = { player: 0, enemy: 0 };
  private readonly victoryThreshold: number = GAME_CONSTANTS.VICTORY_THRESHOLD;

  // Pending events for rendering layer
  private pendingCaptureEvents: ZoneCaptureEvent[] = [];
  private pendingPresences: ZonePresence[] = [];
  private tickProcessed: boolean = false;
  private victoryWinner: 'player' | 'enemy' | null = null;

  // Callback to find units in zones (injected by caller)
  private getUnitsInZone: GetUnitsInZoneFn = () => [];

  initialize(captureZones: CaptureZone[], getUnitsInZone: GetUnitsInZoneFn): void {
    this.captureZones = captureZones;
    this.score = { player: 0, enemy: 0 };
    this.tickTimer = 0;
    this.getUnitsInZone = getUnitsInZone;
    this.zoneUnitEntries.clear();
    this.zoneContestedStates.clear();
    this.victoryWinner = null;
  }

  // ─── Tick-based update ─────────────────────────────────────────

  update(dt: number): void {
    this.tickProcessed = false;
    this.pendingCaptureEvents = [];
    this.pendingPresences = [];
    this.victoryWinner = null;

    this.tickTimer += dt;
    if (this.tickTimer >= this.tickDuration) {
      this.tickTimer -= this.tickDuration;
      this.processTick();
      this.tickProcessed = true;
    }

    this.updateCaptureZones();
  }

  private processTick(): void {
    // Add base income to both teams
    this.playerCredits += this.baseIncome;

    // Calculate bonus income from owned zones
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

    // Check victory
    if (this.score.player >= this.victoryThreshold) {
      this.victoryWinner = 'player';
    } else if (this.score.enemy >= this.victoryThreshold) {
      this.victoryWinner = 'enemy';
    }
  }

  // ─── Zone capture logic ────────────────────────────────────────

  private updateCaptureZones(): void {
    for (const zone of this.captureZones) {
      const playerUnits = this.getUnitsInZone(zone, 'player');
      const enemyUnits = this.getUnitsInZone(zone, 'enemy');
      const playerCount = playerUnits.length;
      const enemyCount = enemyUnits.length;

      // Track unit entries per zone
      let entries = this.zoneUnitEntries.get(zone.id);
      if (!entries) {
        entries = [];
        this.zoneUnitEntries.set(zone.id, entries);
      }

      const currentUnitIds = new Set<string>();
      for (const u of playerUnits) currentUnitIds.add(u.id);
      for (const u of enemyUnits) currentUnitIds.add(u.id);

      // Remove entries for units that left
      entries = entries.filter(e => currentUnitIds.has(e.unitId));

      // Add new entries for units entering
      for (const unit of playerUnits) {
        if (!entries.find(e => e.unitId === unit.id)) {
          entries.push({ unitId: unit.id, team: 'player', entryX: unit.x, entryZ: unit.z });
        }
      }
      for (const unit of enemyUnits) {
        if (!entries.find(e => e.unitId === unit.id)) {
          entries.push({ unitId: unit.id, team: 'enemy', entryX: unit.x, entryZ: unit.z });
        }
      }
      this.zoneUnitEntries.set(zone.id, entries);

      // Contested state tracking
      const isContested = playerCount > 0 && enemyCount > 0;
      const wasContested = this.zoneContestedStates.get(zone.id) || false;
      const becameContested = isContested && !wasContested;
      this.zoneContestedStates.set(zone.id, isContested);

      this.pendingPresences.push({
        zoneId: zone.id,
        playerCount,
        enemyCount,
        isContested,
        becameContested,
      });
    }
  }

  /**
   * Called by the rendering layer when the fill renderer determines
   * a zone has been captured. The simulation accepts this and updates ownership.
   * (On server, a simpler capture model will be used instead.)
   */
  applyZoneCapture(zoneId: string, capturedBy: 'player' | 'enemy'): void {
    const zone = this.captureZones.find(z => z.id === zoneId);
    if (!zone || zone.owner === capturedBy) return;
    zone.owner = capturedBy;
    zone.captureProgress = 100;
    this.pendingCaptureEvents.push({ zoneId, capturedBy });
  }

  /**
   * Update capture progress from fill state (driven by client renderer).
   */
  setZoneCaptureProgress(zoneId: string, progress: number): void {
    const zone = this.captureZones.find(z => z.id === zoneId);
    if (zone) {
      zone.captureProgress = progress;
    }
  }

  // ─── Event queries (for rendering layer) ───────────────────────

  /** True if an income tick was processed this frame */
  wasTickProcessed(): boolean { return this.tickProcessed; }

  /** Pending capture events this frame */
  getCaptureEvents(): readonly ZoneCaptureEvent[] { return this.pendingCaptureEvents; }

  /** Zone presence info this frame */
  getZonePresences(): readonly ZonePresence[] { return this.pendingPresences; }

  /** Non-null if victory was triggered this frame */
  getVictoryWinner(): 'player' | 'enemy' | null { return this.victoryWinner; }

  /** Get zone unit entries for fill visualization */
  getZoneUnitEntries(zoneId: string): readonly ZoneUnitEntry[] {
    return this.zoneUnitEntries.get(zoneId) ?? [];
  }

  // ─── Credits ───────────────────────────────────────────────────

  getPlayerCredits(): number { return this.playerCredits; }
  getEnemyCredits(): number { return this.enemyCredits; }

  spendCredits(amount: number): boolean {
    if (this.playerCredits >= amount) {
      this.playerCredits -= amount;
      return true;
    }
    return false;
  }

  addPlayerCredits(amount: number): void {
    this.playerCredits += amount;
  }

  spendEnemyCredits(amount: number): boolean {
    if (this.enemyCredits >= amount) {
      this.enemyCredits -= amount;
      return true;
    }
    return false;
  }

  // ─── Score & Zones ─────────────────────────────────────────────

  getScore(): TeamScore { return { ...this.score }; }
  getCaptureZones(): CaptureZone[] { return this.captureZones; }
}
