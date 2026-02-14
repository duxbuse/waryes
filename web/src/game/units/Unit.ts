/**
 * Unit - Rendering adapter wrapping SimUnit
 *
 * Contains the Three.js mesh, selection ring, UnitUI, and audio/VFX triggers.
 * All simulation state and logic lives in SimUnit (shared package).
 * Proxy getters ensure backward compatibility with existing code.
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { UnitData, WeaponSlot, Building } from '../../data/types';
import { SimUnit, UnitCommand } from '@shared/simulation/SimUnit';
import type { SimUnitConfig } from '@shared/simulation/SimUnit';
import { UnitUI } from '../ui/UnitUI';
import { getUnitMaterial, getWireframeMaterial } from './SharedMaterials';
import { getUnitGeometry, CATEGORY_HEIGHTS, FLYING_ALTITUDES } from '../utils/SharedGeometryCache';
import { gameRNG } from '../utils/DeterministicRNG';
import { LAYERS } from '../utils/LayerConstants';

// Re-export UnitCommand for backward compatibility
export { UnitCommand } from '@shared/simulation/SimUnit';
export type { SimCommandData as CommandData } from '@shared/simulation/SimUnit';

export interface UnitConfig {
  id: string;
  name: string;
  unitType: string;
  team: 'player' | 'enemy';
  ownerId?: string;
  position: THREE.Vector3;
  maxHealth: number;
  speed: number;
  rotationSpeed: number;
  unitData?: UnitData;
  veterancy?: number;
}

export class Unit {
  // The underlying simulation unit - all game state lives here
  public readonly sim: SimUnit;

  // Voice line throttling (per-unit, client-only)
  private lastVoiceLineTime: number = 0;
  private readonly VOICE_LINE_THROTTLE = 2.0;
  private lastCombatVoiceLineTime: number = 0;
  private readonly COMBAT_VOICE_LINE_THROTTLE = 5.0;

  // UI elements
  private unitUI: UnitUI | null = null;

  // 3D representation
  public readonly mesh: THREE.Group;
  private readonly bodyMesh: THREE.Mesh;
  private readonly wireframe: THREE.LineSegments;
  private readonly selectionRing: THREE.Mesh;
  private readonly selectionRingMaterial: THREE.MeshStandardMaterial;
  private selectionRingTime: number = 0;

  // Selection state (rendering-only)
  private _isSelected: boolean = false;

  // Reference to game (for audio/VFX/path rendering)
  private readonly game: Game;

  constructor(config: UnitConfig, game: Game) {
    this.game = game;

    // Create SimUnit with game as SimGameContext adapter
    const simConfig: SimUnitConfig = {
      id: config.id,
      name: config.name,
      unitType: config.unitType,
      team: config.team,
      ownerId: config.ownerId,
      position: config.position,
      maxHealth: config.maxHealth,
      speed: config.speed,
      rotationSpeed: config.rotationSpeed,
      unitData: config.unitData,
      veterancy: config.veterancy,
    };
    this.sim = new SimUnit(simConfig, game.getSimContext());

    // Create 3D mesh group
    this.mesh = new THREE.Group();
    this.mesh.position.copy(config.position);
    this.mesh.userData['unitId'] = this.id;

    // Create body mesh
    const { geometry, height } = this.createGeometry();
    const material = getUnitMaterial(this.team, this.ownerId);
    this.bodyMesh = new THREE.Mesh(geometry, material);
    this.bodyMesh.position.y = height / 2;
    this.bodyMesh.renderOrder = 999;
    this.bodyMesh.layers.set(LAYERS.RAYCAST_ONLY);
    this.bodyMesh.castShadow = false;
    this.bodyMesh.receiveShadow = false;
    this.mesh.add(this.bodyMesh);
    this.bodyMesh.geometry.computeBoundingSphere();

    // Wireframe (disabled - instanced renderer handles it)
    const wireframeGeometry = new THREE.EdgesGeometry(geometry);
    this.wireframe = new THREE.LineSegments(wireframeGeometry, getWireframeMaterial());
    this.wireframe.position.y = height / 2;
    this.wireframe.renderOrder = 1000;
    this.wireframe.visible = false;
    this.mesh.add(this.wireframe);

    // Selection ring
    const ringGeometry = new THREE.RingGeometry(1.5, 1.8, 32);
    this.selectionRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.5,
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
  }

  private createGeometry(): { geometry: THREE.BufferGeometry; height: number } {
    const category = this.sim.data?.category ?? 'INF';
    const geometry = getUnitGeometry(category);
    const flyingAlt = FLYING_ALTITUDES[category];
    if (flyingAlt !== undefined) {
      return { geometry, height: flyingAlt };
    }
    const geometryHeight = CATEGORY_HEIGHTS[category] ?? 2.5;
    return { geometry, height: geometryHeight };
  }

  // ─── Proxy Getters (backward compatibility) ──────────────────

  get id(): string { return this.sim.id; }
  get name(): string { return this.sim.name; }
  get unitType(): string { return this.sim.unitType; }
  get team(): 'player' | 'enemy' { return this.sim.team; }
  get ownerId(): string { return this.sim.ownerId; }
  get maxHealth(): number { return this.sim.maxHealth; }
  get speed(): number { return this.sim.speed; }
  set speed(v: number) { this.sim.speed = v; }
  get rotationSpeed(): number { return this.sim.rotationSpeed; }
  set rotationSpeed(v: number) { this.sim.rotationSpeed = v; }
  get cost(): number { return this.sim.cost; }
  get transportCapacity(): number { return this.sim.transportCapacity; }

  get position(): THREE.Vector3 { return this.sim.simPosition; }
  get category(): string { return this.sim.category; }
  get unitDataId(): string { return this.sim.unitDataId; }

  // Health
  get health(): number { return this.sim.health; }

  takeDamage(amount: number): void {
    const moraleBefore = this.sim.morale;
    this.sim.takeDamage(amount);
    // Check morale thresholds for voice lines
    if (moraleBefore >= 50 && this.sim.morale < 50) {
      this.playVoiceLineThrottled('under_fire');
    } else if (moraleBefore >= 20 && this.sim.morale < 20) {
      this.playVoiceLineThrottled('low_morale');
    }
  }

  setSpawnProtection(seconds: number): void { this.sim.setSpawnProtection(seconds); }
  get hasSpawnProtection(): boolean { return this.sim.hasSpawnProtection; }
  heal(amount: number): void { this.sim.heal(amount); }

  // Morale
  get morale(): number { return this.sim.morale; }
  suppressMorale(amount: number): void { this.sim.suppressMorale(amount); }
  recoverMorale(amount: number): void { this.sim.recoverMorale(amount); }

  // Suppression
  get suppression(): number { return this.sim.suppression; }
  addSuppression(amount: number): void { this.sim.addSuppression(amount); }
  recoverSuppression(amount: number): void { this.sim.recoverSuppression(amount); }

  // Armor
  getArmor(facing: 'front' | 'side' | 'rear' | 'top'): number { return this.sim.getArmor(facing); }

  // Weapons
  getWeapons(): WeaponSlot[] { return this.sim.getWeapons(); }
  getMaxWeaponRange(): number { return this.sim.getMaxWeaponRange(); }
  canFire(): boolean { return this.sim.canFire(); }
  resetFireCooldown(): void { this.sim.resetFireCooldown(); }
  getWeaponCooldown(weaponIndex: number): number { return this.sim.getWeaponCooldown(weaponIndex); }
  canWeaponFire(weaponIndex: number): boolean { return this.sim.canWeaponFire(weaponIndex); }
  resetWeaponCooldown(weaponIndex: number, weaponId: string): void { this.sim.resetWeaponCooldown(weaponIndex, weaponId); }
  getWeaponDamageDealt(weaponIndex: number): number { return this.sim.getWeaponDamageDealt(weaponIndex); }
  addWeaponDamage(weaponIndex: number, damage: number): void { this.sim.addWeaponDamage(weaponIndex, damage); }

  // Ammunition
  getWeaponAmmo(weaponIndex: number): number { return this.sim.getWeaponAmmo(weaponIndex); }
  getWeaponMaxAmmo(weaponIndex: number): number { return this.sim.getWeaponMaxAmmo(weaponIndex); }
  hasWeaponAmmo(weaponIndex: number): boolean { return this.sim.hasWeaponAmmo(weaponIndex); }
  useWeaponAmmo(weaponIndex: number, amount: number = 1): boolean { return this.sim.useWeaponAmmo(weaponIndex, amount); }
  resupplyWeapon(weaponIndex: number): void { this.sim.resupplyWeapon(weaponIndex); }
  resupplyAllWeapons(): void { this.sim.resupplyAllWeapons(); }

  // Smoke
  findSmokeWeaponIndex(): number { return this.sim.findSmokeWeaponIndex(); }
  hasSmokeAmmo(): boolean { return this.sim.hasSmokeAmmo(); }
  useSmoke(): boolean { return this.sim.useSmoke(); }
  getSmokeType(): 'grenade' | 'launcher' | 'artillery' { return this.sim.getSmokeType(); }

  // Veterancy
  get returnFireOnly(): boolean { return this.sim.returnFireOnly; }
  setReturnFireOnly(value: boolean): void { this.sim.setReturnFireOnly(value); }
  get isRouting(): boolean { return this.sim.isRouting; }
  get data(): UnitData | null { return this.sim.data; }
  get kills(): number { return this.sim.kills; }
  get veterancy(): number { return this.sim.veterancy; }
  addKill(): void { this.sim.addKill(); }

  // Selection (rendering-only state)
  get isSelected(): boolean { return this._isSelected; }

  setSelected(selected: boolean): void {
    this._isSelected = selected;
    this.selectionRing.visible = selected;
  }

  // Frozen
  get isFrozen(): boolean { return this.sim.isFrozen; }
  setFrozen(frozen: boolean): void { this.sim.setFrozen(frozen); }

  // Garrison / Transport state
  get isDigging(): boolean { return this.sim.isDigging; }
  get isEntering(): boolean { return this.sim.isEntering; }
  get isExiting(): boolean { return this.sim.isExiting; }
  get isGarrisoned(): boolean { return this.sim.isGarrisoned; }
  get garrisonedBuilding(): Building | null { return this.sim.garrisonedBuilding; }
  setGarrisonedIn(building: Building | null): void { this.sim.setGarrisonedIn(building); }
  get isMounted(): boolean { return this.sim.isMounted; }
  get mountedIn(): Unit | null {
    // Need to find the Unit wrapper for the sim's mountedIn
    const simTransport = this.sim.mountedIn;
    if (!simTransport) return null;
    return this.game.unitManager?.findUnitBySim(simTransport) ?? null;
  }
  setMountedIn(transport: Unit | null): void { this.sim.setMountedIn(transport?.sim ?? null); }

  // Combat targeting
  get combatTarget(): Unit | null {
    const simTarget = this.sim.combatTarget;
    if (!simTarget) return null;
    return this.game.unitManager?.findUnitBySim(simTarget) ?? null;
  }
  set combatTarget(target: Unit | null) { this.sim.combatTarget = target?.sim ?? null; }
  get targetScanTimer(): number { return this.sim.targetScanTimer; }
  set targetScanTimer(v: number) { this.sim.targetScanTimer = v; }

  // ─── Commands (with path visualization + voice lines) ────────

  setDigInCommand(): void {
    this.sim.setDigInCommand();
  }

  setMoveCommand(target: THREE.Vector3): void {
    this.playVoiceLineThrottled('move_order');
    this.sim.setMoveCommand(target);
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'move');
    }
  }

  queueMoveCommand(target: THREE.Vector3): void {
    if (this.sim.getCurrentCommand().type === UnitCommand.None) {
      this.setMoveCommand(target);
    } else {
      this.sim.queueMoveCommand(target);
      if (this.game.pathRenderer) {
        const fullQueue = this.sim.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  setAttackCommand(target: Unit): void {
    this.playVoiceLineThrottled('attack_order');
    this.sim.setAttackCommand(target.sim);
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target.position, 'attack');
    }
  }

  queueAttackCommand(target: Unit): void {
    if (this.sim.getCurrentCommand().type === UnitCommand.None) {
      this.setAttackCommand(target);
    } else {
      this.sim.queueAttackCommand(target.sim);
      if (this.game.pathRenderer) {
        const fullQueue = this.sim.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  setFastMoveCommand(target: THREE.Vector3): void {
    this.playVoiceLineThrottled('move_order');
    this.sim.setFastMoveCommand(target);
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'fast');
    }
  }

  queueFastMoveCommand(target: THREE.Vector3): void {
    if (this.sim.getCurrentCommand().type === UnitCommand.None) {
      this.setFastMoveCommand(target);
    } else {
      this.sim.queueFastMoveCommand(target);
      if (this.game.pathRenderer) {
        const fullQueue = this.sim.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  setReverseCommand(target: THREE.Vector3): void {
    this.playVoiceLineThrottled('move_order');
    this.sim.setReverseCommand(target);
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'reverse');
    }
  }

  queueReverseCommand(target: THREE.Vector3): void {
    if (this.sim.getCurrentCommand().type === UnitCommand.None) {
      this.setReverseCommand(target);
    } else {
      this.sim.queueReverseCommand(target);
      if (this.game.pathRenderer) {
        const fullQueue = this.sim.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  setAttackMoveCommand(target: THREE.Vector3): void {
    this.playVoiceLineThrottled('attack_order');
    this.sim.setAttackMoveCommand(target);
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, target, 'attackMove');
    }
  }

  queueAttackMoveCommand(target: THREE.Vector3): void {
    if (this.sim.getCurrentCommand().type === UnitCommand.None) {
      this.setAttackMoveCommand(target);
    } else {
      this.sim.queueAttackMoveCommand(target);
      if (this.game.pathRenderer) {
        const fullQueue = this.sim.buildFullCommandQueue();
        this.game.pathRenderer.updatePathQueue(this, fullQueue);
      }
    }
  }

  setGarrisonCommand(building: Building): void {
    this.sim.setGarrisonCommand(building);
    if (this.game.pathRenderer) {
      const buildingPos = new THREE.Vector3(building.x, 0, building.z);
      this.game.pathRenderer.updatePath(this, buildingPos, 'garrison');
    }
  }

  setUngarrisonCommand(): void { this.sim.setUngarrisonCommand(); }

  setMountCommand(transport: Unit): void {
    this.sim.setMountCommand(transport.sim);
    if (this.game.pathRenderer) {
      this.game.pathRenderer.updatePath(this, transport.position, 'mount');
    }
  }

  setUnloadCommand(): void { this.sim.setUnloadCommand(); }

  clearCommands(): void { this.sim.clearCommands(); }

  setDirectMovement(target: THREE.Vector3): void {
    this.sim.setDirectMovement(target);
  }

  // ─── Helpers ─────────────────────────────────────────────────

  getCollisionRadius(): number { return this.sim.getCollisionRadius(); }
  getUnitColor(): number { return this.sim.getUnitColor(); }
  isPlayerOwned(): boolean { return this.sim.isPlayerOwned(); }
  isAllied(): boolean { return this.sim.isAllied(); }

  // ─── Voice Lines (client-only) ───────────────────────────────

  private playVoiceLineThrottled(voiceType: 'move_order' | 'attack_order' | 'under_fire' | 'low_morale' | 'retreating'): void {
    const currentTime = performance.now() / 1000;
    const isCombatVoice = voiceType === 'under_fire' || voiceType === 'low_morale' || voiceType === 'retreating';

    if (isCombatVoice) {
      if (currentTime - this.lastCombatVoiceLineTime < this.COMBAT_VOICE_LINE_THROTTLE) return;
      this.lastCombatVoiceLineTime = currentTime;
    } else {
      if (currentTime - this.lastVoiceLineTime < this.VOICE_LINE_THROTTLE) return;
      this.lastVoiceLineTime = currentTime;
    }

    this.game.audioManager?.playVoiceLine(voiceType, this.position);
  }

  // ─── Process SimUnit Events ──────────────────────────────────

  private processSimEvents(): void {
    for (const event of this.sim.pendingEvents) {
      switch (event.type) {
        case 'death':
          this.onDeathEffects();
          break;
        case 'morale_low':
          this.playVoiceLineThrottled('under_fire');
          break;
        case 'morale_critical':
          this.playVoiceLineThrottled('low_morale');
          break;
        case 'rout_started':
          this.playVoiceLineThrottled('retreating');
          break;
        case 'veterancy_gained':
          this.onVeterancyGainedEffects();
          break;
        case 'rout_recovered':
        case 'rallied':
          // Could play rally voice line
          break;
      }
    }
    this.sim.pendingEvents.length = 0;
  }

  private onDeathEffects(): void {
    this.game.visualEffectsManager?.createDestructionEffect(this.position);

    if (this.sim.data) {
      const category = this.sim.data.category;
      const vehicleCategories: string[] = ['TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
      if (vehicleCategories.includes(category)) {
        this.game.audioManager?.playImpactSound('vehicle_explosion', this.position, 1.0);
      } else {
        this.game.audioManager?.playSound('unit_death');
      }
    } else {
      this.game.audioManager?.playSound('unit_death');
    }
  }

  private onVeterancyGainedEffects(): void {
    // Recreate UI to show new veterancy stars
    if (this.unitUI) {
      this.unitUI.destroy();
      this.unitUI = new UnitUI(this, this.game);
    }
  }

  // ─── Fixed Update (delegates to SimUnit, syncs mesh) ─────────

  fixedUpdate(dt: number): void {
    this.sim.fixedUpdate(dt);

    // Sync mesh position and rotation from simulation
    this.mesh.position.copy(this.sim.simPosition);
    this.mesh.rotation.y = this.sim.simRotationY;

    // Process simulation events (death effects, voice lines, etc.)
    this.processSimEvents();

    // Clear path visualization when commands complete
    if (this.sim.getCurrentCommand().type === UnitCommand.None && this.game.pathRenderer) {
      this.game.pathRenderer.clearPath(this.id);
    }
  }

  /**
   * Variable update for visuals/interpolation
   */
  update(dt: number): void {
    // Decrement spawn protection timer
    this.sim.decrementSpawnProtection(dt);

    // Animate selection ring glow
    if (this._isSelected && this.selectionRing.visible) {
      this.selectionRingTime += dt * 2.5;
      const pulseIntensity = 0.3 + 0.7 * (Math.sin(this.selectionRingTime) * 0.5 + 0.5);
      this.selectionRingMaterial.emissiveIntensity = pulseIntensity;
      this.selectionRingMaterial.opacity = 0.6 + 0.3 * (Math.sin(this.selectionRingTime) * 0.5 + 0.5);
    }

    // Update UI
    if (this.unitUI) {
      this.unitUI.update();
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.unitUI) {
      this.unitUI.destroy();
      this.unitUI = null;
    }
    this.wireframe.geometry.dispose();
    this.selectionRing.geometry.dispose();
    this.selectionRingMaterial.dispose();
  }
}
