/**
 * SimUnit - Pure simulation unit class
 *
 * Contains ALL game simulation state and logic for a unit.
 * No rendering, audio, or DOM dependencies.
 * Used by both client (wrapped in Unit adapter) and server (headless).
 */

import * as THREE from 'three';
import type { UnitData, WeaponSlot, WeaponData, Building } from '../data/types';
import type { SimGameContext } from '../core/SimGameContext';

// ─── Reusable temp vectors (module-level, zero per-frame allocation) ───
const _sepForce = new THREE.Vector3();
const _toOther = new THREE.Vector3();
const _testPos = new THREE.Vector3();
const _perpDir = new THREE.Vector3();
const _testAlt = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _nextPos = new THREE.Vector3();

// ─── Enums & Types ───────────────────────────────────────────────

export enum UnitCommand {
  None = 'none',
  Move = 'move',
  Attack = 'attack',
  AttackMove = 'attackMove',
  Garrison = 'garrison',
  Mount = 'mount',
  Unload = 'unload',
  Reverse = 'reverse',
  FastMove = 'fastMove',
  DigIn = 'digIn',
}

export interface SimCommandData {
  type: UnitCommand;
  target?: THREE.Vector3;
  targetUnit?: SimUnit;
}

export interface SimUnitConfig {
  id: string;
  name: string;
  unitType: string;
  team: 'player' | 'enemy';
  ownerId?: string | undefined;
  position: THREE.Vector3;
  maxHealth: number;
  speed: number;
  rotationSpeed: number;
  unitData?: UnitData | undefined;
  veterancy?: number | undefined;
}

/** Events emitted by SimUnit for rendering layer to consume */
export interface SimUnitEvent {
  type: 'death' | 'morale_low' | 'morale_critical' | 'rout_started' | 'rout_recovered' | 'veterancy_gained' | 'rallied';
  data?: Record<string, unknown>;
}

// ─── SimUnit Class ───────────────────────────────────────────────

export class SimUnit {
  // Identity
  public readonly id: string;
  public readonly name: string;
  public readonly unitType: string;
  public readonly team: 'player' | 'enemy';
  public readonly ownerId: string;

  // Stats
  public readonly maxHealth: number;
  public speed: number;
  public rotationSpeed: number;
  public readonly cost: number;
  public readonly transportCapacity: number;

  // Unit data reference
  private readonly unitData: UnitData | null;

  // Armor
  private armor = { front: 1, side: 1, rear: 1, top: 0 };

  // Combat
  private weapons: WeaponSlot[] = [];
  private resolvedWeapons: (WeaponData | null)[] = [];
  private weaponAmmo: number[] = [];
  private weaponCooldowns: number[] = [];
  private weaponDamageDealt: number[] = [];
  private fireRate: number = 1;

  // Kill tracking & veterancy
  private _kills: number = 0;
  private _veterancy: number = 0;

  // Core state
  private _health: number;
  private _morale: number = 100;
  private _suppression: number = 0;
  private _isFrozen: boolean = true;
  private _isRouting: boolean = false;
  private _returnFireOnly: boolean = false;
  private _spawnProtectionTimer: number = 0;

  // Commander aura bonus
  private auraBonusMorale: number = 0;

  // Transport/Garrison
  private _garrisonedIn: Building | null = null;
  private _mountedIn: SimUnit | null = null;

  // Entering/Exiting/Digging states
  private _isEntering = false;
  private _enterTimer = 0;
  private _enterTargetBuilding: Building | null = null;
  private _isExiting = false;
  private _exitTimer = 0;
  private _isDigging = false;
  private _digTimer = 0;
  private readonly DIG_DURATION = 30.0;

  // Combat targeting
  public combatTarget: SimUnit | null = null;
  public targetScanTimer: number = 0;

  // Position & Rotation (pure math, no mesh)
  public readonly simPosition: THREE.Vector3;
  public simRotationY: number = 0;

  // Movement
  private targetPosition: THREE.Vector3 | null = null;
  private readonly velocity = new THREE.Vector3();
  private waypoints: THREE.Vector3[] = [];
  private currentWaypointIndex = 0;
  private stuckTimer = 0;
  private lastPosition = new THREE.Vector3();
  private hasMovedOnce = false;
  private lastPathfindingAttempt = 0;
  private readonly pathfindingCooldown = 1.0;
  private isEscaping = false;
  // @ts-expect-error Planned feature - movement modes
  private movementMode: 'normal' | 'fast' | 'reverse' = 'normal';

  // Commands
  private currentCommand: SimCommandData = { type: UnitCommand.None };
  private commandQueue: SimCommandData[] = [];

  // Events for rendering layer
  public readonly pendingEvents: SimUnitEvent[] = [];

  // Context reference
  private readonly context: SimGameContext;

  constructor(config: SimUnitConfig, context: SimGameContext) {
    this.id = config.id;
    this.name = config.name;
    this.unitType = config.unitType;
    this.team = config.team;
    this.ownerId = config.ownerId ?? (config.team === 'player' ? 'player' : 'enemy');
    this.context = context;

    // Get unit data
    this.unitData = config.unitData ?? context.getUnitData(config.unitType) ?? null;

    // Set veterancy
    this._veterancy = config.veterancy ?? 0;

    // Set stats from unit data or config
    if (this.unitData) {
      this.maxHealth = this.unitData.health;
      this.speed = this.unitData.speed.road;
      this.rotationSpeed = this.unitData.speed.rotation;
      this.armor = { ...this.unitData.armor };
      this.weapons = [...this.unitData.weapons];
      this.transportCapacity = this.unitData.transportCapacity;
      this.cost = this.unitData.cost;
    } else {
      this.maxHealth = config.maxHealth;
      this.speed = config.speed;
      this.rotationSpeed = config.rotationSpeed;
      this.transportCapacity = 0;
      this.cost = 100;
    }

    this._health = this.maxHealth;

    // Resolve weapon data
    this.resolvedWeapons = this.weapons.map(w => context.getWeaponData(w.weaponId) ?? null);
    this.weaponAmmo = this.weapons.map(w => w.maxAmmo);
    this.weaponCooldowns = this.weapons.map(() => 0);
    this.weaponDamageDealt = this.weapons.map(() => 0);

    // Apply veterancy bonuses
    this.applyVeterancyBonuses();

    // Set position
    this.simPosition = config.position.clone();
    this.lastPosition.copy(config.position);

    // Initialize scan timer with random offset (deterministic)
    this.targetScanTimer = context.rng.next() * 1.0;
  }

  // ─── Position / Category Getters ─────────────────────────────

  get position(): THREE.Vector3 {
    return this.simPosition;
  }

  get category(): string {
    return this.unitData?.category || 'UNK';
  }

  get unitDataId(): string {
    return this.unitData?.id ?? this.unitType;
  }

  // ─── Health ──────────────────────────────────────────────────

  get health(): number {
    return this._health;
  }

  takeDamage(amount: number): void {
    if (this._spawnProtectionTimer > 0) return;

    const moraleBeforeDamage = this._morale;

    this._health = Math.max(0, this._health - amount);
    if (this._health <= 0) {
      this.onDeath();
      return;
    }

    // Taking damage lowers morale
    const moraleDamage = amount * 0.5;
    this._morale = Math.max(0, this._morale - moraleDamage);

    // Emit events for morale threshold crossings
    if (moraleBeforeDamage >= 50 && this._morale < 50) {
      this.pendingEvents.push({ type: 'morale_low' });
    } else if (moraleBeforeDamage >= 20 && this._morale < 20) {
      this.pendingEvents.push({ type: 'morale_critical' });
    }

    if (this._morale <= 0 && !this._isRouting) {
      this.onRout();
    }
  }

  setSpawnProtection(seconds: number): void {
    this._spawnProtectionTimer = seconds;
  }

  get hasSpawnProtection(): boolean {
    return this._spawnProtectionTimer > 0;
  }

  get spawnProtectionTimer(): number {
    return this._spawnProtectionTimer;
  }

  /** Decrement spawn protection timer (called from rendering layer's update) */
  decrementSpawnProtection(dt: number): void {
    if (this._spawnProtectionTimer > 0) {
      this._spawnProtectionTimer = Math.max(0, this._spawnProtectionTimer - dt);
    }
  }

  heal(amount: number): void {
    this._health = Math.min(this.maxHealth, this._health + amount);
  }

  private onDeath(): void {
    this.pendingEvents.push({ type: 'death' });
    this.context.destroyUnit(this);
  }

  // ─── Morale ──────────────────────────────────────────────────

  get morale(): number {
    return this._morale;
  }

  suppressMorale(amount: number): void {
    const moraleBeforeSuppression = this._morale;

    this._morale = Math.max(0, this._morale - amount);

    if (moraleBeforeSuppression >= 50 && this._morale < 50) {
      this.pendingEvents.push({ type: 'morale_low' });
    } else if (moraleBeforeSuppression >= 20 && this._morale < 20) {
      this.pendingEvents.push({ type: 'morale_critical' });
    }

    if (this._morale <= 0 && !this._isRouting) {
      this.onRout();
    }
  }

  private onRout(): void {
    this._isRouting = true;
    this.pendingEvents.push({ type: 'rout_started' });
    this.clearCommands();
  }

  recoverMorale(amount: number): void {
    if (this._isRouting) return;
    this._morale = Math.min(100, this._morale + amount);
  }

  private calculateCommanderAura(): void {
    this.auraBonusMorale = 0;
    if (!this.unitData) return;

    const MAX_AURA_RADIUS = 100;
    const nearbyUnits = this.context.getUnitsInRadius(this.simPosition, MAX_AURA_RADIUS, this.team);

    for (const unit of nearbyUnits) {
      if (unit === this || !unit.data || !unit.data.isCommander) continue;
      const auraRadius = unit.data.commanderAuraRadius;
      if (auraRadius <= 0) continue;
      const distance = this.simPosition.distanceTo(unit.simPosition);
      if (distance <= auraRadius) {
        this.auraBonusMorale += 10;
      }
    }

    if (this.auraBonusMorale > 0 && this._morale < 100 && !this._isRouting) {
      this._morale = Math.min(100, this._morale + this.auraBonusMorale * 0.01);
    }
  }

  // ─── Suppression ─────────────────────────────────────────────

  get suppression(): number {
    return this._suppression;
  }

  addSuppression(amount: number): void {
    this._suppression = Math.min(100, this._suppression + amount);
  }

  recoverSuppression(amount: number): void {
    this._suppression = Math.max(0, this._suppression - amount);
  }

  // ─── Armor ───────────────────────────────────────────────────

  getArmor(facing: 'front' | 'side' | 'rear' | 'top'): number {
    return this.armor[facing];
  }

  // ─── Weapons ─────────────────────────────────────────────────

  getWeapons(): WeaponSlot[] {
    return this.weapons;
  }

  getResolvedWeapon(index: number): WeaponData | null {
    return this.resolvedWeapons[index] ?? null;
  }

  getMaxWeaponRange(): number {
    let maxRange = 0;
    for (const resolved of this.resolvedWeapons) {
      if (resolved && resolved.range > maxRange) {
        maxRange = resolved.range;
      }
    }
    return maxRange || 20;
  }

  canFire(): boolean {
    if (this._isRouting || this._suppression >= 80) return false;
    for (let i = 0; i < this.weaponCooldowns.length; i++) {
      if (this.weaponCooldowns[i]! <= 0) return true;
    }
    return false;
  }

  resetFireCooldown(): void {
    for (let i = 0; i < this.weapons.length; i++) {
      const weapon = this.resolvedWeapons[i];
      if (weapon && weapon.rateOfFire > 0) {
        this.weaponCooldowns[i] = 60 / weapon.rateOfFire;
      }
    }
  }

  getWeaponCooldown(weaponIndex: number): number {
    return this.weaponCooldowns[weaponIndex] ?? 0;
  }

  canWeaponFire(weaponIndex: number): boolean {
    const cooldown = this.weaponCooldowns[weaponIndex] ?? 0;
    return cooldown <= 0 && !this._isRouting && this._suppression < 80;
  }

  resetWeaponCooldown(weaponIndex: number, _weaponId?: string): void {
    const weapon = this.resolvedWeapons[weaponIndex];
    if (weapon && weapon.rateOfFire > 0) {
      this.weaponCooldowns[weaponIndex] = 60 / weapon.rateOfFire;
    }
  }

  getWeaponDamageDealt(weaponIndex: number): number {
    return this.weaponDamageDealt[weaponIndex] ?? 0;
  }

  addWeaponDamage(weaponIndex: number, damage: number): void {
    if (weaponIndex >= 0 && weaponIndex < this.weaponDamageDealt.length) {
      this.weaponDamageDealt[weaponIndex]! += damage;
    }
  }

  // ─── Ammunition ──────────────────────────────────────────────

  getWeaponAmmo(weaponIndex: number): number {
    return this.weaponAmmo[weaponIndex] ?? 0;
  }

  getWeaponMaxAmmo(weaponIndex: number): number {
    return this.weapons[weaponIndex]?.maxAmmo ?? 0;
  }

  hasWeaponAmmo(weaponIndex: number): boolean {
    return (this.weaponAmmo[weaponIndex] ?? 0) > 0;
  }

  useWeaponAmmo(weaponIndex: number, amount: number = 1): boolean {
    const current = this.weaponAmmo[weaponIndex] ?? 0;
    if (current < amount) return false;
    this.weaponAmmo[weaponIndex] = current - amount;
    return true;
  }

  resupplyWeapon(weaponIndex: number): void {
    const weapon = this.weapons[weaponIndex];
    if (weapon) {
      this.weaponAmmo[weaponIndex] = weapon.maxAmmo;
    }
  }

  resupplyAllWeapons(): void {
    this.weaponAmmo = this.weapons.map(w => w.maxAmmo);
    this.weaponCooldowns = this.weapons.map(() => 0);
  }

  // ─── Smoke ───────────────────────────────────────────────────

  findSmokeWeaponIndex(): number {
    for (let i = 0; i < this.resolvedWeapons.length; i++) {
      if (this.resolvedWeapons[i]?.smokeEffect !== undefined) return i;
    }
    return -1;
  }

  hasSmokeAmmo(): boolean {
    const smokeIndex = this.findSmokeWeaponIndex();
    return smokeIndex >= 0 && this.hasWeaponAmmo(smokeIndex);
  }

  useSmoke(): boolean {
    const smokeIndex = this.findSmokeWeaponIndex();
    if (smokeIndex < 0) return false;
    return this.useWeaponAmmo(smokeIndex);
  }

  getSmokeType(): 'grenade' | 'launcher' | 'artillery' {
    const smokeIndex = this.findSmokeWeaponIndex();
    if (smokeIndex >= 0) {
      const weaponData = this.resolvedWeapons[smokeIndex];
      const radius = weaponData?.smokeEffect?.radius ?? 5;
      if (radius >= 40) return 'artillery';
      if (radius >= 10) return 'launcher';
    }
    return 'grenade';
  }

  // ─── Veterancy ───────────────────────────────────────────────

  private applyVeterancyBonuses(): void {
    if (!this.unitData || this._veterancy === 0) return;
    const bonusMultiplier = this.unitData.veterancyBonus * this._veterancy;
    this.fireRate *= (1 + bonusMultiplier * 0.5);
    this.speed *= (1 + bonusMultiplier * 0.2);
    this.rotationSpeed *= (1 + bonusMultiplier * 0.3);
  }

  private onVeterancyGained(): void {
    if (!this.unitData) return;
    const bonusMultiplier = this.unitData.veterancyBonus;
    this.fireRate *= (1 + bonusMultiplier * 0.5);
    this.speed *= (1 + bonusMultiplier * 0.2);
    this.rotationSpeed *= (1 + bonusMultiplier * 0.3);
    this.heal(this.maxHealth * 0.2);
    this._morale = Math.min(100, this._morale + 30);
    this.pendingEvents.push({ type: 'veterancy_gained', data: { veterancy: this._veterancy } });
  }

  get returnFireOnly(): boolean {
    return this._returnFireOnly;
  }

  setReturnFireOnly(value: boolean): void {
    this._returnFireOnly = value;
  }

  get isRouting(): boolean {
    return this._isRouting;
  }

  get data(): UnitData | null {
    return this.unitData;
  }

  get kills(): number {
    return this._kills;
  }

  get veterancy(): number {
    return this._veterancy;
  }

  addKill(): void {
    this._kills++;
    const oldVeterancy = this._veterancy;

    if (this._kills >= 7 && this._veterancy < 2) {
      this._veterancy = 2;
    } else if (this._kills >= 3 && this._veterancy < 1) {
      this._veterancy = 1;
    }

    if (this._veterancy > oldVeterancy) {
      this.onVeterancyGained();
    }
  }

  // ─── Frozen State ────────────────────────────────────────────

  get isFrozen(): boolean {
    return this._isFrozen;
  }

  setFrozen(frozen: boolean): void {
    this._isFrozen = frozen;
  }

  // ─── Garrison / Transport State ──────────────────────────────

  get isDigging(): boolean { return this._isDigging; }
  get isEntering(): boolean { return this._isEntering; }
  get isExiting(): boolean { return this._isExiting; }

  get isGarrisoned(): boolean {
    return this._garrisonedIn !== null;
  }

  get garrisonedBuilding(): Building | null {
    return this._garrisonedIn;
  }

  setGarrisonedIn(building: Building | null): void {
    this._garrisonedIn = building;
  }

  get isMounted(): boolean {
    return this._mountedIn !== null;
  }

  get mountedIn(): SimUnit | null {
    return this._mountedIn;
  }

  setMountedIn(transport: SimUnit | null): void {
    this._mountedIn = transport;
  }

  // ─── Commands ────────────────────────────────────────────────

  getCurrentCommand(): SimCommandData {
    return this.currentCommand;
  }

  getCommandQueue(): SimCommandData[] {
    return this.commandQueue;
  }

  setDigInCommand(): void {
    const cat = this.unitData?.category ?? 'INF';
    if (cat !== 'INF') return;

    this.clearCommands();
    this.currentCommand = { type: UnitCommand.DigIn };
    this._isDigging = true;
    this._digTimer = this.DIG_DURATION;
    this.targetPosition = null;
  }

  setMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Move, target: target.clone() };

    const path = this.context.findPath(this.simPosition, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      const fallbackTarget = this.context.findNearestReachablePosition(this.simPosition, target, 50);
      if (fallbackTarget) {
        const fallbackPath = this.context.findPath(this.simPosition, fallbackTarget);
        if (fallbackPath && fallbackPath.length > 0) {
          this.waypoints = fallbackPath;
          this.currentWaypointIndex = 0;
          this.targetPosition = this.waypoints[0]!.clone();
          this.stuckTimer = 0;
        } else {
          this.currentCommand = { type: UnitCommand.None };
          this.targetPosition = null;
          this.waypoints = [];
        }
      } else {
        this.currentCommand = { type: UnitCommand.None };
        this.targetPosition = null;
        this.waypoints = [];
      }
    }
  }

  queueMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Move, target: target.clone() });
    }
  }

  setAttackCommand(target: SimUnit): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Attack, targetUnit: target };
  }

  queueAttackCommand(target: SimUnit): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setAttackCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Attack, targetUnit: target });
    }
  }

  setFastMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.FastMove, target: target.clone() };

    const path = this.context.findPath(this.simPosition, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      const fallbackTarget = this.context.findNearestReachablePosition(this.simPosition, target, 50);
      if (fallbackTarget) {
        const fallbackPath = this.context.findPath(this.simPosition, fallbackTarget);
        if (fallbackPath && fallbackPath.length > 0) {
          this.waypoints = fallbackPath;
          this.currentWaypointIndex = 0;
          this.targetPosition = this.waypoints[0]!.clone();
          this.stuckTimer = 0;
        } else {
          this.currentCommand = { type: UnitCommand.None };
          this.targetPosition = null;
          this.waypoints = [];
        }
      } else {
        this.currentCommand = { type: UnitCommand.None };
        this.targetPosition = null;
        this.waypoints = [];
      }
    }
  }

  queueFastMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setFastMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.FastMove, target: target.clone() });
    }
  }

  setReverseCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Reverse, target: target.clone() };

    const path = this.context.findPath(this.simPosition, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      const fallbackTarget = this.context.findNearestReachablePosition(this.simPosition, target, 50);
      if (fallbackTarget) {
        const fallbackPath = this.context.findPath(this.simPosition, fallbackTarget);
        if (fallbackPath && fallbackPath.length > 0) {
          this.waypoints = fallbackPath;
          this.currentWaypointIndex = 0;
          this.targetPosition = this.waypoints[0]!.clone();
          this.stuckTimer = 0;
        } else {
          this.currentCommand = { type: UnitCommand.None };
          this.targetPosition = null;
          this.waypoints = [];
        }
      } else {
        this.currentCommand = { type: UnitCommand.None };
        this.targetPosition = null;
        this.waypoints = [];
      }
    }
  }

  queueReverseCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setReverseCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Reverse, target: target.clone() });
    }
  }

  setAttackMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.AttackMove, target: target.clone() };

    const path = this.context.findPath(this.simPosition, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      const fallbackTarget = this.context.findNearestReachablePosition(this.simPosition, target, 50);
      if (fallbackTarget) {
        const fallbackPath = this.context.findPath(this.simPosition, fallbackTarget);
        if (fallbackPath && fallbackPath.length > 0) {
          this.waypoints = fallbackPath;
          this.currentWaypointIndex = 0;
          this.targetPosition = this.waypoints[0]!.clone();
          this.stuckTimer = 0;
        } else {
          this.currentCommand = { type: UnitCommand.None };
          this.targetPosition = null;
          this.waypoints = [];
        }
      } else {
        this.currentCommand = { type: UnitCommand.None };
        this.targetPosition = null;
        this.waypoints = [];
      }
    }
  }

  queueAttackMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setAttackMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.AttackMove, target: target.clone() });
    }
  }

  setGarrisonCommand(building: Building): void {
    const buildingPos = new THREE.Vector3(building.x, 0, building.z);
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Garrison, target: buildingPos };
    this.targetPosition = buildingPos;
  }

  setUngarrisonCommand(): void {
    if (!this._garrisonedIn) return;
    this.commandQueue = [];
    this._isExiting = true;
    this._exitTimer = this.getGarrisonDelay(this._garrisonedIn);
  }

  private performExitBuilding(): void {
    if (!this._garrisonedIn) {
      this._isExiting = false;
      return;
    }

    const exitPos = this.context.ungarrison(this, this._garrisonedIn);
    if (exitPos) {
      this._garrisonedIn = null;
      this._isExiting = false;
      this.simPosition.copy(exitPos);
      this.targetPosition = null;
      this.completeCommand();
    }
  }

  private getGarrisonDelay(_building: Building): number {
    if (this.unitData?.category === 'INF') {
      for (let i = 0; i < this.resolvedWeapons.length; i++) {
        const weapon = this.resolvedWeapons[i];
        if (weapon && (weapon as any).tags?.includes('heavy')) {
          return 5.0;
        }
      }
    }
    return 2.0;
  }

  setMountCommand(transport: SimUnit): void {
    const transportPos = transport.simPosition.clone();
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Mount, target: transportPos, targetUnit: transport };
    this.targetPosition = transportPos;
  }

  setUnloadCommand(): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Unload };

    const passengers = this.context.unloadAll(this);

    for (const passenger of passengers) {
      const offset = new THREE.Vector3(
        (this.context.rng.next() - 0.5) * 5,
        0,
        (this.context.rng.next() - 0.5) * 5
      );
      const moveTarget = passenger.simPosition.clone().add(offset);
      passenger.setMoveCommand(moveTarget);
    }

    this.completeCommand();
  }

  clearCommands(): void {
    this.currentCommand = { type: UnitCommand.None };
    this.commandQueue = [];
    this.targetPosition = null;
  }

  setDirectMovement(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Move, target: target.clone() };
    this.waypoints = [target.clone()];
    this.currentWaypointIndex = 0;
    this.targetPosition = target.clone();
    this.stuckTimer = 0;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  getCollisionRadius(): number {
    const cat = this.unitData?.category ?? 'INF';
    if (cat === 'TNK') return 3.5;
    if (cat === 'REC') return 3.0;
    if (cat === 'ART' || cat === 'LOG') return 3.5;
    return 2.5;
  }

  getUnitColor(): number {
    if (this.team === 'enemy') return 0xff4a4a;
    if (this.ownerId === 'player') return 0x4a9eff;
    return 0x4aff4a;
  }

  isPlayerOwned(): boolean {
    return this.team === 'player' && this.ownerId === 'player';
  }

  isAllied(): boolean {
    return this.team === 'player' && this.ownerId !== 'player';
  }

  /**
   * Build full command queue for path visualization
   */
  buildFullCommandQueue(): Array<{ type: string; target?: THREE.Vector3 }> {
    const fullQueue: Array<{ type: string; target?: THREE.Vector3 }> = [];

    if (this.currentCommand.type !== UnitCommand.None) {
      if (this.currentCommand.target) {
        fullQueue.push({ type: this.currentCommand.type, target: this.currentCommand.target });
      } else if (this.currentCommand.targetUnit) {
        fullQueue.push({ type: this.currentCommand.type, target: this.currentCommand.targetUnit.simPosition.clone() });
      }
    }

    for (const cmd of this.commandQueue) {
      if (cmd.target) {
        fullQueue.push({ type: cmd.type, target: cmd.target });
      } else if (cmd.targetUnit) {
        fullQueue.push({ type: cmd.type, target: cmd.targetUnit.simPosition.clone() });
      }
    }

    return fullQueue;
  }

  // ─── Fixed Update (Main Simulation Tick) ─────────────────────

  fixedUpdate(dt: number): void {
    if (this._isFrozen) return;

    // Update weapon cooldowns
    for (let i = 0; i < this.weaponCooldowns.length; i++) {
      if (this.weaponCooldowns[i]! > 0) {
        this.weaponCooldowns[i]! -= dt;
      }
    }

    // Recover suppression with veterancy bonus
    const baseRecovery = dt * 5;
    const veterancyMultiplier = this.unitData ? (1 + this.unitData.veterancyBonus * this._veterancy) : 1;
    this.recoverSuppression(baseRecovery * veterancyMultiplier);

    // Commander aura
    this.calculateCommanderAura();

    // Timers for entering/exiting/digging
    if (this._isEntering && this._enterTimer > 0) {
      this._enterTimer -= dt;
      if (this._enterTimer <= 0) this.performEnterBuilding();
    }

    if (this._isExiting && this._exitTimer > 0) {
      this._exitTimer -= dt;
      if (this._exitTimer <= 0) this.performExitBuilding();
    }

    if (this._isDigging && this._digTimer > 0) {
      this._digTimer -= dt;
      if (this._digTimer <= 0) this.performCompleteDigIn();
    }

    // Handle routing
    if (this._isRouting) {
      this.processRouting(dt);
      return;
    }

    // Process current command
    switch (this.currentCommand.type) {
      case UnitCommand.Move:
      case UnitCommand.FastMove:
        this.processMovement(dt);
        break;
      case UnitCommand.Reverse:
        this.processReverseMovement(dt);
        break;
      case UnitCommand.Attack:
        this.processAttack(dt);
        break;
      case UnitCommand.AttackMove:
        this.processAttackMove(dt);
        break;
      case UnitCommand.Garrison:
        this.processGarrison(dt);
        break;
      case UnitCommand.Mount:
        this.processMount(dt);
        break;
      case UnitCommand.None:
        this.applyStationarySeparation(dt);
        break;
    }
  }

  // ─── Movement Processing ─────────────────────────────────────

  private processMovement(dt: number): void {
    if (!this.targetPosition) {
      this.completeCommand();
      return;
    }

    // Stuck detection
    const distMoved = this.simPosition.distanceTo(this.lastPosition);
    if (distMoved < 0.1) {
      this.stuckTimer += dt;

      if (this.stuckTimer > 0.5 && this.currentCommand.target && this.hasMovedOnce) {
        const escapeDir = this.findEscapeDirection();
        if (escapeDir && !this.isEscaping) {
          this.isEscaping = true;
          // Clone needed: targetPosition persists across frames
          this.targetPosition = this.simPosition.clone().add(escapeDir);
          this.stuckTimer = 0;
          this.waypoints = [];
          return;
        }

        const currentTime = performance.now() / 1000;
        const timeSinceLastAttempt = currentTime - this.lastPathfindingAttempt;

        if (timeSinceLastAttempt >= this.pathfindingCooldown) {
          this.lastPathfindingAttempt = currentTime;

          let path = this.context.findPath(this.simPosition, this.currentCommand.target);

          if (!path || path.length === 0) {
            const fallback = this.context.findNearestReachablePosition(this.simPosition, this.currentCommand.target, 50);
            if (fallback) {
              path = this.context.findPath(this.simPosition, fallback);
            }
          }

          if (path && path.length > 0) {
            this.waypoints = path;
            this.currentWaypointIndex = 0;
            this.targetPosition = this.waypoints[0]!.clone();
            this.stuckTimer = 0;
            this.isEscaping = false;
          } else {
            this.completeCommand();
            return;
          }
        }
      }
    } else {
      this.stuckTimer = 0;
      this.isEscaping = false;
      this.hasMovedOnce = true;
      this.lastPosition.copy(this.simPosition);
    }

    _moveDir.subVectors(this.targetPosition, this.simPosition);
    _moveDir.y = 0;
    const distance = _moveDir.length();

    const stoppingDistance = this.getCollisionRadius() * 0.8;

    if (distance < stoppingDistance) {
      if (this.waypoints.length > 0 && this.currentWaypointIndex < this.waypoints.length - 1) {
        this.currentWaypointIndex++;
        this.targetPosition = this.waypoints[this.currentWaypointIndex]!.clone();
        return;
      } else {
        this.simPosition.copy(this.targetPosition);
        this.targetPosition = null;
        this.waypoints = [];
        this.currentWaypointIndex = 0;
        this.completeCommand();
        return;
      }
    }

    _moveDir.normalize();

    // Speed adjustment for steep terrain ahead
    let speedMultiplier = 1.0;
    if (this.waypoints.length > 0 && this.currentWaypointIndex < this.waypoints.length - 1 && this.shouldCheckTerrain()) {
      const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1]!;
      const slopeToNext = this.calculateSlopeTo(nextWaypoint);
      if (slopeToNext > 0.7) {
        const steepnessFactor = (slopeToNext - 0.7) / (1.0 - 0.7);
        speedMultiplier = 1.0 - (steepnessFactor * 0.5);
      }
    }

    const moveDistance = this.speed * dt * speedMultiplier;

    // Rotation
    const targetAngle = Math.atan2(_moveDir.x, _moveDir.z);
    const currentAngle = this.simRotationY;
    const angleDiff = THREE.MathUtils.euclideanModulo(
      targetAngle - currentAngle + Math.PI,
      Math.PI * 2
    ) - Math.PI;

    const maxRotation = this.rotationSpeed * dt;
    const rotation = THREE.MathUtils.clamp(angleDiff, -maxRotation, maxRotation);
    this.simRotationY += rotation;

    // Move
    this.velocity.copy(_moveDir).multiplyScalar(moveDistance);

    // Separation
    const separationForce = this.applySeparation();
    if (separationForce.length() > 0) {
      const separationStrength = 0.6;
      separationForce.normalize().multiplyScalar(moveDistance * separationStrength);
      this.velocity.add(separationForce);
    }

    // Slope validation
    if (this.shouldCheckTerrain()) {
      _nextPos.copy(this.simPosition).add(this.velocity);
      const currentHeight = this.context.getElevationAt(this.simPosition.x, this.simPosition.z);
      const nextHeight = this.context.getElevationAt(_nextPos.x, _nextPos.z);
      const horizontalDist = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

      if (horizontalDist > 0.01) {
        const slope = Math.abs(nextHeight - currentHeight) / horizontalDist;
        if (slope > 1.0) {
          this.stuckTimer = 3.0;
          return;
        }
      }
    }

    this.simPosition.add(this.velocity);

    // Height clamping
    const terrainHeight = this.context.getElevationAt(this.simPosition.x, this.simPosition.z);
    const cat = this.unitData?.category ?? 'INF';
    const isAircraft = cat === 'HEL' || cat === 'AIR';

    if (isAircraft) {
      this.simPosition.y = terrainHeight + 20;
    } else {
      this.simPosition.y = terrainHeight;
    }
  }

  private processReverseMovement(dt: number): void {
    if (!this.targetPosition) {
      this.completeCommand();
      return;
    }

    _moveDir.subVectors(this.targetPosition, this.simPosition);
    _moveDir.y = 0;
    const distance = _moveDir.length();

    const stoppingDistance = this.getCollisionRadius() * 0.8;

    if (distance < stoppingDistance) {
      this.simPosition.copy(this.targetPosition);
      this.targetPosition = null;
      this.completeCommand();
      return;
    }

    _moveDir.normalize();
    const moveSpeed = this.speed * 0.5 * dt;

    this.velocity.copy(_moveDir).multiplyScalar(moveSpeed);

    const separationForce = this.applySeparation();
    if (separationForce.length() > 0) {
      const separationStrength = 0.6;
      separationForce.normalize().multiplyScalar(moveSpeed * separationStrength);
      this.velocity.add(separationForce);
    }

    if (this.shouldCheckTerrain()) {
      _nextPos.copy(this.simPosition).add(this.velocity);
      const currentHeight = this.context.getElevationAt(this.simPosition.x, this.simPosition.z);
      const nextHeight = this.context.getElevationAt(_nextPos.x, _nextPos.z);
      const horizontalDist = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

      if (horizontalDist > 0.01) {
        const slope = Math.abs(nextHeight - currentHeight) / horizontalDist;
        if (slope > 1.0) {
          this.targetPosition = null;
          this.completeCommand();
          return;
        }
      }
    }

    this.simPosition.add(this.velocity);

    const terrainHeight = this.context.getElevationAt(this.simPosition.x, this.simPosition.z);
    const cat = this.unitData?.category ?? 'INF';
    const isAircraft = cat === 'HEL' || cat === 'AIR';

    if (isAircraft) {
      this.simPosition.y = terrainHeight + 20;
    } else {
      this.simPosition.y = terrainHeight;
    }
  }

  private processAttackMove(dt: number): void {
    const enemies = this.context.getAllUnits(this.team === 'player' ? 'enemy' : 'player');
    const maxRange = this.getMaxWeaponRange();
    let closestEnemy: SimUnit | null = null;
    let closestDist = Infinity;

    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      const dist = this.simPosition.distanceTo(enemy.simPosition);
      if (dist <= maxRange && dist < closestDist) {
        closestEnemy = enemy;
        closestDist = dist;
      }
    }

    if (closestEnemy) {
      this.processAttack(dt);
    } else {
      this.processMovement(dt);
    }
  }

  private processAttack(dt: number): void {
    const target = this.currentCommand.targetUnit;
    if (!target || target.health <= 0) {
      this.completeCommand();
      return;
    }

    const distance = this.simPosition.distanceTo(target.simPosition);
    const attackRange = this.getMaxWeaponRange();

    if (distance > attackRange) {
      this.targetPosition = target.simPosition.clone();
      this.processMovement(dt);
    } else {
      _moveDir.subVectors(target.simPosition, this.simPosition);
      _moveDir.y = 0;
      const targetAngle = Math.atan2(_moveDir.x, _moveDir.z);
      this.simRotationY = targetAngle;

      if (this.context.rng.next() < dt * 2) {
        target.takeDamage(5);
      }
    }
  }

  private processGarrison(dt: number): void {
    if (!this.targetPosition || this._isEntering) return;

    _moveDir.subVectors(this.targetPosition, this.simPosition);
    _moveDir.y = 0;
    const distance = _moveDir.length();

    if (distance < 5.0) {
      const building = this.context.findNearestBuilding(this.targetPosition, 10);
      if (building && this.context.hasBuildingCapacity(building)) {
        this._isEntering = true;
        this._enterTimer = this.getGarrisonDelay(building);
        this._enterTargetBuilding = building;
        this.velocity.set(0, 0, 0);
      } else {
        this.completeCommand();
      }
      return;
    }

    _moveDir.normalize();
    const moveSpeed = this.speed * dt;
    this.velocity.copy(_moveDir).multiplyScalar(moveSpeed);
    this.simPosition.add(this.velocity);

    const targetAngle = Math.atan2(_moveDir.x, _moveDir.z);
    this.simRotationY = targetAngle;
  }

  private performEnterBuilding(): void {
    if (!this._enterTargetBuilding) {
      this._isEntering = false;
      return;
    }

    const success = this.context.tryGarrison(this, this._enterTargetBuilding);
    this._isEntering = false;
    this._enterTargetBuilding = null;
    this._isDigging = false;

    this.targetPosition = null;
    this.completeCommand();
    if (!success) {
      // Failed to garrison - command already completed
    }
  }

  private performCompleteDigIn(): void {
    if (!this._isDigging) return;

    const building = this.context.spawnDefensiveStructure(this);
    if (building) {
      this.context.tryGarrison(this, building);
    }

    this._isDigging = false;
    this.completeCommand();
  }

  private processMount(dt: number): void {
    if (!this.targetPosition || !this.currentCommand.targetUnit) {
      this.completeCommand();
      return;
    }

    const transport = this.currentCommand.targetUnit;
    _moveDir.subVectors(transport.simPosition, this.simPosition);
    _moveDir.y = 0;
    const distance = _moveDir.length();

    if (distance < 3.0) {
      const success = this.context.tryMount(this, transport);
      this.targetPosition = null;
      this.completeCommand();
      if (!success) {
        // Failed to mount - command already completed
      }
      return;
    }

    _moveDir.normalize();
    const moveSpeed = this.speed * dt;
    this.velocity.copy(_moveDir).multiplyScalar(moveSpeed);
    this.simPosition.add(this.velocity);

    const targetAngle = Math.atan2(_moveDir.x, _moveDir.z);
    this.simRotationY = targetAngle;
  }

  // ─── Routing ─────────────────────────────────────────────────

  private processRouting(dt: number): void {
    const enemies = this.context.getAllUnits(this.team === 'player' ? 'enemy' : 'player');

    if (enemies.length === 0) {
      this._isRouting = false;
      this._morale = 30;
      this.pendingEvents.push({ type: 'rout_recovered' });
      return;
    }

    // Commander rally check
    const allies = this.context.getAllUnits(this.team);
    for (const ally of allies) {
      if (ally.data?.isCommander) {
        const distToCommander = this.simPosition.distanceTo(ally.simPosition);
        const auraRadius = ally.data.commanderAuraRadius || 30;
        if (distToCommander < auraRadius) {
          this._morale += dt * 10;
          if (this._morale >= 30) {
            this._isRouting = false;
            this.pendingEvents.push({ type: 'rallied' });
            return;
          }
        }
      }
    }

    // Flee from enemies
    _testPos.set(0, 0, 0);
    for (const enemy of enemies) {
      _testPos.add(enemy.simPosition);
    }
    _testPos.divideScalar(enemies.length);

    _moveDir.subVectors(this.simPosition, _testPos).normalize();
    // Must clone here: fleeTarget is stored in this.targetPosition which persists across frames
    let fleeTarget = this.simPosition.clone().addScaledVector(_moveDir, 50);

    const coverTarget = this.findNearestCover(_moveDir);
    if (coverTarget) {
      fleeTarget = coverTarget;
    }

    this.targetPosition = fleeTarget;
    this.processMovement(dt);

    // Morale recovery
    const inCover = this.isInCover();
    const hiddenFromEnemies = !this.hasLOSToAnyEnemy();

    let moraleRecoveryRate = dt * 2;
    if (inCover) moraleRecoveryRate *= 2;
    if (hiddenFromEnemies) moraleRecoveryRate *= 2;

    const vetMult = this.unitData ? (1 + this.unitData.veterancyBonus * this._veterancy) : 1;
    moraleRecoveryRate *= vetMult;

    if (this._morale < 30) {
      this._morale += moraleRecoveryRate;
      if (this._morale >= 30) {
        this._isRouting = false;
        this.pendingEvents.push({ type: 'rout_recovered' });
      }
    }
  }

  private findNearestCover(direction: THREE.Vector3): THREE.Vector3 | null {
    const map = this.context.currentMap;
    if (!map) return null;

    const searchRadius = 30;
    const terrain = map.terrain;
    const cellSize = 4;

    for (let dx = -searchRadius; dx <= searchRadius; dx += cellSize) {
      for (let dz = -searchRadius; dz <= searchRadius; dz += cellSize) {
        _testPos.set(this.simPosition.x + dx, 0, this.simPosition.z + dz);

        _perpDir.subVectors(_testPos, this.simPosition).normalize();
        if (_perpDir.dot(direction) < 0) continue;

        const gridX = Math.floor((_testPos.x + map.width / 2) / cellSize);
        const gridZ = Math.floor((_testPos.z + map.height / 2) / cellSize);

        if (gridZ >= 0 && gridZ < terrain.length && gridX >= 0 && gridX < (terrain[0]?.length ?? 0)) {
          const cell = terrain[gridZ]?.[gridX];
          // Clone needed: returned position stored as targetPosition
          if (cell?.type === 'forest') return _testPos.clone();
        }
      }
    }

    for (const building of map.buildings) {
      _testPos.set(building.x, 0, building.z);
      _perpDir.subVectors(_testPos, this.simPosition).normalize();
      if (_perpDir.dot(direction) > 0.5) {
        // Clone needed: returned position stored as targetPosition
        return _testPos.clone().addScaledVector(direction, building.width);
      }
    }

    return null;
  }

  private isInCover(): boolean {
    const map = this.context.currentMap;
    if (!map) return false;

    const cellSize = 4;
    const gridX = Math.floor((this.simPosition.x + map.width / 2) / cellSize);
    const gridZ = Math.floor((this.simPosition.z + map.height / 2) / cellSize);

    const terrain = map.terrain;
    if (gridZ >= 0 && gridZ < terrain.length && gridX >= 0 && gridX < (terrain[0]?.length ?? 0)) {
      const cell = terrain[gridZ]?.[gridX];
      if (cell?.type === 'forest') return true;
    }

    for (const building of map.buildings) {
      const dist = Math.sqrt(
        (this.simPosition.x - building.x) ** 2 +
        (this.simPosition.z - building.z) ** 2
      );
      if (dist < building.width + 2) return true;
    }

    return false;
  }

  private hasLOSToAnyEnemy(): boolean {
    const enemies = this.context.getAllUnits(this.team === 'player' ? 'enemy' : 'player');

    for (const enemy of enemies) {
      const dist = this.simPosition.distanceTo(enemy.simPosition);
      if (dist < 50) {
        if (this.context.isFogOfWarEnabled()) {
          const enemyCanSee = this.context.isPositionVisible(this.simPosition.x, this.simPosition.z);
          if (!enemyCanSee) continue;
        }
        return true;
      }
    }

    return false;
  }

  // ─── Separation ──────────────────────────────────────────────

  private applySeparation(): THREE.Vector3 {
    _sepForce.set(0, 0, 0);
    const collisionRadius = this.getCollisionRadius();
    const checkRadius = collisionRadius * 4;

    const nearbyUnits = this.context.getUnitsInRadius(this.simPosition, checkRadius, this.team);

    for (const other of nearbyUnits) {
      if (other.id === this.id) continue;
      if (other.health <= 0) continue;

      _toOther.subVectors(this.simPosition, other.simPosition);
      _toOther.y = 0;
      const dist = _toOther.length();

      const otherRadius = other.getCollisionRadius();
      const minDist = collisionRadius + otherRadius + 1.0;

      if (dist < minDist && dist > 0.01) {
        _toOther.normalize();

        if (this.shouldCheckTerrain()) {
          const testDistance = 2.0;
          _testPos.copy(this.simPosition).addScaledVector(_toOther, testDistance);
          const slope = this.calculateSlopeTo(_testPos);

          if (slope > 1.0) {
            // Try perpendicular directions to avoid steep terrain
            // Test right perpendicular
            _perpDir.set(-_toOther.z, 0, _toOther.x);
            _testAlt.copy(this.simPosition).addScaledVector(_perpDir, testDistance);
            const slopeRight = this.calculateSlopeTo(_testAlt);

            // Test left perpendicular
            _testAlt.copy(this.simPosition);
            _testAlt.x += _toOther.z * testDistance;
            _testAlt.z += -_toOther.x * testDistance;
            const slopeLeft = this.calculateSlopeTo(_testAlt);

            if (slopeRight <= 1.0 && slopeRight <= slopeLeft) {
              _toOther.set(-_toOther.z, 0, _toOther.x);
            } else if (slopeLeft <= 1.0) {
              _toOther.set(_toOther.z, 0, -_toOther.x);
            } else {
              continue;
            }
          }
        }

        const ratio = (minDist - dist) / minDist;
        const pushStrength = ratio * ratio;
        _sepForce.addScaledVector(_toOther, pushStrength * 2.0);
      }
    }

    return _sepForce;
  }

  private applyStationarySeparation(dt: number): void {
    const separationForce = this.applySeparation();
    if (separationForce.length() > 0.01) {
      const separationSpeed = this.speed * 0.3 * dt;
      separationForce.normalize().multiplyScalar(separationSpeed);

      this.simPosition.add(separationForce);

      const terrainHeight = this.context.getElevationAt(this.simPosition.x, this.simPosition.z);
      const cat = this.unitData?.category ?? 'INF';
      const isAircraft = cat === 'HEL' || cat === 'AIR';

      if (isAircraft) {
        this.simPosition.y = terrainHeight + 20;
      } else {
        this.simPosition.y = terrainHeight;
      }
    }
  }

  // ─── Terrain Helpers ─────────────────────────────────────────

  private shouldCheckTerrain(): boolean {
    const cat = this.unitData?.category ?? 'INF';
    return cat !== 'HEL' && cat !== 'AIR';
  }

  private calculateSlopeTo(targetPos: THREE.Vector3): number {
    const currentHeight = this.context.getElevationAt(this.simPosition.x, this.simPosition.z);
    const targetHeight = this.context.getElevationAt(targetPos.x, targetPos.z);
    const horizontalDist = Math.sqrt(
      (targetPos.x - this.simPosition.x) ** 2 +
      (targetPos.z - this.simPosition.z) ** 2
    );
    if (horizontalDist < 0.01) return 0;
    return Math.abs(targetHeight - currentHeight) / horizontalDist;
  }

  // Static escape directions (allocated once, never GC'd)
  private static readonly ESCAPE_DIRS: readonly THREE.Vector3[] = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 1).normalize(),
    new THREE.Vector3(-1, 0, 1).normalize(),
    new THREE.Vector3(1, 0, -1).normalize(),
    new THREE.Vector3(-1, 0, -1).normalize(),
  ];

  private findEscapeDirection(): THREE.Vector3 | null {
    const escapeDistance = 5;

    for (const dir of SimUnit.ESCAPE_DIRS) {
      _testPos.copy(this.simPosition).addScaledVector(dir, escapeDistance);
      const slope = this.calculateSlopeTo(_testPos);
      if (slope <= 1.0) {
        // Return a new scaled vector (caller stores it as a waypoint)
        return _moveDir.copy(dir).multiplyScalar(escapeDistance);
      }
    }

    return null;
  }

  // ─── Command Completion ──────────────────────────────────────

  private completeCommand(): void {
    if (this.commandQueue.length > 0) {
      const nextCommand = this.commandQueue.shift()!;
      this.currentCommand = nextCommand;
      if (nextCommand.target) {
        this.targetPosition = nextCommand.target;
      }
    } else {
      this.currentCommand = { type: UnitCommand.None };
    }
  }
}
