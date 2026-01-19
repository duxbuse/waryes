/**
 * UnitUI - Manages UI elements above units (health bars, morale, status icons)
 *
 * Creates billboarded sprite elements that always face the camera
 */

import * as THREE from 'three';
import { type Unit, UnitCommand } from '../units/Unit';
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

  // Order icon meshes (current command)
  private orderIconsGroup: THREE.Group;
  private moveIcon: THREE.Mesh | null = null;
  private attackIcon: THREE.Mesh | null = null;
  private holdIcon: THREE.Mesh | null = null;
  private fastMoveIcon: THREE.Mesh | null = null;
  private reverseIcon: THREE.Mesh | null = null;
  private attackMoveIcon: THREE.Mesh | null = null;
  private garrisonIcon: THREE.Mesh | null = null;
  private mountIcon: THREE.Mesh | null = null;

  // Ground ring indicators (positioned around unit on ground, not billboarded)
  private groundRingsGroup: THREE.Group | null = null;
  private aimRing: THREE.Line | null = null;  // Outer blue ring showing aim direction
  private weaponReloadRings: THREE.Line[] = []; // Inner green rings for weapon reloads
  private weaponReloadBgRings: THREE.Line[] = []; // Background rings for weapons

  // Ring constants
  private readonly AIM_RING_RADIUS = 2.5;
  private readonly AIM_ARC_ANGLE = Math.PI / 3; // 60 degrees
  private readonly RELOAD_RING_START_RADIUS = 2.0;
  private readonly RELOAD_RING_SPACING = 0.4;
  private readonly RING_SEGMENTS = 48;

  // Category icon for tactical view
  private categoryIcon: THREE.Mesh | null = null;

  // Constants
  private readonly BAR_WIDTH = 2.0;
  private readonly BAR_HEIGHT = 0.15;
  private readonly BAR_Y_OFFSET = 2.5;
  private readonly BAR_SPACING = 0.25;

  // Scaling constants for zoom compensation
  private readonly MIN_SCALE = 1.0;   // Minimum scale (when close)
  private readonly MAX_SCALE = 4.0;   // Maximum scale (when far)
  private readonly NEAR_DISTANCE = 20;  // Distance where scale is minimum
  private readonly FAR_DISTANCE = 150;  // Distance where scale is maximum

  constructor(unit: Unit, game: Game, options?: { useBatchedRenderer?: boolean }) {
    this.unit = unit;
    this.game = game;

    // Create container that will hold all UI elements
    this.container = new THREE.Group();
    this.container.position.y = this.BAR_Y_OFFSET;

    // Create status icons container
    this.statusIcons = new THREE.Group();
    this.statusIcons.position.y = 0.6;
    this.container.add(this.statusIcons);

    // Create order icons container (above status icons, same Y as veterancy stars)
    this.orderIconsGroup = new THREE.Group();
    this.orderIconsGroup.position.y = 0.5; // Same Y as veterancy stars
    this.container.add(this.orderIconsGroup);

    // Create bars (skip if using batched renderer)
    const useBatchedRenderer = options?.useBatchedRenderer ?? false;
    if (!useBatchedRenderer) {
      this.createHealthBar();
      this.createMoraleBar();
    }

    // Create veterancy stars
    this.createVeterancyStars();

    // Create status icons
    this.createStatusIcons();

    // Create order icons
    this.createOrderIcons();

    // Create ground ring indicators (aim + weapon reloads)
    this.createGroundRings();

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

  private createOrderIcons(): void {
    const iconSize = 0.35;

    // Move icon (blue circle with arrow)
    const moveGeometry = new THREE.CircleGeometry(iconSize, 16);
    const moveMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a9eff, // Blue
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.moveIcon = new THREE.Mesh(moveGeometry, moveMaterial);
    this.moveIcon.renderOrder = 1003;
    this.moveIcon.visible = false;
    this.orderIconsGroup.add(this.moveIcon);

    // Attack icon (red triangle pointing up)
    const attackShape = new THREE.Shape();
    attackShape.moveTo(0, iconSize);
    attackShape.lineTo(-iconSize * 0.866, -iconSize * 0.5);
    attackShape.lineTo(iconSize * 0.866, -iconSize * 0.5);
    attackShape.lineTo(0, iconSize);
    const attackGeometry = new THREE.ShapeGeometry(attackShape);
    const attackMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3333, // Red
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.attackIcon = new THREE.Mesh(attackGeometry, attackMaterial);
    this.attackIcon.renderOrder = 1003;
    this.attackIcon.visible = false;
    this.orderIconsGroup.add(this.attackIcon);

    // Hold icon (yellow square)
    const holdGeometry = new THREE.PlaneGeometry(iconSize * 1.5, iconSize * 1.5);
    const holdMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdd00, // Yellow
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.holdIcon = new THREE.Mesh(holdGeometry, holdMaterial);
    this.holdIcon.renderOrder = 1003;
    this.holdIcon.visible = false;
    this.orderIconsGroup.add(this.holdIcon);

    // Fast move icon (cyan/light blue circle)
    const fastMoveGeometry = new THREE.CircleGeometry(iconSize, 16);
    const fastMoveMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff, // Cyan
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.fastMoveIcon = new THREE.Mesh(fastMoveGeometry, fastMoveMaterial);
    this.fastMoveIcon.renderOrder = 1003;
    this.fastMoveIcon.visible = false;
    this.orderIconsGroup.add(this.fastMoveIcon);

    // Reverse icon (orange triangle pointing down)
    const reverseShape = new THREE.Shape();
    reverseShape.moveTo(0, -iconSize);
    reverseShape.lineTo(-iconSize * 0.866, iconSize * 0.5);
    reverseShape.lineTo(iconSize * 0.866, iconSize * 0.5);
    reverseShape.lineTo(0, -iconSize);
    const reverseGeometry = new THREE.ShapeGeometry(reverseShape);
    const reverseMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8800, // Orange
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.reverseIcon = new THREE.Mesh(reverseGeometry, reverseMaterial);
    this.reverseIcon.renderOrder = 1003;
    this.reverseIcon.visible = false;
    this.orderIconsGroup.add(this.reverseIcon);

    // Attack-move icon (purple diamond)
    const attackMoveShape = new THREE.Shape();
    attackMoveShape.moveTo(0, iconSize);
    attackMoveShape.lineTo(iconSize, 0);
    attackMoveShape.lineTo(0, -iconSize);
    attackMoveShape.lineTo(-iconSize, 0);
    attackMoveShape.lineTo(0, iconSize);
    const attackMoveGeometry = new THREE.ShapeGeometry(attackMoveShape);
    const attackMoveMaterial = new THREE.MeshBasicMaterial({
      color: 0xaa33ff, // Purple
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.attackMoveIcon = new THREE.Mesh(attackMoveGeometry, attackMoveMaterial);
    this.attackMoveIcon.renderOrder = 1003;
    this.attackMoveIcon.visible = false;
    this.orderIconsGroup.add(this.attackMoveIcon);

    // Garrison icon (orange/brown square representing building)
    const garrisonGeometry = new THREE.PlaneGeometry(iconSize * 1.3, iconSize * 1.3);
    const garrisonMaterial = new THREE.MeshBasicMaterial({
      color: 0xcc6600, // Brown/Orange
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.garrisonIcon = new THREE.Mesh(garrisonGeometry, garrisonMaterial);
    this.garrisonIcon.renderOrder = 1003;
    this.garrisonIcon.visible = false;
    this.orderIconsGroup.add(this.garrisonIcon);

    // Mount icon (green circle representing transport)
    const mountGeometry = new THREE.CircleGeometry(iconSize, 16);
    const mountMaterial = new THREE.MeshBasicMaterial({
      color: 0x33ff33, // Green
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.mountIcon = new THREE.Mesh(mountGeometry, mountMaterial);
    this.mountIcon.renderOrder = 1003;
    this.mountIcon.visible = false;
    this.orderIconsGroup.add(this.mountIcon);
  }

  /**
   * Create ground ring indicators:
   * - Outer ring (blue): aim direction toward enemy
   * - Inner rings (green): weapon reload progress, fills clockwise
   */
  private createGroundRings(): void {
    // Create group for all ground rings (added to unit mesh, not container, so it stays on ground)
    this.groundRingsGroup = new THREE.Group();
    this.groundRingsGroup.position.y = 0.15; // Slightly above ground
    this.unit.mesh.add(this.groundRingsGroup);

    // Create aim ring (outer, blue)
    this.createAimRing();

    // Create weapon reload rings (inner, green) - one per weapon
    const weapons = this.unit.getWeapons();
    for (let i = 0; i < Math.min(weapons.length, 3); i++) { // Max 3 weapon rings
      this.createWeaponReloadRing(i);
    }
  }

  /**
   * Create the outer aim ring (blue arc showing direction to enemy)
   */
  private createAimRing(): void {
    // Create initial arc geometry (will be updated each frame)
    const points = this.createArcPoints(this.AIM_RING_RADIUS, this.AIM_ARC_ANGLE, 0);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: 0x4a9eff, // Blue
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });

    this.aimRing = new THREE.Line(geometry, material);

    // Set usage to dynamic
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    posAttr.setUsage(THREE.DynamicDrawUsage);

    this.aimRing.renderOrder = 999;
    this.aimRing.visible = false;
    this.groundRingsGroup?.add(this.aimRing);
  }

  /**
   * Create a weapon reload ring (green arc that fills clockwise)
   */
  private createWeaponReloadRing(weaponIndex: number): void {
    const radius = this.RELOAD_RING_START_RADIUS - weaponIndex * this.RELOAD_RING_SPACING;

    // Background ring (dark, full circle)
    const bgPoints = this.createArcPoints(radius, Math.PI * 2, 0);
    const bgGeometry = new THREE.BufferGeometry().setFromPoints(bgPoints);
    const bgMaterial = new THREE.LineBasicMaterial({
      color: 0x333333,
      linewidth: 1,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
    });
    const bgRing = new THREE.Line(bgGeometry, bgMaterial);
    bgRing.renderOrder = 998;
    bgRing.visible = false;
    this.groundRingsGroup?.add(bgRing);
    this.weaponReloadBgRings.push(bgRing);

    // Foreground ring (green, fills based on reload progress)
    // Pre-allocate buffer for full circle
    const fullPoints = this.createArcPoints(radius, Math.PI * 2, 0); // Max size
    const fgGeometry = new THREE.BufferGeometry().setFromPoints(fullPoints);
    fgGeometry.setDrawRange(0, 0); // Start hidden

    // Set usage to dynamic
    const posAttr = fgGeometry.attributes.position as THREE.BufferAttribute;
    posAttr.setUsage(THREE.DynamicDrawUsage);

    const fgMaterial = new THREE.LineBasicMaterial({
      color: 0x44ff44, // Green
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    const fgRing = new THREE.Line(fgGeometry, fgMaterial);
    fgRing.renderOrder = 999;
    fgRing.visible = false;
    this.groundRingsGroup?.add(fgRing);
    this.weaponReloadRings.push(fgRing);
  }

  /**
   * Create arc points for a ring
   * @param radius - Ring radius
   * @param arcAngle - Angle of arc in radians (2*PI for full circle)
   * @param startAngle - Starting angle (0 = forward/+Z)
   */
  private createArcPoints(radius: number, arcAngle: number, startAngle: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const segments = Math.max(3, Math.ceil(this.RING_SEGMENTS * (arcAngle / (Math.PI * 2))));

    for (let i = 0; i <= segments; i++) {
      // Clockwise from top (start at -PI/2 to begin at top, go clockwise)
      const theta = startAngle - Math.PI / 2 + (i / segments) * arcAngle;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      points.push(new THREE.Vector3(x, 0, z));
    }

    return points;
  }

  /**
   * Update aim ring geometry to point toward target
   */
  /**
   * Update aim ring geometry to point toward target
   */
  private updateAimRing(targetAngle: number): void {
    if (!this.aimRing) return;

    // Create arc centered on target direction
    const points = this.createArcPoints(
      this.AIM_RING_RADIUS,
      this.AIM_ARC_ANGLE,
      targetAngle + Math.PI / 2 // Adjust for coordinate system
    );

    // Update geometry
    const geometry = this.aimRing.geometry as THREE.BufferGeometry;
    const positions = geometry.attributes.position!;

    // Aim ring size is constant (constant arc angle), so direct update is safe
    // But safety check just in case
    const count = Math.min(points.length, positions.count);

    for (let i = 0; i < count; i++) {
      positions.setXYZ(i, points[i]!.x, points[i]!.y, points[i]!.z);
    }

    positions.needsUpdate = true;
    geometry.setDrawRange(0, count);
  }

  /**
   * Update weapon reload ring to show progress (fills clockwise)
   */
  private updateWeaponReloadRing(weaponIndex: number, progress: number): void {
    if (weaponIndex >= this.weaponReloadRings.length) return;

    const ring = this.weaponReloadRings[weaponIndex];
    if (!ring) return;

    // Progress 0 = empty, 1 = full circle
    const arcAngle = progress * Math.PI * 2;
    const radius = this.RELOAD_RING_START_RADIUS - weaponIndex * this.RELOAD_RING_SPACING;

    // Create arc starting from top, going clockwise
    const points = this.createArcPoints(radius, arcAngle, 0);

    // Update geometry using pre-allocated buffer
    const geometry = ring.geometry as THREE.BufferGeometry;
    const positions = geometry.attributes.position!;

    // Ensure we don't overflow the buffer
    const count = Math.min(points.length, positions.count);

    for (let i = 0; i < count; i++) {
      positions.setXYZ(i, points[i]!.x, points[i]!.y, points[i]!.z);
    }

    positions.needsUpdate = true;
    geometry.setDrawRange(0, count);
  }

  /**
   * Update order icon visibility based on current command
   */
  private updateOrderIconsVisibility(): void {
    // Get unit's current command
    const currentCommand = (this.unit as any).currentCommand;

    // Hide all order icons first
    if (this.moveIcon) this.moveIcon.visible = false;
    if (this.attackIcon) this.attackIcon.visible = false;
    if (this.holdIcon) this.holdIcon.visible = false;
    if (this.fastMoveIcon) this.fastMoveIcon.visible = false;
    if (this.reverseIcon) this.reverseIcon.visible = false;
    if (this.attackMoveIcon) this.attackMoveIcon.visible = false;
    if (this.garrisonIcon) this.garrisonIcon.visible = false;
    if (this.mountIcon) this.mountIcon.visible = false;

    // Show icon based on current command type
    if (currentCommand) {
      switch (currentCommand.type) {
        case UnitCommand.Move:
          if (this.moveIcon) this.moveIcon.visible = true;
          break;
        case UnitCommand.Attack:
          if (this.attackIcon) this.attackIcon.visible = true;
          break;
        case UnitCommand.FastMove:
          if (this.fastMoveIcon) this.fastMoveIcon.visible = true;
          break;
        case UnitCommand.Reverse:
          if (this.reverseIcon) this.reverseIcon.visible = true;
          break;
        case UnitCommand.AttackMove:
          if (this.attackMoveIcon) this.attackMoveIcon.visible = true;
          break;
        case UnitCommand.Garrison:
          if (this.garrisonIcon) this.garrisonIcon.visible = true;
          break;
        case UnitCommand.Mount:
          if (this.mountIcon) this.mountIcon.visible = true;
          break;
        case UnitCommand.None:
        default:
          // No icon shown for None or unknown commands
          break;
      }
    }
  }

  /**
   * Update all ground ring indicators (aim + weapon reloads)
   */
  private updateGroundRingIndicators(): void {
    // Get unit's current command
    const currentCommand = (this.unit as any).currentCommand;
    const fireCooldown = (this.unit as any).fireCooldown || 0;
    const fireRate = (this.unit as any).fireRate || 1;
    const maxCooldown = 1 / fireRate;

    // Update aim ring - show when attacking or attack-moving with a target
    if (this.aimRing) {
      const hasTarget = currentCommand?.targetUnit ||
        (currentCommand?.type === 4 && currentCommand?.target); // Type 4 = AttackMove

      if (currentCommand?.targetUnit) {
        // Has a specific target unit - show aim ring pointing at it
        this.aimRing.visible = true;

        const targetPos = currentCommand.targetUnit.position;
        const direction = new THREE.Vector3()
          .subVectors(targetPos, this.unit.position);
        direction.y = 0;
        const targetAngle = Math.atan2(direction.x, direction.z);

        this.updateAimRing(targetAngle);
      } else if (hasTarget && currentCommand?.target) {
        // Attack-moving to a position - show aim ring in movement direction
        this.aimRing.visible = true;

        const direction = new THREE.Vector3()
          .subVectors(currentCommand.target, this.unit.position);
        direction.y = 0;
        const targetAngle = Math.atan2(direction.x, direction.z);

        this.updateAimRing(targetAngle);
      } else {
        this.aimRing.visible = false;
      }
    }

    // Update weapon reload rings
    const weapons = this.unit.getWeapons();
    const isReloading = fireCooldown > 0 && maxCooldown > 0;

    for (let i = 0; i < this.weaponReloadRings.length; i++) {
      const bgRing = this.weaponReloadBgRings[i];
      const fgRing = this.weaponReloadRings[i];

      if (bgRing && fgRing) {
        if (isReloading && i < weapons.length) {
          // Show reload progress
          bgRing.visible = true;
          fgRing.visible = true;

          // Calculate reload progress (0 = just fired, 1 = ready to fire)
          // For now, all weapons share the same cooldown
          // TODO: Per-weapon cooldown tracking
          const progress = 1 - (fireCooldown / maxCooldown);
          this.updateWeaponReloadRing(i, progress);
        } else {
          // Hide when ready to fire
          bgRing.visible = false;
          fgRing.visible = false;
        }
      }
    }
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
    // Update health bar (skip if using batched renderer)
    if (this.healthBarFg && this.healthBarBg) {
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
    }

    // Update morale bar (skip if using batched renderer)
    if (this.moraleBarFg && this.moraleBarBg) {
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

    // Update order icon visibility based on current command
    this.updateOrderIconsVisibility();

    // Update ground ring indicators
    this.updateGroundRingIndicators();

    // Update category icon visibility based on tactical view
    if (this.categoryIcon) {
      const isTacticalView = this.game.cameraController.isTacticalView;
      this.categoryIcon.visible = isTacticalView;

      // Hide detailed UI elements in tactical view
      if (isTacticalView) {
        if (this.healthBarBg) this.healthBarBg.visible = false;
        if (this.healthBarFg) this.healthBarFg.visible = false;
        if (this.moraleBarBg) this.moraleBarBg.visible = false;
        if (this.moraleBarFg) this.moraleBarFg.visible = false;
        this.statusIcons.visible = false;
        this.orderIconsGroup.visible = false;
        if (this.groundRingsGroup) this.groundRingsGroup.visible = false;
        for (const star of this.veterancyStars) {
          star.visible = false;
        }
      } else {
        if (this.healthBarBg) this.healthBarBg.visible = true;
        if (this.healthBarFg) this.healthBarFg.visible = true;
        if (this.moraleBarBg) this.moraleBarBg.visible = true;
        if (this.moraleBarFg) this.moraleBarFg.visible = true;
        this.statusIcons.visible = true;
        this.orderIconsGroup.visible = true;
        if (this.groundRingsGroup) this.groundRingsGroup.visible = true;
        // Other indicators remain dynamically controlled
      }
    }

    // Billboard effect - always face camera (independent of unit rotation)
    // We need to get the inverse of the unit's rotation and combine with camera rotation
    // This ensures the UI faces the camera regardless of which way the unit is facing
    const unitWorldQuaternion = new THREE.Quaternion();
    this.unit.mesh.getWorldQuaternion(unitWorldQuaternion);
    const inverseUnitRotation = unitWorldQuaternion.clone().invert();
    this.container.quaternion.copy(inverseUnitRotation).multiply(this.game.camera.quaternion);

    // Scale based on camera distance for consistent visibility
    const cameraPosition = this.game.camera.position;
    const unitPosition = this.unit.position;
    const distance = cameraPosition.distanceTo(unitPosition);

    // Calculate scale factor based on distance (linear interpolation)
    const t = Math.max(0, Math.min(1, (distance - this.NEAR_DISTANCE) / (this.FAR_DISTANCE - this.NEAR_DISTANCE)));
    const scaleFactor = this.MIN_SCALE + t * (this.MAX_SCALE - this.MIN_SCALE);

    this.container.scale.setScalar(scaleFactor);
  }

  destroy(): void {
    // Clean up geometries and materials (skip if using batched renderer)
    if (this.healthBarBg) {
      this.healthBarBg.geometry.dispose();
      (this.healthBarBg.material as THREE.Material).dispose();
    }
    if (this.healthBarFg) {
      this.healthBarFg.geometry.dispose();
      (this.healthBarFg.material as THREE.Material).dispose();
    }
    if (this.moraleBarBg) {
      this.moraleBarBg.geometry.dispose();
      (this.moraleBarBg.material as THREE.Material).dispose();
    }
    if (this.moraleBarFg) {
      this.moraleBarFg.geometry.dispose();
      (this.moraleBarFg.material as THREE.Material).dispose();
    }

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

    // Clean up order icons
    if (this.moveIcon) {
      this.moveIcon.geometry.dispose();
      (this.moveIcon.material as THREE.Material).dispose();
    }
    if (this.attackIcon) {
      this.attackIcon.geometry.dispose();
      (this.attackIcon.material as THREE.Material).dispose();
    }
    if (this.holdIcon) {
      this.holdIcon.geometry.dispose();
      (this.holdIcon.material as THREE.Material).dispose();
    }
    if (this.fastMoveIcon) {
      this.fastMoveIcon.geometry.dispose();
      (this.fastMoveIcon.material as THREE.Material).dispose();
    }
    if (this.reverseIcon) {
      this.reverseIcon.geometry.dispose();
      (this.reverseIcon.material as THREE.Material).dispose();
    }
    if (this.attackMoveIcon) {
      this.attackMoveIcon.geometry.dispose();
      (this.attackMoveIcon.material as THREE.Material).dispose();
    }
    if (this.garrisonIcon) {
      this.garrisonIcon.geometry.dispose();
      (this.garrisonIcon.material as THREE.Material).dispose();
    }
    if (this.mountIcon) {
      this.mountIcon.geometry.dispose();
      (this.mountIcon.material as THREE.Material).dispose();
    }

    // Clean up ground ring indicators
    if (this.aimRing) {
      this.aimRing.geometry.dispose();
      (this.aimRing.material as THREE.Material).dispose();
    }
    for (const ring of this.weaponReloadRings) {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    }
    for (const ring of this.weaponReloadBgRings) {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    }
    if (this.groundRingsGroup) {
      this.groundRingsGroup.parent?.remove(this.groundRingsGroup);
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
