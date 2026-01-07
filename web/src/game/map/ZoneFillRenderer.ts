/**
 * ZoneFillRenderer - Handles territorial fill visualization for capture zones
 *
 * Fills expand from unit entry points like water spreading:
 * - Same-team fills merge together
 * - Opposing team fills stop when they collide
 * - Once fully filled, contested zones rebalance to 50/50
 */

import * as THREE from 'three';

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
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;

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
  private mapGroup: THREE.Group;

  // Colors
  private readonly PLAYER_COLOR = { r: 74, g: 158, b: 255 }; // #4a9eff
  private readonly ENEMY_COLOR = { r: 255, g: 74, b: 74 }; // #ff4a4a
  private readonly EMPTY_COLOR = { r: 60, g: 60, b: 60, a: 120 }; // Dark gray, slightly more visible for debugging

  // Fill speed (world units per second)
  private readonly FILL_SPEED = 15;
  // Rebalance speed (ratio change per second)
  private readonly REBALANCE_SPEED = 0.1;

  constructor(mapGroup: THREE.Group) {
    this.mapGroup = mapGroup;
  }

  /**
   * Initialize a capture zone for fill rendering
   */
  initializeZone(zoneId: string, centerX: number, centerZ: number, width: number, height: number): void {
    // Create canvas for this zone
    const resolution = 128; // 128x128 texture
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;

    // Initialize fill grid
    const gridSize = resolution * resolution;
    const fillGrid = new Uint8Array(gridSize);
    const playerDistances = new Float32Array(gridSize);
    const enemyDistances = new Float32Array(gridSize);

    // Initialize distances to max
    playerDistances.fill(Infinity);
    enemyDistances.fill(Infinity);

    // Create texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Create mesh for the fill visualization
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, 1.5, centerZ);
    mesh.renderOrder = 91;

    this.mapGroup.add(mesh);

    const state: ZoneFillState = {
      zoneId,
      centerX,
      centerZ,
      width,
      height,
      resolution,
      canvas,
      ctx,
      texture,
      mesh,
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

    console.log(`ZoneFillRenderer: Initialized zone ${zoneId} at (${centerX}, ${centerZ}) with size ${width}x${height}`);
  }

  /**
   * Update fill state with current unit entries
   */
  updateZone(zoneId: string, entries: FillEntry[], dt: number): void {
    // ... (rest of method, update logic mostly reusable as "fill radius" models expansion range)
    // Refactoring only geometry dependent parts below
    const state = this.zones.get(zoneId);
    if (!state) return;

    // Separate entries by team
    const playerEntries = entries.filter(e => e.team === 'player');
    const enemyEntries = entries.filter(e => e.team === 'enemy');

    // Update distance fields from entry points
    this.updateDistanceField(state, playerEntries, state.playerDistances, 'player');
    this.updateDistanceField(state, enemyEntries, state.enemyDistances, 'enemy');

    // ... Fill expansion logic remains valid as abstract "expansion distance" ...
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
    const totalValidCells = state.resolution * state.resolution; // All cells valid in rectangle
    const filledCells = playerCells + enemyCells;
    state.isFullyFilled = filledCells >= totalValidCells * 0.95;

    // Check for capture
    if (state.isFullyFilled && !state.isCaptured) {
      if (playerCells > 0 && enemyCells === 0) {
        state.isCaptured = true;
        state.capturedBy = 'player';
      } else if (enemyCells > 0 && playerCells === 0) {
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
    _team: 'player' | 'enemy'
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
        // Map 0..1 to -width/2 .. width/2
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
   * Count valid cells (cells within the zone)
   */
  private countValidCells(state: ZoneFillState): number {
    return state.resolution * state.resolution; // Rectangle fills entire texture
  }

  /**
   * Apply rebalancing when zone is contested and fully filled
   */
  private applyRebalancing(state: ZoneFillState, targetRatio: number): void {
    // Logic mostly unchanged, just using abstract radius
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
   * Render the fill state to the canvas texture
   */
  private renderZoneTexture(state: ZoneFillState): void {
    const { ctx, canvas, resolution, fillGrid, width, height } = state;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get image data for direct pixel manipulation
    const imageData = ctx.createImageData(resolution, resolution);
    const data = imageData.data;

    for (let py = 0; py < resolution; py++) {
      for (let px = 0; px < resolution; px++) {
        const i = py * resolution + px;
        const pixelIndex = i * 4;

        // Rectangular logic implies all pixels in texture are valid part of zone
        // But we might want edge softening

        // Distance from edge for softening
        // u, v are 0..1
        const u = px / resolution;
        const v = py / resolution;

        // distance from edge in UV space (0.5 is center, 0 or 1 is edge)
        const dEdgeU = 0.5 - Math.abs(u - 0.5);
        const dEdgeV = 0.5 - Math.abs(v - 0.5);
        const minEdgeDist = Math.min(dEdgeU * width, dEdgeV * height); // in world units approx

        const edgeAlpha = Math.min(1, minEdgeDist / 2.0); // 2 unit soften edge

        const fillValue = fillGrid[i]!;

        if (fillValue === 1) {
          // Player fill
          data[pixelIndex] = this.PLAYER_COLOR.r;
          data[pixelIndex + 1] = this.PLAYER_COLOR.g;
          data[pixelIndex + 2] = this.PLAYER_COLOR.b;
          data[pixelIndex + 3] = Math.floor(180 * edgeAlpha);
        } else if (fillValue === 2) {
          // Enemy fill
          data[pixelIndex] = this.ENEMY_COLOR.r;
          data[pixelIndex + 1] = this.ENEMY_COLOR.g;
          data[pixelIndex + 2] = this.ENEMY_COLOR.b;
          data[pixelIndex + 3] = Math.floor(180 * edgeAlpha);
        } else {
          // Empty - dark transparent
          data[pixelIndex] = this.EMPTY_COLOR.r;
          data[pixelIndex + 1] = this.EMPTY_COLOR.g;
          data[pixelIndex + 2] = this.EMPTY_COLOR.b;
          data[pixelIndex + 3] = Math.floor(this.EMPTY_COLOR.a * edgeAlpha);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Mark texture as needing update
    state.texture.needsUpdate = true;
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

    const validCells = this.countValidCells(state);

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
    for (const state of this.zones.values()) {
      this.mapGroup.remove(state.mesh);
      state.mesh.geometry.dispose();
      (state.mesh.material as THREE.Material).dispose();
      state.texture.dispose();
    }
    this.zones.clear();
  }
}
