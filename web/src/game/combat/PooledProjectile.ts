import * as THREE from 'three';
import type { IPoolable } from '../utils/ObjectPool';
import type { Unit } from '../units/Unit';
import type { WeaponData } from '../../data/types';

export class PooledProjectile implements IPoolable {
  mesh: THREE.Mesh;
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

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
  }

  reset(): void {
    this.mesh.visible = false;
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
    material: THREE.Material
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
    this.active = true;
  }
}
