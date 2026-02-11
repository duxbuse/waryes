/**
 * Unit - Base class for all game units
 *
 * Represents a single controllable unit with:
 * - Position and movement
 * - Health and combat stats
 * - Selection state
 * - Command queue
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { UnitData, WeaponSlot, Building } from '../../data/types';
import { getUnitById, getWeaponById } from '../../data/factions';
import { UnitUI } from '../ui/UnitUI';
import { getUnitMaterial, getWireframeMaterial, getSelectionRingMaterial } from './SharedMaterials';
import { getUnitGeometry, CATEGORY_HEIGHTS, FLYING_ALTITUDES } from '../utils/SharedGeometryCache';
import { gameRNG } from '../utils/DeterministicRNG';
import { LAYERS } from '../utils/LayerConstants';

export interface UnitConfig {
  id: string;
  name: string;
  unitType: string;
  team: 'player' | 'enemy';
  ownerId?: string; // 'player' for human player, 'ally1', 'ally2', etc. for CPU allies
  position: THREE.Vector3;
  maxHealth: number;
  speed: number;
  rotationSpeed: number;
  unitData?: UnitData;
  veterancy?: number; // 0, 1, 2 (trained, hardened, elite)
}

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

interface CommandData {
  type: UnitCommand;
  target?: THREE.Vector3;
  targetUnit?: Unit;
}

export class Unit {
  // Identity
  public readonly id: string;
  public readonly name: string;
  public readonly unitType: string;
  public readonly team: 'player' | 'enemy';
  public readonly ownerId: string; // 'player' for human, 'ally1', 'ally2', etc. for CPU allies

  // Stats
  public readonly maxHealth: number;
  public speed: number; // Mutable to apply veterancy bonuses
  public rotationSpeed: number; // Mutable to apply veterancy bonuses

  // Unit data reference
  private readonly unitData: UnitData | null;

  // Armor values
  private armor = { front: 1, side: 1, rear: 1, top: 0 };

  // Combat
  private weapons: WeaponSlot[] = [];
  private weaponAmmo: number[] = []; // Current ammo per weapon slot (index matches weapons array)
  private weaponCooldowns: number[] = []; // Current cooldown per weapon slot (index matches weapons array)
  private weaponDamageDealt: number[] = []; // Total damage dealt per weapon slot (index matches weapons array)
  private fireRate: number = 1; // shots per second base (mutable for veterancy)

  // Kill tracking
  private _kills: number = 0;
  public readonly cost: number;
  private _veterancy: number = 0; // 0, 1, 2 (trained, hardened, elite)

  // State
  private _health: number;
  private _morale: number = 100;
  private _suppression: number = 0;
  private _isSelected: boolean = false;
  private _isFrozen: boolean = true;
  private _isRouting: boolean = false;
  private _returnFireOnly: boolean = false;
  private _spawnProtectionTimer: number = 0; // Seconds of invulnerability after spawning

  // Commander aura bonus (recalculated each frame)
  private auraBonusMorale: number = 0; // +morale from nearby commanders

  // Transport/Garrison
  private _garrisonedIn: Building | null = null;
  private _mountedIn: Unit | null = null;
  public readonly transportCapacity: number = 0;

  // New states for delayed garrison/digging
  private _isEntering = false;
  private _enterTimer = 0;
  private _enterTargetBuilding: Building | null = null;

  private _isExiting = false;
  private _exitTimer = 0;

  private _isDigging = false;
  private _digTimer = 0;
  private readonly DIG_DURATION = 30.0;

  // Combat caching
  public combatTarget: Unit | null = null;
  public targetScanTimer: number = 0;

  // Voice line throttling (per-unit)
  private lastVoiceLineTime: number = 0;
  private readonly VOICE_LINE_THROTTLE = 2.0; // Max 1 voice per 2 seconds per unit (for orders)
  private lastCombatVoiceLineTime: number = 0;
  private readonly COMBAT_VOICE_LINE_THROTTLE = 5.0; // Max 1 combat voice per 5 seconds per unit

  // UI elements (health bars, morale bars)
  private unitUI: UnitUI | null = null;

  // 3D representation
  public readonly mesh: THREE.Group;
  private readonly bodyMesh: THREE.Mesh;
  private readonly wireframe: THREE.LineSegments;
  private readonly selectionRing: THREE.Mesh;
  private readonly selectionRingMaterial: THREE.MeshBasicMaterial;
  private selectionRingTime: number = 0; // Animation time tracker

  // Movement
  private targetPosition: THREE.Vector3 | null = null;
  private readonly velocity = new THREE.Vector3();
  private waypoints: THREE.Vector3[] = []; // Pathfinding waypoints
  private currentWaypointIndex = 0;
  private stuckTimer = 0; // Track if unit is stuck and needs rerouting
  private lastPosition = new THREE.Vector3();
  private hasMovedOnce = false; // Track if unit has moved at least once (prevents false stuck detection on spawn)
  private lastPathfindingAttempt = 0; // PERFORMANCE: Timestamp of last pathfinding attempt
  private readonly pathfindingCooldown = 1.0; // Cooldown between pathfinding retries (seconds) - reduced from 3.0
  private isEscaping = false; // Flag to indicate unit is executing escape maneuver
  // @ts-expect-error Planned feature - movement modes
  private movementMode: 'normal' | 'fast' | 'reverse' = 'normal';

  // Commands
  private currentCommand: CommandData = { type: UnitCommand.None };
  private commandQueue: CommandData[] = [];

  // Reference to game
  private readonly game: Game;

  constructor(config: UnitConfig, game: Game) {
    this.id = config.id;
    this.name = config.name;
    this.unitType = config.unitType;
    this.team = config.team;
    this.ownerId = config.ownerId ?? (config.team === 'player' ? 'player' : 'enemy');
    this.game = game;

    // Try to get full unit data
    this.unitData = config.unitData ?? getUnitById(config.unitType) ?? null;

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
      this.cost = 100; // Default cost
    }

    this._health = this.maxHealth;

    // Initialize weapon ammo from weapon slots
    this.weaponAmmo = this.weapons.map(w => w.maxAmmo);
    this.weaponCooldowns = this.weapons.map(() => 0);
    this.weaponDamageDealt = this.weapons.map(() => 0);

    // Apply veterancy bonuses
    this.applyVeterancyBonuses();

    // Create 3D mesh group
    this.mesh = new THREE.Group();
    this.mesh.position.copy(config.position);
    this.mesh.userData['unitId'] = this.id;

    // Initialize lastPosition to starting position (for stuck detection)
    this.lastPosition.copy(config.position);

    // Create body mesh (simple box for now)
    const { geometry, height } = this.createGeometry();

    // Use shared material based on team/owner for better batching
    const material = getUnitMaterial(this.team, this.ownerId);
    this.bodyMesh = new THREE.Mesh(geometry, material);
    this.bodyMesh.position.y = height / 2; // Raise mesh so bottom sits on ground
    this.bodyMesh.renderOrder = 999; // Very high to ensure visibility over all terrain/overlays

    // OPTIMIZATION: Set to RAYCAST_ONLY layer - invisible but clickable
    // InstancedUnitRenderer handles actual rendering on RENDER_ONLY layer
    this.bodyMesh.layers.set(LAYERS.RAYCAST_ONLY);

    // Frustum culling enabled - compute proper bounding sphere after positioning
    this.bodyMesh.castShadow = false;
    this.bodyMesh.receiveShadow = false;
    this.mesh.add(this.bodyMesh);
    // Ensure bounding sphere is computed for proper frustum culling
    this.bodyMesh.geometry.computeBoundingSphere();

    // OPTIMIZATION: Wireframe disabled - InstancedUnitRenderer handles it
    // Add wireframe outline for better visibility (shared material, per-unit geometry)
    const wireframeGeometry = new THREE.EdgesGeometry(geometry);
    this.wireframe = new THREE.LineSegments(wireframeGeometry, getWireframeMaterial());
    this.wireframe.position.y = height / 2;
    this.wireframe.renderOrder = 1000; // Render wireframe above body
    this.wireframe.visible = false; // Disabled - instanced renderer handles it
    this.mesh.add(this.wireframe);

    // Create selection ring with per-unit emissive material for glow effect
    const ringGeometry = new THREE.RingGeometry(1.5, 1.8, 32);
    // Create per-unit material with emissive properties for glowing effect
    this.selectionRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.5, // Initial intensity
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    this.selectionRing = new THREE.Mesh(ringGeometry, this.selectionRingMaterial);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);

    // Initialize animation time with random offset (deterministic per unit)
    this.selectionRingTime = gameRNG.next() * Math.PI * 2;

    // Create UI (health bars, morale bars)
    this.unitUI = new UnitUI(this, game);

    // Initialize scan timer with random offset to stagger updates across units (deterministic)
    this.targetScanTimer = gameRNG.next() * 1.0;
  }

  private createGeometry(): { geometry: THREE.BufferGeometry; height: number } {
    // Use shared geometry cache - all units of the same category share geometry
    const category = this.unitData?.category ?? 'INF';
    const geometry = getUnitGeometry(category);

    // For aircraft, height represents 2x the flying altitude (gets halved for position.y)
    const flyingAlt = FLYING_ALTITUDES[category];
    if (flyingAlt !== undefined) {
      return { geometry, height: flyingAlt };
    }

    // For ground units, height is geometry height (bottom sits on ground after position.y = height/2)
    const geometryHeight = CATEGORY_HEIGHTS[category] ?? 2.5;
    return { geometry, height: geometryHeight };
  }

  // Position getter
  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  // Category getter
  get category(): string {
    return this.unitData?.category || 'UNK';
  }

  // Health
  get health(): number {
    return this._health;
  }

  takeDamage(amount: number): void {
    // Spawn protection - unit is invulnerable during this period
    if (this._spawnProtectionTimer > 0) {
      return;
    }

    // Track morale before damage for threshold detection
    const moraleBeforeDamage = this._morale;

    this._health = Math.max(0, this._health - amount);
    if (this._health <= 0) {
      this.onDeath();
      return;
    }

    // Taking damage lowers morale slightly
    const moraleDamage = amount * 0.5; // 50% of health damage affects morale
    this._morale = Math.max(0, this._morale - moraleDamage);

    // Play voice lines based on morale threshold crossings
    if (moraleBeforeDamage >= 50 && this._morale < 50) {
      // Crossed 50% morale threshold - play 'under_fire' voice line
      this.playVoiceLineThrottled('under_fire');
    } else if (moraleBeforeDamage >= 20 && this._morale < 20) {
      // Crossed 20% morale threshold - play 'low_morale' voice line
      this.playVoiceLineThrottled('low_morale');
    }

    // Check for routing due to low morale
    if (this._morale <= 0 && !this._isRouting) {
      this.onRout();
    }
  }

  /**
   * Set spawn protection timer (seconds of invulnerability)
   */
  setSpawnProtection(seconds: number): void {
    this._spawnProtectionTimer = seconds;
  }

  /**
   * Check if unit has spawn protection
   */
  get hasSpawnProtection(): boolean {
    return this._spawnProtectionTimer > 0;
  }

  heal(amount: number): void {
    this._health = Math.min(this.maxHealth, this._health + amount);
  }

  private onDeath(): void {
    // Create destruction effect and sound (if managers exist)
    this.game.visualEffectsManager?.createDestructionEffect(this.position);

    // Play death sound based on unit category
    if (this.unitData) {
      const category = this.unitData.category;
      // Vehicles (tanks, aircraft, etc.) explode with large explosion sound
      const vehicleCategories: string[] = ['TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];

      if (vehicleCategories.includes(category)) {
        // Large explosion for vehicles
        this.game.audioManager?.playImpactSound('vehicle_explosion', this.position, 1.0);
      } else {
        // Softer death sound for infantry and logistics
        this.game.audioManager?.playSound('unit_death');
      }
    } else {
      // Fallback to generic death sound if no unit data
      this.game.audioManager?.playSound('unit_death');
    }

    // Cleanup
    this.game.unitManager?.destroyUnit(this);
  }

  // Morale
  get morale(): number {
    return this._morale;
  }

  suppressMorale(amount: number): void {
    // Track morale before suppression for threshold detection
    const moraleBeforeSuppression = this._morale;

    this._morale = Math.max(0, this._morale - amount);

    // Play voice lines based on morale threshold crossings
    if (moraleBeforeSuppression >= 50 && this._morale < 50) {
      // Crossed 50% morale threshold - play 'under_fire' voice line
      this.playVoiceLineThrottled('under_fire');
    } else if (moraleBeforeSuppression >= 20 && this._morale < 20) {
      // Crossed 20% morale threshold - play 'low_morale' voice line
      this.playVoiceLineThrottled('low_morale');
    }

    // Check for routing
    if (this._morale <= 0 && !this._isRouting) {
      this.onRout();
    }
  }

  private onRout(): void {
    this._isRouting = true;

    // Play retreating voice line
    this.playVoiceLineThrottled('retreating');

    // Clear commands and flee
    this.clearCommands();
    console.log(`${this.name} is routing!`);
  }

  recoverMorale(amount: number): void {
    if (this._isRouting) return;
    this._morale = Math.min(100, this._morale + amount);
  }

  /**
   * Calculate morale bonus from nearby commanders
   * Commanders provide +10 morale within their aura radius
   */
  private calculateCommanderAura(): void {
    this.auraBonusMorale = 0;

    if (!this.unitData) return;

    // Use spatial query for efficiency - max commander aura radius is ~100m
    const MAX_AURA_RADIUS = 100;
    const nearbyUnits = this.game.unitManager.getUnitsInRadius(
      this.position,
      MAX_AURA_RADIUS,
      this.team
    );

    for (const unit of nearbyUnits) {
      // Skip self, units without data, and non-commanders
      if (unit === this || !unit.unitData || !unit.unitData.isCommander) continue;

      const auraRadius = unit.unitData.commanderAuraRadius;
      if (auraRadius <= 0) continue;

      // Check distance
      const distance = this.position.distanceTo(unit.position);
      if (distance <= auraRadius) {
        this.auraBonusMorale += 10; // +10 morale per commander
      }
    }

    // Apply aura bonus to morale recovery (faster recovery when near commanders)
    if (this.auraBonusMorale > 0 && this._morale < 100 && !this._isRouting) {
      this._morale = Math.min(100, this._morale + this.auraBonusMorale * 0.01); // Small per-frame bonus
    }
  }

  get suppression(): number {
    return this._suppression;
  }

  addSuppression(amount: number): void {
    this._suppression = Math.min(100, this._suppression + amount);
  }

  recoverSuppression(amount: number): void {
    this._suppression = Math.max(0, this._suppression - amount);
  }

  // Armor getters
  getArmor(facing: 'front' | 'side' | 'rear' | 'top'): number {
    return this.armor[facing];
  }

  // Weapon getters
  getWeapons(): WeaponSlot[] {
    return this.weapons;
  }

  getMaxWeaponRange(): number {
    let maxRange = 0;
    for (const slot of this.weapons) {
      const weapon = getWeaponById(slot.weaponId);
      if (weapon && weapon.range > maxRange) {
        maxRange = weapon.range;
      }
    }
    return maxRange || 20; // Default range
  }

  /**
   * Check if ANY weapon can fire (wrapper for backward compatibility)
   */
  canFire(): boolean {
    if (this._isRouting || this._suppression >= 80) return false;
    // Check if any weapon has cooled down
    for (let i = 0; i < this.weaponCooldowns.length; i++) {
      if (this.weaponCooldowns[i] <= 0) return true;
    }
    return false;
  }

  /**
   * Reset fire cooldown for all weapons (legacy method for backward compatibility)
   * @deprecated Use resetWeaponCooldown(weaponIndex, weaponId) instead
   */
  resetFireCooldown(): void {
    // Reset all weapon cooldowns based on their individual rates of fire
    for (let i = 0; i < this.weapons.length; i++) {
      const weapon = getWeaponById(this.weapons[i]!.weaponId);
      if (weapon && weapon.rateOfFire > 0) {
        this.weaponCooldowns[i] = 60 / weapon.rateOfFire;
      }
    }
  }

  // Per-weapon cooldown management
  /**
   * Get current cooldown for a weapon slot
   */
  getWeaponCooldown(weaponIndex: number): number {
    return this.weaponCooldowns[weaponIndex] ?? 0;
  }

  /**
   * Check if a specific weapon can fire (checks cooldown, routing, suppression)
   */
  canWeaponFire(weaponIndex: number): boolean {
    const cooldown = this.weaponCooldowns[weaponIndex] ?? 0;
    return cooldown <= 0 && !this._isRouting && this._suppression < 80;
  }

  /**
   * Reset cooldown for a specific weapon based on its rate of fire
   */
  resetWeaponCooldown(weaponIndex: number, weaponId: string): void {
    const weapon = getWeaponById(weaponId);
    if (weapon && weapon.rateOfFire > 0) {
      // Convert rate of fire (rounds per minute) to cooldown (seconds)
      this.weaponCooldowns[weaponIndex] = 60 / weapon.rateOfFire;
    }
  }

  /**
   * Get total damage dealt by a weapon slot
   */
  getWeaponDamageDealt(weaponIndex: number): number {
    return this.weaponDamageDealt[weaponIndex] ?? 0;
  }

  /**
   * Add damage to a weapon's damage tracking
   */
  addWeaponDamage(weaponIndex: number, damage: number): void {
    if (weaponIndex >= 0 && weaponIndex < this.weaponDamageDealt.length) {
      this.weaponDamageDealt[weaponIndex] += damage;
    }
  }

  // Weapon ammunition management
  /**
   * Get current ammo for a weapon slot
   */
  getWeaponAmmo(weaponIndex: number): number {
    return this.weaponAmmo[weaponIndex] ?? 0;
  }

  /**
   * Get max ammo for a weapon slot
   */
  getWeaponMaxAmmo(weaponIndex: number): number {
    return this.weapons[weaponIndex]?.maxAmmo ?? 0;
  }

  /**
   * Check if a weapon has ammo
   */
  hasWeaponAmmo(weaponIndex: number): boolean {
    return (this.weaponAmmo[weaponIndex] ?? 0) > 0;
  }

  /**
   * Use ammo from a weapon. Returns true if successful.
   */
  useWeaponAmmo(weaponIndex: number, amount: number = 1): boolean {
    const current = this.weaponAmmo[weaponIndex] ?? 0;
    if (current < amount) return false;
    this.weaponAmmo[weaponIndex] = current - amount;
    return true;
  }

  /**
   * Resupply a specific weapon to full ammo
   */
  resupplyWeapon(weaponIndex: number): void {
    const weapon = this.weapons[weaponIndex];
    if (weapon) {
      this.weaponAmmo[weaponIndex] = weapon.maxAmmo;
    }
  }

  /**
   * Resupply all weapons to full ammo (called by logistics/supply system)
   */
  resupplyAllWeapons(): void {
    this.weaponAmmo = this.weapons.map(w => w.maxAmmo);
    this.weaponCooldowns = this.weapons.map(() => 0);
  }

  /**
   * Find a smoke weapon on this unit and return its index, or -1 if none
   */
  findSmokeWeaponIndex(): number {
    return this.weapons.findIndex(w => {
      const weaponData = getWeaponById(w.weaponId);
      return weaponData?.smokeEffect !== undefined;
    });
  }

  /**
   * Check if unit has smoke capability with ammo
   */
  hasSmokeAmmo(): boolean {
    const smokeIndex = this.findSmokeWeaponIndex();
    return smokeIndex >= 0 && this.hasWeaponAmmo(smokeIndex);
  }

  /**
   * Use one smoke charge. Returns true if successful.
   */
  useSmoke(): boolean {
    const smokeIndex = this.findSmokeWeaponIndex();
    if (smokeIndex < 0) return false;
    return this.useWeaponAmmo(smokeIndex);
  }

  /**
   * Get smoke type based on weapon data (defaults to grenade for infantry)
   */
  getSmokeType(): 'grenade' | 'launcher' | 'artillery' {
    const smokeIndex = this.findSmokeWeaponIndex();
    if (smokeIndex >= 0) {
      const weaponData = getWeaponById(this.weapons[smokeIndex]!.weaponId);
      // Determine type by radius: grenade (5m), launcher (15m), artillery (50m)
      const radius = weaponData?.smokeEffect?.radius ?? 5;
      if (radius >= 40) return 'artillery';
      if (radius >= 10) return 'launcher';
    }
    return 'grenade';
  }

  /**
   * Apply veterancy bonuses to unit stats
   * Veterancy 0 (trained): No bonus
   * Veterancy 1 (hardened): 1x bonus
   * Veterancy 2 (elite): 2x bonus
   */
  private applyVeterancyBonuses(): void {
    if (!this.unitData || this.veterancy === 0) return;

    const bonusMultiplier = this.unitData.veterancyBonus * this.veterancy;

    // Increase accuracy (reduce spread/improve fire rate)
    this.fireRate *= (1 + bonusMultiplier * 0.5); // +5-10% fire rate

    // Increase morale resistance (faster recovery)
    // Applied in update() loop

    // Slightly increase speed (better maneuvering)
    this.speed *= (1 + bonusMultiplier * 0.2); // +2-4% speed
    this.rotationSpeed *= (1 + bonusMultiplier * 0.3); // +3-6% rotation

    // Note: Morale recovery bonus is applied in the update() method
  }

  /**
   * Called when unit gains a veterancy level during combat
   */
  private onVeterancyGained(): void {
    if (!this.unitData) return;

    const bonusMultiplier = this.unitData.veterancyBonus;

    // Apply incremental stat bonuses (since this is called on level up)
    this.fireRate *= (1 + bonusMultiplier * 0.5);
    this.speed *= (1 + bonusMultiplier * 0.2);
    this.rotationSpeed *= (1 + bonusMultiplier * 0.3);

    // Heal unit partially on veterancy gain (reward for good performance)
    this.heal(this.maxHealth * 0.2); // Heal 20% of max health
    this._morale = Math.min(100, this._morale + 30); // Boost morale

    // Recreate UI to show new veterancy stars
    if (this.unitUI) {
      this.unitUI.destroy();
      this.unitUI = new UnitUI(this, this.game);
    }

    const rankName = this.veterancy === 1 ? 'Hardened' : 'Elite';
    console.log(`${this.name} promoted to ${rankName}! (${this._kills} kills)`);
  }

  // Return fire only mode
  get returnFireOnly(): boolean {
    return this._returnFireOnly;
  }

  setReturnFireOnly(value: boolean): void {
    this._returnFireOnly = value;
  }

  // Routing state
  get isRouting(): boolean {
    return this._isRouting;
  }

  // Unit data (read-only access)
  get data(): UnitData | null {
    return this.unitData;
  }

  // Kill tracking
  get kills(): number {
    return this._kills;
  }

  get veterancy(): number {
    return this._veterancy;
  }

  addKill(): void {
    this._kills++;

    // Check for veterancy progression
    // 3 kills = Hardened (veterancy 1)
    // 7 kills = Elite (veterancy 2)
    const oldVeterancy = this._veterancy;

    if (this._kills >= 7 && this._veterancy < 2) {
      this._veterancy = 2;
    } else if (this._kills >= 3 && this._veterancy < 1) {
      this._veterancy = 1;
    }

    // If veterancy increased, apply new bonuses
    if (this._veterancy > oldVeterancy) {
      this.onVeterancyGained();
    }
  }

  // Selection
  get isSelected(): boolean {
    return this._isSelected;
  }

  setSelected(selected: boolean): void {
    this._isSelected = selected;
    this.selectionRing.visible = selected;
  }

  // Frozen state (setup phase)
  get isFrozen(): boolean {
    return this._isFrozen;
  }

  setFrozen(frozen: boolean): void {
    this._isFrozen = frozen;
  }

  // Getters for new states
  get isDigging(): boolean { return this._isDigging; }
  get isEntering(): boolean { return this._isEntering; }
  get isExiting(): boolean { return this._isExiting; }

  // Dig in command
  setDigInCommand(): void {
    const category = this.unitData?.category ?? 'INF';
    if (category !== 'INF') return;

    this.clearCommands();
    this.currentCommand = { type: UnitCommand.DigIn };
    this._isDigging = true;
    this._digTimer = this.DIG_DURATION;

    // Stop movement
    this.targetPosition = null;
  }

  /**
   * Play voice line with per-unit throttling
   */
  private playVoiceLineThrottled(voiceType: 'move_order' | 'attack_order' | 'under_fire' | 'low_morale' | 'retreating'): void {
    const currentTime = performance.now() / 1000;

    // Use different throttle times for command orders vs combat voice lines
    const isCombatVoice = voiceType === 'under_fire' || voiceType === 'low_morale' || voiceType === 'retreating';

    if (isCombatVoice) {
      // Combat voice lines use 5-second throttle
      if (currentTime - this.lastCombatVoiceLineTime < this.COMBAT_VOICE_LINE_THROTTLE) {
        return; // Throttled - skip voice line
      }
      this.lastCombatVoiceLineTime = currentTime;
    } else {
      // Command voice lines use 2-second throttle
      if (currentTime - this.lastVoiceLineTime < this.VOICE_LINE_THROTTLE) {
        return; // Throttled - skip voice line
      }
      this.lastVoiceLineTime = currentTime;
    }

    // Play voice line via AudioManager
    this.game.audioManager?.playVoiceLine(voiceType, this.position);
  }

  /**
   * Build full command queue for path visualization
   * Includes current command + all queued commands
   */
  private buildFullCommandQueue(): Array<{ type: string; target?: THREE.Vector3 }> {
    const fullQueue: Array<{ type: string; target?: THREE.Vector3 }> = [];

    // Add current command if it has a target or targetUnit
    if (this.currentCommand.type !== UnitCommand.None) {
      if (this.currentCommand.target) {
        fullQueue.push({
          type: this.currentCommand.type,
          target: this.currentCommand.target
        });
      } else if (this.currentCommand.targetUnit) {
        // Convert targetUnit to position for visualization
        fullQueue.push({
          type: this.currentCommand.type,
          target: this.currentCommand.targetUnit.position.clone()
        });
      }
    }

    // Add all queued commands with targets or targetUnits
    for (const cmd of this.commandQueue) {
      if (cmd.target) {
        fullQueue.push({
          type: cmd.type,
          target: cmd.target
        });
      } else if (cmd.targetUnit) {
        // Convert targetUnit to position for visualization
        fullQueue.push({
          type: cmd.type,
          target: cmd.targetUnit.position.clone()
        });
      }
    }

    return fullQueue;
  }

  // Movement commands
  setMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Move, target: target.clone() };

    // Play move acknowledgment voice line
    this.playVoiceLineThrottled('move_order');

    // Use pathfinding to find route
    const path = this.game.pathfindingManager.findPath(this.position, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      // No path found - try to get close instead of walking into obstacles
      // Note: Reduced console spam - fallback is handled silently in most cases

      const fallbackTarget = this.game.pathfindingManager.findNearestReachablePosition(
        this.position,
        target,
        50  // max 50m search radius
      );

      if (fallbackTarget) {
        const fallbackPath = this.game.pathfindingManager.findPath(this.position, fallbackTarget);
        if (fallbackPath && fallbackPath.length > 0) {
          this.waypoints = fallbackPath;
          this.currentWaypointIndex = 0;
          this.targetPosition = this.waypoints[0]!.clone();
          this.stuckTimer = 0;
        } else {
          // Fallback path also failed - cancel command
          this.currentCommand = { type: UnitCommand.None };
          this.targetPosition = null;
          this.waypoints = [];
        }
      } else {
        // Completely unreachable - cancel command instead of walking into obstacle
        this.currentCommand = { type: UnitCommand.None };
        this.targetPosition = null;
        this.waypoints = [];
      }
    }

    // Update path visualization with single command (not full queue - that's only for shift-queue)
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'move');
    }
  }

  queueMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Move, target: target.clone() });

      // Update path visualization with full queue
      if (this.game.pathRenderer) {
        const fullQueue = this.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  // Attack commands
  setAttackCommand(target: Unit): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Attack, targetUnit: target };

    // Play attack acknowledgment voice line
    this.playVoiceLineThrottled('attack_order');

    // Update path visualization with single command (not full queue - that's only for shift-queue)
    // For attack commands, we convert targetUnit to target position for visualization
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target.position, 'attack');
    }
  }

  queueAttackCommand(target: Unit): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setAttackCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Attack, targetUnit: target });

      // Update path visualization with full queue
      if (this.game.pathRenderer) {
        const fullQueue = this.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  // Fast move commands
  setFastMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.FastMove, target: target.clone() };

    // Play move acknowledgment voice line
    this.playVoiceLineThrottled('move_order');

    // Use pathfinding to find route
    const path = this.game.pathfindingManager.findPath(this.position, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      // No path found - try to get close instead of walking into obstacles

      const fallbackTarget = this.game.pathfindingManager.findNearestReachablePosition(
        this.position,
        target,
        50
      );

      if (fallbackTarget) {
        const fallbackPath = this.game.pathfindingManager.findPath(this.position, fallbackTarget);
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

    // Update path visualization with single command (not full queue - that's only for shift-queue)
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'fast');
    }
  }

  queueFastMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setFastMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.FastMove, target: target.clone() });

      // Update path visualization with full queue
      if (this.game.pathRenderer) {
        const fullQueue = this.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  // Reverse commands
  setReverseCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Reverse, target: target.clone() };

    // Play move acknowledgment voice line
    this.playVoiceLineThrottled('move_order');

    // Use pathfinding to find route
    const path = this.game.pathfindingManager.findPath(this.position, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      // No path found - try to get close instead of walking into obstacles

      const fallbackTarget = this.game.pathfindingManager.findNearestReachablePosition(
        this.position,
        target,
        50
      );

      if (fallbackTarget) {
        const fallbackPath = this.game.pathfindingManager.findPath(this.position, fallbackTarget);
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

    // Update path visualization with single command (not full queue - that's only for shift-queue)
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'reverse');
    }
  }

  queueReverseCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setReverseCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Reverse, target: target.clone() });

      // Update path visualization with full queue
      if (this.game.pathRenderer) {
        const fullQueue = this.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  // Attack-move commands
  setAttackMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.AttackMove, target: target.clone() };

    // Play attack acknowledgment voice line (attack-move is aggressive)
    this.playVoiceLineThrottled('attack_order');

    // Use pathfinding to find route
    const path = this.game.pathfindingManager.findPath(this.position, target);

    if (path && path.length > 0) {
      this.waypoints = path;
      this.currentWaypointIndex = 0;
      this.targetPosition = this.waypoints[0]!.clone();
      this.stuckTimer = 0;
    } else {
      // No path found - try to get close instead of walking into obstacles

      const fallbackTarget = this.game.pathfindingManager.findNearestReachablePosition(
        this.position,
        target,
        50
      );

      if (fallbackTarget) {
        const fallbackPath = this.game.pathfindingManager.findPath(this.position, fallbackTarget);
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

    // Update path visualization with single command (not full queue - that's only for shift-queue)
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'attackMove');
    }
  }

  queueAttackMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setAttackMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.AttackMove, target: target.clone() });

      // Update path visualization with full queue
      if (this.game.pathRenderer) {
        const fullQueue = this.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  // Garrison commands
  setGarrisonCommand(building: Building): void {
    const buildingPos = new THREE.Vector3(building.x, 0, building.z);
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Garrison, target: buildingPos };
    this.targetPosition = buildingPos;

    // Update path visualization with single command (not full queue - that's only for shift-queue)
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, buildingPos, 'garrison');
    }
  }

  // Ungarrison command (no target needed, exits current building)
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

    // BuildingManager will handle the actual exit
    const exitPos = this.game.buildingManager.ungarrison(this, this._garrisonedIn);
    if (exitPos) {
      this._garrisonedIn = null;
      this._isExiting = false;
      this.position.copy(exitPos);
      this.mesh.position.copy(exitPos);
      this.targetPosition = null;
      this.completeCommand();
    }
  }

  private getGarrisonDelay(_building: Building): number {
    // Check weapons for "heavy" tag
    if (this.unitData?.category === 'INF') {
      for (const slot of this.weapons) {
        const weapon = getWeaponById(slot.weaponId);
        if (weapon && (weapon as any).tags?.includes('heavy')) {
          return 5.0;
        }
      }
    }
    return 2.0;
  }

  // Check if garrisoned
  get isGarrisoned(): boolean {
    return this._garrisonedIn !== null;
  }

  get garrisonedBuilding(): Building | null {
    return this._garrisonedIn;
  }

  // Set garrison state (called by BuildingManager)
  setGarrisonedIn(building: Building | null): void {
    this._garrisonedIn = building;
  }

  // Mount commands (transport)
  setMountCommand(transport: Unit): void {
    const transportPos = transport.position.clone();
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Mount, target: transportPos, targetUnit: transport };
    this.targetPosition = transportPos;

    // Update path visualization with single command (not full queue - that's only for shift-queue)
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, transportPos, 'mount');
    }
  }

  // Unload command (for transports to unload passengers)
  setUnloadCommand(): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Unload };

    // TransportManager will handle the actual unload
    const passengers = this.game.transportManager.unloadAll(this);

    // Give each passenger a small move command to spread out (deterministic)
    for (const passenger of passengers) {
      const offset = new THREE.Vector3(
        (gameRNG.next() - 0.5) * 5,
        0,
        (gameRNG.next() - 0.5) * 5
      );
      const moveTarget = passenger.position.clone().add(offset);
      passenger.setMoveCommand(moveTarget);
    }

    this.completeCommand();
  }

  // Check if mounted in transport
  get isMounted(): boolean {
    return this._mountedIn !== null;
  }

  get mountedIn(): Unit | null {
    return this._mountedIn;
  }

  // Set mounted state (called by TransportManager)
  setMountedIn(transport: Unit | null): void {
    this._mountedIn = transport;
  }

  // Clear all commands
  clearCommands(): void {
    this.currentCommand = { type: UnitCommand.None };
    this.commandQueue = [];
    this.targetPosition = null;
  }

  /**
   * Fixed timestep update for game logic
   */
  fixedUpdate(dt: number): void {
    if (this._isFrozen) return;

    // Update weapon cooldowns
    for (let i = 0; i < this.weaponCooldowns.length; i++) {
      if (this.weaponCooldowns[i] > 0) {
        this.weaponCooldowns[i] -= dt;
      }
    }

    // Recover suppression over time (with veterancy bonus)
    const baseRecovery = dt * 5;
    const veterancyMultiplier = this.unitData ? (1 + this.unitData.veterancyBonus * this.veterancy) : 1;
    this.recoverSuppression(baseRecovery * veterancyMultiplier);

    // Calculate commander aura bonuses
    this.calculateCommanderAura();

    // Handle Timers for entering/exiting/digging
    if (this._isEntering && this._enterTimer > 0) {
      this._enterTimer -= dt;
      if (this._enterTimer <= 0) {
        this.performEnterBuilding();
      }
    }

    if (this._isExiting && this._exitTimer > 0) {
      this._exitTimer -= dt;
      if (this._exitTimer <= 0) {
        this.performExitBuilding();
      }
    }

    if (this._isDigging && this._digTimer > 0) {
      this._digTimer -= dt;
      if (this._digTimer <= 0) {
        this.performCompleteDigIn();
      }
    }

    // Handle routing behavior
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
        // Apply separation even when stationary to prevent units from being pushed into each other
        this.applyStationarySeparation(dt);
        break;
    }
  }

  private processRouting(dt: number): void {
    // Move away from enemies
    const enemies = this.game.unitManager.getAllUnits(
      this.team === 'player' ? 'enemy' : 'player'
    );

    if (enemies.length === 0) {
      // No enemies, recover
      this._isRouting = false;
      this._morale = 30;
      return;
    }

    // Check for nearby commander - rally by commander restores control
    const allies = this.game.unitManager.getAllUnits(this.team);
    for (const ally of allies) {
      if (ally.data?.isCommander) {
        const distToCommander = this.position.distanceTo(ally.position);
        const auraRadius = ally.data.commanderAuraRadius || 30;
        if (distToCommander < auraRadius) {
          // Commander nearby - rally faster
          this._morale += dt * 10; // Fast morale recovery near commander
          if (this._morale >= 30) {
            this._isRouting = false;
            console.log(`${this.name} rallied by commander!`);
            return;
          }
        }
      }
    }

    // Find average enemy position
    const avgPos = new THREE.Vector3();
    for (const enemy of enemies) {
      avgPos.add(enemy.position);
    }
    avgPos.divideScalar(enemies.length);

    // Try to find cover (forest or building) to flee towards
    const fleeDir = this.position.clone().sub(avgPos).normalize();
    let fleeTarget = this.position.clone().add(fleeDir.multiplyScalar(50));

    // Look for cover in the flee direction
    const coverTarget = this.findNearestCover(fleeDir);
    if (coverTarget) {
      fleeTarget = coverTarget;
    }

    this.targetPosition = fleeTarget;
    this.processMovement(dt);

    // Check if we're in cover (hidden from enemies)
    const inCover = this.isInCover();
    const hiddenFromEnemies = !this.hasLOSToAnyEnemy();

    // Faster morale recovery when in cover and hidden
    let moraleRecoveryRate = dt * 2; // Base recovery
    if (inCover) moraleRecoveryRate *= 2; // Double in cover
    if (hiddenFromEnemies) moraleRecoveryRate *= 2; // Double when hidden

    // Apply veterancy bonus
    const veterancyMultiplier = this.unitData ? (1 + this.unitData.veterancyBonus * this.veterancy) : 1;
    moraleRecoveryRate *= veterancyMultiplier;

    if (this._morale < 30) {
      this._morale += moraleRecoveryRate;
      if (this._morale >= 30) {
        this._isRouting = false;
        console.log(`${this.name} recovered from routing!`);
      }
    }
  }

  /**
   * Find nearest cover (forest or building) in the given direction
   */
  private findNearestCover(direction: THREE.Vector3): THREE.Vector3 | null {
    const map = this.game.currentMap;
    if (!map) return null;

    // Search in a cone in the flee direction
    const searchRadius = 30;

    // Check for forest cover
    const terrain = map.terrain;
    const cellSize = 4;

    for (let dx = -searchRadius; dx <= searchRadius; dx += cellSize) {
      for (let dz = -searchRadius; dz <= searchRadius; dz += cellSize) {
        const checkPos = new THREE.Vector3(
          this.position.x + dx,
          0,
          this.position.z + dz
        );

        // Check if in the right direction (within 90 degrees of flee direction)
        const toCheck = checkPos.clone().sub(this.position).normalize();
        if (toCheck.dot(direction) < 0) continue; // Behind us

        // Convert to terrain grid
        const gridX = Math.floor((checkPos.x + map.width / 2) / cellSize);
        const gridZ = Math.floor((checkPos.z + map.height / 2) / cellSize);

        if (gridZ >= 0 && gridZ < terrain.length && gridX >= 0 && gridX < (terrain[0]?.length ?? 0)) {
          const cell = terrain[gridZ]?.[gridX];
          if (cell?.type === 'forest') {
            return checkPos; // Return first forest found in flee direction
          }
        }
      }
    }

    // Check for building cover
    for (const building of map.buildings) {
      const buildingPos = new THREE.Vector3(building.x, 0, building.z);
      const toBuild = buildingPos.clone().sub(this.position).normalize();

      // Check if building is in flee direction
      if (toBuild.dot(direction) > 0.5) {
        // Move to behind the building (opposite side from enemies)
        const coverPos = buildingPos.clone().add(direction.clone().multiplyScalar(building.width));
        return coverPos;
      }
    }

    return null;
  }

  /**
   * Check if unit is currently in cover
   */
  private isInCover(): boolean {
    const map = this.game.currentMap;
    if (!map) return false;

    // Check if in forest
    const cellSize = 4;
    const gridX = Math.floor((this.position.x + map.width / 2) / cellSize);
    const gridZ = Math.floor((this.position.z + map.height / 2) / cellSize);

    const terrain = map.terrain;
    if (gridZ >= 0 && gridZ < terrain.length && gridX >= 0 && gridX < (terrain[0]?.length ?? 0)) {
      const cell = terrain[gridZ]?.[gridX];
      if (cell?.type === 'forest') return true;
    }

    // Check if near building
    for (const building of map.buildings) {
      const dist = Math.sqrt(
        (this.position.x - building.x) ** 2 +
        (this.position.z - building.z) ** 2
      );
      if (dist < building.width + 2) return true; // Near building
    }

    return false;
  }

  /**
   * Check if any enemy has line of sight to this unit
   */
  private hasLOSToAnyEnemy(): boolean {
    const enemies = this.game.unitManager.getAllUnits(
      this.team === 'player' ? 'enemy' : 'player'
    );

    for (const enemy of enemies) {
      // Simple distance check for now (fog of war handles detailed LOS)
      const dist = this.position.distanceTo(enemy.position);
      if (dist < 50) { // Within typical vision range
        // Check if fog of war blocks LOS
        if (this.game.fogOfWarManager.isEnabled()) {
          // If we're not visible to enemy, they can't see us
          const enemyCanSee = this.game.fogOfWarManager.isVisible(
            this.position.x, this.position.z
          );
          if (!enemyCanSee) continue; // Enemy can't see us
        }
        return true; // Enemy has LOS
      }
    }

    return false;
  }

  private processReverseMovement(dt: number): void {
    if (!this.targetPosition) {
      this.completeCommand();
      return;
    }

    const direction = this.targetPosition.clone().sub(this.mesh.position);
    direction.y = 0;
    const distance = direction.length();

    // Use collision radius for stopping distance
    const stoppingDistance = this.getCollisionRadius() * 0.8;

    if (distance < stoppingDistance) {
      this.mesh.position.copy(this.targetPosition);
      this.targetPosition = null;
      this.completeCommand();
      return;
    }

    // Move backwards (slower)
    direction.normalize();
    const moveSpeed = this.speed * 0.5 * dt;

    // Keep facing original direction while moving backwards
    this.velocity.copy(direction).multiplyScalar(moveSpeed);

    // Apply separation force to avoid unit overlap
    const separationForce = this.applySeparation();
    if (separationForce.length() > 0) {
      const separationStrength = 0.6; // Match forward movement (was 0.3)
      separationForce.normalize().multiplyScalar(moveSpeed * separationStrength);
      this.velocity.add(separationForce);
    }

    // Slope validation (BEFORE movement)
    if (this.shouldCheckTerrain()) {
      const nextPos = this.mesh.position.clone().add(this.velocity);
      const currentHeight = this.game.getElevationAt(this.mesh.position.x, this.mesh.position.z);
      const nextHeight = this.game.getElevationAt(nextPos.x, nextPos.z);
      const horizontalDist = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

      if (horizontalDist > 0.01) {
        const slope = Math.abs(nextHeight - currentHeight) / horizontalDist;
        const MAX_SLOPE = 1.0; // 45 degrees

        if (slope > MAX_SLOPE) {
          this.targetPosition = null;
          this.completeCommand();
          return;
        }
      }
    }

    this.mesh.position.add(this.velocity);

    // Height clamping (AFTER movement)
    const terrainHeight = this.game.getElevationAt(this.mesh.position.x, this.mesh.position.z);
    const category = this.unitData?.category ?? 'INF';
    const isAircraft = category === 'HEL' || category === 'AIR';

    if (isAircraft) {
      // Aircraft maintain altitude above terrain
      this.mesh.position.y = terrainHeight + 20; // HELICOPTER_FLIGHT_ALTITUDE
    } else {
      // Ground units clamp to terrain
      this.mesh.position.y = terrainHeight;
    }
  }

  private processAttackMove(dt: number): void {
    // Check for enemies in range
    const enemies = this.game.unitManager.getAllUnits(
      this.team === 'player' ? 'enemy' : 'player'
    );

    const maxRange = this.getMaxWeaponRange();
    let closestEnemy: Unit | null = null;
    let closestDist = Infinity;

    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      const dist = this.position.distanceTo(enemy.position);
      if (dist <= maxRange && dist < closestDist) {
        closestEnemy = enemy;
        closestDist = dist;
      }
    }

    if (closestEnemy) {
      // Engage enemy
      this.processAttack(dt);
    } else {
      // Continue moving
      this.processMovement(dt);
    }
  }

  /**
   * Get collision radius for this unit based on category
   */
  private getCollisionRadius(): number {
    const category = this.unitData?.category ?? 'INF';
    // Increased radii to give more spacing and prevent overlap
    if (category === 'TNK') return 3.5; // Tanks are larger (was 2.5)
    if (category === 'VHC' || category === 'REC') return 3.0; // Vehicles (was 2.0)
    if (category === 'ART' || category === 'LOG') return 3.5; // Artillery and logistics (was 2.5)
    return 2.5; // Infantry and others (was 1.5)
  }

  /**
   * Apply separation force to avoid overlapping with nearby units
   */
  private applySeparation(): THREE.Vector3 {
    const separationForce = new THREE.Vector3();
    const collisionRadius = this.getCollisionRadius();
    const checkRadius = collisionRadius * 4; // Check within 4x radius (was 3x)

    // Get nearby same-team units
    const nearbyUnits = this.game.unitManager.getUnitsInRadius(
      this.position,
      checkRadius,
      this.team
    );

    for (const other of nearbyUnits) {
      if (other.id === this.id) continue;
      if (other.health <= 0) continue;

      const toOther = new THREE.Vector3().subVectors(this.position, other.position);
      toOther.y = 0; // Only horizontal separation
      const dist = toOther.length();

      const otherRadius = other.getCollisionRadius();
      // Add 1m spacing buffer to prevent units from touching
      const minDist = collisionRadius + otherRadius + 1.0;

      // If too close, push away
      if (dist < minDist && dist > 0.01) {
        toOther.normalize();

        // TERRAIN AWARENESS: Validate push direction against terrain
        // Don't push units into impassable terrain (cliffs, water, etc.)
        if (this.shouldCheckTerrain()) {
          const testDistance = 2.0; // Test 2m ahead
          const testPos = this.position.clone().add(toOther.clone().multiplyScalar(testDistance));
          const slope = this.calculateSlopeTo(testPos);

          // If push direction leads to steep terrain, try perpendicular direction
          if (slope > 1.0) {
            // Try perpendicular directions (left and right)
            const perpRight = new THREE.Vector3(-toOther.z, 0, toOther.x);
            const perpLeft = new THREE.Vector3(toOther.z, 0, -toOther.x);

            const testRight = this.position.clone().add(perpRight.clone().multiplyScalar(testDistance));
            const testLeft = this.position.clone().add(perpLeft.clone().multiplyScalar(testDistance));

            const slopeRight = this.calculateSlopeTo(testRight);
            const slopeLeft = this.calculateSlopeTo(testLeft);

            // Use the better perpendicular direction
            if (slopeRight <= 1.0 && slopeRight <= slopeLeft) {
              toOther.copy(perpRight);
            } else if (slopeLeft <= 1.0) {
              toOther.copy(perpLeft);
            } else {
              // Both perpendicular directions blocked - don't push
              continue;
            }
          }
        }

        // More aggressive push - squared falloff for stronger near-field
        const pushStrength = Math.pow((minDist - dist) / minDist, 2);
        separationForce.add(toOther.multiplyScalar(pushStrength * 2.0)); // 2x multiplier
      }
    }

    return separationForce;
  }

  /**
   * Apply separation for stationary units to prevent overlap
   */
  private applyStationarySeparation(dt: number): void {
    const separationForce = this.applySeparation();
    if (separationForce.length() > 0.01) {
      // Move slowly to separate (slower than during active movement)
      const separationSpeed = this.speed * 0.3 * dt; // 30% of normal speed
      separationForce.normalize().multiplyScalar(separationSpeed);

      this.mesh.position.add(separationForce);

      // Clamp to terrain height
      const terrainHeight = this.game.getElevationAt(this.mesh.position.x, this.mesh.position.z);
      const category = this.unitData?.category ?? 'INF';
      const isAircraft = category === 'HEL' || category === 'AIR';

      if (isAircraft) {
        this.mesh.position.y = terrainHeight + 20;
      } else {
        this.mesh.position.y = terrainHeight;
      }
    }
  }

  private processMovement(dt: number): void {
    if (!this.targetPosition) {
      this.completeCommand();
      return;
    }

    // Check if stuck (not moving for 0.5 seconds - reduced from 2.0 for faster response)
    const distMoved = this.mesh.position.distanceTo(this.lastPosition);
    if (distMoved < 0.1) {
      this.stuckTimer += dt;

      // Fast response to stuck condition (but only after unit has moved at least once)
      if (this.stuckTimer > 0.5 && this.currentCommand.target && this.hasMovedOnce) {
        // Try local escape first (no pathfinding needed - faster and cheaper)
        const escapeDir = this.findEscapeDirection();
        if (escapeDir && !this.isEscaping) {
          // Found a valid escape direction - move perpendicular to obstacle
          this.isEscaping = true;
          const escapeTarget = this.position.clone().add(escapeDir);
          this.targetPosition = escapeTarget;
          this.stuckTimer = 0;
          this.waypoints = []; // Clear waypoints during escape
          return;
        }

        // If escape failed or already escaping, try pathfinding reroute
        // CRITICAL PERFORMANCE: Only retry pathfinding if cooldown has passed
        const currentTime = performance.now() / 1000;
        const timeSinceLastAttempt = currentTime - this.lastPathfindingAttempt;

        if (timeSinceLastAttempt >= this.pathfindingCooldown) {
          this.lastPathfindingAttempt = currentTime;

          // Try to reroute silently
          let path = this.game.pathfindingManager.findPath(this.position, this.currentCommand.target);

          if (!path || path.length === 0) {
            // Direct repath failed - try finding nearest reachable position
            const fallback = this.game.pathfindingManager.findNearestReachablePosition(
              this.position,
              this.currentCommand.target,
              50
            );

            if (fallback) {
              path = this.game.pathfindingManager.findPath(this.position, fallback);
            }
          }

          if (path && path.length > 0) {
            this.waypoints = path;
            this.currentWaypointIndex = 0;
            this.targetPosition = this.waypoints[0]!.clone();
            this.stuckTimer = 0;
            this.isEscaping = false; // Resume normal movement
          } else {
            // Completely stuck - give up
            this.completeCommand();
            return;
          }
        }
        // If cooldown not passed, do nothing - wait for next attempt
      }
    } else {
      this.stuckTimer = 0;
      this.isEscaping = false; // Resume normal movement when moving again
      this.hasMovedOnce = true; // Mark that unit has moved at least once
      this.lastPosition.copy(this.mesh.position);
    }

    const direction = this.targetPosition.clone().sub(this.mesh.position);
    direction.y = 0; // Keep on ground plane
    const distance = direction.length();

    // Use collision radius for stopping distance to maintain proper spacing
    const stoppingDistance = this.getCollisionRadius() * 0.8; // Stop at 80% of collision radius

    if (distance < stoppingDistance) {
      // Reached current waypoint, move to next
      if (this.waypoints.length > 0 && this.currentWaypointIndex < this.waypoints.length - 1) {
        this.currentWaypointIndex++;
        this.targetPosition = this.waypoints[this.currentWaypointIndex]!.clone();
        return;
      } else {
        // Reached final destination
        this.mesh.position.copy(this.targetPosition);
        this.targetPosition = null;
        this.waypoints = [];
        this.currentWaypointIndex = 0;
        this.completeCommand();
        return;
      }
    }

    // Normalize and apply speed
    direction.normalize();

    // MOVEMENT SMOOTHING: Look ahead to next waypoint and slow down if approaching steep terrain
    let speedMultiplier = 1.0;
    if (this.waypoints.length > 0 && this.currentWaypointIndex < this.waypoints.length - 1 && this.shouldCheckTerrain()) {
      // Look ahead to next waypoint
      const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1]!;
      const slopeToNext = this.calculateSlopeTo(nextWaypoint);

      // Slow down when approaching steep terrain (0.7-1.0 slope = 35-45 degrees)
      if (slopeToNext > 0.7) {
        const steepnessFactor = (slopeToNext - 0.7) / (1.0 - 0.7); // 0 to 1
        speedMultiplier = 1.0 - (steepnessFactor * 0.5); // Reduce speed by up to 50%
      }
    }

    const moveDistance = this.speed * dt * speedMultiplier;

    // Rotate towards target
    const targetAngle = Math.atan2(direction.x, direction.z);
    const currentAngle = this.mesh.rotation.y;
    const angleDiff = THREE.MathUtils.euclideanModulo(
      targetAngle - currentAngle + Math.PI,
      Math.PI * 2
    ) - Math.PI;

    const maxRotation = this.rotationSpeed * dt;
    const rotation = THREE.MathUtils.clamp(angleDiff, -maxRotation, maxRotation);
    this.mesh.rotation.y += rotation;

    // Move
    this.velocity.copy(direction).multiplyScalar(moveDistance);

    // Apply separation force to avoid unit overlap
    const separationForce = this.applySeparation();
    if (separationForce.length() > 0) {
      // Strong separation to prevent overlap - can override movement direction significantly
      const separationStrength = 0.6; // 60% of movement can be separation (was 30%)
      separationForce.normalize().multiplyScalar(moveDistance * separationStrength);
      this.velocity.add(separationForce);
    }

    // Slope validation (BEFORE movement) - now just slows down instead of stopping
    if (this.shouldCheckTerrain()) {
      const nextPos = this.mesh.position.clone().add(this.velocity);
      const currentHeight = this.game.getElevationAt(this.mesh.position.x, this.mesh.position.z);
      const nextHeight = this.game.getElevationAt(nextPos.x, nextPos.z);
      const horizontalDist = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

      if (horizontalDist > 0.01) {
        const slope = Math.abs(nextHeight - currentHeight) / horizontalDist;
        const MAX_SLOPE = 1.0; // 45 degrees

        if (slope > MAX_SLOPE) {
          // Blocked - pathfinding should have avoided this, but trigger reroute
          this.stuckTimer = 3.0; // Force immediate reroute
          return;
        }
      }
    }

    this.mesh.position.add(this.velocity);

    // Height clamping (AFTER movement)
    const terrainHeight = this.game.getElevationAt(this.mesh.position.x, this.mesh.position.z);
    const category = this.unitData?.category ?? 'INF';
    const isAircraft = category === 'HEL' || category === 'AIR';

    if (isAircraft) {
      // Aircraft maintain altitude above terrain
      this.mesh.position.y = terrainHeight + 20; // HELICOPTER_FLIGHT_ALTITUDE
    } else {
      // Ground units clamp to terrain
      this.mesh.position.y = terrainHeight;
    }
  }

  /**
   * Check if this unit should perform terrain elevation checks
   */
  private shouldCheckTerrain(): boolean {
    const category = this.unitData?.category ?? 'INF';
    return category !== 'HEL' && category !== 'AIR';
  }

  /**
   * Calculate slope from current position to target position
   * Returns slope value (0 = flat, 1.0 = 45 degrees, 2.0 = 63 degrees, etc.)
   */
  private calculateSlopeTo(targetPos: THREE.Vector3): number {
    const currentHeight = this.game.getElevationAt(this.position.x, this.position.z);
    const targetHeight = this.game.getElevationAt(targetPos.x, targetPos.z);
    const horizontalDist = Math.sqrt(
      Math.pow(targetPos.x - this.position.x, 2) +
      Math.pow(targetPos.z - this.position.z, 2)
    );

    if (horizontalDist < 0.01) return 0; // Avoid division by zero

    return Math.abs(targetHeight - currentHeight) / horizontalDist;
  }

  /**
   * Find an escape direction when unit is stuck
   * Samples 8 directions and returns first valid direction with acceptable slope
   * Returns null if no valid escape direction found
   */
  private findEscapeDirection(): THREE.Vector3 | null {
    // Sample 8 cardinal and diagonal directions
    const directions = [
      new THREE.Vector3(1, 0, 0),   // East
      new THREE.Vector3(-1, 0, 0),  // West
      new THREE.Vector3(0, 0, 1),   // South
      new THREE.Vector3(0, 0, -1),  // North
      new THREE.Vector3(1, 0, 1).normalize(),   // SE
      new THREE.Vector3(-1, 0, 1).normalize(),  // SW
      new THREE.Vector3(1, 0, -1).normalize(),  // NE
      new THREE.Vector3(-1, 0, -1).normalize(), // NW
    ];

    const escapeDistance = 5; // Try to move 5m in escape direction
    const MAX_SLOPE = 1.0; // 45 degrees

    // Try each direction in order
    for (const dir of directions) {
      const testPos = this.position.clone().add(dir.clone().multiplyScalar(escapeDistance));
      const slope = this.calculateSlopeTo(testPos);

      // Valid if slope is acceptable
      if (slope <= MAX_SLOPE) {
        return dir.multiplyScalar(escapeDistance);
      }
    }

    // No valid escape direction found
    return null;
  }

  private processAttack(dt: number): void {
    const target = this.currentCommand.targetUnit;
    if (!target || target.health <= 0) {
      this.completeCommand();
      return;
    }

    // Move towards target if out of range
    const distance = this.mesh.position.distanceTo(target.position);
    const attackRange = this.getMaxWeaponRange();

    if (distance > attackRange) {
      // Move closer
      this.targetPosition = target.position.clone();
      this.processMovement(dt);
    } else {
      // In range - face target and fire
      const direction = target.position.clone().sub(this.mesh.position);
      direction.y = 0;
      const targetAngle = Math.atan2(direction.x, direction.z);
      this.mesh.rotation.y = targetAngle;

      // TODO: Implement actual firing logic
      // For now, just deal damage occasionally (deterministic)
      if (gameRNG.next() < dt * 2) {
        target.takeDamage(5);
      }
    }
  }

  private processGarrison(dt: number): void {
    if (!this.targetPosition || this._isEntering) {
      return;
    }

    // Move toward building
    const direction = this.targetPosition.clone().sub(this.mesh.position);
    direction.y = 0;
    const distance = direction.length();

    // Check if close enough to building (within 5m)
    if (distance < 5.0) {
      // Find the building at target position
      const building = this.game.buildingManager.findNearestBuilding(this.targetPosition, 10);

      if (building && this.game.buildingManager.hasCapacity(building)) {
        // Start entering delay
        this._isEntering = true;
        this._enterTimer = this.getGarrisonDelay(building);
        this._enterTargetBuilding = building;
        this.velocity.set(0, 0, 0); // Stop movement while waiting
      } else {
        this.completeCommand();
      }
      return;
    }

    // Continue moving toward building
    direction.normalize();
    const moveSpeed = this.speed * dt;
    this.velocity.copy(direction).multiplyScalar(moveSpeed);
    this.mesh.position.add(this.velocity);

    // Face movement direction
    const targetAngle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = targetAngle;
  }

  private performEnterBuilding(): void {
    if (!this._enterTargetBuilding) {
      this._isEntering = false;
      return;
    }

    const success = this.game.buildingManager.tryGarrison(this, this._enterTargetBuilding);
    this._isEntering = false;
    this._enterTargetBuilding = null;
    this._isDigging = false; // Reset digging if it was part of a dig-in command

    if (success) {
      this.targetPosition = null;
      this.completeCommand();
    } else {
      this.completeCommand();
    }
  }

  private performCompleteDigIn(): void {
    if (!this._isDigging) return;

    // Spawn the structure and auto-garrison
    const building = this.game.buildingManager.spawnDefensiveStructure(this);
    if (building) {
      // Instant garrison after build completes?
      // Actually, my plan says "spawns building ... then unit completes Dig In"
      // Let's call BuildingManager to handle spawning and garrisoning
      this.game.buildingManager.tryGarrison(this, building);
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

    // Move toward transport
    const direction = transport.position.clone().sub(this.mesh.position);
    direction.y = 0;
    const distance = direction.length();

    // Check if close enough to transport (within 3m)
    if (distance < 3.0) {
      // Attempt to mount
      const success = this.game.transportManager.tryMount(this, transport);

      if (success) {
        // Mounted successfully
        this.targetPosition = null;
        this.completeCommand();
      } else {
        // Transport full or error - complete command anyway
        this.completeCommand();
      }
      return;
    }

    // Continue moving toward transport
    direction.normalize();
    const moveSpeed = this.speed * dt;
    this.velocity.copy(direction).multiplyScalar(moveSpeed);
    this.mesh.position.add(this.velocity);

    // Face movement direction
    const targetAngle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = targetAngle;
  }

  private completeCommand(): void {
    // Get next command from queue
    if (this.commandQueue.length > 0) {
      const nextCommand = this.commandQueue.shift()!;
      this.currentCommand = nextCommand;

      if (nextCommand.target) {
        this.targetPosition = nextCommand.target;
      }
    } else {
      this.currentCommand = { type: UnitCommand.None };

      // Clear path visualization when all commands complete
      if (this.game.pathRenderer) {
        this.game.pathRenderer.clearPath(this.id);
      }
    }
  }

  /**
   * Variable update for visuals/interpolation
   */
  update(dt: number): void {
    // Decrement spawn protection timer
    if (this._spawnProtectionTimer > 0) {
      this._spawnProtectionTimer = Math.max(0, this._spawnProtectionTimer - dt);
    }

    // Animate selection ring glow effect (smooth pulsing)
    if (this._isSelected && this.selectionRing.visible) {
      this.selectionRingTime += dt * 2.5; // Speed of pulse animation
      // Sine wave oscillation between 0.3 and 1.0 for smooth glow effect
      const pulseIntensity = 0.3 + 0.7 * (Math.sin(this.selectionRingTime) * 0.5 + 0.5);
      this.selectionRingMaterial.emissiveIntensity = pulseIntensity;
      // Also pulse opacity slightly for enhanced glow
      this.selectionRingMaterial.opacity = 0.6 + 0.3 * (Math.sin(this.selectionRingTime) * 0.5 + 0.5);
    }

    // Update UI (health bars, morale bars)
    if (this.unitUI) {
      this.unitUI.update();
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Dispose UI
    if (this.unitUI) {
      this.unitUI.destroy();
      this.unitUI = null;
    }

    // Only dispose per-unit geometries (NOT shared ones)
    // bodyMesh.geometry is SHARED (from SharedGeometryCache) - do NOT dispose
    // bodyMesh.material is SHARED (from SharedMaterials) - do NOT dispose
    // wireframe.geometry is per-unit (EdgesGeometry) - dispose it
    // wireframe.material is SHARED - do NOT dispose
    // selectionRing.geometry is per-unit (RingGeometry) - dispose it
    // selectionRing.material is PER-UNIT (emissive material) - dispose it
    this.wireframe.geometry.dispose();
    this.selectionRing.geometry.dispose();
    this.selectionRingMaterial.dispose();
  }

  /**
   * Get unit color based on team and ownership
   * - Blue (0x4a9eff) for player's own units
   * - Green (0x4aff4a) for allied units
   * - Red (0xff4a4a) for enemy units
   */
  getUnitColor(): number {
    if (this.team === 'enemy') {
      return 0xff4a4a; // Red for enemies
    }
    // Player team - check if it's the human player's unit or an ally
    if (this.ownerId === 'player') {
      return 0x4a9eff; // Blue for player's own units
    }
    return 0x4aff4a; // Green for allied units
  }

  /**
   * Check if this unit belongs to the human player (not an ally)
   */
  isPlayerOwned(): boolean {
    return this.team === 'player' && this.ownerId === 'player';
  }

  /**
   * Check if this unit is an ally (same team but different owner)
   */
  isAllied(): boolean {
    return this.team === 'player' && this.ownerId !== 'player';
  }
}
