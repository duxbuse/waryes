/**
 * ZoneFillRenderer - Handles territorial fill visualization for capture zones
 *
 * Fills expand from unit entry points like water spreading:
 * - Same-team fills merge together
 * - Opposing team fills stop when they collide
 * - Once fully filled, contested zones rebalance to 50/50
 *
 * Outputs fill pixels to TerrainZoneShader's atlas texture instead of
 * creating floating mesh overlays.
 */

import type { TerrainZoneShader } from './TerrainZoneShader';

export interface FillEntry {
  unitId: string;
  team: 'player' | 'enemy';
  entryX: number; // World coordinates
  entryZ: number;
}

interface ZoneFillState {
  zoneId: string;
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
  resolution: number; // Pixels across the texture
  atlasSlotIndex: number;
  pixelBuffer: Uint8Array; // RGBA pixel data (resolution * resolution * 4)

  // Fill state - each cell stores: 0 = empty, 1 = player, 2 = enemy
  fillGrid: Uint8Array;
  // Distance from nearest same-team entry point (for expansion)
  playerDistances: Float32Array;
  enemyDistances: Float32Array;
  // Current fill radius for each team (still works conceptually as "expansion distance")
  playerFillRadius: number;
  enemyFillRadius: number;
  // Is the zone fully filled?
  isFullyFilled: boolean;
  // Has the zone been captured (locked)? Once captured, fill doesn't decay without enemy presence
  isCaptured: boolean;
  capturedBy: 'player' | 'enemy' | null;
  // Rebalance progress (0-1, where 0.5 = balanced)
  rebalanceRatio: number;
}

export class ZoneFillRenderer {
  private zones: Map<string, ZoneFillState> = new Map();
  private terrainZoneShader: TerrainZoneShader | null;
  private nextSlotIndex = 0;

  // Colors
  private readonly PLAYER_COLOR = { r: 0, g: 170, b: 255 }; // #00aaff
  private readonly ENEMY_COLOR = { r: 255, g: 68, b: 68 }; // #ff4444
  private readonly EMPTY_COLOR = { r: 60, g: 60, b: 60, a: 80 }; // Dark gray, subtle

  // Fill speed (world units per second)
  private readonly FILL_SPEED = 15;
  // Rebalance speed (ratio change per second)
  private readonly REBALANCE_SPEED = 0.1;

  constructor(terrainZoneShader: TerrainZoneShader | null) {
    this.terrainZoneShader = terrainZoneShader;
  }

  /**
   * Initialize a capture zone for fill rendering
   */
  initializeZone(zoneId: string, centerX: number, centerZ: number, width: number, height: number): void {
    const resolution = 128; // 128x128 texture

    // Initialize fill grid
    const gridSize = resolution * resolution;
    const fillGrid = new Uint8Array(gridSize);
    const playerDistances = new Float32Array(gridSize);
    const enemyDistances = new Float32Array(gridSize);

    // Initialize distances to max
    playerDistances.fill(Infinity);
    enemyDistances.fill(Infinity);

    // Allocate pixel buffer for this zone's atlas slot
    const pixelBuffer = new Uint8Array(resolution * resolution * 4);
    const atlasSlotIndex = this.nextSlotIndex++;

    const state: ZoneFillState = {
      zoneId,
      centerX,
      centerZ,
      width,
      height,
      resolution,
      atlasSlotIndex,
      pixelBuffer,
      fillGrid,
      playerDistances,
      enemyDistances,
      playerFillRadius: 0,
      enemyFillRadius: 0,
      isFullyFilled: false,
      isCaptured: false,
      capturedBy: null,
      rebalanceRatio: 0.5,
    };

    this.zones.set(zoneId, state);

    // Initial render (empty zone)
    this.renderZoneTexture(state);
  }

  /**
   * Update fill state with current unit entries
   */
  updateZone(zoneId: string, entries: FillEntry[], dt: number): void {
    const state = this.zones.get(zoneId);
    if (!state) return;

    // Separate entries by team
    const playerEntries = entries.filter(e => e.team === 'player');
    const enemyEntries = entries.filter(e => e.team === 'enemy');

    // Update distance fields from entry points
    this.updateDistanceField(state, playerEntries, state.playerDistances);
    this.updateDistanceField(state, enemyEntries, state.enemyDistances);

    if (playerEntries.length > 0) {
      state.playerFillRadius += this.FILL_SPEED * dt * Math.sqrt(playerEntries.length);
    } else {
      const shouldDecay = !state.isCaptured || state.capturedBy !== 'player' || enemyEntries.length > 0;
      if (shouldDecay && !state.isCaptured) {
        state.playerFillRadius = Math.max(0, state.playerFillRadius - this.FILL_SPEED * dt * 0.3);
      }
    }

    if (enemyEntries.length > 0) {
      state.enemyFillRadius += this.FILL_SPEED * dt * Math.sqrt(enemyEntries.length);
    } else {
      const shouldDecay = !state.isCaptured || state.capturedBy !== 'enemy' || playerEntries.length > 0;
      if (shouldDecay && !state.isCaptured) {
        state.enemyFillRadius = Math.max(0, state.enemyFillRadius - this.FILL_SPEED * dt * 0.3);
      }
    }

    // Cap fill radius at max possible distance (diagonal of box)
    const maxDist = Math.sqrt(state.width * state.width + state.height * state.height);
    state.playerFillRadius = Math.min(state.playerFillRadius, maxDist);
    state.enemyFillRadius = Math.min(state.enemyFillRadius, maxDist);

    // Update fill grid based on distances and fill radii
    let playerCells = 0;
    let enemyCells = 0;
    let emptyCells = 0;

    const { fillGrid, playerDistances, enemyDistances } = state;

    for (let i = 0; i < fillGrid.length; i++) {
      const playerDist = playerDistances[i]!;
      const enemyDist = enemyDistances[i]!;

      const playerCanFill = playerDist <= state.playerFillRadius && playerDist < Infinity;
      const enemyCanFill = enemyDist <= state.enemyFillRadius && enemyDist < Infinity;

      if (playerCanFill && enemyCanFill) {
        if (playerDist < enemyDist) {
          fillGrid[i] = 1;
          playerCells++;
        } else if (enemyDist < playerDist) {
          fillGrid[i] = 2;
          enemyCells++;
        } else {
          if (fillGrid[i] === 1) playerCells++;
          else if (fillGrid[i] === 2) enemyCells++;
          else emptyCells++;
        }
      } else if (playerCanFill) {
        fillGrid[i] = 1;
        playerCells++;
      } else if (enemyCanFill) {
        fillGrid[i] = 2;
        enemyCells++;
      } else {
        fillGrid[i] = 0;
        emptyCells++;
      }
    }

    // Check if zone is fully filled
    const totalValidCells = state.resolution * state.resolution;
    const filledCells = playerCells + enemyCells;
    state.isFullyFilled = filledCells >= totalValidCells * 0.95;

    // Check for capture or re-capture
    if (state.isFullyFilled) {
      if (playerCells > 0 && enemyCells === 0 && state.capturedBy !== 'player') {
        state.isCaptured = true;
        state.capturedBy = 'player';
      } else if (enemyCells > 0 && playerCells === 0 && state.capturedBy !== 'enemy') {
        state.isCaptured = true;
        state.capturedBy = 'enemy';
      }
    }

    // Rebalancing logic
    if (state.isFullyFilled && playerEntries.length > 0 && enemyEntries.length > 0) {
      const targetRatio = playerEntries.length / (playerEntries.length + enemyEntries.length);
      const currentRatio = playerCells / Math.max(1, playerCells + enemyCells);

      if (currentRatio < targetRatio) {
        state.rebalanceRatio = Math.min(targetRatio, state.rebalanceRatio + this.REBALANCE_SPEED * dt);
      } else if (currentRatio > targetRatio) {
        state.rebalanceRatio = Math.max(targetRatio, state.rebalanceRatio - this.REBALANCE_SPEED * dt);
      }

      this.applyRebalancing(state, targetRatio);
    }

    this.renderZoneTexture(state);
  }

  /**
   * Update distance field from entry points to all cells
   */
  private updateDistanceField(
    state: ZoneFillState,
    entries: FillEntry[],
    distances: Float32Array,
  ): void {
    const { resolution, centerX, centerZ, width, height } = state;

    // Reset distances if no entries
    if (entries.length === 0) {
      distances.fill(Infinity);
      return;
    }

    // Calculate distance from each cell to nearest entry point
    for (let py = 0; py < resolution; py++) {
      for (let px = 0; px < resolution; px++) {
        const i = py * resolution + px;

        // Convert pixel to world coordinates
        const worldX = centerX + (px / resolution - 0.5) * width;
        const worldZ = centerZ + (py / resolution - 0.5) * height;

        // Find minimum distance to any entry point
        let minDist = Infinity;
        for (const entry of entries) {
          const ex = entry.entryX - worldX;
          const ez = entry.entryZ - worldZ;
          const dist = Math.sqrt(ex * ex + ez * ez);
          minDist = Math.min(minDist, dist);
        }

        distances[i] = minDist;
      }
    }
  }

  /**
   * Apply rebalancing when zone is contested and fully filled
   */
  private applyRebalancing(state: ZoneFillState, targetRatio: number): void {
    const totalRadius = state.playerFillRadius + state.enemyFillRadius;
    if (totalRadius > 0) {
      const newPlayerRadius = totalRadius * targetRatio;
      const newEnemyRadius = totalRadius * (1 - targetRatio);

      // Smoothly transition
      state.playerFillRadius += (newPlayerRadius - state.playerFillRadius) * 0.05;
      state.enemyFillRadius += (newEnemyRadius - state.enemyFillRadius) * 0.05;
    }
  }

  /**
   * Render the fill state to the pixel buffer and upload to shader atlas
   */
  private renderZoneTexture(state: ZoneFillState): void {
    const { resolution, fillGrid, width, height, pixelBuffer } = state;

    for (let py = 0; py < resolution; py++) {
      for (let px = 0; px < resolution; px++) {
        const i = py * resolution + px;
        const pixelIndex = i * 4;

        // Distance from edge for softening
        const u = px / resolution;
        const v = py / resolution;
        const dEdgeU = 0.5 - Math.abs(u - 0.5);
        const dEdgeV = 0.5 - Math.abs(v - 0.5);
        const minEdgeDist = Math.min(dEdgeU * width, dEdgeV * height);

        // Larger fade distance for smoother blending (5 meters)
        const fadeDistance = 5.0;
        const edgeAlpha = Math.min(1, minEdgeDist / fadeDistance);

        const fillValue = fillGrid[i]!;

        if (fillValue === 1) {
          // Player fill
          pixelBuffer[pixelIndex] = this.PLAYER_COLOR.r;
          pixelBuffer[pixelIndex + 1] = this.PLAYER_COLOR.g;
          pixelBuffer[pixelIndex + 2] = this.PLAYER_COLOR.b;
          pixelBuffer[pixelIndex + 3] = Math.floor(200 * edgeAlpha);
        } else if (fillValue === 2) {
          // Enemy fill
          pixelBuffer[pixelIndex] = this.ENEMY_COLOR.r;
          pixelBuffer[pixelIndex + 1] = this.ENEMY_COLOR.g;
          pixelBuffer[pixelIndex + 2] = this.ENEMY_COLOR.b;
          pixelBuffer[pixelIndex + 3] = Math.floor(200 * edgeAlpha);
        } else {
          // Empty
          pixelBuffer[pixelIndex] = this.EMPTY_COLOR.r;
          pixelBuffer[pixelIndex + 1] = this.EMPTY_COLOR.g;
          pixelBuffer[pixelIndex + 2] = this.EMPTY_COLOR.b;
          pixelBuffer[pixelIndex + 3] = Math.floor(this.EMPTY_COLOR.a * edgeAlpha);
        }
      }
    }

    // Upload to shader atlas
    if (this.terrainZoneShader) {
      this.terrainZoneShader.updateFillAtlasSlot(state.atlasSlotIndex, pixelBuffer);
    }
  }

  /**
   * Get fill percentages for a zone
   */
  getZoneFillState(zoneId: string): {
    playerPercent: number;
    enemyPercent: number;
    isFullyFilled: boolean;
    isCaptured: boolean;
    capturedBy: 'player' | 'enemy' | null;
  } | null {
    const state = this.zones.get(zoneId);
    if (!state) return null;

    const { fillGrid } = state;
    let playerCells = 0;
    let enemyCells = 0;

    for (let i = 0; i < fillGrid.length; i++) {
      if (fillGrid[i] === 1) playerCells++;
      else if (fillGrid[i] === 2) enemyCells++;
    }

    const validCells = state.resolution * state.resolution;

    return {
      playerPercent: validCells > 0 ? playerCells / validCells : 0,
      enemyPercent: validCells > 0 ? enemyCells / validCells : 0,
      isFullyFilled: state.isFullyFilled,
      isCaptured: state.isCaptured,
      capturedBy: state.capturedBy,
    };
  }

  /**
   * Clear a zone's fill state
   */
  clearZone(zoneId: string): void {
    const state = this.zones.get(zoneId);
    if (!state) return;

    state.fillGrid.fill(0);
    state.playerDistances.fill(Infinity);
    state.enemyDistances.fill(Infinity);
    state.playerFillRadius = 0;
    state.enemyFillRadius = 0;
    state.isFullyFilled = false;
    state.isCaptured = false;
    state.capturedBy = null;
    state.rebalanceRatio = 0.5;

    this.renderZoneTexture(state);
  }

  /**
   * Clean up all zones
   */
  dispose(): void {
    this.zones.clear();
  }
}
