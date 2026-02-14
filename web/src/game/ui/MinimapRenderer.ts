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
import { type Game, GamePhase } from '../../core/Game';
import type { GameMap } from '../../data/types';
import { BIOME_CONFIGS } from '../../data/biomeConfigs';

interface CombatIndicator {
  id: string;
  x: number;
  z: number;
  timeAlive: number;
  duration: number;
  team: 'player' | 'enemy';
}

export class MinimapRenderer {
  private readonly game: Game;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private map: GameMap | null = null;
  private pixelsPerMeter = 1;
  private offsetX = 0;
  private offsetY = 0;

  // Combat indicators
  private combatIndicators: Map<string, CombatIndicator> = new Map();
  private nextIndicatorId = 0;
  private lastRenderTime = 0;
  private readonly MAX_INDICATORS = 50;

  // Cached terrain canvas (static - only redrawn on map change)
  private terrainCache: HTMLCanvasElement | null = null;
  private terrainCacheDirty = true;

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
    friendly: '#00aaff',
    enemy: '#ff4444',
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
    this.terrainCacheDirty = true; // Invalidate terrain cache on new map
  }

  /**
   * Create a combat indicator at a world position
   */
  createCombatIndicator(position: THREE.Vector3, team: 'player' | 'enemy'): void {
    // Enforce max limit to prevent performance degradation
    if (this.combatIndicators.size >= this.MAX_INDICATORS) {
      return; // Skip creation if at maximum capacity
    }

    const id = `combat_${this.nextIndicatorId++}`;

    const indicator: CombatIndicator = {
      id,
      x: position.x,
      z: position.z,
      timeAlive: 0,
      duration: 1.0, // 1 second fade out
      team,
    };

    this.combatIndicators.set(id, indicator);
  }

  /**
   * Update combat indicators
   */
  update(dt: number): void {
    const toRemove: string[] = [];

    for (const [id, indicator] of this.combatIndicators.entries()) {
      indicator.timeAlive += dt;

      if (indicator.timeAlive >= indicator.duration) {
        toRemove.push(id);
      }
    }

    // Remove expired indicators
    for (const id of toRemove) {
      this.combatIndicators.delete(id);
    }
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

    // Calculate scale to fit map in canvas (fill entire canvas)
    const scaleX = canvasWidth / this.map.width;
    const scaleY = canvasHeight / this.map.height;
    this.pixelsPerMeter = Math.min(scaleX, scaleY);

    // Calculate offsets to center map
    this.offsetX = (canvasWidth - this.map.width * this.pixelsPerMeter) / 2;
    this.offsetY = (canvasHeight - this.map.height * this.pixelsPerMeter) / 2;
  }

  render(): void {
    if (!this.map) return;

    try {
      // Calculate delta time
      const now = performance.now();
      const dt = this.lastRenderTime === 0 ? 0.016 : (now - this.lastRenderTime) / 1000;
      this.lastRenderTime = now;

      // Update combat indicators (fade out and cleanup)
      this.update(dt);

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

      // Render combat indicators
      this.renderCombatIndicators();

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

    // Terrain is static — render to offscreen cache once, then blit each frame
    if (this.terrainCacheDirty || !this.terrainCache) {
      this.rebuildTerrainCache();
      this.terrainCacheDirty = false;
    }

    if (this.terrainCache) {
      this.ctx.drawImage(this.terrainCache, 0, 0);
    }
  }

  /**
   * Rebuild the offscreen terrain cache canvas (called once per map change)
   * Replaces 65K+ fillRect calls per frame with a single drawImage blit
   */
  private rebuildTerrainCache(): void {
    if (!this.map) return;

    const terrain = this.map.terrain;
    const cellSize = this.map.cellSize;

    // Create offscreen canvas matching the terrain area dimensions
    const cacheWidth = Math.ceil(this.map.width * this.pixelsPerMeter);
    const cacheHeight = Math.ceil(this.map.height * this.pixelsPerMeter);

    if (!this.terrainCache) {
      this.terrainCache = document.createElement('canvas');
    }
    this.terrainCache.width = cacheWidth;
    this.terrainCache.height = cacheHeight;

    const cacheCtx = this.terrainCache.getContext('2d');
    if (!cacheCtx) return;

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

        cacheCtx.fillStyle = color;
        cacheCtx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
      }
    }
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

    // Only show deployment zones during setup phase
    if (this.game.phase !== GamePhase.Setup) return;

    const ctx = this.ctx;
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    for (const zone of this.map.deploymentZones) {
      // Don't show enemy deployment zone - hidden by fog of war
      if (zone.team === 'enemy') continue;

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
      const w = zone.width * this.pixelsPerMeter;
      const h = zone.height * this.pixelsPerMeter;

      // Determine color based on ownership
      let color = this.COLORS.neutral;
      if (zone.owner === 'player') color = this.COLORS.friendly;
      else if (zone.owner === 'enemy') color = this.COLORS.enemy;

      // Draw zone rectangle
      ctx.fillStyle = color + '40'; // Semi-transparent fill
      ctx.fillRect(x - w / 2, z - h / 2, w, h);

      // Neutral zones use a bright white border for visibility on all biomes
      ctx.strokeStyle = zone.owner === 'neutral' ? '#ffffff' : color;
      ctx.lineWidth = zone.owner === 'neutral' ? 3 : 2;
      ctx.strokeRect(x - w / 2, z - h / 2, w, h);
    }
  }

  private renderResupplyPoints(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    for (const point of this.map.resupplyPoints) {
      // Don't show enemy resupply points - hidden by fog of war
      if (point.team === 'enemy') continue;

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

  private renderCombatIndicators(): void {
    if (!this.map) return;

    const ctx = this.ctx;
    const mapCenterX = this.map.width / 2;
    const mapCenterZ = this.map.height / 2;

    for (const indicator of this.combatIndicators.values()) {
      // Convert world coordinates to minimap coordinates
      const x = (indicator.x + mapCenterX) * this.pixelsPerMeter;
      const z = (indicator.z + mapCenterZ) * this.pixelsPerMeter;

      // Calculate fade progress (0 = just created, 1 = about to expire)
      const progress = indicator.timeAlive / indicator.duration;

      // Flash effect: brightest at start, fade out over time
      const opacity = Math.max(0, 1 - progress);

      // Determine color based on team
      const color = indicator.team === 'player' ? this.COLORS.friendly : this.COLORS.enemy;

      // Draw flashing circle
      ctx.beginPath();
      ctx.arc(x, z, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.fill();

      // Draw outer glow ring that expands
      const ringRadius = 5 + (progress * 8); // Expands from 5 to 13 pixels
      ctx.beginPath();
      ctx.arc(x, z, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = opacity * 0.5; // Dimmer ring
      ctx.stroke();

      // Reset alpha
      ctx.globalAlpha = 1.0;
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
