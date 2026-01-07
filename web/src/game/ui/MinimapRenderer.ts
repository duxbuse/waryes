/**
 * MinimapRenderer - Renders the tactical minimap
 *
 * Shows:
 * - Terrain (roads, buildings, forests)
 * - Capture zones with ownership colors
 * - Friendly units (always visible)
 * - Enemy units (only in visible areas)
 * - Camera viewport rectangle
 * - Click to move camera, right-click to issue move orders
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { GameMap } from '../../data/types';
import { VisibilityState } from '../managers/FogOfWarManager';
import { BIOME_CONFIGS } from '../../data/biomeConfigs';

export class MinimapRenderer {
  private readonly game: Game;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private map: GameMap | null = null;
  private pixelsPerMeter = 1;
  private offsetX = 0;
  private offsetY = 0;

  // Colors - dynamic based on biome
  private COLORS = {
    background: '#0a0a0a',
    field: '#2d4a3e',
    forest: '#1a2d1a',
    road: '#444444',
    building: '#666666',
    water: '#1a3a5a',
    hill: '#4a5a3a',

    // Teams
    friendly: '#4a9eff',
    enemy: '#ff4a4a',
    neutral: '#888888',

    // UI
    camera: '#ffffff',
    cameraFill: 'rgba(255, 255, 255, 0.1)',
  };

  constructor(game: Game) {
    this.game = game;

    const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Minimap canvas not found');
    }

    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context for minimap');
    }
    this.ctx = ctx;

    // Setup canvas click handling
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.canvas.addEventListener('click', (e) => {
      this.handleClick(e);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handleRightClick(e);
    });
  }

  private handleClick(e: MouseEvent): void {
    if (!this.map) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert minimap coordinates to world coordinates
    // Minimap pixel -> map local coords -> world coords (centered at 0,0)
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;
    const worldX = (x - this.offsetX) / this.pixelsPerMeter - mapCenterX;
    const worldZ = (y - this.offsetY) / this.pixelsPerMeter - mapCenterZ;

    // Move camera to this position
    this.game.cameraController.setPosition(worldX, worldZ);
  }

  private handleRightClick(e: MouseEvent): void {
    if (!this.map) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert minimap coordinates to world coordinates
    // Minimap pixel -> map local coords -> world coords (centered at 0,0)
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;
    const worldX = (x - this.offsetX) / this.pixelsPerMeter - mapCenterX;
    const worldZ = (y - this.offsetY) / this.pixelsPerMeter - mapCenterZ;

    // Issue move command to selected units
    const selectedUnits = this.game.selectionManager.getSelectedUnits();
    if (selectedUnits.length > 0) {
      const target = new THREE.Vector3(worldX, 0, worldZ);
      selectedUnits.forEach(unit => {
        unit.setMoveCommand(target);
      });
    }
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.calculateScale();
    this.applyBiomeColors(map.biome);
  }

  /**
   * Apply biome-specific colors to the minimap
   */
  private applyBiomeColors(biome: string): void {
    if (!biome) {
      console.warn('MinimapRenderer: No biome specified, using default colors');
      return;
    }

    const biomeConfig = BIOME_CONFIGS[biome as keyof typeof BIOME_CONFIGS];
    if (!biomeConfig) {
      console.warn(`MinimapRenderer: Unknown biome '${biome}', using default colors`);
      return;
    }

    try {
      // Convert hex color to CSS string
      const hexToCSS = (hex: number) => '#' + hex.toString(16).padStart(6, '0');

      // Update colors based on biome
      this.COLORS.field = hexToCSS(biomeConfig.groundColor);
      this.COLORS.forest = hexToCSS(biomeConfig.forestColor);
      this.COLORS.water = hexToCSS(biomeConfig.waterColor ?? 0x1a3a5a);

      // Darken ground color slightly for hills
      const hillColor = biomeConfig.groundColor;
      const r = Math.floor(((hillColor >> 16) & 0xFF) * 0.75);
      const g = Math.floor(((hillColor >> 8) & 0xFF) * 0.75);
      const b = Math.floor((hillColor & 0xFF) * 0.75);
      this.COLORS.hill = `rgb(${r},${g},${b})`;
    } catch (error) {
      console.error('MinimapRenderer: Error applying biome colors:', error);
    }
  }

  private calculateScale(): void {
    if (!this.map) return;

    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    // Calculate scale to fit map in canvas
    const scaleX = canvasWidth / this.map.width;
    const scaleY = canvasHeight / this.map.height;
    this.pixelsPerMeter = Math.min(scaleX, scaleY) * 0.9; // 90% to leave margin

    // Calculate offsets to center map
    this.offsetX = (canvasWidth - this.map.width * this.pixelsPerMeter) / 2;
    this.offsetY = (canvasHeight - this.map.height * this.pixelsPerMeter) / 2;
  }

  render(): void {
    if (!this.map) return;

    try {
      const ctx = this.ctx;
      const canvas = this.canvas;

      // Clear canvas
      ctx.fillStyle = this.COLORS.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Save context
      ctx.save();
      ctx.translate(this.offsetX, this.offsetY);

      // Render terrain
      this.renderTerrain();

      // Render buildings
      this.renderBuildings();

      // Render deployment zones (during setup phase)
      this.renderDeploymentZones();

      // Render capture zones
      this.renderCaptureZones();

      // Render resupply points
      this.renderResupplyPoints();

      // Render units
      this.renderUnits();

      // Render camera viewport
      this.renderCameraViewport();

      // Restore context
      ctx.restore();
    } catch (error) {
      console.error('MinimapRenderer: Error during render:', error);
    }
  }

  private renderTerrain(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const terrain = this.map.terrain;
    const fogEnabled = this.game.fogOfWarManager.isEnabled();
    const cellSize = this.map.cellSize; // Use actual cell size from map

    for (let z = 0; z < terrain.length; z++) {
      for (let x = 0; x < terrain[z]!.length; x++) {
        const cell = terrain[z]![x]!;

        let color = this.COLORS.field;
        if (cell.type === 'forest') color = this.COLORS.forest;
        else if (cell.type === 'road') color = this.COLORS.road;
        else if (cell.type === 'water' || cell.type === 'river') color = this.COLORS.water;
        else if (cell.type === 'hill') color = this.COLORS.hill;

        const pixelX = x * cellSize * this.pixelsPerMeter;
        const pixelY = z * cellSize * this.pixelsPerMeter;
        const pixelSize = cellSize * this.pixelsPerMeter;

        // Apply fog of war to terrain rendering
        if (fogEnabled) {
          const worldX = x * cellSize; // Convert grid position to world
          const worldZ = z * cellSize;
          const visibility = this.game.fogOfWarManager.getVisibilityState(worldX, worldZ);

          if (visibility === VisibilityState.Unexplored) {
            color = '#000000'; // Black for unexplored
          } else if (visibility === VisibilityState.Explored) {
            // Darken the color for explored but not visible areas
            color = this.darkenColor(color, 0.5);
          }
          // Visible areas keep their original color
        }

        ctx.fillStyle = color;
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
      }
    }
  }

  /**
   * Darken a hex color by a factor (0-1)
   */
  private darkenColor(hex: string, factor: number): string {
    // Parse hex color
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Darken
    const nr = Math.floor(r * factor);
    const ng = Math.floor(g * factor);
    const nb = Math.floor(b * factor);

    // Convert back to hex
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  }

  private renderBuildings(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    ctx.fillStyle = this.COLORS.building;
    for (const building of this.map.buildings) {
      // Convert world coordinates (centered at 0,0) to minimap coordinates
      const x = (building.x + mapCenterX) * this.pixelsPerMeter;
      const z = (building.z + mapCenterZ) * this.pixelsPerMeter;
      const w = building.width * this.pixelsPerMeter;
      const h = building.depth * this.pixelsPerMeter;

      // Buildings don't have rotation in this implementation
      ctx.fillRect(x - w / 2, z - h / 2, w, h);
    }
  }

  private renderDeploymentZones(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    for (const zone of this.map.deploymentZones) {
      // Convert world coordinates to minimap coordinates
      const minX = (zone.minX + mapCenterX) * this.pixelsPerMeter;
      const minZ = (zone.minZ + mapCenterZ) * this.pixelsPerMeter;
      const maxX = (zone.maxX + mapCenterX) * this.pixelsPerMeter;
      const maxZ = (zone.maxZ + mapCenterZ) * this.pixelsPerMeter;

      const width = maxX - minX;
      const height = maxZ - minZ;

      // Determine color based on team
      const color = zone.team === 'player' ? this.COLORS.friendly : this.COLORS.enemy;

      // Draw deployment zone rectangle (semi-transparent fill)
      ctx.fillStyle = color + '30'; // 30 = ~19% opacity
      ctx.fillRect(minX, minZ, width, height);

      // Draw border
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(minX, minZ, width, height);
    }
  }

  private renderCaptureZones(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    for (const zone of this.map.captureZones) {
      // Convert world coordinates (centered at 0,0) to minimap coordinates
      const x = (zone.x + mapCenterX) * this.pixelsPerMeter;
      const z = (zone.z + mapCenterZ) * this.pixelsPerMeter;
      const radius = zone.radius * this.pixelsPerMeter;

      // Determine color based on ownership
      let color = this.COLORS.neutral;
      if (zone.owner === 'player') color = this.COLORS.friendly;
      else if (zone.owner === 'enemy') color = this.COLORS.enemy;

      // Draw zone circle
      ctx.beginPath();
      ctx.arc(x, z, radius, 0, Math.PI * 2);
      ctx.fillStyle = color + '40'; // Semi-transparent fill
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private renderResupplyPoints(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    for (const point of this.map.resupplyPoints) {
      // Convert world coordinates to minimap coordinates
      const x = (point.x + mapCenterX) * this.pixelsPerMeter;
      const y = (point.z + mapCenterZ) * this.pixelsPerMeter;
      const radius = point.radius * this.pixelsPerMeter;

      // Determine color based on team
      const color = point.team === 'player' ? this.COLORS.friendly : this.COLORS.enemy;

      // Arrow dimensions
      const arrowLength = radius * 2.5;
      const arrowWidth = radius * 1.0;
      const arrowHeadWidth = radius * 1.5;
      const arrowHeadLength = radius * 0.8;

      // Offset arrow base outside the map edge
      // In minimap: player is at top (y near 0), enemy at bottom (y near canvas height)
      // Player arrows point down into map, enemy arrows point up into map
      const outsideOffset = radius * 0.5;
      const baseY = point.team === 'player'
        ? y - outsideOffset  // Player: offset up (outside top edge)
        : y + outsideOffset; // Enemy: offset down (outside bottom edge)

      // Save context and position at arrow base
      ctx.save();
      ctx.translate(x, baseY);

      // Rotation: arrow shape points UP (-Y), we need to flip based on team
      // Player arrows should point DOWN into battlefield (rotate PI)
      // Enemy arrows should point UP into battlefield (rotate 0)
      // Using: rotate(PI - direction) where player direction=0, enemy direction=PI
      ctx.rotate(Math.PI - point.direction);

      // Draw arrow shape (points UP in local space, -Y direction)
      ctx.beginPath();
      ctx.moveTo(-arrowWidth / 2, 0);
      ctx.lineTo(-arrowWidth / 2, -arrowLength + arrowHeadLength);
      ctx.lineTo(-arrowHeadWidth / 2, -arrowLength + arrowHeadLength);
      ctx.lineTo(0, -arrowLength); // Arrow tip
      ctx.lineTo(arrowHeadWidth / 2, -arrowLength + arrowHeadLength);
      ctx.lineTo(arrowWidth / 2, -arrowLength + arrowHeadLength);
      ctx.lineTo(arrowWidth / 2, 0);
      ctx.closePath();

      // Fill arrow
      ctx.fillStyle = color + 'A0'; // Semi-transparent
      ctx.fill();

      // Stroke arrow border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw circle at base (spawn point)
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.restore();
    }
  }

  private renderUnits(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const units = this.game.unitManager.getAllUnits();
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    for (const unit of units) {
      // Enemy units only visible if fog of war allows it
      if (unit.team !== 'player') {
        if (this.game.fogOfWarManager.isEnabled() &&
            !this.game.fogOfWarManager.isUnitVisible(unit)) {
          continue; // Skip drawing unit not in vision
        }
      }

      // Convert world coordinates (centered at 0,0) to minimap coordinates
      const x = (unit.position.x + mapCenterX) * this.pixelsPerMeter;
      const z = (unit.position.z + mapCenterZ) * this.pixelsPerMeter;

      // Use unit's color (blue for player, green for ally, red for enemy)
      const colorHex = unit.getUnitColor();
      const color = '#' + colorHex.toString(16).padStart(6, '0');

      // Draw unit as small circle
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  private renderCameraViewport(): void {
    if (!this.map) return;

    const camera = this.game.camera;
    const cameraTarget = this.game.cameraController.targetLookAt;

    // Calculate approximate viewport size based on camera height
    const fov = camera.fov * (Math.PI / 180);
    const height = camera.position.y;
    const viewportHeight = 2 * height * Math.tan(fov / 2);
    const viewportWidth = viewportHeight * camera.aspect;

    // Convert world coordinates to minimap coordinates
    // The map is centered at (0,0), but minimap grid starts at top-left
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    // Convert target position (world coords centered at 0,0) to minimap coords
    const x = (cameraTarget.x + mapCenterX) * this.pixelsPerMeter;
    const z = (cameraTarget.z + mapCenterZ) * this.pixelsPerMeter;
    const w = viewportWidth * this.pixelsPerMeter;
    const h = viewportHeight * this.pixelsPerMeter;

    const ctx = this.ctx;

    // Draw viewport rectangle
    ctx.fillStyle = this.COLORS.cameraFill;
    ctx.fillRect(x - w / 2, z - h / 2, w, h);

    ctx.strokeStyle = this.COLORS.camera;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, z - h / 2, w, h);
  }
}
