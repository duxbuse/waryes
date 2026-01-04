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
  private fireCooldown: number = 0;
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

  // Commander aura bonus (recalculated each frame)
  private auraBonusMorale: number = 0; // +morale from nearby commanders

  // Transport/Garrison
  private _garrisonedIn: Building | null = null;
  private _mountedIn: Unit | null = null;
  public readonly transportCapacity: number = 0;

  // UI elements (health bars, morale bars)
  private unitUI: UnitUI | null = null;

  // 3D representation
  public readonly mesh: THREE.Group;
  private readonly bodyMesh: THREE.Mesh;
  private readonly selectionRing: THREE.Mesh;

  // Movement
  private targetPosition: THREE.Vector3 | null = null;
  private readonly velocity = new THREE.Vector3();
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

    // Apply veterancy bonuses
    this.applyVeterancyBonuses();

    // Create 3D mesh group
    this.mesh = new THREE.Group();
    this.mesh.position.copy(config.position);
    this.mesh.userData['unitId'] = this.id;

    // Create body mesh (simple box for now)
    const geometry = this.createGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: this.getUnitColor(),
      roughness: 0.7,
      metalness: 0.3,
    });
    this.bodyMesh = new THREE.Mesh(geometry, material);
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.mesh.add(this.bodyMesh);

    // Create selection ring
    const ringGeometry = new THREE.RingGeometry(1.5, 1.8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    this.selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);

    // Create UI (health bars, morale bars)
    this.unitUI = new UnitUI(this, game);
  }

  private createGeometry(): THREE.BufferGeometry {
    // Different shapes based on unit type
    switch (this.unitType) {
      case 'tank':
        return new THREE.BoxGeometry(2, 1, 3);
      case 'infantry':
        return new THREE.CapsuleGeometry(0.3, 1, 8, 16);
      default:
        return new THREE.BoxGeometry(1.5, 1, 2);
    }
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
    this._health = Math.max(0, this._health - amount);
    if (this._health <= 0) {
      this.onDeath();
    }
  }

  heal(amount: number): void {
    this._health = Math.min(this.maxHealth, this._health + amount);
  }

  private onDeath(): void {
    // Create destruction effect and sound (if managers exist)
    this.game.visualEffectsManager?.createDestructionEffect(this.position);
    this.game.audioManager?.playSound('unit_death');

    // Cleanup
    this.game.unitManager?.destroyUnit(this);
  }

  // Morale
  get morale(): number {
    return this._morale;
  }

  suppressMorale(amount: number): void {
    this._morale = Math.max(0, this._morale - amount);
    if (this._morale <= 0) {
      this.onRout();
    }
  }

  private onRout(): void {
    this._isRouting = true;
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

    // Get all friendly units
    const friendlyUnits = this.game.unitManager.getAllUnits(this.team);

    for (const unit of friendlyUnits) {
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

  canFire(): boolean {
    return this.fireCooldown <= 0 && !this._isRouting && this._suppression < 80;
  }

  resetFireCooldown(): void {
    this.fireCooldown = 1 / this.fireRate;
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

  // Movement commands
  setMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Move, target: target.clone() };
    this.targetPosition = target.clone();

    // Update path visualization
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'move');
    }
  }

  queueMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Move, target: target.clone() });
    }
  }

  // Attack commands
  setAttackCommand(target: Unit): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Attack, targetUnit: target };

    // Update path visualization (show path to target unit)
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target.position, 'attack');
    }
  }

  queueAttackCommand(target: Unit): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setAttackCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Attack, targetUnit: target });
    }
  }

  // Fast move commands
  setFastMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.FastMove, target: target.clone() };
    this.targetPosition = target.clone();

    // Update path visualization
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'fast');
    }
  }

  queueFastMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setFastMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.FastMove, target: target.clone() });
    }
  }

  // Reverse commands
  setReverseCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Reverse, target: target.clone() };
    this.targetPosition = target.clone();

    // Update path visualization
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'reverse');
    }
  }

  queueReverseCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setReverseCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Reverse, target: target.clone() });
    }
  }

  // Attack-move commands
  setAttackMoveCommand(target: THREE.Vector3): void {
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.AttackMove, target: target.clone() };
    this.targetPosition = target.clone();
  }

  queueAttackMoveCommand(target: THREE.Vector3): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setAttackMoveCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.AttackMove, target: target.clone() });
    }
  }

  // Garrison commands
  setGarrisonCommand(building: Building): void {
    const buildingPos = new THREE.Vector3(building.x, 0, building.z);
    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Garrison, target: buildingPos };
    this.targetPosition = buildingPos;

    // Update path visualization
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, buildingPos, 'garrison');
    }
  }

  // Ungarrison command (no target needed, exits current building)
  setUngarrisonCommand(): void {
    if (!this._garrisonedIn) return;

    this.commandQueue = [];
    this.currentCommand = { type: UnitCommand.Unload };

    // BuildingManager will handle the actual exit
    const exitPos = this.game.buildingManager.ungarrison(this, this._garrisonedIn);
    if (exitPos) {
      this._garrisonedIn = null;
      this.position.copy(exitPos);
      this.mesh.position.copy(exitPos);
      this.targetPosition = null;
    }
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

    // Update path visualization
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

    // Give each passenger a small move command to spread out
    for (const passenger of passengers) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        0,
        (Math.random() - 0.5) * 5
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

    // Update fire cooldown
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    // Recover suppression over time (with veterancy bonus)
    const baseRecovery = dt * 5;
    const veterancyMultiplier = this.unitData ? (1 + this.unitData.veterancyBonus * this.veterancy) : 1;
    this.recoverSuppression(baseRecovery * veterancyMultiplier);

    // Calculate commander aura bonuses
    this.calculateCommanderAura();

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

    if (distance < 0.5) {
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
    this.mesh.position.add(this.velocity);
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

  private processMovement(dt: number): void {
    if (!this.targetPosition) {
      this.completeCommand();
      return;
    }

    const direction = this.targetPosition.clone().sub(this.mesh.position);
    direction.y = 0; // Keep on ground plane
    const distance = direction.length();

    if (distance < 0.5) {
      // Arrived at destination
      this.mesh.position.copy(this.targetPosition);
      this.targetPosition = null;
      this.completeCommand();
      return;
    }

    // Normalize and apply speed
    direction.normalize();
    const moveDistance = this.speed * dt;

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
    this.mesh.position.add(this.velocity);
  }

  private processAttack(dt: number): void {
    const target = this.currentCommand.targetUnit;
    if (!target || target.health <= 0) {
      this.completeCommand();
      return;
    }

    // Move towards target if out of range
    const distance = this.mesh.position.distanceTo(target.position);
    const attackRange = 20; // TODO: Get from weapon data

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
      // For now, just deal damage occasionally
      if (Math.random() < dt * 2) {
        target.takeDamage(5);
      }
    }
  }

  private processGarrison(dt: number): void {
    if (!this.targetPosition) {
      this.completeCommand();
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

      if (building) {
        // Attempt to garrison
        const success = this.game.buildingManager.tryGarrison(this, building);

        if (success) {
          // Garrisoned successfully
          this.targetPosition = null;
          this.completeCommand();
        } else {
          // Building full or error - complete command anyway
          this.completeCommand();
        }
      } else {
        // No building found
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
  update(_dt: number): void {
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

    // Dispose geometries and materials
    this.bodyMesh.geometry.dispose();
    (this.bodyMesh.material as THREE.Material).dispose();
    this.selectionRing.geometry.dispose();
    (this.selectionRing.material as THREE.Material).dispose();
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
