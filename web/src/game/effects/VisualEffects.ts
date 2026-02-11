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
  pooledSprite?: PooledSprite; // Reference to pooled sprite for efficient release
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
    const scene = this.game.scene;

    // Factory closures add sprites to scene so both pre-warmed
    // and dynamically-grown sprites are always renderable
    this.muzzleFlashPool = new ObjectPool<PooledSprite>(
      () => {
        const ps = new PooledSprite(this.muzzleFlashTexture, 'muzzle');
        scene.add(ps.sprite);
        return ps;
      },
      50,
      200
    );

    this.explosionPool = new ObjectPool<PooledSprite>(
      () => {
        const ps = new PooledSprite(this.explosionTexture, 'explosion');
        scene.add(ps.sprite);
        return ps;
      },
      30,
      100
    );

    this.smokePuffPool = new ObjectPool<PooledSprite>(
      () => {
        const ps = new PooledSprite(this.smokePuffTexture, 'smoke');
        scene.add(ps.sprite);
        return ps;
      },
      30,
      100
    );
  }

  /**
   * Create reusable muzzle flash texture
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

    // Acquire pooled sprite
    const pooledSprite = this.muzzleFlashPool.acquire();

    if (!pooledSprite) {
      console.warn('VisualEffects: Muzzle flash pool exhausted');
      return;
    }

    // Set material blending mode for muzzle flash
    if (pooledSprite.sprite.material instanceof THREE.SpriteMaterial) {
      pooledSprite.sprite.material.blending = THREE.AdditiveBlending;
    }

    // Activate sprite with base position, duration, and scale
    pooledSprite.activate(position, 0.1, 1.5);

    // Offset slightly forward in firing direction (avoid allocation)
    pooledSprite.sprite.position.addScaledVector(direction, 2);

    // Set render order for proper layering
    pooledSprite.sprite.renderOrder = 1500;

    const effect: Effect = {
      id,
      mesh: pooledSprite.sprite,
      timeAlive: 0,
      duration: 0.1, // Very short duration (100ms)
      pooledSprite, // Store reference for efficient pool release
    };

    this.effects.set(id, effect);
  }

  /**
   * Create an explosion effect at impact
   */
  createExplosion(position: THREE.Vector3, size: number = 1): void {
    const id = `explosion_${this.nextId++}`;

    // Acquire pooled sprite
    const pooledSprite = this.explosionPool.acquire();

    if (!pooledSprite) {
      console.warn('VisualEffects: Explosion pool exhausted');
      return;
    }

    // Set material blending mode for explosion
    if (pooledSprite.sprite.material instanceof THREE.SpriteMaterial) {
      pooledSprite.sprite.material.blending = THREE.AdditiveBlending;
    }

    // Activate sprite with base position, duration, and scale
    pooledSprite.activate(position, 0.3, size * 2);

    // Offset slightly above ground
    pooledSprite.sprite.position.y += 0.5;

    // Set render order for proper layering
    pooledSprite.sprite.renderOrder = 1500;

    const effect: Effect = {
      id,
      mesh: pooledSprite.sprite,
      timeAlive: 0,
      duration: 0.3, // 300ms
      pooledSprite, // Store reference for efficient pool release
    };

    this.effects.set(id, effect);
  }

  /**
   * Create a smoke puff effect
   */
  createSmokePuff(position: THREE.Vector3): void {
    const id = `smoke_${this.nextId++}`;

    // Acquire pooled sprite
    const pooledSprite = this.smokePuffPool.acquire();

    if (!pooledSprite) {
      console.warn('VisualEffects: Smoke puff pool exhausted');
      return;
    }

    // Set material blending mode for smoke puff
    if (pooledSprite.sprite.material instanceof THREE.SpriteMaterial) {
      pooledSprite.sprite.material.blending = THREE.NormalBlending;
    }

    // Activate sprite with base position, duration, and scale
    pooledSprite.activate(position, 0.5, 2);

    // Offset slightly above ground
    pooledSprite.sprite.position.y += 1;

    // Set render order for proper layering
    pooledSprite.sprite.renderOrder = 1400;

    const effect: Effect = {
      id,
      mesh: pooledSprite.sprite,
      timeAlive: 0,
      duration: 0.5, // 500ms
      pooledSprite, // Store reference for efficient pool release
    };

    this.effects.set(id, effect);
  }

  /**
   * Create a unit destruction effect
   */
  createDestructionEffect(position: THREE.Vector3): void {
    // Create a larger explosion
    this.createExplosion(position, 2);

    // Pre-compute smoke positions before setTimeout (VectorPool uses
    // frame-based reset so cannot be used across async boundaries)
    const smokePositions: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      smokePositions.push(new THREE.Vector3(
        position.x + (Math.random() - 0.5) * 2,
        position.y,
        position.z + (Math.random() - 0.5) * 2
      ));
    }

    for (let i = 0; i < 3; i++) {
      const smokePos = smokePositions[i]!;
      setTimeout(() => {
        this.createSmokePuff(smokePos);
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
   * Remove an effect and return sprite to pool
   */
  private removeEffect(id: string): void {
    const effect = this.effects.get(id);
    if (!effect) return;

    // Check if this is a pooled sprite
    if (effect.pooledSprite) {
      // Return to appropriate pool based on effect type
      if (id.startsWith('muzzle_')) {
        this.muzzleFlashPool.release(effect.pooledSprite);
      } else if (id.startsWith('explosion_')) {
        this.explosionPool.release(effect.pooledSprite);
      } else if (id.startsWith('smoke_')) {
        this.smokePuffPool.release(effect.pooledSprite);
      }
    } else if (effect.mesh instanceof THREE.Sprite) {
      // Legacy non-pooled sprite - dispose normally
      this.game.scene.remove(effect.mesh);
      const material = effect.mesh.material as THREE.SpriteMaterial;
      if (material.map) material.map.dispose();
      material.dispose();
    } else if (effect.mesh instanceof THREE.Mesh) {
      // Non-sprite effects (if any)
      this.game.scene.remove(effect.mesh);
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

  /**
   * Dispose all GPU resources (textures, materials, sprites)
   */
  dispose(): void {
    this.clear();

    const disposePool = (pool: ObjectPool<PooledSprite>) => {
      pool.forEach((ps) => {
        this.game.scene.remove(ps.sprite);
        if (ps.sprite.material instanceof THREE.SpriteMaterial) {
          ps.sprite.material.dispose();
        }
      });
    };

    if (this.muzzleFlashPool) disposePool(this.muzzleFlashPool);
    if (this.explosionPool) disposePool(this.explosionPool);
    if (this.smokePuffPool) disposePool(this.smokePuffPool);

    this.muzzleFlashTexture.dispose();
    this.explosionTexture.dispose();
    this.smokePuffTexture.dispose();
  }
}
