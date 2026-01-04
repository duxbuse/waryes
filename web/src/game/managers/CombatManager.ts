/**
 * CombatManager - Handles combat resolution, damage, and morale
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import { getWeaponById } from '../../data/factions';
import { GAME_CONSTANTS } from '../../data/types';
import { MapGenerator } from '../map/MapGenerator';

export interface DamageResult {
  damage: number;
  penetrated: boolean;
  criticalHit: boolean;
  suppression: number;
}

export interface Projectile {
  id: string;
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  damage: number;
  penetration: number;
  suppression: number;
  sourceTeam: 'player' | 'enemy';
  targetUnit: Unit | undefined;
  timeAlive: number;
  maxTime: number;
}

export class CombatManager {
  private readonly game: Game;
  private projectiles: Map<string, Projectile> = new Map();
  private nextProjectileId = 0;

  // Projectile materials
  private projectileMaterials: {
    player: THREE.MeshBasicMaterial;
    enemy: THREE.MeshBasicMaterial;
  };

  // Shared geometry
  private projectileGeometry: THREE.SphereGeometry;

  constructor(game: Game) {
    this.game = game;

    // Initialize materials
    this.projectileMaterials = {
      player: new THREE.MeshBasicMaterial({ color: 0x4a9eff }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xff4a4a }),
    };

    this.projectileGeometry = new THREE.SphereGeometry(0.2, 8, 8);
  }

  initialize(): void {
    // Nothing to initialize currently
  }

  /**
   * Fire weapon from attacker to target
   */
  fireWeapon(
    attacker: Unit,
    target: Unit,
    weaponId: string
  ): void {
    const weapon = getWeaponById(weaponId);
    if (!weapon) return;

    // Calculate hit chance based on distance, accuracy, cover
    const distance = attacker.position.distanceTo(target.position);

    // Out of range
    if (distance > weapon.range) return;

    // Base hit chance from weapon accuracy
    let hitChance = weapon.accuracy;

    // Distance falloff
    const distanceRatio = distance / weapon.range;
    hitChance *= 1 - (distanceRatio * 0.3);

    // Cover modifier
    const coverValue = this.getTargetCover(target);
    hitChance *= 1 - coverValue;

    // Size modifier (smaller units harder to hit)
    // TODO: Add size to unit data

    // Roll for hit
    if (Math.random() > hitChance) {
      // Miss - create tracer anyway for visual
      this.createProjectile(attacker, target, weapon.damage, weapon.penetration, weapon.suppression, false);
      return;
    }

    // Hit - create projectile
    this.createProjectile(attacker, target, weapon.damage, weapon.penetration, weapon.suppression, true);
  }

  private createProjectile(
    attacker: Unit,
    target: Unit,
    damage: number,
    penetration: number,
    suppression: number,
    willHit: boolean
  ): void {
    const id = `proj_${this.nextProjectileId++}`;

    // Calculate muzzle position (front of attacker)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(attacker.mesh.quaternion);
    const start = attacker.position.clone().add(forward.multiplyScalar(2));
    start.y += 1;

    // Calculate target position (with some randomness for misses)
    const targetPos = target.position.clone();
    targetPos.y += 1;

    if (!willHit) {
      // Miss offset
      targetPos.x += (Math.random() - 0.5) * 5;
      targetPos.z += (Math.random() - 0.5) * 5;
    }

    // Create mesh
    const mesh = new THREE.Mesh(
      this.projectileGeometry,
      attacker.team === 'player' ? this.projectileMaterials.player : this.projectileMaterials.enemy
    );
    mesh.position.copy(start);
    this.game.scene.add(mesh);

    const distance = start.distanceTo(targetPos);
    const speed = 100; // meters per second
    const maxTime = distance / speed + 0.5;

    const projectile: Projectile = {
      id,
      mesh,
      start,
      target: targetPos,
      speed,
      damage: willHit ? damage : 0,
      penetration,
      suppression: willHit ? suppression : suppression * 0.5,
      sourceTeam: attacker.team,
      targetUnit: willHit ? target : undefined,
      timeAlive: 0,
      maxTime,
    };

    this.projectiles.set(id, projectile);
  }

  update(dt: number): void {
    const toRemove: string[] = [];

    for (const [id, proj] of this.projectiles) {
      proj.timeAlive += dt;

      // Move projectile
      const direction = proj.target.clone().sub(proj.start).normalize();
      const totalDistance = proj.start.distanceTo(proj.target);
      const currentDistance = proj.speed * proj.timeAlive;

      if (currentDistance >= totalDistance || proj.timeAlive >= proj.maxTime) {
        // Projectile reached target or timed out
        this.onProjectileHit(proj);
        toRemove.push(id);
      } else {
        // Update position
        proj.mesh.position.copy(proj.start).add(direction.multiplyScalar(currentDistance));
      }
    }

    // Remove finished projectiles
    for (const id of toRemove) {
      const proj = this.projectiles.get(id);
      if (proj) {
        this.game.scene.remove(proj.mesh);
        this.projectiles.delete(id);
      }
    }
  }

  private onProjectileHit(proj: Projectile): void {
    if (!proj.targetUnit) return;

    // Calculate damage based on armor
    const result = this.calculateDamage(proj, proj.targetUnit);

    // Apply damage
    if (result.damage > 0) {
      // Register attack for kill attribution (find attacker by team)
      const attackers = this.game.unitManager.getAllUnits(proj.sourceTeam);
      if (attackers.length > 0) {
        // Find closest attacker as the likely shooter
        let closest = attackers[0]!;
        let closestDist = closest.position.distanceTo(proj.start);
        for (const attacker of attackers) {
          const dist = attacker.position.distanceTo(proj.start);
          if (dist < closestDist) {
            closest = attacker;
            closestDist = dist;
          }
        }
        this.game.unitManager.registerAttack(closest, proj.targetUnit);
      }
      proj.targetUnit.takeDamage(result.damage);
    }

    // Apply suppression (always applies even on miss)
    proj.targetUnit.suppressMorale(result.suppression);
  }

  private calculateDamage(proj: Projectile, target: Unit): DamageResult {
    // Get armor facing
    const armor = this.getTargetArmor(proj, target);

    // Check penetration
    const penetrationRoll = Math.random() * proj.penetration;
    const penetrated = penetrationRoll > armor;

    if (!penetrated) {
      // Bounced - no damage, reduced suppression
      return {
        damage: 0,
        penetrated: false,
        criticalHit: false,
        suppression: proj.suppression * 0.3,
      };
    }

    // Critical hit chance (10% base)
    const criticalHit = Math.random() < 0.1;
    const damageMultiplier = criticalHit ? 2 : 1;

    // Calculate final damage
    const armorReduction = Math.max(0, armor - proj.penetration * 0.5);
    const damage = Math.max(1, proj.damage * damageMultiplier - armorReduction);

    return {
      damage,
      penetrated: true,
      criticalHit,
      suppression: proj.suppression,
    };
  }

  private getTargetArmor(proj: Projectile, target: Unit): number {
    // Calculate hit direction
    const toTarget = target.position.clone().sub(proj.start);
    const targetForward = new THREE.Vector3(0, 0, 1).applyQuaternion(target.mesh.quaternion);

    // Dot product to determine facing
    const dot = toTarget.normalize().dot(targetForward);

    // Determine armor face
    // Front: dot < -0.7, Rear: dot > 0.7, Sides: otherwise
    if (dot < -0.7) {
      return target.getArmor('front');
    } else if (dot > 0.7) {
      return target.getArmor('rear');
    } else {
      return target.getArmor('side');
    }
  }

  private getTargetCover(target: Unit): number {
    // Get terrain at target position
    const terrain = this.game.currentMap
      ? new MapGenerator(this.game.currentMap.seed, this.game.currentMap.size).getTerrainAt(
          target.position.x,
          target.position.z
        )
      : null;

    if (!terrain) return 0;

    return MapGenerator.getCoverValue(terrain.cover);
  }

  /**
   * Process combat for all units
   */
  processCombat(dt: number): void {
    const allUnits = this.game.unitManager.getAllUnits();

    for (const unit of allUnits) {
      if (unit.isFrozen || unit.health <= 0) continue;

      // Recover morale when not under fire
      unit.recoverMorale(GAME_CONSTANTS.MORALE_RECOVERY_RATE * dt);

      // Find targets and fire
      const target = this.findTarget(unit);
      if (target) {
        // Check if can fire (rate of fire cooldown)
        if (unit.canFire()) {
          // Fire all weapons
          for (const weaponSlot of unit.getWeapons()) {
            for (let i = 0; i < weaponSlot.count; i++) {
              this.fireWeapon(unit, target, weaponSlot.weaponId);
            }
          }
          unit.resetFireCooldown();
        }
      }
    }
  }

  private findTarget(unit: Unit): Unit | null {
    const enemies = this.game.unitManager.getAllUnits(
      unit.team === 'player' ? 'enemy' : 'player'
    );

    // Find closest enemy in range
    let closestTarget: Unit | null = null;
    let closestDistance = Infinity;

    const maxRange = unit.getMaxWeaponRange();

    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;

      const distance = unit.position.distanceTo(enemy.position);
      if (distance <= maxRange && distance < closestDistance) {
        // Check line of sight
        if (this.hasLineOfSight(unit, enemy)) {
          closestTarget = enemy;
          closestDistance = distance;
        }
      }
    }

    return closestTarget;
  }

  private hasLineOfSight(from: Unit, to: Unit): boolean {
    // Simplified LOS check - could raycast through terrain
    // For now, just check if any buildings block
    const direction = to.position.clone().sub(from.position);
    const distance = direction.length();
    direction.normalize();

    // Sample points along the line
    const steps = Math.ceil(distance / 5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const point = from.position.clone().add(direction.clone().multiplyScalar(distance * t));

      // Check terrain at point
      if (this.game.currentMap) {
        const terrain = new MapGenerator(this.game.currentMap.seed, this.game.currentMap.size)
          .getTerrainAt(point.x, point.z);

        if (terrain?.type === 'building') {
          return false;
        }
      }
    }

    return true;
  }

  dispose(): void {
    // Remove all projectiles
    for (const proj of this.projectiles.values()) {
      this.game.scene.remove(proj.mesh);
    }
    this.projectiles.clear();

    // Dispose materials and geometry
    this.projectileMaterials.player.dispose();
    this.projectileMaterials.enemy.dispose();
    this.projectileGeometry.dispose();
  }
}
