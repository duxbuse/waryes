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

export interface UnitConfig {
  id: string;
  name: string;
  unitType: string;
  team: 'player' | 'enemy';
  position: THREE.Vector3;
  maxHealth: number;
  speed: number;
  rotationSpeed: number;
}

export enum UnitCommand {
  None = 'none',
  Move = 'move',
  Attack = 'attack',
  Garrison = 'garrison',
  Mount = 'mount',
  Unload = 'unload',
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

  // Stats
  public readonly maxHealth: number;
  public readonly speed: number;
  public readonly rotationSpeed: number;

  // State
  private _health: number;
  private _morale: number = 100;
  private _isSelected: boolean = false;
  private _isFrozen: boolean = true;

  // 3D representation
  public readonly mesh: THREE.Group;
  private readonly bodyMesh: THREE.Mesh;
  private readonly selectionRing: THREE.Mesh;

  // Movement
  private targetPosition: THREE.Vector3 | null = null;
  private readonly velocity = new THREE.Vector3();

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
    this.maxHealth = config.maxHealth;
    this.speed = config.speed;
    this.rotationSpeed = config.rotationSpeed;
    this._health = config.maxHealth;
    this.game = game;

    // Create 3D mesh group
    this.mesh = new THREE.Group();
    this.mesh.position.copy(config.position);
    this.mesh.userData['unitId'] = this.id;

    // Create body mesh (simple box for now)
    const geometry = this.createGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: this.team === 'player' ? 0x4a9eff : 0xff4a4a,
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
    // TODO: Death effects, cleanup
    this.game.unitManager.destroyUnit(this);
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
    // TODO: Routing behavior
    console.log(`${this.name} is routing!`);
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
  }

  queueAttackCommand(target: Unit): void {
    if (this.currentCommand.type === UnitCommand.None) {
      this.setAttackCommand(target);
    } else {
      this.commandQueue.push({ type: UnitCommand.Attack, targetUnit: target });
    }
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

    // Process current command
    switch (this.currentCommand.type) {
      case UnitCommand.Move:
        this.processMovement(dt);
        break;
      case UnitCommand.Attack:
        this.processAttack(dt);
        break;
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
    }
  }

  /**
   * Variable update for visuals/interpolation
   */
  update(_dt: number): void {
    // Visual updates could go here (animations, effects)
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Dispose geometries and materials
    this.bodyMesh.geometry.dispose();
    (this.bodyMesh.material as THREE.Material).dispose();
    this.selectionRing.geometry.dispose();
    (this.selectionRing.material as THREE.Material).dispose();
  }
}
