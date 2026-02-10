/**
 * MapRenderer - Renders the procedurally generated map in Three.js
 *
 * Performance optimizations:
 * - Merged geometries for terrain overlays (forest floor, water)
 * - Instanced meshes for trees
 * - Adaptive terrain resolution based on map size
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameMap, Building, Road, RoadType, CaptureZone, DeploymentZone, ResupplyPoint, Bridge, Intersection, WaterBody, BiomeType, ObjectiveType } from '../../data/types';
import { BIOME_CONFIGS } from '../../data/biomeConfigs';
import { ZoneFillRenderer, type FillEntry } from './ZoneFillRenderer';

export class MapRenderer {
  private scene: THREE.Scene;
  private mapGroup: THREE.Group;
  private captureZoneMeshes: Map<string, THREE.Group> = new Map();
  private deploymentZonesGroup: THREE.Group | null = null; // Track deployment zones for hiding
  private animationTime: number = 0; // For pulsing animations
  private biomeGroundColor: number; // Store biome ground color for terrain rendering
  private biome: BiomeType;

  // Zone fill renderer for territorial capture visualization
  private zoneFillRenderer: ZoneFillRenderer | null = null;

  // Materials
  private materials: {
    ground: THREE.MeshStandardMaterial;
    forest: THREE.MeshStandardMaterial;
    hill: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    building: THREE.MeshStandardMaterial;
    church: THREE.MeshStandardMaterial;
    factory: THREE.MeshStandardMaterial;
    roof: THREE.MeshStandardMaterial;
    deploymentPlayer: THREE.MeshBasicMaterial;
    deploymentEnemy: THREE.MeshBasicMaterial;
    captureNeutral: THREE.MeshBasicMaterial;
    capturePlayer: THREE.MeshBasicMaterial;
    captureEnemy: THREE.MeshBasicMaterial;
  };

  // Road materials by type
  private roadMaterials: Record<RoadType, THREE.MeshStandardMaterial>;

  constructor(scene: THREE.Scene, biome: BiomeType) {
    this.scene = scene;
    this.mapGroup = new THREE.Group();
    this.mapGroup.name = 'map';
    this.biome = biome;

    // Get biome configuration for colors
    const biomeConfig = BIOME_CONFIGS[biome];
    this.biomeGroundColor = biomeConfig.groundColor;

    // Base properties for road materials
    // Enable depth testing so buildings properly occlude roads
    // Use polygon offset to prevent z-fighting with terrain
    const baseRoadProps = {
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    };

    // Initialize road materials by type
    this.roadMaterials = {
      // Dirt road - brown/tan color, rougher surface
      dirt: new THREE.MeshStandardMaterial({
        color: 0x8b7355, // Brown/tan
        roughness: 0.95,
        metalness: 0.0,
        side: THREE.DoubleSide,
        ...baseRoadProps,
      }),
      // Town road - lighter gray, 2 lane
      town: new THREE.MeshStandardMaterial({
        color: 0x6a6a6a, // Medium gray
        roughness: 0.85,
        metalness: 0.1,
        side: THREE.DoubleSide,
        ...baseRoadProps,
      }),
      // Highway - dark gray, 4 lane
      highway: new THREE.MeshStandardMaterial({
        color: 0x4a4a4a, // Darker gray
        roughness: 0.8,
        metalness: 0.15,
        side: THREE.DoubleSide,
        ...baseRoadProps,
      }),
      // Interstate - dark asphalt with slight shine, 6 lane
      interstate: new THREE.MeshStandardMaterial({
        color: 0x3a3a3a, // Dark asphalt
        roughness: 0.75,
        metalness: 0.2,
        side: THREE.DoubleSide,
        ...baseRoadProps,
      }),
      // Bridge - warm stone/tan color (distinct from gray roads)
      bridge: new THREE.MeshStandardMaterial({
        color: 0xa89078, // Warm tan/stone color
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
        ...baseRoadProps,
      }),
    };

    // Initialize materials with biome colors
    this.materials = {
      ground: new THREE.MeshStandardMaterial({
        color: 0xffffff, // White base color to allow vertex colors to show through
        vertexColors: true, // Enable vertex colors for cliff/grass blending
        roughness: 0.9,
        metalness: 0.0,
        normalMap: this.createProceduralNormalMap(),
        normalScale: new THREE.Vector2(0.3, 0.3), // Subtle normal mapping for depth
      }),
      forest: new THREE.MeshStandardMaterial({
        color: biomeConfig.forestColor, // Apply biome forest color
        roughness: 0.95,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      hill: new THREE.MeshStandardMaterial({
        color: biomeConfig.groundColor, // Apply biome ground color to hills
        roughness: 0.9,
        metalness: 0.0,
      }),
      water: new THREE.MeshStandardMaterial({
        color: biomeConfig.waterColor ?? 0x3a6a8a, // Apply biome water color if available
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false, // Disable depth write to avoid z-fighting with overlapping water
        stencilWrite: true,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilRef: 1,
        stencilZPass: THREE.ReplaceStencilOp,
      }),
      building: new THREE.MeshStandardMaterial({
        color: 0xd4c4a8,
        roughness: 0.8,
        metalness: 0.1,
      }),
      church: new THREE.MeshStandardMaterial({
        color: 0xc9b896,
        roughness: 0.7,
        metalness: 0.1,
      }),
      factory: new THREE.MeshStandardMaterial({
        color: 0x8a7a6a,
        roughness: 0.9,
        metalness: 0.2,
      }),
      roof: new THREE.MeshStandardMaterial({
        color: 0x8b4513,
        roughness: 0.8,
        metalness: 0.0,
      }),
      deploymentPlayer: new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.4,
        side: THREE.FrontSide, // Only render outside faces
        depthWrite: false,
        depthTest: true,
      }),
      deploymentEnemy: new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.4,
        side: THREE.FrontSide, // Only render outside faces
        depthWrite: false,
        depthTest: true,
      }),
      captureNeutral: new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
      }),
      capturePlayer: new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
      }),
      captureEnemy: new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
      }),
    };
  }

  /**
   * Create a procedural normal map for terrain detail.
   * Uses canvas-based noise to generate a tileable normal map texture
   * for subtle surface detail without additional geometry.
   *
   * Performance: Created once and shared across all terrain chunks.
   */
  private createProceduralNormalMap(): THREE.Texture {
    const size = 256; // Texture resolution (256x256 is good balance of quality/memory)
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      // Fallback: return empty texture if canvas context fails
      return new THREE.Texture();
    }

    // Create image data for manipulation
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // Generate tileable Perlin-like noise for normal map
    // Normal maps use RGB channels to encode XYZ normal directions
    // R=X (left-right), G=Y (up-down), B=Z (depth)
    // Center value (128, 128, 255) = flat surface pointing up
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Generate height value using simple noise
        // Combine multiple octaves for natural-looking variation
        const scale1 = 0.05; // Large features
        const scale2 = 0.15; // Medium features
        const scale3 = 0.3;  // Small details

        const noise1 = Math.sin(x * scale1) * Math.cos(y * scale1);
        const noise2 = Math.sin(x * scale2 + 10) * Math.cos(y * scale2 + 10);
        const noise3 = Math.sin(x * scale3 + 20) * Math.cos(y * scale3 + 20);

        // Combine octaves with different weights
        const height = (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2);

        // Calculate normal from height gradient
        // Sample neighboring pixels to get slope
        const heightL = Math.sin((x - 1) * scale1) * Math.cos(y * scale1) * 0.5 +
                       Math.sin((x - 1) * scale2 + 10) * Math.cos(y * scale2 + 10) * 0.3 +
                       Math.sin((x - 1) * scale3 + 20) * Math.cos(y * scale3 + 20) * 0.2;

        const heightR = Math.sin((x + 1) * scale1) * Math.cos(y * scale1) * 0.5 +
                       Math.sin((x + 1) * scale2 + 10) * Math.cos(y * scale2 + 10) * 0.3 +
                       Math.sin((x + 1) * scale3 + 20) * Math.cos(y * scale3 + 20) * 0.2;

        const heightD = Math.sin(x * scale1) * Math.cos((y - 1) * scale1) * 0.5 +
                       Math.sin(x * scale2 + 10) * Math.cos((y - 1) * scale2 + 10) * 0.3 +
                       Math.sin(x * scale3 + 20) * Math.cos((y - 1) * scale3 + 20) * 0.2;

        const heightU = Math.sin(x * scale1) * Math.cos((y + 1) * scale1) * 0.5 +
                       Math.sin(x * scale2 + 10) * Math.cos((y + 1) * scale2 + 10) * 0.3 +
                       Math.sin(x * scale3 + 20) * Math.cos((y + 1) * scale3 + 20) * 0.2;

        // Calculate gradients
        const dx = (heightR - heightL) * 0.5;
        const dy = (heightU - heightD) * 0.5;

        // Convert to normal vector and encode in RGB
        // Normal map convention: R=X+128, G=Y+128, B=Z (mostly 255 for upward facing)
        const nx = dx * 255;
        const ny = dy * 255;
        const nz = 1.0;

        // Normalize the vector
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

        // Encode normal in 0-255 range (128 = 0, 255 = +1, 0 = -1)
        data[i] = ((nx / len) * 0.5 + 0.5) * 255;     // R: X component
        data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255; // G: Y component
        data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255; // B: Z component (pointing up)
        data[i + 3] = 255;                              // A: fully opaque
      }
    }

    // Put image data on canvas
    ctx.putImageData(imageData, 0, 0);

    // Create Three.js texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Set repeat to tile the normal map across terrain
    // Larger repeat values = more tiling = finer detail
    texture.repeat.set(16, 16); // Repeat 16x across terrain chunks

    texture.needsUpdate = true;

    return texture;
  }

  render(map: GameMap): void {
    // Clear existing map
    this.clear();

    // Render terrain
    this.renderTerrain(map);

    // Render water bodies (rivers, lakes) as smooth geometry
    this.renderWaterBodies(map);

    // Render roads (pass full map for terrain elevation sampling)
    this.renderRoads(map.roads, map);

    // Render bridges over rivers
    this.renderBridges(map.bridges, map);

    // Render buildings (pass map for terrain elevation)
    this.renderBuildings(map.buildings, map);

    // Render deployment zones
    this.renderDeploymentZones(map.deploymentZones, map);

    // Render capture zones
    this.renderCaptureZones(map.captureZones, map);

    // Render resupply points
    this.renderResupplyPoints(map.resupplyPoints, map);

    // Add trees to forests
    this.renderForestTrees(map);

    // Add to scene
    this.scene.add(this.mapGroup);
  }

  clear(): void {
    if (this.mapGroup.parent) {
      this.scene.remove(this.mapGroup);
    }

    // Dispose geometries
    this.mapGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });

    this.mapGroup.clear();
    this.captureZoneMeshes.clear();

    // Clear zone fill renderer
    if (this.zoneFillRenderer) {
      this.zoneFillRenderer.dispose();
      this.zoneFillRenderer = null;
    }
  }

  private renderTerrain(map: GameMap): void {
    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;

    // Chunked terrain for frustum culling
    // Divide terrain into tiles so off-screen chunks can be culled
    const CHUNK_SIZE = 64; // Segments per chunk (64x64 = 8k triangles per chunk)
    // Limit to 150 segments total (150/64 ≈ 2-3 chunks per side = ~73k triangles vs 500k)
    const numChunksX = Math.ceil(Math.min(cols, 150) / CHUNK_SIZE);
    const numChunksZ = Math.ceil(Math.min(rows, 150) / CHUNK_SIZE);

    const chunkWidth = map.width / numChunksX;
    const chunkHeight = map.height / numChunksZ;

    // Create each terrain chunk as a separate mesh for culling
    for (let chunkZ = 0; chunkZ < numChunksZ; chunkZ++) {
      for (let chunkX = 0; chunkX < numChunksX; chunkX++) {
        const segmentsX = CHUNK_SIZE;
        const segmentsZ = CHUNK_SIZE;

        const groundGeometry = new THREE.PlaneGeometry(
          chunkWidth,
          chunkHeight,
          segmentsX,
          segmentsZ
        );
        groundGeometry.rotateX(-Math.PI / 2);

        // Calculate chunk position offset
        const chunkOffsetX = (chunkX - numChunksX / 2 + 0.5) * chunkWidth;
        const chunkOffsetZ = (chunkZ - numChunksZ / 2 + 0.5) * chunkHeight;

        // Apply elevation to vertices (sample from terrain grid)
        const positionAttr = groundGeometry.attributes['position']!;
        for (let i = 0; i < positionAttr.count; i++) {
          // Account for chunk offset when sampling terrain
          const worldX = positionAttr.getX(i) + chunkOffsetX;
          const worldZ = positionAttr.getZ(i) + chunkOffsetZ;
          const x = Math.floor(((worldX + map.width / 2) / map.width) * cols);
          const z = Math.floor(((worldZ + map.height / 2) / map.height) * rows);

          const cell = map.terrain[Math.min(z, rows - 1)]?.[Math.min(x, cols - 1)];
          if (cell) {
            positionAttr.setY(i, cell.elevation);
          }
        }

        groundGeometry.computeVertexNormals();

        // Apply vertex colors based on slope (cliffs = rock color, flat = grass color)
        const normalAttr = groundGeometry.attributes['normal']!;
        const colors = new Float32Array(positionAttr.count * 3);

        // Color definitions - use biome ground color for grass
        const grassColor = new THREE.Color(this.biomeGroundColor); // Biome-specific ground color
        const cliffColor = new THREE.Color(0x6b6355); // Gray-brown rock
        const snowColor = new THREE.Color(0xf0f0f0); // Snow white
        const tempColor = new THREE.Color();

        // Field variant colors (Green, Wheat, Pasture, Dirt)
        const fieldColors = [
          new THREE.Color(0x4a6b3e), // Dark Green (Crops)
          new THREE.Color(this.biome === 'tundra' ? 0x8c7c4e : 0xdec98a), // Wheat/Straw (adjust for biome)
          new THREE.Color(0x7a8c5e), // Light Green (Pasture)
          new THREE.Color(0x6b5c45), // Dirt (Plowed)
        ];

        // Calculate snow line - snow appears on upper 30% of elevation range
        const elevationRange = map.maxElevation - map.baseElevation;
        const snowLineStart = map.baseElevation + elevationRange * 0.70; // Start snow transition
        const snowLineFull = map.baseElevation + elevationRange * 0.85; // Full snow coverage

        for (let i = 0; i < positionAttr.count; i++) {
          // Get normal Y component (1.0 = flat, 0.0 = vertical)
          const normalY = normalAttr.getY(i);
          const elevation = positionAttr.getY(i);

          // Determine base ground color (grass or field variant)
          let baseColor = grassColor;

          // Account for chunk offset when sampling terrain cell
          const worldX = positionAttr.getX(i) + chunkOffsetX;
          const worldZ = positionAttr.getZ(i) + chunkOffsetZ;
          const x = Math.floor(((worldX + map.width / 2) / map.width) * cols);
          const z = Math.floor(((worldZ + map.height / 2) / map.height) * rows);
          const cell = map.terrain[Math.min(z, rows - 1)]?.[Math.min(x, cols - 1)];

          if (cell && cell.type === 'field' && cell.variant !== undefined) {
            baseColor = fieldColors[cell.variant] || grassColor;
          }

          // Apply subtle slope darkening for depth perception
          // Darken as slope increases (normalY decreases)
          // Range: 1.0 at flat (normalY=1) down to ~0.7 at steep
          const slopeDarkening = 0.7 + (0.3 * normalY);

          // Clone base color to avoid mutating shared instances (like grassColor)
          // and apply the darkening
          const darkenedBase = baseColor.clone().multiplyScalar(slopeDarkening);

          // Calculate slope factor: 0 = vertical cliff, 1 = flat ground
          // Cliffs start appearing at ~18 degree slopes (normalY < 0.95) to make hills visible
          // Full cliff color at ~50+ degree slopes (normalY < 0.643)
          const cliffThresholdStart = 0.95; // ~18 degrees (makes gentle slopes visible)
          const cliffThresholdFull = 0.643;  // ~50 degrees

          let slopeFactor: number;
          if (normalY >= cliffThresholdStart) {
            slopeFactor = 1.0; // Full base color
          } else if (normalY <= cliffThresholdFull) {
            slopeFactor = 0.0; // Full cliff
          } else {
            // Blend between base color and cliff
            slopeFactor = (normalY - cliffThresholdFull) / (cliffThresholdStart - cliffThresholdFull);
          }

          // Interpolate between cliff and base color
          tempColor.copy(cliffColor).lerp(darkenedBase, slopeFactor);

          // Apply snow cap for high elevations
          if (elevation > snowLineStart) {
            let snowFactor: number;
            if (elevation >= snowLineFull) {
              snowFactor = 1.0; // Full snow
            } else {
              // Gradual transition from terrain to snow
              snowFactor = (elevation - snowLineStart) / (snowLineFull - snowLineStart);
            }
            // Blend current color with snow
            tempColor.lerp(snowColor, snowFactor);
          }

          // Set vertex color
          colors[i * 3] = tempColor.r;
          colors[i * 3 + 1] = tempColor.g;
          colors[i * 3 + 2] = tempColor.b;
        }

        groundGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Create mesh for this chunk
        const groundMesh = new THREE.Mesh(groundGeometry, this.materials.ground);
        groundMesh.receiveShadow = true;
        groundMesh.position.set(chunkOffsetX, 0, chunkOffsetZ);
        groundMesh.name = `terrain-chunk-${chunkX}-${chunkZ}`;
        groundMesh.frustumCulled = true; // Enable frustum culling (default, but explicit)
        this.mapGroup.add(groundMesh);
      }
    }

    // Render terrain overlays for different types
    this.renderTerrainOverlays(map);
  }

  private renderTerrainOverlays(map: GameMap): void {
    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;

    // Calculate actual cell size from map dimensions and grid size
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;
    const cellSize = Math.max(cellSizeX, cellSizeZ);

    // Adaptive overlay spacing for large maps (reduce geometry count)
    const mapSize = Math.max(map.width, map.height);
    const overlayStep = mapSize > 5000 ? 4 : mapSize > 1000 ? 2 : 1;
    const overlayCellSize = cellSize * overlayStep;

    // Collect geometries for merging (much more efficient than individual meshes)
    const waterGeometries: THREE.BufferGeometry[] = [];

    for (let z = 0; z < rows; z += overlayStep) {
      for (let x = 0; x < cols; x += overlayStep) {
        const cell = map.terrain[z]![x]!;
        const worldX = x * cellSize - map.width / 2 + overlayCellSize / 2;
        const worldZ = z * cellSize - map.height / 2 + overlayCellSize / 2;

        if (cell.type === 'water') {
          // Only render lakes/ponds from terrain cells
          // Rivers will be rendered separately as smooth strips
          const geo = new THREE.PlaneGeometry(overlayCellSize, overlayCellSize);
          geo.rotateX(-Math.PI / 2);
          // Position water elevated above terrain for visibility
          geo.translate(worldX, cell.elevation + 1.2, worldZ);
          waterGeometries.push(geo);
        }
      }
    }

    // Merge and render water as single mesh
    if (waterGeometries.length > 0) {
      const mergedWater = mergeGeometries(waterGeometries, false);
      if (mergedWater) {
        const waterMesh = new THREE.Mesh(mergedWater, this.materials.water);
        waterMesh.name = 'water';
        waterMesh.renderOrder = 0; // Lakes render first
        this.mapGroup.add(waterMesh);
      }
      // Dispose individual geometries after merging
      waterGeometries.forEach(geo => geo.dispose());
    }
  }

  /**
   * Render water bodies (rivers, lakes) as smooth geometry
   * Rivers are rendered as flowing strips, lakes are already rendered from terrain cells
   */
  private renderWaterBodies(map: GameMap): void {
    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    // Helper to get terrain elevation at world position using bilinear interpolation
    const getElevationAt = (worldX: number, worldZ: number): number => {
      const gx = (worldX + map.width / 2) / cellSizeX;
      const gz = (worldZ + map.height / 2) / cellSizeZ;

      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const x1 = Math.min(x0 + 1, cols - 1);
      const z1 = Math.min(z0 + 1, rows - 1);

      const cx0 = Math.max(0, Math.min(x0, cols - 1));
      const cz0 = Math.max(0, Math.min(z0, rows - 1));
      const cx1 = Math.max(0, Math.min(x1, cols - 1));
      const cz1 = Math.max(0, Math.min(z1, rows - 1));

      const e00 = map.terrain[cz0]?.[cx0]?.elevation ?? 0;
      const e10 = map.terrain[cz0]?.[cx1]?.elevation ?? 0;
      const e01 = map.terrain[cz1]?.[cx0]?.elevation ?? 0;
      const e11 = map.terrain[cz1]?.[cx1]?.elevation ?? 0;

      const fx = gx - x0;
      const fz = gz - z0;

      const e0 = e00 + (e10 - e00) * fx;
      const e1 = e01 + (e11 - e01) * fx;
      return e0 + (e1 - e0) * fz;
    };

    // Debug: log water bodies
    console.log(`Total water bodies: ${map.waterBodies.length}`);
    const rivers = map.waterBodies.filter(w => w.type === 'river');
    const lakes = map.waterBodies.filter(w => w.type === 'lake');
    console.log(`Rivers to render: ${rivers.length}, Lakes to render: ${lakes.length}`);

    // Render lakes first as smooth polygons (instead of coarse grid cells)
    for (const lake of lakes) {
      const lakeGeometry = this.createLakeGeometry(lake, getElevationAt);
      if (lakeGeometry) {
        const lakeMesh = new THREE.Mesh(lakeGeometry, this.materials.water);
        lakeMesh.name = `lake-${lake.id}`;
        lakeMesh.renderOrder = 1; // Render after terrain, before rivers
        lakeMesh.receiveShadow = true;
        this.mapGroup.add(lakeMesh);
        console.log(`Rendering lake ${lake.id}: ${lake.points.length} boundary points`);
      }
    }

    // Render each river as a smooth flowing strip
    for (const water of map.waterBodies) {
      if (water.type !== 'river') continue;

      const riverGeometry = this.createRiverStripGeometry(water, getElevationAt, map.waterBodies);
      if (riverGeometry) {
        const riverMesh = new THREE.Mesh(riverGeometry, this.materials.water);
        riverMesh.name = `river-${water.id}`;
        riverMesh.renderOrder = 2; // Render after lakes
        riverMesh.receiveShadow = true;
        this.mapGroup.add(riverMesh);

        // Debug: log river info
        console.log(`Rendering river ${water.id}: ${water.points.length} points, ${riverGeometry.attributes.position?.count} vertices`);
      }
    }
  }

  /**
   * Create smooth flowing geometry for a river
   * Similar to road rendering but for water bodies
   */
  private createRiverStripGeometry(
    river: WaterBody,
    getElevationAt: (x: number, z: number) => number,
    allWaterBodies: WaterBody[]
  ): THREE.BufferGeometry | null {
    const points = river.points;
    if (points.length < 2) return null;

    const width = river.width ?? 10;
    const halfWidth = width / 2;
    const waterHeight = 1.2; // Elevated above terrain for visibility

    // Find lakes to detect connections
    const lakes = allWaterBodies.filter(w => w.type === 'lake');

    // Helper to check if a point is near a lake
    const isNearLake = (x: number, z: number): boolean => {
      for (const lake of lakes) {
        if (lake.points.length === 0) continue;
        const lakeCenterX = lake.points.reduce((sum, p) => sum + p.x, 0) / lake.points.length;
        const lakeCenterZ = lake.points.reduce((sum, p) => sum + p.z, 0) / lake.points.length;
        const lakeRadius = lake.radius ?? 50;
        const dist = Math.sqrt((x - lakeCenterX) ** 2 + (z - lakeCenterZ) ** 2);
        if (dist < lakeRadius + 20) {
          return true;
        }
      }
      return false;
    };

    // Helper to safely calculate perpendicular direction
    const getPerp = (dx: number, dz: number): { x: number; z: number } => {
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) {
        return { x: 1, z: 0 };
      }
      return { x: -dz / len, z: dx / len };
    };

    // Helper to calculate angle between two vectors
    const angleBetween = (dx1: number, dz1: number, dx2: number, dz2: number): number => {
      const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
      const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
      if (len1 < 0.001 || len2 < 0.001) return 0;
      const dot = (dx1 * dx2 + dz1 * dz2) / (len1 * len2);
      return Math.acos(Math.max(-1, Math.min(1, dot)));
    };

    // 1. Smooth sharp corners using arc insertion (same as roads)
    const smoothedPoints: { x: number; z: number }[] = [];
    const cornerThreshold = Math.PI / 12; // 15 degrees
    const maxTurnAngle = Math.PI / 2; // 90 degrees
    const baseCornerRadius = Math.max(width * 2, 10);

    for (let i = 0; i < points.length; i++) {
      const curr = points[i]!;

      if (i === 0 || i === points.length - 1) {
        smoothedPoints.push({ x: curr.x, z: curr.z });
        continue;
      }

      const prev = points[i - 1]!;
      const next = points[i + 1]!;

      const dx1 = curr.x - prev.x;
      const dz1 = curr.z - prev.z;
      const dx2 = next.x - curr.x;
      const dz2 = next.z - curr.z;

      const angle = angleBetween(dx1, dz1, dx2, dz2);
      const effectiveAngle = Math.min(angle, maxTurnAngle);

      if (effectiveAngle > cornerThreshold) {
        // Insert arc
        const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
        const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
        const ndx1 = dx1 / len1;
        const ndz1 = dz1 / len1;
        const ndx2 = dx2 / len2;
        const ndz2 = dz2 / len2;

        const sharpnessFactor = effectiveAngle / maxTurnAngle;
        const cornerRadius = baseCornerRadius * (1 + sharpnessFactor);
        const arcDist = Math.min(cornerRadius, len1 * 0.45, len2 * 0.45);

        const arcStart = { x: curr.x - ndx1 * arcDist, z: curr.z - ndz1 * arcDist };
        const arcEnd = { x: curr.x + ndx2 * arcDist, z: curr.z + ndz2 * arcDist };

        // Control point for Bezier
        const controlPullback = 0.3 + 0.4 * (1 - sharpnessFactor);
        const controlX = curr.x - ndx1 * arcDist * controlPullback + ndx2 * arcDist * controlPullback;
        const controlZ = curr.z - ndz1 * arcDist * controlPullback + ndz2 * arcDist * controlPullback;

        smoothedPoints.push(arcStart);

        const numArcPoints = Math.max(5, Math.ceil(effectiveAngle / (Math.PI / 16)));
        for (let j = 1; j < numArcPoints; j++) {
          const t = j / numArcPoints;
          const oneMinusT = 1 - t;
          const x = oneMinusT * oneMinusT * arcStart.x +
            2 * oneMinusT * t * controlX +
            t * t * arcEnd.x;
          const z = oneMinusT * oneMinusT * arcStart.z +
            2 * oneMinusT * t * controlZ +
            t * t * arcEnd.z;
          smoothedPoints.push({ x, z });
        }
        smoothedPoints.push(arcEnd);
      } else {
        smoothedPoints.push({ x: curr.x, z: curr.z });
      }
    }

    // 2. Subdivide long segments
    const densePoints: { x: number; z: number }[] = [];
    const maxSegmentLength = 10; // Increased from 5 to reduce triangle count (50% fewer triangles)

    for (let i = 0; i < smoothedPoints.length - 1; i++) {
      const p1 = smoothedPoints[i]!;
      const p2 = smoothedPoints[i + 1]!;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const segmentLength = Math.sqrt(dx * dx + dz * dz);

      densePoints.push({ x: p1.x, z: p1.z });

      if (segmentLength > maxSegmentLength) {
        const numSubdivisions = Math.ceil(segmentLength / maxSegmentLength);
        for (let j = 1; j < numSubdivisions; j++) {
          const t = j / numSubdivisions;
          densePoints.push({ x: p1.x + dx * t, z: p1.z + dz * t });
        }
      }
    }
    // Add final point
    const last = smoothedPoints[smoothedPoints.length - 1]!;
    densePoints.push({ x: last.x, z: last.z });

    // 3. Generate geometry with averaged normals
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < densePoints.length; i++) {
      const p = densePoints[i]!;

      // Calculate averaged perpendicular
      let perpX: number, perpZ: number;
      if (i === 0) {
        const next = densePoints[1]!;
        const perp = getPerp(next.x - p.x, next.z - p.z);
        perpX = perp.x;
        perpZ = perp.z;
      } else if (i === densePoints.length - 1) {
        const prev = densePoints[i - 1]!;
        const perp = getPerp(p.x - prev.x, p.z - prev.z);
        perpX = perp.x;
        perpZ = perp.z;
      } else {
        const prev = densePoints[i - 1]!;
        const next = densePoints[i + 1]!;
        const perp1 = getPerp(p.x - prev.x, p.z - prev.z);
        const perp2 = getPerp(next.x - p.x, next.z - p.z);
        // Average the normals
        perpX = (perp1.x + perp2.x) / 2;
        perpZ = (perp1.z + perp2.z) / 2;
        const normLen = Math.sqrt(perpX * perpX + perpZ * perpZ);
        if (normLen > 0.001) {
          perpX /= normLen;
          perpZ /= normLen;
        } else {
          perpX = perp1.x;
          perpZ = perp1.z;
        }
      }

      // Generate left and right vertices with width tapering for lake connections
      let effectiveHalfWidth = halfWidth;

      // Check if this river connects to a lake and taper width near the end
      const connectsToLake = (river as any).connectsToLake === true;
      if (connectsToLake) {
        // Calculate distance from end of river
        const totalPoints = densePoints.length;
        const pointsFromEnd = totalPoints - 1 - i;

        // Taper over the last 30m (approximately 6 points at 5m spacing)
        const taperDistance = 30; // meters
        const taperPoints = Math.ceil(taperDistance / maxSegmentLength);

        if (pointsFromEnd < taperPoints) {
          // Calculate taper factor (1.0 at start of taper, 0.0 at end)
          const taperFactor = pointsFromEnd / taperPoints;
          // Use smooth cubic easing for natural taper
          const smoothTaper = taperFactor * taperFactor * (3 - 2 * taperFactor);
          effectiveHalfWidth = halfWidth * smoothTaper;
        }
      }

      const leftX = p.x + perpX * effectiveHalfWidth;
      const leftZ = p.z + perpZ * effectiveHalfWidth;
      const rightX = p.x - perpX * effectiveHalfWidth;
      const rightZ = p.z - perpZ * effectiveHalfWidth;

      const centerElev = getElevationAt(p.x, p.z);

      // Check lake connection
      const nearLake = isNearLake(p.x, p.z);
      const heightBoost = nearLake ? 0.05 : 0;

      // Use center elevation only for water height to ensure longitudinal smoothness
      // Banks can be noisy in mountains, but center path should be smooth after generation
      const waterY = centerElev + waterHeight + heightBoost;
      const leftY = waterY;
      const rightY = waterY;

      vertices.push(leftX, leftY, leftZ);
      vertices.push(rightX, rightY, rightZ);

      // Add indices
      if (i < densePoints.length - 1) {
        const baseIdx = i * 2;
        indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
        indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
      }
    }

    if (vertices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create smooth polygonal geometry for a lake
   * Renders lakes with smooth circular boundaries instead of jagged grid cells
   */
  private createLakeGeometry(
    lake: WaterBody,
    getElevationAt: (x: number, z: number) => number
  ): THREE.BufferGeometry | null {
    if (!lake.points || lake.points.length < 3) return null;

    const waterHeight = 1.2; // Same as rivers - elevated above terrain for visibility
    const vertices: number[] = [];
    const indices: number[] = [];

    // Calculate lake center
    let centerX = 0, centerZ = 0;
    for (const p of lake.points) {
      centerX += p.x;
      centerZ += p.z;
    }
    centerX /= lake.points.length;
    centerZ /= lake.points.length;

    // Get center elevation (lakes sit in terrain depressions)
    const centerElev = getElevationAt(centerX, centerZ) + waterHeight;

    // Add center vertex
    vertices.push(centerX, centerElev, centerZ);

    // Add boundary vertices (smoothed with extra interpolated points for smoother curves)
    const smoothPoints: { x: number; z: number; y: number }[] = [];

    // Subdivide each edge for smoother curves
    const subdivisionsPerEdge = 3;
    for (let i = 0; i < lake.points.length; i++) {
      const p1 = lake.points[i]!;
      const p2 = lake.points[(i + 1) % lake.points.length]!;

      for (let j = 0; j < subdivisionsPerEdge; j++) {
        const t = j / subdivisionsPerEdge;
        const x = p1.x + (p2.x - p1.x) * t;
        const z = p1.z + (p2.z - p1.z) * t;
        const elev = getElevationAt(x, z) + waterHeight;
        smoothPoints.push({ x, z, y: elev });
      }
    }

    // Add all boundary points as vertices
    for (const p of smoothPoints) {
      vertices.push(p.x, p.y, p.z);
    }

    // Create triangle fan from center to boundary
    const numBoundaryPoints = smoothPoints.length;
    for (let i = 0; i < numBoundaryPoints; i++) {
      const nextIdx = (i + 1) % numBoundaryPoints;
      // Triangle: center (0), current boundary point (i+1), next boundary point (nextIdx+1)
      indices.push(0, i + 1, nextIdx + 1);
    }

    if (vertices.length === 0 || indices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  private renderRoads(roads: Road[], map: GameMap): void {
    const roadGroup = new THREE.Group();
    roadGroup.name = 'roads';

    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    // Helper to get terrain elevation at world position using bilinear interpolation
    const getTerrainElevationAt = (worldX: number, worldZ: number): number => {
      // Convert to grid coordinates (floating point)
      const gx = (worldX + map.width / 2) / cellSizeX;
      const gz = (worldZ + map.height / 2) / cellSizeZ;

      // Get the four surrounding cell indices
      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const x1 = x0 + 1;
      const z1 = z0 + 1;

      // Clamp to grid bounds
      const cx0 = Math.max(0, Math.min(cols - 1, x0));
      const cx1 = Math.max(0, Math.min(cols - 1, x1));
      const cz0 = Math.max(0, Math.min(rows - 1, z0));
      const cz1 = Math.max(0, Math.min(rows - 1, z1));

      // Get elevations at four corners
      const e00 = map.terrain[cz0]?.[cx0]?.elevation ?? 0;
      const e10 = map.terrain[cz0]?.[cx1]?.elevation ?? 0;
      const e01 = map.terrain[cz1]?.[cx0]?.elevation ?? 0;
      const e11 = map.terrain[cz1]?.[cx1]?.elevation ?? 0;

      // Interpolation factors (0 to 1 within the cell)
      const fx = gx - x0;
      const fz = gz - z0;

      // Bilinear interpolation
      const e0 = e00 + (e10 - e00) * fx; // Interpolate along x at z0
      const e1 = e01 + (e11 - e01) * fx; // Interpolate along x at z1
      return e0 + (e1 - e0) * fz;        // Interpolate along z
    };

    // Helper to get global surface elevation (terrain or bridge)
    const getSurfaceElevationAt = (worldX: number, worldZ: number): number => {
      // Check for bridge presence
      for (const bridge of map.bridges) {
        const cosA = Math.cos(-bridge.angle);
        const sinA = Math.sin(-bridge.angle);
        const dx = worldX - bridge.x;
        const dz = worldZ - bridge.z;
        const localX = dx * cosA - dz * sinA;
        const localZ = dx * sinA + dz * cosA;

        // If within bridge footprint, return bridge elevation
        if (Math.abs(localX) < bridge.length / 2 + 0.1 && Math.abs(localZ) < bridge.width / 2 + 0.1) {
          return bridge.elevation ?? getTerrainElevationAt(worldX, worldZ);
        }
      }
      return getTerrainElevationAt(worldX, worldZ);
    };

    // Helper to check if a point is over water (river) or a bridge segment
    const isOverBridgeOrWater = (worldX: number, worldZ: number, _roadId?: string): boolean => {
      const roadElevation = getTerrainElevationAt(worldX, worldZ);

      // Check for bridge presence (overpass or bridge object)
      for (const bridge of map.bridges) {
        // Use OBB check for precise alignment
        const cosA = Math.cos(-bridge.angle);
        const sinA = Math.sin(-bridge.angle);
        const dx = worldX - bridge.x;
        const dz = worldZ - bridge.z;
        const localX = dx * cosA - dz * sinA;
        const localZ = dx * sinA + dz * cosA;

        // Only skip if the road is actually ON the bridge (vertically close)
        // This allows underpasses to render correctly beneath overpasses
        if (Math.abs(localX) < bridge.length / 2 + 0.5 && Math.abs(localZ) < bridge.width / 2 + 0.5) {
          if (bridge.elevation !== undefined && Math.abs(roadElevation - bridge.elevation) < 1.0) {
            return true;
          }
        }
      }

      // Also check terrain-based river/water
      const gridX = Math.floor((worldX + map.width / 2) / cellSizeX);
      const gridZ = Math.floor((worldZ + map.height / 2) / cellSizeZ);
      const clampedX = Math.max(0, Math.min(cols - 1, gridX));
      const clampedZ = Math.max(0, Math.min(rows - 1, gridZ));
      const terrainType = map.terrain[clampedZ]?.[clampedX]?.type;

      if (terrainType === 'river' || terrainType === 'water') return true;

      return false;
    };

    // Special helper for lane markings that only skips segments that are truly "over water" 
    // without a bridge deck underneath them.
    const isOverWaterOnly = (worldX: number, worldZ: number): boolean => {
      // If we are on a bridge, we are NOT "only over water" (we have a surface)
      for (const bridge of map.bridges) {
        const cosA = Math.cos(-bridge.angle);
        const sinA = Math.sin(-bridge.angle);
        const dx = worldX - bridge.x;
        const dz = worldZ - bridge.z;
        const localX = dx * cosA - dz * sinA;
        const localZ = dx * sinA + dz * cosA;

        if (Math.abs(localX) < bridge.length / 2 + 0.5 && Math.abs(localZ) < bridge.width / 2 + 0.5) {
          return false; // On a bridge, so not just water
        }
      }

      const gridX = Math.floor((worldX + map.width / 2) / cellSizeX);
      const gridZ = Math.floor((worldZ + map.height / 2) / cellSizeZ);
      const clampedX = Math.max(0, Math.min(cols - 1, gridX));
      const clampedZ = Math.max(0, Math.min(rows - 1, gridZ));
      const terrainType = map.terrain[clampedZ]?.[clampedX]?.type;

      return terrainType === 'river' || terrainType === 'water';
    };

    // Collect geometries for batch merging (better performance)
    const roadGeometriesByType: Record<RoadType, THREE.BufferGeometry[]> = {
      dirt: [],
      town: [],
      highway: [],
      interstate: [],
      bridge: [],
    };

    for (const road of roads) {
      if (road.points.length < 2) continue;

      // Create smooth road mesh using continuous strip geometry
      // Skip segments over water (bridges will be rendered separately)
      const roadGeometry = this.createRoadStripGeometry(road, getSurfaceElevationAt, (x, z) => isOverBridgeOrWater(x, z, road.id));
      if (roadGeometry) {
        roadGeometriesByType[road.type].push(roadGeometry);
      }
    }

    // Merge and add road geometries by type
    for (const [roadType, geometries] of Object.entries(roadGeometriesByType)) {
      if (geometries.length === 0) continue;

      const mergedGeometry = mergeGeometries(geometries, false);
      if (mergedGeometry) {
        const material = this.roadMaterials[roadType as RoadType];
        const mesh = new THREE.Mesh(mergedGeometry, material);
        mesh.renderOrder = 5;
        roadGroup.add(mesh);
      }
      // Dispose individual geometries after merging
      geometries.forEach(geo => geo.dispose());
    }

    this.mapGroup.add(roadGroup);

    // Render intersections (patches where roads meet)
    this.renderIntersections(map.intersections, roads, getSurfaceElevationAt);

    // Render lane markings for paved roads (pass intersections to stop markings at them)
    this.renderLaneMarkings(roads, map.intersections, getSurfaceElevationAt, isOverBridgeOrWater, isOverWaterOnly);
  }

  /**
   * Create smooth road strip geometries following the road points
   * Skips segments over water (bridges render separately)
   * Adds intermediate points for smooth terrain following
   */
  private createRoadStripGeometry(
    road: Road,
    getElevationAt: (x: number, z: number) => number,
    isOverBridgeOrWater: (x: number, z: number) => boolean
  ): THREE.BufferGeometry | null {
    const points = road.points;
    if (points.length < 2) return null;

    const halfWidth = road.width / 2;
    const allGeometries: THREE.BufferGeometry[] = [];
    const roadHeightOffset = 0.45; // Height above terrain to prevent z-fighting
    const maxSegmentLength = 10; // Increased from 5 to reduce triangle count (50% fewer triangles)

    // Helper to safely calculate perpendicular direction
    const getPerp = (dx: number, dz: number): { x: number; z: number } => {
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) {
        return { x: 1, z: 0 };
      }
      return { x: -dz / len, z: dx / len };
    };

    // Helper to calculate angle between two vectors (returns angle in radians)
    const angleBetween = (dx1: number, dz1: number, dx2: number, dz2: number): number => {
      const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
      const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
      if (len1 < 0.001 || len2 < 0.001) return 0;
      const dot = (dx1 * dx2 + dz1 * dz2) / (len1 * len2);
      return Math.acos(Math.max(-1, Math.min(1, dot)));
    };

    // First, smooth corners in the original points using arc insertion
    // Roads should never turn sharper than 90 degrees - that would be an intersection
    const smoothedPoints: { x: number; z: number }[] = [];
    const cornerThreshold = Math.PI / 12; // 15 degrees - smooth any noticeable turn
    const maxTurnAngle = Math.PI / 2; // 90 degrees - max allowed turn for a road
    const baseCornerRadius = Math.max(road.width * 3, 15); // Larger radius for smoother curves

    for (let i = 0; i < points.length; i++) {
      const curr = points[i]!;

      if (i === 0 || i === points.length - 1) {
        // Endpoints - just add them
        smoothedPoints.push({ x: curr.x, z: curr.z });
        continue;
      }

      const prev = points[i - 1]!;
      const next = points[i + 1]!;

      // Calculate incoming and outgoing directions
      const dx1 = curr.x - prev.x;
      const dz1 = curr.z - prev.z;
      const dx2 = next.x - curr.x;
      const dz2 = next.z - curr.z;

      const angle = angleBetween(dx1, dz1, dx2, dz2);

      // Clamp angle to max turn - sharper turns indicate intersections, not road curves
      const effectiveAngle = Math.min(angle, maxTurnAngle);

      if (effectiveAngle > cornerThreshold) {
        // Corner detected - insert arc points for smooth curve
        const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
        const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

        // Normalize directions
        const ndx1 = dx1 / len1;
        const ndz1 = dz1 / len1;
        const ndx2 = dx2 / len2;
        const ndz2 = dz2 / len2;

        // Scale arc distance based on turn sharpness - sharper turns need larger arcs
        const sharpnessFactor = effectiveAngle / maxTurnAngle; // 0 to 1
        const cornerRadius = baseCornerRadius * (1 + sharpnessFactor * 2); // Up to 3x base radius for sharp turns

        // Calculate how far back/forward to start the arc (limited by segment lengths)
        const arcDist = Math.min(cornerRadius, len1 * 0.45, len2 * 0.45);

        // Start point of arc (on incoming segment)
        const arcStart = {
          x: curr.x - ndx1 * arcDist,
          z: curr.z - ndz1 * arcDist,
        };

        // End point of arc (on outgoing segment)
        const arcEnd = {
          x: curr.x + ndx2 * arcDist,
          z: curr.z + ndz2 * arcDist,
        };

        // Add arc start
        smoothedPoints.push(arcStart);

        // Add intermediate arc points using quadratic bezier through a control point
        // For sharper turns, pull the control point closer to create a tighter but still smooth curve
        const controlPullback = 0.3 + 0.4 * (1 - sharpnessFactor); // Less pullback for sharper turns
        const controlX = curr.x - ndx1 * arcDist * controlPullback + ndx2 * arcDist * controlPullback;
        const controlZ = curr.z - ndz1 * arcDist * controlPullback + ndz2 * arcDist * controlPullback;

        // More arc points for sharper turns
        const numArcPoints = Math.max(5, Math.ceil(effectiveAngle / (Math.PI / 16)));
        for (let j = 1; j < numArcPoints; j++) {
          const t = j / numArcPoints;
          // Quadratic bezier: P = (1-t)²P0 + 2(1-t)tP1 + t²P2
          const oneMinusT = 1 - t;
          const x = oneMinusT * oneMinusT * arcStart.x +
            2 * oneMinusT * t * controlX +
            t * t * arcEnd.x;
          const z = oneMinusT * oneMinusT * arcStart.z +
            2 * oneMinusT * t * controlZ +
            t * t * arcEnd.z;
          smoothedPoints.push({ x, z });
        }

        // Add arc end
        smoothedPoints.push(arcEnd);
      } else {
        // Very gentle corner - just add the point
        smoothedPoints.push({ x: curr.x, z: curr.z });
      }
    }

    // Now create a denser set of points by subdividing long segments
    const densePoints: { x: number; z: number }[] = [];
    for (let i = 0; i < smoothedPoints.length - 1; i++) {
      const p1 = smoothedPoints[i]!;
      const p2 = smoothedPoints[i + 1]!;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const segmentLength = Math.sqrt(dx * dx + dz * dz);

      // Add start point
      densePoints.push({ x: p1.x, z: p1.z });

      // Add intermediate points if segment is too long
      if (segmentLength > maxSegmentLength) {
        const numSubdivisions = Math.ceil(segmentLength / maxSegmentLength);
        for (let j = 1; j < numSubdivisions; j++) {
          const t = j / numSubdivisions;
          densePoints.push({
            x: p1.x + dx * t,
            z: p1.z + dz * t,
          });
        }
      }
    }
    // Add final point
    const lastPoint = smoothedPoints[smoothedPoints.length - 1]!;
    densePoints.push({ x: lastPoint.x, z: lastPoint.z });

    // Build continuous segments, breaking when over water
    let currentSegmentPoints: number[] = [];
    let currentSegmentIndices: number[] = [];
    let vertexCount = 0;

    for (let i = 0; i < densePoints.length; i++) {
      const p = densePoints[i]!;

      // Check if this point is over bridge or water
      const overWater = isOverBridgeOrWater(p.x, p.z);

      if (overWater) {
        // End current segment if it has valid geometry
        if (currentSegmentPoints.length >= 12 && currentSegmentIndices.length >= 6) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(currentSegmentPoints, 3));
          geometry.setIndex(currentSegmentIndices);
          geometry.computeVertexNormals();
          allGeometries.push(geometry);
        }
        currentSegmentPoints = [];
        currentSegmentIndices = [];
        vertexCount = 0;
        continue;
      }

      // Calculate perpendicular direction from neighbors
      let perpX: number, perpZ: number;
      if (i === 0) {
        const next = densePoints[1]!;
        const perp = getPerp(next.x - p.x, next.z - p.z);
        perpX = perp.x;
        perpZ = perp.z;
      } else if (i === densePoints.length - 1) {
        const prev = densePoints[i - 1]!;
        const perp = getPerp(p.x - prev.x, p.z - prev.z);
        perpX = perp.x;
        perpZ = perp.z;
      } else {
        const prev = densePoints[i - 1]!;
        const next = densePoints[i + 1]!;
        const perp1 = getPerp(p.x - prev.x, p.z - prev.z);
        const perp2 = getPerp(next.x - p.x, next.z - p.z);
        perpX = (perp1.x + perp2.x) / 2;
        perpZ = (perp1.z + perp2.z) / 2;
        const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);
        if (perpLen > 0.001) {
          perpX /= perpLen;
          perpZ /= perpLen;
        } else {
          perpX = perp1.x;
          perpZ = perp1.z;
        }
      }

      if (isNaN(perpX) || isNaN(perpZ)) {
        perpX = 1;
        perpZ = 0;
      }

      // Calculate left and right edge positions
      const leftX = p.x - perpX * halfWidth;
      const leftZ = p.z - perpZ * halfWidth;
      const rightX = p.x + perpX * halfWidth;
      const rightZ = p.z + perpZ * halfWidth;

      // Sample elevation at multiple points across the road width for smooth sideways following
      // Use 3 samples: left edge, center, right edge - take the max to ensure road stays above terrain
      const leftElev = getElevationAt(leftX, leftZ);
      const centerElev = getElevationAt(p.x, p.z);
      const rightElev = getElevationAt(rightX, rightZ);

      // For each edge, use the higher of its own elevation or center elevation
      // This prevents the road from dipping below terrain on slopes
      const leftElevation = Math.max(leftElev, centerElev) + roadHeightOffset;
      const rightElevation = Math.max(rightElev, centerElev) + roadHeightOffset;

      // Left vertex
      currentSegmentPoints.push(leftX, leftElevation, leftZ);
      // Right vertex
      currentSegmentPoints.push(rightX, rightElevation, rightZ);

      // Create triangle indices
      if (vertexCount > 0) {
        const baseIdx = (vertexCount - 1) * 2;
        currentSegmentIndices.push(baseIdx, baseIdx + 2, baseIdx + 1);
        currentSegmentIndices.push(baseIdx + 1, baseIdx + 2, baseIdx + 3);
      }
      vertexCount++;
    }

    // Don't forget the last segment
    if (currentSegmentPoints.length >= 12 && currentSegmentIndices.length >= 6) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(currentSegmentPoints, 3));
      geometry.setIndex(currentSegmentIndices);
      geometry.computeVertexNormals();
      allGeometries.push(geometry);
    }

    // Merge all segment geometries into one
    if (allGeometries.length === 0) {
      return null;
    } else if (allGeometries.length === 1) {
      return allGeometries[0]!;
    } else {
      const merged = mergeGeometries(allGeometries, false);
      // Dispose individual geometries
      allGeometries.forEach(g => g.dispose());
      return merged;
    }
  }

  /**
   * Render intersection patches where roads meet
   * Creates square/rectangular filled areas at intersections
   */
  private renderIntersections(
    intersections: Intersection[],
    roads: Road[],
    getElevationAt: (x: number, z: number) => number
  ): void {
    if (!intersections || intersections.length === 0) return;

    const intersectionGroup = new THREE.Group();
    intersectionGroup.name = 'intersections';
    const intersectionHeightOffset = 0.48; // Slightly above roads (0.45)

    // Create a map of road IDs to roads for quick lookup
    const roadMap = new Map<string, Road>();
    for (const road of roads) {
      if (road.id) {
        roadMap.set(road.id, road);
      }
    }

    for (const intersection of intersections) {
      // Collect all road widths and directions at this intersection
      const roadWidths: number[] = [];
      const roadDirections: { dx: number; dz: number }[] = [];
      let bestType: RoadType = 'town';
      const typePriority: Record<RoadType, number> = {
        interstate: 4,
        highway: 3,
        bridge: 2,
        town: 1,
        dirt: 0,
      };

      for (const roadId of intersection.roadIds) {
        const road = roadMap.get(roadId);
        if (road) {
          roadWidths.push(road.width);
          if (typePriority[road.type] > typePriority[bestType]) {
            bestType = road.type;
          }

          // Find the direction of the road at this intersection
          let nearestIdx = 0;
          let nearestDist = Infinity;
          for (let i = 0; i < road.points.length; i++) {
            const p = road.points[i]!;
            const dist = Math.sqrt((p.x - intersection.x) ** 2 + (p.z - intersection.z) ** 2);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestIdx = i;
            }
          }

          // Get direction from nearest point
          if (road.points.length >= 2) {
            const p = road.points[nearestIdx]!;
            const nextIdx = nearestIdx < road.points.length - 1 ? nearestIdx + 1 : nearestIdx - 1;
            const next = road.points[nextIdx]!;
            const dx = next.x - p.x;
            const dz = next.z - p.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0.001) {
              roadDirections.push({ dx: dx / len, dz: dz / len });
            }
          }
        }
      }

      // Skip dirt-only intersections (no patch needed)
      if (bestType === 'dirt') continue;

      // Calculate intersection size based on road widths
      roadWidths.sort((a, b) => b - a);
      const largestWidth = roadWidths[0] ?? 8;
      const secondLargestWidth = roadWidths[1] ?? roadWidths[0] ?? 8;
      // Larger patch to fully cover where roads meet
      const size = (largestWidth + secondLargestWidth) / 2 + 5;

      // Get elevation at intersection
      const elevation = getElevationAt(intersection.x, intersection.z) + intersectionHeightOffset;

      // Create a square patch (rotated 45 degrees to align better with diagonal crossings)
      const halfSize = size / 2;
      const vertices: number[] = [];
      const indices: number[] = [];

      // Create square vertices with terrain-following corners
      const corners = [
        { x: intersection.x - halfSize, z: intersection.z - halfSize },
        { x: intersection.x + halfSize, z: intersection.z - halfSize },
        { x: intersection.x + halfSize, z: intersection.z + halfSize },
        { x: intersection.x - halfSize, z: intersection.z + halfSize },
      ];

      // Center vertex
      vertices.push(intersection.x, elevation, intersection.z);

      // Corner vertices with terrain-following elevation
      for (const corner of corners) {
        const cornerElev = Math.max(getElevationAt(corner.x, corner.z), elevation - 0.5) + intersectionHeightOffset;
        vertices.push(corner.x, cornerElev, corner.z);
      }

      // Create triangles from center to each edge
      indices.push(0, 1, 2); // Center to corners 1,2
      indices.push(0, 2, 3); // Center to corners 2,3
      indices.push(0, 3, 4); // Center to corners 3,4
      indices.push(0, 4, 1); // Center to corners 4,1

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const material = this.roadMaterials[bestType];
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 6;
      intersectionGroup.add(mesh);
    }

    this.mapGroup.add(intersectionGroup);
  }

  /**
   * Render lane markings (centerline and edge lines) for paved roads
   */
  private renderLaneMarkings(
    roads: Road[],
    intersections: Intersection[],
    getElevationAt: (x: number, z: number) => number,
    _isOverBridgeOrWater: (x: number, z: number, roadId?: string) => boolean,
    isOverWaterOnly: (x: number, z: number) => boolean
  ): void {
    const markingsGroup = new THREE.Group();
    markingsGroup.name = 'lane-markings';

    // Create a map of road IDs to roads for quick lookup
    const roadMap = new Map<string, Road>();
    for (const road of roads) {
      if (road.id) {
        roadMap.set(road.id, road);
      }
    }

    // Debug: log intersection count
    console.log(`Rendering lane markings for ${roads.length} roads, avoiding ${intersections.length} intersections`);
    if (intersections.length > 0) {
      console.log('First 3 intersections:', intersections.slice(0, 3).map(i => {
        const roadWidths: number[] = [];
        for (const roadId of i.roadIds) {
          const road = roadMap.get(roadId);
          if (road) roadWidths.push(road.width);
        }
        roadWidths.sort((a, b) => b - a);
        const largestWidth = roadWidths[0] ?? 8;
        const secondLargestWidth = roadWidths[1] ?? roadWidths[0] ?? 8;
        const baseSize = (largestWidth + secondLargestWidth) / 2;
        const radius = baseSize + Math.max(10, baseSize * 0.5);

        return {
          id: i.id,
          pos: `(${i.x.toFixed(1)}, ${i.z.toFixed(1)})`,
          roadCount: i.roadIds.length,
          radius: radius.toFixed(1) + 'm'
        };
      }));
    }

    // Materials for lane markings - render well above roads to ensure visibility
    const centerlineMaterial = new THREE.MeshBasicMaterial({
      color: 0xaaaaaa, // Very dull gray centerline (subtle and muted)
      depthTest: true,
      depthWrite: false, // Don't write to depth buffer to prevent z-fighting
      side: THREE.DoubleSide, // Render both sides
      opacity: 0.5, // More transparent to be less prominent
      transparent: true,
    });

    const edgeLineMaterial = new THREE.MeshBasicMaterial({
      color: 0xbbbbbb, // Subtle gray edge lines
      depthTest: true,
      depthWrite: false, // Don't write to depth buffer to prevent z-fighting
      side: THREE.DoubleSide, // Render both sides
      opacity: 0.4, // More transparent for edge lines
      transparent: true,
    });

    // Use the passed isOverWaterOnly for markings to ensure they show up on bridges
    const getSkipperForMarkings = () => (x: number, z: number) => isOverWaterOnly(x, z);

    const lineWidth = 0.3; // Width of lane markings in meters (smaller and more subtle)
    const lineHeightOffset = 0.1; // Height above road surface (minimal to avoid visible gap)

    // Helper to calculate intersection radius (must match renderIntersections)
    const getIntersectionRadius = (intersection: Intersection): number => {
      const roadWidths: number[] = [];
      for (const roadId of intersection.roadIds) {
        const road = roadMap.get(roadId);
        if (road) {
          roadWidths.push(road.width);
        }
      }
      roadWidths.sort((a, b) => b - a);
      const largestWidth = roadWidths[0] ?? 8;
      const secondLargestWidth = roadWidths[1] ?? roadWidths[0] ?? 8;
      // Scale buffer with intersection size - larger intersections need larger exclusion zones
      const baseSize = (largestWidth + secondLargestWidth) / 2;
      return baseSize + Math.max(10, baseSize * 0.5); // Min 10m buffer, scales 50% with size
    };

    // Helper to check if a point is near any intersection
    const isNearIntersection = (
      point: { x: number; z: number }
    ): boolean => {
      for (const intersection of intersections) {
        const radius = getIntersectionRadius(intersection);
        const dist = Math.sqrt(
          (point.x - intersection.x) ** 2 + (point.z - intersection.z) ** 2
        );
        // Stop lane markings well before intersection for clean look
        if (dist < radius) {
          return true;
        }
      }
      return false;
    };

    // Helper to check if a line segment passes through any intersection
    const segmentPassesThroughIntersection = (
      p1: { x: number; z: number },
      p2: { x: number; z: number }
    ): boolean => {
      // Check multiple points along the segment
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const testPoint = {
          x: p1.x + (p2.x - p1.x) * t,
          z: p1.z + (p2.z - p1.z) * t,
        };
        if (isNearIntersection(testPoint)) {
          return true;
        }
      }
      return false;
    };

    // Helper to filter road points, creating segments that skip intersections
    const getSegmentsAvoidingIntersections = (
      points: { x: number; z: number }[]
    ): { x: number; z: number }[][] => {
      const segments: { x: number; z: number }[][] = [];
      let currentSegment: { x: number; z: number }[] = [];

      for (let i = 0; i < points.length; i++) {
        const point = points[i]!;

        // Check if this point or the segment to the next point intersects
        const nearIntersection = isNearIntersection(point);
        const nextPoint = points[i + 1];
        const segmentIntersects = nextPoint ? segmentPassesThroughIntersection(point, nextPoint) : false;

        if (nearIntersection || segmentIntersects) {
          // End current segment if it has enough points
          if (currentSegment.length >= 2) {
            segments.push(currentSegment);
          }
          currentSegment = [];

          // Skip ahead past ALL points in intersection zone
          // Don't back up - let the next iteration validate the first safe point
          while (i < points.length - 1 && isNearIntersection(points[i]!)) {
            i++;
          }
        } else {
          currentSegment.push(point);
        }
      }

      // Add final segment
      if (currentSegment.length >= 2) {
        segments.push(currentSegment);
      }

      return segments;
    };

    // Phase 4 Optimization: Collect geometries for merging
    const centerlineGeometries: THREE.BufferGeometry[] = [];
    const leftEdgeGeometries: THREE.BufferGeometry[] = [];
    const rightEdgeGeometries: THREE.BufferGeometry[] = [];

    for (const road of roads) {
      // Skip dirt roads (no markings)
      if (road.type === 'dirt' || road.points.length < 2) continue;

      const halfWidth = road.width / 2;

      // Get road segments that avoid intersections
      const segments = getSegmentsAvoidingIntersections(road.points);

      // Debug: log filtering results
      const originalPoints = road.points.length;
      const totalFilteredPoints = segments.reduce((sum, seg) => sum + seg.length, 0);
      const filteredCount = originalPoints - totalFilteredPoints;
      if (filteredCount > 0) {
        console.log(`Road ${road.id}: filtered ${filteredCount}/${originalPoints} points, ${segments.length} segments`);
      } else if (segments.length === 0) {
        console.warn(`Road ${road.id}: NO segments after filtering (${originalPoints} points)`);
      }

      for (const segmentPoints of segments) {
        // Create centerline geometry (collect, don't create mesh yet)
        const centerlineGeometry = this.createLineStripGeometry(
          segmentPoints,
          0, // offset = 0 for center
          lineWidth,
          getElevationAt,
          lineHeightOffset,
          road.width, // Pass road width for proper elevation sampling
          getSkipperForMarkings()
        );
        if (centerlineGeometry) {
          centerlineGeometries.push(centerlineGeometry);
        }

        // Create left edge line (collect, don't create mesh yet)
        const leftEdgeGeometry = this.createLineStripGeometry(
          segmentPoints,
          -(halfWidth - lineWidth / 2 - 0.1), // offset to left edge
          lineWidth,
          getElevationAt,
          lineHeightOffset,
          road.width, // Pass road width for proper elevation sampling
          getSkipperForMarkings()
        );
        if (leftEdgeGeometry) {
          leftEdgeGeometries.push(leftEdgeGeometry);
        }

        // Create right edge line (collect, don't create mesh yet)
        const rightEdgeGeometry = this.createLineStripGeometry(
          segmentPoints,
          halfWidth - lineWidth / 2 - 0.1, // offset to right edge
          lineWidth,
          getElevationAt,
          lineHeightOffset,
          road.width, // Pass road width for proper elevation sampling
          getSkipperForMarkings()
        );
        if (rightEdgeGeometry) {
          rightEdgeGeometries.push(rightEdgeGeometry);
        }
      }
    }

    // Phase 4: Merge all centerline geometries into one mesh
    if (centerlineGeometries.length > 0) {
      const mergedCenterlines = mergeGeometries(centerlineGeometries, false);
      if (mergedCenterlines) {
        const mesh = new THREE.Mesh(mergedCenterlines, centerlineMaterial);
        mesh.name = 'merged-centerlines';
        mesh.renderOrder = 10; // High render order to ensure visibility over roads
        markingsGroup.add(mesh);

        // Dispose individual geometries after merging
        centerlineGeometries.forEach(g => g.dispose());
      }
    }

    // Phase 4: Merge all left edge geometries into one mesh
    if (leftEdgeGeometries.length > 0) {
      const mergedLeftEdges = mergeGeometries(leftEdgeGeometries, false);
      if (mergedLeftEdges) {
        const mesh = new THREE.Mesh(mergedLeftEdges, edgeLineMaterial);
        mesh.name = 'merged-left-edges';
        mesh.renderOrder = 10;
        markingsGroup.add(mesh);

        // Dispose individual geometries after merging
        leftEdgeGeometries.forEach(g => g.dispose());
      }
    }

    // Phase 4: Merge all right edge geometries into one mesh
    if (rightEdgeGeometries.length > 0) {
      const mergedRightEdges = mergeGeometries(rightEdgeGeometries, false);
      if (mergedRightEdges) {
        const mesh = new THREE.Mesh(mergedRightEdges, edgeLineMaterial);
        mesh.name = 'merged-right-edges';
        mesh.renderOrder = 10;
        markingsGroup.add(mesh);

        // Dispose individual geometries after merging
        rightEdgeGeometries.forEach(g => g.dispose());
      }
    }

    this.mapGroup.add(markingsGroup);
  }

  /**
   * Get road surface elevation at a point (matches road rendering logic)
   * Samples multiple points to get the maximum elevation, matching how roads are rendered
   */
  private getRoadSurfaceElevation(
    x: number,
    z: number,
    roadWidth: number,
    getElevationAt: (x: number, z: number) => number
  ): number {
    const roadHeightOffset = 0.45; // Same as road rendering

    // Sample at center and edges (same as road rendering does)
    const centerElev = getElevationAt(x, z);
    const halfWidth = roadWidth / 2;

    // Sample at left and right edges
    const leftElev = getElevationAt(x - halfWidth, z);
    const rightElev = getElevationAt(x + halfWidth, z);

    // Use the maximum elevation (same logic as road rendering)
    const maxElev = Math.max(centerElev, leftElev, rightElev);

    return maxElev + roadHeightOffset;
  }

  /**
   * Create a line strip geometry following road points with lateral offset
   * Skips segments over water (bridges don't have lane markings)
   */
  private createLineStripGeometry(
    points: { x: number; z: number }[],
    lateralOffset: number,
    lineWidth: number,
    getElevationAt: (x: number, z: number) => number,
    heightOffset: number,
    roadWidth: number = 8, // Default road width for elevation sampling
    isOverBridgeOrWater?: (x: number, z: number) => boolean // Optional bridge/water detection function
  ): THREE.BufferGeometry | null {
    if (points.length < 2) return null;

    const vertices: number[] = [];
    const indices: number[] = [];
    const halfLineWidth = lineWidth / 2;

    // Helper to safely calculate perpendicular direction
    const getPerp = (dx: number, dz: number): { x: number; z: number } => {
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) {
        return { x: 1, z: 0 };
      }
      return { x: -dz / len, z: dx / len };
    };

    let validPointCount = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;

      // Skip points over bridge or water (bridges don't have lane markings)
      if (isOverBridgeOrWater && isOverBridgeOrWater(p.x, p.z)) {
        continue;
      }

      // Calculate perpendicular direction
      let perpX: number, perpZ: number;

      if (i === 0) {
        const next = points[1]!;
        const perp = getPerp(next.x - p.x, next.z - p.z);
        perpX = perp.x;
        perpZ = perp.z;
      } else if (i === points.length - 1) {
        const prev = points[i - 1]!;
        const perp = getPerp(p.x - prev.x, p.z - prev.z);
        perpX = perp.x;
        perpZ = perp.z;
      } else {
        const prev = points[i - 1]!;
        const next = points[i + 1]!;

        const perp1 = getPerp(p.x - prev.x, p.z - prev.z);
        const perp2 = getPerp(next.x - p.x, next.z - p.z);

        perpX = (perp1.x + perp2.x) / 2;
        perpZ = (perp1.z + perp2.z) / 2;

        const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);
        if (perpLen > 0.001) {
          perpX /= perpLen;
          perpZ /= perpLen;
        } else {
          perpX = perp1.x;
          perpZ = perp1.z;
        }
      }

      // Guard against NaN
      if (isNaN(perpX) || isNaN(perpZ)) {
        perpX = 1;
        perpZ = 0;
      }

      // Apply lateral offset to get the center of the line
      const centerX = p.x + perpX * lateralOffset;
      const centerZ = p.z + perpZ * lateralOffset;

      // Get road surface elevation (matches road rendering on hills/gradients)
      const roadSurfaceElev = this.getRoadSurfaceElevation(centerX, centerZ, roadWidth, getElevationAt);
      const elevation = roadSurfaceElev + heightOffset;

      // Create left and right vertices for the line strip
      vertices.push(
        centerX - perpX * halfLineWidth,
        elevation,
        centerZ - perpZ * halfLineWidth
      );
      vertices.push(
        centerX + perpX * halfLineWidth,
        elevation,
        centerZ + perpZ * halfLineWidth
      );

      // Create triangle indices
      if (validPointCount > 0) {
        const baseIdx = (validPointCount - 1) * 2;
        indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
        indices.push(baseIdx + 1, baseIdx + 2, baseIdx + 3);
      }
      validPointCount++;
    }

    if (vertices.length < 6 || indices.length < 3) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Render bridges over rivers
   * Bridges connect roads across water with ramps at both ends
   */
  private renderBridges(bridges: Bridge[], map: GameMap): void {
    if (!bridges || bridges.length === 0) return;

    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'bridges';

    const bridgeMaterial = this.roadMaterials.bridge;

    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    // Helper to get terrain elevation
    const getElevationAt = (worldX: number, worldZ: number): number => {
      const gridX = Math.floor((worldX + map.width / 2) / cellSizeX);
      const gridZ = Math.floor((worldZ + map.height / 2) / cellSizeZ);
      const clampedX = Math.max(0, Math.min(cols - 1, gridX));
      const clampedZ = Math.max(0, Math.min(rows - 1, gridZ));
      return map.terrain[clampedZ]?.[clampedX]?.elevation ?? 0;
    };

    // Phase 4 Optimization: Collect geometries for merging
    const deckGeometries: THREE.BufferGeometry[] = [];
    const railingGeometries: THREE.BufferGeometry[] = [];
    const railingMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a6858,
      roughness: 0.9,
      metalness: 0.05,
    });

    for (const bridge of bridges) {
      // Calculate bridge endpoints
      const halfLength = bridge.length / 2;
      const cosAngle = Math.cos(bridge.angle);
      const sinAngle = Math.sin(bridge.angle);

      // End points of the bridge
      const startX = bridge.x - cosAngle * halfLength;
      const startZ = bridge.z - sinAngle * halfLength;
      const endX = bridge.x + cosAngle * halfLength;
      const endZ = bridge.z + sinAngle * halfLength;

      // Get elevation at bridge ends (where it meets the road)
      const startElevation = getElevationAt(startX, startZ) + 0.2;
      const endElevation = getElevationAt(endX, endZ) + 0.2;

      // Create bridge deck as a series of segments for smooth elevation transition
      const numSegments = 8;
      const halfWidth = bridge.width / 2;
      const vertices: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= numSegments; i++) {
        const t = i / numSegments;
        const x = startX + (endX - startX) * t;
        const z = startZ + (endZ - startZ) * t;

        // Use linear interpolation for a smooth, flat deck transition
        // This prevents the "up and down" arching that caused wobbliness
        const y = startElevation + (endElevation - startElevation) * t;

        // Calculate perpendicular for width
        const perpX = -sinAngle;
        const perpZ = cosAngle;

        // Left vertex
        vertices.push(x - perpX * halfWidth, y, z - perpZ * halfWidth);
        // Right vertex
        vertices.push(x + perpX * halfWidth, y, z + perpZ * halfWidth);

        // Create triangles
        if (i > 0) {
          const baseIdx = (i - 1) * 2;
          indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
          indices.push(baseIdx + 1, baseIdx + 2, baseIdx + 3);
        }
      }

      const deckGeometry = new THREE.BufferGeometry();
      deckGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      deckGeometry.setIndex(indices);
      deckGeometry.computeVertexNormals();
      deckGeometries.push(deckGeometry);

      // Create railing geometry following bridge curve
      const railingHeight = 0.8;
      const railingWidth = 0.25;

      for (const side of [-1, 1]) {
        const railingVertices: number[] = [];
        const railingIndices: number[] = [];

        for (let i = 0; i <= numSegments; i++) {
          const t = i / numSegments;
          const x = startX + (endX - startX) * t;
          const z = startZ + (endZ - startZ) * t;

          // Match linear deck elevation
          const y = startElevation + (endElevation - startElevation) * t;

          const perpX = -sinAngle;
          const perpZ = cosAngle;
          const offsetX = perpX * (halfWidth - railingWidth / 2) * side;
          const offsetZ = perpZ * (halfWidth - railingWidth / 2) * side;

          // Bottom of railing
          railingVertices.push(x + offsetX - perpX * railingWidth / 2, y, z + offsetZ - perpZ * railingWidth / 2);
          railingVertices.push(x + offsetX + perpX * railingWidth / 2, y, z + offsetZ + perpZ * railingWidth / 2);
          // Top of railing
          railingVertices.push(x + offsetX - perpX * railingWidth / 2, y + railingHeight, z + offsetZ - perpZ * railingWidth / 2);
          railingVertices.push(x + offsetX + perpX * railingWidth / 2, y + railingHeight, z + offsetZ + perpZ * railingWidth / 2);

          if (i > 0) {
            const baseIdx = (i - 1) * 4;
            // Bottom face
            railingIndices.push(baseIdx, baseIdx + 4, baseIdx + 1);
            railingIndices.push(baseIdx + 1, baseIdx + 4, baseIdx + 5);
            // Top face
            railingIndices.push(baseIdx + 2, baseIdx + 3, baseIdx + 6);
            railingIndices.push(baseIdx + 3, baseIdx + 7, baseIdx + 6);
            // Outer face
            railingIndices.push(baseIdx, baseIdx + 2, baseIdx + 4);
            railingIndices.push(baseIdx + 2, baseIdx + 6, baseIdx + 4);
            // Inner face
            railingIndices.push(baseIdx + 1, baseIdx + 5, baseIdx + 3);
            railingIndices.push(baseIdx + 3, baseIdx + 5, baseIdx + 7);
          }
        }

        const railingGeometry = new THREE.BufferGeometry();
        railingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(railingVertices, 3));
        railingGeometry.setIndex(railingIndices);
        railingGeometry.computeVertexNormals();
        railingGeometries.push(railingGeometry);
      }
    }

    // Phase 4: Merge all deck geometries into one mesh
    if (deckGeometries.length > 0) {
      const mergedDeck = mergeGeometries(deckGeometries, false);
      if (mergedDeck) {
        const deckMesh = new THREE.Mesh(mergedDeck, bridgeMaterial);
        deckMesh.name = 'merged-bridge-decks';
        deckMesh.receiveShadow = true;
        deckMesh.castShadow = true;
        deckMesh.renderOrder = 7; // Render above roads
        bridgeGroup.add(deckMesh);

        // Dispose individual geometries after merging
        deckGeometries.forEach(g => g.dispose());
      }
    }

    // Phase 4: Merge all railing geometries into one mesh
    if (railingGeometries.length > 0) {
      const mergedRailings = mergeGeometries(railingGeometries, false);
      if (mergedRailings) {
        const railingMesh = new THREE.Mesh(mergedRailings, railingMaterial);
        railingMesh.name = 'merged-bridge-railings';
        railingMesh.castShadow = true;
        bridgeGroup.add(railingMesh);

        // Dispose individual geometries after merging
        railingGeometries.forEach(g => g.dispose());
      }
    }

    this.mapGroup.add(bridgeGroup);
  }

  private renderBuildings(buildings: Building[], map: GameMap): void {
    const buildingGroup = new THREE.Group();
    buildingGroup.name = 'buildings';

    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    // Helper to get terrain elevation using bilinear interpolation
    const getElevationAt = (worldX: number, worldZ: number): number => {
      const gx = (worldX + map.width / 2) / cellSizeX;
      const gz = (worldZ + map.height / 2) / cellSizeZ;
      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const cx0 = Math.max(0, Math.min(cols - 1, x0));
      const cx1 = Math.max(0, Math.min(cols - 1, x0 + 1));
      const cz0 = Math.max(0, Math.min(rows - 1, z0));
      const cz1 = Math.max(0, Math.min(rows - 1, z0 + 1));
      const e00 = map.terrain[cz0]?.[cx0]?.elevation ?? 0;
      const e10 = map.terrain[cz0]?.[cx1]?.elevation ?? 0;
      const e01 = map.terrain[cz1]?.[cx0]?.elevation ?? 0;
      const e11 = map.terrain[cz1]?.[cx1]?.elevation ?? 0;
      const fx = gx - x0;
      const fz = gz - z0;
      const e0 = e00 + (e10 - e00) * fx;
      const e1 = e01 + (e11 - e01) * fx;
      return e0 + (e1 - e0) * fz;
    };

    console.log(`[MapRenderer] Rendering ${buildings.length} buildings`);
    for (const building of buildings) {
      if (buildings.indexOf(building) < 5) console.log(`[MapRenderer] Building at ${building.x}, ${building.z} type ${building.type} W:${building.width} H:${building.height}`);
      const buildingMesh = this.createBuildingMesh(building, getElevationAt);
      buildingGroup.add(buildingMesh);
    }

    this.mapGroup.add(buildingGroup);
  }

  private createBuildingMesh(
    building: Building,
    getElevationAt: (x: number, z: number) => number
  ): THREE.Group {
    const group = new THREE.Group();

    // Get terrain elevation at building position
    const terrainElevation = getElevationAt(building.x, building.z);
    const buildingSubtype = building.subtype;

    // Select material based on building type/subtype
    let wallMaterial = this.materials.building;
    if (building.type === 'church' || building.subtype?.includes('church') || building.subtype?.includes('cathedral') || building.subtype?.includes('chapel')) {
      wallMaterial = this.materials.church;
    } else if (building.type === 'factory' || building.category === 'industrial') {
      wallMaterial = this.materials.factory;
    }

    // Main building body
    const bodyGeometry = new THREE.BoxGeometry(
      building.width,
      building.height,
      building.depth
    );
    const bodyMesh = new THREE.Mesh(bodyGeometry, wallMaterial);
    bodyMesh.position.y = building.height / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Style-specific geometry adjustments
    // Style-specific geometry adjustments
    if (buildingSubtype === 'skyscraper') {
      bodyMesh.visible = false;
      const tiers = 3;
      for (let i = 0; i < tiers; i++) {
        const tierHeight = building.height * (1 - i * 0.2);
        const tierWidth = building.width * (1 - i * 0.15);
        const tierDepth = building.depth * (1 - i * 0.15);
        const tierGeo = new THREE.BoxGeometry(tierWidth, tierHeight, tierDepth);
        const tierMesh = new THREE.Mesh(tierGeo, wallMaterial);
        tierMesh.position.y = tierHeight / 2;
        tierMesh.castShadow = true;
        group.add(tierMesh);
      }
    } else if (buildingSubtype === 'l_building') {
      bodyMesh.visible = false;
      const wing1Geo = new THREE.BoxGeometry(building.width, building.height, building.depth * 0.4);
      const wing1 = new THREE.Mesh(wing1Geo, wallMaterial);
      wing1.position.set(0, building.height / 2, -building.depth * 0.3);
      group.add(wing1);
      const wing2Geo = new THREE.BoxGeometry(building.width * 0.4, building.height, building.depth);
      const wing2 = new THREE.Mesh(wing2Geo, wallMaterial);
      wing2.position.set(-building.width * 0.3, building.height / 2, 0);
      group.add(wing2);
    } else if (buildingSubtype === 'tenement') {
      // Add balconies
      for (let f = 1; f < (building.floors || 1); f++) {
        const balconyGeo = new THREE.BoxGeometry(building.width * 0.8, 0.5, 1);
        const balcony = new THREE.Mesh(balconyGeo, this.materials.roof);
        balcony.position.set(0, f * 3, building.depth / 2 + 0.5);
        group.add(balcony);
      }
    } else if (buildingSubtype === 'warehouse_complex') {
      // Add skylights
      const rows = 3;
      const cols = 4;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const skyGeo = new THREE.BoxGeometry(building.width * 0.1, 0.5, building.depth * 0.15);
          const sky = new THREE.Mesh(skyGeo, this.materials.roof);
          sky.position.set(
            (c / (cols - 1) - 0.5) * building.width * 0.8,
            building.height + 0.2,
            (r / (rows - 1) - 0.5) * building.depth * 0.8
          );
          group.add(sky);
        }
      }
    } else if (buildingSubtype === 'department_store') {
      // Recessed windows
      const windowGeo = new THREE.BoxGeometry(building.width * 0.9, building.height * 0.6, 1);
      const windowMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
      const win = new THREE.Mesh(windowGeo, windowMat);
      win.position.set(0, building.height * 0.4, building.depth / 2 - 0.1);
      group.add(win);
    } else if (buildingSubtype === 'library') {
      // Columns
      for (let i = -2; i <= 2; i++) {
        const colGeo = new THREE.CylinderGeometry(0.5, 0.5, building.height, 8);
        const column = new THREE.Mesh(colGeo, wallMaterial);
        column.position.set(i * (building.width / 5), building.height / 2, building.depth / 2 + 2);
        group.add(column);
      }
      const pedimentGeo = new THREE.ConeGeometry(building.width * 0.6, 3, 4);
      pedimentGeo.rotateY(Math.PI / 4);
      const pediment = new THREE.Mesh(pedimentGeo, wallMaterial);
      pediment.position.set(0, building.height + 1.5, building.depth / 2 + 2);
      group.add(pediment);
    } else if (buildingSubtype === 'clock_tower') {
      bodyMesh.visible = false;
      const shaftGeo = new THREE.BoxGeometry(building.width, building.height - 5, building.depth);
      const shaft = new THREE.Mesh(shaftGeo, wallMaterial);
      shaft.position.y = (building.height - 5) / 2;
      group.add(shaft);

      const headGeo = new THREE.BoxGeometry(building.width * 1.2, 5, building.depth * 1.2);
      const head = new THREE.Mesh(headGeo, wallMaterial);
      head.position.y = building.height - 2.5;
      group.add(head);

      const clockGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 16);
      const clock = new THREE.Mesh(clockGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      clock.rotation.x = Math.PI / 2;
      clock.position.set(0, building.height - 2.5, building.depth * 0.6 + 0.1);
      group.add(clock);
    } else if (buildingSubtype === 'silo_cluster') {
      bodyMesh.visible = false;
      const baseGeo = new THREE.BoxGeometry(building.width, 1, building.depth);
      const base = new THREE.Mesh(baseGeo, this.materials.factory);
      base.position.y = 0.5;
      group.add(base);
      for (let i = 0; i < 4; i++) {
        const siloGeo = new THREE.CylinderGeometry(building.width * 0.2, building.width * 0.2, building.height, 12);
        const silo = new THREE.Mesh(siloGeo, wallMaterial);
        silo.position.set(i < 2 ? -2.5 : 2.5, building.height / 2, i % 2 === 0 ? -2.5 : 2.5);
        group.add(silo);
        const topGeo = new THREE.SphereGeometry(building.width * 0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const top = new THREE.Mesh(topGeo, this.materials.roof);
        top.position.set(i < 2 ? -2.5 : 2.5, building.height, i % 2 === 0 ? -2.5 : 2.5);
        group.add(top);
      }
    } else if (buildingSubtype === 'radio_station') {
      const antennaGeo = new THREE.CylinderGeometry(0.1, 0.5, 15, 4);
      const antenna = new THREE.Mesh(antennaGeo, this.materials.factory);
      antenna.position.set(0, building.height + 7.5, 0);
      group.add(antenna);
    } else if (buildingSubtype === 'government_office') {
      const domeGeo = new THREE.SphereGeometry(building.width * 0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const dome = new THREE.Mesh(domeGeo, this.materials.roof);
      dome.position.y = building.height;
      group.add(dome);
    }

    // Default roof logic for standard buildings
    const needsDefaultRoof = !['skyscraper', 'l_building', 'silo_cluster', 'water_tower', 'windmill', 'silo'].includes(buildingSubtype || '');

    if (needsDefaultRoof) {
      if (building.type === 'church' || buildingSubtype === 'church' || buildingSubtype === 'cathedral' || buildingSubtype === 'chapel') {
        const spireGeometry = new THREE.ConeGeometry(building.width * 0.3, building.height * 0.8, 8);
        const spireMesh = new THREE.Mesh(spireGeometry, this.materials.roof);
        spireMesh.position.y = building.height + building.height * 0.4;
        spireMesh.castShadow = true;
        group.add(spireMesh);

        if (buildingSubtype === 'cathedral') {
          const sideSpireGeometry = new THREE.ConeGeometry(building.width * 0.2, building.height * 0.5, 6);
          [-1, 1].forEach(side => {
            const sideSpire = new THREE.Mesh(sideSpireGeometry, this.materials.roof);
            sideSpire.position.set(building.width * 0.3 * side, building.height + building.height * 0.25, 0);
            sideSpire.castShadow = true;
            group.add(sideSpire);
          });
        }
      } else if (building.type === 'factory' || building.category === 'industrial') {
        const numChimneys = (buildingSubtype === 'large_factory' || buildingSubtype === 'power_plant' || buildingSubtype === 'warehouse_complex') ? 2 : 1;
        for (let i = 0; i < numChimneys; i++) {
          const chimneyGeometry = new THREE.CylinderGeometry(1, 1.5, building.height * 0.5, 8);
          const chimneyMesh = new THREE.Mesh(chimneyGeometry, this.materials.factory);
          const xOffset = numChimneys > 1 ? (i === 0 ? -0.2 : 0.2) : 0.3;
          chimneyMesh.position.set(building.width * xOffset, building.height + building.height * 0.25, building.depth * 0.3);
          chimneyMesh.castShadow = true;
          group.add(chimneyMesh);
        }
      } else if (building.category === 'agricultural' && buildingSubtype !== 'windmill' && buildingSubtype !== 'silo' && buildingSubtype !== 'silo_cluster') {
        const roofGeometry = new THREE.ConeGeometry(Math.max(building.width, building.depth) * 0.75, building.height * 0.5, 4);
        roofGeometry.rotateY(Math.PI / 4);
        const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
        roofMesh.position.y = building.height + building.height * 0.25;
        roofMesh.castShadow = true;
        group.add(roofMesh);
      } else if (building.category === 'infrastructure' && buildingSubtype !== 'water_tower' && buildingSubtype !== 'radio_station') {
        const roofGeometry = new THREE.ConeGeometry(Math.max(building.width, building.depth) * 0.7, building.height * 0.3, 4);
        roofGeometry.rotateY(Math.PI / 4);
        const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
        roofMesh.position.y = building.height + building.height * 0.15;
        roofMesh.castShadow = true;
        group.add(roofMesh);
      } else if (building.type === 'house' || building.type === 'shop' || building.category === 'residential' || building.category === 'commercial') {
        const roofHeight = (building.floors && building.floors > 2) ? building.height * 0.3 : building.height * 0.4;
        const roofGeometry = new THREE.ConeGeometry(Math.max(building.width, building.depth) * 0.7, roofHeight, 4);
        roofGeometry.rotateY(Math.PI / 4);
        const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
        roofMesh.position.y = building.height + roofHeight * 0.5;
        roofMesh.castShadow = true;
        group.add(roofMesh);
      } else if (building.category === 'civic' && buildingSubtype !== 'clock_tower' && buildingSubtype !== 'library') {
        const roofGeometry = new THREE.ConeGeometry(Math.max(building.width, building.depth) * 0.75, building.height * 0.25, 4);
        roofGeometry.rotateY(Math.PI / 4);
        const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
        roofMesh.position.y = building.height + building.height * 0.125;
        roofMesh.castShadow = true;
        group.add(roofMesh);
      }
    }

    // Apply rotation if specified
    if (building.rotation) {
      group.rotation.y = building.rotation;
    }

    group.position.set(building.x, terrainElevation, building.z);
    group.userData['building'] = building;

    return group;
  }

  private renderDeploymentZones(zones: DeploymentZone[], map: GameMap): void {
    const zoneGroup = new THREE.Group();
    zoneGroup.name = 'deployment-zones';

    // Helper to get elevation at world position
    const rows = map.terrain.length;
    const cols = map.terrain[0]?.length ?? 0;
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    const getElevationAt = (worldX: number, worldZ: number): number => {
      const gx = (worldX + map.width / 2) / cellSizeX;
      const gz = (worldZ + map.height / 2) / cellSizeZ;
      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const cx0 = Math.max(0, Math.min(cols - 1, x0));
      const cx1 = Math.max(0, Math.min(cols - 1, x0 + 1));
      const cz0 = Math.max(0, Math.min(rows - 1, z0));
      const cz1 = Math.max(0, Math.min(rows - 1, z0 + 1));
      const e00 = map.terrain[cz0]?.[cx0]?.elevation ?? 0;
      const e10 = map.terrain[cz0]?.[cx1]?.elevation ?? 0;
      const e01 = map.terrain[cz1]?.[cx0]?.elevation ?? 0;
      const e11 = map.terrain[cz1]?.[cx1]?.elevation ?? 0;
      const fx = gx - x0;
      const fz = gz - z0;
      const e0 = e00 + (e10 - e00) * fx;
      const e1 = e01 + (e11 - e01) * fx;
      return e0 + (e1 - e0) * fz;
    };

    // Update materials for flat overlay rendering
    if (this.materials.deploymentPlayer.side !== THREE.DoubleSide) {
      this.materials.deploymentPlayer.side = THREE.DoubleSide;
      this.materials.deploymentPlayer.depthTest = true;
      this.materials.deploymentPlayer.depthWrite = false;
      this.materials.deploymentPlayer.polygonOffset = true;
      this.materials.deploymentPlayer.polygonOffsetFactor = -1;
      this.materials.deploymentPlayer.polygonOffsetUnits = -1;
    }
    if (this.materials.deploymentEnemy.side !== THREE.DoubleSide) {
      this.materials.deploymentEnemy.side = THREE.DoubleSide;
      this.materials.deploymentEnemy.depthTest = true;
      this.materials.deploymentEnemy.depthWrite = false;
      this.materials.deploymentEnemy.polygonOffset = true;
      this.materials.deploymentEnemy.polygonOffsetFactor = -1;
      this.materials.deploymentEnemy.polygonOffsetUnits = -1;
    }

    // Phase 4 Optimization: Collect geometries for merging
    const playerGeometries: THREE.BufferGeometry[] = [];
    const enemyGeometries: THREE.BufferGeometry[] = [];
    const playerBorderPoints: THREE.Vector3[] = [];
    const enemyBorderPoints: THREE.Vector3[] = [];

    for (const zone of zones) {
      const width = zone.maxX - zone.minX;
      const depth = zone.maxZ - zone.minZ;
      const centerX = (zone.minX + zone.maxX) / 2;
      const centerZ = (zone.minZ + zone.maxZ) / 2;

      // Sample terrain densely to find max elevation (don't miss peaks/hills)
      // Sample every 5 meters to ensure we catch terrain features
      let maxElevation = 0;
      const sampleSpacing = 5; // meters between samples
      const samplesX = Math.max(3, Math.ceil(width / sampleSpacing));
      const samplesZ = Math.max(3, Math.ceil(depth / sampleSpacing));

      for (let sz = 0; sz < samplesZ; sz++) {
        for (let sx = 0; sx < samplesX; sx++) {
          const sampleX = zone.minX + (sx / (samplesX - 1)) * width;
          const sampleZ = zone.minZ + (sz / (samplesZ - 1)) * depth;
          const elevation = getElevationAt(sampleX, sampleZ);
          maxElevation = Math.max(maxElevation, elevation);
        }
      }

      // Use simple flat plane positioned above max elevation
      const geometry = new THREE.PlaneGeometry(width, depth);
      geometry.rotateX(-Math.PI / 2);

      // Translate geometry to world position (for merging)
      // Position 1.0m above the highest point in the zone
      geometry.translate(centerX, maxElevation + 1.0, centerZ);

      // Collect by team
      if (zone.team === 'player') {
        playerGeometries.push(geometry);
      } else {
        enemyGeometries.push(geometry);
      }

      // Create border points (in world space) at the same height as the zone overlay
      const borderPoints: THREE.Vector3[] = [];
      const steps = 20; // Number of steps per side for smooth lines
      const borderHeight = maxElevation + 1.5; // Slightly above the overlay for visibility

      // Helper to add segments along a line
      const addEdge = (x1: number, z1: number, x2: number, z2: number) => {
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const px = x1 + (x2 - x1) * t;
          const pz = z1 + (z2 - z1) * t;
          borderPoints.push(new THREE.Vector3(px, borderHeight, pz));
        }
      };

      // Edges: Top, Right, Bottom, Left
      addEdge(zone.minX, zone.minZ, zone.maxX, zone.minZ);
      addEdge(zone.maxX, zone.minZ, zone.maxX, zone.maxZ);
      addEdge(zone.maxX, zone.maxZ, zone.minX, zone.maxZ);
      addEdge(zone.minX, zone.maxZ, zone.minX, zone.minZ);

      // Collect border points by team
      if (zone.team === 'player') {
        playerBorderPoints.push(...borderPoints);
      } else {
        enemyBorderPoints.push(...borderPoints);
      }
    }

    // Phase 4: Merge player zone geometries
    if (playerGeometries.length > 0) {
      const merged = mergeGeometries(playerGeometries, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.materials.deploymentPlayer);
        mesh.name = 'merged-deployment-player';
        mesh.renderOrder = 99;
        zoneGroup.add(mesh);

        // Dispose individual geometries after merging
        playerGeometries.forEach(g => g.dispose());
      }
    }

    // Phase 4: Merge enemy zone geometries
    if (enemyGeometries.length > 0) {
      const merged = mergeGeometries(enemyGeometries, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.materials.deploymentEnemy);
        mesh.name = 'merged-deployment-enemy';
        mesh.renderOrder = 99;
        zoneGroup.add(mesh);

        // Dispose individual geometries after merging
        enemyGeometries.forEach(g => g.dispose());
      }
    }

    // Phase 4: Create merged border lines
    if (playerBorderPoints.length > 0) {
      const borderGeometry = new THREE.BufferGeometry().setFromPoints(playerBorderPoints);
      const borderMaterial = new THREE.LineBasicMaterial({
        color: 0x4a9eff,
        depthWrite: false,
        depthTest: false,
        linewidth: 2,
      });
      const border = new THREE.LineSegments(borderGeometry, borderMaterial); // Use LineSegments instead of LineLoop
      border.name = 'merged-border-player';
      border.renderOrder = 100;
      zoneGroup.add(border);
    }

    if (enemyBorderPoints.length > 0) {
      const borderGeometry = new THREE.BufferGeometry().setFromPoints(enemyBorderPoints);
      const borderMaterial = new THREE.LineBasicMaterial({
        color: 0xff4a4a,
        depthWrite: false,
        depthTest: false,
        linewidth: 2,
      });
      const border = new THREE.LineSegments(borderGeometry, borderMaterial); // Use LineSegments instead of LineLoop
      border.name = 'merged-border-enemy';
      border.renderOrder = 100;
      zoneGroup.add(border);
    }

    // Store reference for hiding during battle
    this.deploymentZonesGroup = zoneGroup;
    this.mapGroup.add(zoneGroup);
  }

  /**
   * Show or hide deployment zones (hide during battle phase)
   */
  setDeploymentZonesVisible(visible: boolean): void {
    if (this.deploymentZonesGroup) {
      this.deploymentZonesGroup.visible = visible;
    }
  }

  private renderCaptureZones(zones: CaptureZone[], map: GameMap): void {
    const zoneGroup = new THREE.Group();
    zoneGroup.name = 'capture-zones';

    const getElevationAt = (worldX: number, worldZ: number): number => {
      // Re-use logic from renderTerrain for consistency
      const rows = map.terrain.length;
      const cols = map.terrain[0]?.length ?? 0;
      const gx = (worldX + map.width / 2) / (map.width / cols);
      const gz = (worldZ + map.height / 2) / (map.height / rows);
      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const cx0 = Math.max(0, Math.min(cols - 1, x0));
      const cx1 = Math.max(0, Math.min(cols - 1, x0 + 1));
      const cz0 = Math.max(0, Math.min(rows - 1, z0));
      const cz1 = Math.max(0, Math.min(rows - 1, z0 + 1));
      const e00 = map.terrain[cz0]?.[cx0]?.elevation ?? 0;
      const e10 = map.terrain[cz0]?.[cx1]?.elevation ?? 0;
      const e01 = map.terrain[cz1]?.[cx0]?.elevation ?? 0;
      const e11 = map.terrain[cz1]?.[cx1]?.elevation ?? 0;
      const fx = gx - x0;
      const fz = gz - z0;
      const e0 = e00 + (e10 - e00) * fx;
      const e1 = e01 + (e11 - e01) * fx;
      return e0 + (e1 - e0) * fz;
    };

    // Create zone fill renderer with terrain elevation sampling
    this.zoneFillRenderer = new ZoneFillRenderer(this.mapGroup, getElevationAt);

    for (const zone of zones) {
      const group = new THREE.Group();
      group.name = `capture-zone-${zone.id}`;

      // Determine objective position (default to center if not specified)
      const objX = zone.objectiveX ?? zone.x;
      const objZ = zone.objectiveZ ?? zone.z;

      // Get terrain elevation at objective position
      const objElevation = getElevationAt(objX, objZ);
      const centerElevation = getElevationAt(zone.x, zone.z);

      // Zone border (rectangular outline) - stays at zone center
      const borderGeometry = new THREE.EdgesGeometry(
        new THREE.PlaneGeometry(zone.width, zone.height)
      );
      const borderMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        depthTest: false,
      });
      const borderMesh = new THREE.LineSegments(borderGeometry, borderMaterial);
      borderMesh.rotation.x = -Math.PI / 2;
      borderMesh.position.set(zone.x, centerElevation + 1.5, zone.z);
      borderMesh.userData.isBorderRing = true;
      borderMesh.renderOrder = 92;
      group.add(borderMesh);

      // FLAG POLE (always present but small if objective is large)
      // Place flag near the objective model
      const poleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 10, 8);
      const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const poleMesh = new THREE.Mesh(poleGeometry, poleMaterial);
      // Offset slightly to NOT be dead center of the building
      const poleOffsetX = zone.objectiveType ? 4 : 0;
      poleMesh.position.set(objX + poleOffsetX, objElevation + 5, objZ);
      poleMesh.castShadow = true;
      group.add(poleMesh);

      // Flag
      const flagGeometry = new THREE.PlaneGeometry(4, 2);
      const flagMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
      flagMesh.position.set(objX + poleOffsetX + 2, objElevation + 9, objZ);
      flagMesh.userData.isFlag = true;
      group.add(flagMesh);

      // STRATEGIC OBJECTIVE MODEL
      if (zone.objectiveType) {
        // Pass location and map for context-aware generation (e.g., avoiding roads)
        const objectiveModel = this.createObjectiveModel(
          zone.objectiveType,
          zone.visualVariant || 0,
          objX,
          objZ,
          map
        );
        objectiveModel.position.set(objX, objElevation, objZ);
        group.add(objectiveModel);
      }

      this.captureZoneMeshes.set(zone.id, group);
      zoneGroup.add(group);

      // Initialize zone in fill renderer
      this.zoneFillRenderer.initializeZone(zone.id, zone.x, zone.z, zone.width, zone.height);
    }

    this.mapGroup.add(zoneGroup);
  }

  /**
   * Create a 3D visual model based on objective type
   */
  private createObjectiveModel(
    type: ObjectiveType,
    variant: number,
    worldX: number = 0,
    worldZ: number = 0,
    map?: GameMap
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `objective-${type}`;

    switch (type) {
      case 'radio_tower':
      case 'communication_tower':
      case 'comms_array': {
        // Lattice tower structure
        const height = type === 'communication_tower' ? 40 : (type === 'comms_array' ? 15 : 25);
        const towerGeo = new THREE.CylinderGeometry(0.5, 2, height, 4);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.y = height / 2;
        group.add(tower);

        // Cross-bracing for detail
        const braceGeo = new THREE.BoxGeometry(0.2, height * 1.1, 0.2);
        for (let i = 0; i < 4; i++) {
          const brace = new THREE.Mesh(braceGeo, towerMat);
          brace.position.y = height / 2;
          brace.rotation.y = (i * Math.PI) / 2;
          brace.rotation.z = i % 2 === 0 ? 0.05 : -0.05;
          group.add(brace);
        }

        if (type === 'comms_array') {
          // Multiple dishes on a platform
          const platformGeo = new THREE.BoxGeometry(10, 1, 10);
          const platform = new THREE.Mesh(platformGeo, towerMat);
          platform.position.y = 0.5;
          group.add(platform);
          for (let i = 0; i < 4; i++) {
            const dishGeo = new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const dishMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
            const dish = new THREE.Mesh(dishGeo, dishMat);
            dish.position.set(i < 2 ? -3 : 3, 1, i % 2 === 0 ? -3 : 3);
            dish.rotation.x = -Math.PI / 4;
            dish.rotation.y = (i * Math.PI) / 2;
            group.add(dish);
          }
        } else {
          // Antennas/Dishes for towers
          const dishGeo = new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
          const dishMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
          const dish = new THREE.Mesh(dishGeo, dishMat);
          dish.position.y = height - 2;
          dish.rotation.x = Math.PI / 4;
          group.add(dish);

          if (type === 'communication_tower' || variant === 0) {
            const dish2 = dish.clone();
            dish2.position.set(1, height - 8, 1);
            dish2.rotation.y = Math.PI;
            group.add(dish2);
          }
        }
        break;
      }

      case 'bunker':
      case 'hq_bunker':
      case 'military_base': {
        const isHQ = type === 'hq_bunker';
        const scale = isHQ ? 1.5 : 1.0;

        if (type === 'military_base') {
          // Watchtower for military base
          const legGeo = new THREE.BoxGeometry(0.5, 12, 0.5);
          const watchMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
          for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(legGeo, watchMat);
            leg.position.set(i < 2 ? -2 : 2, 6, i % 2 === 0 ? -2 : 2);
            group.add(leg);
          }
          const cabinGeo = new THREE.BoxGeometry(5, 3, 5);
          const cabin = new THREE.Mesh(cabinGeo, watchMat);
          cabin.position.y = 13.5;
          group.add(cabin);
        } else {
          // Concrete bunker
          const bunkerGeo = new THREE.BoxGeometry(10 * scale, 4 * scale, 10 * scale);
          const bunkerMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
          const bunker = new THREE.Mesh(bunkerGeo, bunkerMat);
          bunker.position.y = 2 * scale;
          group.add(bunker);

          const roofGeo = new THREE.BoxGeometry(12 * scale, 1 * scale, 12 * scale);
          const roof = new THREE.Mesh(roofGeo, bunkerMat);
          roof.position.y = 4.5 * scale;
          group.add(roof);

          // Details: Slit, Vents, Door
          const detailMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
          const slitGeo = new THREE.BoxGeometry(6 * scale, 0.5 * scale, 1);
          const slit = new THREE.Mesh(slitGeo, detailMat);
          slit.position.set(0, 3 * scale, 5 * scale);
          group.add(slit);

          const ventGeo = new THREE.BoxGeometry(1, 1, 1);
          for (let i = 0; i < 2; i++) {
            const vent = new THREE.Mesh(ventGeo, detailMat);
            vent.position.set(i === 0 ? -4 * scale : 4 * scale, 4.2 * scale, 0);
            group.add(vent);
          }

          if (isHQ) {
            // Comms on top of HQ
            const antennaGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 4);
            const antenna = new THREE.Mesh(antennaGeo, new THREE.MeshStandardMaterial({ color: 0x444444 }));
            antenna.position.set(-3, 8 * scale, -3);
            group.add(antenna);

            const dishGeo = new THREE.SphereGeometry(2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const dish = new THREE.Mesh(dishGeo, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
            dish.position.set(3, 5 * scale, 3);
            dish.rotation.x = -0.5;
            group.add(dish);
          }
        }
        break;
      }

      case 'supply_cache':
      case 'fuel_depot':
      case 'supply_depot': {
        const isDepot = type === 'supply_depot';

        if (type === 'supply_cache') {
          // --- MUNITIONS CACHE / SMALL BASE ---
          // 1. Concrete Bollard Perimeter (20x20m ring)
          const bollardGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
          const bollardMat = new THREE.MeshStandardMaterial({ color: 0x888888 }); // Concrete
          const perimeterSize = 10; // +/- 10m from center
          const spacing = 2; // Every 2m

          for (let x = -perimeterSize; x <= perimeterSize; x += spacing) {
            // Top/Bottom rows
            if (x !== 0) { // Skip gate at center bottom
              [-perimeterSize, perimeterSize].forEach(z => {
                if (z === perimeterSize && Math.abs(x) < 3) return; // Gate opening at z=perimeterSize
                const b = new THREE.Mesh(bollardGeo, bollardMat);
                b.position.set(x, 0.6, z);
                group.add(b);
              });
            }
          }
          for (let z = -perimeterSize; z <= perimeterSize; z += spacing) {
            // Left/Right cols
            [-perimeterSize, perimeterSize].forEach(x => {
              const b = new THREE.Mesh(bollardGeo, bollardMat);
              b.position.set(x, 0.6, z);
              group.add(b);
            });
          }

          // 2. Gate (Barrier Arm)
          const armPillarGeo = new THREE.BoxGeometry(0.5, 1.5, 0.5);
          const armPillar = new THREE.Mesh(armPillarGeo, new THREE.MeshStandardMaterial({ color: 0xffff00 }));
          armPillar.position.set(-3, 0.75, perimeterSize);
          group.add(armPillar);

          const armGeo = new THREE.BoxGeometry(6, 0.2, 0.2);
          const arm = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({ color: 0xff0000 }));
          arm.position.set(0, 1.4, perimeterSize);
          group.add(arm);

          // 3. Command Tent (Central)
          // Main tent body
          const tentGeo = new THREE.CylinderGeometry(0.1, 4, 3, 4, 1, false, Math.PI * 0.25); // Pyramid-ish
          const tentMat = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.9 }); // Olive Drab
          const tent = new THREE.Mesh(tentGeo, tentMat);
          tent.position.y = 1.5;
          tent.rotation.y = Math.PI / 4; // Align with axes
          // Scale to make it rectangular-ish footprint if needed, or just use cone
          tent.scale.set(1.5, 1, 1);
          group.add(tent);

          // Tent entrance
          const tentDoorGeo = new THREE.BoxGeometry(1.5, 2, 2);
          const tentDoor = new THREE.Mesh(tentDoorGeo, new THREE.MeshStandardMaterial({ color: 0x1a240e })); // Darker inner
          tentDoor.position.set(0, 1, 3); // Front
          group.add(tentDoor);

          // 4. Munitions Stacks
          const crateGeo = new THREE.BoxGeometry(1, 1, 1);
          const crateMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d }); // Dark grey ammo boxes

          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              // Stack 1
              const c = new THREE.Mesh(crateGeo, crateMat);
              c.position.set(-6 + i * 1.1, 0.5, -4 + j * 1.1);
              group.add(c);

              // Random 2nd layer
              if (Math.random() > 0.3) {
                const c2 = c.clone();
                c2.position.y += 1;
                group.add(c2);
              }
            }
          }

          // Stack 2 (Fuel drums?)
          const drumGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
          const drumMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 }); // Red
          for (let k = 0; k < 5; k++) {
            const d = new THREE.Mesh(drumGeo, drumMat);
            d.position.set(5 + (Math.random() - 0.5) * 2, 0.6, -3 + (Math.random() - 0.5) * 2);
            group.add(d);
          }

        } else {
          // --- OLD CRATE CLUSTER FALLBACK (Fuel/Supply Depot) ---
          const iterations = isDepot ? 15 : 8;
          for (let i = 0; i < iterations; i++) {
            const crateGeo = new THREE.BoxGeometry(2, 2, 2);
            const crateMat = new THREE.MeshStandardMaterial({ color: i < 4 ? 0x8b4513 : 0x556b2f, roughness: 0.8 });
            const crate = new THREE.Mesh(crateGeo, crateMat);
            crate.position.set(
              (i % 5 - 2) * 2.5 + (Math.random() - 0.5) * 2,
              1,
              Math.floor(i / 5) * 2.5 + (Math.random() - 0.5) * 2
            );
            crate.rotation.y = Math.random() * Math.PI;
            group.add(crate);

            if (isDepot && i % 4 === 0) {
              const topCrate = crate.clone();
              topCrate.position.y += 2;
              group.add(topCrate);
            }
          }
        }
        // Barrels
        const barrelCount = type === 'fuel_depot' ? 12 : (isDepot ? 8 : 4);
        for (let i = 0; i < barrelCount; i++) {
          const barrelGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 8);
          const barrelMat = new THREE.MeshStandardMaterial({ color: type === 'fuel_depot' && i % 3 === 0 ? 0xcc3333 : 0x444444, metalness: 0.5 });
          const barrel = new THREE.Mesh(barrelGeo, barrelMat);
          barrel.position.set(
            (Math.random() - 0.5) * 15,
            1,
            (Math.random() - 0.5) * 15
          );
          group.add(barrel);
        }

        if (isDepot) {
          // Add a simple shelter/tent
          const tentGeo = new THREE.BoxGeometry(8, 4, 12);
          const tentMat = new THREE.MeshStandardMaterial({ color: 0x556b2f });
          const tent = new THREE.Mesh(tentGeo, tentMat);
          tent.position.set(5, 2, -5);
          group.add(tent);

          const tentRoofGeo = new THREE.ConeGeometry(6, 4, 4);
          const tentRoof = new THREE.Mesh(tentRoofGeo, tentMat);
          tentRoof.position.set(5, 5, -5);
          tentRoof.rotation.y = Math.PI / 4;
          group.add(tentRoof);
        }
        break;
      }

      case 'radar_station': {
        // Concrete base
        const baseGeo = new THREE.BoxGeometry(10, 2, 10);
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const base = new THREE.Mesh(baseGeo, concreteMat);
        base.position.y = 1;
        group.add(base);

        // Rotating pillar
        const pillarGeo = new THREE.CylinderGeometry(1, 1.5, 6, 8);
        const pillar = new THREE.Mesh(pillarGeo, concreteMat);
        pillar.position.y = 5;
        group.add(pillar);

        // Radar dish
        const dishGeo = new THREE.CylinderGeometry(6, 6, 0.5, 16);
        const dishMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.y = 8;
        dish.rotation.x = Math.PI / 2.5;
        group.add(dish);

        // Feed horn
        const hornGeo = new THREE.BoxGeometry(0.5, 4, 0.5);
        const horn = new THREE.Mesh(hornGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
        horn.position.set(0, 10, 2);
        horn.rotation.x = -0.5;
        group.add(horn);
        break;
      }

      case 'vehicle_park': {
        const floorGeo = new THREE.PlaneGeometry(20, 20);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.05;
        group.add(floor);

        // Parking bays (lines)
        for (let i = -2; i <= 2; i++) {
          const lineGeo = new THREE.BoxGeometry(0.2, 0.1, 15);
          const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffff00 }));
          line.position.set(i * 4, 0.1, 0);
          group.add(line);

          // Simple vehicle silhouettes
          if (i !== 0) {
            const vBaseGeo = new THREE.BoxGeometry(3, 2, 6);
            const vMat = new THREE.MeshStandardMaterial({ color: 0x2a3d2a });
            const vBase = new THREE.Mesh(vBaseGeo, vMat);
            vBase.position.set(i * 4, 1.1, 0);
            group.add(vBase);
            const vCabGeo = new THREE.BoxGeometry(3, 1.5, 2);
            const vCab = new THREE.Mesh(vCabGeo, vMat);
            vCab.position.set(i * 4, 2.5, 2);
            group.add(vCab);
          }
        }
        break;
      }

      case 'temple_complex': {
        // Stepped pyramid
        for (let i = 0; i < 4; i++) {
          const size = 16 - i * 4;
          const stepGeo = new THREE.BoxGeometry(size, 3, size);
          const stepMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 1.0 });
          const step = new THREE.Mesh(stepGeo, stepMat);
          step.position.y = 1.5 + i * 3;
          group.add(step);

          if (i === 3) {
            // Temple shrine on top
            const shrineGeo = new THREE.BoxGeometry(3, 4, 3);
            const shrine = new THREE.Mesh(shrineGeo, stepMat);
            shrine.position.y = 1.5 + i * 3 + 2;
            group.add(shrine);
          }
        }
        break;
      }

      case 'bio_dome': {
        const researchMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
        const domeGeo = new THREE.SphereGeometry(10, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, researchMat);
        dome.position.y = 0;
        group.add(dome);

        // Wireframe overlay
        const wireGeo = new THREE.SphereGeometry(10.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const wire = new THREE.Mesh(wireGeo, wireMat);
        group.add(wire);

        // Inner greenery
        const groundGeo = new THREE.CircleGeometry(9, 16);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0.2;
        group.add(ground);
        break;
      }

      case 'harvester_rig': {
        const oilMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const baseGeo5 = new THREE.BoxGeometry(10, 2, 10);
        const base5 = new THREE.Mesh(baseGeo5, oilMat);
        base5.position.y = 1;
        group.add(base5);

        const towerGeo3 = new THREE.BoxGeometry(2, 20, 2);
        const tower3 = new THREE.Mesh(towerGeo3, oilMat);
        tower3.position.set(0, 10, 0);
        group.add(tower3);

        const beamGeo3 = new THREE.BoxGeometry(1, 15, 1);
        const beam3 = new THREE.Mesh(beamGeo3, oilMat);
        beam3.position.set(0, 18, 5);
        beam3.rotation.x = Math.PI / 2;
        group.add(beam3);

        const drillGeo = new THREE.CylinderGeometry(0.5, 0.5, 12, 8);
        const drill = new THREE.Mesh(drillGeo, new THREE.MeshStandardMaterial({ color: 0x777777 }));
        drill.position.set(0, 10, 10);
        group.add(drill);
        break;
      }

      case 'orbital_uplink': {
        const height = 60;
        const towerGeo4 = new THREE.CylinderGeometry(0.5, 4, height, 4);
        const towerMat4 = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
        const tower4 = new THREE.Mesh(towerGeo4, towerMat4);
        tower4.position.y = height / 2;
        group.add(tower4);

        const ringGeo = new THREE.TorusGeometry(5, 0.5, 8, 24);
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x4a9eff, emissive: 0x4a9eff, emissiveIntensity: 2 }));
          ring.position.y = 20 + i * 15;
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
        }

        const ballGeo = new THREE.SphereGeometry(3, 16, 16);
        const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 5 }));
        ball.position.y = height;
        group.add(ball);
        break;
      }

      case 'cooling_tower': {
        const segments = 12;
        const towerHeight = 25;
        const bottomRadius = 10;
        const midRadius = 6;
        const topRadius = 8;

        const points = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const y = t * towerHeight;
          const r = t < 0.5
            ? bottomRadius + (midRadius - bottomRadius) * (t / 0.5)
            : midRadius + (topRadius - midRadius) * ((t - 0.5) / 0.5);
          points.push(new THREE.Vector2(r, y));
        }

        const towerGeo5 = new THREE.LatheGeometry(points, 24);
        const towerMat5 = new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide });
        const tower5 = new THREE.Mesh(towerGeo5, towerMat5);
        group.add(tower5);

        // Steam/Vapor (simplified as white cone)
        const steamGeo = new THREE.ConeGeometry(topRadius, 15, 16, 1, true);
        const steamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        const steam = new THREE.Mesh(steamGeo, steamMat);
        steam.position.y = towerHeight + 7.5;
        group.add(steam);
        break;
      }

      case 'grain_silo': {
        const siloHeight = 15;
        const siloGeo = new THREE.CylinderGeometry(4, 4, siloHeight, 12);
        const siloMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        const silo = new THREE.Mesh(siloGeo, siloMat);
        silo.position.y = siloHeight / 2;
        group.add(silo);

        const siloRoofGeo = new THREE.ConeGeometry(4.5, 3, 12);
        const siloRoof = new THREE.Mesh(siloRoofGeo, new THREE.MeshStandardMaterial({ color: 0x884444 }));
        siloRoof.position.y = siloHeight + 1.5;
        group.add(siloRoof);

        // Ladder
        const ladderGeo = new THREE.BoxGeometry(0.1, siloHeight, 0.8);
        const ladder = new THREE.Mesh(ladderGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
        ladder.position.set(4, siloHeight / 2, 0);
        group.add(ladder);
        break;
      }

      case 'windmill':
      case 'wind_farm': {
        // Wind Farm: 5-20 mills
        // const isFarm = type === 'wind_farm'; // Unused
        // "at least 5 mills up to 20"
        const millCount = 5 + Math.floor(Math.random() * 16); // 5 to 20

        const towerMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });

        // Phase 4 Optimization: Collect geometries for merging
        const towerGeometries: THREE.BufferGeometry[] = [];
        const nacelleGeometries: THREE.BufferGeometry[] = [];
        const bladeGeometries: THREE.BufferGeometry[] = [];

        // Distribute mills with collision avoidance
        const placedMills: Array<{ x: number, z: number, r: number, scale: number, rotation: number }> = [];
        const range = 45; // Spread area
        const buffer = 15; // Minimum distance between mills (prevent blade collision)

        for (let i = 0; i < millCount; i++) {
          let bestX = 0, bestZ = 0;
          let valid = false;

          // Try up to 20 times to find a clear spot
          for (let attempt = 0; attempt < 20; attempt++) {
            // Random pos in circle
            const r = Math.random() * range;
            const theta = Math.random() * Math.PI * 2;
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            // Check distance to all other mills
            let overlap = false;
            for (const existing of placedMills) {
              const dx = existing.x - x;
              const dz = existing.z - z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist < buffer) {
                overlap = true;
                break;
              }
            }

            if (!overlap) {
              bestX = x;
              bestZ = z;
              valid = true;
              break;
            }
          }

          // Store placement data
          if (valid) {
            const scale = 0.8 + Math.random() * 0.4;
            const rotation = (Math.random() - 0.5) * 0.5;
            placedMills.push({ x: bestX, z: bestZ, r: buffer, scale, rotation });
          }
        }

        // Phase 4: Create and transform geometries for each mill
        for (const mill of placedMills) {
          const h = 20 * mill.scale;

          // Tower geometry (transformed to world position)
          const towerGeo = new THREE.CylinderGeometry(0.6 * mill.scale, 1.8 * mill.scale, h, 8);
          towerGeo.translate(0, h / 2, 0); // Position at base
          towerGeo.rotateY(mill.rotation); // Apply mill rotation
          towerGeo.translate(mill.x, 0, mill.z); // World position
          towerGeometries.push(towerGeo);

          // Nacelle geometry (at top of tower)
          const nacelleGeo = new THREE.BoxGeometry(2 * mill.scale, 1.5 * mill.scale, 3 * mill.scale);
          nacelleGeo.rotateY(mill.rotation); // Apply mill rotation
          nacelleGeo.translate(mill.x, h, mill.z); // World position at top
          nacelleGeometries.push(nacelleGeo);

          // Blade geometries (3 blades per mill with random rotation)
          const bladeRotation = Math.random() * Math.PI * 2;
          const bladeX = mill.x;
          const bladeY = h;
          const bladeZ = mill.z + 1.5 * mill.scale; // Front of nacelle (local z offset)

          for (let i = 0; i < 3; i++) {
            const bGeo = new THREE.BoxGeometry(0.5 * mill.scale, 12 * mill.scale, 0.2 * mill.scale);
            bGeo.translate(0, 6 * mill.scale, 0); // Offset for rotation anchor

            // Apply blade rotation (each blade at 120 degrees)
            const bladeAngle = bladeRotation + i * (Math.PI * 2 / 3);
            bGeo.rotateZ(bladeAngle);

            // Transform to world space (mill rotation + position)
            // First rotate by mill yaw
            const cosY = Math.cos(mill.rotation);
            const sinY = Math.sin(mill.rotation);
            const localZ = 1.5 * mill.scale;
            const worldOffsetX = -sinY * localZ;
            const worldOffsetZ = cosY * localZ;

            bGeo.rotateY(mill.rotation); // Apply mill rotation
            bGeo.translate(bladeX + worldOffsetX, bladeY, bladeZ - localZ + worldOffsetZ); // World position
            bladeGeometries.push(bGeo);
          }
        }

        // Phase 4: Merge all tower geometries into one mesh
        if (towerGeometries.length > 0) {
          const mergedTowers = mergeGeometries(towerGeometries, false);
          if (mergedTowers) {
            const towerMesh = new THREE.Mesh(mergedTowers, towerMat);
            towerMesh.name = 'merged-windmill-towers';
            towerMesh.castShadow = true;
            group.add(towerMesh);
            towerGeometries.forEach(g => g.dispose());
          }
        }

        // Phase 4: Merge all nacelle geometries into one mesh
        if (nacelleGeometries.length > 0) {
          const mergedNacelles = mergeGeometries(nacelleGeometries, false);
          if (mergedNacelles) {
            const nacelleMesh = new THREE.Mesh(mergedNacelles, towerMat);
            nacelleMesh.name = 'merged-windmill-nacelles';
            nacelleMesh.castShadow = true;
            group.add(nacelleMesh);
            nacelleGeometries.forEach(g => g.dispose());
          }
        }

        // Phase 4: Merge all blade geometries into one mesh
        if (bladeGeometries.length > 0) {
          const mergedBlades = mergeGeometries(bladeGeometries, false);
          if (mergedBlades) {
            const bladeMesh = new THREE.Mesh(mergedBlades, bladeMat);
            bladeMesh.name = 'merged-windmill-blades';
            bladeMesh.castShadow = true;
            group.add(bladeMesh);
            bladeGeometries.forEach(g => g.dispose());
          }
        }
        break;
      }

      case 'oil_field': {
        // Pumpjack
        const baseGeo2 = new THREE.BoxGeometry(4, 1, 12);
        const oilMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const base2 = new THREE.Mesh(baseGeo2, oilMat);
        base2.position.y = 0.5;
        group.add(base2);

        const frameGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 4);
        for (let i = 0; i < 2; i++) {
          const frame = new THREE.Mesh(frameGeo, oilMat);
          frame.position.set(i === 0 ? -1.5 : 1.5, 4, 0);
          frame.rotation.z = i === 0 ? -0.2 : 0.2;
          group.add(frame);
        }

        const beamGeo = new THREE.BoxGeometry(1, 1, 15);
        const beam = new THREE.Mesh(beamGeo, oilMat);
        beam.position.y = 8;
        beam.rotation.x = -0.1;
        group.add(beam);

        const headGeo = new THREE.SphereGeometry(2, 8, 8, 0, Math.PI, 0, Math.PI);
        const head = new THREE.Mesh(headGeo, oilMat);
        head.position.set(0, 8, 7.5);
        head.rotation.y = Math.PI / 2;
        group.add(head);

        // Concrete tank nearby
        const tankGeo = new THREE.CylinderGeometry(4, 4, 5, 12);
        const tank = new THREE.Mesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0x777777 }));
        tank.position.set(8, 2.5, -5);
        group.add(tank);
        break;
      }

      case 'research_station': {
        // Observatory dome
        const baseGeo3 = new THREE.CylinderGeometry(6, 6, 4, 16);
        const researchMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const base3 = new THREE.Mesh(baseGeo3, researchMat);
        base3.position.y = 2;
        group.add(base3);

        const domeGeo = new THREE.SphereGeometry(6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, researchMat);
        dome.position.y = 4;
        group.add(dome);

        const slitGeo2 = new THREE.BoxGeometry(1.5, 8, 1);
        const slitMat2 = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const slit2 = new THREE.Mesh(slitGeo2, slitMat2);
        slit2.position.set(0, 7, 5);
        slit2.rotation.x = -0.5;
        group.add(slit2);

        // Satellite dish
        const dishGeo2 = new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const dish2 = new THREE.Mesh(dishGeo2, researchMat);
        dish2.position.set(-8, 3, -8);
        dish2.rotation.x = -0.8;
        group.add(dish2);
        break;
      }

      case 'mine':
      case 'mining_operation': {
        // Mine entrance structure
        const beamMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
        const beamGeo2 = new THREE.BoxGeometry(0.5, 6, 0.5);
        for (let i = 0; i < 4; i++) {
          const side = new THREE.Mesh(beamGeo2, beamMat);
          side.position.set(i < 2 ? -3 : 3, 3, i % 2 === 0 ? -2 : 2);
          group.add(side);
        }
        const crossGeo = new THREE.BoxGeometry(7, 0.5, 0.5);
        const cross1 = new THREE.Mesh(crossGeo, beamMat);
        cross1.position.set(0, 6, -2);
        group.add(cross1);
        const cross2 = cross1.clone();
        cross2.position.set(0, 6, 2);
        group.add(cross2);

        // Entrance plane (darkness)
        const darkGeo = new THREE.PlaneGeometry(5.5, 5.5);
        const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const dark = new THREE.Mesh(darkGeo, darkMat);
        dark.position.set(0, 3, -1.8);
        group.add(dark);

        // Mining equipment/carts
        const cartGeo = new THREE.BoxGeometry(2, 1.5, 3);
        const cartMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const cart = new THREE.Mesh(cartGeo, cartMat);
        cart.position.set(5, 0.75, 5);
        group.add(cart);
        break;
      }

      case 'logging_camp': {
        // Stacks of logs
        const logMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
        const logGeo = new THREE.CylinderGeometry(0.8, 0.8, 8, 8);
        logGeo.rotateZ(Math.PI / 2);

        for (let stack = 0; stack < 3; stack++) {
          const stackX = (stack - 1) * 8;
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3 - i; j++) {
              const log = new THREE.Mesh(logGeo, logMat);
              log.position.set(stackX, 0.8 + i * 1.5, (j - (3 - i) / 2) * 1.6);
              log.castShadow = true;
              group.add(log);
            }
          }
        }

        // Sawmill shelter
        const shelterGeo = new THREE.BoxGeometry(6, 4, 8);
        const shelterMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
        const shelter = new THREE.Mesh(shelterGeo, shelterMat);
        shelter.position.set(0, 2, -8);
        group.add(shelter);
        break;
      }

      case 'indigenous_settlement': {
        // Cluster of huts
        const hutMat = new THREE.MeshStandardMaterial({ color: 0xc2b280 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });

        const hutGeo = new THREE.CylinderGeometry(3, 3, 3, 8);
        const roofGeo = new THREE.ConeGeometry(3.5, 2, 8);

        const positions: [number, number][] = [[0, 0], [6, 4], [-5, 5], [4, -6], [-4, -4]];

        for (const pos of positions) {
          const x = pos[0];
          const z = pos[1];
          const hut = new THREE.Mesh(hutGeo, hutMat);
          hut.position.set(x, 1.5, z);
          hut.castShadow = true;
          group.add(hut);

          const roof = new THREE.Mesh(roofGeo, roofMat);
          roof.position.set(x, 4, z);
          roof.castShadow = true;
          group.add(roof);
        }
        break;
      }

      case 'observation_post': {
        // Tall wooden tower
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });

        // Legs
        const legGeo = new THREE.BoxGeometry(0.5, 12, 0.5);
        for (let x of [-2, 2]) {
          for (let z of [-2, 2]) {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(x, 6, z);
            // Tapering
            leg.rotation.z = x > 0 ? 0.1 : -0.1;
            leg.rotation.x = z > 0 ? 0.1 : -0.1;
            group.add(leg);
          }
        }

        // Platform
        const platGeo = new THREE.BoxGeometry(6, 0.5, 6);
        const plat = new THREE.Mesh(platGeo, woodMat);
        plat.position.y = 12;
        group.add(plat);

        // Roof
        const roofGeo = new THREE.ConeGeometry(4, 2, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(roofGeo, woodMat);
        roof.position.y = 14;
        group.add(roof);
        break;
      }

      case 'water_well': {
        // Stone well
        const wellGeo = new THREE.CylinderGeometry(2, 2, 1.5, 16);
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const well = new THREE.Mesh(wellGeo, stoneMat);
        well.position.y = 0.75;
        group.add(well);

        // Water surface
        const waterGeo = new THREE.CircleGeometry(1.8, 16);
        const waterMat = new THREE.MeshBasicMaterial({ color: 0x4444ff });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = 1;
        group.add(water);

        // Roof structure
        const postGeo = new THREE.BoxGeometry(0.3, 4, 0.3);
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });

        const leftPost = new THREE.Mesh(postGeo, woodMat);
        leftPost.position.set(-2, 2, 0);
        group.add(leftPost);

        const rightPost = new THREE.Mesh(postGeo, woodMat);
        rightPost.position.set(2, 2, 0);
        group.add(rightPost);

        const roofGeo = new THREE.ConeGeometry(3, 1.5, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0xa52a2a }));
        roof.position.y = 4.5;
        group.add(roof);
        break;
      }

      case 'ski_resort': {
        // Large lodge
        const lodgeGeo = new THREE.BoxGeometry(12, 6, 8);
        const lodgeMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
        const lodge = new THREE.Mesh(lodgeGeo, lodgeMat);
        lodge.position.y = 3;
        group.add(lodge);

        // Steep roof
        // Used simpler Cone for now
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee }); // Snowy roof

        const simpleRoofGeo = new THREE.ConeGeometry(9, 6, 4);
        simpleRoofGeo.rotateY(Math.PI / 4); // Align to box
        simpleRoofGeo.scale(1.2, 1, 0.8); // Make it oblong
        const simpleRoof = new THREE.Mesh(simpleRoofGeo, roofMat);
        simpleRoof.position.y = 9;
        group.add(simpleRoof);
        break;
      }

      case 'rail_junction': {
        // Tracks
        const trackGeo = new THREE.BoxGeometry(20, 0.2, 1.5);
        const tieGeo = new THREE.BoxGeometry(0.8, 0.3, 3);
        const railMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const tieMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });

        // Two crossing tracks
        for (let r = 0; r < 2; r++) {
          const trackGroup = new THREE.Group();
          trackGroup.rotation.y = r * Math.PI / 2;

          // Rails
          const rail1 = new THREE.Mesh(trackGeo, railMat);
          rail1.position.z = -0.6;
          trackGroup.add(rail1);
          const rail2 = new THREE.Mesh(trackGeo, railMat);
          rail2.position.z = 0.6;
          trackGroup.add(rail2);

          // Ties
          for (let i = -8; i <= 8; i++) {
            const tie = new THREE.Mesh(tieGeo, tieMat);
            tie.position.x = i * 1.2;
            trackGroup.add(tie);
          }
          group.add(trackGroup);
        }

        // Signal Box
        const cabinGeo = new THREE.BoxGeometry(3, 4, 3);
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(4, 2, 4);
        group.add(cabin);
        break;
      }

      case 'processing_plant': {
        // Factory with tanks
        const mainGeo = new THREE.BoxGeometry(8, 6, 12);
        const factoryMat = new THREE.MeshStandardMaterial({ color: 0x707070 });
        const main = new THREE.Mesh(mainGeo, factoryMat);
        main.position.y = 3;
        group.add(main);

        // Smokestack
        const stackGeo = new THREE.CylinderGeometry(1, 1.5, 12, 8);
        const stack = new THREE.Mesh(stackGeo, factoryMat);
        stack.position.set(2, 6, 3);
        group.add(stack);

        // Large Tanks
        const tankGeo = new THREE.CylinderGeometry(2.5, 2.5, 5, 12);
        const tankMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        for (let i = 0; i < 2; i++) {
          const tank = new THREE.Mesh(tankGeo, tankMat);
          tank.position.set(-6, 2.5, i * 6 - 3);
          group.add(tank);
        }
        break;
      }

      case 'irrigation_station': {
        // Pump house
        const houseGeo = new THREE.BoxGeometry(5, 3, 5);
        const houseMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const house = new THREE.Mesh(houseGeo, houseMat);
        house.position.y = 1.5;
        group.add(house);

        // Pipes
        const pipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 10, 8);
        pipeGeo.rotateZ(Math.PI / 2);
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const pipe = new THREE.Mesh(pipeGeo, pipeMat);
        pipe.position.set(5, 0.5, 0);
        group.add(pipe);

        // Sprinkler/Pivot point
        const pivotGeo = new THREE.CylinderGeometry(0.8, 0.8, 3, 8);
        const pivot = new THREE.Mesh(pivotGeo, pipeMat);
        pivot.position.set(10, 1.5, 0);
        group.add(pivot);
        break;
      }

      case 'market_town': {
        // Stalls
        const tableGeo = new THREE.BoxGeometry(3, 1, 2);
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
        const awningGeo = new THREE.BoxGeometry(3.2, 0.2, 2.2);
        const awningMat1 = new THREE.MeshStandardMaterial({ color: 0xcc3333 });
        const awningMat2 = new THREE.MeshStandardMaterial({ color: 0x3333cc });

        for (let i = 0; i < 4; i++) {
          const stallGroup = new THREE.Group();

          const table = new THREE.Mesh(tableGeo, tableMat);
          table.position.y = 0.5;
          stallGroup.add(table);

          // Awning posts
          const postGeo = new THREE.BoxGeometry(0.1, 2.5, 0.1);
          for (let x of [-1.4, 1.4]) {
            for (let z of [-0.9, 0.9]) {
              const post = new THREE.Mesh(postGeo, tableMat);
              post.position.set(x, 1.25, z);
              stallGroup.add(post);
            }
          }

          const awning = new THREE.Mesh(awningGeo, i % 2 === 0 ? awningMat1 : awningMat2);
          awning.position.y = 2.5;
          stallGroup.add(awning);

          stallGroup.position.set(i < 2 ? -4 : 4, 0, i % 2 === 0 ? -4 : 4);
          // Random rotation
          stallGroup.rotation.y = (i * Math.PI) / 4;
          group.add(stallGroup);
        }
        break;
      }

      case 'city_district': {
        // Dense block of tall buildings
        const buildMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const windowMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });

        // Phase 4 Optimization: Collect geometries for merging
        const buildingGeometries: THREE.BufferGeometry[] = [];
        const windowGeometries: THREE.BufferGeometry[] = [];

        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            // Varied heights
            const h = 5 + Math.random() * 10;
            const w = 3 + Math.random();
            const d = 3 + Math.random();

            // Building body geometry (transformed to world position)
            const bGeo = new THREE.BoxGeometry(w, h, d);
            bGeo.translate((i - 1) * 5, h / 2, (j - 1) * 5);
            buildingGeometries.push(bGeo);

            // Window strip geometry (only if visible - randomly lit)
            if (Math.random() > 0.5) {
              const winGeo = new THREE.BoxGeometry(w + 0.1, h * 0.5, d + 0.1);
              winGeo.translate((i - 1) * 5, h * 0.6, (j - 1) * 5);
              windowGeometries.push(winGeo);
            }
          }
        }

        // Phase 4: Merge all building body geometries into one mesh
        if (buildingGeometries.length > 0) {
          const mergedBuildings = mergeGeometries(buildingGeometries, false);
          if (mergedBuildings) {
            const buildingMesh = new THREE.Mesh(mergedBuildings, buildMat);
            buildingMesh.name = 'merged-city-buildings';
            buildingMesh.castShadow = true;
            group.add(buildingMesh);
            buildingGeometries.forEach(g => g.dispose());
          }
        }

        // Phase 4: Merge all window geometries into one mesh
        if (windowGeometries.length > 0) {
          const mergedWindows = mergeGeometries(windowGeometries, false);
          if (mergedWindows) {
            const windowMesh = new THREE.Mesh(mergedWindows, windowMat);
            windowMesh.name = 'merged-city-windows';
            group.add(windowMesh);
            windowGeometries.forEach(g => g.dispose());
          }
        }
        // Small park in center? No, just buildings for now
        break;
      }

      case 'hamlet':
      case 'village':
      case 'town':
      case 'city': {
        // --- Configuration based on type ---
        let minBuildings = 6;
        let maxBuildings = 8;
        let radius = 25;
        let baseScale = 0.5; // Reduced by 50%
        let buildingColor = 0xc9b896; // Cottage
        let roofColor = 0x8b4513;     // Thatch/wood
        let isUrban = false;

        if (type === 'village') {
          minBuildings = 8;
          maxBuildings = 12;
          radius = 35;
          baseScale = 0.6; // Reduced
          buildingColor = 0xd4c4a8; // Plaster/Stone
        } else if (type === 'town') {
          minBuildings = 12;
          maxBuildings = 16;
          radius = 50;
          baseScale = 0.7; // Reduced
          buildingColor = 0xd4c4a8; // Stone
          roofColor = 0x555555;     // Slate
        } else if (type === 'city') {
          minBuildings = 16;
          maxBuildings = 20;
          radius = 65;
          baseScale = 0.75; // Reduced
          buildingColor = 0x888888; // Concrete/Brick
          isUrban = true;
        }

        const count = minBuildings + Math.floor(Math.random() * (maxBuildings - minBuildings + 1));

        const wallMat = new THREE.MeshStandardMaterial({ color: buildingColor });
        const roofMat = new THREE.MeshStandardMaterial({ color: roofColor });
        const windowMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 }); // Lit windows for city

        const buildings: { x: number, z: number, r: number }[] = [];

        for (let i = 0; i < count; i++) {
          // Attempt to place building without overlap
          let bestX = 0, bestZ = 0, bestR = 0;
          let valid = false;

          // Width/Depth for collision check
          // Generate dimensions
          const isTall = isUrban && Math.random() > 0.3;
          let w = (8 + Math.random() * 6) * baseScale;
          let d = (8 + Math.random() * 6) * baseScale;
          let h = (isTall ? 20 + Math.random() * 30 : 8 + Math.random() * 8) * baseScale;

          if (!isUrban && Math.random() < 0.3) {
            // L-shape or irregular? Simplified as box for now, maybe add wings later
            // Just make some squat and wide
            w *= 1.5;
          }

          // Simple rejection sampling
          for (let attempt = 0; attempt < 20; attempt++) {
            const r = Math.random() * radius * Math.sqrt(Math.random()); // Uniform-ish distribution in circle
            const theta = Math.random() * Math.PI * 2;
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const size = Math.max(w, d);

            // Check collision with existing
            let overlap = false;
            for (const b of buildings) {
              const dx = b.x - x;
              const dz = b.z - z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist < (b.r + size * 0.7)) { // Approximate radius check
                overlap = true;
                break;
              }
            }

            // Check Map Obstacles (Rivers, Roads)
            if (!overlap && map) {
              const absX = worldX + x;
              const absZ = worldZ + z;

              if (map.waterBodies) {
                for (const wb of map.waterBodies) {
                  if (wb.type === 'river' && wb.points) {
                    for (let k = 0; k < wb.points.length - 1; k++) {
                      const p1 = wb.points[k]!;
                      const dx = absX - p1.x;
                      const dz = absZ - p1.z;
                      const riverWidthHalf = (wb.width || 15) / 2;
                      if (dx * dx + dz * dz < (riverWidthHalf + size + 5) ** 2) {
                        overlap = true; break;
                      }
                    }
                  }
                  if (overlap) break;
                }
              }

              if (!overlap && map.roads) {
                for (const road of map.roads) {
                  for (let k = 0; k < road.points.length - 1; k++) {
                    const p1 = road.points[k]!;
                    const dx = absX - p1.x;
                    const dz = absZ - p1.z;
                    if (dx * dx + dz * dz < (8 + size + 2) ** 2) {
                      overlap = true; break;
                    }
                  }
                  if (overlap) break;
                }
              }
            }

            if (!overlap) {
              bestX = x;
              bestZ = z;
              bestR = size / 2; // Approximate collision radius
              valid = true;
              break;
            }
          }

          if (valid) {
            buildings.push({ x: bestX, z: bestZ, r: bestR });

            // Create Mesh
            const bGroup = new THREE.Group();
            bGroup.position.set(bestX, 0, bestZ);
            bGroup.rotation.y = Math.random() * Math.PI * 2; // Random orientation

            const bGeo = new THREE.BoxGeometry(w, h, d);
            const b = new THREE.Mesh(bGeo, wallMat);
            b.position.y = h / 2;
            b.castShadow = true;
            bGroup.add(b);

            // Roof (if not urban/modern tall building)
            if (!isTall) {
              const roofH = Math.min(w, d) * 0.5;
              const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.75, roofH, 4);
              roofGeo.rotateY(Math.PI / 4);
              const roof = new THREE.Mesh(roofGeo, roofMat);
              roof.position.y = h + roofH / 2;
              bGroup.add(roof);
            } else {
              // Flat roof detail
              const rimGeo = new THREE.BoxGeometry(w * 0.9, 1, d * 0.9);
              const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
              rim.position.y = h + 0.5;
              bGroup.add(rim);

              // Windows
              if (Math.random() > 0.4) {
                const winGeo = new THREE.BoxGeometry(w + 0.2, h * 0.7, d + 0.2);
                const win = new THREE.Mesh(winGeo, windowMat);
                win.position.y = h * 0.5;
                bGroup.add(win);
              }
            }

            group.add(bGroup);
          }
        }
        break;
      }

      default:
        // Generic "Objective" Marker for others
        const genericHeight = 8;
        const baseGeo4 = new THREE.BoxGeometry(4, genericHeight, 4);
        const baseMat4 = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const base4 = new THREE.Mesh(baseGeo4, baseMat4);
        base4.position.y = genericHeight / 2;
        group.add(base4);
        break;
    }

    return group;
  }

  private renderResupplyPoints(resupplyPoints: ResupplyPoint[], map: GameMap): void {
    const resupplyGroup = new THREE.Group();
    resupplyGroup.name = 'resupply-points';

    // Helper to get elevation at world position
    const rows = map.terrain.length;
    const cols = map.terrain[0]?.length ?? 0;
    const cellSizeX = map.width / cols;
    const cellSizeZ = map.height / rows;

    const getElevationAt = (worldX: number, worldZ: number): number => {
      const gx = (worldX + map.width / 2) / cellSizeX;
      const gz = (worldZ + map.height / 2) / cellSizeZ;
      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const cx0 = Math.max(0, Math.min(cols - 1, x0));
      const cx1 = Math.max(0, Math.min(cols - 1, x0 + 1));
      const cz0 = Math.max(0, Math.min(rows - 1, z0));
      const cz1 = Math.max(0, Math.min(rows - 1, z0 + 1));
      const e00 = map.terrain[cz0]?.[cx0]?.elevation ?? 0;
      const e10 = map.terrain[cz0]?.[cx1]?.elevation ?? 0;
      const e01 = map.terrain[cz1]?.[cx0]?.elevation ?? 0;
      const e11 = map.terrain[cz1]?.[cx1]?.elevation ?? 0;
      const fx = gx - x0;
      const fz = gz - z0;
      const e0 = e00 + (e10 - e00) * fx;
      const e1 = e01 + (e11 - e01) * fx;
      return e0 + (e1 - e0) * fz;
    };

    const heightOffset = 0.5; // Height above terrain

    for (const point of resupplyPoints) {
      const group = new THREE.Group();
      group.name = `resupply-point-${point.id}`;

      const teamColor = point.team === 'player' ? 0x4a9eff : 0xff4a4a;
      const radius = point.radius;

      // Arrow dimensions - larger for better visibility at map edge
      const arrowLength = radius * 2.5;
      const arrowWidth = radius * 1.0;
      const arrowHeadLength = radius * 0.8;
      const arrowHeadWidth = radius * 1.5;

      // Offset the arrow base outside the map edge
      // Player (bottom): arrow starts below the map edge, pointing up (+Z)
      // Enemy (top): arrow starts above the map edge, pointing down (-Z)
      const outsideOffset = radius * 0.5;
      const baseZ = point.team === 'player'
        ? point.z - outsideOffset
        : point.z + outsideOffset;

      // Arrow shape drawn pointing toward +Z (up on map)
      // Shape drawn in X-Y plane, then rotated to X-Z plane
      const arrowShape = new THREE.Shape();
      // Draw arrow pointing in -Y direction (becomes +Z after rotateX)
      arrowShape.moveTo(-arrowWidth / 2, 0);
      arrowShape.lineTo(-arrowWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(-arrowHeadWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(0, -arrowLength); // Arrow tip
      arrowShape.lineTo(arrowHeadWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(arrowWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(arrowWidth / 2, 0);
      arrowShape.closePath();

      const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
      arrowGeometry.rotateX(-Math.PI / 2);
      // Rotate to match direction (direction 0 = +Z, direction PI = -Z)
      arrowGeometry.rotateY(-point.direction);

      const arrowMaterial = new THREE.MeshBasicMaterial({
        color: teamColor,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });

      const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
      const arrowHeight = getElevationAt(point.x, baseZ) + heightOffset;
      arrowMesh.position.set(point.x, arrowHeight, baseZ);
      arrowMesh.renderOrder = 95;
      group.add(arrowMesh);

      // Arrow border outline
      const borderPoints: THREE.Vector3[] = [
        new THREE.Vector3(-arrowWidth / 2, 0, 0),
        new THREE.Vector3(-arrowWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(-arrowHeadWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(0, 0, arrowLength), // Arrow tip
        new THREE.Vector3(arrowHeadWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(arrowWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(arrowWidth / 2, 0, 0),
        new THREE.Vector3(-arrowWidth / 2, 0, 0),
      ];

      const borderGeometry = new THREE.BufferGeometry().setFromPoints(borderPoints);
      const borderMaterial = new THREE.LineBasicMaterial({
        color: teamColor,
        linewidth: 2,
        depthWrite: false,
        depthTest: false,
      });
      const border = new THREE.Line(borderGeometry, borderMaterial);
      const borderHeight = getElevationAt(point.x, baseZ) + heightOffset + 0.1;
      border.position.set(point.x, borderHeight, baseZ);
      border.rotation.y = -point.direction;
      border.renderOrder = 96;
      group.add(border);

      // Add small circle at arrow base to show spawn point
      const circleGeometry = new THREE.CircleGeometry(radius * 0.35, 16);
      circleGeometry.rotateX(-Math.PI / 2);
      const circleMaterial = new THREE.MeshBasicMaterial({
        color: teamColor,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
      const circleHeight = getElevationAt(point.x, baseZ) + heightOffset + 0.05;
      circleMesh.position.set(point.x, circleHeight, baseZ);
      circleMesh.renderOrder = 97;
      group.add(circleMesh);

      resupplyGroup.add(group);
    }

    this.mapGroup.add(resupplyGroup);
  }

  private renderForestTrees(map: GameMap): void {
    const treeGroup = new THREE.Group();
    treeGroup.name = 'trees';

    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;

    // Calculate actual cell size from map dimensions and grid size
    const cellSize = map.width / cols;

    // Adaptive tree spacing based on map size
    const mapSize = Math.max(map.width, map.height);

    // Use seeded random for consistent tree placement
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    // First pass: calculate distance to forest edge for each forest cell
    const forestEdgeDistance: number[][] = [];
    for (let z = 0; z < rows; z++) {
      forestEdgeDistance[z] = [];
      for (let x = 0; x < cols; x++) {
        const cell = map.terrain[z]?.[x];
        if (cell?.type === 'forest') {
          // Find minimum distance to a non-forest cell
          let minDist = Infinity;
          const searchRadius = 8; // Check 8 cells in each direction

          for (let dz = -searchRadius; dz <= searchRadius; dz++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
              const nz = z + dz;
              const nx = x + dx;
              if (nz >= 0 && nz < rows && nx >= 0 && nx < cols) {
                const neighbor = map.terrain[nz]?.[nx];
                if (neighbor?.type !== 'forest') {
                  const dist = Math.sqrt(dx * dx + dz * dz);
                  minDist = Math.min(minDist, dist);
                }
              }
            }
          }
          forestEdgeDistance[z]![x] = minDist;
        } else {
          forestEdgeDistance[z]![x] = 0;
        }
      }
    }

    // Second pass: place trees with density based on edge distance
    const treePositions: { x: number; z: number; elevation: number; scale: number; rotation: number }[] = [];

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const cell = map.terrain[z]?.[x];
        if (cell?.type !== 'forest') continue;

        const edgeDist = forestEdgeDistance[z]?.[x] ?? 0;

        // Calculate density based on distance to edge
        // - Edge (dist < 1): 15% chance per cell
        // - Mid (dist 1-3): 40% chance per cell
        // - Center (dist > 3): 70% chance per cell
        let baseDensity: number;
        if (edgeDist < 1) {
          baseDensity = 0.15;
        } else if (edgeDist < 3) {
          // Smooth transition from edge to center
          const t = (edgeDist - 1) / 2;
          baseDensity = 0.15 + t * 0.25; // 15% to 40%
        } else {
          // Smooth transition to center
          const t = Math.min((edgeDist - 3) / 3, 1.0);
          baseDensity = 0.40 + t * 0.30; // 40% to 70%
        }

        // Add noise for patches of varied density
        const seed = z * cols + x;
        const densityNoise = seededRandom(seed + 1000) * 0.3 - 0.15; // ±15%
        const finalDensity = Math.max(0.05, Math.min(0.95, baseDensity + densityNoise));

        // Randomly place 1-3 trees per cell based on density
        const maxTreesPerCell = edgeDist < 1 ? 1 : edgeDist < 3 ? 2 : 3;
        const treesToPlace = Math.floor(seededRandom(seed + 2000) * maxTreesPerCell) + 1;

        for (let t = 0; t < treesToPlace; t++) {
          // Check density probability
          if (seededRandom(seed + 3000 + t * 100) > finalDensity) continue;

          // Random position within cell (not grid-aligned)
          const offsetX = (seededRandom(seed + 4000 + t) - 0.5) * cellSize;
          const offsetZ = (seededRandom(seed + 5000 + t) - 0.5) * cellSize;

          const worldX = x * cellSize - map.width / 2 + cellSize / 2 + offsetX;
          const worldZ = z * cellSize - map.height / 2 + cellSize / 2 + offsetZ;

          // Scale trees larger for bigger maps and vary size
          const baseScale = mapSize > 1000 ? 2.0 : 1.0;
          // Trees at edges tend to be slightly smaller
          const edgeScaleFactor = edgeDist < 2 ? 0.7 + edgeDist * 0.15 : 1.0;
          const scale = baseScale * edgeScaleFactor * (0.6 + seededRandom(seed + 6000 + t) * 0.7);
          const rotation = seededRandom(seed + 7000 + t) * Math.PI * 2;

          treePositions.push({ x: worldX, z: worldZ, elevation: cell.elevation, scale, rotation });
        }
      }
    }

    if (treePositions.length === 0) {
      return;
    }

    // Tree geometry (shared, lower poly for performance)
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 3, 6);
    const foliageGeometry = new THREE.ConeGeometry(2, 5, 6);

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2a5a2a });

    // Chunk trees for frustum culling
    // Divide map into regions so off-screen trees can be culled
    const TREE_CHUNK_SIZE = map.width / 8; // 8x8 grid of tree chunks
    const numChunks = 8;

    // Group trees by chunk
    const treeChunks: Map<string, typeof treePositions> = new Map();
    for (const tree of treePositions) {
      const chunkX = Math.floor((tree.x + map.width / 2) / TREE_CHUNK_SIZE);
      const chunkZ = Math.floor((tree.z + map.height / 2) / TREE_CHUNK_SIZE);
      const chunkKey = `${chunkX}_${chunkZ}`;

      if (!treeChunks.has(chunkKey)) {
        treeChunks.set(chunkKey, []);
      }
      treeChunks.get(chunkKey)!.push(tree);
    }

    // Create instanced meshes per chunk
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (const [chunkKey, chunkTrees] of treeChunks.entries()) {
      if (chunkTrees.length === 0) continue;

      // Create instanced meshes for this chunk
      const trunkInstanced = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, chunkTrees.length);
      const foliageInstanced = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, chunkTrees.length);

      trunkInstanced.castShadow = true;
      foliageInstanced.castShadow = true;
      trunkInstanced.frustumCulled = true;
      foliageInstanced.frustumCulled = true;

      for (let i = 0; i < chunkTrees.length; i++) {
        const tree = chunkTrees[i]!;

        // Trunk transform
        position.set(tree.x, tree.elevation + 1.5 * tree.scale, tree.z);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.rotation);
        scale.setScalar(tree.scale);
        matrix.compose(position, quaternion, scale);
        trunkInstanced.setMatrixAt(i, matrix);

        // Foliage transform
        position.set(tree.x, tree.elevation + 5.5 * tree.scale, tree.z);
        matrix.compose(position, quaternion, scale);
        foliageInstanced.setMatrixAt(i, matrix);
      }

      trunkInstanced.instanceMatrix.needsUpdate = true;
      foliageInstanced.instanceMatrix.needsUpdate = true;

      treeGroup.add(trunkInstanced);
      treeGroup.add(foliageInstanced);
    }

    this.mapGroup.add(treeGroup);
  }

  // Update capture zone visuals based on ownership
  updateCaptureZone(zoneId: string, owner: 'neutral' | 'player' | 'enemy', _progress: number, isContested = false): void {
    const group = this.captureZoneMeshes.get(zoneId);
    if (!group) return;

    const ringMesh = group.children[0] as THREE.Mesh; // Border ring
    const flagMesh = group.children.find(c => c.userData.isFlag) as THREE.Mesh;

    // Mark border ring as contested for pulsing animation
    if (ringMesh?.userData.isBorderRing && ringMesh.material instanceof THREE.MeshBasicMaterial) {
      ringMesh.userData.isContested = isContested;

      // Update ring color based on owner
      let ringColor: number;
      switch (owner) {
        case 'player':
          ringColor = 0x4a9eff;
          break;
        case 'enemy':
          ringColor = 0xff4a4a;
          break;
        default:
          ringColor = 0xffffff;
      }
      ringMesh.material.color.setHex(ringColor);

      // Reset to normal opacity when not contested
      if (!isContested) {
        ringMesh.material.opacity = 0.6;
      }
    }

    if (flagMesh?.material instanceof THREE.MeshBasicMaterial) {
      let flagColor: number;
      switch (owner) {
        case 'player':
          flagColor = 0x4a9eff;
          break;
        case 'enemy':
          flagColor = 0xff4a4a;
          break;
        default:
          flagColor = 0xffffff;
      }
      flagMesh.material.color.setHex(flagColor);
    }
  }

  /**
   * Update zone fill visualization with unit entries
   */
  updateZoneFill(zoneId: string, entries: FillEntry[], dt: number): void {
    if (!this.zoneFillRenderer) {
      console.warn('MapRenderer: zoneFillRenderer not initialized');
      return;
    }
    this.zoneFillRenderer.updateZone(zoneId, entries, dt);
  }

  /**
   * Get fill state for a zone
   */
  getZoneFillState(zoneId: string): { playerPercent: number; enemyPercent: number; isFullyFilled: boolean; isCaptured: boolean; capturedBy: 'player' | 'enemy' | null } | null {
    return this.zoneFillRenderer?.getZoneFillState(zoneId) ?? null;
  }

  getMapGroup(): THREE.Group {
    return this.mapGroup;
  }

  /**
   * Update animations (border pulsing, etc.)
   */
  update(dt: number): void {
    this.animationTime += dt;

    // Animate border rings for contested zones
    this.captureZoneMeshes.forEach((group) => {
      const ringMesh = group.children.find(child => child.userData.isBorderRing) as THREE.Mesh | undefined;
      if (ringMesh && ringMesh.userData.isContested) {
        // Pulsing effect: oscillate opacity between 0.3 and 1.0
        const pulseSpeed = 3; // Hz
        const opacity = 0.5 + 0.5 * Math.sin(this.animationTime * pulseSpeed * Math.PI * 2);
        (ringMesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      }
    });
  }

  dispose(): void {
    // Dispose of normal map texture
    if (this.materials.ground.normalMap) {
      this.materials.ground.normalMap.dispose();
    }

    // Dispose all materials
    Object.values(this.materials).forEach(mat => mat.dispose());
    Object.values(this.roadMaterials).forEach(mat => mat.dispose());
    this.clear();
  }
}
