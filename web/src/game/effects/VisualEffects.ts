/**
 * VisualEffects - Manages particle effects for combat
 * Muzzle flashes, explosions, smoke puffs, etc.
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { ObjectPool } from '../utils/ObjectPool';
import { PooledSprite } from './PooledSprite';

interface Effect {
  id: string;
  mesh: THREE.Mesh | THREE.Sprite;
  timeAlive: number;
  duration: number;
}

export class VisualEffectsManager {
  private readonly game: Game;
  private effects: Map<string, Effect> = new Map();
  private nextId = 0;

  // Shared textures
  private muzzleFlashTexture: THREE.CanvasTexture;
  private explosionTexture: THREE.CanvasTexture;
  private smokePuffTexture: THREE.CanvasTexture;

  // Sprite pools
  private muzzleFlashPool!: ObjectPool<PooledSprite>;
  private explosionPool!: ObjectPool<PooledSprite>;
  private smokePuffPool!: ObjectPool<PooledSprite>;

  constructor(game: Game) {
    this.game = game;

    // Initialize shared textures
    this.muzzleFlashTexture = this.createMuzzleFlashTexture();
    this.explosionTexture = this.createExplosionTexture();
    this.smokePuffTexture = this.createSmokePuffTexture();
  }

  initialize(): void {
    // Initialize muzzle flash pool (50 initial, 200 max)
    this.muzzleFlashPool = new ObjectPool<PooledSprite>(
      () => new PooledSprite(this.muzzleFlashTexture, 'muzzle'),
      50,
      200
    );

    // Initialize explosion pool (30 initial, 100 max)
    this.explosionPool = new ObjectPool<PooledSprite>(
      () => new PooledSprite(this.explosionTexture, 'explosion'),
      30,
      100
    );

    // Initialize smoke puff pool (30 initial, 100 max)
    this.smokePuffPool = new ObjectPool<PooledSprite>(
      () => new PooledSprite(this.smokePuffTexture, 'smoke'),
      30,
      100
    );

    // Pre-warm pools and add all sprites to scene
    for (let i = 0; i < 50; i++) {
      const sprite = this.muzzleFlashPool.acquire();
      if (sprite) {
        this.game.scene.add(sprite.sprite);
        this.muzzleFlashPool.release(sprite);
      }
    }

    for (let i = 0; i < 30; i++) {
      const sprite = this.explosionPool.acquire();
      if (sprite) {
        this.game.scene.add(sprite.sprite);
        this.explosionPool.release(sprite);
      }
    }

    for (let i = 0; i < 30; i++) {
      const sprite = this.smokePuffPool.acquire();
      if (sprite) {
        this.game.scene.add(sprite.sprite);
        this.smokePuffPool.release(sprite);
      }
    }
  }

  /**
   * Create reusable muzzle flash texture
   * @note Will be used during pool initialization in subtask 1-3
   */
  private createMuzzleFlashTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to get 2D context for muzzle flash texture');
    }

    // Create radial gradient (bright center, fading out)
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Create reusable explosion texture
   * @note Will be used during pool initialization in subtask 1-3
   */
  private createExplosionTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to get 2D context for explosion texture');
    }

    // Create radial gradient for explosion
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 200, 0, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.8)');
    gradient.addColorStop(0.8, 'rgba(100, 50, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(50, 50, 50, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Create reusable smoke puff texture
   * @note Will be used during pool initialization in subtask 1-3
   */
  private createSmokePuffTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to get 2D context for smoke puff texture');
    }

    // Create radial gradient for smoke
    const gradient = context.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(100, 100, 100, 0.8)');
    gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.4)');
    gradient.addColorStop(1, 'rgba(60, 60, 60, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Create a muzzle flash effect at a position
   */
  createMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3): void {
    const id = `muzzle_${this.nextId++}`;

    // Create a simple bright sprite for muzzle flash
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Create radial gradient (bright center, fading out)
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    // Offset slightly forward in firing direction
    sprite.position.add(direction.clone().multiplyScalar(2));
    sprite.scale.set(1.5, 1.5, 1);
    sprite.renderOrder = 1500;
    this.game.scene.add(sprite);

    const effect: Effect = {
      id,
      mesh: sprite,
      timeAlive: 0,
      duration: 0.1, // Very short duration (100ms)
    };

    this.effects.set(id, effect);
  }

  /**
   * Create an explosion effect at impact
   */
  createExplosion(position: THREE.Vector3, size: number = 1): void {
    const id = `explosion_${this.nextId++}`;

    // Create explosion sprite
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Create radial gradient for explosion
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 200, 0, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.8)');
    gradient.addColorStop(0.8, 'rgba(100, 50, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(50, 50, 50, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.position.y += 0.5; // Slightly above ground
    sprite.scale.set(size * 2, size * 2, 1);
    sprite.renderOrder = 1500;
    this.game.scene.add(sprite);

    const effect: Effect = {
      id,
      mesh: sprite,
      timeAlive: 0,
      duration: 0.3, // 300ms
    };

    this.effects.set(id, effect);
  }

  /**
   * Create a smoke puff effect
   */
  createSmokePuff(position: THREE.Vector3): void {
    const id = `smoke_${this.nextId++}`;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Create radial gradient for smoke
    const gradient = context.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(100, 100, 100, 0.8)');
    gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.4)');
    gradient.addColorStop(1, 'rgba(60, 60, 60, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.position.y += 1;
    sprite.scale.set(2, 2, 1);
    sprite.renderOrder = 1400;
    this.game.scene.add(sprite);

    const effect: Effect = {
      id,
      mesh: sprite,
      timeAlive: 0,
      duration: 0.5, // 500ms
    };

    this.effects.set(id, effect);
  }

  /**
   * Create a unit destruction effect
   */
  createDestructionEffect(position: THREE.Vector3): void {
    // Create a larger explosion
    this.createExplosion(position, 2);

    // Create multiple smoke puffs
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2
        );
        this.createSmokePuff(position.clone().add(offset));
      }, i * 100);
    }
  }

  /**
   * Update all effects
   */
  update(dt: number): void {
    const toRemove: string[] = [];

    for (const [id, effect] of this.effects.entries()) {
      effect.timeAlive += dt;

      // Fade out over time
      const progress = effect.timeAlive / effect.duration;
      if (effect.mesh instanceof THREE.Sprite) {
        const material = effect.mesh.material as THREE.SpriteMaterial;
        material.opacity = Math.max(0, 1 - progress);

        // Scale up slightly for explosions and smoke
        if (id.startsWith('explosion') || id.startsWith('smoke')) {
          const scale = 1 + progress * 0.5;
          effect.mesh.scale.set(scale * 2, scale * 2, 1);
        }
      }

      if (effect.timeAlive >= effect.duration) {
        toRemove.push(id);
      }
    }

    // Remove expired effects
    for (const id of toRemove) {
      this.removeEffect(id);
    }
  }

  /**
   * Remove an effect
   */
  private removeEffect(id: string): void {
    const effect = this.effects.get(id);
    if (!effect) return;

    this.game.scene.remove(effect.mesh);

    if (effect.mesh instanceof THREE.Sprite) {
      const material = effect.mesh.material as THREE.SpriteMaterial;
      if (material.map) material.map.dispose();
      material.dispose();
    } else if (effect.mesh instanceof THREE.Mesh) {
      effect.mesh.geometry.dispose();
      (effect.mesh.material as THREE.Material).dispose();
    }

    this.effects.delete(id);
  }

  /**
   * Clear all effects
   */
  clear(): void {
    for (const id of Array.from(this.effects.keys())) {
      this.removeEffect(id);
    }
  }
}
