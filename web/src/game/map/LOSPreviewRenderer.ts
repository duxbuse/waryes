/**
 * LOSPreviewRenderer - Renders line of sight preview at mouse position
 *
 * Shows what a unit would see if positioned at the mouse cursor
 * Includes blocking from terrain, buildings, and smoke
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import { opticsToNumber } from '../../data/types';

export class LOSPreviewRenderer {
  private readonly game: Game;
  private readonly scene: THREE.Scene;

  // Preview mesh
  private previewMesh: THREE.Mesh | null = null;
  private previewRadius = 50; // Default radius

  // Blocked areas overlay
  private blockedMesh: THREE.Mesh | null = null;

  constructor(game: Game) {
    this.game = game;
    this.scene = game.scene;
  }

  /**
   * Show LOS preview at world position
   */
  show(worldPos: THREE.Vector3, unit: Unit | null): void {
    // Calculate vision radius based on unit optics
    if (unit && unit.data) {
      const opticsValue = opticsToNumber(unit.data.optics);
      // Base vision: 50m, each optics point adds 10m
      // Poor(2)=70m, Normal(3)=80m, Good(4)=90m, Very Good(5)=100m, Exceptional(6)=110m
      this.previewRadius = 50 + (opticsValue * 10);
    } else {
      this.previewRadius = 80; // Default if no unit selected
    }

    // Create or update the preview circle
    this.updatePreviewCircle(worldPos);

    // Create or update blocked areas visualization
    this.updateBlockedAreas(worldPos);
  }

  /**
   * Hide LOS preview
   */
  hide(): void {
    if (this.previewMesh) {
      // Clean up ring mesh if it exists
      const ringMesh = this.previewMesh.userData.ringMesh as THREE.Mesh | undefined;
      if (ringMesh) {
        this.scene.remove(ringMesh);
        ringMesh.geometry.dispose();
        (ringMesh.material as THREE.Material).dispose();
      }

      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      (this.previewMesh.material as THREE.Material).dispose();
      this.previewMesh = null;
    }

    if (this.blockedMesh) {
      this.scene.remove(this.blockedMesh);
      this.blockedMesh.geometry.dispose();
      (this.blockedMesh.material as THREE.Material).dispose();
      this.blockedMesh = null;
    }
  }

  /**
   * Create or update the main preview circle
   */
  private updatePreviewCircle(worldPos: THREE.Vector3): void {
    // Remove old mesh if exists
    if (this.previewMesh) {
      // Clean up old ring mesh if it exists
      const oldRingMesh = this.previewMesh.userData.ringMesh as THREE.Mesh | undefined;
      if (oldRingMesh) {
        this.scene.remove(oldRingMesh);
        oldRingMesh.geometry.dispose();
        (oldRingMesh.material as THREE.Material).dispose();
      }

      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      (this.previewMesh.material as THREE.Material).dispose();
    }

    // Create terrain-conforming circle geometry with high resolution
    const radialSegments = 128; // High segment count for smooth appearance
    const ringCount = Math.ceil(this.previewRadius / 5); // One ring every 5 meters
    const vertices: number[] = [];
    const indices: number[] = [];

    const map = this.game.currentMap;
    const heightOffset = 0.5; // Small offset above terrain to prevent z-fighting

    // Build concentric rings from center outward
    for (let ring = 0; ring <= ringCount; ring++) {
      const radius = (ring / ringCount) * this.previewRadius;

      if (ring === 0) {
        // Center vertex
        const centerElevation = map ? this.getTerrainElevation(worldPos.x, worldPos.z, map) : 0;
        vertices.push(worldPos.x, centerElevation + heightOffset, worldPos.z);
      } else {
        // Ring vertices
        for (let i = 0; i < radialSegments; i++) {
          const angle = (i / radialSegments) * Math.PI * 2;
          const x = worldPos.x + Math.cos(angle) * radius;
          const z = worldPos.z + Math.sin(angle) * radius;
          const elevation = map ? this.getTerrainElevation(x, z, map) : 0;
          vertices.push(x, elevation + heightOffset, z);
        }
      }
    }

    // Create indices connecting rings
    let vertexIndex = 1; // Start after center vertex
    for (let ring = 0; ring < ringCount; ring++) {
      if (ring === 0) {
        // Connect center to first ring
        for (let i = 0; i < radialSegments; i++) {
          const next = (i + 1) % radialSegments;
          indices.push(0, vertexIndex + i, vertexIndex + next);
        }
        vertexIndex += radialSegments;
      } else {
        // Connect ring to next ring
        const currentRingStart = vertexIndex - radialSegments;
        const nextRingStart = vertexIndex;

        for (let i = 0; i < radialSegments; i++) {
          const next = (i + 1) % radialSegments;

          // Two triangles per quad
          indices.push(currentRingStart + i, nextRingStart + i, nextRingStart + next);
          indices.push(currentRingStart + i, nextRingStart + next, currentRingStart + next);
        }
        vertexIndex += radialSegments;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color: 0x4a9eff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true, // Enable depth test so it follows terrain
    });

    this.previewMesh = new THREE.Mesh(geometry, material);
    this.previewMesh.renderOrder = 98;
    this.scene.add(this.previewMesh);

    // Add border ring with terrain conforming
    const ringVertices: number[] = [];
    const ringIndices: number[] = [];

    for (let i = 0; i <= radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;

      // Inner ring
      const innerX = worldPos.x + Math.cos(angle) * (this.previewRadius - 0.5);
      const innerZ = worldPos.z + Math.sin(angle) * (this.previewRadius - 0.5);
      const innerElev = map ? this.getTerrainElevation(innerX, innerZ, map) : 0;
      ringVertices.push(innerX, innerElev + heightOffset + 0.1, innerZ);

      // Outer ring
      const outerX = worldPos.x + Math.cos(angle) * this.previewRadius;
      const outerZ = worldPos.z + Math.sin(angle) * this.previewRadius;
      const outerElev = map ? this.getTerrainElevation(outerX, outerZ, map) : 0;
      ringVertices.push(outerX, outerElev + heightOffset + 0.1, outerZ);
    }

    // Create quad strip indices
    for (let i = 0; i < radialSegments; i++) {
      const base = i * 2;
      ringIndices.push(base, base + 1, base + 3);
      ringIndices.push(base, base + 3, base + 2);
    }

    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringVertices, 3));
    ringGeometry.setIndex(ringIndices);
    ringGeometry.computeVertexNormals();

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a9eff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    });

    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.renderOrder = 99;
    this.scene.add(ringMesh);

    // Store ring mesh for cleanup
    if (this.previewMesh) {
      this.previewMesh.userData.ringMesh = ringMesh;
    }
  }

  /**
   * Create visualization of blocked LOS areas (shadows behind obstacles)
   */
  private updateBlockedAreas(worldPos: THREE.Vector3): void {
    // Remove old blocked mesh if exists
    if (this.blockedMesh) {
      this.scene.remove(this.blockedMesh);
      this.blockedMesh.geometry.dispose();
      (this.blockedMesh.material as THREE.Material).dispose();
    }

    const map = this.game.currentMap;
    const heightOffset = 0.6; // Slightly above the blue circle

    // Sample points around the circle to detect blocked areas
    const segments = 64;
    const blockedVertices: number[] = [];
    const blockedIndices: number[] = [];

    // For each direction, find where blocking occurs and create shadow geometry
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const nextAngle = ((i + 1) / segments) * Math.PI * 2;

      // Current and next edge positions
      const x1 = worldPos.x + Math.cos(angle) * this.previewRadius;
      const z1 = worldPos.z + Math.sin(angle) * this.previewRadius;
      const x2 = worldPos.x + Math.cos(nextAngle) * this.previewRadius;
      const z2 = worldPos.z + Math.sin(nextAngle) * this.previewRadius;

      // Find blocking distance along each ray
      const blockDist1 = this.findBlockingDistance(worldPos, angle, this.previewRadius);
      const blockDist2 = this.findBlockingDistance(worldPos, nextAngle, this.previewRadius);

      // If either ray is blocked, create shadow geometry
      if (blockDist1 < this.previewRadius || blockDist2 < this.previewRadius) {
        const baseIdx = blockedVertices.length / 3;

        // Inner edge (at blocking point)
        const innerX1 = worldPos.x + Math.cos(angle) * blockDist1;
        const innerZ1 = worldPos.z + Math.sin(angle) * blockDist1;
        const innerX2 = worldPos.x + Math.cos(nextAngle) * blockDist2;
        const innerZ2 = worldPos.z + Math.sin(nextAngle) * blockDist2;

        // Sample terrain elevation at each vertex
        const innerElev1 = map ? this.getTerrainElevation(innerX1, innerZ1, map) : 0;
        const innerElev2 = map ? this.getTerrainElevation(innerX2, innerZ2, map) : 0;
        const outerElev1 = map ? this.getTerrainElevation(x1, z1, map) : 0;
        const outerElev2 = map ? this.getTerrainElevation(x2, z2, map) : 0;

        // Add vertices for shadow quad (from blocking point to edge)
        blockedVertices.push(innerX1, innerElev1 + heightOffset, innerZ1); // 0
        blockedVertices.push(innerX2, innerElev2 + heightOffset, innerZ2); // 1
        blockedVertices.push(x2, outerElev2 + heightOffset, z2); // 2
        blockedVertices.push(x1, outerElev1 + heightOffset, z1); // 3

        // Create two triangles for the quad
        blockedIndices.push(baseIdx, baseIdx + 1, baseIdx + 2);
        blockedIndices.push(baseIdx, baseIdx + 2, baseIdx + 3);
      }
    }

    // Create mesh from blocked areas
    if (blockedVertices.length >= 12 && blockedIndices.length >= 6) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(blockedVertices, 3));
      geometry.setIndex(blockedIndices);
      geometry.computeVertexNormals();

      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true, // Enable depth test to follow terrain
      });

      this.blockedMesh = new THREE.Mesh(geometry, material);
      this.blockedMesh.renderOrder = 97; // Below the main preview
      this.scene.add(this.blockedMesh);
    }
  }

  /**
   * Find the distance along a ray where LOS becomes blocked
   * Returns the preview radius if unblocked
   */
  private findBlockingDistance(origin: THREE.Vector3, angle: number, maxDist: number): number {
    const samples = 10; // Number of samples along the ray

    for (let i = 1; i <= samples; i++) {
      const dist = (i / samples) * maxDist;
      const x = origin.x + Math.cos(angle) * dist;
      const z = origin.z + Math.sin(angle) * dist;
      const testPos = new THREE.Vector3(x, origin.y, z);

      if (this.isLOSBlocked(origin, testPos)) {
        // Found blocking - return distance to previous sample
        return Math.max(0, ((i - 1) / samples) * maxDist);
      }
    }

    return maxDist; // No blocking found
  }

  /**
   * Check if LOS is blocked between two positions
   * Reuses logic from FogOfWarManager
   */
  private isLOSBlocked(start: THREE.Vector3, end: THREE.Vector3): boolean {
    // Check terrain elevation blocking (mountains, cliffs, hills)
    if (this.isTerrainBlocking(start, end)) {
      return true;
    }

    // Check smoke blocking
    if (this.game.smokeManager.blocksLOS(start, end)) {
      return true;
    }

    // Check building blocking
    if (this.isBuildingBlocking(start, end)) {
      return true;
    }

    // Check forest blocking
    if (this.isForestBlocking(start, end)) {
      return true;
    }

    return false;
  }

  /**
   * Check if terrain elevation blocks line of sight
   * Uses ray casting from viewer eye height to target
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

    // Get terrain elevation at start and end positions
    const startElevation = this.getTerrainElevation(start.x, start.z, map);
    const endElevation = this.getTerrainElevation(end.x, end.z, map);

    // Eye height above terrain (standing observer)
    const eyeHeight = 2.0;
    const startHeight = startElevation + eyeHeight;
    const endHeight = endElevation + eyeHeight;

    // Sample points along the line to check for terrain blocking
    const direction = new THREE.Vector3().subVectors(end, start);
    const horizontalDist = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    const steps = Math.max(10, Math.ceil(horizontalDist / Math.min(cellSizeX, cellSizeZ)));

    for (let i = 1; i < steps; i++) {
      const t = i / steps;

      // Position along the ray
      const sampleX = start.x + direction.x * t;
      const sampleZ = start.z + direction.z * t;

      // Height of the LOS line at this point (linear interpolation)
      const losHeight = startHeight + (endHeight - startHeight) * t;

      // Get terrain elevation at this sample point
      const terrainElevation = this.getTerrainElevation(sampleX, sampleZ, map);

      // If terrain is higher than the line of sight, it blocks
      if (terrainElevation > losHeight) {
        return true;
      }
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

    // Convert world position to grid coordinates
    const gx = (worldX + map.width / 2) / cellSizeX;
    const gz = (worldZ + map.height / 2) / cellSizeZ;

    // Get integer cell indices
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    // Clamp to valid range
    const cx0 = Math.max(0, Math.min(x0, cols - 1));
    const cz0 = Math.max(0, Math.min(z0, rows - 1));
    const cx1 = Math.max(0, Math.min(x1, cols - 1));
    const cz1 = Math.max(0, Math.min(z1, rows - 1));

    // Get elevations at four corners
    const e00 = terrain[cz0]?.[cx0]?.elevation ?? 0;
    const e10 = terrain[cz0]?.[cx1]?.elevation ?? 0;
    const e01 = terrain[cz1]?.[cx0]?.elevation ?? 0;
    const e11 = terrain[cz1]?.[cx1]?.elevation ?? 0;

    // Bilinear interpolation
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

    // Sample points along the line
    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = direction.length();
    const steps = Math.ceil(distance / cellSize);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = new THREE.Vector3().lerpVectors(start, end, t);

      // Convert world position to grid coordinates
      const gridX = Math.floor((point.x + map.width / 2) / cellSizeX);
      const gridZ = Math.floor((point.z + map.height / 2) / cellSizeZ);

      if (gridZ >= 0 && gridZ < rows && gridX >= 0 && gridX < cols) {
        const cell = terrain[gridZ]?.[gridX];
        if (cell?.type === 'forest') {
          return true;
        }
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

    // Check if either endpoint is inside the box
    if (this.pointInBox2D(start, minX, maxX, minZ, maxZ) ||
      this.pointInBox2D(end, minX, maxX, minZ, maxZ)) {
      return true;
    }

    // Check line segment intersection with box edges
    const dx = end.x - start.x;
    const dz = end.z - start.z;

    // Check intersection with vertical edges
    for (const x of [minX, maxX]) {
      if (dx !== 0) {
        const t = (x - start.x) / dx;
        if (t >= 0 && t <= 1) {
          const z = start.z + t * dz;
          if (z >= minZ && z <= maxZ) {
            return true;
          }
        }
      }
    }

    // Check intersection with horizontal edges
    for (const z of [minZ, maxZ]) {
      if (dz !== 0) {
        const t = (z - start.z) / dz;
        if (t >= 0 && t <= 1) {
          const x = start.x + t * dx;
          if (x >= minX && x <= maxX) {
            return true;
          }
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
