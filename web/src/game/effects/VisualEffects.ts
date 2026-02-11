/**
 * VisualEffects - Manages particle effects for combat
 * Muzzle flashes, explosions, smoke puffs, etc.
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';

interface Effect {
  id: string;
  mesh: THREE.Mesh | THREE.Sprite;
  timeAlive: number;
  duration: number;
}

interface MuzzleLight {
  light: THREE.PointLight;
  active: boolean;
  timeAlive: number;
  duration: number;
  initialIntensity: number;
}

interface Particle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  angularVelocity: number;
  scaleGrowth: number;
  initialScale: number;
  fadeRate: number;
  active: boolean;
  timeAlive: number;
  duration: number;
}

/**
 * Particle pool for efficient particle system
 * Reuses sprites to avoid GC pressure during heavy combat
 */
class ParticlePool {
  private particles: Particle[] = [];
  private readonly POOL_SIZE = 100;

  constructor(private scene: THREE.Scene) {
    // Preallocate particle pool
    for (let i = 0; i < this.POOL_SIZE; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    const sprite = new THREE.Sprite();
    sprite.visible = false;
    sprite.renderOrder = 1400;
    this.scene.add(sprite);

    return {
      sprite,
      velocity: new THREE.Vector3(),
      acceleration: new THREE.Vector3(),
      angularVelocity: 0,
      scaleGrowth: 0,
      initialScale: 1,
      fadeRate: 1,
      active: false,
      timeAlive: 0,
      duration: 1,
    };
  }

  acquire(): Particle | null {
    // Find inactive particle
    for (const particle of this.particles) {
      if (!particle.active) {
        particle.active = true;
        particle.timeAlive = 0;
        return particle;
      }
    }

    // Expand pool if needed
    if (this.particles.length < 500) {
      const particle = this.createParticle();
      particle.active = true;
      this.particles.push(particle);
      return particle;
    }

    return null;
  }

  release(particle: Particle): void {
    particle.active = false;
    particle.sprite.visible = false;
    if (particle.sprite.material.map) {
      particle.sprite.material.map.dispose();
      particle.sprite.material.map = null;
    }
  }

  update(dt: number): void {
    for (const particle of this.particles) {
      if (!particle.active) continue;

      particle.timeAlive += dt;

      // Update physics
      particle.velocity.add(
        particle.acceleration.clone().multiplyScalar(dt)
      );
      particle.sprite.position.add(
        particle.velocity.clone().multiplyScalar(dt)
      );

      // Update scale
      const scale =
        particle.initialScale + particle.scaleGrowth * particle.timeAlive;
      particle.sprite.scale.set(scale, scale, 1);

      // Update opacity (fade out)
      const progress = particle.timeAlive / particle.duration;
      const material = particle.sprite.material as THREE.SpriteMaterial;
      material.opacity = Math.max(0, 1 - progress * particle.fadeRate);

      // Rotate sprite
      particle.sprite.material.rotation +=
        particle.angularVelocity * dt;

      // Release expired particles
      if (particle.timeAlive >= particle.duration) {
        this.release(particle);
      }
    }
  }

  clear(): void {
    for (const particle of this.particles) {
      if (particle.active) {
        this.release(particle);
      }
    }
  }
}

/**
 * Light pool for efficient muzzle flash lighting
 * Reuses PointLight objects to avoid GC pressure during heavy combat
 */
class LightPool {
  private lights: MuzzleLight[] = [];
  private readonly POOL_SIZE = 20;
  private readonly MAX_ACTIVE_LIGHTS = 15; // Limit to prevent performance impact

  constructor(private scene: THREE.Scene) {
    // Preallocate light pool
    for (let i = 0; i < this.POOL_SIZE; i++) {
      this.lights.push(this.createLight());
    }
  }

  private createLight(): MuzzleLight {
    const light = new THREE.PointLight(0xffaa44, 0, 10, 2);
    light.castShadow = false; // Disable shadows for performance
    light.visible = false;
    this.scene.add(light);

    return {
      light,
      active: false,
      timeAlive: 0,
      duration: 0.12,
      initialIntensity: 2,
    };
  }

  acquire(): MuzzleLight | null {
    // Count active lights
    let activeCount = 0;
    for (const light of this.lights) {
      if (light.active) activeCount++;
    }

    // Limit max active lights for performance
    if (activeCount >= this.MAX_ACTIVE_LIGHTS) {
      return null;
    }

    // Find inactive light
    for (const light of this.lights) {
      if (!light.active) {
        light.active = true;
        light.timeAlive = 0;
        return light;
      }
    }

    // Expand pool if needed (but respect max active limit)
    if (this.lights.length < this.POOL_SIZE * 2) {
      const light = this.createLight();
      light.active = true;
      this.lights.push(light);
      return light;
    }

    return null;
  }

  release(muzzleLight: MuzzleLight): void {
    muzzleLight.active = false;
    muzzleLight.light.visible = false;
    muzzleLight.light.intensity = 0;
  }

  update(dt: number): void {
    for (const muzzleLight of this.lights) {
      if (!muzzleLight.active) continue;

      muzzleLight.timeAlive += dt;

      // Fade out light intensity over duration
      const progress = muzzleLight.timeAlive / muzzleLight.duration;
      muzzleLight.light.intensity =
        muzzleLight.initialIntensity * (1 - progress);

      // Release expired lights
      if (muzzleLight.timeAlive >= muzzleLight.duration) {
        this.release(muzzleLight);
      }
    }
  }

  clear(): void {
    for (const light of this.lights) {
      if (light.active) {
        this.release(light);
      }
    }
  }
}

export class VisualEffectsManager {
  private readonly game: Game;
  private effects: Map<string, Effect> = new Map();
  private nextId = 0;
  private particlePool: ParticlePool;
  private lightPool: LightPool;

  constructor(game: Game) {
    this.game = game;
    this.particlePool = new ParticlePool(game.scene);
    this.lightPool = new LightPool(game.scene);
  }

  /**
   * Create a sprite texture with radial gradient
   */
  private createParticleTexture(
    colors: string[],
    size: number = 128
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not get canvas context');
    }

    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );

    // Add color stops
    for (let i = 0; i < colors.length; i++) {
      gradient.addColorStop(i / (colors.length - 1), colors[i]);
    }

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

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

    // Add dynamic point light for muzzle flash
    const muzzleLight = this.lightPool.acquire();
    if (muzzleLight) {
      muzzleLight.light.position.copy(position);
      muzzleLight.light.position.add(direction.clone().multiplyScalar(2));
      muzzleLight.light.intensity = muzzleLight.initialIntensity;
      muzzleLight.light.visible = true;
      muzzleLight.duration = 0.12; // 120ms duration
    }
  }

  /**
   * Create an explosion effect at impact with multiple particles
   */
  createExplosion(position: THREE.Vector3, size: number = 1): void {
    // Bright flash particle (very brief, additive)
    const flashParticle = this.particlePool.acquire();
    if (flashParticle) {
      const flashTexture = this.createParticleTexture([
        'rgba(255, 255, 255, 1)',
        'rgba(255, 255, 200, 0.8)',
        'rgba(255, 200, 100, 0)',
      ]);

      flashParticle.sprite.material = new THREE.SpriteMaterial({
        map: flashTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      flashParticle.sprite.position.copy(position);
      flashParticle.sprite.position.y += 0.5;
      flashParticle.initialScale = size * 1.5;
      flashParticle.sprite.scale.set(size * 1.5, size * 1.5, 1);
      flashParticle.sprite.renderOrder = 1550;
      flashParticle.sprite.visible = true;
      flashParticle.velocity.set(0, 0, 0);
      flashParticle.acceleration.set(0, 0, 0);
      flashParticle.scaleGrowth = size * 2;
      flashParticle.fadeRate = 3;
      flashParticle.angularVelocity = 0;
      flashParticle.duration = 0.15;
    }

    // Fireball particle (orange/red)
    const fireballParticle = this.particlePool.acquire();
    if (fireballParticle) {
      const fireballTexture = this.createParticleTexture([
        'rgba(255, 220, 100, 1)',
        'rgba(255, 150, 0, 1)',
        'rgba(255, 80, 0, 0.8)',
        'rgba(150, 50, 0, 0.4)',
        'rgba(80, 30, 0, 0)',
      ]);

      fireballParticle.sprite.material = new THREE.SpriteMaterial({
        map: fireballTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      fireballParticle.sprite.position.copy(position);
      fireballParticle.sprite.position.y += 0.5;
      fireballParticle.initialScale = size * 1.2;
      fireballParticle.sprite.scale.set(size * 1.2, size * 1.2, 1);
      fireballParticle.sprite.renderOrder = 1525;
      fireballParticle.sprite.visible = true;
      fireballParticle.velocity.set(0, 1, 0);
      fireballParticle.acceleration.set(0, -0.5, 0);
      fireballParticle.scaleGrowth = size * 3;
      fireballParticle.fadeRate = 1.5;
      fireballParticle.angularVelocity = Math.random() - 0.5;
      fireballParticle.duration = 0.4;
    }

    // Smoke plumes (3-5 particles)
    const smokeCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < smokeCount; i++) {
      const smokeParticle = this.particlePool.acquire();
      if (smokeParticle) {
        const smokeTexture = this.createParticleTexture([
          'rgba(120, 120, 120, 0.9)',
          'rgba(90, 90, 90, 0.6)',
          'rgba(70, 70, 70, 0.3)',
          'rgba(50, 50, 50, 0)',
        ]);

        smokeParticle.sprite.material = new THREE.SpriteMaterial({
          map: smokeTexture,
          transparent: true,
          depthWrite: false,
        });

        // Random offset
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * size * 0.5,
          0,
          (Math.random() - 0.5) * size * 0.5
        );
        smokeParticle.sprite.position.copy(position).add(offset);
        smokeParticle.sprite.position.y += 0.3;
        smokeParticle.initialScale = size * 1.5;
        smokeParticle.sprite.scale.set(size * 1.5, size * 1.5, 1);
        smokeParticle.sprite.renderOrder = 1500;
        smokeParticle.sprite.visible = true;

        // Smoke rises and drifts
        smokeParticle.velocity.set(
          (Math.random() - 0.5) * 0.5,
          1 + Math.random() * 0.5,
          (Math.random() - 0.5) * 0.5
        );
        smokeParticle.acceleration.set(0, -0.2, 0);
        smokeParticle.scaleGrowth = size * 2;
        smokeParticle.fadeRate = 1;
        smokeParticle.angularVelocity = (Math.random() - 0.5) * 2;
        smokeParticle.duration = 0.6 + Math.random() * 0.3;
      }
    }

    // Optional debris particles (small dark particles)
    if (size > 1) {
      const debrisCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < debrisCount; i++) {
        const debrisParticle = this.particlePool.acquire();
        if (debrisParticle) {
          const debrisTexture = this.createParticleTexture([
            'rgba(60, 40, 20, 1)',
            'rgba(40, 30, 20, 0.8)',
            'rgba(30, 20, 10, 0)',
          ], 64);

          debrisParticle.sprite.material = new THREE.SpriteMaterial({
            map: debrisTexture,
            transparent: true,
            depthWrite: false,
          });
          debrisParticle.sprite.position.copy(position);
          debrisParticle.sprite.position.y += 0.5;
          debrisParticle.initialScale = size * 0.3;
          debrisParticle.sprite.scale.set(size * 0.3, size * 0.3, 1);
          debrisParticle.sprite.renderOrder = 1480;
          debrisParticle.sprite.visible = true;

          // Debris shoots outward
          const angle = (Math.PI * 2 * i) / debrisCount;
          const speed = 3 + Math.random() * 2;
          debrisParticle.velocity.set(
            Math.cos(angle) * speed,
            2 + Math.random() * 2,
            Math.sin(angle) * speed
          );
          debrisParticle.acceleration.set(0, -9.8, 0);
          debrisParticle.scaleGrowth = 0;
          debrisParticle.fadeRate = 1.2;
          debrisParticle.angularVelocity = (Math.random() - 0.5) * 10;
          debrisParticle.duration = 0.5 + Math.random() * 0.2;
        }
      }
    }
  }

  /**
   * Create a realistic smoke puff effect with rising and expanding particles
   */
  createSmokePuff(position: THREE.Vector3): void {
    // Create 2-3 smoke particles for a fuller effect
    const smokeCount = 2 + Math.floor(Math.random() * 2);

    for (let i = 0; i < smokeCount; i++) {
      const smokeParticle = this.particlePool.acquire();
      if (smokeParticle) {
        // Varied smoke colors for more organic look
        const grayValue = 80 + Math.floor(Math.random() * 40);
        const smokeTexture = this.createParticleTexture([
          `rgba(${grayValue + 20}, ${grayValue + 20}, ${grayValue + 20}, 0.9)`,
          `rgba(${grayValue}, ${grayValue}, ${grayValue}, 0.6)`,
          `rgba(${grayValue - 20}, ${grayValue - 20}, ${grayValue - 20}, 0.3)`,
          `rgba(${grayValue - 30}, ${grayValue - 30}, ${grayValue - 30}, 0)`,
        ]);

        smokeParticle.sprite.material = new THREE.SpriteMaterial({
          map: smokeTexture,
          transparent: true,
          depthWrite: false,
        });

        // Slight random offset for each puff
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          0,
          (Math.random() - 0.5) * 0.3
        );
        smokeParticle.sprite.position.copy(position).add(offset);
        smokeParticle.sprite.position.y += 0.8 + i * 0.2;
        smokeParticle.initialScale = 1.5 + Math.random() * 0.5;
        smokeParticle.sprite.scale.set(
          smokeParticle.initialScale,
          smokeParticle.initialScale,
          1
        );
        smokeParticle.sprite.renderOrder = 1400;
        smokeParticle.sprite.visible = true;

        // Smoke rises and drifts slightly
        smokeParticle.velocity.set(
          (Math.random() - 0.5) * 0.3,
          1.5 + Math.random() * 0.5,
          (Math.random() - 0.5) * 0.3
        );
        smokeParticle.acceleration.set(0, -0.3, 0); // Gradual slowdown
        smokeParticle.scaleGrowth = 2 + Math.random() * 0.5; // Expands as it rises
        smokeParticle.fadeRate = 1.2;
        smokeParticle.angularVelocity = (Math.random() - 0.5) * 1.5; // Slow rotation
        smokeParticle.duration = 0.7 + Math.random() * 0.3;
      }
    }
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
   * Update all effects and particles
   */
  update(dt: number): void {
    // Update particle system
    this.particlePool.update(dt);

    // Update light pool
    this.lightPool.update(dt);

    // Update legacy effects (muzzle flashes still use this)
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
   * Clear all effects and particles
   */
  clear(): void {
    for (const id of Array.from(this.effects.keys())) {
      this.removeEffect(id);
    }
    this.particlePool.clear();
    this.lightPool.clear();
  }
}
