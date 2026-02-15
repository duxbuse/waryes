/**
 * TraversabilityDebugRenderer - Debug overlay showing navigation data
 *
 * Shows EITHER:
 *   1. NavMesh polygons (cyan wireframe + translucent fill) when navmesh is available
 *   2. Grid-based traversability overlay (green/yellow/red) as fallback
 *
 * Built once when toggled on, disposed when toggled off.
 * No per-frame cost.
 */

import * as THREE from 'three';
import { NavMeshHelper } from '@recast-navigation/three';
import type { NavMesh } from '@recast-navigation/core';
import type { Game } from '../../core/Game';

export class TraversabilityDebugRenderer {
  private mesh: THREE.Mesh | null = null;
  private navMeshHelper: THREE.Object3D | null = null;
  private readonly game: Game;
  private readonly scene: THREE.Scene;

  constructor(game: Game, scene: THREE.Scene) {
    this.game = game;
    this.scene = scene;
  }

  build(): void {
    this.dispose();

    // Try navmesh visualization first
    const navMesh = this.game.navMeshManager.getNavMesh();
    if (navMesh) {
      this.buildNavMeshOverlay(navMesh);
    } else {
      this.buildGridOverlay();
    }
  }

  /**
   * Show navmesh polygons as a translucent wireframe overlay
   */
  private buildNavMeshOverlay(navMesh: NavMesh): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0x00cccc,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
      wireframe: false,
    });

    const helper = new NavMeshHelper(navMesh, { navMeshMaterial: material });
    helper.name = 'navmesh-debug';
    helper.renderOrder = 999;

    // Offset slightly above terrain to reduce z-fighting
    helper.position.y = 0.3;

    this.navMeshHelper = helper;
    this.scene.add(helper);

    // Add a wireframe on top for polygon edge visibility
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      wireframe: true,
    });

    const wireHelper = new NavMeshHelper(navMesh, { navMeshMaterial: wireframeMat });
    wireHelper.name = 'navmesh-debug-wire';
    wireHelper.renderOrder = 1000;
    wireHelper.position.y = 0.35;

    // Attach as child so dispose cleans up both
    helper.add(wireHelper);

    console.log('[TraversabilityDebugRenderer] NavMesh overlay enabled');
  }

  /**
   * Fallback: show grid-based traversability colored by pathfinding cost
   *   Green  = normal passable (cost = 1.0)
   *   Yellow = high cost / steep (cost 1.0-5.0)
   *   Red    = impassable (cost = Infinity)
   */
  private buildGridOverlay(): void {
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

    console.log('[TraversabilityDebugRenderer] Grid overlay enabled (navmesh not available)');
  }

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    if (this.navMeshHelper) {
      // Dispose child wireframe helper materials/geometries
      this.navMeshHelper.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.navMeshHelper);
      this.navMeshHelper = null;
    }
  }
}
