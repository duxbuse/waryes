/**
 * DamageNumbers - Displays floating damage numbers above units when hit
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';

interface DamageNumber {
  id: string;
  mesh: THREE.Sprite;
  startY: number;
  timeAlive: number;
  duration: number;
}

export class DamageNumberManager {
  private readonly game: Game;
  private numbers: Map<string, DamageNumber> = new Map();
  private nextId = 0;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Create a damage number at a position
   */
  createDamageNumber(
    position: THREE.Vector3,
    damage: number,
    isCritical: boolean = false
  ): void {
    const id = `dmg_${this.nextId++}`;

    // Create canvas for text
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Background (optional, can be transparent)
    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Text styling
    const fontSize = isCritical ? 48 : 36;
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Color based on critical
    context.fillStyle = isCritical ? '#ffff00' : '#ffffff';

    // Add stroke for visibility
    context.strokeStyle = '#000000';
    context.lineWidth = 3;
    context.strokeText(Math.round(damage).toString(), 64, 32);
    context.fillText(Math.round(damage).toString(), 64, 32);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create sprite
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.position.y += 2; // Start above unit
    sprite.scale.set(2, 1, 1);
    sprite.renderOrder = 2000; // Render on top
    this.game.scene.add(sprite);

    const damageNumber: DamageNumber = {
      id,
      mesh: sprite,
      startY: sprite.position.y,
      timeAlive: 0,
      duration: 1.5, // 1.5 seconds
    };

    this.numbers.set(id, damageNumber);
  }

  /**
   * Update all damage numbers
   */
  update(dt: number): void {
    const toRemove: string[] = [];

    for (const [id, dmgNum] of this.numbers.entries()) {
      dmgNum.timeAlive += dt;

      // Animate upward and fade
      const progress = dmgNum.timeAlive / dmgNum.duration;
      dmgNum.mesh.position.y = dmgNum.startY + progress * 2; // Rise 2 meters

      // Fade out
      const material = dmgNum.mesh.material as THREE.SpriteMaterial;
      material.opacity = Math.max(0, 1 - progress);

      if (dmgNum.timeAlive >= dmgNum.duration) {
        toRemove.push(id);
      }
    }

    // Remove expired numbers
    for (const id of toRemove) {
      this.removeDamageNumber(id);
    }
  }

  /**
   * Remove a damage number
   */
  private removeDamageNumber(id: string): void {
    const dmgNum = this.numbers.get(id);
    if (!dmgNum) return;

    // Remove from scene
    this.game.scene.remove(dmgNum.mesh);

    // Dispose resources
    const material = dmgNum.mesh.material as THREE.SpriteMaterial;
    if (material.map) material.map.dispose();
    material.dispose();

    this.numbers.delete(id);
  }

  /**
   * Clear all damage numbers
   */
  clear(): void {
    for (const id of Array.from(this.numbers.keys())) {
      this.removeDamageNumber(id);
    }
  }
}
