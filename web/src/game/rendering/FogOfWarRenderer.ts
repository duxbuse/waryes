/**
 * FogOfWarRenderer - Renders fog of war overlay on the map
 *
 * Features:
 * - Three visibility states: Unexplored (black), Explored (gray shroud), Visible (transparent)
 * - Texture-based approach for efficient GPU rendering
 * - Custom shader material for fog visualization
 * - Real-time updates synchronized with FogOfWarManager
 *
 * Performance:
 * - Uses R8 texture format for minimal memory footprint
 * - Dirty region tracking to update only changed areas
 * - Target: <1ms update time per frame
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { VisibilityState } from '../managers/FogOfWarManager';

export class FogOfWarRenderer {
  private readonly game: Game;
  private readonly scene: THREE.Scene;

  // Fog overlay
  private fogPlane: THREE.Mesh | null = null;
  private fogTexture: THREE.DataTexture | null = null;
  private fogTextureData: Uint8Array | null = null;
  private fogMaterial: THREE.ShaderMaterial | null = null;

  // Grid dimensions (matches FogOfWarManager's 4m cell size)
  private readonly cellSize = 4;
  private gridWidth = 0;
  private gridHeight = 0;

  // Dirty region tracking for optimization
  private textureDirty = true;

  constructor(game: Game, scene: THREE.Scene) {
    this.game = game;
    this.scene = scene;
  }

  /**
   * Initialize fog of war renderer
   * Creates the overlay plane and texture based on map dimensions
   */
  initialize(): void {
    if (!this.game.currentMap) {
      console.error('FogOfWarRenderer: Cannot initialize without a map');
      return;
    }

    const map = this.game.currentMap;

    // Calculate grid dimensions based on map size and cell size
    this.gridWidth = Math.ceil(map.width / this.cellSize);
    this.gridHeight = Math.ceil(map.height / this.cellSize);

    // Create fog texture (R8 format for single-channel data)
    const textureSize = this.gridWidth * this.gridHeight;
    this.fogTextureData = new Uint8Array(textureSize);

    // Initialize all cells as unexplored (0)
    this.fogTextureData.fill(0);

    this.fogTexture = new THREE.DataTexture(
      this.fogTextureData,
      this.gridWidth,
      this.gridHeight,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );

    this.fogTexture.needsUpdate = true;
    this.fogTexture.magFilter = THREE.LinearFilter;
    this.fogTexture.minFilter = THREE.LinearFilter;

    // Create shader material
    this.fogMaterial = new THREE.ShaderMaterial({
      uniforms: {
        fogTexture: { value: this.fogTexture },
        mapWidth: { value: map.width },
        mapHeight: { value: map.height },
        cellSize: { value: this.cellSize },
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    // Create overlay plane covering entire map
    const planeGeometry = new THREE.PlaneGeometry(map.width, map.height);
    this.fogPlane = new THREE.Mesh(planeGeometry, this.fogMaterial);

    // Position plane at map center, slightly above terrain
    this.fogPlane.position.set(map.width / 2, 50, map.height / 2);
    this.fogPlane.rotation.x = -Math.PI / 2; // Face down
    this.fogPlane.renderOrder = 1000; // Render on top of everything

    this.scene.add(this.fogPlane);

    this.textureDirty = true;
  }

  /**
   * Vertex shader - passes world position to fragment shader
   */
  private getVertexShader(): string {
    return `
      varying vec2 vWorldPos;

      void main() {
        // Calculate world position (in XZ plane)
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xz;

        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;
  }

  /**
   * Fragment shader - samples fog texture and renders appropriate fog state
   */
  private getFragmentShader(): string {
    return `
      uniform sampler2D fogTexture;
      uniform float mapWidth;
      uniform float mapHeight;
      uniform float cellSize;

      varying vec2 vWorldPos;

      void main() {
        // Convert world position to UV coordinates (0-1 range)
        vec2 uv = vWorldPos / vec2(mapWidth, mapHeight);

        // Sample fog texture
        float visibilityState = texture2D(fogTexture, uv).r * 255.0;

        // Determine fog color and alpha based on visibility state
        vec4 fogColor;

        if (visibilityState < 0.5) {
          // Unexplored (0) - Black, fully opaque
          fogColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else if (visibilityState < 1.5) {
          // Explored (1) - Gray shroud, semi-transparent
          fogColor = vec4(0.0, 0.0, 0.0, 0.5);
        } else {
          // Visible (2) - Fully transparent
          fogColor = vec4(0.0, 0.0, 0.0, 0.0);
        }

        gl_FragColor = fogColor;
      }
    `;
  }

  /**
   * Update fog texture based on current visibility states
   * Queries FogOfWarManager for each cell and updates texture data
   */
  updateFogTexture(): void {
    if (!this.game.fogOfWarManager || !this.fogTextureData || !this.fogTexture) {
      return;
    }

    if (!this.game.currentMap) {
      return;
    }

    const map = this.game.currentMap;
    const fogManager = this.game.fogOfWarManager;

    let hasChanges = false;

    // Iterate through all cells in the grid
    for (let gridZ = 0; gridZ < this.gridHeight; gridZ++) {
      for (let gridX = 0; gridX < this.gridWidth; gridX++) {
        // Convert grid coordinates to world coordinates (center of cell)
        const worldX = gridX * this.cellSize + this.cellSize / 2;
        const worldZ = gridZ * this.cellSize + this.cellSize / 2;

        // Clamp to map bounds
        if (worldX >= map.width || worldZ >= map.height) {
          continue;
        }

        // Query visibility state from FogOfWarManager
        const visibilityState = fogManager.getVisibilityState(worldX, worldZ);

        // Convert to texture value (0, 1, or 2)
        const textureValue = visibilityState;

        // Update texture data if changed
        const index = gridZ * this.gridWidth + gridX;
        if (this.fogTextureData[index] !== textureValue) {
          this.fogTextureData[index] = textureValue;
          hasChanges = true;
        }
      }
    }

    // Mark texture for GPU update only if data changed
    if (hasChanges || this.textureDirty) {
      this.fogTexture.needsUpdate = true;
      this.textureDirty = false;
    }
  }

  /**
   * Update fog rendering (called each frame)
   */
  update(_dt: number = 1 / 60): void {
    // Update fog texture based on current visibility states
    this.updateFogTexture();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.fogPlane) {
      this.scene.remove(this.fogPlane);
      this.fogPlane.geometry.dispose();
    }

    if (this.fogMaterial) {
      this.fogMaterial.dispose();
      this.fogMaterial = null;
    }

    if (this.fogTexture) {
      this.fogTexture.dispose();
      this.fogTexture = null;
    }

    this.fogTextureData = null;
    this.fogPlane = null;
  }
}
