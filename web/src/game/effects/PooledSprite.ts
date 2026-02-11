import * as THREE from 'three';
import type { IPoolable } from '../utils/ObjectPool';

export type EffectType = 'muzzle' | 'explosion' | 'smoke';

export class PooledSprite implements IPoolable {
  sprite: THREE.Sprite;
  active: boolean = false;
  effectType: EffectType;

  // Effect animation data
  timeAlive: number = 0;
  duration: number = 0;
  initialScale: number = 1;
  targetScale: number = 1;

  constructor(texture: THREE.Texture, effectType: EffectType) {
    this.effectType = effectType;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.visible = false;
  }

  reset(): void {
    this.sprite.visible = false;
    this.sprite.position.set(0, 0, 0);
    this.sprite.scale.set(1, 1, 1);
    if (this.sprite.material instanceof THREE.SpriteMaterial) {
      this.sprite.material.opacity = 1;
    }
    this.timeAlive = 0;
    this.duration = 0;
    this.initialScale = 1;
    this.targetScale = 1;
  }

  activate(
    position: THREE.Vector3,
    duration: number,
    scale: THREE.Vector2 | number = 1
  ): void {
    this.sprite.position.copy(position);
    this.sprite.visible = true;
    this.timeAlive = 0;
    this.duration = duration;
    this.active = true;

    // Handle scale (can be Vector2 or number)
    if (typeof scale === 'number') {
      this.sprite.scale.set(scale, scale, 1);
      this.initialScale = scale;
      this.targetScale = scale;
    } else {
      this.sprite.scale.set(scale.x, scale.y, 1);
      this.initialScale = Math.max(scale.x, scale.y);
      this.targetScale = this.initialScale;
    }

    // Reset opacity
    if (this.sprite.material instanceof THREE.SpriteMaterial) {
      this.sprite.material.opacity = 1;
    }
  }
}
