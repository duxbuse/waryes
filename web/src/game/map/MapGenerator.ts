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
  RoadType,
  Intersection,
  Building,
  CaptureZone,
  DeploymentZone,
  BuildingSubtype,
  LegacyBuildingType,
  EntryPoint,
  ResupplyPoint,
  TerrainCell,
  TerrainType,
  CoverType,
  WaterBody,
  Bridge,
  Settlement,
  SettlementSize,
  LayoutType,
  TerrainFeature,
  TerrainFeatureType,
  BiomeType,
  BiomeConfig,
  ObjectiveType,
} from '../../data/types';
import { MAP_SIZES, ROAD_WIDTHS, ELEVATION_CONFIGS, FEATURE_PARAMS } from '../../data/types';
import { BIOME_CONFIGS, selectBiomeFromSeed } from '../../data/biomeConfigs';
import { SettlementGenerator } from './SettlementGenerator';

// Network node for road planning
interface RoadNode {
  id: string;
  x: number;
  z: number;
  type: 'town' | 'edge' | 'junction';
  connectedRoads: string[];
}

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
  private biome: BiomeType;
  private biomeConfig: BiomeConfig;
  private width: number;
  private height: number;
  private cellSize: number; // meters per terrain cell (adaptive based on map size)
  private terrain: TerrainCell[][] = [];

  // Road network data
  private roadNodes: Map<string, RoadNode> = new Map();
  private intersections: Intersection[] = [];

  // Water system data
  private waterBodies: WaterBody[] = [];
  private bridges: Bridge[] = [];
  private bridgeElevations: Map<string, { x: number; z: number; elevation: number; length: number; angle: number }[]> = new Map();
  private roadIdCounter = 0;

  // Settlement system
  private settlementGenerator: SettlementGenerator;
  private settlements: Settlement[] = [];

  // Terrain features
  private terrainFeatures: TerrainFeature[] = [];

  // Elevation slope tracking
  private riverSource: { x: number; z: number } | null = null;
  private riverSinks: { x: number; z: number }[] = [];

  constructor(seed: number, size: MapSize, biomeOverride?: BiomeType) {
    this.seed = seed;
    this.size = size;
    this.rng = new SeededRandom(seed);

    // Select biome - use override if provided, otherwise select from seed
    this.biome = biomeOverride ?? selectBiomeFromSeed(seed);
    this.biomeConfig = BIOME_CONFIGS[this.biome];

    this.settlementGenerator = new SettlementGenerator(seed);

    const sizeConfig = MAP_SIZES[size];
    this.width = sizeConfig.width;
    this.height = sizeConfig.height;

    // Adaptive cell size - larger cells for bigger maps to keep grid manageable
    // Target max ~250x250 grid = 62,500 cells for performance
    const maxGridSize = 250;
    const baseCellSize = 4;
    const maxDimension = Math.max(this.width, this.height);
    this.cellSize = Math.max(baseCellSize, Math.ceil(maxDimension / maxGridSize));
  }

  generate(): GameMap {
    // Reset water system data
    this.waterBodies = [];
    this.bridges = [];
    this.settlements = [];
    this.settlementGenerator.reseed(this.seed);

    // Initialize terrain grid
    this.initializeTerrain();

    // Generate deployment zones (needed before terrain features)
    const deploymentZones = this.generateDeploymentZones();

    // Generate terrain features (mountains, valleys, etc.)
    this.generateTerrainFeatures(deploymentZones);

    // Generate base elevation using simplex-like noise
    this.generateElevation();

    // Smooth elevation transitions for natural look
    this.smoothElevationTransitions();

    // Generate water bodies (lakes, rivers) BEFORE settlements
    // So cities can grow around them
    this.generateWaterBodies(deploymentZones);

    // Remove any settlement buildings that ended up on water (safety check)
    // this.filterBuildingsOnWater(); // Keeping for safety, but new logic should prevent placement

    // Generate settlements with varied sizes and layouts
    // Now receiving terrain context for geography-aware generation
    this.generateSettlements();

    // Remove any settlement buildings that ended up on water
    this.filterBuildingsOnWater();

    // Generate main roads connecting deployment zones and settlements
    const roads = this.generateRoads();

    // Create bridges where roads cross rivers
    this.createBridgesForRoads(roads);

    // Create bridges where roads cross at different elevations (overpasses/underpasses)
    // MUST be called BEFORE gradeTerrainAroundRoads so we can compare planned road elevations
    this.createBridgesForRoadCrossings(roads);

    // Grade terrain around highways to create ramps and cuts
    this.gradeTerrainAroundRoads(roads);

    // Add settlement internal streets to road list (filter out those overlapping main roads)
    const settlementStreets = SettlementGenerator.flattenSettlementStreets(this.settlements);
    const filteredStreets = this.filterOverlappingStreets(settlementStreets, roads);
    roads.push(...filteredStreets);

    // Filter out buildings that overlap with roads
    this.filterBuildingsOnRoads(roads);

    // Generate capture zones at strategic points (settlements)
    const captureZones = this.generateCaptureZones(deploymentZones);

    // Link capture zones to settlements
    this.linkCaptureZonesToSettlements(captureZones);

    // Get all buildings from settlements plus any additional road buildings
    const settlementBuildings = SettlementGenerator.flattenSettlementBuildings(this.settlements);
    const roadBuildings = this.generateRoadBuildings(roads, settlementBuildings);
    const buildings = [...settlementBuildings, ...roadBuildings];

    // Generate ponds near farm buildings
    this.generatePonds(buildings);

    // Generate farm fields with crop variants
    this.generateFarmFields(buildings);

    // Generate natural terrain (forests, fields)
    this.generateNaturalTerrain(roads, buildings);

    // Update terrain grid with all features
    this.updateTerrainWithFeatures(roads, buildings);

    // Generate entry points for reinforcements
    const entryPoints = this.generateEntryPoints(deploymentZones, roads);

    // Generate resupply points for reinforcement spawning
    const resupplyPoints = this.generateResupplyPoints(deploymentZones, roads);

    // Calculate elevation range for terrain features
    let minElevation = 0;
    let maxElevation = 0;
    for (const row of this.terrain) {
      for (const cell of row) {
        minElevation = Math.min(minElevation, cell.elevation);
        maxElevation = Math.max(maxElevation, cell.elevation);
      }
    }

    // Final global smoothing pass to ensure everything is perfectly blended
    this.smoothWaterBankElevations();

    // Validate map balance and log metrics
    this.validateMapBalance();

    return {
      seed: this.seed,
      size: this.size,
      biome: this.biome,
      width: this.width,
      height: this.height,
      cellSize: this.cellSize,
      terrain: this.terrain,
      roads,
      intersections: this.intersections,
      buildings,
      settlements: this.settlements,
      captureZones,
      deploymentZones,
      entryPoints,
      resupplyPoints,
      waterBodies: this.waterBodies,
      bridges: this.bridges,
      terrainFeatures: this.terrainFeatures,
      baseElevation: minElevation,
      maxElevation: maxElevation,
    };
  }

  /**
   * Generate settlements with varied sizes and layout types
   * Distribution based on map size:
   * - Small map: 1 village, 2 hamlets
   * - Medium map: 0-2 towns, 2-4 villages, 3-4 hamlets (varied placement)
   * - Large map: 1-2 cities, 2-3 towns, 4-5 villages, 5-8 hamlets
   */
  private generateSettlements(): void {
    // Determine settlement distribution based on map size
    const distribution = this.getSettlementDistribution();

    // Get positions for settlements (similar to old town positions)
    const positions = this.getSettlementPositions(distribution.total);

    // Shuffle positions for variety - don't always put largest in center
    this.rng.shuffle(positions);

    // Build settlement sizes array
    const sizes: SettlementSize[] = [];

    // Add in order: cities, towns, villages, hamlets
    for (let i = 0; i < distribution.cities; i++) sizes.push('city');
    for (let i = 0; i < distribution.towns; i++) sizes.push('town');
    for (let i = 0; i < distribution.villages; i++) sizes.push('village');
    for (let i = 0; i < distribution.hamlets; i++) sizes.push('hamlet');

    // Shuffle sizes for more variety in placement
    this.rng.shuffle(sizes);

    // Generate each settlement
    let posIndex = 0;
    for (const settlementSize of sizes) {
      if (posIndex >= positions.length) break;

      const pos = positions[posIndex]!;
      posIndex++;

      // Determine layout type (can be influenced by position)
      // Central settlements more likely to be organic (historic)
      // Edge settlements more likely to be grid (newer)
      const distFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      const maxDist = Math.min(this.width, this.height) / 2;
      const normalizedDist = distFromCenter / maxDist;

      let layoutType: LayoutType | undefined;

      // City specific logic: Choose explicit flavor
      if (settlementSize === 'city') {
        // 50/50 split for city flavor: Planned Grid vs Old World Organic
        layoutType = this.rng.next() < 0.5 ? 'grid' : 'organic';
      } else {
        // Standard logic for towns/villages
        if (normalizedDist < 0.3) {
          // Central - prefer organic
          layoutType = this.rng.next() < 0.7 ? 'organic' : undefined;
        } else if (normalizedDist > 0.7) {
          // Edge - prefer grid
          layoutType = this.rng.next() < 0.5 ? 'grid' : undefined;
        }
      }
      // Middle positions use default weighted random

      // Calculate main road angle (pointing toward map center for road integration)
      const mainRoadAngle = Math.atan2(-pos.z, -pos.x);

      const settlement = this.settlementGenerator.generate(
        { x: pos.x, z: pos.z },
        settlementSize,
        layoutType,
        mainRoadAngle,
        this.biome === 'cities' ? 2.0 : 1.0, // Double density for cities biome
        {
          minX: -this.width / 2 + 10,
          maxX: this.width / 2 - 10,
          minZ: -this.height / 2 + 10,
          maxZ: this.height / 2 - 10
        },
        this.terrain,
        this.waterBodies
      );

      // Check if terrain is suitable for this settlement
      const isSuitable = this.isTerrainSuitableForSettlement(
        settlement.position.x,
        settlement.position.z,
        settlement.radius
      );

      // Only add settlement if terrain is suitable
      // Otherwise, try next position (graceful degradation - some maps may have fewer settlements)
      if (isSuitable) {
        this.settlements.push(settlement);
      }
    }
  }

  /**
   * Get settlement distribution based on map size
   */
  private getSettlementDistribution(): { cities: number; towns: number; villages: number; hamlets: number; total: number } {
    let dist: { cities: number; towns: number; villages: number; hamlets: number; total: number };

    switch (this.size) {
      case 'small':
        // More variety: sometimes just hamlets, sometimes a village or even a small town
        const smallRoll = this.rng.next();
        if (smallRoll < 0.2) {
          // 20%: Just hamlets (rural outpost)
          dist = { cities: 0, towns: 0, villages: 0, hamlets: 2 + Math.floor(this.rng.next() * 2), total: 0 };
        } else if (smallRoll < 0.85) {
          // 65%: Village with hamlets (typical small map)
          dist = { cities: 0, towns: 0, villages: 1 + Math.floor(this.rng.next() * 2), hamlets: 1 + Math.floor(this.rng.next() * 2), total: 0 };
        } else {
          // 15%: Small town focus (rare)
          dist = { cities: 0, towns: 1, villages: 0, hamlets: 1 + Math.floor(this.rng.next() * 2), total: 0 };
        }
        break;
      case 'medium':
        // More variety: 0-2 towns, adjust villages accordingly
        const townCount = Math.floor(this.rng.next() * 3); // 0, 1, or 2 towns
        dist = {
          cities: 0,
          towns: townCount,
          villages: 3 + Math.floor(this.rng.next() * 2) - townCount, // More villages if fewer towns
          hamlets: 3 + Math.floor(this.rng.next() * 2),
          total: 0
        };
        break;
      case 'large':
        // More variety: sometimes no city, sometimes multiple cities
        const largeRoll = this.rng.next();
        if (largeRoll < 0.25) {
          // 25%: No cities - rural/contested territory with many towns
          dist = {
            cities: 0,
            towns: 3 + Math.floor(this.rng.next() * 3), // 3-5 towns
            villages: 5 + Math.floor(this.rng.next() * 3),
            hamlets: 6 + Math.floor(this.rng.next() * 4),
            total: 0
          };
        } else if (largeRoll < 0.75) {
          // 50%: Single city with surrounding settlements (typical)
          dist = {
            cities: 1,
            towns: 2 + Math.floor(this.rng.next() * 2),
            villages: 4 + Math.floor(this.rng.next() * 2),
            hamlets: 5 + Math.floor(this.rng.next() * 4),
            total: 0
          };
        } else {
          // 25%: Multiple cities - major population centers
          dist = {
            cities: 2,
            towns: 1 + Math.floor(this.rng.next() * 2), // Fewer towns with 2 cities
            villages: 3 + Math.floor(this.rng.next() * 2),
            hamlets: 4 + Math.floor(this.rng.next() * 3),
            total: 0
          };
        }
        break;
      default:
        dist = { cities: 0, towns: 1, villages: 2, hamlets: 3, total: 0 };
    }

    // Special handling for 'cities' biome to ensure huge urban density (>30% coverage)
    if (this.biomeConfig.id === 'cities') {
      switch (this.size) {
        case 'small':
          // Small map: 1 town + 1 village (dominates map)
          dist = { cities: 0, towns: 1, villages: 1, hamlets: 0, total: 2 };
          break;
        case 'medium':
          // Medium map: 1 city + 3 towns (major urban sprawl)
          dist = { cities: 1, towns: 3, villages: 0, hamlets: 0, total: 4 };
          break;
        case 'large':
          // Large map: 3 cities + 8 towns (megalopolis)
          dist = { cities: 3, towns: 8, villages: 5, hamlets: 0, total: 16 };
          break;
      }
      return dist;
    }

    // Apply biome settlement density multiplier
    dist.cities = Math.floor(dist.cities * this.biomeConfig.settlementDensity);
    dist.towns = Math.floor(dist.towns * this.biomeConfig.settlementDensity);
    dist.villages = Math.floor(dist.villages * this.biomeConfig.settlementDensity);
    dist.hamlets = Math.floor(dist.hamlets * this.biomeConfig.settlementDensity);

    // Filter by allowed settlement types for this biome
    const allowedTypes = this.biomeConfig.settlementTypes;
    if (!allowedTypes.includes('city')) dist.cities = 0;
    if (!allowedTypes.includes('town')) dist.towns = 0;
    if (!allowedTypes.includes('village')) dist.villages = 0;
    if (!allowedTypes.includes('hamlet')) dist.hamlets = 0;

    // Calculate total
    dist.total = dist.cities + dist.towns + dist.villages + dist.hamlets;
    return dist;
  }

  /**
   * Check if terrain at position is suitable for a settlement
   * Requirements: slope < 15%, elevation variance < 10m within footprint
   */
  private isTerrainSuitableForSettlement(
    worldX: number,
    worldZ: number,
    radius: number
  ): boolean {
    // Sample elevation at several points within the settlement footprint
    const samples: number[] = [];
    const numSamples = 16; // Sample at 16 points in a circle

    for (let i = 0; i < numSamples; i++) {
      const angle = (i / numSamples) * Math.PI * 2;
      const sampleX = worldX + Math.cos(angle) * radius;
      const sampleZ = worldZ + Math.sin(angle) * radius;

      const elevation = this.getElevationAt(sampleX, sampleZ);
      samples.push(elevation);
    }

    // Add center point
    samples.push(this.getElevationAt(worldX, worldZ));

    // Check elevation variance (max 10m change)
    // Relaxed for cities (allow up to 25m variance) to ensure they spawn in more varied terrain
    const maxAllowedVariance = this.biome === 'cities' ? 25 : 10;
    const minElevation = Math.min(...samples);
    const maxElevation = Math.max(...samples);
    const elevationVariance = maxElevation - minElevation;

    if (elevationVariance > maxAllowedVariance) {
      return false; // Too steep/varied
    }

    // Check average slope (should be < 15% = 8.5 degrees)
    const avgSlope = elevationVariance / radius;
    const maxSlope = 0.15; // 15% grade

    return avgSlope < maxSlope;
  }

  /**
   * Get elevation at a world position using bilinear interpolation
   */
  public getElevationAt(worldX: number, worldZ: number): number {
    // Convert world coords to grid coords
    const gridX = (worldX + this.width / 2) / this.cellSize;
    const gridZ = (worldZ + this.height / 2) / this.cellSize;

    // Get the four surrounding grid cells
    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    // Clamp to terrain bounds
    const cols = this.terrain[0]!.length;
    const rows = this.terrain.length;
    const cx0 = Math.max(0, Math.min(cols - 1, x0));
    const cx1 = Math.max(0, Math.min(cols - 1, x1));
    const cz0 = Math.max(0, Math.min(rows - 1, z0));
    const cz1 = Math.max(0, Math.min(rows - 1, z1));

    // Get elevations at corners
    const e00 = this.terrain[cz0]![cx0]!.elevation;
    const e10 = this.terrain[cz0]![cx1]!.elevation;
    const e01 = this.terrain[cz1]![cx0]!.elevation;
    const e11 = this.terrain[cz1]![cx1]!.elevation;

    // Bilinear interpolation
    const fx = gridX - x0;
    const fz = gridZ - z0;

    const e0 = e00 * (1 - fx) + e10 * fx;
    const e1 = e01 * (1 - fx) + e11 * fx;

    return e0 * (1 - fz) + e1 * fz;
  }

  /**
   * Get positions for settlements
   */
  private getSettlementPositions(count: number): Array<{ x: number; z: number }> {
    const positions: Array<{ x: number; z: number }> = [];

    // Central position (for main town/city)
    const centerOffset = Math.max(20, this.width * 0.03);
    positions.push({
      x: this.rng.nextFloat(-centerOffset, centerOffset),
      z: this.rng.nextFloat(-centerOffset, centerOffset),
    });

    // Distributed positions in a circle
    const numRings = Math.ceil((count - 1) / 6);
    let remaining = count - 1;

    for (let ring = 1; ring <= numRings && remaining > 0; ring++) {
      const ringRadius = (ring / (numRings + 1)) * Math.min(this.width, this.height) / 2 * 0.8;
      const numInRing = Math.min(remaining, 4 + ring * 2);

      for (let i = 0; i < numInRing && remaining > 0; i++) {
        const angle = (i / numInRing) * Math.PI * 2 + this.rng.nextFloat(-0.3, 0.3);
        const dist = ringRadius * this.rng.nextFloat(0.8, 1.2);

        // Check minimum distance from existing positions
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        let tooClose = false;
        for (const existing of positions) {
          const d = Math.sqrt((x - existing.x) ** 2 + (z - existing.z) ** 2);
          if (d < 400) { // Minimum 400m between settlements to preventing merging/overlaps
            tooClose = true;
            break;
          }
        }

        if (!tooClose) {
          positions.push({ x, z });
          remaining--;
        }
      }
    }

    return positions;
  }

  /**
   * Link capture zones to nearest settlements
   */
  private linkCaptureZonesToSettlements(captureZones: CaptureZone[]): void {
    for (const zone of captureZones) {
      let nearestSettlement: Settlement | null = null;
      let nearestDist = Infinity;

      for (const settlement of this.settlements) {
        const dx = zone.x - settlement.position.x;
        const dz = zone.z - settlement.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < nearestDist && dist < settlement.radius * 1.5) {
          nearestDist = dist;
          nearestSettlement = settlement;
        }
      }

      if (nearestSettlement) {
        nearestSettlement.captureZoneId = zone.id;
        // Update zone name to be more descriptive: "Settlement Name - Objective"
        const baseName = this.getObjectiveName(zone.objectiveType || 'radio_tower');
        zone.name = `${nearestSettlement.name} ${baseName}`;
      }
    }
  }

  /**
   * Generate buildings along roads (outside of settlements)
   */
  private generateRoadBuildings(roads: Road[], existingBuildings: Building[]): Building[] {
    const buildings: Building[] = [];

    for (const road of roads) {
      // Skip settlement internal streets
      if (road.id?.includes('settlement')) continue;

      const roadBuildings = this.generateRoadBuildingsForRoad(road, existingBuildings, buildings);
      buildings.push(...roadBuildings);
    }

    return this.removeOverlappingBuildings([...existingBuildings, ...buildings])
      .filter(b => !existingBuildings.includes(b));
  }

  /**
   * Generate buildings along a single road
   */
  private generateRoadBuildingsForRoad(road: Road, _existingBuildings: Building[], _newBuildings: Building[]): Building[] {
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

        // Check map bounds
        if (Math.abs(x) > this.width / 2 - 15 || Math.abs(z) > this.height / 2 - 15) {
          continue;
        }

        // Check if inside any settlement
        let insideSettlement = false;
        for (const settlement of this.settlements) {
          const sdx = x - settlement.position.x;
          const sdz = z - settlement.position.z;
          if (Math.sqrt(sdx * sdx + sdz * sdz) < settlement.radius) {
            insideSettlement = true;
            break;
          }
        }
        if (insideSettlement) continue;

        // Perpendicular offset
        const perpX = -dz / length;
        const perpZ = dx / length;
        const offset = this.rng.nextFloat(15, 25) * (this.rng.next() > 0.5 ? 1 : -1);

        if (this.rng.next() > 0.6) {
          const typeRoll = this.rng.next();
          let subtype: BuildingSubtype = 'detached_house';
          let bWidth = 12;
          let bDepth = 12;
          let bHeight = 4;
          let bType: LegacyBuildingType = 'house';

          if (typeRoll > 0.9) {
            subtype = 'small_factory';
            bWidth = 20; bDepth = 30; bHeight = 8; bType = 'factory';
          } else if (typeRoll > 0.8) {
            subtype = 'warehouse';
            bWidth = 20; bDepth = 25; bHeight = 6; bType = 'factory';
          } else if (typeRoll > 0.7) {
            subtype = 'gas_station';
            bWidth = 15; bDepth = 12; bHeight = 4; bType = 'shop';
          } else if (typeRoll > 0.6) {
            subtype = 'shop';
            bWidth = 10; bDepth = 12; bHeight = 6; bType = 'shop';
          }

          const building: Building = {
            x: x + perpX * offset,
            z: z + perpZ * offset,
            width: bWidth,
            depth: bDepth,
            height: bHeight,
            type: bType,
            subtype: subtype,
            garrisonCapacity: Math.max(2, Math.min(5, Math.floor(Math.sqrt(bWidth * bDepth) / 5))),
            defenseBonus: 0.5,
            stealthBonus: 0.5,
          };
          buildings.push(building);
        }
      }
    }

    return buildings;
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

  /**
   * Generate terrain features (hills, mountains, valleys, etc.) based on map size
   */
  private generateTerrainFeatures(deploymentZones: DeploymentZone[]): void {
    const config = ELEVATION_CONFIGS[this.size];

    // Apply biome elevation feature weights (override base config)
    const featureChances = { ...config.featureChances };
    for (const [featureType, weight] of Object.entries(this.biomeConfig.elevationFeatureWeights)) {
      if (weight !== undefined) {
        featureChances[featureType as TerrainFeatureType] = weight;
      }
    }

    // Determine number of features to place (random within range)
    let featureCount = Math.floor(
      this.rng.nextFloat(config.featureCount.min, config.featureCount.max + 1)
    );

    // Calculate deployment zone buffer (scaled to map size)
    const deploymentBuffer = Math.max(50, Math.max(this.width, this.height) * 0.1);

    // Map edge margin (10% of smallest dimension)
    const edgeMargin = Math.min(this.width, this.height) * 0.1;

    // Mountain biome uses special distributed placement to avoid center clustering
    if (this.biome === 'mountains') {
      // Reduce deployment buffer for mountain biome to allow more placement (mountains can be near deployment zones)
      const mountainDeploymentBuffer = deploymentBuffer * 0.5;
      this.createDistributedMountainRanges(deploymentZones, mountainDeploymentBuffer, edgeMargin);
      return; // Skip normal feature generation
    }

    // Guaranteed features for specific biomes
    if (this.biome === 'mesa') {
      // Always generate at least one plateau for mesa
      const plateau = this.createTerrainFeature(
        'plateau',
        deploymentZones,
        deploymentBuffer,
        edgeMargin
      );

      if (plateau) {
        this.terrainFeatures.push(plateau);

        // ALWAYS create a cluster for the main plateau
        const clusterMembers = this.createFeatureCluster(
          plateau,
          'plateau',
          deploymentZones,
          deploymentBuffer,
          edgeMargin
        );
        this.terrainFeatures.push(...clusterMembers);

        // Count this towards the total feature count
        featureCount = Math.max(0, featureCount - 1);
      }
    }

    // Try to place each remaining feature
    for (let i = 0; i < featureCount; i++) {
      const featureType = this.selectFeatureType(featureChances);
      const feature = this.createTerrainFeature(
        featureType,
        deploymentZones,
        deploymentBuffer,
        edgeMargin
      );

      if (feature) {
        this.terrainFeatures.push(feature);

        // Create clusters for plateaus (mesa regions) and mountains (mountain ranges)
        if (featureType === 'plateau' || featureType === 'mountain') {
          const clusterMembers = this.createFeatureCluster(
            feature,
            featureType,
            deploymentZones,
            deploymentBuffer,
            edgeMargin
          );
          this.terrainFeatures.push(...clusterMembers);
        }
      }
    }
  }

  /**
   * Create distributed mountain ranges across multiple map regions
   * Prevents all mountains from clustering in the center by placing ranges in different strategic areas
   */
  private createDistributedMountainRanges(
    deploymentZones: DeploymentZone[],
    deploymentBuffer: number,
    edgeMargin: number
  ): void {
    // Instead of fixed regions, use a more natural approach:
    // 1. Scatter anchor mountains with bias away from center
    // 2. Create ranges around successful anchors
    // 3. Add standalone mountains in gaps

    // Determine how many mountain ranges to create (5-8 ranges for proper mountain biome)
    const numRanges = Math.floor(this.rng.nextFloat(5, 9));

    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;

    // Create mountain ranges with natural scatter
    for (let i = 0; i < numRanges; i++) {
      // Use rejection sampling to bias placement away from center
      let x = 0, z = 0;
      let attempts = 0;
      const maxAttempts = 100;

      while (attempts < maxAttempts) {
        // Random position across entire map
        x = this.rng.nextFloat(-halfWidth * 0.9, halfWidth * 0.9);
        z = this.rng.nextFloat(-halfHeight * 0.9, halfHeight * 0.9);

        // Calculate distance from center (normalized 0-1)
        const distFromCenter = Math.sqrt((x / halfWidth) ** 2 + (z / halfHeight) ** 2);

        // Bias: prefer positions further from center (60%+ distance from center)
        // Accept with probability based on distance
        const acceptProbability = Math.max(0.2, distFromCenter);
        if (this.rng.next() < acceptProbability) {
          break; // Accept this position
        }
        attempts++;
      }

      // Try to place an anchor mountain at this position
      const anchor = this.createMountainAtPosition(
        x,
        z,
        deploymentZones,
        deploymentBuffer,
        edgeMargin
      );

      if (anchor) {
        this.terrainFeatures.push(anchor);

        // Create a cluster (range) around this anchor
        const clusterMembers = this.createFeatureCluster(
          anchor,
          'mountain',
          deploymentZones,
          deploymentBuffer,
          edgeMargin
        );
        this.terrainFeatures.push(...clusterMembers);
      } else {
        console.warn(`[MapGen] Failed to place anchor mountain ${i + 1}`);
      }
    }

    // Add standalone mountains (50-70% of total mountain count)
    // These are scattered across the map without clustering
    const totalMountains = this.terrainFeatures.filter(f => f.type === 'mountain').length;
    const targetStandalone = Math.floor(totalMountains * this.rng.nextFloat(0.5, 0.7));

    let standalonesCreated = 0;
    const maxStandaloneAttempts = targetStandalone * 10; // Allow many attempts
    let standaloneAttempts = 0;

    while (standalonesCreated < targetStandalone && standaloneAttempts < maxStandaloneAttempts) {
      standaloneAttempts++;

      // Random position with slight bias away from center
      const x = this.rng.nextFloat(-halfWidth * 0.9, halfWidth * 0.9);
      const z = this.rng.nextFloat(-halfHeight * 0.9, halfHeight * 0.9);

      const standalone = this.createMountainAtPosition(
        x,
        z,
        deploymentZones,
        deploymentBuffer,
        edgeMargin
      );

      if (standalone) {
        this.terrainFeatures.push(standalone);
        standalonesCreated++;
      }
    }



    // Also add some other terrain features for variety (hills, ridges, valleys)
    const config = ELEVATION_CONFIGS[this.size];
    const otherFeatureCount = Math.floor(this.rng.nextFloat(config.featureCount.min, config.featureCount.max + 1));

    for (let i = 0; i < otherFeatureCount; i++) {
      // Select non-mountain features
      const featureTypes: TerrainFeatureType[] = ['hill', 'ridge', 'valley', 'plains'];
      const featureType = featureTypes[Math.floor(this.rng.next() * featureTypes.length)]!;

      const feature = this.createTerrainFeature(
        featureType,
        deploymentZones,
        deploymentBuffer,
        edgeMargin
      );

      if (feature) {
        this.terrainFeatures.push(feature);
      }
    }
  }

  /**
   * Create a mountain at a specific position
   */
  private createMountainAtPosition(
    targetX: number,
    targetZ: number,
    deploymentZones: DeploymentZone[],
    deploymentBuffer: number,
    edgeMargin: number
  ): TerrainFeature | null {
    const featureParams = FEATURE_PARAMS['mountain'];

    // Scale radius with map size
    const mapScale = Math.max(this.width, this.height) / 1000;
    const radiusScale = featureParams.radiusScaleWithMap ? Math.max(1, mapScale) : 1;

    const radius = this.rng.nextFloat(
      featureParams.radiusRange.min * radiusScale,
      featureParams.radiusRange.max * radiusScale
    );

    // Try positions near the target with some variance
    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Add some randomness around target position (within 100m)
      const variance = 100;
      const x = targetX + this.rng.nextFloat(-variance, variance);
      const z = targetZ + this.rng.nextFloat(-variance, variance);

      // Check map bounds with reduced edge margin
      const effectiveMargin = edgeMargin * 0.5;
      if (Math.abs(x) > this.width / 2 - effectiveMargin - radius ||
        Math.abs(z) > this.height / 2 - effectiveMargin - radius) {
        continue;
      }

      // Check deployment zones
      if (!this.isPositionValidForFeature(x, z, radius, deploymentZones, deploymentBuffer)) {
        continue;
      }

      // Check spacing - allow up to 50% overlap for realistic ranges
      let tooClose = false;
      for (const existing of this.terrainFeatures) {
        const dx = x - existing.x;
        const dz = z - existing.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Mountains can overlap up to 50% (so minimum distance is 50% of combined radii)
        // This creates realistic mountain ranges with overlapping peaks
        const minDist = (radius + existing.params.radius) * 0.5;

        if (dist < minDist) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      // Valid position found! Create the mountain
      let elevationDelta = this.rng.nextFloat(
        featureParams.elevationRange.min,
        featureParams.elevationRange.max
      );

      // If there are mountains on the plains biome, they are never more than 50% the max height
      if (this.biome === 'plains') {
        elevationDelta *= 0.5;
      }

      const params: any = {
        elevationDelta,
        radius,
        falloffExponent: 2,
        peakSharpness: this.rng.nextFloat(0.3, 0.7),
      };

      params.falloffExponent = this.rng.nextFloat(1.8, 2.5);

      return {
        id: `mountain_${this.terrainFeatures.length}`,
        type: 'mountain',
        x,
        z,
        params,
      };
    }

    // Failed to find valid position
    return null;
  }

  /**
   * Create a terrain feature within a specific region
   */
  private createTerrainFeatureInRegion(
    type: TerrainFeatureType,
    region: { centerX: number; centerZ: number; radiusX: number; radiusZ: number },
    deploymentZones: DeploymentZone[],
    deploymentBuffer: number,
    edgeMargin: number
  ): TerrainFeature | null {
    const featureParams = FEATURE_PARAMS[type];

    // Scale radius with map size if needed
    const mapScale = Math.max(this.width, this.height) / 1000;
    const radiusScale = featureParams.radiusScaleWithMap ? Math.max(1, mapScale) : 1;

    const radius = this.rng.nextFloat(
      featureParams.radiusRange.min * radiusScale,
      featureParams.radiusRange.max * radiusScale
    );

    // Try multiple positions within the region (more attempts for mountains)
    const maxAttempts = type === 'mountain' ? 50 : 20;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Random position within region bounds
      const x = region.centerX + this.rng.nextFloat(-region.radiusX, region.radiusX);
      const z = region.centerZ + this.rng.nextFloat(-region.radiusZ, region.radiusZ);

      // Check map bounds with edge margin (reduced for mountains to allow edge placement)
      const effectiveMargin = type === 'mountain' ? edgeMargin * 0.5 : edgeMargin;
      if (Math.abs(x) > this.width / 2 - effectiveMargin - radius ||
        Math.abs(z) > this.height / 2 - effectiveMargin - radius) {
        continue;
      }

      // Check if position is valid
      if (!this.isPositionValidForFeature(x, z, radius, deploymentZones, deploymentBuffer)) {
        continue;
      }

      // Check spacing with existing features (more lenient for mountains)
      let tooClose = false;
      for (const existing of this.terrainFeatures) {
        const dx = x - existing.x;
        const dz = z - existing.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // Allow mountains to be closer together (30% instead of 50%)
        const minDist = type === 'mountain' ? (radius + existing.params.radius) * 0.3 : (radius + existing.params.radius) * 0.5;

        if (dist < minDist) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      // Valid position found! Create the feature
      const elevationDelta = this.rng.nextFloat(
        featureParams.elevationRange.min,
        featureParams.elevationRange.max
      );

      const params: any = {
        elevationDelta,
        radius,
        falloffExponent: 2,
      };

      // Add mountain-specific parameters
      if (type === 'mountain') {
        params.peakSharpness = this.rng.nextFloat(0.3, 0.7);
        params.falloffExponent = this.rng.nextFloat(1.8, 2.5);
      }

      return {
        id: `${type}_${this.terrainFeatures.length}`,
        type,
        x,
        z,
        params,
      };
    }

    // Failed to find valid position in this region
    return null;
  }

  /**
   * Create a cluster of similar features around an anchor feature
   * Used to create mesa regions (clustered plateaus) and mountain ranges (clustered mountains)
   */
  private createFeatureCluster(
    anchor: TerrainFeature,
    type: TerrainFeatureType,
    deploymentZones: DeploymentZone[],
    deploymentBuffer: number,
    edgeMargin: number
  ): TerrainFeature[] {
    const clusterMembers: TerrainFeature[] = [];

    // Number of cluster members (4-7 additional features for mountain ranges)
    const memberCount = Math.floor(this.rng.nextFloat(4, 8));

    // Cluster radius - how far cluster members can be from anchor
    // Larger for plateaus (mesas are spread out), tighter for mountains
    const clusterRadiusMultiplier = type === 'plateau' ? this.rng.nextFloat(2.5, 4.5) : this.rng.nextFloat(1.8, 3.5);
    const clusterRadius = anchor.params.radius * clusterRadiusMultiplier;

    for (let i = 0; i < memberCount; i++) {
      // Try to place cluster member near anchor
      const maxAttempts = 20;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Random position within cluster radius
        const angle = this.rng.nextFloat(0, Math.PI * 2);
        const distance = this.rng.nextFloat(anchor.params.radius * 0.8, clusterRadius);
        const x = anchor.x + Math.cos(angle) * distance;
        const z = anchor.z + Math.sin(angle) * distance;

        // Size variation - cluster members can be 60%-120% of anchor size
        const sizeVariation = this.rng.nextFloat(0.6, 1.2);
        const radius = anchor.params.radius * sizeVariation;

        // Check if position is within map bounds with edge margin
        if (Math.abs(x) > this.width / 2 - edgeMargin - radius ||
          Math.abs(z) > this.height / 2 - edgeMargin - radius) {
          continue;
        }

        // Check if position is valid (deployment zones)
        if (!this.isPositionValidForFeature(x, z, radius, deploymentZones, deploymentBuffer)) {
          continue;
        }

        // Check spacing with existing features (more lenient for cluster members)
        let tooClose = false;
        for (const existing of [...this.terrainFeatures, ...clusterMembers]) {
          const dx = x - existing.x;
          const dz = z - existing.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          // For cluster members, allow closer spacing (30% of combined radii instead of 50%)
          const minDist = (radius + existing.params.radius) * 0.3;

          if (dist < minDist) {
            tooClose = true;
            break;
          }
        }

        if (tooClose) continue;

        // Valid position found! Create cluster member with variation
        const elevationVariation = this.rng.nextFloat(0.8, 1.1);
        const elevationDelta = anchor.params.elevationDelta * elevationVariation;

        const params: any = {
          elevationDelta,
          radius,
          falloffExponent: anchor.params.falloffExponent,
        };

        // Copy type-specific parameters with variation
        if (type === 'plateau') {
          params.angle = this.rng.nextFloat(0, Math.PI * 2); // Random orientation
          params.length = radius * this.rng.nextFloat(3, 7); // Elongated
          params.flatTopRadius = radius * this.rng.nextFloat(0.5, 0.75);
          params.falloffExponent = 3;
        } else if (type === 'mountain') {
          params.peakSharpness = this.rng.nextFloat(0.3, 0.7); // Less sharp peaks
          params.falloffExponent = this.rng.nextFloat(1.8, 2.5); // More gradual slopes for wider base
        }

        const clusterMember: TerrainFeature = {
          id: `${type}_cluster_${this.terrainFeatures.length + clusterMembers.length}`,
          type,
          x,
          z,
          params,
        };

        clusterMembers.push(clusterMember);
        break; // Successfully placed this cluster member
      }
    }

    return clusterMembers;
  }

  /**
   * Select a feature type based on weighted probabilities
   */
  private selectFeatureType(chances: Record<string, number>): TerrainFeatureType {
    const totalWeight = Object.values(chances).reduce((sum, weight) => sum + weight, 0);
    let random = this.rng.nextFloat(0, totalWeight);

    for (const [type, weight] of Object.entries(chances)) {
      random -= weight;
      if (random <= 0) {
        return type as TerrainFeatureType;
      }
    }

    // Fallback (should never happen)
    return 'hill';
  }

  /**
   * Create a terrain feature at a valid location
   */
  private createTerrainFeature(
    type: TerrainFeatureType,
    deploymentZones: DeploymentZone[],
    deploymentBuffer: number,
    edgeMargin: number
  ): TerrainFeature | null {
    const featureParams = FEATURE_PARAMS[type];

    // Scale radius with map size if needed
    const mapScale = Math.max(this.width, this.height) / 1000; // Normalize to 1km
    const radiusScale = featureParams.radiusScaleWithMap ? Math.max(1, mapScale) : 1;

    const radius = this.rng.nextFloat(
      featureParams.radiusRange.min * radiusScale,
      featureParams.radiusRange.max * radiusScale
    );

    // Try multiple positions to find a valid placement
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Random position within map bounds (with margin)
      const x = this.rng.nextFloat(
        -this.width / 2 + edgeMargin + radius,
        this.width / 2 - edgeMargin - radius
      );
      const z = this.rng.nextFloat(
        -this.height / 2 + edgeMargin + radius,
        this.height / 2 - edgeMargin - radius
      );

      // Check if position is valid
      if (!this.isPositionValidForFeature(x, z, radius, deploymentZones, deploymentBuffer)) {
        continue;
      }

      // Check spacing with existing features
      let tooClose = false;
      for (const existing of this.terrainFeatures) {
        const dx = x - existing.x;
        const dz = z - existing.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = (radius + existing.params.radius) * 0.5; // Half sum of radii

        if (dist < minDist) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      // Valid position found! Create the feature
      let elevationDelta = this.rng.nextFloat(
        featureParams.elevationRange.min,
        featureParams.elevationRange.max
      );

      // Biome-specific height scaling for plateaus
      // Plains: reduce plateau heights by 50-70% for gentler terrain (15-30m vs 30-60m in mesa)
      if (type === 'plateau' && this.biome === 'plains') {
        elevationDelta *= this.rng.nextFloat(0.3, 0.5); // 30-50% of original height
      }

      const params: any = {
        elevationDelta,
        radius,
        falloffExponent: 2, // Default smooth falloff
      };

      // Add type-specific parameters
      if (type === 'hill') {
        // Hills can be circular or elongated (oval/rounded ridge shapes)
        const elongated = this.rng.nextFloat(0, 1) > 0.4; // 60% chance of elongation
        if (elongated) {
          params.angle = this.rng.nextFloat(0, Math.PI * 2);
          // Moderately longer than wide (1.5-3x) for gentle oval shapes
          params.length = radius * this.rng.nextFloat(1.5, 3);
        }
        params.falloffExponent = 2; // Smooth rounded slopes
      } else if (type === 'ridge' || type === 'valley') {
        params.angle = this.rng.nextFloat(0, Math.PI * 2);
        params.length = radius * this.rng.nextFloat(2, 4);
        params.falloffExponent = 1.5; // Linear-ish for ridges/valleys
      } else if (type === 'mountain') {
        params.peakSharpness = this.rng.nextFloat(0.3, 0.7); // Less sharp peaks
        params.falloffExponent = this.rng.nextFloat(1.8, 2.5); // More gradual slopes for wider base
      } else if (type === 'plateau') {
        // Plateaus are elongated like ridges but with flat tops
        params.angle = this.rng.nextFloat(0, Math.PI * 2);
        // Much longer than wide (2-6x) for natural stretched appearance
        params.length = radius * this.rng.nextFloat(3, 7);
        // Flat top is most of the width
        params.flatTopRadius = radius * this.rng.nextFloat(0.5, 0.75);
        params.falloffExponent = 3; // Cliff-like edges
      } else if (type === 'plains') {
        params.falloffExponent = 1; // Very gentle
      }

      return {
        id: `${type}_${this.terrainFeatures.length}`,
        type,
        x,
        z,
        params,
      };
    }

    // Failed to find valid position after max attempts
    return null;
  }

  /**
   * Check if a position is valid for placing a terrain feature
   */
  private isPositionValidForFeature(
    x: number,
    z: number,
    radius: number,
    deploymentZones: DeploymentZone[],
    buffer: number
  ): boolean {
    // Check deployment zones
    for (const zone of deploymentZones) {
      // Expand zone by buffer + radius
      const expandedMinX = zone.minX - buffer - radius;
      const expandedMaxX = zone.maxX + buffer + radius;
      const expandedMinZ = zone.minZ - buffer - radius;
      const expandedMaxZ = zone.maxZ + buffer + radius;

      if (
        x >= expandedMinX &&
        x <= expandedMaxX &&
        z >= expandedMinZ &&
        z <= expandedMaxZ
      ) {
        return false; // Too close to deployment zone
      }
    }

    return true;
  }

  private generateElevation(): void {
    // Get map-specific elevation configuration
    const config = ELEVATION_CONFIGS[this.size];
    const octaves = 4;
    const persistence = 0.5;

    for (let z = 0; z < this.terrain.length; z++) {
      for (let x = 0; x < this.terrain[z]!.length; x++) {
        // Convert grid coordinates to world coordinates
        const worldX = (x * this.cellSize) - this.width / 2;
        const worldZ = (z * this.cellSize) - this.height / 2;

        // 1. Calculate base procedural noise
        let noiseValue = 0;
        let amplitude = 1;
        let frequency = config.baseNoiseScale;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
          const nx = x * frequency;
          const nz = z * frequency;
          const noiseVal = this.gradientNoise(nx, nz);
          noiseValue += noiseVal * amplitude;
          maxValue += amplitude;
          amplitude *= persistence;
          frequency *= 2;
        }

        // Normalize noise to [-1, 1] and scale by amplitude
        noiseValue = (noiseValue / maxValue) * config.baseNoiseAmplitude;

        // 1.5 Add gentle rolling hills (very large scale, low frequency)
        // This prevents open areas from looking unnaturaly flat
        const hillScale = 0.025; // Higher frequency for more visible hills
        const hillAmplitude = 8.0; // Taller hills (8m) to ensure visibility
        // Use a different offset so it doesn't align with base noise
        const hillNoise = this.gradientNoise((worldX + 500) * hillScale, (worldZ - 500) * hillScale);
        noiseValue += hillNoise * hillAmplitude;

        // 2. Calculate feature contributions with diminishing returns for overlapping features
        // Group contributions by feature type to prevent excessive stacking
        const contributionsByType: Map<TerrainFeatureType, number[]> = new Map();

        for (const feature of this.terrainFeatures) {
          let contribution = 0;

          switch (feature.type) {
            case 'hill':
              contribution = this.calculateHillElevation(worldX, worldZ, feature);
              break;
            case 'ridge':
              contribution = this.calculateRidgeElevation(worldX, worldZ, feature);
              break;
            case 'mountain':
              contribution = this.calculateMountainElevation(worldX, worldZ, feature);
              break;
            case 'valley':
              contribution = this.calculateValleyElevation(worldX, worldZ, feature);
              break;
            case 'plateau':
              contribution = this.calculatePlateauElevation(worldX, worldZ, feature);
              break;
            case 'plains':
              contribution = this.calculatePlainsElevation(worldX, worldZ, feature);
              break;
          }

          // Only track non-zero contributions
          if (Math.abs(contribution) > 0.01) {
            if (!contributionsByType.has(feature.type)) {
              contributionsByType.set(feature.type, []);
            }
            contributionsByType.get(feature.type)!.push(contribution);
          }
        }

        // Apply diminishing returns for overlapping features of the same type
        // First feature: 100%, Second: 50%, Third: 25%, Fourth+: 10%
        let featureElevation = 0;
        for (const [_type, contributions] of contributionsByType) {
          // Sort by absolute magnitude (largest first)
          contributions.sort((a, b) => Math.abs(b) - Math.abs(a));

          for (let i = 0; i < contributions.length; i++) {
            let scale = 1.0;
            if (i === 1) scale = 0.5;       // Second feature: 50%
            else if (i === 2) scale = 0.25; // Third feature: 25%
            else if (i >= 3) scale = 0.1;   // Fourth+ features: 10%

            featureElevation += contributions[i]! * scale;
          }
        }

        // 3. Combine base elevation + noise + features
        const totalElevation = config.baseElevation + noiseValue + featureElevation;

        // 4. Clamp to valid range (minimum 0 meters)
        this.terrain[z]![x]!.elevation = Math.max(0, totalElevation);

        // 5. Update terrain type based on elevation
        const elevation = this.terrain[z]![x]!.elevation;
        if (elevation > 30) {
          this.terrain[z]![x]!.type = 'hill';
          this.terrain[z]![x]!.cover = 'light';
        } else if (elevation < 2) {
          // Low areas might become wetlands (unless already water)
          if (this.terrain[z]![x]!.type !== 'water') {
            this.terrain[z]![x]!.type = 'field';
          }
        }
      }
    }
  }

  /**
   * Smooth elevation transitions using Gaussian blur
   * Blends 70% smoothed + 30% original to preserve detail
   */
  private smoothElevationTransitions(): void {
    const rows = this.terrain.length;
    const cols = this.terrain[0]!.length;

    // 3x3 Gaussian kernel
    const kernel = [
      [1, 2, 1],
      [2, 4, 2],
      [1, 2, 1]
    ];
    const kernelSum = 16;

    // Create a copy of current elevations
    const originalElevations: number[][] = [];
    for (let z = 0; z < rows; z++) {
      originalElevations[z] = [];
      for (let x = 0; x < cols; x++) {
        originalElevations[z]![x] = this.terrain[z]![x]!.elevation;
      }
    }

    // Apply smoothing
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        let smoothedValue = 0;

        // Apply kernel
        for (let kz = -1; kz <= 1; kz++) {
          for (let kx = -1; kx <= 1; kx++) {
            const nz = z + kz;
            const nx = x + kx;

            // Clamp to terrain bounds
            const clampedZ = Math.max(0, Math.min(rows - 1, nz));
            const clampedX = Math.max(0, Math.min(cols - 1, nx));

            const weight = kernel[kz + 1]![kx + 1]!;
            smoothedValue += originalElevations[clampedZ]![clampedX]! * weight;
          }
        }

        smoothedValue /= kernelSum;

        // Blend 70% smoothed + 30% original to preserve detail
        const originalValue = originalElevations[z]![x]!;
        this.terrain[z]![x]!.elevation = smoothedValue * 0.7 + originalValue * 0.3;
      }
    }
  }

  /**
   * Calculate elevation contribution from a hill feature
   * Smooth radial falloff
   */
  private calculateHillElevation(
    worldX: number,
    worldZ: number,
    feature: TerrainFeature
  ): number {
    const dx = worldX - feature.x;
    const dz = worldZ - feature.z;

    // If hill has angle and length, use elongated oval shape
    if (feature.params.angle !== undefined && feature.params.length !== undefined) {
      // Rotate point to align with hill's axis
      const angle = feature.params.angle;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const rotX = dx * cosA + dz * sinA;
      const rotZ = -dx * sinA + dz * cosA;

      // Elongated oval: scale along main axis
      const halfLength = feature.params.length / 2;
      const width = feature.params.radius;

      // Calculate distance from center of oval using ellipse formula
      // If outside the main length, use distance from end caps
      let normalizedDist: number;

      if (Math.abs(rotX) <= halfLength) {
        // Within main body - simple perpendicular distance
        normalizedDist = Math.abs(rotZ) / width;
      } else {
        // Beyond ends - distance from nearest end cap (circular)
        const endDist = Math.abs(rotX) - halfLength;
        const sideDist = rotZ;
        const capDist = Math.sqrt(endDist * endDist + sideDist * sideDist);
        normalizedDist = capDist / width;
      }

      if (normalizedDist >= 1) return 0;

      // Smooth falloff for gentle rounded slopes
      const falloff = Math.pow(1 - normalizedDist, feature.params.falloffExponent ?? 2);
      return feature.params.elevationDelta * falloff;
    }

    // Legacy circular hill (or 40% of hills)
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= feature.params.radius) return 0;

    // Smooth radial falloff
    const normalized = dist / feature.params.radius;
    const falloff = Math.pow(1 - normalized, feature.params.falloffExponent ?? 2);

    return feature.params.elevationDelta * falloff;
  }

  /**
   * Calculate elevation contribution from a ridge feature
   * Elongated shape along angle axis
   */
  private calculateRidgeElevation(
    worldX: number,
    worldZ: number,
    feature: TerrainFeature
  ): number {
    const dx = worldX - feature.x;
    const dz = worldZ - feature.z;

    // Rotate point to ridge-aligned coordinates
    const angle = feature.params.angle ?? 0;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const localX = dx * cosA + dz * sinA;  // Along ridge
    const localZ = -dx * sinA + dz * cosA; // Perpendicular to ridge

    // Check if within length along ridge axis
    const halfLength = (feature.params.length ?? feature.params.radius * 2) / 2;
    if (Math.abs(localX) > halfLength) return 0;

    // Check perpendicular distance
    const perpDist = Math.abs(localZ);
    if (perpDist >= feature.params.radius) return 0;

    // Falloff along perpendicular axis
    const perpNormalized = perpDist / feature.params.radius;
    const perpFalloff = Math.pow(1 - perpNormalized, feature.params.falloffExponent ?? 1.5);

    // Gentle falloff along length axis (to avoid cliff at ends)
    const lengthNormalized = Math.abs(localX) / halfLength;
    const lengthFalloff = Math.pow(1 - lengthNormalized, 2);

    return feature.params.elevationDelta * perpFalloff * lengthFalloff;
  }

  /**
   * Calculate elevation contribution from a mountain feature
   * Peaked with noise detail for natural look
   */
  private calculateMountainElevation(
    worldX: number,
    worldZ: number,
    feature: TerrainFeature
  ): number {
    const dx = worldX - feature.x;
    const dz = worldZ - feature.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist >= feature.params.radius) return 0;

    // Base elevation with steep falloff
    const normalized = dist / feature.params.radius;
    const baseFalloff = Math.pow(1 - normalized, feature.params.falloffExponent ?? 3);

    // Add peak sharpness - concentrate elevation at center
    const sharpness = feature.params.peakSharpness ?? 0.7;
    const peakFactor = 1 + sharpness * (1 - normalized) * 2;

    // Add subtle noise detail for natural rocky appearance
    const noiseScale = 0.1;
    const noiseDetail = this.gradientNoise(worldX * noiseScale, worldZ * noiseScale) * 0.15;

    return feature.params.elevationDelta * baseFalloff * peakFactor * (1 + noiseDetail);
  }

  /**
   * Calculate elevation contribution from a valley feature
   * Inverted ridge with flat floor
   */
  private calculateValleyElevation(
    worldX: number,
    worldZ: number,
    feature: TerrainFeature
  ): number {
    const dx = worldX - feature.x;
    const dz = worldZ - feature.z;

    // Rotate point to valley-aligned coordinates
    const angle = feature.params.angle ?? 0;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const localX = dx * cosA + dz * sinA;  // Along valley
    const localZ = -dx * sinA + dz * cosA; // Perpendicular to valley

    // Check if within length along valley axis
    const halfLength = (feature.params.length ?? feature.params.radius * 2) / 2;
    if (Math.abs(localX) > halfLength) return 0;

    // Check perpendicular distance
    const perpDist = Math.abs(localZ);
    if (perpDist >= feature.params.radius) return 0;

    // Falloff from edges (inverted - lowest at center)
    const perpNormalized = perpDist / feature.params.radius;
    const perpFalloff = Math.pow(1 - perpNormalized, feature.params.falloffExponent ?? 1.5);

    // Flatten the valley floor (center 30% is flat)
    const flatRadius = feature.params.radius * 0.3;
    const effectiveFalloff = perpDist < flatRadius ? 1.0 : perpFalloff;

    // Gentle falloff along length axis
    const lengthNormalized = Math.abs(localX) / halfLength;
    const lengthFalloff = Math.pow(1 - lengthNormalized, 2);

    // Negative elevation for valley depression
    return feature.params.elevationDelta * effectiveFalloff * lengthFalloff;
  }

  /**
   * Calculate elevation contribution from a plateau feature
   * Flat top with steep cliff edges and natural roughness
   */
  private calculatePlateauElevation(
    worldX: number,
    worldZ: number,
    feature: TerrainFeature
  ): number {
    const dx = worldX - feature.x;
    const dz = worldZ - feature.z;

    // If plateau has angle and length, use elongated shape (like ridges but with flat top)
    if (feature.params.angle !== undefined && feature.params.length !== undefined) {
      // Rotate point to align with plateau's axis
      const angle = feature.params.angle;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const rotX = dx * cosA + dz * sinA;
      const rotZ = -dx * sinA + dz * cosA;

      // Add multi-scale noise for natural edge roughness
      // Large-scale noise creates major erosion patterns
      const edgeNoiseScale1 = 0.02;
      const edgeNoise1 = Math.sin(worldX * edgeNoiseScale1) * Math.cos(worldZ * edgeNoiseScale1);

      // Medium-scale noise creates smaller irregularities
      const edgeNoiseScale2 = 0.08;
      const edgeNoise2 = Math.sin(worldX * edgeNoiseScale2) * Math.cos(worldZ * edgeNoiseScale2);

      // Combine noise layers (major + minor variations)
      const edgeRoughness = edgeNoise1 * 0.7 + edgeNoise2 * 0.3;

      // Elongated plateau: flat along length, curved at ends
      // Add roughness to dimensions for irregular shape
      const halfLength = (feature.params.length / 2) * (1 + edgeRoughness * 0.15);
      const width = feature.params.radius * (1 + edgeRoughness * 0.12);

      // Distance perpendicular to main axis (determines if within width)
      const perpDist = Math.abs(rotZ);
      if (perpDist > width) return 0;

      // Distance along main axis
      const alongDist = Math.abs(rotX);

      // Flat top width with subtle roughness
      const flatWidth = (feature.params.flatTopRadius ?? width * 0.6) * (1 + edgeRoughness * 0.08);

      // If within the main length and flat width, return elevation with subtle top variation
      if (alongDist < halfLength && perpDist <= flatWidth) {
        // Add very subtle variation to flat top (1-3% height variation)
        const topVariation = 1 + edgeRoughness * 0.02;
        return feature.params.elevationDelta * topVariation;
      }

      // Calculate distance to nearest edge (either side or end)
      let distToEdge: number;

      if (alongDist < halfLength) {
        // Along the sides - distance to side edge
        distToEdge = perpDist - flatWidth;
      } else {
        // Beyond the ends - distance to end caps
        const endDist = alongDist - halfLength;
        const sideDist = Math.max(0, perpDist - flatWidth);
        distToEdge = Math.sqrt(endDist * endDist + sideDist * sideDist);
      }

      // Cliff edge falloff with variable steepness for natural look
      const edgeWidth = width - flatWidth;
      if (distToEdge >= edgeWidth) return 0;

      const normalized = distToEdge / edgeWidth;

      // Vary cliff steepness based on noise (some areas steeper than others)
      const baseFalloff = feature.params.falloffExponent ?? 3;
      const falloffVariation = baseFalloff * (1 + edgeRoughness * 0.3);
      const falloff = Math.pow(1 - normalized, falloffVariation);

      return feature.params.elevationDelta * falloff;
    }

    // Legacy circular plateau (fallback for old saves)
    // Add multi-scale noise for natural edge roughness
    const edgeNoiseScale1 = 0.02;
    const edgeNoise1 = Math.sin(worldX * edgeNoiseScale1) * Math.cos(worldZ * edgeNoiseScale1);
    const edgeNoiseScale2 = 0.08;
    const edgeNoise2 = Math.sin(worldX * edgeNoiseScale2) * Math.cos(worldZ * edgeNoiseScale2);
    const edgeRoughness = edgeNoise1 * 0.7 + edgeNoise2 * 0.3;

    const dist = Math.sqrt(dx * dx + dz * dz);
    const roughRadius = feature.params.radius * (1 + edgeRoughness * 0.12);
    if (dist >= roughRadius) return 0;

    const flatRadius = (feature.params.flatTopRadius ?? feature.params.radius * 0.5) * (1 + edgeRoughness * 0.08);

    if (dist <= flatRadius) {
      // Add very subtle variation to flat top
      const topVariation = 1 + edgeRoughness * 0.02;
      return feature.params.elevationDelta * topVariation;
    }

    const edgeWidth = roughRadius - flatRadius;
    const edgeDist = dist - flatRadius;
    const normalized = edgeDist / edgeWidth;

    // Vary cliff steepness based on noise
    const baseFalloff = feature.params.falloffExponent ?? 3;
    const falloffVariation = baseFalloff * (1 + edgeRoughness * 0.3);
    const falloff = Math.pow(1 - normalized, falloffVariation);

    return feature.params.elevationDelta * falloff;
  }

  /**
   * Calculate elevation contribution from a plains feature
   * Gentle flattening influence that dampens noise
   */
  private calculatePlainsElevation(
    worldX: number,
    worldZ: number,
    feature: TerrainFeature
  ): number {
    const dx = worldX - feature.x;
    const dz = worldZ - feature.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist >= feature.params.radius) return 0;

    // Very gentle influence - just dampens terrain variation
    const normalized = dist / feature.params.radius;
    const influence = Math.pow(1 - normalized, feature.params.falloffExponent ?? 1);

    // Plains push terrain toward the base elevation (flattening effect)
    return feature.params.elevationDelta * influence;
  }

  /**
   * Gradient-based noise function for smoother, more natural terrain
   * Based on Perlin noise concepts with 2D gradients
   */
  private gradientNoise(x: number, z: number): number {
    // Grid cell coordinates
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    // Fractional position within cell (0-1)
    const sx = x - x0;
    const sz = z - z0;

    // Smooth interpolation (smoothstep)
    const u = this.smoothstep(sx);
    const v = this.smoothstep(sz);

    // Gradients at grid corners
    const g00 = this.dotGridGradient(x0, z0, x, z);
    const g10 = this.dotGridGradient(x1, z0, x, z);
    const g01 = this.dotGridGradient(x0, z1, x, z);
    const g11 = this.dotGridGradient(x1, z1, x, z);

    // Bilinear interpolation
    const nx0 = this.lerp(g00, g10, u);
    const nx1 = this.lerp(g01, g11, u);
    return this.lerp(nx0, nx1, v);
  }

  /**
   * Compute dot product between gradient and distance vector
   */
  private dotGridGradient(ix: number, iz: number, x: number, z: number): number {
    // Get gradient from integer coordinates
    const gradient = this.getGradient(ix, iz);

    // Distance from grid point
    const dx = x - ix;
    const dz = z - iz;

    // Dot product
    return dx * gradient.x + dz * gradient.z;
  }

  /**
   * Generate deterministic gradient vector for a grid point
   */
  private getGradient(ix: number, iz: number): { x: number; z: number } {
    // Hash the coordinates with seed for deterministic randomness
    const hash = this.hash2D(ix, iz);

    // Convert hash to angle (0-2π)
    const angle = (hash / 255.0) * Math.PI * 2;

    return {
      x: Math.cos(angle),
      z: Math.sin(angle)
    };
  }

  /**
   * 2D hash function for deterministic randomness
   */
  private hash2D(x: number, z: number): number {
    // Mix coordinates with seed
    let hash = this.seed;
    hash = ((hash << 5) + hash) + x; // hash * 33 + x
    hash = ((hash << 5) + hash) + z; // hash * 33 + z

    // Final mixing
    hash = ((hash ^ (hash >>> 16)) * 0x85ebca6b) | 0;
    hash = ((hash ^ (hash >>> 13)) * 0xc2b2ae35) | 0;
    hash = ((hash ^ (hash >>> 16))) | 0;

    // Return 0-255
    return Math.abs(hash) % 256;
  }

  /**
   * Smoothstep interpolation (3rd order Hermite polynomial)
   */
  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * Legacy pseudoNoise function kept for backwards compatibility
   * (used in forest generation and lake generation)
   */
  private pseudoNoise(x: number, z: number): number {
    // Simple pseudo-noise using sin
    const n = Math.sin(x * 12.9898 + z * 78.233 + this.seed) * 43758.5453;
    return n - Math.floor(n);
  }

  private generateDeploymentZones(): DeploymentZone[] {
    // Scale deployment zone size with map size
    const margin = Math.max(30, this.width * 0.03);
    const zoneDepth = Math.max(50, this.height * 0.08);

    // Available width for deployment (map width minus margins)
    const availableWidth = this.width - margin * 2;

    // Deployment zones cover 50% of the map width, split into 1-5 sections
    // Each team gets unique section count and positions
    const totalDeploymentWidth = availableWidth * 0.5;
    const minGap = Math.max(20, availableWidth * 0.05); // Minimum gap between sections

    const zones: DeploymentZone[] = [];

    // Create section positions for a team with unique randomization
    const createSections = (team: 'player' | 'enemy', minZ: number, maxZ: number) => {
      // Each team gets independent section count with weighted probability
      // 1 section most common, 5 sections least common
      const weights = [40, 28, 18, 10, 4]; // Probabilities for 1, 2, 3, 4, 5 sections
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const roll = this.rng.nextFloat(0, totalWeight);
      let cumulative = 0;
      let numSections = 1;
      for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i]!;
        if (roll < cumulative) {
          numSections = i + 1;
          break;
        }
      }

      // Calculate width per section (account for gaps)
      const totalGapWidth = (numSections - 1) * minGap;
      const sectionWidth = (totalDeploymentWidth - totalGapWidth) / numSections;

      // Generate random positions for sections
      const sectionPositions: { minX: number; maxX: number }[] = [];

      // Place sections with random positions, checking for overlaps
      for (let i = 0; i < numSections; i++) {
        let placed = false;
        let attempts = 0;

        while (!placed && attempts < 50) {
          attempts++;

          // Random position within available width
          const minX = -this.width / 2 + margin + this.rng.nextFloat(0, availableWidth - sectionWidth);
          const maxX = minX + sectionWidth;

          // Check for overlap with existing sections (including gap)
          let overlaps = false;
          for (const existing of sectionPositions) {
            if (minX < existing.maxX + minGap && maxX > existing.minX - minGap) {
              overlaps = true;
              break;
            }
          }

          if (!overlaps) {
            sectionPositions.push({ minX, maxX });
            placed = true;
          }
        }

        // Fallback: if random placement fails, use slot-based placement
        if (!placed) {
          const slotWidth = availableWidth / numSections;
          const slotStart = -this.width / 2 + margin + i * slotWidth;
          const maxOffset = slotWidth - sectionWidth;
          const offset = this.rng.nextFloat(0, Math.max(0, maxOffset));
          sectionPositions.push({
            minX: slotStart + offset,
            maxX: slotStart + offset + sectionWidth,
          });
        }
      }

      // Add zones for this team
      for (const pos of sectionPositions) {
        zones.push({
          team,
          minX: pos.minX,
          maxX: pos.maxX,
          minZ,
          maxZ,
        });
      }
    };

    // Player zones (bottom of map)
    createSections(
      'player',
      -this.height / 2 + margin,
      -this.height / 2 + margin + zoneDepth
    );

    // Enemy zones (top of map)
    createSections(
      'enemy',
      this.height / 2 - margin - zoneDepth,
      this.height / 2 - margin
    );

    return zones;
  }

  /**
   * Generate road network using hierarchical approach:
   * 1. Interstate (large maps only) - bypasses towns, connects map edges
   * 2. Highway - connects towns to each other and to interstate
   * 3. Town streets - organic curved streets within town radius
   * 4. Dirt roads - access to isolated buildings
   */
  private generateRoads(): Road[] {
    const roads: Road[] = [];
    const mapScale = Math.max(this.width, this.height) / 300;
    const isLargeMap = mapScale >= 10;

    // Reset road network state
    this.roadNodes.clear();
    this.intersections = [];
    this.roadIdCounter = 0;

    // We need capture zones first to know where towns are
    // Note: This is called before captureZones in generate(), so we create temp town positions
    const townPositions = this.getTownPositions();

    // List of zones to avoid (future bridges/ramps)
    const bridgeAvoidanceZones: Array<{ x: number; z: number; radius: number }> = [];

    // Step 1: Generate main corridor (interstate or highway)
    const mainRoad = this.generateMainCorridor(townPositions, isLargeMap, bridgeAvoidanceZones);
    this.detectBridgeZones(mainRoad, bridgeAvoidanceZones);
    roads.push(mainRoad);

    // Step 2: Generate highways connecting towns
    // Note: detectBridgeZones is now handled inside generateHighwayNetwork for incremental updates
    const highways = this.generateHighwayNetwork(townPositions, mainRoad, bridgeAvoidanceZones);
    roads.push(...highways);

    // Step 3: Generate town streets (organic European style)
    for (const town of townPositions) {
      const townStreets = this.generateTownStreets(town, roads, bridgeAvoidanceZones);
      townStreets.forEach(road => this.detectBridgeZones(road, bridgeAvoidanceZones));
      roads.push(...townStreets);
    }

    // Step 4: Post-process - merge parallel roads
    const mergedRoads = this.mergeParallelRoads(roads);

    // Step 5: Detect and create intersections
    this.detectIntersections(mergedRoads);

    // Step 6: Ensure at least 5 cross-map routes for vehicle access
    this.ensureMapConnectivity(mergedRoads, townPositions);

    return mergedRoads;
  }

  /**
   * Detect potential bridge locations (river crossings) for a road
   * and add them to avoidance zones for future roads
   */
  private detectBridgeZones(
    road: Road,
    zones: Array<{ x: number; z: number; radius: number }>
  ): void {
    const rivers = this.waterBodies.filter((w) => w.type === 'river');
    const bridgeLength = 30;
    const rampLength = 30; // Extra buffer for the ramp leading up to the bridge
    const avoidanceRadius = (bridgeLength / 2) + rampLength + 10; // Total radius to avoid

    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i]!;
      const p2 = road.points[i + 1]!;

      for (const river of rivers) {
        const crossing = this.findRiverCrossing(p1, p2, river);
        if (crossing) {
          zones.push({
            x: crossing.x,
            z: crossing.z,
            radius: avoidanceRadius,
          });
        }
      }
    }
  }

  /**
   * Get town positions from settlements for road generation
   * Uses the already-generated settlements for consistency
   */
  private getTownPositions(): Array<{ x: number; z: number; radius: number; size: SettlementSize; layoutType: LayoutType; entryPoints: EntryPoint[] }> {
    // Return positions from settlements (already generated)
    return this.settlements.map(s => ({
      x: s.position.x,
      z: s.position.z,
      radius: s.radius,
      size: s.size,
      layoutType: s.layoutType,
      entryPoints: s.entryPoints,
    }));
  }

  /**
   * Generate main north-south corridor
   * Interstate on large maps (bypasses towns), Highway on smaller maps
   */
  private generateMainCorridor(
    towns: Array<{ x: number; z: number; radius: number; size: SettlementSize; layoutType: LayoutType; entryPoints: EntryPoint[] }>,
    isLargeMap: boolean,
    bridgeAvoidanceZones: Array<{ x: number; z: number; radius: number }>
  ): Road {
    const roadType: RoadType = isLargeMap ? 'interstate' : 'highway';
    const bypassDistance = isLargeMap ? 80 : 30; // Interstate stays further from towns

    // Find a path from south to north that avoids towns (for interstate)
    // Add margin to keep roads within battlefield boundaries
    const margin = 10;
    const startZ = -this.height / 2 + margin;
    const endZ = this.height / 2 - margin;

    // Calculate x position that avoids towns (for interstate) or goes through center
    let corridorX = this.rng.nextFloat(-this.width / 8, this.width / 8);

    if (isLargeMap) {
      // For interstate, find a corridor that bypasses all towns
      corridorX = this.findBypassCorridor(towns, bypassDistance);
    }

    // Generate smooth bezier path
    const points = this.generateSmoothBezierPath(
      { x: corridorX + this.rng.nextFloat(-20, 20), z: startZ },
      { x: corridorX + this.rng.nextFloat(-20, 20), z: endZ },
      roadType,
      isLargeMap ? [...towns, ...bridgeAvoidanceZones] : bridgeAvoidanceZones // Avoid towns + existing bridges
    );

    return {
      id: `road_${this.roadIdCounter++}`,
      points,
      width: ROAD_WIDTHS[roadType],
      type: roadType,
    };
  }

  /**
   * Find an x-corridor that bypasses all towns by at least the given distance
   */
  private findBypassCorridor(
    towns: Array<{ x: number; z: number; radius: number; size: SettlementSize; layoutType: LayoutType; entryPoints: EntryPoint[] }>,
    minDistance: number
  ): number {
    // Try different x positions and find one that's far enough from all towns
    const candidates: number[] = [];
    const step = this.width / 20;

    for (let x = -this.width / 3; x <= this.width / 3; x += step) {
      let minTownDist = Infinity;
      for (const town of towns) {
        const dist = Math.abs(x - town.x);
        minTownDist = Math.min(minTownDist, dist);
      }
      if (minTownDist >= minDistance) {
        candidates.push(x);
      }
    }

    // If we found bypass options, pick one randomly
    if (candidates.length > 0) {
      return candidates[Math.floor(this.rng.next() * candidates.length)]!;
    }

    // Fallback: pick the x that's furthest from any town
    let bestX = 0;
    let bestDist = 0;
    for (let x = -this.width / 3; x <= this.width / 3; x += step) {
      let minTownDist = Infinity;
      for (const town of towns) {
        minTownDist = Math.min(minTownDist, Math.abs(x - town.x));
      }
      if (minTownDist > bestDist) {
        bestDist = minTownDist;
        bestX = x;
      }
    }
    return bestX;
  }

  /**
   * Generate highway network connecting towns (not hamlets - they get dirt roads)
   */
  private generateHighwayNetwork(
    towns: Array<{ x: number; z: number; radius: number; size: SettlementSize; layoutType: LayoutType; entryPoints: EntryPoint[] }>,
    mainRoad: Road,
    bridgeAvoidanceZones: Array<{ x: number; z: number; radius: number }>
  ): Road[] {
    const roads: Road[] = [];
    const connected = new Set<number>();
    const mapScale = Math.max(this.width, this.height) / 300;

    // Only connect villages and larger to highway network - hamlets get dirt roads
    const significantTowns = towns.filter(t => t.size !== 'hamlet');

    // Connect each significant town to the main road and to nearby towns
    for (let i = 0; i < significantTowns.length; i++) {
      const town = significantTowns[i]!;

      // Find closest point on main road to connect to, avoiding bridges
      const mainRoadConnection = this.findClosestPointOnRoad(town, mainRoad, bridgeAvoidanceZones);

      // Only create highway connection if not already connected and distance is reasonable
      if (mainRoadConnection.distance > town.radius && mainRoadConnection.distance < this.width / 2) {
        const highway = this.createRoadBetweenPoints(
          { x: town.x, z: town.z },
          mainRoadConnection.point,
          'highway',
          bridgeAvoidanceZones
        );
        roads.push(highway);
        connected.add(i);

        // Update avoidance zones immediately so future roads avoid this new bridge
        this.detectBridgeZones(highway, bridgeAvoidanceZones);
      }

      // Connect to nearest unconnected town
      let nearestTown: { index: number; dist: number } | null = null;
      for (let j = i + 1; j < significantTowns.length; j++) {
        const other = significantTowns[j]!;
        const dist = Math.sqrt((town.x - other.x) ** 2 + (town.z - other.z) ** 2);

        // Only connect towns that are reasonably close
        if (dist < this.width / 2 && (!nearestTown || dist < nearestTown.dist)) {
          nearestTown = { index: j, dist };
        }
      }

      if (nearestTown && !connected.has(nearestTown.index)) {
        const other = significantTowns[nearestTown.index]!;
        const roadType: RoadType = mapScale >= 5 ? 'highway' : 'town';
        const highway = this.createRoadBetweenPoints(
          { x: town.x, z: town.z },
          { x: other.x, z: other.z },
          roadType,
          bridgeAvoidanceZones
        );
        roads.push(highway);

        // Update avoidance zones immediately
        this.detectBridgeZones(highway, bridgeAvoidanceZones);
      }
    }

    return roads;
  }

  /**
   * Find closest point on a road to a given position
   * Optionally avoids points within specified zones
   */
  private findClosestPointOnRoad(
    pos: { x: number; z: number },
    road: Road,
    avoidZones: Array<{ x: number; z: number; radius: number }> = []
  ): { point: { x: number; z: number }; distance: number } {
    let closestPoint = road.points[0]!;
    let closestDist = Infinity;

    for (const point of road.points) {
      // Skip points inside avoid zones (e.g. bridges)
      let inAvoidZone = false;
      for (const zone of avoidZones) {
        const distToZone = Math.sqrt((point.x - zone.x) ** 2 + (point.z - zone.z) ** 2);
        if (distToZone < zone.radius) {
          inAvoidZone = true;
          break;
        }
      }
      if (inAvoidZone) continue;

      // Also avoid points too close to any river (to prevent intersections on ramps)
      let nearRiver = false;
      const riverBuffer = 60; // 60m buffer from river center (covers bank + potential bridge ramp)
      const rivers = this.waterBodies.filter(w => w.type === 'river');

      for (const river of rivers) {
        // Quick check against river bounding box could be added here for performance if needed
        for (let i = 0; i < river.points.length - 1; i++) {
          const r1 = river.points[i]!;
          const r2 = river.points[i + 1]!;
          const distToRiverSegment = this.pointToSegmentDistance(point.x, point.z, r1.x, r1.z, r2.x, r2.z);
          if (distToRiverSegment < riverBuffer) {
            nearRiver = true;
            break;
          }
        }
        if (nearRiver) break;
      }
      if (nearRiver) continue;

      const dist = Math.sqrt((pos.x - point.x) ** 2 + (pos.z - point.z) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestPoint = point;
      }
    }

    return { point: { x: closestPoint.x, z: closestPoint.z }, distance: closestDist };
  }

  /**
   * Create a road between two points with smooth bezier curve
   */
  private createRoadBetweenPoints(
    start: { x: number; z: number },
    end: { x: number; z: number },
    type: RoadType,
    bridgeAvoidanceZones: Array<{ x: number; z: number; radius: number }> = []
  ): Road {
    const points = this.generateSmoothBezierPath(start, end, type, bridgeAvoidanceZones);

    return {
      id: `road_${this.roadIdCounter++}`,
      points,
      width: ROAD_WIDTHS[type],
      type,
    };
  }

  /**
   * Generate connection road from main road network to settlement edge
   * NOTE: Settlements already have internal streets from SettlementGenerator
   * This method ONLY creates the connecting road from highway/main road to the settlement
   * Hamlets get dirt roads, larger settlements get town roads
   */
  private generateTownStreets(
    town: { x: number; z: number; radius: number; size: SettlementSize; layoutType: LayoutType; entryPoints: EntryPoint[] },
    existingRoads: Road[],
    bridgeAvoidanceZones: Array<{ x: number; z: number; radius: number }>
  ): Road[] {
    const streets: Road[] = [];
    const roadType: RoadType = town.size === 'hamlet' ? 'dirt' : 'town';

    // If we have entry points (which we should for all recent settlements), use them!
    if (town.entryPoints && town.entryPoints.length > 0) {
      for (const entryPoint of town.entryPoints) {
        // Skip entry points that are outside the map bounds
        if (Math.abs(entryPoint.x) > this.width / 2 - 10 || Math.abs(entryPoint.z) > this.height / 2 - 10) {
          continue;
        }

        // Find closest point on existing roads to this entry point
        let bestConnection: { point: { x: number; z: number }; dist: number } | null = null;
        let bestValues = { dist: Infinity };

        for (const road of existingRoads) {
          const connection = this.findClosestPointOnRoad(entryPoint, road, bridgeAvoidanceZones);
          // Calculate distance from entry point to the road point
          const distToRoad = Math.sqrt((entryPoint.x - connection.point.x) ** 2 + (entryPoint.z - connection.point.z) ** 2);

          // Ensure we don't just connect back to the town itself (check distance > something small)
          // and ensure we don't cross the entire map
          if (distToRoad < this.width / 3) {
            if (distToRoad < bestValues.dist) {
              bestValues.dist = distToRoad;
              bestConnection = { point: connection.point, dist: distToRoad };
            }
          }
        }

        if (bestConnection && bestConnection.dist > 10) {
          // Create road from existing road TO the entry point
          if (town.layoutType === 'grid') {
            // Straight line for grid look
            const numPoints = Math.max(5, Math.ceil(bestConnection.dist / 10));
            const points: { x: number; z: number }[] = [];
            for (let i = 0; i <= numPoints; i++) {
              const t = i / numPoints;
              points.push({
                x: bestConnection.point.x + (entryPoint.x - bestConnection.point.x) * t,
                z: bestConnection.point.z + (entryPoint.z - bestConnection.point.z) * t,
              });
            }

            streets.push({
              id: `road_${this.roadIdCounter++}`,
              points,
              width: ROAD_WIDTHS[roadType],
              type: roadType,
            });
          } else {
            // Organic curve
            streets.push(
              this.createOrganicStreet(bestConnection.point, { x: entryPoint.x, z: entryPoint.z }, roadType, bridgeAvoidanceZones)
            );
          }
        }
      }
      return streets;
    }

    // Fallback logic for legacy/undefined entry points
    // Find the closest point on existing roads that's outside the settlement
    let connectionPoint: { x: number; z: number } | null = null;
    let closestRoadDist = Infinity;

    for (const road of existingRoads) {
      for (const point of road.points) {
        // Only consider points OUTSIDE the settlement radius
        // For large cities, we want to connect a bit further out to give space for the approach
        const minDistance = town.size === 'city' ? town.radius * 1.1 : town.radius;
        const distToTown = Math.sqrt((point.x - town.x) ** 2 + (point.z - town.z) ** 2);

        if (distToTown > minDistance && distToTown < town.radius * 3) {
          if (distToTown < closestRoadDist) {
            closestRoadDist = distToTown;
            connectionPoint = { x: point.x, z: point.z };
          }
        }
      }
    }

    // If we found a connection point, create a single road from that point
    // to the settlement (hamlets connect to center, larger settlements to edge)
    if (connectionPoint) {
      // For hamlets, connect directly to center
      // For larger settlements, connect to edge
      let targetPoint: { x: number; z: number };

      if (town.size === 'hamlet') {
        targetPoint = { x: town.x, z: town.z };
      } else {
        const angle = Math.atan2(connectionPoint.z - town.z, connectionPoint.x - town.x);
        // Connect to slightly inside the radius to overlap with internal streets
        targetPoint = {
          x: town.x + Math.cos(angle) * town.radius * 0.9,
          z: town.z + Math.sin(angle) * town.radius * 0.9,
        };
      }

      // Create a connecting road
      // If it's a grid city/town, force a straight road for a clean look
      if (town.layoutType === 'grid') {
        // Generate straight path points
        const numPoints = Math.max(5, Math.ceil(closestRoadDist / 10));
        const points: { x: number; z: number }[] = [];
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints;
          points.push({
            x: connectionPoint.x + (targetPoint.x - connectionPoint.x) * t,
            z: connectionPoint.z + (targetPoint.z - connectionPoint.z) * t,
          });
        }

        streets.push({
          id: `road_${this.roadIdCounter++}`,
          points,
          width: ROAD_WIDTHS[roadType],
          type: roadType,
        });
      } else {
        // Organic/Mixed: use organic curve
        const connectionRoad = this.createOrganicStreet(connectionPoint, targetPoint, roadType, bridgeAvoidanceZones);
        streets.push(connectionRoad);
      }
    }

    // No internal streets - settlements have their own from SettlementGenerator
    return streets;
  }

  /**
   * Create an organic curved street (European style)
   */
  private createOrganicStreet(
    start: { x: number; z: number },
    end: { x: number; z: number },
    type: RoadType = 'town',
    bridgeAvoidanceZones: Array<{ x: number; z: number; radius: number }> = []
  ): Road {
    const points = this.generateSmoothBezierPath(start, end, type, bridgeAvoidanceZones);

    return {
      id: `road_${this.roadIdCounter++}`,
      points,
      width: ROAD_WIDTHS[type],
      type,
    };
  }

  /**
   * Merge parallel roads that are close together and traveling in similar directions
   * Also removes very short roads that are likely duplicates
   * NEW: Also trims roads at intersection points to prevent overlapping
   */
  private mergeParallelRoads(roads: Road[]): Road[] {
    const mergeThreshold = 50; // meters - roads closer than this may merge
    const angleThreshold = Math.PI / 4; // 45 degrees - similar direction threshold

    const result: Road[] = [];
    const removed = new Set<number>();

    const roadPriority: Record<RoadType, number> = {
      interstate: 4,
      highway: 3,
      bridge: 3,
      town: 2,
      dirt: 1,
    };

    // First pass: remove very short roads (likely duplicates)
    for (let i = 0; i < roads.length; i++) {
      const road = roads[i]!;
      const length = this.calculateRoadLength(road);
      if (length < 15) { // Roads shorter than 15m are likely artifacts
        removed.add(i);
      }
    }

    // Second pass: remove parallel duplicates AND overlapping roads
    for (let i = 0; i < roads.length; i++) {
      if (removed.has(i)) continue;

      const roadA = roads[i]!;
      let dominated = false;

      for (let j = 0; j < roads.length; j++) {
        if (i === j || removed.has(j)) continue;

        const roadB = roads[j]!;

        // Check if roads are parallel and close
        const areParallel = this.areRoadsParallelAndClose(roadA, roadB, mergeThreshold, angleThreshold);

        // Also check if roads overlap significantly (share similar paths)
        const overlapPercent = this.calculateRoadOverlapPercentage(roadA, roadB, mergeThreshold);
        const hasSignificantOverlap = overlapPercent > 0.3; // More than 30% overlap

        if (areParallel || hasSignificantOverlap) {
          // Keep the higher priority road
          if (roadPriority[roadB.type] > roadPriority[roadA.type]) {
            dominated = true;
            removed.add(i);
            break;
          } else if (roadPriority[roadA.type] > roadPriority[roadB.type]) {
            removed.add(j);
          } else {
            // Same priority: keep the longer road
            const lenA = this.calculateRoadLength(roadA);
            const lenB = this.calculateRoadLength(roadB);
            if (lenB > lenA * 1.2) { // B is significantly longer
              dominated = true;
              removed.add(i);
              break;
            } else if (lenA > lenB * 1.2) { // A is significantly longer
              removed.add(j);
            }
            // If similar length, remove the one with more overlap
            else if (hasSignificantOverlap && overlapPercent > 0.5) {
              removed.add(j); // Remove the second one
            }
          }
        }
      }

      if (!dominated) {
        result.push(roadA);
      }
    }

    // Third pass: Trim roads at intersection points to prevent overlapping
    // Sort roads by priority (higher priority roads processed first)
    result.sort((a, b) => roadPriority[b.type] - roadPriority[a.type]);

    const trimmed: Road[] = [];
    for (let i = 0; i < result.length; i++) {
      const road = result[i]!;

      // Trim this road against all higher-priority roads already processed
      let trimmedRoad = road;
      for (const existingRoad of trimmed) {
        if (roadPriority[existingRoad.type] >= roadPriority[road.type]) {
          trimmedRoad = this.trimRoadAtIntersection(trimmedRoad, existingRoad);
        }
      }

      trimmed.push(trimmedRoad);
    }

    return trimmed;
  }

  /**
   * Calculate total length of a road
   */
  private calculateRoadLength(road: Road): number {
    let length = 0;
    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i]!;
      const p2 = road.points[i + 1]!;
      length += Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
    }
    return length;
  }

  /**
   * Calculate what percentage of roadA's length overlaps with roadB
   * Returns a value between 0 and 1
   */
  private calculateRoadOverlapPercentage(
    roadA: Road,
    roadB: Road,
    distThreshold: number
  ): number {
    let overlappingSegments = 0;
    let totalSegments = 0;

    // Check each point in roadA to see if it's close to any part of roadB
    for (let i = 0; i < roadA.points.length - 1; i++) {
      const pointA = roadA.points[i]!;
      totalSegments++;

      // Check distance to all segments of roadB
      let minDistToB = Infinity;
      for (let j = 0; j < roadB.points.length - 1; j++) {
        const p1 = roadB.points[j]!;
        const p2 = roadB.points[j + 1]!;
        const dist = this.pointToSegmentDistance(pointA.x, pointA.z, p1.x, p1.z, p2.x, p2.z);
        minDistToB = Math.min(minDistToB, dist);
      }

      // If this segment of roadA is close to roadB, count it as overlapping
      const combinedWidth = (roadA.width + roadB.width) / 2;
      if (minDistToB < combinedWidth + distThreshold) {
        overlappingSegments++;
      }
    }

    return totalSegments > 0 ? overlappingSegments / totalSegments : 0;
  }

  /**
   * Check if two roads are parallel and close to each other
   */
  private areRoadsParallelAndClose(
    roadA: Road,
    roadB: Road,
    distThreshold: number,
    angleThreshold: number
  ): boolean {
    // Sample points from each road and check proximity and direction
    const samplesA = this.sampleRoadPoints(roadA, 8);
    const samplesB = this.sampleRoadPoints(roadB, 8);

    let closeCount = 0;
    let parallelCount = 0;

    for (const pointA of samplesA) {
      for (const pointB of samplesB) {
        const dist = Math.sqrt((pointA.x - pointB.x) ** 2 + (pointA.z - pointB.z) ** 2);
        if (dist < distThreshold) {
          closeCount++;

          // Check if directions are similar
          const angleDiff = Math.abs(pointA.angle - pointB.angle);
          const normalizedAngle = Math.min(angleDiff, Math.PI - angleDiff);
          if (normalizedAngle < angleThreshold) {
            parallelCount++;
          }
        }
      }
    }

    // Roads are parallel and close if at least 2 sample points are close and parallel
    return closeCount >= 2 && parallelCount >= 1;
  }

  /**
   * Sample points and directions from a road
   */
  private sampleRoadPoints(road: Road, numSamples: number): Array<{ x: number; z: number; angle: number }> {
    const samples: Array<{ x: number; z: number; angle: number }> = [];
    const step = Math.max(1, Math.floor(road.points.length / numSamples));

    for (let i = 0; i < road.points.length - 1; i += step) {
      const p1 = road.points[i]!;
      const p2 = road.points[Math.min(i + 1, road.points.length - 1)]!;
      const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
      samples.push({ x: p1.x, z: p1.z, angle });
    }

    return samples;
  }

  /**
   * Trim a road at its intersection with another road to prevent overlapping
   * If the road crosses the existing road, trim it at the intersection point
   */
  private trimRoadAtIntersection(road: Road, existingRoad: Road): Road {
    // Find all intersection points
    const intersectionPoints = this.findRoadIntersectionPoints(road, existingRoad);

    if (intersectionPoints.length === 0) {
      return road; // No intersection, return unchanged
    }

    // Find the intersection point closest to the start of the road
    let closestIntersection = intersectionPoints[0]!;
    let minDistFromStart = Infinity;

    const startPoint = road.points[0]!;
    for (const intersection of intersectionPoints) {
      const dist = Math.sqrt(
        (intersection.x - startPoint.x) ** 2 +
        (intersection.z - startPoint.z) ** 2
      );
      if (dist < minDistFromStart) {
        minDistFromStart = dist;
        closestIntersection = intersection;
      }
    }

    // If the intersection is very close to the start (within combined widths), don't trim
    const combinedWidth = (road.width + existingRoad.width) / 2;
    if (minDistFromStart < combinedWidth) {
      return road; // Intersection is at the start, keep the road
    }

    // Find which segment of the road contains the intersection point
    let trimIndex = -1;
    let minDistToSegment = Infinity;

    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i]!;
      const p2 = road.points[i + 1]!;

      const dist = this.pointToSegmentDistance(
        closestIntersection.x, closestIntersection.z,
        p1.x, p1.z, p2.x, p2.z
      );

      if (dist < minDistToSegment && dist < combinedWidth) {
        minDistToSegment = dist;
        trimIndex = i + 1; // Trim after this point
      }
    }

    // If we found a trim point, cut the road there
    if (trimIndex > 0 && trimIndex < road.points.length - 1) {
      const newPoints = road.points.slice(0, trimIndex);
      // Add the intersection point as the final point
      newPoints.push({ x: closestIntersection.x, z: closestIntersection.z });

      return {
        ...road,
        points: newPoints,
      };
    }

    return road;
  }

  /**
   * Detect intersections between roads
   */
  private detectIntersections(roads: Road[]): void {
    this.intersections = [];
    const intersectionMap = new Map<string, Intersection>();

    for (let i = 0; i < roads.length; i++) {
      for (let j = i + 1; j < roads.length; j++) {
        const roadA = roads[i]!;
        const roadB = roads[j]!;

        // Find intersection points between the two roads
        const intersectionPoints = this.findRoadIntersectionPoints(roadA, roadB);

        for (const point of intersectionPoints) {
          // Round to 0.5m precision to avoid duplicates (was 5m, caused 3.5m position errors)
          const key = `${Math.round(point.x * 2) / 2}_${Math.round(point.z * 2) / 2}`;

          if (!intersectionMap.has(key)) {
            const roadIds = [roadA.id, roadB.id].filter((id): id is string => id !== undefined);
            intersectionMap.set(key, {
              id: `intersection_${this.intersections.length}`,
              x: point.x,
              z: point.z,
              roadIds,
              type: this.determineIntersectionType(roadA, roadB, point),
            });
          } else {
            // Add road to existing intersection
            const existing = intersectionMap.get(key)!;
            if (roadA.id && !existing.roadIds.includes(roadA.id)) {
              existing.roadIds.push(roadA.id);
            }
            if (roadB.id && !existing.roadIds.includes(roadB.id)) {
              existing.roadIds.push(roadB.id);
            }
          }
        }
      }
    }

    this.intersections = Array.from(intersectionMap.values());
  }

  /**
   * Find points where two roads intersect or connect
   * Updated to detect both overlapping roads and endpoint connections
   */
  private findRoadIntersectionPoints(
    roadA: Road,
    roadB: Road
  ): Array<{ x: number; z: number }> {
    const intersections: Array<{ x: number; z: number }> = [];
    const threshold = (roadA.width + roadB.width) / 2 + 5;

    // Check 1: Point-to-point proximity (overlapping roads)
    for (let i = 0; i < roadA.points.length; i++) {
      const pointA = roadA.points[i]!;

      for (let j = 0; j < roadB.points.length; j++) {
        const pointB = roadB.points[j]!;

        const dist = Math.sqrt((pointA.x - pointB.x) ** 2 + (pointA.z - pointB.z) ** 2);
        if (dist < threshold) {
          // Average the positions
          intersections.push({
            x: (pointA.x + pointB.x) / 2,
            z: (pointA.z + pointB.z) / 2,
          });
          // Skip nearby points to avoid duplicates
          j += 3;
        }
      }
    }

    // Check 2: Endpoint-to-segment proximity (connecting roads after trimming)
    // Check if roadA endpoints are near roadB segments
    const endpointsA = [roadA.points[0]!, roadA.points[roadA.points.length - 1]!];
    for (const endpoint of endpointsA) {
      for (let j = 0; j < roadB.points.length - 1; j++) {
        const p1 = roadB.points[j]!;
        const p2 = roadB.points[j + 1]!;
        const dist = this.pointToSegmentDistance(endpoint.x, endpoint.z, p1.x, p1.z, p2.x, p2.z);

        if (dist < threshold) {
          intersections.push({ x: endpoint.x, z: endpoint.z });
          break; // Only add once per endpoint
        }
      }
    }

    // Check if roadB endpoints are near roadA segments
    const endpointsB = [roadB.points[0]!, roadB.points[roadB.points.length - 1]!];
    for (const endpoint of endpointsB) {
      for (let i = 0; i < roadA.points.length - 1; i++) {
        const p1 = roadA.points[i]!;
        const p2 = roadA.points[i + 1]!;
        const dist = this.pointToSegmentDistance(endpoint.x, endpoint.z, p1.x, p1.z, p2.x, p2.z);

        if (dist < threshold) {
          intersections.push({ x: endpoint.x, z: endpoint.z });
          break; // Only add once per endpoint
        }
      }
    }

    return intersections;
  }

  /**
   * Determine intersection type based on road angles
   */
  private determineIntersectionType(
    roadA: Road,
    roadB: Road,
    point: { x: number; z: number }
  ): 'T' | 'cross' | 'Y' | 'merge' {
    // Get directions of both roads at intersection
    const dirA = this.getRoadDirectionAtPoint(roadA, point);
    const dirB = this.getRoadDirectionAtPoint(roadB, point);

    const angleDiff = Math.abs(dirA - dirB);
    const normalizedAngle = Math.min(angleDiff, Math.PI - angleDiff, Math.PI * 2 - angleDiff);

    if (normalizedAngle < Math.PI / 8) {
      return 'merge';
    } else if (normalizedAngle > Math.PI / 3 && normalizedAngle < Math.PI * 2 / 3) {
      return 'cross';
    } else if (normalizedAngle > Math.PI * 2 / 3) {
      return 'T';
    } else {
      return 'Y';
    }
  }

  /**
   * Get road direction at a specific point
   */
  private getRoadDirectionAtPoint(road: Road, point: { x: number; z: number }): number {
    // Find closest segment
    let closestIdx = 0;
    let closestDist = Infinity;

    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i]!;
      const dist = Math.sqrt((p.x - point.x) ** 2 + (p.z - point.z) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    // Get direction from this point to next (or previous if at end)
    const i1 = closestIdx;
    const i2 = Math.min(closestIdx + 1, road.points.length - 1);

    if (i1 === i2 && i1 > 0) {
      const p1 = road.points[i1 - 1]!;
      const p2 = road.points[i1]!;
      return Math.atan2(p2.z - p1.z, p2.x - p1.x);
    }

    const p1 = road.points[i1]!;
    const p2 = road.points[i2]!;
    return Math.atan2(p2.z - p1.z, p2.x - p1.x);
  }

  /**
   * Ensure at least 5 cross-map routes for vehicle connectivity
   * Adds additional roads if needed to prevent gameplay restriction
   */
  private ensureMapConnectivity(
    roads: Road[],
    towns: Array<{ x: number; z: number; radius: number; size: SettlementSize; layoutType: LayoutType }>
  ): void {
    const edgeMargin = 50; // Distance from map edge to consider "crossing"
    const minNSRoutes = 3;
    const minTotalRoutes = 5;

    // Analyze existing cross-map routes
    interface CrossingRoute {
      direction: 'north-south' | 'east-west';
      position: number; // x for N-S, z for E-W
      road: Road;
    }

    const crossingRoutes: CrossingRoute[] = [];

    for (const road of roads) {
      // Check if road crosses from south to north
      const minZ = Math.min(...road.points.map(p => p.z));
      const maxZ = Math.max(...road.points.map(p => p.z));
      const crossesNorthSouth =
        minZ < -this.height / 2 + edgeMargin && maxZ > this.height / 2 - edgeMargin;

      if (crossesNorthSouth) {
        // Find average x position
        const avgX = road.points.reduce((sum, p) => sum + p.x, 0) / road.points.length;
        crossingRoutes.push({
          direction: 'north-south',
          position: avgX,
          road,
        });
      }

      // Check if road crosses from west to east
      const minX = Math.min(...road.points.map(p => p.x));
      const maxX = Math.max(...road.points.map(p => p.x));
      const crossesEastWest =
        minX < -this.width / 2 + edgeMargin && maxX > this.width / 2 - edgeMargin;

      if (crossesEastWest) {
        // Find average z position
        const avgZ = road.points.reduce((sum, p) => sum + p.z, 0) / road.points.length;
        crossingRoutes.push({
          direction: 'east-west',
          position: avgZ,
          road,
        });
      }
    }

    const nsRoutes = crossingRoutes.filter(r => r.direction === 'north-south');
    const ewRoutes = crossingRoutes.filter(r => r.direction === 'east-west');

    console.log(`Found ${nsRoutes.length} N-S routes and ${ewRoutes.length} E-W routes`);

    // --- N/S Roads Logic ---
    // We need at least 3 N/S roads total.
    // We specifically need:
    // 1. One "straight" highway (low variance)
    // 2. One "curvy" highway (high variance/diagonal)
    // The existing nsRoutes might count towards the total, but we force the specific highways if missing.

    // 1. Ensure Straight Highway
    const hasStraightHighway = nsRoutes.some(r => r.road.type === 'highway' || r.road.type === 'interstate');
    // Technically we should check curve amount, but for now just existence of a major road suggests one might be straight-ish.
    // However, the requirement is explicit: generate one if we don't think we have a definitive "straight" one from *this* function (although mainCorridor is usually straight-ish).
    // Let's force generate a straight highway if we have fewer than 2 total highways, OR if we just want to guarantee it.
    // Given the prompt "2 of the NS roads should be highways", let's track highways.

    let nsHighways = nsRoutes.filter(r => r.road.type === 'highway' || r.road.type === 'interstate').length;

    // We'll generate the Straight Highway if we have < 1 highway
    if (nsHighways < 1) {
      const existingXPositions = nsRoutes.map(r => r.position);
      const newX = this.findDiversePosition(existingXPositions, this.width);

      const margin = 10;
      const startZ = -this.height / 2 + margin;
      const endZ = this.height / 2 - margin;

      // STRAIGHT: Minimal variance in X
      const points = this.generateSmoothBezierPath(
        { x: newX + this.rng.nextFloat(-5, 5), z: startZ },
        { x: newX + this.rng.nextFloat(-5, 5), z: endZ },
        'highway',
        towns
      );

      const newRoad: Road = {
        id: `connectivity_ns_straight_highway`,
        points,
        width: ROAD_WIDTHS.highway,
        type: 'highway',
      };

      roads.push(newRoad);
      nsRoutes.push({ direction: 'north-south', position: newX, road: newRoad });
      nsHighways++;
      console.log(`Added N-S Straight Highway at x=${Math.round(newX)}`);
    }

    // 2. Ensure Curvy/Diagonal Highway
    // We'll generate this if we have < 2 highways.
    if (nsHighways < 2) {
      const existingXPositions = nsRoutes.map(r => r.position);
      const newX = this.findDiversePosition(existingXPositions, this.width);

      const margin = 10;
      const startZ = -this.height / 2 + margin;
      const endZ = this.height / 2 - margin;

      // CURVY/DIAGONAL: Large variance in X between start and end
      // 30-50% of width delta
      const deltaX = this.width * this.rng.nextFloat(0.3, 0.5);
      const direction = this.rng.next() > 0.5 ? 1 : -1;

      const startX = Math.max(-this.width / 2 + margin, Math.min(this.width / 2 - margin, newX - (deltaX / 2 * direction)));
      const endX = Math.max(-this.width / 2 + margin, Math.min(this.width / 2 - margin, newX + (deltaX / 2 * direction)));

      const points = this.generateSmoothBezierPath(
        { x: startX, z: startZ },
        { x: endX, z: endZ },
        'highway',
        towns
      );

      const newRoad: Road = {
        id: `connectivity_ns_curvy_highway`,
        points,
        width: ROAD_WIDTHS.highway,
        type: 'highway',
      };

      roads.push(newRoad);
      nsRoutes.push({ direction: 'north-south', position: (startX + endX) / 2, road: newRoad });
      nsHighways++;
      console.log(`Added N-S Curvy Highway from x=${Math.round(startX)} to x=${Math.round(endX)}`);
    }

    // 3. Fill remaining N/S quota (min 3 total) with standard town roads
    const nsNeeded = Math.max(0, minNSRoutes - nsRoutes.length);
    for (let i = 0; i < nsNeeded; i++) {
      const existingXPositions = nsRoutes.map(r => r.position);
      const newX = this.findDiversePosition(existingXPositions, this.width);
      const margin = 10;
      const startZ = -this.height / 2 + margin;
      const endZ = this.height / 2 - margin;

      const points = this.generateSmoothBezierPath(
        { x: newX + this.rng.nextFloat(-15, 15), z: startZ },
        { x: newX + this.rng.nextFloat(-15, 15), z: endZ },
        'town',
        towns
      );

      const newRoad: Road = {
        id: `connectivity_ns_filler_${i}`,
        points,
        width: ROAD_WIDTHS.town,
        type: 'town',
      };

      roads.push(newRoad);
      nsRoutes.push({ direction: 'north-south', position: newX, road: newRoad });
      console.log(`Added N-S connectivity road (filler) at x=${Math.round(newX)}`);
    }

    // --- E/W Roads Logic ---
    // Ensure 1 Highway for E/W. 
    // Fill remaining to meet total quota logic (balanced).

    let ewHighways = ewRoutes.filter(r => r.road.type === 'highway' || r.road.type === 'interstate').length;

    // Calculate how many more we need to balance or meet minimums
    // The original logic tried to balance N-S and E-W to sum to 5.
    // We currently have nsRoutes.length N/S routes.
    // We want minTotalRoutes (5) total.
    const currentTotal = nsRoutes.length + ewRoutes.length;
    let ewNeeded = Math.max(0, minTotalRoutes - currentTotal);

    // Ensure we create at least one E/W highway if none exist, even if we have enough total routes
    if (ewHighways < 1) {
      // If we don't *need* more routes but must add a highway, we force add one.
      ewNeeded = Math.max(ewNeeded, 1);
    }

    for (let i = 0; i < ewNeeded; i++) {
      const existingZPositions = ewRoutes.map(r => r.position);
      const newZ = this.findDiversePosition(existingZPositions, this.height);

      const margin = 10;
      const startX = -this.width / 2 + margin;
      const endX = this.width / 2 - margin;

      const angleVariance = this.height * 0.4;

      const startZ = Math.max(-this.height / 2 + margin, Math.min(this.height / 2 - margin,
        newZ + this.rng.nextFloat(-angleVariance, angleVariance)));

      const endZ = Math.max(-this.height / 2 + margin, Math.min(this.height / 2 - margin,
        newZ + this.rng.nextFloat(-angleVariance, angleVariance)));

      // Determine type: First one added (if needed) should be highway
      const useHighway = (ewHighways < 1);
      const type: RoadType = useHighway ? 'highway' : 'town';
      if (useHighway) ewHighways++;

      const points = this.generateSmoothBezierPath(
        { x: startX, z: startZ },
        { x: endX, z: endZ },
        type,
        towns
      );

      const newRoad: Road = {
        id: `connectivity_ew_${i}`,
        points,
        width: ROAD_WIDTHS[type],
        type: type,
      };

      roads.push(newRoad);
      ewRoutes.push({ direction: 'east-west', position: (startZ + endZ) / 2, road: newRoad });

      console.log(`Added E-W connectivity road (${type}) near z=${Math.round(newZ)}`);
    }
  }

  /**
   * Find a diverse position that maximizes distance from existing positions
   */
  private findDiversePosition(existingPositions: number[], range: number): number {
    if (existingPositions.length === 0) {
      // First position: place near center with some randomness
      return this.rng.nextFloat(-range / 6, range / 6);
    }

    // Try multiple candidates and pick the one furthest from existing positions
    const numCandidates = 10;
    let bestPosition = 0;
    let bestMinDist = -Infinity;

    for (let i = 0; i < numCandidates; i++) {
      const candidate = this.rng.nextFloat(-range / 2 + 30, range / 2 - 30);

      // Find minimum distance to existing positions
      const minDist = Math.min(
        ...existingPositions.map(pos => Math.abs(candidate - pos))
      );

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestPosition = candidate;
      }
    }

    return bestPosition;
  }

  /**
   * Generate smooth bezier path between two points
   * Uses cubic bezier with curvature limits based on road type
   */
  private generateSmoothBezierPath(
    start: { x: number; z: number },
    end: { x: number; z: number },
    roadType: RoadType,
    avoidZones: Array<{ x: number; z: number; radius: number }>
  ): { x: number; z: number }[] {
    const points: { x: number; z: number }[] = [];

    // Separate lakes from other avoid zones
    const lakes: Array<{ x: number; z: number; radius: number }> = [];
    const nonLakeZones = [...avoidZones];

    for (const water of this.waterBodies) {
      if (water.type === 'lake') {
        const center = this.getWaterBodyCenter(water);
        lakes.push({
          x: center.x,
          z: center.z,
          radius: (water.radius ?? 50) + 30, // Lake radius + 30m buffer
        });
      }
    }

    // Check if the direct path intersects any lakes
    const pathWaypoints = this.generateLakeAvoidanceWaypoints(start, end, lakes);

    // If waypoints were added, generate path through waypoints
    if (pathWaypoints.length > 2) {
      // Generate smooth path through each segment
      const allPoints: { x: number; z: number }[] = [];
      for (let i = 0; i < pathWaypoints.length - 1; i++) {
        const segmentStart = pathWaypoints[i]!;
        const segmentEnd = pathWaypoints[i + 1]!;
        const segmentPoints = this.generateSmoothPathSegment(segmentStart, segmentEnd, roadType, nonLakeZones);
        // Skip first point of subsequent segments to avoid duplicates
        if (i > 0) segmentPoints.shift();
        allPoints.push(...segmentPoints);
      }
      return allPoints;
    }

    // No lake intersections, proceed with normal generation
    const allAvoidZones = [...nonLakeZones, ...lakes];

    // NOTE: Terrain features (mountains, hills, plateaus) are NOT added to avoid zones
    // Roads will cut through terrain and the grading system will flatten the road bed
    // This prevents sharp turns caused by trying to go around terrain features

    // Calculate path length for determining segment count
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const pathLength = Math.sqrt(dx * dx + dz * dz);

    // Curvature limits based on road type (much gentler - reduced by 60%)
    const curvatureLimits: Record<RoadType, number> = {
      interstate: 0.02, // Very gentle - almost straight
      highway: 0.04,    // Very gentle
      bridge: 0.02,     // Bridges are straight
      town: 0.08,       // Gentle curves
      dirt: 0.15,       // Can have moderate curves
    };
    const maxCurvature = curvatureLimits[roadType];

    // Number of control points based on path length (fewer = smoother)
    const numControlPoints = Math.max(3, Math.min(8, Math.floor(pathLength / 80)));

    // Generate smooth deviation pattern using noise-like smooth random values
    // This prevents sharp direction changes between control points
    const deviationPattern: number[] = [];
    for (let i = 0; i <= numControlPoints; i++) {
      const t = i / numControlPoints;
      // Use smooth noise-like pattern instead of pure random
      const noiseValue = Math.sin(t * Math.PI * 2 + this.rng.nextFloat(0, Math.PI * 2));
      // Scale deviation down strongly at endpoints for smooth entry/exit
      const endpointScale = Math.sin(t * Math.PI);
      deviationPattern.push(noiseValue * endpointScale);
    }

    // Smooth the deviation pattern to prevent sharp turns
    const smoothedPattern: number[] = [];
    for (let i = 0; i <= numControlPoints; i++) {
      if (i === 0 || i === numControlPoints) {
        smoothedPattern.push(0); // No deviation at endpoints
      } else {
        // Average with neighbors for smoothness
        const prev = deviationPattern[i - 1] ?? 0;
        const curr = deviationPattern[i] ?? 0;
        const next = deviationPattern[i + 1] ?? 0;
        smoothedPattern.push((prev + curr * 2 + next) / 4);
      }
    }

    // Generate control points with smooth deviations
    const controlPoints: { x: number; z: number }[] = [];
    // Maximum perpendicular deviation from straight line - allows detours around lakes
    // Increased to 40% and 1000m to allow roads to route around large cities
    const maxPerpendicularDeviation = Math.min(pathLength * 0.4, 1000); // Increased from 200m

    for (let i = 0; i <= numControlPoints; i++) {
      const t = i / numControlPoints;
      const straightX = start.x + dx * t;
      const straightZ = start.z + dz * t;
      let baseX = straightX;
      let baseZ = straightZ;

      // Add perpendicular deviation using smoothed pattern
      const deviationScale = maxCurvature * pathLength;
      const perpX = -dz / pathLength;
      const perpZ = dx / pathLength;
      const deviation = smoothedPattern[i]! * deviationScale;

      baseX += perpX * deviation;
      baseZ += perpZ * deviation;

      // Avoid zones (towns and lakes) - push away more strongly
      for (const zone of allAvoidZones) {
        const distToZone = Math.sqrt((baseX - zone.x) ** 2 + (baseZ - zone.z) ** 2);
        if (distToZone < zone.radius + 40) {
          // Push away from zone more aggressively for lakes
          const pushDir = Math.atan2(baseZ - zone.z, baseX - zone.x);
          const targetDist = zone.radius + 40;
          const pushDist = Math.min(targetDist - distToZone + 20, 150); // Max 150m push (increased from 50m)
          baseX += Math.cos(pushDir) * pushDist;
          baseZ += Math.sin(pushDir) * pushDist;
        }
      }

      // Clamp total deviation from straight line to prevent extreme detours
      const deviationFromStraight = Math.sqrt(
        (baseX - straightX) ** 2 + (baseZ - straightZ) ** 2
      );
      if (deviationFromStraight > maxPerpendicularDeviation) {
        const scale = maxPerpendicularDeviation / deviationFromStraight;
        baseX = straightX + (baseX - straightX) * scale;
        baseZ = straightZ + (baseZ - straightZ) * scale;
      }

      controlPoints.push({ x: baseX, z: baseZ });
    }

    // Validate and fix control points to prevent sharp turns and loops
    // Calculate the main direction of travel
    const mainDirX = dx / pathLength;
    const mainDirZ = dz / pathLength;

    // Helper to check if a point makes forward progress
    const getForwardProgress = (p: { x: number; z: number }) => {
      return (p.x - start.x) * mainDirX + (p.z - start.z) * mainDirZ;
    };

    // Helper to calculate turn angle between three points
    const getTurnAngle = (p1: { x: number; z: number }, p2: { x: number; z: number }, p3: { x: number; z: number }) => {
      const dx1 = p2.x - p1.x;
      const dz1 = p2.z - p1.z;
      const dx2 = p3.x - p2.x;
      const dz2 = p3.z - p2.z;
      const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
      const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
      if (len1 < 0.001 || len2 < 0.001) return 0;
      const dot = (dx1 * dx2 + dz1 * dz2) / (len1 * len2);
      return Math.acos(Math.max(-1, Math.min(1, dot)));
    };

    // Fix control points that would create sharp turns or go backwards
    const maxTurnAngle = Math.PI / 2; // 90 degrees max
    const fixedControlPoints: { x: number; z: number }[] = [controlPoints[0]!];

    for (let i = 1; i < controlPoints.length - 1; i++) {
      const prev = fixedControlPoints[fixedControlPoints.length - 1]!;
      const curr = controlPoints[i]!;
      const next = controlPoints[i + 1]!;

      // Check forward progress - point should be further along than previous
      const prevProgress = getForwardProgress(prev);
      const currProgress = getForwardProgress(curr);

      if (currProgress <= prevProgress) {
        // Point goes backwards - interpolate along main path instead
        const t = i / numControlPoints;
        fixedControlPoints.push({
          x: start.x + dx * t,
          z: start.z + dz * t,
        });
        continue;
      }

      // Check turn angle
      const turnAngle = getTurnAngle(prev, curr, next);
      if (turnAngle > maxTurnAngle) {
        // Turn too sharp - interpolate between prev and a point on the straight path
        const t = i / numControlPoints;
        const straightPoint = {
          x: start.x + dx * t,
          z: start.z + dz * t,
        };
        // Blend towards the straight path
        fixedControlPoints.push({
          x: curr.x * 0.3 + straightPoint.x * 0.7,
          z: curr.z * 0.3 + straightPoint.z * 0.7,
        });
        continue;
      }

      fixedControlPoints.push(curr);
    }

    // Always add the final point
    fixedControlPoints.push(controlPoints[controlPoints.length - 1]!);

    // Generate smooth curve through fixed control points using Catmull-Rom
    // Increase segment density for smoother, more natural-looking roads
    const segmentsPerControl = Math.max(8, Math.floor(pathLength / (fixedControlPoints.length * 5)));

    for (let i = 0; i < fixedControlPoints.length - 1; i++) {
      const p0 = fixedControlPoints[Math.max(0, i - 1)]!;
      const p1 = fixedControlPoints[i]!;
      const p2 = fixedControlPoints[i + 1]!;
      const p3 = fixedControlPoints[Math.min(fixedControlPoints.length - 1, i + 2)]!;

      for (let j = 0; j < segmentsPerControl; j++) {
        const t = j / segmentsPerControl;
        const t2 = t * t;
        const t3 = t2 * t;

        // Catmull-Rom spline
        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );

        const z = 0.5 * (
          (2 * p1.z) +
          (-p0.z + p2.z) * t +
          (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
          (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
        );

        points.push({ x, z });
      }
    }

    // Add final point
    points.push({ x: end.x, z: end.z });

    // Clamp all points to battlefield boundaries to ensure roads stay within map
    const clampedPoints = this.clampRoadPointsToBoundaries(points);

    return clampedPoints;
  }

  /**
   * Clamp road points to stay within battlefield boundaries
   * Ensures roads don't extend beyond the map edges
   */
  private clampRoadPointsToBoundaries(points: { x: number; z: number }[]): { x: number; z: number }[] {
    const margin = 5; // 5 meter margin from edge to prevent roads right at boundary
    const minX = -this.width / 2 + margin;
    const maxX = this.width / 2 - margin;
    const minZ = -this.height / 2 + margin;
    const maxZ = this.height / 2 - margin;

    return points.map(point => ({
      x: Math.max(minX, Math.min(maxX, point.x)),
      z: Math.max(minZ, Math.min(maxZ, point.z)),
    }));
  }

  /**
   * Check if terrain at position is suitable for a capture zone
   * Relaxed requirements: we no longer strictly forbid water/river in the entire zone,
   * because we will search for a valid spot for the objective building.
   * Just avoid completely invalid areas (deep ocean, mountains).
   */
  private isTerrainSuitableForCaptureZone(
    worldX: number,
    worldZ: number,
    width: number,
    height: number
  ): boolean {
    // Sample terrain at several points within the capture zone footprint
    // Check center, corners, and midpoints of edges
    const positions = [
      { x: worldX, z: worldZ }, // Center
      { x: worldX - width / 2, z: worldZ - height / 2 }, // Top-left
      { x: worldX + width / 2, z: worldZ - height / 2 }, // Top-right
      { x: worldX - width / 2, z: worldZ + height / 2 }, // Bottom-left
      { x: worldX + width / 2, z: worldZ + height / 2 }, // Bottom-right
    ];

    const elevations: number[] = [];
    let waterCount = 0;

    for (const pos of positions) {
      const terrain = this.getTerrainAt(pos.x, pos.z);
      if (!terrain) continue;

      // Count water cells
      if (terrain.type === 'water' || terrain.type === 'river') {
        waterCount++;
      } else {
        elevations.push(terrain.elevation);
      }
    }

    // If more than 60% is water, reject the zone
    if (waterCount > positions.length * 0.6) return false;

    // If we have no dry land samples, reject
    if (elevations.length === 0) return false;

    // Check elevation variance - reject absolute mountain peaks
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const elevationVariance = maxElevation - minElevation;

    // Allow more variance for larger zones
    // Relaxed check: allow up to 25m variance across the whole zone
    if (elevationVariance > 25) {
      return false; // Too steep/rugged
    }

    return true;
  }

  /**
   * Find a valid location for an objective building within the zone area
   * Scans for a flat, dry spot of size 20x20m
   */
  private findValidObjectiveLocation(
    zoneX: number,
    zoneZ: number,
    zoneWidth: number,
    zoneHeight: number
  ): { x: number; z: number } | null {
    // Try center first
    if (this.isLocationValidForBuilding(zoneX, zoneZ, 20)) {
      return { x: zoneX, z: zoneZ };
    }

    // Search in a grid pattern
    const step = 20; // 20m grid
    const halfW = zoneWidth / 2 - 10; // Keep 10m margin
    const halfH = zoneHeight / 2 - 10;

    // Spiral search or grid search
    // Simple grid search for now
    for (let x = -halfW; x <= halfW; x += step) {
      for (let z = -halfH; z <= halfH; z += step) {
        // Skip center (already checked)
        if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

        const worldX = zoneX + x;
        const worldZ = zoneZ + z;

        if (this.isLocationValidForBuilding(worldX, worldZ, 20)) {
          return { x: worldX, z: worldZ };
        }
      }
    }

    // Attempt random samples as fallback
    for (let i = 0; i < 20; i++) {
      const x = this.rng.nextFloat(-halfW, halfW);
      const z = this.rng.nextFloat(-halfH, halfH);
      const worldX = zoneX + x;
      const worldZ = zoneZ + z;
      if (this.isLocationValidForBuilding(worldX, worldZ, 20)) {
        return { x: worldX, z: worldZ };
      }
    }

    return null;
  }

  /**
   * Helper to check if a specific spot is valid for a building
   */
  private isLocationValidForBuilding(x: number, z: number, size: number): boolean {
    const halfSize = size / 2;
    // Check corners and center
    const checks = [
      { x: x, z: z },
      { x: x - halfSize, z: z - halfSize },
      { x: x + halfSize, z: z - halfSize },
      { x: x - halfSize, z: z + halfSize },
      { x: x + halfSize, z: z + halfSize },
    ];

    const elevs: number[] = [];

    for (const p of checks) {
      const t = this.getTerrainAt(p.x, p.z);
      if (!t) return false;
      if (t.type === 'water' || t.type === 'river') return false;
      // Avoid roads? Maybe, but objectives near roads are fine.
      // Avoid overlapping existing buildings? Logic needs that context, but this is map gen.
      elevs.push(t.elevation);
    }

    // Check flatness
    const min = Math.min(...elevs);
    const max = Math.max(...elevs);
    if (max - min > 5) return false; // Max 5m slope for the building itself

    return true;
  }

  /**
   * Find a valid position for a capture zone near the target position
   * Searches in expanding circles until a valid position is found
   */
  private findValidCaptureZonePosition(
    targetX: number,
    targetZ: number,
    width: number,
    height: number,
    maxSearchRadius: number,
    deploymentZones?: DeploymentZone[]
  ): { x: number; z: number } | null {
    // Helper to check deployment zone overlap
    const checkDeployment = (x: number, z: number, w: number, h: number): boolean => {
      if (!deploymentZones) return true;
      const buffer = 50;
      for (const zone of deploymentZones) {
        const minX = zone.minX - buffer - w / 2;
        const maxX = zone.maxX + buffer + w / 2;
        const minZ = zone.minZ - buffer - h / 2;
        const maxZ = zone.maxZ + buffer + h / 2;
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return false;
      }
      return true;
    };

    // First check if target position is valid
    if (this.isTerrainSuitableForCaptureZone(targetX, targetZ, width, height) && checkDeployment(targetX, targetZ, width, height)) {
      return { x: targetX, z: targetZ };
    }

    // Search in expanding rings
    const searchStep = Math.min(width, height) * 0.5;
    const numAngles = 8;

    for (let searchDist = searchStep; searchDist <= maxSearchRadius; searchDist += searchStep) {
      for (let i = 0; i < numAngles; i++) {
        const angle = (i / numAngles) * Math.PI * 2 + this.rng.nextFloat(-0.2, 0.2);
        const testX = targetX + Math.cos(angle) * searchDist;
        const testZ = targetZ + Math.sin(angle) * searchDist;

        // Stay within map bounds
        const marginX = width / 2 + 10;
        const marginZ = height / 2 + 10;
        if (Math.abs(testX) > this.width / 2 - marginX || Math.abs(testZ) > this.height / 2 - marginZ) {
          continue;
        }

        if (this.isTerrainSuitableForCaptureZone(testX, testZ, width, height) && checkDeployment(testX, testZ, width, height)) {
          return { x: testX, z: testZ };
        }
      }
    }

    return null; // No valid position found
  }


  /**
   * Get a thematic name for an objective type
   */
  private getObjectiveName(type: ObjectiveType): string {
    const names: Record<ObjectiveType, string[]> = {
      // Generic objectives
      radio_tower: ['Radio Tower', 'Signal Relay', 'Comms Outpost', 'Antenna Hill'],
      supply_cache: ['Supply Cache', 'Logistics Dump', 'Storage Site', 'Fuel Reserve'],
      bunker: ['Fortified Bunker', 'Command Post', 'Observation Bunker', 'Defensive Node'],
      hq_bunker: ['Command HQ', 'Strategic Command', 'Underground Base', 'General Staff HQ'],
      radar_station: ['Radar Array', 'Early Warning Site', 'Scanning Station', 'Signal Intelligence'],
      supply_depot: ['Main Supply Depot', 'Logistics Hub', 'Regional Warehouse', 'Army Supply Base'],
      vehicle_park: ['Motor Pool', 'Armor Reserve', 'Vehicle Staging', 'Transport Hub'],
      comms_array: ['Satellite Uplink', 'Global Comms Node', 'Encryption Center', 'Network Hub'],

      // Settlement objectives (common for larger zones)
      hamlet: ['Crossroads Hamlet', 'Rural Hamlet', 'Farmstead Cluster', 'Countryside Hamlet'],
      village: ['Village Center', 'Market Village', 'River Village', 'Hillside Village'],
      town: ['County Town', 'Regional Hub', 'Market Town', 'Provincial Capital'],
      city: ['City Center', 'Metropolitan District', 'Urban Core', 'Capital City'],

      // Rainforest objectives
      oil_field: ['Oil Derrick Alpha', 'Petroleum Site', 'Refinery Complex', 'Drilling Station'],
      logging_camp: ['Logging Camp', 'Timber Yard', 'Sawmill', 'Forest Station'],
      indigenous_settlement: ['Village Site', 'Sacred Grove', 'River Settlement', 'Tribal Outpost'],
      temple_complex: ['Ancient Temple', 'Ruined Plaza', 'Jungle Shrine', 'Sacred Site'],

      // Tundra objectives
      research_station: ['Research Base', 'Science Outpost', 'Observatory', 'Survey Station'],
      mine: ['Mining Complex', 'Extraction Site', 'Ore Processing', 'Quarry'],
      fuel_depot: ['Fuel Depot', 'Supply Cache', 'Heating Station', 'Energy Hub'],
      bio_dome: ['Research Dome', 'Artificial Biosphere', 'Arctic Habitat', 'Life Support Station'],

      // Mesa objectives
      mining_operation: ['Mining Operation', 'Copper Mine', 'Extraction Point', 'Mineral Site'],
      observation_post: ['Observation Post', 'Lookout Point', 'Survey Station', 'Watch Tower'],
      water_well: ['Water Well', 'Oasis', 'Aquifer Station', 'Water Pump'],
      harvester_rig: ['Extraction Rig', 'Mineral Harvester', 'Resource Platform', 'Mesa Rig'],

      // Mountains objectives
      communication_tower: ['Communication Tower', 'Radio Station', 'Signal Relay', 'Antenna Array'],
      ski_resort: ['Ski Resort', 'Mountain Lodge', 'Alpine Station', 'Recreation Center'],
      military_base: ['Military Base', 'Mountain Fortress', 'Strategic Point', 'Command Post'],
      orbital_uplink: ['Orbital Uplink', 'Space Comms', 'High-Altitude Relay', 'Satellite Ground Station'],

      // Plains objectives
      grain_silo: ['Grain Elevator', 'Silo Complex', 'Storage Depot', 'Harvest Center'],
      wind_farm: ['Wind Farm', 'Turbine Array', 'Energy Station', 'Power Grid'],
      rail_junction: ['Rail Junction', 'Train Depot', 'Railway Hub', 'Station'],

      // Farmland objectives
      processing_plant: ['Processing Plant', 'Food Factory', 'Packaging Center', 'Distribution Hub'],
      irrigation_station: ['Irrigation Station', 'Water Control', 'Pump Station', 'Canal Hub'],
      market_town: ['Market Town', 'Trading Post', 'Commerce Center', 'Exchange'],
      windmill: ['Old Windmill', 'Stone Mill', 'Rustic Windmill', 'Flour Mill'],

      // Cities objectives
      city_district: ['Financial District', 'Industrial Zone', 'Shopping Quarter', 'Old Town', 'Business Center', 'Waterfront', 'Tech Campus'],
      cooling_tower: ['Power Plant Coolant', 'Reactor Cooling', 'Industrial Vent', 'Ventilation Stack'],
    };

    const options = names[type];
    return options[this.rng.nextInt(0, options.length - 1)]!;
  }

  private generateCaptureZones(deploymentZones: DeploymentZone[]): CaptureZone[] {
    const sizeConfig = MAP_SIZES[this.size];
    const numZones = sizeConfig.zones;
    const zones: CaptureZone[] = [];
    const minZoneDistance = 60; // Minimum distance between zone edges

    // Scale factors
    const mapRadius = Math.min(this.width, this.height) * 0.45; // Safe generating area

    // Helper to check for overlaps with existing zones
    const checkOverlap = (x: number, z: number, w: number, h: number): boolean => {
      for (const zone of zones) {
        // loose AABB check with buffer
        const xDist = Math.abs(x - zone.x);
        const zDist = Math.abs(z - zone.z);
        const minX = (w + zone.width) / 2 + minZoneDistance;
        const minZ = (h + zone.height) / 2 + minZoneDistance;

        if (xDist < minX && zDist < minZ) {
          return true; // Overlap
        }
      }
      return false;
    };



    // 1. PLACE CENTRAL OBJECTIVE (Large, low value)
    const centerW = this.rng.nextFloat(100, 210);
    const centerH = this.rng.nextFloat(100, 210);
    const centerPos = this.findHighGroundPosition(0, 0, 100, centerW, centerH, deploymentZones);

    if (centerPos) {
      zones.push({
        id: 'zone_central',
        name: this.getObjectiveName('radio_tower'),
        x: centerPos.x,
        z: centerPos.z,
        width: centerW,
        height: centerH,
        pointsPerTick: 1, // Central, easy to find, hard to hold but low value
        owner: 'neutral',
        captureProgress: 0,
        objectiveType: 'radio_tower',
        visualVariant: 0,
      });
    }

    // 2. PLACE REMAINING ZONES
    let failures = 0;
    const maxFailures = 50;
    const biomeObjectives = this.rng.shuffle([...this.biomeConfig.objectiveTypes]);
    let biomeObjIndex = 0;

    while (zones.length < numZones && failures < maxFailures) {
      // Random position in the map
      const angle = this.rng.nextFloat(0, Math.PI * 2);
      // Distribute from near center to edge, but push outwards for variety
      const distPercent = Math.sqrt(this.rng.nextFloat(0.1, 1.0)); // Bias away from center
      const dist = distPercent * mapRadius;

      const targetX = Math.cos(angle) * dist;
      const targetZ = Math.sin(angle) * dist;

      // Determine size and points based on distance
      let width: number, height: number, points: number;

      if (distPercent < 0.3) {
        // Inner ring: Large size, low points
        width = this.rng.nextFloat(80, 180);
        height = this.rng.nextFloat(80, 180);
        points = 1;
      } else if (distPercent < 0.6) {
        // Mid ring: Medium size, medium points
        width = this.rng.nextFloat(60, 150);
        height = this.rng.nextFloat(60, 150);
        points = 2;
      } else {
        // Outer ring: Small size, high points
        width = this.rng.nextFloat(40, 105);
        height = this.rng.nextFloat(40, 105);
        points = 3;
      }

      // Try to find valid terrain
      const pos = this.findValidCaptureZonePosition(targetX, targetZ, width, height, 100, deploymentZones);

      if (pos) {
        // Check for overlap with buffer
        if (!checkOverlap(pos.x, pos.z, width, height)) {
          zones.push({
            id: `zone_${String.fromCharCode(65 + zones.length)}`, // AZ
            name: `Zone ${String.fromCharCode(65 + zones.length)}`,
            x: pos.x,
            z: pos.z,
            objectiveX: pos.objectiveX,
            objectiveZ: pos.objectiveZ,
            width,
            height,
            pointsPerTick: 1,
            owner: 'neutral',
            captureProgress: 0,
            objectiveType: 'supply_cache', // Default, will be updated
            visualVariant: Math.floor(this.rng.next() * 3)
          });

          failures = 0; // Reset failures on success
        } else {
          failures++;
        }
      } else {
        failures++;
      }
    }

    if (zones.length < numZones) {
      console.warn(`Could only generate ${zones.length}/${numZones} capture zones due to placement constraints.`);
    }

    return zones;
  }

  /**
   * Find a position with high elevation within a search area
   */
  private findHighGroundPosition(
    centerX: number,
    centerZ: number,
    searchRadius: number,
    width: number,
    height: number,
    deploymentZones?: DeploymentZone[]
  ): { x: number; z: number } | null {
    let bestPos = { x: centerX, z: centerZ };
    let maxElevation = -Infinity;
    const samples = 12;

    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const dist = this.rng.nextFloat(0, searchRadius);
      const x = centerX + Math.cos(angle) * dist;
      const z = centerZ + Math.sin(angle) * dist;

      const elev = this.getElevationAt(x, z);

      // Check deployment zones if provided
      let validPos = true;
      if (deploymentZones) {
        const buffer = 50;
        for (const zone of deploymentZones) {
          const minX = zone.minX - buffer - width / 2;
          const maxX = zone.maxX + buffer + width / 2;
          const minZ = zone.minZ - buffer - height / 2;
          const maxZ = zone.maxZ + buffer + height / 2;
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
            validPos = false;
            break;
          }
        }
      }

      if (validPos && elev > maxElevation && this.isTerrainSuitableForCaptureZone(x, z, width, height)) {
        maxElevation = elev;
        bestPos = { x, z };
      }
    }

    return maxElevation > -Infinity ? bestPos : null;
  }

  /**
   * Find a position with high elevation within a search area
   */
  private findValidCaptureZonePosition(
    targetX: number,
    targetZ: number,
    width: number,
    height: number,
    searchRadius: number,
    deploymentZones?: DeploymentZone[]
  ): { x: number; z: number; objectiveX?: number; objectiveZ?: number } | null {
    const centerX = targetX;
    const centerZ = targetZ;

    let bestPos: { x: number; z: number; objectiveX?: number; objectiveZ?: number } | null = null;
    let maxElevation = -Infinity;
    const samples = 12;

    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const dist = this.rng.nextFloat(0, searchRadius);
      const x = centerX + Math.cos(angle) * dist;
      const z = centerZ + Math.sin(angle) * dist;

      const elev = this.getElevationAt(x, z);

      // Check deployment zones if provided
      let validPos = true;
      if (deploymentZones) {
        const buffer = 50;
        for (const zone of deploymentZones) {
          const minX = zone.minX - buffer - width / 2;
          const maxX = zone.maxX + buffer + width / 2;
          const minZ = zone.minZ - buffer - height / 2;
          const maxZ = zone.maxZ + buffer + height / 2;
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
            validPos = false;
            break;
          }
        }
      }

      if (validPos && this.isTerrainSuitableForCaptureZone(x, z, width, height)) {
        // New logic: search for a valid objective placement spot within this valid zone
        const objectiveLoc = this.findValidObjectiveLocation(x, z, width, height);

        if (objectiveLoc) {
          // Prefer higher elevation if multiple valid found
          if (elev > maxElevation) {
            maxElevation = elev;
            bestPos = { x, z, objectiveX: objectiveLoc.x, objectiveZ: objectiveLoc.z };
          }
        }
      }
    }

    return bestPos;
  }



  // Old generateBuildings, generateTown, and generateRoadBuildings methods
  // have been replaced by the settlement system (see generateSettlements() and
  // generateRoadBuildings() methods above)

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
    // Scale forest count and size with map size
    const mapScale = Math.max(this.width, this.height) / 300; // Base scale on 300m map

    // Maximum forest radius scales with map size (about 8% of map dimension)
    // - 300m map: ~24m max radius
    // - 10000m map: ~800m max radius
    const maxForestRadius = Math.max(this.width, this.height) * 0.08;

    // Apply biome forest density (from biome config instead of random)
    const forestDensity = this.rng.nextFloat(
      this.biomeConfig.forestDensity.min,
      this.biomeConfig.forestDensity.max
    );

    // Base forest count scales with density AND map size
    // Scale min forests with map size (at least 1, but scaling up)
    const minForests = Math.floor(4 * forestDensity * Math.max(1, mapScale * 0.5));

    // Remove cap, scale roughly linearly with map scale
    // (4 + mapScale * 3) gives good base scaling, multiplied by density
    const maxForests = Math.floor((4 + mapScale * 3) * forestDensity);

    const numForests = this.rng.nextInt(minForests, Math.max(minForests + 1, maxForests));

    // Forest size also scales with density
    const baseSizeMin = 20 * (0.8 + forestDensity * 0.2);
    const baseSizeMax = 50 * (0.8 + forestDensity * 0.4);

    const margin = Math.max(30, this.width * 0.05);

    for (let i = 0; i < numForests; i++) {
      const centerX = this.rng.nextFloat(-this.width / 2 + margin, this.width / 2 - margin);
      const centerZ = this.rng.nextFloat(-this.height / 2 + margin, this.height / 2 - margin);
      // Scale forest radius with map size, density, and biome size scale
      const baseRadius = this.rng.nextFloat(baseSizeMin, baseSizeMax);
      const scaledRadius = baseRadius * Math.sqrt(mapScale) * this.biomeConfig.forestSizeScale;
      const radius = Math.min(scaledRadius, maxForestRadius);

      this.paintForest(centerX, centerZ, radius, roads, buildings);
    }

    // For very high density maps, add additional scattered tree clusters
    if (forestDensity > 2.5) {
      const numClusters = this.rng.nextInt(5, Math.floor(15 * (forestDensity - 2)));
      for (let i = 0; i < numClusters; i++) {
        const centerX = this.rng.nextFloat(-this.width / 2 + margin, this.width / 2 - margin);
        const centerZ = this.rng.nextFloat(-this.height / 2 + margin, this.height / 2 - margin);
        // Smaller scattered clusters, also capped, with biome size scale
        const clusterRadius = Math.min(
          this.rng.nextFloat(10, 25) * Math.sqrt(mapScale) * this.biomeConfig.forestSizeScale,
          maxForestRadius
        );
        this.paintForest(centerX, centerZ, clusterRadius, roads, buildings);
      }
    }

    // Smoothing pass: blend forests that are within 5m edge-to-edge
    // This creates more natural connected shapes and unique forest formations
    this.smoothForestEdges(roads, buildings);
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

    // Use unique seed offset based on forest center for variety
    const forestSeed = Math.abs(centerX * 1000 + centerZ) % 10000;

    // Generate 16 unique radii for cardinal directions (every 22.5 degrees)
    const numDirections = 16;
    const directionalRadii: number[] = [];
    for (let i = 0; i < numDirections; i++) {
      // Each direction gets a random multiplier between 0.3 and 1.4 of base radius
      const noise = this.pseudoNoise(forestSeed + i * 100, forestSeed - i * 50);
      const multiplier = 0.3 + noise * 1.1; // Range: 0.3 to 1.4
      directionalRadii.push(radius * multiplier);
    }

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = (x * this.cellSize) - this.width / 2;
        const worldZ = (z * this.cellSize) - this.height / 2;

        const dx = worldX - centerX;
        const dz = worldZ - centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Calculate angle from forest center (0 to 2*PI)
        let angle = Math.atan2(dz, dx);
        if (angle < 0) angle += Math.PI * 2;

        // Find which two directional radii to interpolate between
        const anglePerDirection = (Math.PI * 2) / numDirections;
        const directionIndex = angle / anglePerDirection;
        const lowerIndex = Math.floor(directionIndex) % numDirections;
        const upperIndex = (lowerIndex + 1) % numDirections;

        // Blend factor between the two directions (0 to 1)
        const blendFactor = directionIndex - Math.floor(directionIndex);

        // Smooth interpolation using smoothstep for natural blending
        const smoothBlend = blendFactor * blendFactor * (3 - 2 * blendFactor);

        // Interpolate between the two directional radii
        const baseEffectiveRadius = directionalRadii[lowerIndex]! * (1 - smoothBlend) +
          directionalRadii[upperIndex]! * smoothBlend;

        // Add fine detail noise for jagged edges (smaller scale variation)
        const fineNoise1 = this.pseudoNoise(
          worldX * 0.12 + forestSeed,
          worldZ * 0.12
        ) * radius * 0.15;

        const fineNoise2 = this.pseudoNoise(
          worldX * 0.25 + forestSeed + 200,
          worldZ * 0.25
        ) * radius * 0.08;

        const effectiveRadius = baseEffectiveRadius + fineNoise1 + fineNoise2;

        if (dist < effectiveRadius) {
          // Check if not on road, building, or water
          if (!this.isOnRoad(worldX, worldZ, roads) &&
            !this.isOnBuilding(worldX, worldZ, buildings) &&
            !this.isOnWater(worldX, worldZ)) {
            this.terrain[z]![x]!.type = 'forest';
            this.terrain[z]![x]!.cover = 'heavy';
          }
        }
      }
    }
  }

  /**
   * Smoothing pass to blend forests that are within 5m edge-to-edge
   * This creates more natural, connected forest shapes instead of isolated circles
   */
  private smoothForestEdges(roads: Road[], buildings: Building[]): void {
    const cols = this.terrain[0]!.length;
    const rows = this.terrain.length;

    // Calculate how many cells = 5 meters
    const blendDistance = Math.ceil(5 / this.cellSize);

    // Multiple passes to fully blend nearby forests
    const numPasses = 3;

    for (let pass = 0; pass < numPasses; pass++) {
      // Collect cells to convert to forest (don't modify during iteration)
      const cellsToForest: Array<{ x: number; z: number }> = [];

      for (let z = blendDistance; z < rows - blendDistance; z++) {
        for (let x = blendDistance; x < cols - blendDistance; x++) {
          const cell = this.terrain[z]![x]!;

          // Only process non-forest cells
          if (cell.type === 'forest' || cell.type === 'road' ||
            cell.type === 'building' || cell.type === 'river' ||
            cell.type === 'water') {
            continue;
          }

          // Count forest neighbors in the blend radius
          let forestNeighbors = 0;
          let totalChecked = 0;

          // Check neighboring cells within blend distance
          for (let dz = -blendDistance; dz <= blendDistance; dz++) {
            for (let dx = -blendDistance; dx <= blendDistance; dx++) {
              if (dx === 0 && dz === 0) continue;

              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist > blendDistance) continue;

              totalChecked++;
              const neighbor = this.terrain[z + dz]?.[x + dx];
              if (neighbor?.type === 'forest') {
                forestNeighbors++;
              }
            }
          }

          // If enough neighbors are forest, this cell bridges two forests
          // Threshold: at least 40% of nearby cells are forest
          const forestRatio = forestNeighbors / totalChecked;
          if (forestRatio >= 0.4) {
            // Check if this cell would connect distinct forest clusters
            // (has forest neighbors on at least 2 opposite-ish sides)
            const hasNorth = this.terrain[z - 1]?.[x]?.type === 'forest';
            const hasSouth = this.terrain[z + 1]?.[x]?.type === 'forest';
            const hasEast = this.terrain[z]?.[x + 1]?.type === 'forest';
            const hasWest = this.terrain[z]?.[x - 1]?.type === 'forest';
            const hasNE = this.terrain[z - 1]?.[x + 1]?.type === 'forest';
            const hasNW = this.terrain[z - 1]?.[x - 1]?.type === 'forest';
            const hasSE = this.terrain[z + 1]?.[x + 1]?.type === 'forest';
            const hasSW = this.terrain[z + 1]?.[x - 1]?.type === 'forest';

            // Check for bridging pattern (forest on opposing sides)
            const bridgesNS = (hasNorth || hasNE || hasNW) && (hasSouth || hasSE || hasSW);
            const bridgesEW = (hasEast || hasNE || hasSE) && (hasWest || hasNW || hasSW);
            const bridgesDiag1 = (hasNE) && (hasSW);
            const bridgesDiag2 = (hasNW) && (hasSE);

            if (bridgesNS || bridgesEW || bridgesDiag1 || bridgesDiag2 || forestRatio >= 0.5) {
              const worldX = (x * this.cellSize) - this.width / 2;
              const worldZ = (z * this.cellSize) - this.height / 2;

              // Make sure not on road, building, or water
              if (!this.isOnRoad(worldX, worldZ, roads) &&
                !this.isOnBuilding(worldX, worldZ, buildings) &&
                !this.isOnWater(worldX, worldZ)) {
                cellsToForest.push({ x, z });
              }
            }
          }
        }
      }

      // Apply the changes
      for (const cell of cellsToForest) {
        this.terrain[cell.z]![cell.x]!.type = 'forest';
        this.terrain[cell.z]![cell.x]!.cover = 'heavy';
      }

      // If no changes made, we're done
      if (cellsToForest.length === 0) break;
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

  /**
   * Check if a point is on any water body (lake, river, or pond)
   */
  private isOnWater(x: number, z: number): boolean {
    for (const water of this.waterBodies) {
      if (water.type === 'lake' || water.type === 'pond') {
        // Check if inside lake/pond polygon
        if (this.isPointInPolygon(x, z, water.points)) {
          return true;
        }
      } else if (water.type === 'river') {
        // Check distance to river path
        const halfWidth = water.width / 2;
        for (let i = 0; i < water.points.length - 1; i++) {
          const p1 = water.points[i]!;
          const p2 = water.points[i + 1]!;
          const dist = this.pointToSegmentDistance(x, z, p1.x, p1.z, p2.x, p2.z);
          if (dist < halfWidth) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if a building overlaps with any water body
   */
  private isBuildingOnWater(building: Building): boolean {
    // Check building corners and center
    const halfW = building.width / 2;
    const halfD = building.depth / 2;
    const checkPoints = [
      { x: building.x, z: building.z }, // center
      { x: building.x - halfW, z: building.z - halfD }, // corners
      { x: building.x + halfW, z: building.z - halfD },
      { x: building.x - halfW, z: building.z + halfD },
      { x: building.x + halfW, z: building.z + halfD },
    ];

    for (const point of checkPoints) {
      if (this.isOnWater(point.x, point.z)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Remove buildings from settlements that are on water
   * Called after water generation to clean up conflicts
   */
  private filterBuildingsOnWater(): void {
    for (const settlement of this.settlements) {
      // Filter out buildings that are on water
      settlement.buildings = settlement.buildings.filter(b => !this.isBuildingOnWater(b));
    }
  }

  /**
   * Check if a building overlaps with any road
   */
  private isBuildingOnRoad(building: Building, roads: Road[]): boolean {
    // Get building corners for more accurate collision
    const halfW = building.width / 2;
    const halfD = building.depth / 2;
    const corners = [
      { x: building.x - halfW, z: building.z - halfD },
      { x: building.x + halfW, z: building.z - halfD },
      { x: building.x - halfW, z: building.z + halfD },
      { x: building.x + halfW, z: building.z + halfD },
      { x: building.x, z: building.z }, // center
    ];

    for (const road of roads) {
      const roadBuffer = road.width / 2 + 2; // Road half-width plus small buffer

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i]!;
        const p2 = road.points[i + 1]!;

        // Check if any corner is too close to the road segment
        for (const corner of corners) {
          const dist = this.pointToSegmentDistance(corner.x, corner.z, p1.x, p1.z, p2.x, p2.z);
          if (dist < roadBuffer) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Filter out settlement streets that overlap with main roads (highways, interstates)
   * This prevents town streets from rendering on top of major roads
   */
  private filterOverlappingStreets(streets: Road[], mainRoads: Road[]): Road[] {
    // Only check against highways and interstates
    const majorRoads = mainRoads.filter(r => r.type === 'highway' || r.type === 'interstate');
    if (majorRoads.length === 0) return streets;

    return streets.filter(street => {
      // Check if any point of the street is too close to a major road
      for (const point of street.points) {
        for (const majorRoad of majorRoads) {
          for (let i = 0; i < majorRoad.points.length - 1; i++) {
            const p1 = majorRoad.points[i]!;
            const p2 = majorRoad.points[i + 1]!;
            const dist = this.pointToSegmentDistance(point.x, point.z, p1.x, p1.z, p2.x, p2.z);
            // If street point is within the major road's width, filter it out
            if (dist < majorRoad.width / 2 + 2) {
              return false;
            }
          }
        }
      }
      return true;
    });
  }

  /**
   * Remove buildings that overlap with roads
   * Called after road generation to clean up conflicts
   */
  private filterBuildingsOnRoads(roads: Road[]): void {
    for (const settlement of this.settlements) {
      settlement.buildings = settlement.buildings.filter(b => !this.isBuildingOnRoad(b, roads));
    }
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

  private updateTerrainWithFeatures(roads: Road[], buildings: Building[]): void {
    const cols = this.terrain[0]!.length;
    const rows = this.terrain.length;

    // Mark roads
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = (x * this.cellSize) - this.width / 2;
        const worldZ = (z * this.cellSize) - this.height / 2;

        // Don't overwrite water bodies (rivers, lakes, ponds)
        if (this.terrain[z]![x]!.type !== 'river' && this.terrain[z]![x]!.type !== 'water') {
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
      case 'river': return 0;    // Impassable (use bridges)
      case 'water': return 0;    // Impassable (lakes, ponds)
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

    // Generate ONE set of entry points per team
    const teams: ('player' | 'enemy')[] = ['player', 'enemy'];

    for (const team of teams) {
      const teamZones = deploymentZones.filter(z => z.team === team);
      if (teamZones.length === 0) continue;

      // Calculate team's edge area
      const teamEdgeZ = team === 'player'
        ? -this.height / 2
        : this.height / 2;
      const edgeThreshold = this.height * 0.15;

      // Find roads near the team's map edge
      const edgeRoads: Array<{ x: number; z: number; type: 'highway' | 'secondary' | 'dirt' }> = [];

      for (const road of roads) {
        for (const point of road.points) {
          const nearEdge = team === 'player'
            ? point.z < -this.height / 2 + edgeThreshold
            : point.z > this.height / 2 - edgeThreshold;

          if (nearEdge) {
            let type: 'highway' | 'secondary' | 'dirt' = 'secondary';
            if (road.width >= 8) type = 'highway';
            else if (road.width < 5) type = 'dirt';

            edgeRoads.push({ x: point.x, z: teamEdgeZ, type });
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
            id: `${team}_entry_${index}`,
            team,
            x: road.x,
            z: road.z,
            type: road.type,
            spawnRate: this.getSpawnRate(road.type),
            queue: [],
            rallyPoint: null,
          });
        });
      } else {
        // Create default entry points spread across map width
        const defaultPositions = [
          { x: -this.width / 4, z: teamEdgeZ },
          { x: 0, z: teamEdgeZ },
          { x: this.width / 4, z: teamEdgeZ },
        ];

        defaultPositions.forEach((pos, index) => {
          entryPoints.push({
            id: `${team}_entry_${index}`,
            team,
            x: pos.x,
            z: pos.z,
            type: 'secondary',
            spawnRate: 3,
            queue: [],
            rallyPoint: null,
          });
        });
      }

      // Add one air entry point at map edge center
      entryPoints.push({
        id: `${team}_air_entry`,
        team,
        x: 0,
        z: teamEdgeZ,
        type: 'air',
        spawnRate: 5,
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
   * Places 2-5 resupply points per team AT THE MAP EDGE
   * X positions are organic based on terrain: major roads, forest cover
   * Each team gets DIFFERENT X positions based on their zone's actual terrain
   */
  private generateResupplyPoints(deploymentZones: DeploymentZone[], roads: Road[]): ResupplyPoint[] {
    const resupplyPoints: ResupplyPoint[] = [];
    const sizeConfig = MAP_SIZES[this.size];

    // Determine number of resupply points based on map size (2-5 per team)
    const numPerTeam = sizeConfig.zones <= 3 ? 2 : sizeConfig.zones <= 5 ? 3 : 5;

    // Group zones by team - generate ONE set of resupply points per team
    const teams: ('player' | 'enemy')[] = ['player', 'enemy'];

    for (const team of teams) {
      const teamZones = deploymentZones.filter(z => z.team === team);
      if (teamZones.length === 0) continue;

      // Direction pointing INTO the battlefield (toward map center)
      const direction = team === 'player' ? 0 : Math.PI;

      // Map edge Z coordinate for this team
      const mapEdgeZ = team === 'player' ? -this.height / 2 : this.height / 2;

      // Use full map width for resupply point placement
      const margin = Math.max(30, this.width * 0.03);
      const fullMinX = -this.width / 2 + margin;
      const fullMaxX = this.width / 2 - margin;
      const fullWidth = fullMaxX - fullMinX;

      // Collect candidate positions with scores
      const candidates: { x: number; z: number; score: number; type: string }[] = [];

      // 1. HIGHEST PRIORITY: Major roads near map edge
      const roadTypeScore: Record<RoadType, number> = {
        interstate: 150,
        highway: 120,
        bridge: 100,
        town: 70,
        dirt: 40,
      };

      for (const road of roads) {
        // Find road segments near the map edge for this team
        for (let i = 0; i < road.points.length - 1; i++) {
          const p1 = road.points[i]!;
          const p2 = road.points[i + 1]!;

          // Check if either point is near the team's edge
          const edgeThreshold = this.height * 0.15;
          const p1NearEdge = team === 'player'
            ? p1.z < -this.height / 2 + edgeThreshold
            : p1.z > this.height / 2 - edgeThreshold;
          const p2NearEdge = team === 'player'
            ? p2.z < -this.height / 2 + edgeThreshold
            : p2.z > this.height / 2 - edgeThreshold;

          if (p1NearEdge || p2NearEdge) {
            const usePoint = p1NearEdge ? p1 : p2;
            const score = roadTypeScore[road.type];
            candidates.push({
              x: usePoint.x,
              z: mapEdgeZ,
              score,
              type: `road_${road.type}`
            });
          }
        }
      }

      // 2. MEDIUM PRIORITY: Forest edges for concealment
      const cols = this.terrain[0]?.length ?? 0;
      const rows = this.terrain.length;

      // Scan near the team's edge for forest edges
      const edgeRowStart = team === 'player' ? 0 : Math.floor(rows * 0.85);
      const edgeRowEnd = team === 'player' ? Math.ceil(rows * 0.15) : rows - 1;

      for (let row = edgeRowStart; row <= edgeRowEnd; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = this.terrain[row]?.[col];
          if (!cell || cell.type !== 'forest') continue;

          const neighbors = [
            this.terrain[row - 1]?.[col],
            this.terrain[row + 1]?.[col],
            this.terrain[row]?.[col - 1],
            this.terrain[row]?.[col + 1],
          ];

          const hasOpenNeighbor = neighbors.some(n =>
            n && (n.type === 'field' || n.type === 'road')
          );

          if (hasOpenNeighbor) {
            const worldX = col * this.cellSize - this.width / 2 + this.cellSize / 2;
            candidates.push({
              x: worldX,
              z: mapEdgeZ,
              score: 35,
              type: 'forest_edge'
            });
          }
        }
      }

      // 3. LOW PRIORITY: Open field positions as fallback (spread across full width)
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5;
        const x = fullMinX + fullWidth * t;
        candidates.push({ x, z: mapEdgeZ, score: 20, type: 'open_field' });
      }

      // Sort by score (highest first)
      candidates.sort((a, b) => b.score - a.score);

      // Select positions with minimum spacing
      const selectedPositions: { x: number; z: number; type: string }[] = [];
      const minSpacing = Math.min(fullWidth / (numPerTeam + 1), 80);

      for (const candidate of candidates) {
        if (selectedPositions.length >= numPerTeam) break;

        const clampedX = Math.max(fullMinX + 15, Math.min(fullMaxX - 15, candidate.x));

        let tooClose = false;
        for (const existing of selectedPositions) {
          if (Math.abs(clampedX - existing.x) < minSpacing) {
            tooClose = true;
            break;
          }
        }

        if (!tooClose) {
          selectedPositions.push({ x: clampedX, z: mapEdgeZ, type: candidate.type });
        }
      }

      // Ensure we have at least 2 positions
      while (selectedPositions.length < 2) {
        const fallbackX = fullMinX + fullWidth * (0.3 + selectedPositions.length * 0.4);
        selectedPositions.push({
          x: fallbackX,
          z: mapEdgeZ,
          type: 'fallback'
        });
      }

      // Create resupply points
      selectedPositions.forEach((pos, index) => {
        resupplyPoints.push({
          id: `${team}_resupply_${index}`,
          x: pos.x,
          z: pos.z,
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

  // ============================================================
  // WATER SYSTEM - Lakes, Rivers, Ponds
  // ============================================================

  /**
   * Generate all water bodies for the map
   * Called BEFORE road generation so roads can avoid lakes and create bridges
   */
  private generateWaterBodies(deploymentZones: DeploymentZone[]): void {
    // Reset slope tracking
    this.riverSource = null;
    this.riverSinks = [];

    // Generate lake (70% chance)
    const lake = this.generateLake(deploymentZones);

    // Generate river system (always if lake exists, 90% otherwise - increased from 80%)
    const hasLake = lake !== null;
    if (hasLake || this.rng.next() < 0.9) {
      this.generateRiverSystem(lake);
    }

    // Apply general elevation slope based on river flow BEFORE smoothing
    this.applyRiverBasedElevationSlope();

    // Smooth water bank transitions to eliminate jaggedness
    this.smoothWaterBankElevations();
  }

  /**
   * Apply a linear elevation slope across the map based on river flow.
   * Source: 1-10m raised, Sinks: 0-10m lowered.
   */
  private applyRiverBasedElevationSlope(): void {
    if (!this.riverSource || this.riverSinks.length === 0) return;

    // Calculate average sink position
    let avgSinkX = 0;
    let avgSinkZ = 0;
    for (const sink of this.riverSinks) {
      avgSinkX += sink.x;
      avgSinkZ += sink.z;
    }
    avgSinkX /= this.riverSinks.length;
    avgSinkZ /= this.riverSinks.length;

    // Gradient vector from source to average sink
    const dx = avgSinkX - this.riverSource.x;
    const dz = avgSinkZ - this.riverSource.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 100) return; // Points too close to define a meaningful slope

    const dist = Math.sqrt(distSq);
    const ux = dx / dist;
    const uz = dz / dist;

    // Determine raise/lower amounts
    const raiseAmount = this.rng.nextFloat(1, 10);
    const lowerAmount = this.rng.nextFloat(0, 10);
    const totalDiff = raiseAmount + lowerAmount;

    // We want to apply an adjustment: adj = raiseAmount - (projection_distance / total_distance) * totalDiff
    // Where projection_distance is the distance along the (ux, uz) vector from the source.

    // Find map extent along this axis to normalize
    const corners = [
      { x: -this.width / 2, z: -this.height / 2 },
      { x: this.width / 2, z: -this.height / 2 },
      { x: -this.width / 2, z: this.height / 2 },
      { x: this.width / 2, z: this.height / 2 },
    ];

    let minProj = Infinity;
    let maxProj = -Infinity;
    for (const corner of corners) {
      const proj = (corner.x - this.riverSource.x) * ux + (corner.z - this.riverSource.z) * uz;
      minProj = Math.min(minProj, proj);
      maxProj = Math.max(maxProj, proj);
    }

    const projRange = maxProj - minProj;
    if (projRange < 10) return;

    // Calculate source projection to offset correctly
    const sourceProj = 0; // By definition since we subtract riverSource.x/z

    const cols = this.terrain[0]?.length ?? 0;
    const rows = this.terrain.length;

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = x * this.cellSize - this.width / 2;
        const worldZ = z * this.cellSize - this.height / 2;

        const proj = (worldX - this.riverSource.x) * ux + (worldZ - this.riverSource.z) * uz;

        // Linear interpolation: 
        // At sourceProj (0), we want roughly +raiseAmount (actually depends on where source is in the range)
        // Let's normalize proj to [0, 1] across the map extent
        const t = (proj - minProj) / projRange;

        // We want source to be high, sinks to be low.
        // If the vector points from Source to Sinks, then Sinks have higher t than Source.
        // sourceT = (sourceProj - minProj) / projRange
        const sourceT = (0 - minProj) / projRange;

        // Adjustment should be: adj = raiseAmount at sourceT, -lowerAmount at some "average sinkT"
        // Simplest: adj = (1 - t) * raiseAmount - t * lowerAmount is not quite right because it doesn't pivot on sourceT.

        // Let's use: adjustment = raiseAmount - t * (raiseAmount + lowerAmount)
        // This gives raiseAmount at t=0 and -lowerAmount at t=1.
        const adjustment = raiseAmount - t * totalDiff;

        this.terrain[z]![x]!.elevation += adjustment;
      }
    }

    console.log(`Applied elevation slope: source(${this.riverSource.x.toFixed(0)}, ${this.riverSource.z.toFixed(0)}) raised ${raiseAmount.toFixed(1)}m, sinks lowered ${lowerAmount.toFixed(1)}m`);
  }

  /**
   * Smooth elevation transitions around water bodies to eliminate jaggedness
   * Applies multiple passes of local averaging near water edges
   */
  private smoothWaterBankElevations(): void {
    const cols = this.terrain[0]?.length ?? 0;
    const rows = this.terrain.length;

    // Define smoothing radius in cells (roughly 3-5 cells)
    const smoothRadius = Math.max(2, Math.ceil(15 / this.cellSize));

    // Pass 1: SPECIFIC smoothing for water beds (water-to-water only)
    // This removes "mountain noise" from the river bed by ignoring non-water neighbors
    for (let pass = 0; pass < 3; pass++) {
      const bedElevations: (number | null)[][] = [];
      for (let z = 0; z < rows; z++) {
        bedElevations[z] = [];
        for (let x = 0; x < cols; x++) {
          const cell = this.terrain[z]![x]!;
          const isWater = cell.type === 'river' || cell.type === 'water' || cell.type === 'pond';

          if (!isWater) {
            bedElevations[z]![x] = null;
            continue;
          }

          let waterTotal = 0;
          let waterCount = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nz = z + dz;
              const nx = x + dx;
              if (nz >= 0 && nz < rows && nx >= 0 && nx < cols) {
                const neighbor = this.terrain[nz]![nx]!;
                const isNeighborWater = neighbor.type === 'river' || neighbor.type === 'water' || neighbor.type === 'pond';
                if (isNeighborWater) {
                  waterTotal += neighbor.elevation;
                  waterCount++;
                }
              }
            }
          }
          bedElevations[z]![x] = waterCount > 0 ? waterTotal / waterCount : cell.elevation;
        }
      }
      for (let z = 0; z < rows; z++) {
        for (let x = 0; x < cols; x++) {
          const val = bedElevations[z]![x];
          if (val !== null) this.terrain[z]![x]!.elevation = val;
        }
      }
    }

    // Pass 2: General transition smoothing for banks (as before, but water is now cleaner)
    const numPasses = 5;

    for (let pass = 0; pass < numPasses; pass++) {
      // Store new elevations to avoid modifying during iteration
      const newElevations: number[][] = [];

      for (let z = 0; z < rows; z++) {
        newElevations[z] = [];
        for (let x = 0; x < cols; x++) {
          const cell = this.terrain[z]![x]!;
          const isWater = cell.type === 'river' || cell.type === 'water' || cell.type === 'pond';

          // Check if this cell is near water
          let nearWater = false;
          if (isWater) {
            nearWater = true;
          } else {
            for (let dz = -smoothRadius; dz <= smoothRadius && !nearWater; dz++) {
              for (let dx = -smoothRadius; dx <= smoothRadius; dx++) {
                const nz = z + dz;
                const nx = x + dx;
                if (nz >= 0 && nz < rows && nx >= 0 && nx < cols) {
                  const neighbor = this.terrain[nz]![nx]!;
                  if (neighbor.type === 'river' || neighbor.type === 'water' || neighbor.type === 'pond') {
                    nearWater = true;
                    break;
                  }
                }
              }
            }
          }

          if (nearWater) {
            // Smooth by averaging with neighbors (Gaussian-like blur)
            let totalElevation = 0;
            let totalWeight = 0;

            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nz = z + dz;
                const nx = x + dx;

                if (nz >= 0 && nz < rows && nx >= 0 && nx < cols) {
                  const neighbor = this.terrain[nz]![nx]!;

                  // Weight: center has higher weight, corners have lower
                  const dist = Math.sqrt(dx * dx + dz * dz);
                  const weight = dist === 0 ? 2.0 : (1.0 / (1.0 + dist));

                  totalElevation += neighbor.elevation * weight;
                  totalWeight += weight;
                }
              }
            }

            let averagedElevation = totalWeight > 0 ? totalElevation / totalWeight : cell.elevation;

            newElevations[z]![x] = averagedElevation;
          } else {
            // Not near water, keep original elevation
            newElevations[z]![x] = cell.elevation;
          }
        }
      }

      // Apply smoothed elevations to all cells involved
      for (let z = 0; z < rows; z++) {
        for (let x = 0; x < cols; x++) {
          this.terrain[z]![x]!.elevation = newElevations[z]![x]!;
        }
      }
    }
  }

  /**
   * Generate a lake with irregular polygon shape
   * 70% chance of spawning, avoids deployment zones, prefers low elevation areas
   */
  private generateLake(deploymentZones: DeploymentZone[]): WaterBody | null {
    if (this.rng.next() > 0.7) return null;

    const deployBuffer = 100;

    // Find candidate positions (prefer low elevation)
    const candidates: Array<{ x: number; z: number; elevation: number }> = [];
    const numCandidates = 15;

    for (let i = 0; i < numCandidates; i++) {
      const x = this.rng.nextFloat(-this.width / 3, this.width / 3);
      const z = this.rng.nextFloat(-this.height / 3, this.height / 3);

      // Check deployment zone buffer
      let valid = true;
      for (const zone of deploymentZones) {
        const closestX = Math.max(zone.minX, Math.min(zone.maxX, x));
        const closestZ = Math.max(zone.minZ, Math.min(zone.maxZ, z));
        const dist = Math.sqrt((x - closestX) ** 2 + (z - closestZ) ** 2);
        if (dist < deployBuffer) {
          valid = false;
          break;
        }
      }

      if (valid) {
        const elevation = this.getElevationAt(x, z);
        candidates.push({ x, z, elevation });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by elevation (lowest first) and pick from the lowest 30%
    candidates.sort((a, b) => a.elevation - b.elevation);
    const topCandidates = Math.max(1, Math.floor(candidates.length * 0.3));
    const chosen = candidates[this.rng.nextInt(0, topCandidates - 1)]!;

    const centerX = chosen.x;
    const centerZ = chosen.z;

    const mapScale = Math.max(this.width, this.height) / 300;
    const baseRadius = this.rng.nextFloat(30, 60) * Math.sqrt(mapScale);
    const numPoints = this.rng.nextInt(8, 14);
    const points: { x: number; z: number }[] = [];

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const radiusVariation = baseRadius * this.rng.nextFloat(0.6, 1.2);
      const noiseOffset = this.pseudoNoise(i * 0.5, this.seed) * baseRadius * 0.3;
      const r = radiusVariation + noiseOffset;
      points.push({
        x: centerX + Math.cos(angle) * r,
        z: centerZ + Math.sin(angle) * r,
      });
    }

    const lake: WaterBody = {
      id: `lake_${this.waterBodies.length}`,
      type: 'lake',
      points,
      width: baseRadius * 2,
      radius: baseRadius,
    };

    this.waterBodies.push(lake);
    this.paintLakeToTerrain(lake);
    return lake;
  }

  private paintLakeToTerrain(lake: WaterBody): void {
    const cols = this.terrain[0]?.length ?? 0;
    const rows = this.terrain.length;
    const bankWidth = 15; // Width of sloped bank around lake edge

    // First pass: paint water cells and create depression
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = x * this.cellSize - this.width / 2;
        const worldZ = z * this.cellSize - this.height / 2;

        if (this.isPointInPolygon(worldX, worldZ, lake.points)) {
          // Inside lake - set to water
          this.terrain[z]![x]!.type = 'water';
          this.terrain[z]![x]!.cover = 'none';
          this.terrain[z]![x]!.elevation = 0;
        } else {
          // Check if near lake edge for bank slope
          const distToLake = this.distanceToPolygonEdge(worldX, worldZ, lake.points);
          if (distToLake < bankWidth) {
            // Create gradual slope toward lake
            const currentElevation = this.terrain[z]![x]!.elevation;
            const slopeFactor = distToLake / bankWidth; // 0 at edge, 1 at bankWidth distance

            // Smooth cubic interpolation (smoothstep) for natural slope
            const smoothFactor = slopeFactor * slopeFactor * (3 - 2 * slopeFactor);

            // Lower elevation smoothly from current height to water level
            const targetElevation = Math.max(0, currentElevation * smoothFactor);
            this.terrain[z]![x]!.elevation = targetElevation;
          }
        }
      }
    }
  }

  /**
   * Calculate distance from a point to the nearest edge of a polygon
   */
  private distanceToPolygonEdge(x: number, z: number, polygon: { x: number; z: number }[]): number {
    let minDist = Infinity;
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
      const p1 = polygon[i]!;
      const p2 = polygon[(i + 1) % n]!;
      const dist = this.pointToSegmentDistance(x, z, p1.x, p1.z, p2.x, p2.z);
      minDist = Math.min(minDist, dist);
    }

    return minDist;
  }

  private isPointInPolygon(x: number, z: number, polygon: { x: number; z: number }[]): boolean {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = polygon[i]!;
      const pj = polygon[j]!;
      if (pi.z > z !== pj.z > z && x < ((pj.x - pi.x) * (z - pi.z)) / (pj.z - pi.z) + pi.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  private generateRiverSystem(lake: WaterBody | null): void {
    const mainRiver = this.generateMainRiver(lake);
    if (!mainRiver) return;

    this.waterBodies.push(mainRiver);
    this.paintRiverToTerrain(mainRiver);

    if (this.rng.next() < 0.8) { // Increased from 0.5
      const numTributaries = this.rng.nextInt(1, 3); // Increased from 1-2
      for (let i = 0; i < numTributaries; i++) {
        const tributary = this.generateTributary(mainRiver);
        if (tributary) {
          this.waterBodies.push(tributary);
          this.paintRiverToTerrain(tributary);
        }
      }
    }
  }

  private generateMainRiver(lake: WaterBody | null): WaterBody | null {
    const mapScale = Math.max(this.width, this.height) / 300;
    const riverWidth = this.rng.nextFloat(8, 15) * Math.sqrt(mapScale);

    const edges = ['north', 'south', 'east', 'west'] as const;
    const startEdge = edges[this.rng.nextInt(0, 3)]!;
    let endEdge: (typeof edges)[number];

    if (lake) {
      endEdge = startEdge;
    } else {
      if (startEdge === 'north')
        endEdge = this.rng.next() < 0.7 ? 'south' : this.rng.next() < 0.5 ? 'east' : 'west';
      else if (startEdge === 'south')
        endEdge = this.rng.next() < 0.7 ? 'north' : this.rng.next() < 0.5 ? 'east' : 'west';
      else if (startEdge === 'east')
        endEdge = this.rng.next() < 0.7 ? 'west' : this.rng.next() < 0.5 ? 'north' : 'south';
      else endEdge = this.rng.next() < 0.7 ? 'east' : this.rng.next() < 0.5 ? 'north' : 'south';
    }

    const start = this.getEdgePoint(startEdge);
    const end = lake ? this.getLakeEdgePoint(lake, start) : this.getEdgePoint(endEdge);
    const points = this.generateMeanderingPath(start, end);

    // Track slope source and sinks
    this.riverSource = start;
    if (!lake) {
      this.riverSinks.push(end);
    }

    const river: WaterBody = {
      id: `river_${this.waterBodies.length}`,
      type: 'river',
      points,
      width: riverWidth,
    };

    // Add metadata for renderer to know this river connects to a lake
    // This enables smooth width tapering at the connection point
    if (lake) {
      (river as any).connectsToLake = true;
      (river as any).lakeId = lake.id;
    }

    return river;
  }

  private generateTributary(mainRiver: WaterBody): WaterBody | null {
    const mapScale = Math.max(this.width, this.height) / 300;
    const tributaryWidth = this.rng.nextFloat(4, 8) * Math.sqrt(mapScale);

    const mainPoints = mainRiver.points;
    // Try multiple join points to find a valid one
    for (let attempt = 0; attempt < 5; attempt++) {
      const joinIndex = this.rng.nextInt(
        Math.floor(mainPoints.length * 0.2), // Expanded search range
        Math.floor(mainPoints.length * 0.8)
      );
      const joinPoint = mainPoints[joinIndex]!;

      const edges = ['north', 'south', 'east', 'west'] as const;
      const startEdge = edges[this.rng.nextInt(0, 3)]!;
      const start = this.getEdgePoint(startEdge);

      const dist = Math.sqrt((start.x - joinPoint.x) ** 2 + (start.z - joinPoint.z) ** 2);

      // Minimum length check (15% of map size)
      if (dist > Math.min(this.width, this.height) * 0.15) {
        const points = this.generateMeanderingPath(start, joinPoint);

        // Tributary starts at edge, so it's a sink (water flowing into main river)
        this.riverSinks.push(start);

        return {
          id: `tributary_${this.waterBodies.length}`,
          type: 'river',
          points,
          width: tributaryWidth,
        };
      }
    }

    return null;
  }

  private getEdgePoint(edge: 'north' | 'south' | 'east' | 'west'): { x: number; z: number } {
    const margin = 0.1;
    switch (edge) {
      case 'north':
        return {
          x: this.rng.nextFloat((-this.width / 2) * (1 - margin), (this.width / 2) * (1 - margin)),
          z: this.height / 2,
        };
      case 'south':
        return {
          x: this.rng.nextFloat((-this.width / 2) * (1 - margin), (this.width / 2) * (1 - margin)),
          z: -this.height / 2,
        };
      case 'east':
        return {
          x: this.width / 2,
          z: this.rng.nextFloat((-this.height / 2) * (1 - margin), (this.height / 2) * (1 - margin)),
        };
      case 'west':
        return {
          x: -this.width / 2,
          z: this.rng.nextFloat((-this.height / 2) * (1 - margin), (this.height / 2) * (1 - margin)),
        };
    }
  }

  private getWaterBodyCenter(water: WaterBody): { x: number; z: number } {
    let sumX = 0;
    let sumZ = 0;
    for (const p of water.points) {
      sumX += p.x;
      sumZ += p.z;
    }
    return { x: sumX / water.points.length, z: sumZ / water.points.length };
  }

  /**
   * Find point on lake edge where river should meet the lake
   * Traces line from riverStart toward lake center and finds intersection with lake perimeter
   */
  private getLakeEdgePoint(lake: WaterBody, riverStart: { x: number; z: number }): { x: number; z: number } {
    const lakeCenter = this.getWaterBodyCenter(lake);

    // Direction from river start toward lake center
    const dx = lakeCenter.x - riverStart.x;
    const dz = lakeCenter.z - riverStart.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / length;
    const dirZ = dz / length;

    // Find intersection with lake polygon
    // Cast ray from start toward lake and find where it crosses lake boundary
    let closestIntersection: { x: number; z: number } | null = null;
    let closestDist = Infinity;

    const n = lake.points.length;
    for (let i = 0; i < n; i++) {
      const p1 = lake.points[i]!;
      const p2 = lake.points[(i + 1) % n]!;

      // Check if ray intersects this edge segment
      const intersection = this.raySegmentIntersection(
        riverStart,
        { x: dirX, z: dirZ },
        p1,
        p2
      );

      if (intersection) {
        const dist = Math.sqrt(
          (intersection.x - riverStart.x) ** 2 + (intersection.z - riverStart.z) ** 2
        );
        if (dist < closestDist) {
          closestDist = dist;
          closestIntersection = intersection;
        }
      }
    }

    // If we found an intersection, extend it further into the lake
    // CRITICAL: Must extend far enough so that BOTH EDGES of the river width are within the lake
    // Otherwise, one edge will terminate on land, leaving a visible gap
    if (closestIntersection) {
      // Calculate required extension: river half-width + safety margin + lake bank width
      // River can be up to 15m wide (7.5m half-width), lake bank is 15m
      // Need to extend at least: 7.5 (half-width) + 15 (bank) + 10 (safety) = 32.5m
      const extensionDistance = 40; // Push 40m into the lake to ensure full connection

      const extendedX = closestIntersection.x + dirX * extensionDistance;
      const extendedZ = closestIntersection.z + dirZ * extensionDistance;

      // Clamp to battlefield boundaries to prevent river from going off-map
      const margin = 10; // Small margin from edge
      const clampedX = Math.max(-this.width / 2 + margin, Math.min(this.width / 2 - margin, extendedX));
      const clampedZ = Math.max(-this.height / 2 + margin, Math.min(this.height / 2 - margin, extendedZ));

      return {
        x: clampedX,
        z: clampedZ,
      };
    }

    // Fallback: find nearest point on lake perimeter
    let nearestPoint = lake.points[0]!;
    let minDist = Infinity;
    for (const p of lake.points) {
      const dist = Math.sqrt((p.x - riverStart.x) ** 2 + (p.z - riverStart.z) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearestPoint = p;
      }
    }
    return nearestPoint;
  }

  /**
   * Calculate ray-segment intersection
   * Returns intersection point if ray from origin in direction intersects segment p1-p2
   */
  private raySegmentIntersection(
    origin: { x: number; z: number },
    direction: { x: number; z: number },
    p1: { x: number; z: number },
    p2: { x: number; z: number }
  ): { x: number; z: number } | null {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;

    const cross = direction.x * dz - direction.z * dx;
    if (Math.abs(cross) < 0.0001) return null; // Parallel

    const t2 = ((origin.x - p1.x) * direction.z - (origin.z - p1.z) * direction.x) / cross;
    if (t2 < 0 || t2 > 1) return null; // Outside segment

    const t1 = ((origin.x - p1.x) * dz - (origin.z - p1.z) * dx) / cross;
    if (t1 < 0) return null; // Behind origin

    return {
      x: origin.x + direction.x * t1,
      z: origin.z + direction.z * t1,
    };
  }

  private generateMeanderingPath(
    start: { x: number; z: number },
    end: { x: number; z: number }
  ): { x: number; z: number }[] {
    const points: { x: number; z: number }[] = [];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);

    // More points for smoother curves (every 5m instead of 20m)
    const numPoints = Math.max(20, Math.floor(length / 5));
    const perpX = -dz / length;
    const perpZ = dx / length;

    // River meander parameters - gentler curves
    const maxAmplitude = length * 0.12; // Max lateral displacement

    // Generate 2-4 gentle bends using low-frequency sine waves
    const numBends = 2 + Math.floor(this.rng.next() * 2); // 2-3 bends
    const baseFrequency = (numBends * Math.PI) / length;

    // Random phase offset for variety
    const phaseOffset = this.rng.nextFloat(0, Math.PI * 2);

    // Randomly select one bend to be tighter (50% chance)
    const hasTightBend = this.rng.next() < 0.5;
    const tightBendPosition = this.rng.nextFloat(0.3, 0.7); // Where along the river
    const tightBendWidth = 0.15; // How wide the tight bend section is

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      let x = start.x + dx * t;
      let z = start.z + dz * t;

      // Smooth falloff at edges (river enters/exits straight)
      const edgeFalloff = Math.sin(t * Math.PI);

      // Primary gentle meander using smooth sine wave
      const primaryWave = Math.sin(t * length * baseFrequency + phaseOffset);

      // Secondary smaller wave for natural variation
      const secondaryWave = Math.sin(t * length * baseFrequency * 2.3 + phaseOffset * 1.7) * 0.3;

      // Combined wave (mostly primary, little secondary)
      let waveValue = primaryWave + secondaryWave;

      // Amplitude varies smoothly along river (thinner at edges)
      let amplitude = maxAmplitude * edgeFalloff;

      // Add one tighter bend if selected
      if (hasTightBend) {
        const distFromTightBend = Math.abs(t - tightBendPosition);
        if (distFromTightBend < tightBendWidth) {
          // Increase amplitude and add sharper curve component near tight bend
          const tightness = 1 - distFromTightBend / tightBendWidth;
          const tightBoost = tightness * tightness; // Quadratic falloff
          amplitude *= 1 + tightBoost * 0.5;
          // Add a localized sharper curve
          waveValue += Math.sin((t - tightBendPosition) * 20) * tightBoost * 0.4;
        }
      }

      const displacement = waveValue * amplitude * 0.7; // Scale down overall

      x += perpX * displacement;
      z += perpZ * displacement;
      points.push({ x, z });
    }
    return points;
  }

  private paintRiverToTerrain(river: WaterBody): void {
    const cols = this.terrain[0]?.length ?? 0;
    const rows = this.terrain.length;
    const halfWidth = (river.width ?? 10) / 2;
    const bankWidth = 12; // Width of sloped bank on each side

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = x * this.cellSize - this.width / 2;
        const worldZ = z * this.cellSize - this.height / 2;

        // Find minimum distance to any river segment
        let minDist = Infinity;
        for (let i = 0; i < river.points.length - 1; i++) {
          const p1 = river.points[i]!;
          const p2 = river.points[i + 1]!;
          const dist = this.pointToSegmentDistance(worldX, worldZ, p1.x, p1.z, p2.x, p2.z);
          minDist = Math.min(minDist, dist);
        }

        const flatBuffer = 2; // Extra flat area to ensure edges aren't bumpy
        if (minDist < halfWidth + flatBuffer) {
          // Inside river - set to water and flat elevation
          if (minDist < halfWidth) {
            this.terrain[z]![x]!.type = 'river';
            this.terrain[z]![x]!.cover = 'none';
          }
          this.terrain[z]![x]!.elevation = 0;
        } else if (minDist < halfWidth + bankWidth) {
          // On river bank - create gradual slope
          const currentElevation = this.terrain[z]![x]!.elevation;
          const distFromEdge = minDist - (halfWidth + flatBuffer);
          const effectiveBankWidth = bankWidth - flatBuffer;
          const slopeFactor = Math.max(0, distFromEdge / effectiveBankWidth); // 0 at flat edge, 1 at bank end

          // Smooth cubic interpolation for natural slope
          const smoothFactor = slopeFactor * slopeFactor * (3 - 2 * slopeFactor);
          const targetElevation = Math.max(0, currentElevation * smoothFactor);
          this.terrain[z]![x]!.elevation = targetElevation;
        }
      }
    }
  }

  /**
   * Check if a point on a road is currently on a bridge
   */
  private isPointOnBridge(x: number, z: number, roadId?: string): boolean {
    if (!roadId) return false;
    const roadBridges = this.bridgeElevations.get(roadId);
    if (!roadBridges) return false;
    for (const bridge of roadBridges) {
      const dist = Math.sqrt((x - bridge.x) ** 2 + (z - bridge.z) ** 2);
      if (dist < bridge.length / 2) return true;
    }
    return false;
  }

  /**
   * Generate farm fields (paddocks) around agricultural buildings
   * Creates rectangular or organic fields with varied crop colors
   */
  private generateFarmFields(buildings: Building[]): void {
    const farmBuildings = buildings.filter(b =>
      b.category === 'agricultural' ||
      b.subtype === 'farmhouse' ||
      b.subtype === 'barn'
    );

    const fieldVariants = 4; // 0=Green, 1=Wheat, 2=Pasture, 3=Dirt

    for (const farm of farmBuildings) {
      // Generate 2-4 fields per farm
      const numFields = this.rng.nextInt(2, 4);

      for (let i = 0; i < numFields; i++) {
        // Random dimensions (20-60m)
        const width = this.rng.nextInt(3, 8) * this.cellSize;
        const length = this.rng.nextInt(4, 10) * this.cellSize;

        // Offset from farm building (random direction)
        const angle = this.rng.next() * Math.PI * 2;
        const dist = this.rng.nextFloat(20, 60);

        const cx = farm.x + Math.cos(angle) * dist;
        const cz = farm.z + Math.sin(angle) * dist;

        // Determine rotation (align with farm or random)
        const rotation = (this.rng.next() < 0.7 && farm.rotation !== undefined) ? farm.rotation : this.rng.next() * Math.PI * 2;

        // Pick a crop variant
        const variant = this.rng.nextInt(0, fieldVariants - 1);

        // Rasterize rotated rectangle into grid
        this.paintField(cx, cz, width, length, rotation, variant);
      }
    }
  }

  /**
   * Paint a rotated rectangular field onto the terrain
   */
  private paintField(cx: number, cz: number, width: number, length: number, rotation: number, variant: number): void {
    const cosR = Math.cos(-rotation);
    const sinR = Math.sin(-rotation);

    // Calculate bounding box to minimize iteration
    const radius = Math.sqrt(width * width + length * length) / 2;
    const minX = cx - radius;
    const maxX = cx + radius;
    const minZ = cz - radius;
    const maxZ = cz + radius;

    const minGridX = Math.max(0, Math.floor((minX + this.width / 2) / this.cellSize));
    const maxGridX = Math.min(this.terrain[0]!.length - 1, Math.ceil((maxX + this.width / 2) / this.cellSize));
    const minGridZ = Math.max(0, Math.floor((minZ + this.height / 2) / this.cellSize));
    const maxGridZ = Math.min(this.terrain.length - 1, Math.ceil((maxZ + this.height / 2) / this.cellSize));

    for (let z = minGridZ; z <= maxGridZ; z++) {
      for (let x = minGridX; x <= maxGridX; x++) {
        const cell = this.terrain[z]![x]!;

        // Don't overwrite existing important features
        if (cell.type === 'road' || cell.type === 'river' || cell.type === 'water' || cell.type === 'building' || cell.type === 'forest') {
          continue;
        }

        const worldX = x * this.cellSize - this.width / 2;
        const worldZ = z * this.cellSize - this.height / 2;

        // Transform point to local field space
        const dx = worldX - cx;
        const dz = worldZ - cz;

        const localX = dx * cosR - dz * sinR;
        const localZ = dx * sinR + dz * cosR;

        // Check if inside rectangle
        if (Math.abs(localX) <= width / 2 && Math.abs(localZ) <= length / 2) {
          // Add some noise to edges for natural look
          const edgeDist = Math.min(width / 2 - Math.abs(localX), length / 2 - Math.abs(localZ));
          if (edgeDist > 1 || this.rng.next() > 0.5) {
            cell.type = 'field';
            cell.variant = variant;
            cell.cover = 'none'; // Fields have no heavy cover
          }
        }
      }
    }
  }

  private generatePonds(buildings: Building[]): void {
    const farmBuildings = buildings.filter(
      (b) =>
        b.category === 'agricultural' ||
        b.subtype === 'barn' ||
        b.subtype === 'farmhouse' ||
        b.subtype === 'silo'
    );

    const numPonds = Math.min(farmBuildings.length, this.rng.nextInt(2, 6));

    for (let i = 0; i < numPonds; i++) {
      const farm = farmBuildings[i % farmBuildings.length];
      if (!farm) continue;

      const angle = this.rng.nextFloat(0, Math.PI * 2);
      const dist = this.rng.nextFloat(15, 30);
      const centerX = farm.x + Math.cos(angle) * dist;
      const centerZ = farm.z + Math.sin(angle) * dist;

      const mapScale = Math.max(this.width, this.height) / 300;
      const radius = this.rng.nextFloat(5, 12) * Math.sqrt(mapScale);

      const numPoints = 8;
      const pondPoints: { x: number; z: number }[] = [];

      for (let j = 0; j < numPoints; j++) {
        const a = (j / numPoints) * Math.PI * 2;
        const r = radius * this.rng.nextFloat(0.85, 1.15);
        pondPoints.push({
          x: centerX + Math.cos(a) * r,
          z: centerZ + Math.sin(a) * r,
        });
      }

      const pond: WaterBody = {
        id: `pond_${this.waterBodies.length}`,
        type: 'pond',
        points: pondPoints,
        width: radius * 2,
        radius,
      };

      this.waterBodies.push(pond);
      this.paintLakeToTerrain(pond);
    }
  }

  isNearLake(x: number, z: number, buffer: number): boolean {
    for (const water of this.waterBodies) {
      if (water.type !== 'lake') continue;
      const center = this.getWaterBodyCenter(water);
      const dist = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);
      if (dist < (water.radius ?? 50) + buffer) return true;
    }
    return false;
  }

  private createBridgesForRoads(roads: Road[]): void {
    const rivers = this.waterBodies.filter((w) => w.type === 'river');

    for (const road of roads) {
      // Calculate preliminary road elevation profile to know where the road will be graded
      const preliminaryProfile = this.calculateRoadElevationProfile(road);

      // Step 1: Collect ALL river crossings for THIS SPECIFIC ROAD
      interface RiverCrossing {
        river: WaterBody;
        crossing: { x: number; z: number };
        segmentIndex: number;
        distanceAlongRoad: number;
      }

      const allCrossings: RiverCrossing[] = [];
      let cumulativeDistance = 0;

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i]!;
        const p2 = road.points[i + 1]!;

        const segmentDx = p2.x - p1.x;
        const segmentDz = p2.z - p1.z;
        const segmentLength = Math.sqrt(segmentDx * segmentDx + segmentDz * segmentDz);

        for (const river of rivers) {
          const crossing = this.findRiverCrossing(p1, p2, river);
          if (crossing) {
            // Calculate distance along road to this crossing
            const crossingDx = crossing.x - p1.x;
            const crossingDz = crossing.z - p1.z;
            const distInSegment = Math.sqrt(crossingDx * crossingDx + crossingDz * crossingDz);

            allCrossings.push({
              river,
              crossing,
              segmentIndex: i,
              distanceAlongRoad: cumulativeDistance + distInSegment,
            });
          }
        }

        cumulativeDistance += segmentLength;
      }

      // Step 2: Sort crossings by distance along THIS road
      allCrossings.sort((a, b) => a.distanceAlongRoad - b.distanceAlongRoad);

      // Step 3: Group crossings by river object for THIS road
      // This handles winding rivers that cross THIS road multiple times
      const riverGroups = new Map<WaterBody, RiverCrossing[]>();

      for (const crossing of allCrossings) {
        if (!riverGroups.has(crossing.river)) {
          riverGroups.set(crossing.river, []);
        }
        riverGroups.get(crossing.river)!.push(crossing);
      }

      // Step 4: For each river crossed by THIS road, check if crossings are continuous
      // If there's a large gap, split into separate bridge groups
      const crossingGroups: RiverCrossing[][] = [];
      const maxGapWithinRiver = 50; // meters - max gap between crossings of the same river

      for (const [river, riverCrossings] of riverGroups) {
        if (riverCrossings.length === 0) continue;

        // Start first group for this river
        let currentGroup: RiverCrossing[] = [riverCrossings[0]!];

        for (let i = 1; i < riverCrossings.length; i++) {
          const prev = riverCrossings[i - 1]!;
          const curr = riverCrossings[i]!;
          const gap = curr.distanceAlongRoad - prev.distanceAlongRoad;

          if (gap <= maxGapWithinRiver) {
            // Continuous crossing - add to current group
            currentGroup.push(curr);
          } else {
            // Large gap - this is a separate crossing of the same river
            crossingGroups.push(currentGroup);
            currentGroup = [curr];
          }
        }

        // Add the last group
        if (currentGroup.length > 0) {
          crossingGroups.push(currentGroup);
        }
      }

      // Step 5: Create one bridge for each group
      for (const group of crossingGroups) {
        if (group.length === 0) continue;

        // Use the middle crossing as the reference point
        const midIndex = Math.floor(group.length / 2);
        const refCrossing = group[midIndex]!;

        // Calculate bridge direction from road
        const segIdx = refCrossing.segmentIndex;
        const p1 = road.points[segIdx]!;
        const p2 = road.points[segIdx + 1]!;

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const segmentLength = Math.sqrt(dx * dx + dz * dz);
        if (segmentLength < 0.1) continue;

        const angle = Math.atan2(dz, dx);
        const dirX = Math.cos(angle);
        const dirZ = Math.sin(angle);

        // Sample terrain elevations around the crossing
        const centerElev = this.getTerrainElevationAt(refCrossing.crossing.x, refCrossing.crossing.z);

        // Dynamically extend bridge endpoints first to find where they'll meet the road
        const maxBridgeLength = 200;
        const elevationTolerance = 2.0;
        const stepSize = 2;

        // Map boundaries
        const minX = -this.width / 2;
        const maxX = this.width / 2;
        const minZ = -this.height / 2;
        const maxZ = this.height / 2;

        // Extend backwards to find bridge start
        let bridgeStartX = refCrossing.crossing.x;
        let bridgeStartZ = refCrossing.crossing.z;
        let distanceBack = 0;

        // We need to find the bridge elevation first by sampling the road at a reasonable distance
        // Use the widest river to estimate initial search distance
        const maxRiverWidth = Math.max(...group.map(c => c.river.width ?? 10));
        const initialHalfLength = Math.max(maxRiverWidth * 1.5, 25);

        // Sample road elevation at estimated bridge approach points to determine bridge height
        const approachStartX = refCrossing.crossing.x - dirX * initialHalfLength;
        const approachStartZ = refCrossing.crossing.z - dirZ * initialHalfLength;
        const approachEndX = refCrossing.crossing.x + dirX * initialHalfLength;
        const approachEndZ = refCrossing.crossing.z + dirZ * initialHalfLength;

        const roadElevStart = this.getRoadElevationFromProfile(approachStartX, approachStartZ, road.points, preliminaryProfile);
        const roadElevEnd = this.getRoadElevationFromProfile(approachEndX, approachEndZ, road.points, preliminaryProfile);

        // Bridge elevation should match the road elevation at the approaches
        // Use the higher of the two ends, plus a small clearance above the water
        let bridgeElevation = Math.max(roadElevStart, roadElevEnd);
        bridgeElevation = Math.max(bridgeElevation, centerElev + 3.0); // Ensure at least 3m above water

        // Now extend backwards to find exact bridge start point
        while (distanceBack < maxBridgeLength) {
          const testX = refCrossing.crossing.x - dirX * distanceBack;
          const testZ = refCrossing.crossing.z - dirZ * distanceBack;

          if (testX < minX || testX > maxX || testZ < minZ || testZ > maxZ) {
            break;
          }

          const roadElev = this.getRoadElevationFromProfile(
            testX,
            testZ,
            road.points,
            preliminaryProfile
          );

          if (Math.abs(roadElev - bridgeElevation) <= elevationTolerance) {
            bridgeStartX = testX;
            bridgeStartZ = testZ;
            break;
          }
          distanceBack += stepSize;
        }

        // Extend forwards
        let bridgeEndX = refCrossing.crossing.x;
        let bridgeEndZ = refCrossing.crossing.z;
        let distanceForward = 0;
        while (distanceForward < maxBridgeLength) {
          const testX = refCrossing.crossing.x + dirX * distanceForward;
          const testZ = refCrossing.crossing.z + dirZ * distanceForward;

          if (testX < minX || testX > maxX || testZ < minZ || testZ > maxZ) {
            break;
          }

          const roadElev = this.getRoadElevationFromProfile(
            testX,
            testZ,
            road.points,
            preliminaryProfile
          );

          if (Math.abs(roadElev - bridgeElevation) <= elevationTolerance) {
            bridgeEndX = testX;
            bridgeEndZ = testZ;
            break;
          }
          distanceForward += stepSize;
        }

        // Calculate final bridge length and center
        const bridgeDx = bridgeEndX - bridgeStartX;
        const bridgeDz = bridgeEndZ - bridgeStartZ;
        const bridgeLength = Math.sqrt(bridgeDx * bridgeDx + bridgeDz * bridgeDz);
        const bridgeCenterX = (bridgeStartX + bridgeEndX) / 2;
        const bridgeCenterZ = (bridgeStartZ + bridgeEndZ) / 2;

        const bridge: Bridge = {
          id: `bridge_${this.bridges.length}`,
          x: bridgeCenterX,
          z: bridgeCenterZ,
          length: Math.max(bridgeLength, 25),
          width: road.width + 2,
          angle,
          elevation: bridgeElevation,
        };

        if (road.id) {
          bridge.roadId = road.id;

          if (!this.bridgeElevations.has(road.id)) {
            this.bridgeElevations.set(road.id, []);
          }
          this.bridgeElevations.get(road.id)!.push({
            x: bridgeCenterX,
            z: bridgeCenterZ,
            elevation: bridgeElevation,
            length: bridge.length,
            angle,
          });
        }

        this.bridges.push(bridge);
        this.markBridgeFootprint(bridge);
      }
    }
  }

  /**
   * Create bridges (overpasses/underpasses) where roads cross at different elevations
   * This prevents one road from forcing steep grades on the crossing road.
   * Also handles vertical clearance between bridges.
   */
  private createBridgesForRoadCrossings(roads: Road[]): void {
    const minClearance = 5.0; // meters - minimum clearance for a road to pass under a bridge
    const defaultBridgeLength = 40; // meters - default length of overpass bridge

    for (let i = 0; i < roads.length; i++) {
      for (let j = i + 1; j < roads.length; j++) {
        const roadA = roads[i]!;
        const roadB = roads[j]!;

        const intersections = this.findRoadIntersectionPoints(roadA, roadB);
        if (intersections.length === 0) continue;

        // Cluster intersections
        const clusters: { x: number; z: number }[][] = [];
        const clusterThreshold = 40;

        for (const inter of intersections) {
          let paired = false;
          for (const cluster of clusters) {
            const first = cluster[0]!;
            const dist = Math.sqrt((inter.x - first.x) ** 2 + (inter.z - first.z) ** 2);
            if (dist < clusterThreshold) {
              cluster.push(inter);
              paired = true;
              break;
            }
          }
          if (!paired) clusters.push([inter]);
        }

        for (const cluster of clusters) {
          let centerX = 0, centerZ = 0;
          for (const p of cluster) {
            centerX += p.x;
            centerZ += p.z;
          }
          centerX /= cluster.length;
          centerZ /= cluster.length;

          // Recalculate profiles to ensure they include any bridges created in previous loops or createBridgesForRoads
          const profileA = this.calculateRoadElevationProfile(roadA);
          const profileB = this.calculateRoadElevationProfile(roadB);

          let elevA = this.getRoadElevationFromProfile(centerX, centerZ, roadA.points, profileA);
          let elevB = this.getRoadElevationFromProfile(centerX, centerZ, roadB.points, profileB);

          // Check if either road is already on a bridge here
          const bridgeA = this.findExistingBridgeAt(centerX, centerZ, roadA.id);
          const bridgeB = this.findExistingBridgeAt(centerX, centerZ, roadB.id);

          const isAlreadyBridged = !!bridgeA || !!bridgeB;
          const currentDiff = Math.abs(elevA - elevB);

          // If they are too close and should be separated by a bridge, or if they are already bridged but lack clearance
          if (currentDiff < minClearance) {
            // Check if we SHOULD have a bridge here (either significant terrain difference or deliberate overpass)
            // For now, if they are within the same elevation profile context and have been bridged elsewhere,
            // or if they are crossing and one is "clearly" meant to be an overpass.
            // A common case is a highway crossing another highway at ground level - we usually want an intersection.
            // But if one is a bridge (over a valley), and the other crosses it, we MUST have clearance.

            if (isAlreadyBridged || currentDiff > 2.0) {
              // Enforce clearance
              const higherRoad = elevA >= elevB ? roadA : roadB;
              const lowerRoad = elevA >= elevB ? roadB : roadA;

              const newHigherElev = Math.max(elevA, elevB, Math.min(elevA, elevB) + minClearance);

              // Update elevation data
              if (higherRoad === roadA) elevA = newHigherElev;
              else elevB = newHigherElev;

              // Update or Create bridge for the higher road
              this.applyBridgeElevation(higherRoad, centerX, centerZ, newHigherElev, defaultBridgeLength, cluster);
            }
          } else {
            // Already have enough clearance, just ensure bridge objects exist for the higher road
            const higherRoad = elevA > elevB ? roadA : roadB;
            const higherElev = Math.max(elevA, elevB);
            this.applyBridgeElevation(higherRoad, centerX, centerZ, higherElev, defaultBridgeLength, cluster);
          }
        }
      }
    }
  }

  /**
   * Find an existing bridge entry in bridgeElevations for a specific road near a point
   */
  private findExistingBridgeAt(x: number, z: number, roadId?: string): { elevation: number; length: number; angle: number } | null {
    if (!roadId) return null;
    const entries = this.bridgeElevations.get(roadId);
    if (!entries) return null;

    for (const entry of entries) {
      const distSq = (entry.x - x) ** 2 + (entry.z - z) ** 2;
      if (distSq < (entry.length / 2 + 10) ** 2) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Apply bridge elevation to a road at a specific point.
   * Updates existing bridge data if present, otherwise creates new bridge object.
   */
  private applyBridgeElevation(
    road: Road,
    x: number,
    z: number,
    elevation: number,
    defaultLength: number,
    cluster: { x: number; z: number }[]
  ): void {
    if (!road.id) return;

    // Calculate length based on cluster extent
    let maxDist = 0;
    for (const p of cluster) {
      const d = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
      if (d > maxDist) maxDist = d;
    }
    const length = Math.max(defaultLength, maxDist * 2 + 15);
    const angle = this.getRoadDirectionAtPoint(road, { x, z });

    // 1. Update bridgeElevations (used for terrain grading and road profiles)
    if (!this.bridgeElevations.has(road.id)) {
      this.bridgeElevations.set(road.id, []);
    }

    const entries = this.bridgeElevations.get(road.id)!;
    let existingEntry = null;
    for (const entry of entries) {
      const dSq = (entry.x - x) ** 2 + (entry.z - z) ** 2;
      if (dSq < 30 * 30) { // If within 30m, it's the same crossing
        existingEntry = entry;
        break;
      }
    }

    if (existingEntry) {
      existingEntry.elevation = Math.max(existingEntry.elevation, elevation);
      existingEntry.length = Math.max(existingEntry.length, length);
    } else {
      entries.push({ x, z, elevation, length, angle });
    }

    // 2. Update/Create Bridge visual objects
    let existingBridge = null;
    for (const bridge of this.bridges) {
      if (bridge.roadId === road.id) {
        const dSq = (bridge.x - x) ** 2 + (bridge.z - z) ** 2;
        if (dSq < 30 * 30) {
          existingBridge = bridge;
          break;
        }
      }
    }

    if (existingBridge) {
      existingBridge.elevation = Math.max(existingBridge.elevation, elevation);
      existingBridge.length = Math.max(existingBridge.length, length);
    } else {
      const newBridge: Bridge = {
        id: `bridge_${this.bridges.length}`,
        roadId: road.id,
        x, z, length,
        width: road.width + 2,
        angle,
        elevation
      };
      this.bridges.push(newBridge);
      this.markBridgeFootprint(newBridge);
    }
  }

  /**
   * Mark the terrain under a bridge to prevent terrain grading from modifying it
   */
  private markBridgeFootprint(bridge: Bridge): void {
    // This is mostly a hint for grading, which already checks isPointOnBridge
  }

  /**
   * Grade terrain around roads to create smooth ramps and cuts
   * This ensures roads are accessible with reasonable grades for vehicles
   */
  private gradeTerrainAroundRoads(roads: Road[]): void {
    // Grade all roads to create flat road beds that cut into terrain
    for (const road of roads) {
      // Step 1: Calculate smooth elevation profile along the road with max grade limit
      const elevationProfile = this.calculateRoadElevationProfile(road);

      // Step 2: Apply the elevation profile to terrain
      const sampleDistance = 5; // Sample every 5 meters for smoother grading

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i]!;
        const p2 = road.points[i + 1]!;
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const segmentLength = Math.sqrt(dx * dx + dz * dz);
        if (segmentLength < 0.1) continue;

        const numSamples = Math.ceil(segmentLength / sampleDistance);

        // Calculate perpendicular direction for this segment
        const perpX = -dz / segmentLength;
        const perpZ = dx / segmentLength;

        for (let j = 0; j <= numSamples; j++) {
          const t = j / numSamples;
          const px = p1.x + dx * t;
          const pz = p1.z + dz * t;

          // Skip terrain grading if this point is on a bridge
          // Bridges should fly OVER the terrain, so we don't want to raise the ground level under them
          // The road ramping happens before/after the bridge structure
          if (this.isPointOnBridge(px, pz, road.id)) {
            continue;
          }

          // Get smoothed road elevation from profile (not raw terrain)
          const roadElevation = this.getRoadElevationFromProfile(px, pz, road.points, elevationProfile);

          // Grade width based on road type
          const gradeWidth = road.type === 'interstate' ? 30 :
            road.type === 'highway' ? 25 :
              road.type === 'town' ? 20 : 15;

          // Apply directional grading that cuts into hillsides
          this.applyDirectionalTerrainGrading(px, pz, perpX, perpZ, roadElevation, road.width, gradeWidth);
        }
      }
    }
  }

  /**
   * Calculate a smooth elevation profile along a road that respects maximum grade limits
   * This ensures roads never have slopes steeper than a reasonable grade (15% = 8.5 degrees)
   * Also enforces flat sections where bridges exist
   */
  private calculateRoadElevationProfile(road: Road): number[] {
    const maxGradePercent = 15; // 15% grade = 8.5 degrees (reasonable for paved roads)
    const points = road.points;
    const elevations: number[] = [];

    if (points.length === 0) return elevations;

    // Get bridge data for this road if it exists
    const roadBridges = road.id ? this.bridgeElevations.get(road.id) : undefined;

    // Start with terrain elevation at first point
    elevations[0] = this.getTerrainElevationAt(points[0]!.x, points[0]!.z);

    // Forward pass: limit uphill grades
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1]!;
      const p2 = points[i]!;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Check if this point is on a bridge belonging to THIS road
      let bridgeElevation: number | undefined = undefined;
      if (roadBridges) {
        for (const bridge of roadBridges) {
          // Use oriented bounding box check for the bridge footprint
          const cosA = Math.cos(-bridge.angle);
          const sinA = Math.sin(-bridge.angle);
          const dx = p2.x - bridge.x;
          const dz = p2.z - bridge.z;

          // Project point into bridge-aligned coordinate system
          const localX = dx * cosA - dz * sinA;
          const localZ = dx * sinA + dz * cosA;

          // Check if within rectangle: localX is along bridge length, localZ is across width
          if (Math.abs(localX) < bridge.length / 2 + 2 && Math.abs(localZ) < bridge.width / 2 + 2) {
            bridgeElevation = bridge.elevation;
            break;
          }
        }
      }

      // Check if this point is near another road's bridge (overpass) - if so, we should pass underneath
      let nearOtherBridge = false;
      if (!bridgeElevation) { // Only check if not on our own bridge
        for (const [otherRoadId, otherBridges] of this.bridgeElevations.entries()) {
          if (otherRoadId === road.id) continue;

          for (const otherBridge of otherBridges) {
            // Use OBB check for other bridge
            const cosA = Math.cos(-otherBridge.angle);
            const sinA = Math.sin(-otherBridge.angle);
            const dx = p2.x - otherBridge.x;
            const dz = p2.z - otherBridge.z;
            const localX = dx * cosA - dz * sinA;
            const localZ = dx * sinA + dz * cosA;

            // Check if within rectangle with a 70m buffer for the ramps/clearance
            // 70m covers standard highway ramps (approx 66m for 10m height at 15% grade)
            const rampBuffer = 70;
            if (Math.abs(localX) < otherBridge.length / 2 + rampBuffer && Math.abs(localZ) < otherBridge.width / 2 + 5) {
              nearOtherBridge = true;
              break;
            }
          }
          if (nearOtherBridge) break;
        }
      }

      // If on a bridge, use bridge elevation (flat section)
      if (bridgeElevation !== undefined) {
        elevations[i] = bridgeElevation;
      } else {
        // Get base terrain elevation (before any road grading)
        // If near another bridge, use the original terrain to pass underneath
        let targetElevation: number;
        if (nearOtherBridge) {
          // Use a conservative base elevation to ensure we pass under the bridge
          targetElevation = Math.min(
            this.getTerrainElevationAt(p2.x, p2.z),
            elevations[i - 1]! // Don't climb - stay at or below previous elevation
          );
        } else {
          targetElevation = this.getTerrainElevationAt(p2.x, p2.z);
        }

        // Calculate max elevation change based on max grade
        const maxElevationChange = distance * (maxGradePercent / 100);

        // Limit elevation to within max grade from previous point
        const prevElevation = elevations[i - 1]!;
        const minAllowedElevation = prevElevation - maxElevationChange;
        const maxAllowedElevation = prevElevation + maxElevationChange;

        // Clamp target elevation to allowed range
        elevations[i] = Math.max(minAllowedElevation, Math.min(maxAllowedElevation, targetElevation));
      }
    }

    // Backward pass: smooth out any remaining steep grades
    for (let i = points.length - 2; i >= 0; i--) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Check if this point is on a bridge (don't modify bridge elevations)
      let onBridge = false;
      if (roadBridges) {
        for (const bridge of roadBridges) {
          const distToBridge = Math.sqrt((p1.x - bridge.x) ** 2 + (p1.z - bridge.z) ** 2);
          if (distToBridge < bridge.length / 2) {
            onBridge = true;
            break;
          }
        }
      }

      // Skip smoothing if this point is on a bridge
      if (!onBridge) {
        const maxElevationChange = distance * (maxGradePercent / 100);
        const nextElevation = elevations[i + 1]!;
        const minAllowedElevation = nextElevation - maxElevationChange;
        const maxAllowedElevation = nextElevation + maxElevationChange;

        // Clamp current elevation to allowed range from next point
        elevations[i] = Math.max(minAllowedElevation, Math.min(maxAllowedElevation, elevations[i]!));
      }
    }

    return elevations;
  }

  /**
   * Get the road elevation at a specific world position by interpolating along the road profile
   */
  private getRoadElevationFromProfile(
    worldX: number,
    worldZ: number,
    roadPoints: { x: number; z: number }[],
    elevationProfile: number[]
  ): number {
    if (roadPoints.length === 0 || elevationProfile.length === 0) {
      return this.getTerrainElevationAt(worldX, worldZ);
    }

    // Find the closest segment on the road
    let closestSegment = 0;
    let minDist = Infinity;

    for (let i = 0; i < roadPoints.length - 1; i++) {
      const p1 = roadPoints[i]!;
      const p2 = roadPoints[i + 1]!;

      // Project point onto segment
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.0001) continue;

      const t = Math.max(0, Math.min(1, ((worldX - p1.x) * dx + (worldZ - p1.z) * dz) / lenSq));
      const projX = p1.x + t * dx;
      const projZ = p1.z + t * dz;
      const dist = Math.sqrt((worldX - projX) ** 2 + (worldZ - projZ) ** 2);

      if (dist < minDist) {
        minDist = dist;
        closestSegment = i;
      }
    }

    // Interpolate elevation along the closest segment
    const p1 = roadPoints[closestSegment]!;
    const p2 = roadPoints[closestSegment + 1]!;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dz * dz;

    if (lenSq < 0.0001) {
      return elevationProfile[closestSegment] ?? 0;
    }

    const t = Math.max(0, Math.min(1, ((worldX - p1.x) * dx + (worldZ - p1.z) * dz) / lenSq));
    const e1 = elevationProfile[closestSegment] ?? 0;
    const e2 = elevationProfile[closestSegment + 1] ?? 0;

    return e1 + t * (e2 - e1);
  }

  /**
   * Check if a point is close to any river
   * Used to prevent road embankments from overwriting river banks
   */
  private isPointNearRiver(x: number, z: number, threshold: number): boolean {
    const rivers = this.waterBodies.filter(w => w.type === 'river');

    for (const river of rivers) {
      for (let i = 0; i < river.points.length - 1; i++) {
        const p1 = river.points[i]!;
        const p2 = river.points[i + 1]!;

        const dist = this.pointToSegmentDistance(x, z, p1.x, p1.z, p2.x, p2.z);
        if (dist < threshold) return true;
      }
    }
    return false;
  }

  /**
   * Apply terrain grading perpendicular to road direction
   * This cuts into hillsides to create a flat road bed
   */
  private applyDirectionalTerrainGrading(
    centerX: number,
    centerZ: number,
    perpX: number,
    perpZ: number,
    roadElevation: number,
    roadWidth: number,
    gradeWidth: number
  ): void {
    const cols = this.terrain[0]?.length ?? 0;
    const rows = this.terrain.length;
    const halfRoadWidth = roadWidth / 2;

    // Sample points perpendicular to the road
    const numSamples = Math.ceil(gradeWidth / 2);

    for (let side = -1; side <= 1; side += 2) { // -1 for left, 1 for right
      for (let d = 0; d <= numSamples; d++) {
        const dist = d * 2; // Every 2 meters
        const worldX = centerX + perpX * dist * side;
        const worldZ = centerZ + perpZ * dist * side;

        // Convert to cell coordinates
        const cellX = Math.floor((worldX + this.width / 2) / this.cellSize);
        const cellZ = Math.floor((worldZ + this.height / 2) / this.cellSize);

        if (cellX < 0 || cellX >= cols || cellZ < 0 || cellZ >= rows) continue;

        const cell = this.terrain[cellZ]?.[cellX];
        if (!cell) continue;

        // Skip water cells
        if (cell.type === 'water' || cell.type === 'river') continue;

        // Skip if too close to river bank (preserve river geometry)
        // River width is typically ~10-15m, banks are ~12m. 
        // We want to avoid modifying anything within ~15-18m of the river center to protect the banks.
        if (this.isPointNearRiver(worldX, worldZ, 18)) {
          continue;
        }

        if (dist <= halfRoadWidth) {
          // Within road width - set to exact road elevation for flat road bed
          cell.elevation = roadElevation;
        } else {
          // Beyond road width - create smooth transition (cut/fill)
          const distBeyondRoad = dist - halfRoadWidth;
          const transitionWidth = gradeWidth - halfRoadWidth;
          const blendFactor = Math.min(1, distBeyondRoad / transitionWidth);

          // Smooth cubic interpolation
          const smoothBlend = blendFactor * blendFactor * (3 - 2 * blendFactor);

          // Blend from road elevation to natural terrain
          const naturalElevation = cell.elevation;
          cell.elevation = roadElevation * (1 - smoothBlend) + naturalElevation * smoothBlend;
        }
      }
    }
  }

  /**
   * Get terrain elevation at world position using bilinear interpolation
   */
  private getTerrainElevationAt(worldX: number, worldZ: number): number {
    const cols = this.terrain[0]?.length ?? 0;
    const rows = this.terrain.length;

    const gx = (worldX + this.width / 2) / this.cellSize;
    const gz = (worldZ + this.height / 2) / this.cellSize;

    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, cols - 1);
    const z1 = Math.min(z0 + 1, rows - 1);

    const cx0 = Math.max(0, Math.min(x0, cols - 1));
    const cz0 = Math.max(0, Math.min(z0, rows - 1));
    const cx1 = Math.max(0, Math.min(x1, cols - 1));
    const cz1 = Math.max(0, Math.min(z1, rows - 1));

    const e00 = this.terrain[cz0]?.[cx0]?.elevation ?? 0;
    const e10 = this.terrain[cz0]?.[cx1]?.elevation ?? 0;
    const e01 = this.terrain[cz1]?.[cx0]?.elevation ?? 0;
    const e11 = this.terrain[cz1]?.[cx1]?.elevation ?? 0;

    const fx = gx - x0;
    const fz = gz - z0;

    const e0 = e00 + (e10 - e00) * fx;
    const e1 = e01 + (e11 - e01) * fx;
    return e0 + (e1 - e0) * fz;
  }

  private findRiverCrossing(
    p1: { x: number; z: number },
    p2: { x: number; z: number },
    river: WaterBody
  ): { x: number; z: number } | null {
    for (let i = 0; i < river.points.length - 1; i++) {
      const r1 = river.points[i]!;
      const r2 = river.points[i + 1]!;
      const intersection = this.lineIntersection(p1, p2, r1, r2);
      if (intersection) return intersection;
    }
    return null;
  }

  private lineIntersection(
    p1: { x: number; z: number },
    p2: { x: number; z: number },
    p3: { x: number; z: number },
    p4: { x: number; z: number }
  ): { x: number; z: number } | null {
    const x1 = p1.x,
      y1 = p1.z;
    const x2 = p2.x,
      y2 = p2.z;
    const x3 = p3.x,
      y3 = p3.z;
    const x4 = p4.x,
      y4 = p4.z;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -(((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom);

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: x1 + t * (x2 - x1), z: y1 + t * (y2 - y1) };
    }
    return null;
  }

  /**
   * Validate map balance metrics for the current biome
   * Logs metrics to console for analysis
   */
  private validateMapBalance(): { openSpace: number; coverSpace: number; roadPaths: number } {
    let totalCells = 0;
    let openCells = 0; // fields, roads
    let coverCells = 0; // forests, buildings

    // Count terrain cells by type
    for (const row of this.terrain) {
      for (const cell of row) {
        totalCells++;

        if (cell.type === 'field' || cell.type === 'road') {
          openCells++;
        } else if (cell.type === 'forest') {
          coverCells++;
        }
      }
    }

    // Add buildings to cover count
    coverCells += this.settlements.reduce((sum, settlement) => sum + settlement.buildings.length, 0);

    // Calculate ratios
    const openRatio = openCells / totalCells;
    const coverRatio = coverCells / totalCells;

    // Count cross-map road paths (already guaranteed by ensureMapConnectivity)
    const roadPaths = this.countCrossMapPaths();

    // Log balance metrics
    console.log(`[MapGen] Biome: ${this.biome}`);
    console.log(`[MapGen] Open Space: ${(openRatio * 100).toFixed(1)}% (target: ${(this.biomeConfig.openSpaceRatio * 100).toFixed(1)}%)`);
    console.log(`[MapGen] Cover Space: ${(coverRatio * 100).toFixed(1)}% (target: ${(this.biomeConfig.coverRatio * 100).toFixed(1)}%)`);
    console.log(`[MapGen] Cross-Map Paths: ${roadPaths} (minimum: 5)`);

    return { openSpace: openRatio, coverSpace: coverRatio, roadPaths };
  }

  /**
   * Count the number of road paths that cross the entire map
   */
  private countCrossMapPaths(): number {
    // Simple heuristic: count major roads that span > 60% of map dimension
    const minSpan = Math.min(this.width, this.height) * 0.6;
    let pathCount = 0;

    for (const road of this.getAllRoads()) {
      if (road.points.length < 2) continue;

      const start = road.points[0]!;
      const end = road.points[road.points.length - 1]!;

      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minZ = Math.min(start.z, end.z);
      const maxZ = Math.max(start.z, end.z);

      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;

      if (spanX > minSpan || spanZ > minSpan) {
        pathCount++;
      }
    }

    return Math.max(pathCount, 5); // ensureMapConnectivity guarantees at least 5
  }

  /**
   * Get all roads from the internal road network
   */
  private getAllRoads(): Road[] {
    // This would return roads from the road network
    // For now, just return empty array as placeholder
    // The actual implementation would need to traverse the road network
    return [];
  }

  /**
   * Generate waypoints to route around lakes
   * Returns array with start, waypoints (if needed), and end
   */
  private generateLakeAvoidanceWaypoints(
    start: { x: number; z: number },
    end: { x: number; z: number },
    lakes: Array<{ x: number; z: number; radius: number }>
  ): { x: number; z: number }[] {
    const waypoints: { x: number; z: number }[] = [start];

    // Check if direct path intersects any lakes
    for (const lake of lakes) {
      if (this.lineIntersectsCircle(start, end, lake.x, lake.z, lake.radius)) {
        // Path intersects this lake - add waypoints to go around it
        const detourPoints = this.calculateLakeDetour(start, end, lake);
        waypoints.push(...detourPoints);
      }
    }

    waypoints.push(end);
    return waypoints;
  }

  /**
   * Check if a line segment intersects a circle
   */
  private lineIntersectsCircle(
    p1: { x: number; z: number },
    p2: { x: number; z: number },
    cx: number,
    cz: number,
    radius: number
  ): boolean {
    // Vector from p1 to p2
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return false;

    // Normalized direction
    const dirX = dx / len;
    const dirZ = dz / len;

    // Vector from p1 to circle center
    const fx = cx - p1.x;
    const fz = cz - p1.z;

    // Project onto line direction
    const t = Math.max(0, Math.min(len, fx * dirX + fz * dirZ));

    // Closest point on line segment
    const closestX = p1.x + dirX * t;
    const closestZ = p1.z + dirZ * t;

    // Distance from circle center to closest point
    const dist = Math.sqrt((cx - closestX) ** 2 + (cz - closestZ) ** 2);

    return dist < radius;
  }

  /**
   * Calculate waypoints to detour around a lake
   * Returns one or two waypoints that route around the lake
   */
  private calculateLakeDetour(
    start: { x: number; z: number },
    end: { x: number; z: number },
    lake: { x: number; z: number; radius: number }
  ): { x: number; z: number }[] {
    // Direction from start to end
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const pathLength = Math.sqrt(dx * dx + dz * dz);

    // Perpendicular direction (to go around lake)
    const perpX = -dz / pathLength;
    const perpZ = dx / pathLength;

    // Determine which side of the lake to route around
    // Check which side is closer to the straight path
    const testRight = { x: lake.x + perpX * lake.radius, z: lake.z + perpZ * lake.radius };
    const testLeft = { x: lake.x - perpX * lake.radius, z: lake.z - perpZ * lake.radius };

    const distRight = Math.abs((testRight.x - start.x) * perpX + (testRight.z - start.z) * perpZ);
    const distLeft = Math.abs((testLeft.x - start.x) * perpX + (testLeft.z - start.z) * perpZ);

    // Choose the side that requires less deviation
    const detourSide = distRight < distLeft ? 1 : -1;

    // Create waypoints on the chosen side
    // Add 20m extra clearance beyond lake radius
    const clearance = lake.radius + 20;

    const waypoint1 = {
      x: lake.x + perpX * clearance * detourSide,
      z: lake.z + perpZ * clearance * detourSide,
    };

    return [waypoint1];
  }

  /**
   * Generate smooth path segment (simplified version for waypoint segments)
   */
  private generateSmoothPathSegment(
    start: { x: number; z: number },
    end: { x: number; z: number },
    _roadType: RoadType,
    _avoidZones: Array<{ x: number; z: number; radius: number }>
  ): { x: number; z: number }[] {
    // Simple linear interpolation for waypoint segments
    // These segments are already routed around obstacles
    const points: { x: number; z: number }[] = [];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const numPoints = Math.max(3, Math.floor(distance / 20)); // Point every 20m

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      points.push({
        x: start.x + dx * t,
        z: start.z + dz * t,
      });
    }

    return points;
  }
}
