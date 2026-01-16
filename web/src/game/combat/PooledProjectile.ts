import * as THREE from 'three';
import type { IPoolable } from '../utils/ObjectPool';

export class PooledProjectile implements IPoolable {
  mesh: THREE.Mesh;
  active: boolean = false;

  // Projectile data
  start: THREE.Vector3 = new THREE.Vector3();
  target: THREE.Vector3 = new THREE.Vector3();
  progress: number = 0;
  speed: number = 0;
  sourceTeam: 'player' | 'enemy' | 'ally' = 'player';
  damage: number = 0;
  targetUnitId: string = '';
  weaponId: string = '';
  attackerId: string = '';

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
  }

  reset(): void {
    this.mesh.visible = false;
    this.progress = 0;
    this.speed = 0;
    this.damage = 0;
    this.targetUnitId = '';
    this.weaponId = '';
    this.attackerId = '';
  }

  activate(
    start: THREE.Vector3,
    target: THREE.Vector3,
    speed: number,
    damage: number,
    sourceTeam: 'player' | 'enemy' | 'ally',
    targetUnitId: string,
    weaponId: string,
    attackerId: string,
    material: THREE.Material
  ): void {
    this.start.copy(start);
    this.target.copy(target);
    this.speed = speed;
    this.damage = damage;
    this.sourceTeam = sourceTeam;
    this.targetUnitId = targetUnitId;
    this.weaponId = weaponId;
    this.attackerId = attackerId;
    this.progress = 0;
    this.mesh.material = material;
    this.mesh.position.copy(start);
    this.mesh.visible = true;
    this.active = true;
  }
}
