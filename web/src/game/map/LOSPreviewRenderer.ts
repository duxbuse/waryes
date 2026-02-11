/**
 * LOSPreviewRenderer - Renders line of sight preview at mouse position
 *
 * Shows what a unit would see if positioned at the mouse cursor.
 * Includes blocking from terrain, buildings, and smoke.
 *
 * Renders via TerrainZoneShader (tinting terrain fragments) instead of
 * creating floating geometry overlays that cause parallax on hills.
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import { getVisionRadiusForOptics, VISION_RADIUS } from '../../data/types';
import type { TerrainZoneShader } from './TerrainZoneShader';

const LOS_TEXTURE_SIZE = 128;

// Colour scale for optics threshold rings: Poor=red → Exceptional=green
const RING_COLORS: Record<number, [number, number, number]> = {
  2: [255, 51, 51],    // Poor – red
  3: [255, 153, 51],   // Normal – orange
  4: [255, 221, 51],   // Good – yellow
  5: [153, 221, 51],   // Very Good – yellow-green
  6: [51, 204, 51],    // Exceptional – green
};

export class LOSPreviewRenderer {
  private readonly game: Game;
  private previewRadius = 50;
  private terrainZoneShader: TerrainZoneShader | null = null;

  // Reusable pixel buffer to avoid per-frame allocation
  private losPixelBuffer = new Uint8Array(LOS_TEXTURE_SIZE * LOS_TEXTURE_SIZE * 4);

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Set the terrain zone shader reference (called after map is rendered)
   */
  setTerrainZoneShader(shader: TerrainZoneShader | null): void {
    this.terrainZoneShader = shader;
  }

  /**
   * Show LOS preview at world position
   */
  show(worldPos: THREE.Vector3, unit: Unit | null): void {
    if (!this.terrainZoneShader) return;

    // Calculate vision radius based on unit optics
    if (unit && unit.data) {
      this.previewRadius = getVisionRadiusForOptics(unit.data.optics);
    } else {
      this.previewRadius = 300;
    }

    // Compute LOS blocking data and render to pixel buffer
    this.renderLOSTexture(worldPos);

    // Pass to shader
    this.terrainZoneShader.setLOS(
      true,
      worldPos.x,
      worldPos.z,
      this.previewRadius,
      this.losPixelBuffer
    );

    // Pass optics threshold rings to shader for smooth GPU rendering
    if (!unit) {
      const rings: Array<{ radius: number; r: number; g: number; b: number }> = [];
      const entries = Object.entries(VISION_RADIUS)
        .map(([k, v]) => [Number(k), v] as [number, number])
        .sort((a, b) => a[1] - b[1]);
      for (const [opticsVal, r] of entries) {
        const color = RING_COLORS[opticsVal] ?? [74, 158, 255];
        rings.push({ radius: r, r: color[0] / 255, g: color[1] / 255, b: color[2] / 255 });
      }
      this.terrainZoneShader.setLOSRings(rings);
    } else {
      this.terrainZoneShader.setLOSRings([]);
    }
  }

  /**
   * Hide LOS preview
   */
  hide(): void {
    if (this.terrainZoneShader) {
      this.terrainZoneShader.setLOS(false);
    }
  }

  /**
   * Render LOS data to the pixel buffer (128x128 Cartesian map)
   *
   * Blue = visible area, Red = blocked area, Transparent = outside circle
   * Optics threshold rings are rendered by the GPU shader for smooth anti-aliasing
   */
  private renderLOSTexture(worldPos: THREE.Vector3): void {
    const buf = this.losPixelBuffer;
    const size = LOS_TEXTURE_SIZE;
    const radius = this.previewRadius;

    // Pre-compute blocking distances for each angular direction
    // Use 64 angular samples and interpolate for texture pixels
    const angularSamples = 64;
    const blockingDistances = new Float32Array(angularSamples);
    for (let i = 0; i < angularSamples; i++) {
      const angle = (i / angularSamples) * Math.PI * 2;
      blockingDistances[i] = this.findBlockingDistance(worldPos, angle, radius);
    }

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const idx = (py * size + px) * 4;

        // Convert pixel to offset from center (-1 to 1)
        const nx = (px / size) * 2 - 1;
        const ny = (py / size) * 2 - 1;
        const dist = Math.sqrt(nx * nx + ny * ny);

        if (dist > 1.0) {
          // Outside circle - transparent
          buf[idx] = 0;
          buf[idx + 1] = 0;
          buf[idx + 2] = 0;
          buf[idx + 3] = 0;
          continue;
        }

        const worldDist = dist * radius;

        // Determine blocking by interpolating angular samples
        const angle = Math.atan2(ny, nx);
        const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
        const sampleIdx = (normalizedAngle / (Math.PI * 2)) * angularSamples;
        const sampleLow = Math.floor(sampleIdx) % angularSamples;
        const sampleHigh = (sampleLow + 1) % angularSamples;
        const sampleFrac = sampleIdx - Math.floor(sampleIdx);
        const blockDist = blockingDistances[sampleLow]! * (1 - sampleFrac) +
          blockingDistances[sampleHigh]! * sampleFrac;

        const isBlocked = worldDist > blockDist;

        if (isBlocked) {
          // Blocked area - red shadow
          buf[idx] = 255;     // r
          buf[idx + 1] = 0;   // g
          buf[idx + 2] = 0;   // b
          buf[idx + 3] = 50;  // a (subtle)
        } else {
          // Visible area - blue tint
          buf[idx] = 74;      // r
          buf[idx + 1] = 158;  // g
          buf[idx + 2] = 255;  // b
          buf[idx + 3] = 70;  // a
        }
      }
    }
  }

  /**
   * Find the distance along a ray where LOS becomes blocked
   * Returns the preview radius if unblocked
   */
  private findBlockingDistance(origin: THREE.Vector3, angle: number, maxDist: number): number {
    const samples = 10;

    for (let i = 1; i <= samples; i++) {
      const dist = (i / samples) * maxDist;
      const x = origin.x + Math.cos(angle) * dist;
      const z = origin.z + Math.sin(angle) * dist;
      const testPos = new THREE.Vector3(x, origin.y, z);

      if (this.isLOSBlocked(origin, testPos)) {
        return Math.max(0, ((i - 1) / samples) * maxDist);
      }
    }

    return maxDist;
  }

  /**
   * Check if LOS is blocked between two positions
   */
  private isLOSBlocked(start: THREE.Vector3, end: THREE.Vector3): boolean {
    if (this.isTerrainBlocking(start, end)) return true;
    if (this.game.smokeManager.blocksLOS(start, end)) return true;
    if (this.isBuildingBlocking(start, end)) return true;
    if (this.isForestBlocking(start, end)) return true;
    return false;
  }

  /**
   * Check if terrain elevation blocks line of sight
   */
  private isTerrainBlocking(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const map = this.game.currentMap;
    if (!map) return false;

    const terrain = map.terrain;
    const cols = terrain[0]?.length ?? 0;
    const rows = terrain.length;
    if (cols === 0 || rows === 0) return false;

    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    const startElevation = this.getTerrainElevation(start.x, start.z, map);
    const endElevation = this.getTerrainElevation(end.x, end.z, map);

    const eyeHeight = 2.0;
    const startHeight = startElevation + eyeHeight;
    const endHeight = endElevation + eyeHeight;

    const direction = new THREE.Vector3().subVectors(end, start);
    const horizontalDist = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    const steps = Math.max(10, Math.ceil(horizontalDist / Math.min(cellSizeX, cellSizeZ)));

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sampleX = start.x + direction.x * t;
      const sampleZ = start.z + direction.z * t;
      const losHeight = startHeight + (endHeight - startHeight) * t;
      const terrainElevation = this.getTerrainElevation(sampleX, sampleZ, map);

      if (terrainElevation > losHeight) return true;
    }

    return false;
  }

  /**
   * Get terrain elevation at a world position using bilinear interpolation
   */
  private getTerrainElevation(worldX: number, worldZ: number, map: { width: number; height: number; terrain: Array<Array<{ elevation: number }>> }): number {
    const terrain = map.terrain;
    const cols = terrain[0]?.length ?? 0;
    const rows = terrain.length;

    if (cols === 0 || rows === 0) return 0;

    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    const gx = (worldX + map.width / 2) / cellSizeX;
    const gz = (worldZ + map.height / 2) / cellSizeZ;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const cx0 = Math.max(0, Math.min(x0, cols - 1));
    const cz0 = Math.max(0, Math.min(z0, rows - 1));
    const cx1 = Math.max(0, Math.min(x1, cols - 1));
    const cz1 = Math.max(0, Math.min(z1, rows - 1));

    const e00 = terrain[cz0]?.[cx0]?.elevation ?? 0;
    const e10 = terrain[cz0]?.[cx1]?.elevation ?? 0;
    const e01 = terrain[cz1]?.[cx0]?.elevation ?? 0;
    const e11 = terrain[cz1]?.[cx1]?.elevation ?? 0;

    const fx = gx - x0;
    const fz = gz - z0;
    const clampedFx = Math.max(0, Math.min(1, fx));
    const clampedFz = Math.max(0, Math.min(1, fz));

    const e0 = e00 * (1 - clampedFx) + e10 * clampedFx;
    const e1 = e01 * (1 - clampedFx) + e11 * clampedFx;

    return e0 * (1 - clampedFz) + e1 * clampedFz;
  }

  /**
   * Check if buildings block line of sight
   */
  private isBuildingBlocking(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const buildings = this.game.currentMap?.buildings ?? [];

    for (const building of buildings) {
      const buildingPos = new THREE.Vector3(building.x, 0, building.z);
      const halfWidth = building.width / 2;
      const halfDepth = building.depth / 2;

      if (this.lineIntersectsBox2D(start, end, buildingPos, halfWidth, halfDepth)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if forests block line of sight
   */
  private isForestBlocking(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const map = this.game.currentMap;
    if (!map) return false;

    const terrain = map.terrain;
    const cols = terrain[0]?.length ?? 0;
    const rows = terrain.length;
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;
    const cellSize = Math.max(cellSizeX, cellSizeZ);

    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = direction.length();
    const steps = Math.ceil(distance / cellSize);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = new THREE.Vector3().lerpVectors(start, end, t);

      const gridX = Math.floor((point.x + map.width / 2) / cellSizeX);
      const gridZ = Math.floor((point.z + map.height / 2) / cellSizeZ);

      if (gridZ >= 0 && gridZ < rows && gridX >= 0 && gridX < cols) {
        const cell = terrain[gridZ]?.[gridX];
        if (cell?.type === 'forest') return true;
      }
    }

    return false;
  }

  /**
   * 2D line-box intersection test
   */
  private lineIntersectsBox2D(
    start: THREE.Vector3,
    end: THREE.Vector3,
    boxCenter: THREE.Vector3,
    halfWidth: number,
    halfDepth: number
  ): boolean {
    const minX = boxCenter.x - halfWidth;
    const maxX = boxCenter.x + halfWidth;
    const minZ = boxCenter.z - halfDepth;
    const maxZ = boxCenter.z + halfDepth;

    if (this.pointInBox2D(start, minX, maxX, minZ, maxZ) ||
      this.pointInBox2D(end, minX, maxX, minZ, maxZ)) {
      return true;
    }

    const dx = end.x - start.x;
    const dz = end.z - start.z;

    for (const x of [minX, maxX]) {
      if (dx !== 0) {
        const t = (x - start.x) / dx;
        if (t >= 0 && t <= 1) {
          const z = start.z + t * dz;
          if (z >= minZ && z <= maxZ) return true;
        }
      }
    }

    for (const z of [minZ, maxZ]) {
      if (dz !== 0) {
        const t = (z - start.z) / dz;
        if (t >= 0 && t <= 1) {
          const x = start.x + t * dx;
          if (x >= minX && x <= maxX) return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a point is inside a 2D box
   */
  private pointInBox2D(
    point: THREE.Vector3,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): boolean {
    return point.x >= minX && point.x <= maxX &&
      point.z >= minZ && point.z <= maxZ;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.hide();
  }
}
