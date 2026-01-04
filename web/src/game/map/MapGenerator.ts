/**
 * MapGenerator - Procedural map generation for Stellar Siege
 *
 * Generates European-style town maps with:
 * - Roads and streets
 * - Buildings (houses, churches, factories)
 * - Natural terrain (forests, fields, rivers)
 * - Capture zones
 * - Deployment zones
 */

import type {
  GameMap,
  MapSize,
  Road,
  Building,
  CaptureZone,
  DeploymentZone,
  EntryPoint,
  ResupplyPoint,
  TerrainCell,
  TerrainType,
  CoverType,
} from '../../data/types';
import { MAP_SIZES } from '../../data/types';

// Seeded random number generator
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}

export class MapGenerator {
  private rng: SeededRandom;
  private seed: number;
  private size: MapSize;
  private width: number;
  private height: number;
  private cellSize = 4; // meters per terrain cell
  private terrain: TerrainCell[][] = [];

  constructor(seed: number, size: MapSize) {
    this.seed = seed;
    this.size = size;
    this.rng = new SeededRandom(seed);

    const sizeConfig = MAP_SIZES[size];
    this.width = sizeConfig.width;
    this.height = sizeConfig.height;
  }

  generate(): GameMap {
    // Initialize terrain grid
    this.initializeTerrain();

    // Generate base elevation using simplex-like noise
    this.generateElevation();

    // Generate deployment zones
    const deploymentZones = this.generateDeploymentZones();

    // Generate main roads connecting deployment zones
    const roads = this.generateRoads();

    // Generate capture zones at strategic points
    const captureZones = this.generateCaptureZones();

    // Generate towns around capture zones and road intersections
    const buildings = this.generateBuildings(roads, captureZones);

    // Generate natural terrain (forests, fields)
    this.generateNaturalTerrain(roads, buildings);

    // Generate rivers (occasionally)
    this.generateRivers();

    // Update terrain grid with all features
    this.updateTerrainWithFeatures(roads, buildings);

    // Generate entry points for reinforcements
    const entryPoints = this.generateEntryPoints(deploymentZones, roads);

    // Generate resupply points for reinforcement spawning
    const resupplyPoints = this.generateResupplyPoints(deploymentZones, roads);

    return {
      seed: this.seed,
      size: this.size,
      width: this.width,
      height: this.height,
      terrain: this.terrain,
      roads,
      buildings,
      captureZones,
      deploymentZones,
      entryPoints,
      resupplyPoints,
    };
  }

  private initializeTerrain(): void {
    const cols = Math.ceil(this.width / this.cellSize);
    const rows = Math.ceil(this.height / this.cellSize);

    this.terrain = [];
    for (let z = 0; z < rows; z++) {
      const row: TerrainCell[] = [];
      for (let x = 0; x < cols; x++) {
        row.push({
          type: 'field',
          elevation: 0,
          cover: 'light',
        });
      }
      this.terrain.push(row);
    }
  }

  private generateElevation(): void {
    // Simple multi-octave noise for elevation
    const octaves = 3;
    const persistence = 0.5;
    const scale = 0.02;

    for (let z = 0; z < this.terrain.length; z++) {
      for (let x = 0; x < this.terrain[z]!.length; x++) {
        let elevation = 0;
        let amplitude = 1;
        let frequency = scale;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
          // Simple noise approximation using sin/cos
          const nx = x * frequency;
          const nz = z * frequency;
          const noiseVal = this.pseudoNoise(nx, nz);
          elevation += noiseVal * amplitude;
          maxValue += amplitude;
          amplitude *= persistence;
          frequency *= 2;
        }

        // Normalize and scale elevation (0-5 meters)
        elevation = ((elevation / maxValue) + 1) / 2;
        this.terrain[z]![x]!.elevation = elevation * 5;

        // Mark hills for high elevation
        if (this.terrain[z]![x]!.elevation > 3) {
          this.terrain[z]![x]!.type = 'hill';
          this.terrain[z]![x]!.cover = 'light';
        }
      }
    }
  }

  private pseudoNoise(x: number, z: number): number {
    // Simple pseudo-noise using sin
    const n = Math.sin(x * 12.9898 + z * 78.233 + this.seed) * 43758.5453;
    return n - Math.floor(n);
  }

  private generateDeploymentZones(): DeploymentZone[] {
    const margin = 30;
    const zoneDepth = 50;

    return [
      {
        team: 'player',
        minX: -this.width / 2 + margin,
        maxX: this.width / 2 - margin,
        minZ: -this.height / 2 + margin,
        maxZ: -this.height / 2 + margin + zoneDepth,
      },
      {
        team: 'enemy',
        minX: -this.width / 2 + margin,
        maxX: this.width / 2 - margin,
        minZ: this.height / 2 - margin - zoneDepth,
        maxZ: this.height / 2 - margin,
      },
    ];
  }

  private generateRoads(): Road[] {
    const roads: Road[] = [];

    // Main road connecting deployment zones (north-south)
    const mainRoadX = this.rng.nextFloat(-this.width / 4, this.width / 4);
    roads.push({
      points: [
        { x: mainRoadX, z: -this.height / 2 },
        { x: mainRoadX + this.rng.nextFloat(-20, 20), z: 0 },
        { x: mainRoadX, z: this.height / 2 },
      ],
      width: 8,
    });

    // Secondary roads (east-west)
    const numSecondary = this.rng.nextInt(2, 4);
    for (let i = 0; i < numSecondary; i++) {
      const z = this.rng.nextFloat(-this.height / 3, this.height / 3);
      const curveAmount = this.rng.nextFloat(-30, 30);

      roads.push({
        points: [
          { x: -this.width / 2, z: z },
          { x: 0, z: z + curveAmount },
          { x: this.width / 2, z: z },
        ],
        width: 6,
      });
    }

    // Flanking routes
    const leftFlankX = -this.width / 3;
    const rightFlankX = this.width / 3;

    roads.push({
      points: [
        { x: leftFlankX, z: -this.height / 2 },
        { x: leftFlankX + this.rng.nextFloat(-15, 15), z: 0 },
        { x: leftFlankX, z: this.height / 2 },
      ],
      width: 5,
    });

    roads.push({
      points: [
        { x: rightFlankX, z: -this.height / 2 },
        { x: rightFlankX + this.rng.nextFloat(-15, 15), z: 0 },
        { x: rightFlankX, z: this.height / 2 },
      ],
      width: 5,
    });

    return roads;
  }

  private generateCaptureZones(): CaptureZone[] {
    const sizeConfig = MAP_SIZES[this.size];
    const numZones = sizeConfig.zones;
    const zones: CaptureZone[] = [];

    // Zone names for European towns
    const zoneNames = this.rng.shuffle([
      'Town Center', 'Church Hill', 'Market Square', 'Factory District',
      'Railway Station', 'River Crossing', 'The Heights', 'Old Quarter',
      'Industrial Zone', 'Castle Ruins',
    ]);

    // Central zone
    zones.push({
      id: 'zone_center',
      name: zoneNames[0] ?? 'Central',
      x: this.rng.nextFloat(-20, 20),
      z: this.rng.nextFloat(-20, 20),
      radius: 25,
      pointsPerTick: 3,
      owner: 'neutral',
      captureProgress: 0,
    });

    // Distribute remaining zones
    const angleStep = (Math.PI * 2) / (numZones - 1);
    const radius = Math.min(this.width, this.height) / 3;

    for (let i = 1; i < numZones; i++) {
      const angle = angleStep * (i - 1) + this.rng.nextFloat(-0.3, 0.3);
      const dist = radius * this.rng.nextFloat(0.7, 1.0);

      zones.push({
        id: `zone_${i}`,
        name: zoneNames[i] ?? `Zone ${i}`,
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        radius: 20,
        pointsPerTick: 2,
        owner: 'neutral',
        captureProgress: 0,
      });
    }

    return zones;
  }

  private generateBuildings(roads: Road[], captureZones: CaptureZone[]): Building[] {
    const buildings: Building[] = [];
    const sizeConfig = MAP_SIZES[this.size];
    const numTowns = sizeConfig.towns;

    // Generate towns around capture zones
    for (let i = 0; i < Math.min(numTowns, captureZones.length); i++) {
      const zone = captureZones[i]!;
      const townBuildings = this.generateTown(zone.x, zone.z, this.rng.nextInt(8, 15));
      buildings.push(...townBuildings);
    }

    // Generate buildings along roads
    for (const road of roads) {
      const roadBuildings = this.generateRoadBuildings(road);
      buildings.push(...roadBuildings);
    }

    // Filter out overlapping buildings
    return this.removeOverlappingBuildings(buildings);
  }

  private generateTown(centerX: number, centerZ: number, numBuildings: number): Building[] {
    const buildings: Building[] = [];

    // Church or landmark in center
    buildings.push({
      x: centerX,
      z: centerZ,
      width: this.rng.nextFloat(10, 15),
      depth: this.rng.nextFloat(15, 25),
      height: this.rng.nextFloat(15, 25),
      type: 'church',
      garrisonCapacity: 10,
    });

    // Surround with houses and shops
    for (let i = 0; i < numBuildings - 1; i++) {
      const angle = (Math.PI * 2 * i) / (numBuildings - 1);
      const dist = this.rng.nextFloat(20, 50);

      const buildingType = this.rng.next() > 0.7 ? 'shop' : 'house';
      const size = buildingType === 'shop'
        ? { w: this.rng.nextFloat(8, 12), d: this.rng.nextFloat(8, 12), h: this.rng.nextFloat(6, 10) }
        : { w: this.rng.nextFloat(6, 10), d: this.rng.nextFloat(8, 14), h: this.rng.nextFloat(5, 8) };

      buildings.push({
        x: centerX + Math.cos(angle) * dist,
        z: centerZ + Math.sin(angle) * dist,
        width: size.w,
        depth: size.d,
        height: size.h,
        type: buildingType,
        garrisonCapacity: buildingType === 'shop' ? 6 : 4,
      });
    }

    return buildings;
  }

  private generateRoadBuildings(road: Road): Building[] {
    const buildings: Building[] = [];

    // Place buildings along road at intervals
    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i]!;
      const p2 = road.points[i + 1]!;

      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const numBuildings = Math.floor(length / 40);

      for (let j = 0; j < numBuildings; j++) {
        const t = (j + 0.5) / numBuildings;
        const x = p1.x + dx * t;
        const z = p1.z + dz * t;

        // Perpendicular offset
        const perpX = -dz / length;
        const perpZ = dx / length;
        const offset = this.rng.nextFloat(15, 25) * (this.rng.next() > 0.5 ? 1 : -1);

        if (this.rng.next() > 0.6) {
          const isFactory = this.rng.next() > 0.8;
          buildings.push({
            x: x + perpX * offset,
            z: z + perpZ * offset,
            width: isFactory ? this.rng.nextFloat(15, 25) : this.rng.nextFloat(6, 10),
            depth: isFactory ? this.rng.nextFloat(20, 30) : this.rng.nextFloat(8, 12),
            height: isFactory ? this.rng.nextFloat(10, 15) : this.rng.nextFloat(5, 8),
            type: isFactory ? 'factory' : 'house',
            garrisonCapacity: isFactory ? 12 : 4,
          });
        }
      }
    }

    return buildings;
  }

  private removeOverlappingBuildings(buildings: Building[]): Building[] {
    const result: Building[] = [];

    for (const building of buildings) {
      let overlaps = false;

      for (const existing of result) {
        const dx = Math.abs(building.x - existing.x);
        const dz = Math.abs(building.z - existing.z);
        const minDx = (building.width + existing.width) / 2 + 5;
        const minDz = (building.depth + existing.depth) / 2 + 5;

        if (dx < minDx && dz < minDz) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        result.push(building);
      }
    }

    return result;
  }

  private generateNaturalTerrain(roads: Road[], buildings: Building[]): void {
    // Generate forest patches
    const numForests = this.rng.nextInt(4, 8);
    for (let i = 0; i < numForests; i++) {
      const centerX = this.rng.nextFloat(-this.width / 2 + 30, this.width / 2 - 30);
      const centerZ = this.rng.nextFloat(-this.height / 2 + 30, this.height / 2 - 30);
      const radius = this.rng.nextFloat(20, 50);

      this.paintForest(centerX, centerZ, radius, roads, buildings);
    }
  }

  private paintForest(
    centerX: number,
    centerZ: number,
    radius: number,
    roads: Road[],
    buildings: Building[]
  ): void {
    const cols = this.terrain[0]!.length;
    const rows = this.terrain.length;

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = (x * this.cellSize) - this.width / 2;
        const worldZ = (z * this.cellSize) - this.height / 2;

        const dx = worldX - centerX;
        const dz = worldZ - centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Irregular edge using noise
        const edgeNoise = this.pseudoNoise(x * 0.1, z * 0.1) * 15;
        const effectiveRadius = radius + edgeNoise;

        if (dist < effectiveRadius) {
          // Check if not on road or building
          if (!this.isOnRoad(worldX, worldZ, roads) &&
              !this.isOnBuilding(worldX, worldZ, buildings)) {
            this.terrain[z]![x]!.type = 'forest';
            this.terrain[z]![x]!.cover = 'heavy';
          }
        }
      }
    }
  }

  private isOnRoad(x: number, z: number, roads: Road[]): boolean {
    for (const road of roads) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i]!;
        const p2 = road.points[i + 1]!;

        // Distance to line segment
        const dist = this.pointToSegmentDistance(x, z, p1.x, p1.z, p2.x, p2.z);
        if (dist < road.width + 5) {
          return true;
        }
      }
    }
    return false;
  }

  private isOnBuilding(x: number, z: number, buildings: Building[]): boolean {
    for (const building of buildings) {
      const dx = Math.abs(x - building.x);
      const dz = Math.abs(z - building.z);
      if (dx < building.width / 2 + 5 && dz < building.depth / 2 + 5) {
        return true;
      }
    }
    return false;
  }

  private pointToSegmentDistance(
    px: number, pz: number,
    x1: number, z1: number,
    x2: number, z2: number
  ): number {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSq = dx * dx + dz * dz;

    if (lengthSq === 0) {
      return Math.sqrt((px - x1) ** 2 + (pz - z1) ** 2);
    }

    let t = ((px - x1) * dx + (pz - z1) * dz) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projZ = z1 + t * dz;

    return Math.sqrt((px - projX) ** 2 + (pz - projZ) ** 2);
  }

  private generateRivers(): void {
    // 30% chance of having a river
    if (this.rng.next() > 0.3) return;

    const cols = this.terrain[0]!.length;
    const rows = this.terrain.length;

    // River flows east-west or north-south
    const horizontal = this.rng.next() > 0.5;

    if (horizontal) {
      const startZ = Math.floor(rows * this.rng.nextFloat(0.3, 0.7));
      let currentZ = startZ;

      for (let x = 0; x < cols; x++) {
        // Meander
        if (this.rng.next() > 0.7) {
          currentZ += this.rng.nextInt(-1, 1);
          currentZ = Math.max(1, Math.min(rows - 2, currentZ));
        }

        // River width of 2-3 cells
        for (let dz = -1; dz <= 1; dz++) {
          const z = currentZ + dz;
          if (z >= 0 && z < rows) {
            this.terrain[z]![x]!.type = 'river';
            this.terrain[z]![x]!.cover = 'none';
          }
        }
      }
    } else {
      const startX = Math.floor(cols * this.rng.nextFloat(0.3, 0.7));
      let currentX = startX;

      for (let z = 0; z < rows; z++) {
        if (this.rng.next() > 0.7) {
          currentX += this.rng.nextInt(-1, 1);
          currentX = Math.max(1, Math.min(cols - 2, currentX));
        }

        for (let dx = -1; dx <= 1; dx++) {
          const x = currentX + dx;
          if (x >= 0 && x < cols) {
            this.terrain[z]![x]!.type = 'river';
            this.terrain[z]![x]!.cover = 'none';
          }
        }
      }
    }
  }

  private updateTerrainWithFeatures(roads: Road[], buildings: Building[]): void {
    const cols = this.terrain[0]!.length;
    const rows = this.terrain.length;

    // Mark roads
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = (x * this.cellSize) - this.width / 2;
        const worldZ = (z * this.cellSize) - this.height / 2;

        if (this.terrain[z]![x]!.type !== 'river') {
          if (this.isOnRoad(worldX, worldZ, roads)) {
            this.terrain[z]![x]!.type = 'road';
            this.terrain[z]![x]!.cover = 'none';
          } else if (this.isOnBuilding(worldX, worldZ, buildings)) {
            this.terrain[z]![x]!.type = 'building';
            this.terrain[z]![x]!.cover = 'full';
          }
        }
      }
    }
  }

  // Get terrain at world position
  getTerrainAt(worldX: number, worldZ: number): TerrainCell | null {
    const x = Math.floor((worldX + this.width / 2) / this.cellSize);
    const z = Math.floor((worldZ + this.height / 2) / this.cellSize);

    if (z >= 0 && z < this.terrain.length && x >= 0 && x < this.terrain[0]!.length) {
      return this.terrain[z]![x]!;
    }
    return null;
  }

  // Get movement speed modifier for terrain type
  static getMovementModifier(type: TerrainType): number {
    switch (type) {
      case 'road': return 1.0;
      case 'field': return 0.8;
      case 'forest': return 0.5;
      case 'hill': return 0.7;
      case 'river': return 0;
      case 'building': return 0;
      default: return 0.8;
    }
  }

  // Get cover value for terrain type
  static getCoverValue(cover: CoverType): number {
    switch (cover) {
      case 'none': return 0;
      case 'light': return 0.2;
      case 'heavy': return 0.5;
      case 'full': return 0.8;
      default: return 0;
    }
  }

  /**
   * Generate entry points for reinforcements
   * Places 2-4 entry points per team at map edges where roads intersect
   */
  private generateEntryPoints(deploymentZones: DeploymentZone[], roads: Road[]): EntryPoint[] {
    const entryPoints: EntryPoint[] = [];

    for (const zone of deploymentZones) {
      const zoneCenterX = (zone.minX + zone.maxX) / 2;
      const zoneCenterZ = (zone.minZ + zone.maxZ) / 2;

      // Find roads that intersect with deployment zone edges
      const edgeRoads: Array<{ x: number; z: number; type: 'highway' | 'secondary' | 'dirt' }> = [];

      for (const road of roads) {
        // Check if road intersects zone edge
        for (const point of road.points) {
          const isAtEdge =
            (Math.abs(point.x - zone.minX) < 10 || Math.abs(point.x - zone.maxX) < 10) ||
            (Math.abs(point.z - zone.minZ) < 10 || Math.abs(point.z - zone.maxZ) < 10);

          if (isAtEdge) {
            let type: 'highway' | 'secondary' | 'dirt' = 'secondary';
            if (road.width >= 8) type = 'highway';
            else if (road.width < 5) type = 'dirt';

            edgeRoads.push({ x: point.x, z: point.z, type });
            break; // Only one point per road
          }
        }
      }

      // If we found roads, use them. Otherwise create default entry points
      if (edgeRoads.length > 0) {
        // Use up to 4 road entry points
        const selectedRoads = edgeRoads.slice(0, 4);
        selectedRoads.forEach((road, index) => {
          entryPoints.push({
            id: `${zone.team}_entry_${index}`,
            team: zone.team,
            x: road.x,
            z: road.z,
            type: road.type,
            spawnRate: this.getSpawnRate(road.type),
            queue: [],
            rallyPoint: null,
          });
        });
      } else {
        // Create default entry points if no roads found
        const defaultPositions = [
          { x: zoneCenterX - 20, z: zoneCenterZ },
          { x: zoneCenterX + 20, z: zoneCenterZ },
          { x: zoneCenterX, z: zoneCenterZ - 20 },
        ];

        defaultPositions.forEach((pos, index) => {
          entryPoints.push({
            id: `${zone.team}_entry_${index}`,
            team: zone.team,
            x: pos.x,
            z: pos.z,
            type: 'secondary',
            spawnRate: 3,
            queue: [],
            rallyPoint: null,
          });
        });
      }

      // Always add one air entry point at map edge center
      const airX = zoneCenterX;
      const airZ = zone.team === 'player' ? 0 : this.height;
      entryPoints.push({
        id: `${zone.team}_air_entry`,
        team: zone.team,
        x: airX,
        z: airZ,
        type: 'air',
        spawnRate: 5, // Slower for air units
        queue: [],
        rallyPoint: null,
      });
    }

    return entryPoints;
  }

  /**
   * Get spawn rate based on entry point type
   * Highway = fast (2s), Secondary = medium (3s), Dirt = slow (5s), Air = slow (5s)
   */
  private getSpawnRate(type: 'highway' | 'secondary' | 'dirt' | 'air'): number {
    switch (type) {
      case 'highway': return 2;
      case 'secondary': return 3;
      case 'dirt': return 5;
      case 'air': return 5;
      default: return 3;
    }
  }

  /**
   * Generate resupply points for reinforcement spawning
   * Places 2-5 resupply points per team at the MAP EDGE, pointing into the battlefield
   * Positions are based on actual terrain: roads, forest gaps, flanking paths
   * NOT symmetric - each team gets positions based on their side's terrain
   */
  private generateResupplyPoints(deploymentZones: DeploymentZone[], roads: Road[]): ResupplyPoint[] {
    const resupplyPoints: ResupplyPoint[] = [];
    const sizeConfig = MAP_SIZES[this.size];

    // Determine number of resupply points based on map size (2-5 per team)
    const numPerTeam = sizeConfig.zones <= 3 ? 2 : sizeConfig.zones <= 5 ? 3 : 5;

    for (const zone of deploymentZones) {
      const team = zone.team;

      // Position at map edge - player at bottom (negative Z), enemy at top (positive Z)
      const edgeZ = team === 'player' ? -this.height / 2 : this.height / 2;
      // Direction pointing INTO the battlefield
      const direction = team === 'player' ? 0 : Math.PI;

      // Collect candidate positions with scores
      const candidates: { x: number; score: number; type: string }[] = [];

      // 1. Find road intersections at this team's edge (highest priority)
      for (const road of roads) {
        for (let i = 0; i < road.points.length - 1; i++) {
          const p1 = road.points[i]!;
          const p2 = road.points[i + 1]!;

          // Check if road segment crosses near the edge
          const crossesEdge = (team === 'player')
            ? (p1.z <= edgeZ + 30 || p2.z <= edgeZ + 30)
            : (p1.z >= edgeZ - 30 || p2.z >= edgeZ - 30);

          if (crossesEdge) {
            // Interpolate to find x position at the edge
            const t = (team === 'player')
              ? Math.max(0, Math.min(1, (edgeZ - p1.z) / (p2.z - p1.z + 0.001)))
              : Math.max(0, Math.min(1, (edgeZ - p1.z) / (p2.z - p1.z + 0.001)));
            const x = p1.x + (p2.x - p1.x) * Math.max(0, Math.min(1, t));

            // Score based on road width (highways best)
            const score = 100 + road.width * 15;
            candidates.push({ x, score, type: 'road' });
          }
        }
      }

      // 2. Find forest gaps / open terrain paths at edge
      const cols = this.terrain[0]?.length ?? 0;
      const edgeRow = team === 'player' ? 0 : this.terrain.length - 1;
      const scanDepth = 5; // Check a few rows in from edge

      for (let col = 0; col < cols; col++) {
        const worldX = col * this.cellSize - this.width / 2;

        // Check if this column has open terrain (not forest) near edge
        let openCount = 0;
        let forestCount = 0;
        for (let d = 0; d < scanDepth && d < this.terrain.length; d++) {
          const row = team === 'player' ? d : this.terrain.length - 1 - d;
          const cell = this.terrain[row]?.[col];
          if (cell) {
            if (cell.type === 'forest') forestCount++;
            else if (cell.type === 'field' || cell.type === 'road') openCount++;
          }
        }

        // Open paths through otherwise forested areas are good flanking routes
        if (openCount >= 3) {
          // Check if surrounded by forest (making it a sneaky path)
          const leftForest = col > 0 && this.terrain[edgeRow]?.[col - 1]?.type === 'forest';
          const rightForest = col < cols - 1 && this.terrain[edgeRow]?.[col + 1]?.type === 'forest';
          const isSneakyPath = leftForest || rightForest;

          const score = isSneakyPath ? 70 : 40; // Sneaky paths get bonus
          candidates.push({ x: worldX, score, type: isSneakyPath ? 'sneaky' : 'open' });
        }
      }

      // 3. Add flanking positions at map edges (lower priority fallback)
      const flankOffset = this.width * 0.35;
      candidates.push({ x: -flankOffset, score: 50, type: 'flank' });
      candidates.push({ x: flankOffset, score: 50, type: 'flank' });

      // 4. Add center position as fallback
      candidates.push({ x: 0, score: 30, type: 'center' });

      // Sort by score (highest first)
      candidates.sort((a, b) => b.score - a.score);

      // Select positions with minimum spacing
      const selectedPositions: { x: number; type: string }[] = [];
      const minSpacing = this.width / (numPerTeam + 2); // Ensure spread

      for (const candidate of candidates) {
        if (selectedPositions.length >= numPerTeam) break;

        // Clamp to map bounds
        const clampedX = Math.max(-this.width / 2 + 10, Math.min(this.width / 2 - 10, candidate.x));

        // Check spacing from existing selections
        let tooClose = false;
        for (const existing of selectedPositions) {
          if (Math.abs(clampedX - existing.x) < minSpacing) {
            tooClose = true;
            break;
          }
        }

        if (!tooClose) {
          selectedPositions.push({ x: clampedX, type: candidate.type });
        }
      }

      // Ensure we have at least 2 positions
      if (selectedPositions.length < 2) {
        // Add default spread positions
        const defaultSpacing = this.width / 3;
        if (!selectedPositions.some(p => p.x < 0)) {
          selectedPositions.push({ x: -defaultSpacing / 2, type: 'default' });
        }
        if (!selectedPositions.some(p => p.x > 0)) {
          selectedPositions.push({ x: defaultSpacing / 2, type: 'default' });
        }
      }

      // Create resupply points
      selectedPositions.forEach((pos, index) => {
        resupplyPoints.push({
          id: `${team}_resupply_${index}`,
          x: pos.x,
          z: edgeZ,
          team,
          radius: 10,
          capacity: 2,
          isActive: true,
          direction,
        });
      });
    }

    return resupplyPoints;
  }
}
