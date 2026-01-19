/**
 * CombatManager - Handles combat resolution, damage, and morale
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import { getWeaponById } from '../../data/factions';
import { GAME_CONSTANTS, type WeaponData } from '../../data/types';
import { MapGenerator } from '../map/MapGenerator';
import { ObjectPool } from '../utils/ObjectPool';
import { PooledProjectile } from '../combat/PooledProjectile';
import { VectorPool } from '../utils/VectorPool';
import { gameRNG } from '../utils/DeterministicRNG';

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
  weaponData: WeaponData;
}

export class CombatManager {
  private readonly game: Game;
  private projectiles: Map<string, PooledProjectile> = new Map();
  private nextProjectileId = 0;

  // Projectile materials
  private projectileMaterials: {
    player: THREE.MeshBasicMaterial;
    enemy: THREE.MeshBasicMaterial;
  };

  // Shared geometry
  private projectileGeometry: THREE.SphereGeometry;

  // Object pool for projectiles
  private projectilePool!: ObjectPool<PooledProjectile>;

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
    // Initialize projectile pool
    this.projectilePool = new ObjectPool<PooledProjectile>(
      () => new PooledProjectile(this.projectileGeometry, this.projectileMaterials.player),
      100,  // initial size
      500   // max size
    );

    // Pre-warm pool and add all meshes to scene
    for (let i = 0; i < 100; i++) {
      const proj = this.projectilePool.acquire();
      if (proj) {
        this.game.scene.add(proj.mesh);
        this.projectilePool.release(proj);
      }
    }
  }

  /**
   * Fire weapon from attacker to target
   */
  fireWeapon(
    attacker: Unit,
    target: Unit,
    weaponId: string,
    weaponIndex?: number
  ): void {
    const weapon = getWeaponById(weaponId);
    if (!weapon) return;

    // Calculate hit chance based on distance, accuracy, cover
    const attackerPos = attacker.isGarrisoned && attacker.garrisonedBuilding
      ? VectorPool.acquire().set(attacker.garrisonedBuilding.x, 0, attacker.garrisonedBuilding.z)
      : attacker.position;

    const distance = attackerPos.distanceTo(target.position);

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

    // Morale-accuracy scaling: accuracy malus = (100 - morale) / 100
    // At 100 morale: no penalty. At 0 morale: 100% penalty (can't hit)
    const moralePenalty = (100 - attacker.morale) / 100;
    hitChance *= (1 - moralePenalty * 0.5); // Max 50% penalty at 0 morale

    // Roll for hit (deterministic)
    if (gameRNG.next() > hitChance) {
      // Miss - create tracer anyway for visual
      this.createProjectile(attacker, target, weapon, false, distance);
      // Create muzzle flash and sound
      const forward = VectorPool.acquire().set(0, 0, 1).applyQuaternion(attacker.mesh.quaternion);
      this.game.visualEffectsManager.createMuzzleFlash(attacker.position, forward);
      this.game.audioManager.playSound('weapon_fire');
      return;
    }

    // Hit - create projectile with kinetic scaling
    this.createProjectile(attacker, target, weapon, true, distance);
    // Create muzzle flash and sound
    const forward = VectorPool.acquire().set(0, 0, 1).applyQuaternion(attacker.mesh.quaternion);
    this.game.visualEffectsManager.createMuzzleFlash(attacker.position, forward);
    this.game.audioManager.playSound('weapon_fire');
  }

  private createProjectile(
    attacker: Unit,
    target: Unit,
    weaponData: WeaponData,
    willHit: boolean,
    firingDistance: number
  ): void {
    const id = `proj_${this.nextProjectileId++}`;

    // Calculate muzzle position (front of attacker)
    const forward = VectorPool.acquire().set(0, 0, 1).applyQuaternion(attacker.mesh.quaternion);
    const start = VectorPool.acquire().copy(attacker.position).add(forward.multiplyScalar(2));
    start.y += 1;

    // Calculate target position (with some randomness for misses)
    const targetPos = VectorPool.acquire().copy(target.position);
    targetPos.y += 1;

    if (!willHit) {
      // Miss offset (deterministic)
      targetPos.x += (gameRNG.next() - 0.5) * 5;
      targetPos.z += (gameRNG.next() - 0.5) * 5;
    }

    // Acquire pooled projectile
    const pooledProj = this.projectilePool.acquire();
    if (!pooledProj) return; // Pool exhausted

    const distance = start.distanceTo(targetPos);
    const speed = 100; // meters per second
    const maxTime = distance / speed + 0.5;

    // Kinetic scaling at close range - damage increases at shorter distances
    // At max range: 100% damage. At point blank: 150% damage
    const kineticScale = 1 + (1 - firingDistance / weaponData.range) * 0.5;
    const scaledDamage = willHit ? Math.round(weaponData.damage * kineticScale) : 0;

    // Penetration also increases at close range
    const scaledPenetration = weaponData.penetration * kineticScale;

    // Get appropriate material
    const material = attacker.team === 'player'
      ? this.projectileMaterials.player
      : this.projectileMaterials.enemy;

    // Activate the pooled projectile
    pooledProj.activate(
      id,
      start,
      targetPos,
      speed,
      scaledDamage,
      scaledPenetration,
      willHit ? weaponData.suppression : weaponData.suppression * 0.5,
      attacker.team,
      willHit ? target : undefined,
      maxTime,
      weaponData,
      material
    );

    this.projectiles.set(id, pooledProj);
  }

  update(dt: number): void {
    const toRemove: string[] = [];

    for (const [id, proj] of this.projectiles) {
      proj.timeAlive += dt;

      // Move projectile
      const direction = VectorPool.acquire().copy(proj.target).sub(proj.start).normalize();
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

    // Remove finished projectiles and release back to pool
    for (const id of toRemove) {
      const proj = this.projectiles.get(id);
      if (proj) {
        this.projectilePool.release(proj);
        this.projectiles.delete(id);
      }
    }
  }

  private onProjectileHit(proj: PooledProjectile): void {
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

      // Show damage number
      if (result.damage > 0) {
        this.game.damageNumberManager.createDamageNumber(
          proj.targetUnit.position,
          result.damage,
          result.criticalHit
        );
      }

      // Create explosion effect and sound on impact
      const explosionSize = result.criticalHit ? 1.5 : 1;
      this.game.visualEffectsManager.createExplosion(proj.targetUnit.position, explosionSize);
      this.game.audioManager.playSound('explosion');
    }

    // Apply suppression (always applies even on miss)
    proj.targetUnit.suppressMorale(result.suppression);

    // Deploy smoke if weapon has smoke effect
    if (proj.weaponData?.smokeEffect) {
      const smokePos = VectorPool.acquire().copy(proj.targetUnit.position);
      this.game.smokeManager.deploySmoke(smokePos, 'grenade');
    }
  }

  private calculateDamage(proj: PooledProjectile, target: Unit): DamageResult {
    // Get armor facing
    const armor = this.getTargetArmor(proj, target);

    // Check penetration (deterministic)
    const penetrationRoll = gameRNG.next() * proj.penetration;
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

    // Critical hit chance (10% base, deterministic)
    const criticalHit = gameRNG.nextBool(0.1);
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

  private getTargetArmor(proj: PooledProjectile, target: Unit): number {
    // Calculate hit direction
    const toTarget = VectorPool.acquire().copy(target.position).sub(proj.start);
    const targetForward = VectorPool.acquire().set(0, 0, 1).applyQuaternion(target.mesh.quaternion);

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
    // Check if target is in a building
    if (target.isGarrisoned && target.garrisonedBuilding) {
      return target.garrisonedBuilding.stealthBonus ?? 0.5;
    }

    // Get terrain at target position
    const terrain = this.game.getTerrainAt(target.position.x, target.position.z);

    if (!terrain) return 0;

    return MapGenerator.getCoverValue(terrain.cover);
  }

  /**
   * Process combat for all units
   */
  /**
   * Process combat for all units
   */
  processCombat(dt: number): void {
    const allUnits = this.game.unitManager.getAllUnits();

    for (const unit of allUnits) {
      if (unit.isFrozen || unit.health <= 0) continue;

      // Recover morale when not under fire
      unit.recoverMorale(GAME_CONSTANTS.MORALE_RECOVERY_RATE * dt);

      // Decrement scan timer
      unit.targetScanTimer -= dt;

      // Validate current target
      if (unit.combatTarget) {
        // Check if target is dead or invalid
        if (unit.combatTarget.health <= 0 || !this.isValidTarget(unit, unit.combatTarget)) {
          unit.combatTarget = null;
        }
      }

      // Try to find new target if needed and timer ready
      // This staggers expensive scan operations across multiple frames/seconds
      if (!unit.combatTarget && unit.targetScanTimer <= 0) {
        unit.combatTarget = this.findTarget(unit);
        // Reset timer (1.0s average + random jitter to keep staggered, deterministic)
        unit.targetScanTimer = 0.8 + gameRNG.next() * 0.4;
      }

      // Engage target if we have one
      if (unit.combatTarget) {
        // Fire each weapon independently based on its cooldown
        const weapons = unit.getWeapons();
        for (let weaponIndex = 0; weaponIndex < weapons.length; weaponIndex++) {
          const weaponSlot = weapons[weaponIndex];
          if (!weaponSlot) continue;

          // Check if this specific weapon can fire
          if (unit.canWeaponFire(weaponIndex)) {
            // Fire all instances of this weapon
            for (let i = 0; i < weaponSlot.count; i++) {
              this.fireWeapon(unit, unit.combatTarget, weaponSlot.weaponId, weaponIndex);
            }
            // Reset cooldown for this specific weapon
            unit.resetWeaponCooldown(weaponIndex, weaponSlot.weaponId);
          }
        }
      }
    }
  }

  /**
   * Check if a target is valid (in range, visible, LOS)
   * Faster than full findTarget scan
   */
  private isValidTarget(attacker: Unit, target: Unit): boolean {
    const dist = attacker.position.distanceTo(target.position);
    if (dist > attacker.getMaxWeaponRange()) return false;

    // Check team visibility
    if (!this.game.fogOfWarManager.isUnitVisibleToTeam(target, attacker.team)) return false;

    // Check direct line of sight
    return this.hasLineOfSight(attacker, target);
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
        // Check if unit is visible to our team
        if (this.game.fogOfWarManager.isUnitVisibleToTeam(enemy, unit.team)) {
          // Check line of sight
          if (this.hasLineOfSight(unit, enemy)) {
            closestTarget = enemy;
            closestDistance = distance;
          }
        }
      }
    }

    return closestTarget;
  }

  private hasLineOfSight(from: Unit, to: Unit): boolean {
    const map = this.game.currentMap;
    if (!map) return true;

    // If attacker is garrisoned, check from multiple points of the building
    if (from.isGarrisoned && from.garrisonedBuilding) {
      const b = from.garrisonedBuilding;
      const points = [
        VectorPool.acquire().set(b.x, 2, b.z), // Center
        VectorPool.acquire().set(b.x - b.width / 2, 2, b.z - b.depth / 2), // Corners
        VectorPool.acquire().set(b.x + b.width / 2, 2, b.z - b.depth / 2),
        VectorPool.acquire().set(b.x - b.width / 2, 2, b.z + b.depth / 2),
        VectorPool.acquire().set(b.x + b.width / 2, 2, b.z + b.depth / 2),
      ];

      const targetEndPos = VectorPool.acquire().copy(to.position).add(VectorPool.acquire().set(0, 2, 0));
      return points.some(p => this.checkLOSPath(p, targetEndPos));
    }

    const startPos = VectorPool.acquire().copy(from.position).add(VectorPool.acquire().set(0, 2, 0));
    const endPos = VectorPool.acquire().copy(to.position).add(VectorPool.acquire().set(0, 2, 0));

    return this.checkLOSPath(startPos, endPos);
  }

  private checkLOSPath(startPos: THREE.Vector3, endPos: THREE.Vector3): boolean {
    const map = this.game.currentMap;
    if (!map) return true;

    const direction = VectorPool.acquire().subVectors(endPos, startPos);
    const distance = direction.length();

    // Sample points along the line (every 10m - optimization)
    const steps = Math.ceil(distance / 10);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const point = VectorPool.acquire().lerpVectors(startPos, endPos, t);

      // 1. Check terrain elevation blocking
      const terrainHeight = this.game.getElevationAt(point.x, point.z);
      if (terrainHeight > point.y) {
        return false;
      }

      // 2. Check for buildings blocking
      const terrain = this.game.getTerrainAt(point.x, point.z);
      if (terrain?.type === 'building') {
        const building = this.game.buildingManager.getBuildingAt(point);
        if (building) {
          // Check if ray is below building top
          if (point.y < building.height) {
            // Ignore building if it's the one we are in or the one target is in
            // (already partially handled by t check, but this is more robust)
            if (t > 0.1 && t < 0.9) return false;
          }
        }
      }

      // 3. Check for forests blocking
      if (terrain?.type === 'forest') {
        // Forests block at approx 15m height
        if (point.y < 15) {
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
