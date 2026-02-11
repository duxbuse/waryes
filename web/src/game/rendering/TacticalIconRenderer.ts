import * as THREE from 'three';
import type { Unit } from '../units/Unit';
import type { Game } from '../../core/Game';
import type { UnitCategory } from '../../data/types';
import { LAYERS } from '../utils/LayerConstants';

/**
 * TacticalIconRenderer - Renders 2D tactical icons for units when zoomed out
 *
 * Benefits:
 * - Improves unit identification at strategic zoom levels
 * - Reduces visual clutter when viewing large battles
 * - Maintains performance with hundreds of units visible
 *
 * How it works:
 * - Creates canvas-based textures for each unit category
 * - Uses THREE.Sprite for each unit (billboarded automatically)
 * - Icons show team colors (blue for player, red for enemy)
 * - Scaled inversely with distance for readability
 */

interface UnitIconData {
  unitId: string;
  sprite: THREE.Sprite;
  category: UnitCategory;
}

export class TacticalIconRenderer {
  private game: Game;
  private scene: THREE.Scene;

  // Icon textures cached by category and team
  private iconTextures: Map<string, THREE.Texture> = new Map();

  // Active unit icons
  private unitIcons: Map<string, UnitIconData> = new Map();

  // Icon constants
  private readonly ICON_SIZE = 3.0; // Base size in world units
  private readonly CANVAS_SIZE = 128; // Canvas texture size in pixels

  // Scaling constants for zoom compensation
  private readonly MIN_SCALE = 1.0;
  private readonly MAX_SCALE = 4.0;
  private readonly NEAR_DISTANCE = 20;
  private readonly FAR_DISTANCE = 150;

  // Team colors
  private readonly TEAM_COLORS = {
    player: '#3B82F6', // Blue
    enemy: '#EF4444', // Red
  };

  // Reusable temp objects (avoid GC pressure)
  private readonly tempColor = new THREE.Color();

  // Icon shapes per category (NATO-style simplified)
  private readonly ICON_SHAPES: Record<UnitCategory, string> = {
    LOG: 'diamond', // Logistics - diamond
    INF: 'square', // Infantry - square
    TNK: 'rectangle', // Tank - rectangle
    REC: 'circle', // Reconnaissance - circle
    AA: 'hexagon', // Anti-Air - hexagon
    ART: 'cross', // Artillery - cross
    HEL: 'triangle', // Helicopter - triangle (pointing up)
    AIR: 'triangle-inverted', // Aircraft - inverted triangle
  };

  constructor(game: Game, scene: THREE.Scene) {
    this.game = game;
    this.scene = scene;
  }

  /**
   * Initialize the renderer - called once at game start
   */
  initialize(): void {
    console.log('[TacticalIconRenderer] Initialized');
    this.preloadIconTextures();
  }

  /**
   * Preload all icon textures for both teams
   */
  private preloadIconTextures(): void {
    const categories: UnitCategory[] = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
    const teams: ('player' | 'enemy')[] = ['player', 'enemy'];

    for (const category of categories) {
      for (const team of teams) {
        const key = `${category}_${team}`;
        const texture = this.createIconTexture(category, team);
        this.iconTextures.set(key, texture);
      }
    }

    console.log(`[TacticalIconRenderer] Preloaded ${this.iconTextures.size} icon textures`);
  }

  /**
   * Create an icon texture for a unit category and team
   */
  private createIconTexture(category: UnitCategory, team: 'player' | 'enemy'): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = this.CANVAS_SIZE;
    canvas.height = this.CANVAS_SIZE;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('[TacticalIconRenderer] Failed to get canvas context');
      return new THREE.Texture();
    }

    const centerX = this.CANVAS_SIZE / 2;
    const centerY = this.CANVAS_SIZE / 2;
    const size = this.CANVAS_SIZE * 0.35; // Icon takes 70% of canvas

    // Background circle (for better visibility)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, this.CANVAS_SIZE * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Icon shape
    ctx.fillStyle = this.TEAM_COLORS[team];
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;

    const shape = this.ICON_SHAPES[category];

    switch (shape) {
      case 'square':
        // Infantry - square
        ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
        ctx.strokeRect(centerX - size / 2, centerY - size / 2, size, size);
        break;

      case 'rectangle':
        // Tank - horizontal rectangle
        ctx.fillRect(centerX - size / 2, centerY - size / 3, size, size * 0.66);
        ctx.strokeRect(centerX - size / 2, centerY - size / 3, size, size * 0.66);
        break;

      case 'circle':
        // Recon - circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;

      case 'diamond':
        // Logistics - diamond
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size / 2); // Top
        ctx.lineTo(centerX + size / 2, centerY); // Right
        ctx.lineTo(centerX, centerY + size / 2); // Bottom
        ctx.lineTo(centerX - size / 2, centerY); // Left
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'hexagon':
        // Anti-Air - hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const x = centerX + (size / 2) * Math.cos(angle);
          const y = centerY + (size / 2) * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'cross':
        // Artillery - cross
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(centerX - size / 2, centerY);
        ctx.lineTo(centerX + size / 2, centerY);
        ctx.moveTo(centerX, centerY - size / 2);
        ctx.lineTo(centerX, centerY + size / 2);
        ctx.stroke();
        break;

      case 'triangle':
        // Helicopter - triangle (pointing up)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size / 2); // Top
        ctx.lineTo(centerX + size / 2, centerY + size / 2); // Bottom right
        ctx.lineTo(centerX - size / 2, centerY + size / 2); // Bottom left
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'triangle-inverted':
        // Aircraft - inverted triangle
        ctx.beginPath();
        ctx.moveTo(centerX, centerY + size / 2); // Bottom
        ctx.lineTo(centerX + size / 2, centerY - size / 2); // Top right
        ctx.lineTo(centerX - size / 2, centerY - size / 2); // Top left
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Register a unit for tactical icon rendering
   */
  registerUnit(unit: Unit): void {
    if (this.unitIcons.has(unit.id)) {
      console.warn(`[TacticalIconRenderer] Unit ${unit.id} already registered`);
      return;
    }

    const team = unit.team as 'player' | 'enemy';
    const textureKey = `${unit.category}_${team}`;
    const texture = this.iconTextures.get(textureKey);

    if (!texture) {
      console.error(`[TacticalIconRenderer] No texture for ${textureKey}`);
      return;
    }

    // Create sprite material
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      sizeAttenuation: true, // Scale with distance
    });

    // Create sprite
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(unit.mesh.position);
    sprite.position.y += 2; // Slightly above unit
    sprite.scale.set(this.ICON_SIZE, this.ICON_SIZE, 1);
    sprite.renderOrder = 1500; // Render above UI bars
    sprite.layers.set(LAYERS.RENDER_ONLY);
    sprite.visible = false; // Start hidden (shown when in tactical view)
    this.scene.add(sprite);

    this.unitIcons.set(unit.id, {
      unitId: unit.id,
      sprite,
      category: unit.category as UnitCategory,
    });
  }

  /**
   * Unregister a unit (when it dies or is removed)
   */
  unregisterUnit(unit: Unit): void {
    const iconData = this.unitIcons.get(unit.id);
    if (!iconData) return;

    // Remove sprite from scene
    this.scene.remove(iconData.sprite);

    // Dispose material (but not texture - it's cached)
    iconData.sprite.material.dispose();

    this.unitIcons.delete(unit.id);
  }

  /**
   * Get health indicator color based on health percentage
   * Follows same pattern as BatchedUnitUIRenderer
   */
  private getHealthColor(healthPercent: number): number {
    if (healthPercent > 0.6) return 0x00ff00; // Green
    if (healthPercent > 0.3) return 0xffff00; // Yellow
    return 0xff0000; // Red
  }

  /**
   * Update icon positions and visibility - called every frame
   */
  update(): void {
    // Check if we're in tactical view - show icons only in tactical view
    const isTacticalView = this.game.cameraController?.isTacticalView ?? false;

    // Early return if not in tactical view to save performance
    if (!isTacticalView) {
      // Hide all icons when not in tactical view
      for (const iconData of this.unitIcons.values()) {
        iconData.sprite.visible = false;
      }
      return;
    }

    // Icons are automatically billboarded by THREE.Sprite
    // Update positions and scale based on distance from camera

    const camera = this.game.camera;

    for (const [unitId, iconData] of this.unitIcons) {
      const unit = this.game.unitManager.getUnitById(unitId);
      if (!unit || unit.health <= 0) {
        iconData.sprite.visible = false;
        continue;
      }

      // Show icon in tactical view
      iconData.sprite.visible = true;

      // Update position to match unit
      iconData.sprite.position.copy(unit.mesh.position);
      iconData.sprite.position.y += 2; // Keep above unit

      // Calculate distance from camera
      const distanceToCamera = iconData.sprite.position.distanceTo(camera.position);

      // Scale inversely with distance for readability
      // At NEAR_DISTANCE: scale = MIN_SCALE
      // At FAR_DISTANCE: scale = MAX_SCALE
      const t = THREE.MathUtils.clamp(
        (distanceToCamera - this.NEAR_DISTANCE) / (this.FAR_DISTANCE - this.NEAR_DISTANCE),
        0,
        1
      );
      const scale = THREE.MathUtils.lerp(this.MIN_SCALE, this.MAX_SCALE, t);

      // Apply scale (sprites are billboarded automatically, so no rotation needed)
      iconData.sprite.scale.set(
        this.ICON_SIZE * scale,
        this.ICON_SIZE * scale,
        1
      );

      // Apply health indicator color tint
      const healthPercent = unit.health / unit.maxHealth;
      const healthColor = this.getHealthColor(healthPercent);
      this.tempColor.setHex(healthColor);
      iconData.sprite.material.color.copy(this.tempColor);
    }
  }

  /**
   * Clean up all icons
   */
  dispose(): void {
    // Remove all sprites
    for (const iconData of this.unitIcons.values()) {
      this.scene.remove(iconData.sprite);
      iconData.sprite.material.dispose();
    }
    this.unitIcons.clear();

    // Dispose cached textures
    for (const texture of this.iconTextures.values()) {
      texture.dispose();
    }
    this.iconTextures.clear();

    console.log('[TacticalIconRenderer] Disposed');
  }
}
