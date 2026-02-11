/**
 * FogOfWarRenderer - Renders fog of war overlay on the map
 *
 * Features:
 * - Three visibility states: Unexplored (black), Explored (gray shroud), Visible (transparent)
 * - Fullscreen screen-space overlay: no gaps from any camera angle
 * - Custom shader reconstructs world XZ via inverse view-projection ray casting
 *
 * Performance:
 * - Uses R8 texture format for minimal memory footprint
 * - OPT 5: Dirty cell tracking - only updates changed cells, not the full grid
 * - Full rescan only on initialization or forced updates
 * - Target: <0.5ms update time per frame
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';

const MAX_CAPTURE_ZONES = 8;

export class FogOfWarRenderer {
  private readonly game: Game;
  private readonly scene: THREE.Scene;

  // Fog overlay
  private fogPlane: THREE.Mesh | null = null;
  private fogTexture: THREE.DataTexture | null = null;
  private fogTextureData: Uint8Array | null = null;
  private fogMaterial: THREE.ShaderMaterial | null = null;
  private heightTexture: THREE.DataTexture | null = null;

  // Capture zone data for fog reduction
  private captureZoneBounds = new Float32Array(MAX_CAPTURE_ZONES * 4);
  private captureZoneCaptured = new Float32Array(MAX_CAPTURE_ZONES);
  private numCaptureZones = 0;

  // Grid dimensions (matches FogOfWarManager's 4m cell size)
  private readonly cellSize = 4;
  private gridWidth = 0;
  private gridHeight = 0;

  // Grid offset for converting cell coordinates to grid indices
  private gridOffsetX = 0;
  private gridOffsetZ = 0;

  // Cached matrix for inverse VP computation (avoids per-frame allocation)
  private readonly _vpMatrix = new THREE.Matrix4();
  private readonly _invVPMatrix = new THREE.Matrix4();

  constructor(game: Game, scene: THREE.Scene) {
    this.game = game;
    this.scene = scene;
  }

  /**
   * Initialize fog of war renderer
   * Creates a fullscreen quad overlay with screen-to-world fog sampling
   */
  initialize(): void {
    if (!this.game.currentMap) {
      console.error('FogOfWarRenderer: Cannot initialize without a map');
      return;
    }

    // Clean up any existing resources before re-initializing
    if (this.fogPlane) {
      this.scene.remove(this.fogPlane);
      this.fogPlane.geometry.dispose();
      this.fogPlane = null;
    }
    if (this.fogMaterial) {
      this.fogMaterial.dispose();
      this.fogMaterial = null;
    }
    if (this.fogTexture) {
      this.fogTexture.dispose();
      this.fogTexture = null;
    }
    if (this.heightTexture) {
      this.heightTexture.dispose();
      this.heightTexture = null;
    }
    this.fogTextureData = null;

    const map = this.game.currentMap;

    // Calculate grid dimensions based on map size and cell size
    this.gridWidth = Math.ceil(map.width / this.cellSize);
    this.gridHeight = Math.ceil(map.height / this.cellSize);

    // Pre-compute grid offset for cell-key-to-grid conversion
    this.gridOffsetX = Math.floor(map.width / (2 * this.cellSize));
    this.gridOffsetZ = Math.floor(map.height / (2 * this.cellSize));

    // Create fog texture (R8 format for single-channel data)
    const textureSize = this.gridWidth * this.gridHeight;
    this.fogTextureData = new Uint8Array(textureSize);

    // Initialize all cells as unexplored (0)
    this.fogTextureData.fill(0);

    this.fogTexture = new THREE.DataTexture(
      this.fogTextureData as unknown as BufferSource,
      this.gridWidth,
      this.gridHeight,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );

    this.fogTexture.needsUpdate = true;
    this.fogTexture.magFilter = THREE.LinearFilter;
    this.fogTexture.minFilter = THREE.LinearFilter;

    // Create terrain heightmap texture for ray-terrain intersection (eliminates parallax)
    const heightData = new Float32Array(textureSize);
    for (let gridZ = 0; gridZ < this.gridHeight; gridZ++) {
      for (let gridX = 0; gridX < this.gridWidth; gridX++) {
        const worldX = (gridX * this.cellSize) - (map.width / 2) + (this.cellSize / 2);
        const worldZ = (gridZ * this.cellSize) - (map.height / 2) + (this.cellSize / 2);
        heightData[gridZ * this.gridWidth + gridX] = this.game.getElevationAt(worldX, worldZ);
      }
    }
    this.heightTexture = new THREE.DataTexture(
      heightData as unknown as BufferSource,
      this.gridWidth,
      this.gridHeight,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.heightTexture.needsUpdate = true;
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.minFilter = THREE.LinearFilter;

    // Create shader material with inverse VP for screen-to-world projection
    this.fogMaterial = new THREE.ShaderMaterial({
      uniforms: {
        fogTexture: { value: this.fogTexture },
        heightTexture: { value: this.heightTexture },
        mapWidth: { value: map.width },
        mapHeight: { value: map.height },
        groundY: { value: map.baseElevation ?? 0 },
        inverseViewProjection: { value: new THREE.Matrix4() },
        numCaptureZones: { value: 0 },
        captureZoneBounds: { value: this.captureZoneBounds },
        captureZoneCaptured: { value: this.captureZoneCaptured },
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    // Fullscreen quad (2x2 in NDC space, vertex shader outputs clip coords directly)
    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    this.fogPlane = new THREE.Mesh(planeGeometry, this.fogMaterial);
    this.fogPlane.frustumCulled = false; // Always render, never cull
    this.fogPlane.renderOrder = 1000; // Render on top of everything

    this.scene.add(this.fogPlane);
  }

  private getVertexShader(): string {
    return `
      varying vec2 vScreenPos;

      void main() {
        vScreenPos = position.xy; // NDC range [-1, 1]
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;
  }

  private getFragmentShader(): string {
    return `
      uniform sampler2D fogTexture;
      uniform sampler2D heightTexture;
      uniform float mapWidth;
      uniform float mapHeight;
      uniform float groundY;
      uniform mat4 inverseViewProjection;
      uniform int numCaptureZones;
      uniform vec4 captureZoneBounds[${MAX_CAPTURE_ZONES}];
      uniform float captureZoneCaptured[${MAX_CAPTURE_ZONES}];

      varying vec2 vScreenPos;

      void main() {
        // Reconstruct world-space ray from screen position
        vec4 nearClip = inverseViewProjection * vec4(vScreenPos, -1.0, 1.0);
        vec4 farClip  = inverseViewProjection * vec4(vScreenPos,  1.0, 1.0);
        nearClip /= nearClip.w;
        farClip  /= farClip.w;

        vec3 rayDir = farClip.xyz - nearClip.xyz;
        float denom = rayDir.y;

        // If ray is nearly parallel to ground or pointing away, show full fog
        if (abs(denom) < 0.001) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Initial intersection with flat ground plane
        float t = (groundY - nearClip.y) / denom;
        if (t < 0.0) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        vec2 worldXZ = nearClip.xz + t * rayDir.xz;
        vec2 uv = (worldXZ + vec2(mapWidth * 0.5, mapHeight * 0.5)) / vec2(mapWidth, mapHeight);

        // Iterative ray-terrain intersection: refine against actual terrain height
        // 3 iterations converges for typical terrain; eliminates parallax from elevation
        for (int i = 0; i < 3; i++) {
          vec2 clampedUV = clamp(uv, vec2(0.0), vec2(1.0));
          float terrainH = texture2D(heightTexture, clampedUV).r;
          t = (terrainH - nearClip.y) / denom;
          worldXZ = nearClip.xz + t * rayDir.xz;
          uv = (worldXZ + vec2(mapWidth * 0.5, mapHeight * 0.5)) / vec2(mapWidth, mapHeight);
        }

        // Outside map bounds = fully fogged
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Direct sample - no blur for crisp, solid fog boundaries
        float visibilityState = texture2D(fogTexture, uv).r * 255.0;

        // Hard step transitions between fog states
        // Unexplored (0) = fully opaque black (alpha 1.0)
        // Explored (1) = semi-transparent shroud (alpha 0.5)
        // Visible (2) = fully transparent (alpha 0.0)
        float alpha = 1.0;
        if (visibilityState > 1.5) {
          alpha = 0.0; // Visible
        } else if (visibilityState > 0.5) {
          alpha = 0.5; // Explored
        }

        // Reduce fog inside player-captured zones so zone fill remains visible
        if (alpha > 0.0 && alpha < 1.0) {
          for (int i = 0; i < ${MAX_CAPTURE_ZONES}; i++) {
            if (i >= numCaptureZones) break;
            if (captureZoneCaptured[i] < 0.5) continue;
            vec4 zb = captureZoneBounds[i]; // centerX, centerZ, width, height
            float halfW = zb.z * 0.5;
            float halfH = zb.w * 0.5;
            if (worldXZ.x >= zb.x - halfW && worldXZ.x <= zb.x + halfW &&
                worldXZ.y >= zb.y - halfH && worldXZ.y <= zb.y + halfH) {
              alpha *= 0.3;
              break;
            }
          }
        }

        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `;
  }

  /**
   * OPT 5: Full grid rescan - only used on initialization or forced updates
   */
  private fullRescan(): void {
    if (!this.game.fogOfWarManager || !this.fogTextureData || !this.fogTexture || !this.game.currentMap) {
      return;
    }

    const map = this.game.currentMap;
    const fogManager = this.game.fogOfWarManager;

    for (let gridZ = 0; gridZ < this.gridHeight; gridZ++) {
      for (let gridX = 0; gridX < this.gridWidth; gridX++) {
        const worldX = (gridX * this.cellSize) - (map.width / 2) + (this.cellSize / 2);
        const worldZ = (gridZ * this.cellSize) - (map.height / 2) + (this.cellSize / 2);

        const visibilityState = fogManager.getVisibilityState(worldX, worldZ);
        const index = gridZ * this.gridWidth + gridX;
        this.fogTextureData[index] = visibilityState;
      }
    }

    this.fogTexture.needsUpdate = true;
  }

  /**
   * OPT 5: Incremental update - only processes cells that changed
   */
  private incrementalUpdate(dirtyCells: number[]): void {
    if (!this.game.fogOfWarManager || !this.fogTextureData || !this.fogTexture || !this.game.currentMap) {
      return;
    }

    if (dirtyCells.length === 0) return;

    const fogManager = this.game.fogOfWarManager;
    const map = this.game.currentMap;
    let hasChanges = false;

    // Process dirty cells (flat array of [cellX, cellZ, cellX, cellZ, ...])
    for (let i = 0; i < dirtyCells.length; i += 2) {
      const cellX = dirtyCells[i]!;
      const cellZ = dirtyCells[i + 1]!;

      // Convert manager cell coordinates to renderer grid coordinates
      const gridX = cellX + this.gridOffsetX;
      const gridZ = cellZ + this.gridOffsetZ;

      // Bounds check
      if (gridX < 0 || gridX >= this.gridWidth || gridZ < 0 || gridZ >= this.gridHeight) continue;

      // Query current visibility state
      const worldX = (gridX * this.cellSize) - (map.width / 2) + (this.cellSize / 2);
      const worldZ = (gridZ * this.cellSize) - (map.height / 2) + (this.cellSize / 2);
      const visibilityState = fogManager.getVisibilityState(worldX, worldZ);

      const index = gridZ * this.gridWidth + gridX;
      if (this.fogTextureData[index] !== visibilityState) {
        this.fogTextureData[index] = visibilityState;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.fogTexture.needsUpdate = true;
    }
  }

  /**
   * Update fog rendering (called each frame)
   */
  update(_dt: number = 1 / 60): void {
    if (!this.game.fogOfWarManager) return;

    const fogManager = this.game.fogOfWarManager;

    if (fogManager.fullRescanNeeded) {
      // Full rescan needed (init, forced update, toggle, etc.)
      const dirtyCells = fogManager.consumeDirtyCells(); // Clears fullRescanNeeded flag
      void dirtyCells; // Discard - we're doing full scan
      this.fullRescan();
    } else {
      // Incremental update - only process changed cells
      const dirtyCells = fogManager.consumeDirtyCells();
      this.incrementalUpdate(dirtyCells);
    }

    // Update inverse view-projection matrix for screen-to-world ray casting
    if (this.fogMaterial) {
      const camera = this.game.camera;
      this._vpMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this._invVPMatrix.copy(this._vpMatrix).invert();
      this.fogMaterial.uniforms['inverseViewProjection']!.value.copy(this._invVPMatrix);
    }
  }

  /**
   * Set fog plane visibility
   */
  setVisible(visible: boolean): void {
    if (this.fogPlane) {
      this.fogPlane.visible = visible;
    }
  }

  /**
   * Set capture zone bounds for fog reduction over captured zones
   */
  setCaptureZones(zones: { x: number; z: number; width: number; height: number }[]): void {
    this.numCaptureZones = Math.min(zones.length, MAX_CAPTURE_ZONES);
    for (let i = 0; i < this.numCaptureZones; i++) {
      const z = zones[i]!;
      const base4 = i * 4;
      this.captureZoneBounds[base4] = z.x;
      this.captureZoneBounds[base4 + 1] = z.z;
      this.captureZoneBounds[base4 + 2] = z.width;
      this.captureZoneBounds[base4 + 3] = z.height;
      this.captureZoneCaptured[i] = 0.0;
    }
    if (this.fogMaterial) {
      this.fogMaterial.uniforms['numCaptureZones']!.value = this.numCaptureZones;
    }
  }

  /**
   * Update whether a capture zone is player-captured (reduces fog over it)
   */
  updateCaptureZoneOwner(index: number, isPlayerCaptured: boolean): void {
    if (index < 0 || index >= MAX_CAPTURE_ZONES) return;
    this.captureZoneCaptured[index] = isPlayerCaptured ? 1.0 : 0.0;
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

    if (this.heightTexture) {
      this.heightTexture.dispose();
      this.heightTexture = null;
    }

    this.fogTextureData = null;
    this.fogPlane = null;
  }
}
