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
import type { GameMap, Building, Road, RoadType, CaptureZone, DeploymentZone, ResupplyPoint, Bridge, Intersection, WaterBody, BiomeType } from '../../data/types';
import { BIOME_CONFIGS } from '../../data/biomeConfigs';
import { ZoneFillRenderer, type FillEntry } from './ZoneFillRenderer';

export class MapRenderer {
  private scene: THREE.Scene;
  private mapGroup: THREE.Group;
  private captureZoneMeshes: Map<string, THREE.Group> = new Map();
  private deploymentZonesGroup: THREE.Group | null = null; // Track deployment zones for hiding
  private animationTime: number = 0; // For pulsing animations
  private biomeGroundColor: number; // Store biome ground color for terrain rendering

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
        depthWrite: false,
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
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      deploymentEnemy: new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      captureNeutral: new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      capturePlayer: new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      captureEnemy: new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    };
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
    this.renderResupplyPoints(map.resupplyPoints);

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

    // Adaptive terrain resolution - cap segments for large maps
    // Max ~500x500 segments (250k vertices) for performance
    const maxSegments = 500;
    const segmentCols = Math.min(cols, maxSegments);
    const segmentRows = Math.min(rows, maxSegments);

    // Create a single merged geometry for performance
    const groundGeometry = new THREE.PlaneGeometry(
      map.width,
      map.height,
      segmentCols,
      segmentRows
    );
    groundGeometry.rotateX(-Math.PI / 2);

    // Apply elevation to vertices (sample from terrain grid)
    const positionAttr = groundGeometry.attributes['position']!;
    for (let i = 0; i < positionAttr.count; i++) {
      const x = Math.floor(((positionAttr.getX(i) + map.width / 2) / map.width) * cols);
      const z = Math.floor(((positionAttr.getZ(i) + map.height / 2) / map.height) * rows);

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
    const tempColor = new THREE.Color();

    for (let i = 0; i < positionAttr.count; i++) {
      // Get normal Y component (1.0 = flat, 0.0 = vertical)
      const normalY = normalAttr.getY(i);

      // Calculate slope factor: 0 = vertical cliff, 1 = flat ground
      // Cliffs start appearing at ~30 degree slopes (normalY < 0.866)
      // Full cliff color at ~50+ degree slopes (normalY < 0.643)
      const cliffThresholdStart = 0.866; // ~30 degrees
      const cliffThresholdFull = 0.643;  // ~50 degrees

      let slopeFactor: number;
      if (normalY >= cliffThresholdStart) {
        slopeFactor = 1.0; // Full grass
      } else if (normalY <= cliffThresholdFull) {
        slopeFactor = 0.0; // Full cliff
      } else {
        // Blend between grass and cliff
        slopeFactor = (normalY - cliffThresholdFull) / (cliffThresholdStart - cliffThresholdFull);
      }

      // Interpolate between cliff and grass color
      tempColor.copy(cliffColor).lerp(grassColor, slopeFactor);

      // Set vertex color
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }

    groundGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groundMesh = new THREE.Mesh(groundGeometry, this.materials.ground);
    groundMesh.receiveShadow = true;
    groundMesh.name = 'terrain-ground';
    this.mapGroup.add(groundMesh);

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
          geo.translate(worldX, cell.elevation + 0.3, worldZ);
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
    const width = river.width ?? 10;
    const halfWidth = width / 2;
    const waterHeight = 0.3; // Elevated above terrain for visibility

    // Find lakes to detect connections
    const lakes = allWaterBodies.filter(w => w.type === 'lake');

    // Helper to check if a point is near a lake
    const isNearLake = (x: number, z: number): boolean => {
      for (const lake of lakes) {
        // Calculate lake center from points
        if (lake.points.length === 0) continue;
        const lakeCenterX = lake.points.reduce((sum, p) => sum + p.x, 0) / lake.points.length;
        const lakeCenterZ = lake.points.reduce((sum, p) => sum + p.z, 0) / lake.points.length;
        const lakeRadius = lake.radius ?? 50;
        const dist = Math.sqrt((x - lakeCenterX) ** 2 + (z - lakeCenterZ) ** 2);
        // Extended buffer to ensure rivers properly overlap with lake edges
        // This prevents gaps between river and lake rendering
        if (dist < lakeRadius + 20) {
          return true;
        }
      }
      return false;
    };

    const vertices: number[] = [];
    const indices: number[] = [];

    // Subdivide segments for smooth terrain following
    const maxSegmentLength = 5; // Sample every 5 meters
    const points: typeof river.points = [];

    for (let i = 0; i < river.points.length - 1; i++) {
      const p1 = river.points[i]!;
      const p2 = river.points[i + 1]!;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const segmentLength = Math.sqrt(dx * dx + dz * dz);
      const numSubdivisions = Math.ceil(segmentLength / maxSegmentLength);

      for (let j = 0; j < numSubdivisions; j++) {
        const t = j / numSubdivisions;
        points.push({
          x: p1.x + dx * t,
          z: p1.z + dz * t,
        });
      }
    }
    // Add last point
    points.push(river.points[river.points.length - 1]!);

    // Create strip geometry
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;

      // Calculate perpendicular direction for river width
      let perpX = 0, perpZ = 0;
      if (i < points.length - 1) {
        const next = points[i + 1]!;
        const dx = next.x - p.x;
        const dz = next.z - p.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length > 0.001) {
          perpX = -dz / length;
          perpZ = dx / length;
        }
      } else if (i > 0) {
        const prev = points[i - 1]!;
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length > 0.001) {
          perpX = -dz / length;
          perpZ = dx / length;
        }
      }

      // Left and right edge positions
      const leftX = p.x + perpX * halfWidth;
      const leftZ = p.z + perpZ * halfWidth;
      const rightX = p.x - perpX * halfWidth;
      const rightZ = p.z - perpZ * halfWidth;

      // Get elevation at edges (water follows terrain depression)
      const leftElev = getElevationAt(leftX, leftZ);
      const rightElev = getElevationAt(rightX, rightZ);

      // Check if this point is near a lake connection
      const nearLake = isNearLake(p.x, p.z);
      // Slightly elevate river at lake connections to render above lake edge
      const heightBoost = nearLake ? 0.05 : 0;

      // Water is at lowest point plus small offset
      const leftY = leftElev + waterHeight + heightBoost;
      const rightY = rightElev + waterHeight + heightBoost;

      // Add vertices (left and right edge)
      vertices.push(leftX, leftY, leftZ);
      vertices.push(rightX, rightY, rightZ);

      // Create triangles (except for last point)
      if (i < points.length - 1) {
        const baseIdx = i * 2;
        // Two triangles per segment
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

    const waterHeight = 0.3; // Same as rivers - elevated above terrain for visibility
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
    const getElevationAt = (worldX: number, worldZ: number): number => {
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

    // Helper to check if a point is over water (river)
    const isOverWater = (worldX: number, worldZ: number): boolean => {
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
      const roadGeometry = this.createRoadStripGeometry(road, getElevationAt, isOverWater);
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
    this.renderIntersections(map.intersections, roads, getElevationAt);

    // Render lane markings for paved roads (pass intersections to stop markings at them)
    this.renderLaneMarkings(roads, map.intersections, getElevationAt, isOverWater);
  }

  /**
   * Create smooth road strip geometries following the road points
   * Skips segments over water (bridges render separately)
   * Adds intermediate points for smooth terrain following
   */
  private createRoadStripGeometry(
    road: Road,
    getElevationAt: (x: number, z: number) => number,
    isOverWater: (x: number, z: number) => boolean
  ): THREE.BufferGeometry | null {
    const points = road.points;
    if (points.length < 2) return null;

    const halfWidth = road.width / 2;
    const allGeometries: THREE.BufferGeometry[] = [];
    const roadHeightOffset = 0.45; // Height above terrain to prevent z-fighting
    const maxSegmentLength = 5; // Maximum distance between sample points (meters)

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

      // Check if this point is over water
      const overWater = isOverWater(p.x, p.z);

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
    isOverWater: (x: number, z: number) => boolean
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
        // Create centerline geometry
        const centerlineGeometry = this.createLineStripGeometry(
          segmentPoints,
          0, // offset = 0 for center
          lineWidth,
          getElevationAt,
          lineHeightOffset,
          road.width, // Pass road width for proper elevation sampling
          isOverWater // Pass water detection to skip bridge sections
        );
        if (centerlineGeometry) {
          const centerlineMesh = new THREE.Mesh(centerlineGeometry, centerlineMaterial);
          centerlineMesh.renderOrder = 10; // High render order to ensure visibility over roads
          markingsGroup.add(centerlineMesh);
        }

        // Create left edge line
        const leftEdgeGeometry = this.createLineStripGeometry(
          segmentPoints,
          -(halfWidth - lineWidth / 2 - 0.1), // offset to left edge
          lineWidth,
          getElevationAt,
          lineHeightOffset,
          road.width, // Pass road width for proper elevation sampling
          isOverWater // Pass water detection to skip bridge sections
        );
        if (leftEdgeGeometry) {
          const leftEdgeMesh = new THREE.Mesh(leftEdgeGeometry, edgeLineMaterial);
          leftEdgeMesh.renderOrder = 10; // High render order to ensure visibility over roads
          markingsGroup.add(leftEdgeMesh);
        }

        // Create right edge line
        const rightEdgeGeometry = this.createLineStripGeometry(
          segmentPoints,
          halfWidth - lineWidth / 2 - 0.1, // offset to right edge
          lineWidth,
          getElevationAt,
          lineHeightOffset,
          road.width, // Pass road width for proper elevation sampling
          isOverWater // Pass water detection to skip bridge sections
        );
        if (rightEdgeGeometry) {
          const rightEdgeMesh = new THREE.Mesh(rightEdgeGeometry, edgeLineMaterial);
          rightEdgeMesh.renderOrder = 10; // High render order to ensure visibility over roads
          markingsGroup.add(rightEdgeMesh);
        }
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
    isOverWater?: (x: number, z: number) => boolean // Optional water detection function
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

      // Skip points over water (bridges don't have lane markings)
      if (isOverWater && isOverWater(p.x, p.z)) {
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
    const bridgeHeight = 0.5; // Height above water level (lower, closer to road height)

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
      const centerElevation = bridgeHeight;

      // Create bridge deck as a series of segments for smooth elevation transition
      const numSegments = 8;
      const halfWidth = bridge.width / 2;
      const vertices: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= numSegments; i++) {
        const t = i / numSegments;
        const x = startX + (endX - startX) * t;
        const z = startZ + (endZ - startZ) * t;

        // Smooth elevation curve - higher in middle, lower at ends
        // Use a parabola: y = -4*(t-0.5)^2 + 1 scaled to elevations
        const archFactor = -4 * (t - 0.5) * (t - 0.5) + 1; // 0 at ends, 1 at center
        const baseElevation = startElevation + (endElevation - startElevation) * t;
        const archHeight = Math.max(0, centerElevation - Math.min(startElevation, endElevation));
        const y = baseElevation + archFactor * archHeight;

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

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, bridgeMaterial);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.renderOrder = 7; // Render above roads

      bridgeGroup.add(mesh);

      // Add simple railings on both sides
      const railingMaterial = new THREE.MeshStandardMaterial({
        color: 0x7a6858,
        roughness: 0.9,
        metalness: 0.05,
      });

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

          const archFactor = -4 * (t - 0.5) * (t - 0.5) + 1;
          const baseElevation = startElevation + (endElevation - startElevation) * t;
          const archHeight = Math.max(0, centerElevation - Math.min(startElevation, endElevation));
          const y = baseElevation + archFactor * archHeight;

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

        const railing = new THREE.Mesh(railingGeometry, railingMaterial);
        railing.castShadow = true;
        bridgeGroup.add(railing);
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

    for (const building of buildings) {
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

    // Roof style based on building type/subtype
    const subtype = building.subtype;

    // Religious buildings - spires
    if (building.type === 'church' || subtype === 'church' || subtype === 'cathedral' || subtype === 'chapel') {
      // Church spire
      const spireGeometry = new THREE.ConeGeometry(
        building.width * 0.3,
        building.height * 0.8,
        8
      );
      const spireMesh = new THREE.Mesh(spireGeometry, this.materials.roof);
      spireMesh.position.y = building.height + building.height * 0.4;
      spireMesh.castShadow = true;
      group.add(spireMesh);

      // Cathedral gets extra spires
      if (subtype === 'cathedral') {
        const sideSpireGeometry = new THREE.ConeGeometry(building.width * 0.2, building.height * 0.5, 6);
        [-1, 1].forEach(side => {
          const sideSpire = new THREE.Mesh(sideSpireGeometry, this.materials.roof);
          sideSpire.position.set(building.width * 0.3 * side, building.height + building.height * 0.25, 0);
          sideSpire.castShadow = true;
          group.add(sideSpire);
        });
      }
    }
    // Industrial buildings - flat roofs with features
    else if (building.type === 'factory' || building.category === 'industrial') {
      // Flat roof with chimney(s)
      const numChimneys = subtype === 'large_factory' || subtype === 'power_plant' ? 2 : 1;
      for (let i = 0; i < numChimneys; i++) {
        const chimneyGeometry = new THREE.CylinderGeometry(1, 1.5, building.height * 0.5, 8);
        const chimneyMesh = new THREE.Mesh(chimneyGeometry, this.materials.factory);
        const xOffset = numChimneys > 1 ? (i === 0 ? -0.2 : 0.2) : 0.3;
        chimneyMesh.position.set(
          building.width * xOffset,
          building.height + building.height * 0.25,
          building.depth * 0.3
        );
        chimneyMesh.castShadow = true;
        group.add(chimneyMesh);
      }
    }
    // Agricultural buildings - barn style or windmill
    else if (building.category === 'agricultural') {
      if (subtype === 'windmill') {
        // Windmill blades
        const bladeGroup = new THREE.Group();
        const bladeGeometry = new THREE.BoxGeometry(0.5, building.height * 0.6, 1);
        for (let i = 0; i < 4; i++) {
          const blade = new THREE.Mesh(bladeGeometry, this.materials.building);
          blade.rotation.z = (i * Math.PI) / 2;
          blade.position.y = building.height * 0.3;
          bladeGroup.add(blade);
        }
        bladeGroup.position.set(0, building.height + 2, building.depth * 0.5 + 1);
        bladeGroup.rotation.x = Math.PI / 6;
        group.add(bladeGroup);
      } else if (subtype === 'silo') {
        // Silo is cylindrical - replace box with cylinder
        bodyMesh.visible = false;
        const siloGeometry = new THREE.CylinderGeometry(building.width / 2, building.width / 2, building.height, 12);
        const siloMesh = new THREE.Mesh(siloGeometry, wallMaterial);
        siloMesh.position.y = building.height / 2;
        siloMesh.castShadow = true;
        siloMesh.receiveShadow = true;
        group.add(siloMesh);
        // Domed top
        const domeGeometry = new THREE.SphereGeometry(building.width / 2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMesh = new THREE.Mesh(domeGeometry, this.materials.roof);
        domeMesh.position.y = building.height;
        domeMesh.castShadow = true;
        group.add(domeMesh);
      } else {
        // Barn - gambrel roof
        const roofGeometry = new THREE.ConeGeometry(
          Math.max(building.width, building.depth) * 0.75,
          building.height * 0.5,
          4
        );
        roofGeometry.rotateY(Math.PI / 4);
        const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
        roofMesh.position.y = building.height + building.height * 0.25;
        roofMesh.castShadow = true;
        group.add(roofMesh);
      }
    }
    // Infrastructure - special cases
    else if (building.category === 'infrastructure') {
      if (subtype === 'water_tower') {
        // Water tower - cylinder on legs
        bodyMesh.visible = false;
        // Legs
        const legGeometry = new THREE.CylinderGeometry(0.5, 0.5, building.height * 0.7, 6);
        const legPositions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        legPositions.forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(legGeometry, this.materials.factory);
          leg.position.set((lx ?? 0) * building.width * 0.3, building.height * 0.35, (lz ?? 0) * building.depth * 0.3);
          leg.castShadow = true;
          group.add(leg);
        });
        // Tank
        const tankGeometry = new THREE.CylinderGeometry(building.width * 0.4, building.width * 0.4, building.height * 0.4, 12);
        const tankMesh = new THREE.Mesh(tankGeometry, wallMaterial);
        tankMesh.position.y = building.height * 0.8;
        tankMesh.castShadow = true;
        group.add(tankMesh);
      } else {
        // Standard pitched roof for other infrastructure
        const roofGeometry = new THREE.ConeGeometry(
          Math.max(building.width, building.depth) * 0.7,
          building.height * 0.3,
          4
        );
        roofGeometry.rotateY(Math.PI / 4);
        const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
        roofMesh.position.y = building.height + building.height * 0.15;
        roofMesh.castShadow = true;
        group.add(roofMesh);
      }
    }
    // Residential/Commercial - pitched roofs
    else if (building.type === 'house' || building.type === 'shop' || building.category === 'residential' || building.category === 'commercial') {
      // Pitched roof - steeper for taller buildings
      const roofHeight = (building.floors && building.floors > 2) ? building.height * 0.3 : building.height * 0.4;
      const roofGeometry = new THREE.ConeGeometry(
        Math.max(building.width, building.depth) * 0.7,
        roofHeight,
        4
      );
      roofGeometry.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
      roofMesh.position.y = building.height + roofHeight * 0.5;
      roofMesh.castShadow = true;
      group.add(roofMesh);
    }
    // Civic buildings (non-religious) - flat or low-pitched
    else if (building.category === 'civic') {
      // Low pitched roof for civic buildings
      const roofGeometry = new THREE.ConeGeometry(
        Math.max(building.width, building.depth) * 0.75,
        building.height * 0.25,
        4
      );
      roofGeometry.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
      roofMesh.position.y = building.height + building.height * 0.125;
      roofMesh.castShadow = true;
      group.add(roofMesh);
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

    for (const zone of zones) {
      const width = zone.maxX - zone.minX;
      const depth = zone.maxZ - zone.minZ;
      const centerX = (zone.minX + zone.maxX) / 2;
      const centerZ = (zone.minZ + zone.maxZ) / 2;

      // Get terrain elevation at zone center
      const terrainElevation = getElevationAt(centerX, centerZ);

      const geometry = new THREE.PlaneGeometry(width, depth);
      geometry.rotateX(-Math.PI / 2);

      const material = zone.team === 'player'
        ? this.materials.deploymentPlayer
        : this.materials.deploymentEnemy;

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        centerX,
        terrainElevation + 0.5, // Above terrain
        centerZ
      );
      mesh.renderOrder = 99; // Render after terrain

      zoneGroup.add(mesh);

      // Border
      const borderGeometry = new THREE.EdgesGeometry(
        new THREE.PlaneGeometry(width, depth)
      );
      const borderMaterial = new THREE.LineBasicMaterial({
        color: zone.team === 'player' ? 0x4a9eff : 0xff4a4a,
        depthWrite: false,
        depthTest: false,
      });
      const border = new THREE.LineSegments(borderGeometry, borderMaterial);
      border.rotation.x = -Math.PI / 2;
      border.position.copy(mesh.position);
      border.position.y = terrainElevation + 1.0; // Above the zone mesh
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

    // Create zone fill renderer
    this.zoneFillRenderer = new ZoneFillRenderer(this.mapGroup);

    for (const zone of zones) {
      const group = new THREE.Group();
      group.name = `capture-zone-${zone.id}`;

      // Get terrain elevation at zone position
      const terrainElevation = getElevationAt(zone.x, zone.z);

      // Zone border ring (outline of the capture zone)
      const ringGeometry = new THREE.RingGeometry(zone.radius - 0.5, zone.radius, 64);
      ringGeometry.rotateX(-Math.PI / 2);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      ringMesh.position.set(zone.x, terrainElevation + 2.0, zone.z);
      ringMesh.userData.isBorderRing = true;
      ringMesh.renderOrder = 92;
      group.add(ringMesh);

      // Zone flag/marker
      const poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 8, 8);
      const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const poleMesh = new THREE.Mesh(poleGeometry, poleMaterial);
      poleMesh.position.set(zone.x, terrainElevation + 4, zone.z);
      poleMesh.castShadow = true;
      group.add(poleMesh);

      // Flag
      const flagGeometry = new THREE.PlaneGeometry(4, 2);
      const flagMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
      flagMesh.position.set(zone.x + 2, terrainElevation + 7, zone.z);
      flagMesh.userData.isFlag = true;
      group.add(flagMesh);

      this.captureZoneMeshes.set(zone.id, group);
      zoneGroup.add(group);

      // Initialize zone in fill renderer
      this.zoneFillRenderer.initializeZone(zone.id, zone.x, zone.z, zone.radius);
    }

    this.mapGroup.add(zoneGroup);
  }

  private renderResupplyPoints(resupplyPoints: ResupplyPoint[]): void {
    const resupplyGroup = new THREE.Group();
    resupplyGroup.name = 'resupply-points';

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
      arrowMesh.position.set(point.x, 0.6, baseZ);
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
      border.position.set(point.x, 0.7, baseZ);
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
      circleMesh.position.set(point.x, 0.65, baseZ);
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

    // Create instanced meshes
    const trunkInstanced = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treePositions.length);
    const foliageInstanced = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, treePositions.length);

    trunkInstanced.castShadow = true;
    foliageInstanced.castShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < treePositions.length; i++) {
      const tree = treePositions[i]!;

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
    // Dispose all materials
    Object.values(this.materials).forEach(mat => mat.dispose());
    Object.values(this.roadMaterials).forEach(mat => mat.dispose());
    this.clear();
  }
}
