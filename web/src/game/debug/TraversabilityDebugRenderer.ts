/**
 * TraversabilityDebugRenderer - Debug overlay showing navGrid traversability
 *
 * Builds a single static mesh colored by pathfinding cost:
 * - Green: normal passable (cost = 1.0)
 * - Yellow: high cost / steep (cost 1.0–5.0)
 * - Red: impassable (cost = Infinity)
 *
 * Built once when toggled on, disposed when toggled off.
 * No per-frame cost.
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';

export class TraversabilityDebugRenderer {
  private mesh: THREE.Mesh | null = null;
  private readonly game: Game;
  private readonly scene: THREE.Scene;

  constructor(game: Game, scene: THREE.Scene) {
    this.game = game;
    this.scene = scene;
  }

  build(): void {
    this.dispose();

    const data = this.game.pathfindingManager.getNavGridData();
    if (data.gridWidth === 0 || data.gridHeight === 0) return;

    const { navGrid, gridWidth, gridHeight, gridSize, mapWidth, mapHeight } = data;

    // Each cell = 2 triangles = 6 indices, 4 vertices
    const cellCount = gridWidth * gridHeight;
    const vertexCount = cellCount * 4;
    const indexCount = cellCount * 6;

    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);

    const halfW = mapWidth / 2;
    const halfH = mapHeight / 2;
    const yOffset = 0.3; // Slightly above terrain to avoid z-fighting

    const green = { r: 0.1, g: 0.8, b: 0.2 };
    const yellow = { r: 0.9, g: 0.8, b: 0.1 };
    const red = { r: 0.9, g: 0.1, b: 0.1 };

    let vi = 0; // vertex index
    let ii = 0; // index index

    for (let gz = 0; gz < gridHeight; gz++) {
      const row = navGrid[gz];
      if (!row) continue;

      for (let gx = 0; gx < gridWidth; gx++) {
        const cost = row[gx] ?? 1.0;

        // Determine color
        let r: number, g: number, b: number;
        if (cost === Infinity || cost > 100) {
          r = red.r; g = red.g; b = red.b;
        } else if (cost > 1.0) {
          // Lerp green -> yellow based on cost (1.0 to 5.0)
          const t = Math.min((cost - 1.0) / 4.0, 1.0);
          r = green.r + (yellow.r - green.r) * t;
          g = green.g + (yellow.g - green.g) * t;
          b = green.b + (yellow.b - green.b) * t;
        } else {
          r = green.r; g = green.g; b = green.b;
        }

        // World-space corners of this cell
        const x0 = gx * gridSize - halfW;
        const x1 = x0 + gridSize;
        const z0 = gz * gridSize - halfH;
        const z1 = z0 + gridSize;

        // Get terrain elevations at corners
        const y0 = this.game.getElevationAt(x0, z0) + yOffset;
        const y1 = this.game.getElevationAt(x1, z0) + yOffset;
        const y2 = this.game.getElevationAt(x0, z1) + yOffset;
        const y3 = this.game.getElevationAt(x1, z1) + yOffset;

        const base = vi;

        // 4 vertices per cell
        positions[vi * 3]     = x0; positions[vi * 3 + 1] = y0; positions[vi * 3 + 2] = z0;
        colors[vi * 3]        = r;  colors[vi * 3 + 1]     = g;  colors[vi * 3 + 2]     = b;
        vi++;

        positions[vi * 3]     = x1; positions[vi * 3 + 1] = y1; positions[vi * 3 + 2] = z0;
        colors[vi * 3]        = r;  colors[vi * 3 + 1]     = g;  colors[vi * 3 + 2]     = b;
        vi++;

        positions[vi * 3]     = x0; positions[vi * 3 + 1] = y2; positions[vi * 3 + 2] = z1;
        colors[vi * 3]        = r;  colors[vi * 3 + 1]     = g;  colors[vi * 3 + 2]     = b;
        vi++;

        positions[vi * 3]     = x1; positions[vi * 3 + 1] = y3; positions[vi * 3 + 2] = z1;
        colors[vi * 3]        = r;  colors[vi * 3 + 1]     = g;  colors[vi * 3 + 2]     = b;
        vi++;

        // 2 triangles: (0,2,1), (1,2,3)
        indices[ii++] = base;
        indices[ii++] = base + 2;
        indices[ii++] = base + 1;
        indices[ii++] = base + 1;
        indices[ii++] = base + 2;
        indices[ii++] = base + 3;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'traversability-debug';
    this.mesh.renderOrder = 999; // Render on top
    this.scene.add(this.mesh);
  }

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
  }
}
