import * as THREE from 'three';
import type { IPoolable } from '../utils/ObjectPool';
import type { Unit } from '../units/Unit';
import type { WeaponData } from '../../data/types';
import { VectorPool } from '../utils/VectorPool';

export class PooledProjectile implements IPoolable {
  mesh: THREE.Mesh;
  tracer: THREE.Line;
  active: boolean = false;

  // Projectile data matching the Projectile interface
  id: string = '';
  start: THREE.Vector3 = new THREE.Vector3();
  target: THREE.Vector3 = new THREE.Vector3();
  speed: number = 0;
  damage: number = 0;
  penetration: number = 0;
  suppression: number = 0;
  sourceTeam: 'player' | 'enemy' = 'player';
  targetUnit: Unit | undefined = undefined;
  attackerUnit: Unit | undefined = undefined;
  weaponIndex: number = 0;
  timeAlive: number = 0;
  maxTime: number = 0;
  weaponData: WeaponData | null = null;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, tracerMaterial: THREE.LineBasicMaterial) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;

    // Create tracer line
    const tracerGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points * 3 coordinates
    tracerGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.tracer = new THREE.Line(tracerGeometry, tracerMaterial);
    this.tracer.visible = false;
    this.tracer.renderOrder = 1000;
  }

  reset(): void {
    this.mesh.visible = false;
    this.tracer.visible = false;
    this.id = '';
    this.speed = 0;
    this.damage = 0;
    this.penetration = 0;
    this.suppression = 0;
    this.targetUnit = undefined;
    this.attackerUnit = undefined;
    this.weaponIndex = 0;
    this.timeAlive = 0;
    this.maxTime = 0;
    this.weaponData = null;
  }

  activate(
    id: string,
    start: THREE.Vector3,
    target: THREE.Vector3,
    speed: number,
    damage: number,
    penetration: number,
    suppression: number,
    sourceTeam: 'player' | 'enemy',
    targetUnit: Unit | undefined,
    attackerUnit: Unit | undefined,
    weaponIndex: number,
    maxTime: number,
    weaponData: WeaponData,
    material: THREE.Material,
    tracerMaterial: THREE.LineBasicMaterial
  ): void {
    this.id = id;
    this.start.copy(start);
    this.target.copy(target);
    this.speed = speed;
    this.damage = damage;
    this.penetration = penetration;
    this.suppression = suppression;
    this.sourceTeam = sourceTeam;
    this.targetUnit = targetUnit;
    this.attackerUnit = attackerUnit;
    this.weaponIndex = weaponIndex;
    this.timeAlive = 0;
    this.maxTime = maxTime;
    this.weaponData = weaponData;
    this.mesh.material = material;
    this.mesh.position.copy(start);
    this.mesh.visible = true;
    this.tracer.material = tracerMaterial;
    this.tracer.visible = true;
    this.active = true;
  }

  /**
   * Update tracer line to trail behind projectile
   * @param tracerLength Length of the tracer trail in meters
   */
  updateTracer(tracerLength: number = 15): void {
    const positions = this.tracer.geometry.attributes.position;
    if (!positions) return;

    const currentPos = this.mesh.position;
    const direction = VectorPool.acquire().subVectors(currentPos, this.start).normalize();
    const trailStart = VectorPool.acquire().copy(currentPos).sub(direction.multiplyScalar(tracerLength));

    // Update line positions (start of trail -> current position)
    const array = positions.array as Float32Array;
    array[0] = trailStart.x;
    array[1] = trailStart.y;
    array[2] = trailStart.z;
    array[3] = currentPos.x;
    array[4] = currentPos.y;
    array[5] = currentPos.z;

    positions.needsUpdate = true;

    // Release pooled vectors
    VectorPool.release(direction);
    VectorPool.release(trailStart);
  }
}
