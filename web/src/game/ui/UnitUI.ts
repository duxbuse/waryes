/**
 * UnitUI - Manages UI elements above units (health bars, morale, status icons)
 *
 * Creates billboarded sprite elements that always face the camera
 */

import * as THREE from 'three';
import type { Unit } from '../units/Unit';
import type { Game } from '../../core/Game';

export class UnitUI {
  private readonly game: Game;
  private readonly unit: Unit;
  private readonly container: THREE.Group;

  // Health bar
  private healthBarBg!: THREE.Mesh;
  private healthBarFg!: THREE.Mesh;

  // Morale bar
  private moraleBarBg!: THREE.Mesh;
  private moraleBarFg!: THREE.Mesh;

  // Status icons container
  private statusIcons: THREE.Group;

  // Veterancy stars
  private veterancyStars: THREE.Mesh[] = [];

  // Status icon meshes
  private suppressedIcon: THREE.Mesh | null = null;
  private garrisonedIcon: THREE.Mesh | null = null;
  private mountedIcon: THREE.Mesh | null = null;

  // Aim indicator (circular arc)
  private aimIndicator: THREE.Line | null = null;

  // Reload indicator (radial fill circle)
  private reloadIndicator: THREE.Mesh | null = null;
  private reloadIndicatorBg: THREE.Mesh | null = null;

  // Category icon for tactical view
  private categoryIcon: THREE.Mesh | null = null;

  // Constants
  private readonly BAR_WIDTH = 2.0;
  private readonly BAR_HEIGHT = 0.15;
  private readonly BAR_Y_OFFSET = 2.5;
  private readonly BAR_SPACING = 0.25;

  constructor(unit: Unit, game: Game) {
    this.unit = unit;
    this.game = game;

    // Create container that will hold all UI elements
    this.container = new THREE.Group();
    this.container.position.y = this.BAR_Y_OFFSET;

    // Create status icons container
    this.statusIcons = new THREE.Group();
    this.statusIcons.position.y = 0.6;
    this.container.add(this.statusIcons);

    // Create bars
    this.createHealthBar();
    this.createMoraleBar();

    // Create veterancy stars
    this.createVeterancyStars();

    // Create status icons
    this.createStatusIcons();

    // Create aim indicator
    this.createAimIndicator();

    // Create reload indicator
    this.createReloadIndicator();

    // Create category icon for tactical view
    this.createCategoryIcon();

    // Add container to unit mesh
    unit.mesh.add(this.container);
  }

  private createHealthBar(): void {
    // Background (dark)
    const bgGeometry = new THREE.PlaneGeometry(this.BAR_WIDTH, this.BAR_HEIGHT);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x222222,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });
    this.healthBarBg = new THREE.Mesh(bgGeometry, bgMaterial);
    this.healthBarBg.renderOrder = 1000;
    this.container.add(this.healthBarBg);

    // Foreground (colored based on health %)
    const fgGeometry = new THREE.PlaneGeometry(this.BAR_WIDTH, this.BAR_HEIGHT);
    const fgMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.healthBarFg = new THREE.Mesh(fgGeometry, fgMaterial);
    this.healthBarFg.position.z = 0.01; // Slightly in front
    this.healthBarFg.renderOrder = 1001;
    this.container.add(this.healthBarFg);
  }

  private createMoraleBar(): void {
    const yOffset = -(this.BAR_HEIGHT + this.BAR_SPACING);

    // Background (dark)
    const bgGeometry = new THREE.PlaneGeometry(this.BAR_WIDTH, this.BAR_HEIGHT);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x222222,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });
    this.moraleBarBg = new THREE.Mesh(bgGeometry, bgMaterial);
    this.moraleBarBg.position.y = yOffset;
    this.moraleBarBg.renderOrder = 1000;
    this.container.add(this.moraleBarBg);

    // Foreground (blue)
    const fgGeometry = new THREE.PlaneGeometry(this.BAR_WIDTH, this.BAR_HEIGHT);
    const fgMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a9eff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.moraleBarFg = new THREE.Mesh(fgGeometry, fgMaterial);
    this.moraleBarFg.position.y = yOffset;
    this.moraleBarFg.position.z = 0.01; // Slightly in front
    this.moraleBarFg.renderOrder = 1001;
    this.container.add(this.moraleBarFg);
  }

  private createVeterancyStars(): void {
    const veterancy = this.unit.veterancy;
    if (veterancy === 0) return; // No stars for trained

    // Create stars above the bars
    const starSize = 0.2;
    const starSpacing = 0.25;
    const yOffset = 0.5; // Above bars

    // Create simple star shape using circle (simplified)
    const starGeometry = new THREE.CircleGeometry(starSize, 5); // 5-pointed approximation
    const starMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdd00, // Gold
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });

    // Add stars based on veterancy level
    const numStars = veterancy; // 1 or 2 stars
    const totalWidth = (numStars - 1) * starSpacing;
    const startX = -totalWidth / 2;

    for (let i = 0; i < numStars; i++) {
      const star = new THREE.Mesh(starGeometry, starMaterial.clone());
      star.position.set(startX + i * starSpacing, yOffset, 0);
      star.renderOrder = 1002;
      this.veterancyStars.push(star);
      this.container.add(star);
    }
  }

  private createStatusIcons(): void {
    const iconSize = 0.3;
    const iconSpacing = 0.4;

    // Suppressed icon (exclamation mark - red circle)
    const suppressedGeometry = new THREE.CircleGeometry(iconSize, 16);
    const suppressedMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3333, // Red
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.suppressedIcon = new THREE.Mesh(suppressedGeometry, suppressedMaterial);
    this.suppressedIcon.position.set(-iconSpacing, 0, 0);
    this.suppressedIcon.renderOrder = 1002;
    this.suppressedIcon.visible = false;
    this.statusIcons.add(this.suppressedIcon);

    // Garrisoned icon (house - yellow/orange square)
    const garrisonedGeometry = new THREE.PlaneGeometry(iconSize, iconSize);
    const garrisonedMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00, // Orange
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.garrisonedIcon = new THREE.Mesh(garrisonedGeometry, garrisonedMaterial);
    this.garrisonedIcon.position.set(0, 0, 0);
    this.garrisonedIcon.renderOrder = 1002;
    this.garrisonedIcon.visible = false;
    this.statusIcons.add(this.garrisonedIcon);

    // Mounted icon (vehicle - green circle)
    const mountedGeometry = new THREE.CircleGeometry(iconSize, 16);
    const mountedMaterial = new THREE.MeshBasicMaterial({
      color: 0x33ff33, // Green
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.mountedIcon = new THREE.Mesh(mountedGeometry, mountedMaterial);
    this.mountedIcon.position.set(iconSpacing, 0, 0);
    this.mountedIcon.renderOrder = 1002;
    this.mountedIcon.visible = false;
    this.statusIcons.add(this.mountedIcon);
  }

  private createAimIndicator(): void {
    // Create a circular arc that shows aim direction
    // Arc will be positioned around the unit (on ground plane, not billboarded)
    const arcRadius = 2.5;
    const arcAngle = Math.PI / 3; // 60 degrees
    const segments = 32;

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * arcAngle - arcAngle / 2; // Center the arc
      const x = Math.sin(theta) * arcRadius;
      const z = Math.cos(theta) * arcRadius;
      points.push(new THREE.Vector3(x, 0.1, z)); // Slightly above ground
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000, // Red
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });

    this.aimIndicator = new THREE.Line(geometry, material);
    this.aimIndicator.renderOrder = 999;
    this.aimIndicator.visible = false; // Hidden by default, shown when attacking

    // Add directly to unit mesh (not container) so it doesn't billboard
    this.unit.mesh.add(this.aimIndicator);
  }

  private createReloadIndicator(): void {
    // Create a radial fill indicator for reload progress
    // Position it below the health/morale bars
    const radius = 0.25;
    const yOffset = -0.9; // Below bars

    // Background circle (dark)
    const bgGeometry = new THREE.RingGeometry(radius * 0.7, radius, 32);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x222222,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });
    this.reloadIndicatorBg = new THREE.Mesh(bgGeometry, bgMaterial);
    this.reloadIndicatorBg.position.y = yOffset;
    this.reloadIndicatorBg.renderOrder = 1000;
    this.reloadIndicatorBg.visible = false; // Hidden by default
    this.container.add(this.reloadIndicatorBg);

    // Foreground circle (fills radially) - using CircleGeometry for simplicity
    // In a production version, this would use a custom shader for true radial fill
    const fgGeometry = new THREE.CircleGeometry(radius, 32);
    const fgMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00, // Orange
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.reloadIndicator = new THREE.Mesh(fgGeometry, fgMaterial);
    this.reloadIndicator.position.y = yOffset;
    this.reloadIndicator.position.z = 0.01; // Slightly in front
    this.reloadIndicator.renderOrder = 1001;
    this.reloadIndicator.visible = false; // Hidden by default
    this.container.add(this.reloadIndicator);
  }

  private createCategoryIcon(): void {
    // Skip in test environment where document may not exist
    if (typeof document === 'undefined') return;

    // Create a text-based category icon for tactical view
    // This shows the unit category (INF, TNK, REC, etc.) when zoomed out
    const size = 1.5;

    // Get category text
    const category = this.unit.category;

    // Create canvas for text rendering
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Background circle with team/owner color
    const colorHex = this.unit.getUnitColor();
    const teamColor = '#' + colorHex.toString(16).padStart(6, '0');
    context.fillStyle = teamColor;
    context.beginPath();
    context.arc(64, 64, 60, 0, Math.PI * 2);
    context.fill();

    // White text
    context.fillStyle = '#ffffff';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(category, 64, 64);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create sprite
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    });

    const geometry = new THREE.PlaneGeometry(size, size);
    this.categoryIcon = new THREE.Mesh(geometry, material);
    this.categoryIcon.position.y = 0; // Center position
    this.categoryIcon.renderOrder = 1003;
    this.categoryIcon.visible = false; // Hidden by default, shown in tactical view
    this.container.add(this.categoryIcon);
  }

  update(): void {
    // Update health bar
    const healthPercent = this.unit.health / this.unit.maxHealth;
    this.healthBarFg.scale.x = Math.max(0.01, healthPercent); // Prevent zero scale
    this.healthBarFg.position.x = -(this.BAR_WIDTH / 2) * (1 - healthPercent);

    // Color health bar based on percentage
    const healthMaterial = this.healthBarFg.material as THREE.MeshBasicMaterial;
    if (healthPercent > 0.6) {
      healthMaterial.color.setHex(0x00ff00); // Green
    } else if (healthPercent > 0.3) {
      healthMaterial.color.setHex(0xffff00); // Yellow
    } else {
      healthMaterial.color.setHex(0xff0000); // Red
    }

    // Update morale bar
    const moralePercent = this.unit.morale / 100;
    this.moraleBarFg.scale.x = Math.max(0.01, moralePercent);
    this.moraleBarFg.position.x = -(this.BAR_WIDTH / 2) * (1 - moralePercent);

    // Color morale bar based on state
    const moraleMaterial = this.moraleBarFg.material as THREE.MeshBasicMaterial;
    if (this.unit.isRouting) {
      moraleMaterial.color.setHex(0x666666); // Gray when routing
    } else if (moralePercent < 0.25) {
      moraleMaterial.color.setHex(0xff8800); // Orange when breaking
    } else if (moralePercent < 0.5) {
      moraleMaterial.color.setHex(0xffcc00); // Yellow-orange when shaken
    } else {
      moraleMaterial.color.setHex(0x4a9eff); // Blue when normal
    }

    // Update status icons visibility
    if (this.suppressedIcon) {
      this.suppressedIcon.visible = this.unit.suppression >= 50; // Show when suppressed
    }
    if (this.garrisonedIcon) {
      this.garrisonedIcon.visible = this.unit.isGarrisoned;
    }
    if (this.mountedIcon) {
      this.mountedIcon.visible = this.unit.isMounted;
    }

    // Update aim indicator
    if (this.aimIndicator) {
      // Show aim indicator when attacking
      const currentCommand = (this.unit as any).currentCommand;
      if (currentCommand?.type === 3 && currentCommand.targetUnit) {
        // Type 3 = Attack command
        this.aimIndicator.visible = true;

        // Calculate angle to target
        const targetPos = currentCommand.targetUnit.position;
        const direction = new THREE.Vector3()
          .subVectors(targetPos, this.unit.position);
        direction.y = 0; // Keep on ground plane
        const targetAngle = Math.atan2(direction.x, direction.z);

        // Rotate aim indicator to face target
        this.aimIndicator.rotation.y = targetAngle;
      } else {
        this.aimIndicator.visible = false;
      }
    }

    // Update reload indicator
    if (this.reloadIndicator && this.reloadIndicatorBg) {
      const fireCooldown = (this.unit as any).fireCooldown || 0;
      const fireRate = (this.unit as any).fireRate || 1;
      const maxCooldown = 1 / fireRate;

      if (fireCooldown > 0 && maxCooldown > 0) {
        // Show reload indicator while reloading
        this.reloadIndicatorBg.visible = true;
        this.reloadIndicator.visible = true;

        // Calculate reload progress (0 = just fired, 1 = ready to fire)
        const progress = 1 - (fireCooldown / maxCooldown);

        // Scale the indicator based on progress (simple radial approximation)
        this.reloadIndicator.scale.set(progress, progress, 1);
      } else {
        // Hide when ready to fire
        this.reloadIndicatorBg.visible = false;
        this.reloadIndicator.visible = false;
      }
    }

    // Update category icon visibility based on tactical view
    if (this.categoryIcon) {
      const isTacticalView = this.game.cameraController.isTacticalView;
      this.categoryIcon.visible = isTacticalView;

      // Hide detailed UI elements in tactical view
      if (isTacticalView) {
        this.healthBarBg.visible = false;
        this.healthBarFg.visible = false;
        this.moraleBarBg.visible = false;
        this.moraleBarFg.visible = false;
        this.statusIcons.visible = false;
        if (this.aimIndicator) this.aimIndicator.visible = false;
        if (this.reloadIndicatorBg) this.reloadIndicatorBg.visible = false;
        if (this.reloadIndicator) this.reloadIndicator.visible = false;
        for (const star of this.veterancyStars) {
          star.visible = false;
        }
      } else {
        this.healthBarBg.visible = true;
        this.healthBarFg.visible = true;
        this.moraleBarBg.visible = true;
        this.moraleBarFg.visible = true;
        this.statusIcons.visible = true;
        // Other indicators remain dynamically controlled
      }
    }

    // Billboard effect - always face camera
    this.container.quaternion.copy(this.game.camera.quaternion);
  }

  destroy(): void {
    // Clean up geometries and materials
    this.healthBarBg.geometry.dispose();
    (this.healthBarBg.material as THREE.Material).dispose();
    this.healthBarFg.geometry.dispose();
    (this.healthBarFg.material as THREE.Material).dispose();
    this.moraleBarBg.geometry.dispose();
    (this.moraleBarBg.material as THREE.Material).dispose();
    this.moraleBarFg.geometry.dispose();
    (this.moraleBarFg.material as THREE.Material).dispose();

    // Clean up veterancy stars
    for (const star of this.veterancyStars) {
      star.geometry.dispose();
      (star.material as THREE.Material).dispose();
    }

    // Clean up status icons
    if (this.suppressedIcon) {
      this.suppressedIcon.geometry.dispose();
      (this.suppressedIcon.material as THREE.Material).dispose();
    }
    if (this.garrisonedIcon) {
      this.garrisonedIcon.geometry.dispose();
      (this.garrisonedIcon.material as THREE.Material).dispose();
    }
    if (this.mountedIcon) {
      this.mountedIcon.geometry.dispose();
      (this.mountedIcon.material as THREE.Material).dispose();
    }

    // Clean up aim indicator
    if (this.aimIndicator) {
      this.aimIndicator.geometry.dispose();
      (this.aimIndicator.material as THREE.Material).dispose();
      this.aimIndicator.parent?.remove(this.aimIndicator);
    }

    // Clean up reload indicator
    if (this.reloadIndicatorBg) {
      this.reloadIndicatorBg.geometry.dispose();
      (this.reloadIndicatorBg.material as THREE.Material).dispose();
    }
    if (this.reloadIndicator) {
      this.reloadIndicator.geometry.dispose();
      (this.reloadIndicator.material as THREE.Material).dispose();
    }

    // Clean up category icon
    if (this.categoryIcon) {
      this.categoryIcon.geometry.dispose();
      const material = this.categoryIcon.material as THREE.MeshBasicMaterial;
      if (material.map) material.map.dispose();
      material.dispose();
    }

    // Remove from parent
    this.container.parent?.remove(this.container);
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }
}
