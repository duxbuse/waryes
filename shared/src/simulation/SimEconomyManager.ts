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
  // Credits - now per-player instead of per-team
  private playerCredits: Map<string, number> = new Map();
  private playerTeams: Map<string, 'player' | 'enemy'> = new Map();

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
    // Note: playerCredits and playerTeams are NOT cleared - they persist across game phases
  }

  /**
   * Register a player and give them starting credits
   */
  registerPlayer(playerId: string, team: 'player' | 'enemy'): void {
    if (!this.playerCredits.has(playerId)) {
      this.playerCredits.set(playerId, GAME_CONSTANTS.STARTING_CREDITS);
    }
    this.playerTeams.set(playerId, team);
  }

  /**
   * Remove a player (e.g., when they disconnect)
   */
  removePlayer(playerId: string): void {
    this.playerCredits.delete(playerId);
    this.playerTeams.delete(playerId);
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

    // Give income to ALL players (each player gets their own credits)
    for (const [playerId, team] of this.playerTeams.entries()) {
      const currentCredits = this.playerCredits.get(playerId) ?? 0;
      const teamZoneIncome = team === 'player' ? playerZoneIncome : enemyZoneIncome;
      const totalIncome = this.baseIncome + teamZoneIncome;

      this.playerCredits.set(playerId, currentCredits + totalIncome);
    }

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

  /** Get current progress toward next tick (0.0 to 1.0) */
  getTickProgress(): number {
    return this.tickTimer / this.tickDuration;
  }

  // ─── Credits ───────────────────────────────────────────────────

  /** Get credits for a specific player */
  getCredits(playerId: string): number {
    return this.playerCredits.get(playerId) ?? 0;
  }

  /** Get all player IDs and their credits (for UI/debugging) */
  getAllPlayerCredits(): Array<{ playerId: string; credits: number; team: 'player' | 'enemy' }> {
    const result: Array<{ playerId: string; credits: number; team: 'player' | 'enemy' }> = [];
    for (const [playerId, credits] of this.playerCredits.entries()) {
      const team = this.playerTeams.get(playerId);
      if (team) {
        result.push({ playerId, credits, team });
      }
    }
    return result;
  }

  /** Spend credits for a specific player */
  spendCredits(playerId: string, amount: number): boolean {
    const currentCredits = this.playerCredits.get(playerId) ?? 0;
    if (currentCredits >= amount) {
      this.playerCredits.set(playerId, currentCredits - amount);
      return true;
    }
    return false;
  }

  /** Add credits to a specific player */
  addCredits(playerId: string, amount: number): void {
    const currentCredits = this.playerCredits.get(playerId) ?? 0;
    this.playerCredits.set(playerId, currentCredits + amount);
  }

  /** Legacy method - kept for backward compatibility, uses first player on team */
  getPlayerCredits(): number {
    for (const [playerId, team] of this.playerTeams.entries()) {
      if (team === 'player') {
        return this.playerCredits.get(playerId) ?? 0;
      }
    }
    return 0;
  }

  /** Legacy method - kept for backward compatibility, uses first enemy on team */
  getEnemyCredits(): number {
    for (const [playerId, team] of this.playerTeams.entries()) {
      if (team === 'enemy') {
        return this.playerCredits.get(playerId) ?? 0;
      }
    }
    return 0;
  }

  // ─── Score & Zones ─────────────────────────────────────────────

  getScore(): TeamScore { return { ...this.score }; }
  getCaptureZones(): CaptureZone[] { return this.captureZones; }
}
