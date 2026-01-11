/**
 * Settlement Generator - Creates varied settlements with different layouts
 * Supports organic (European), grid (American), and mixed layouts
 */

import {
  Settlement,
  SettlementSize,
  LayoutType,
  Building,
  BuildingCategory,
  BuildingSubtype,
  Road,
  RoadType,
  SETTLEMENT_PARAMS,
  SETTLEMENT_COMPOSITION,
  BUILDING_SPECS,
  BuildingSpec,
  LegacyBuildingType,
  ROAD_WIDTHS,
} from '../../data/types';

// Seeded random number generator type
type SeededRandom = () => number;

// Helper to create seeded random
function createSeededRandom(seed: number): SeededRandom {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Settlement name prefixes and suffixes for procedural naming
const NAME_PREFIXES = [
  'Oak', 'Maple', 'Pine', 'River', 'Hill', 'Stone', 'Green', 'White', 'Black', 'Red',
  'North', 'South', 'East', 'West', 'Old', 'New', 'High', 'Low', 'Fair', 'Bright',
  'Clear', 'Dark', 'Silver', 'Golden', 'Iron', 'Copper', 'Mill', 'Bridge', 'Cross', 'Spring'
];

const NAME_SUFFIXES: Record<SettlementSize, string[]> = {
  hamlet: ['stead', 'farm', 'hollow', 'grove', 'creek'],
  village: ['ville', 'ton', 'bury', 'ford', 'dale', 'field', 'wood'],
  town: ['town', 'wich', 'ham', 'port', 'borough', 'bridge'],
  city: ['city', 'polis', 'burg', 'haven', 'gate', 'worth'],
};

export class SettlementGenerator {
  private random: SeededRandom;
  private settlementCounter: number = 0;

  constructor(seed: number) {
    this.random = createSeededRandom(seed);
  }

  /**
   * Reset the random generator with a new seed
   */
  reseed(seed: number): void {
    this.random = createSeededRandom(seed);
    this.settlementCounter = 0;
  }

  /**
   * Generate a random settlement name
   */
  private generateName(size: SettlementSize): string {
    const prefix = NAME_PREFIXES[Math.floor(this.random() * NAME_PREFIXES.length)] ?? 'Oak';
    const suffixes = NAME_SUFFIXES[size];
    const suffix = suffixes[Math.floor(this.random() * suffixes.length)] ?? 'town';
    return prefix + suffix;
  }

  /**
   * Pick a layout type based on settlement size weights
   */
  private pickLayoutType(size: SettlementSize): LayoutType {
    const weights = SETTLEMENT_PARAMS[size].layoutWeights;
    const total = weights.organic + weights.grid + weights.mixed;
    const roll = this.random() * total;

    if (roll < weights.organic) return 'organic';
    if (roll < weights.organic + weights.grid) return 'grid';
    return 'mixed';
  }

  /**
   * Generate a complete settlement
   */
  generate(
    position: { x: number; z: number },
    size: SettlementSize,
    layoutType?: LayoutType,
    mainRoadAngle?: number,
    densityMultiplier: number = 1.0,
    mapBounds?: { minX: number; minZ: number; maxX: number; maxZ: number },
    terrain?: TerrainCell[][],
    waterBodies?: WaterBody[]
  ): Settlement {
    const params = SETTLEMENT_PARAMS[size];
    const layout = layoutType ?? this.pickLayoutType(size);

    // Calculate radius - keep mostly constant to actually increase density
    // Only slightly increase radius for very high multipliers to prevent total overcrowding
    const radiusMultiplier = Math.pow(densityMultiplier, 0.2);
    const radius = (params.radius.min + this.random() * (params.radius.max - params.radius.min)) * radiusMultiplier;

    // Calculate building count - scale directly by multiplier
    const buildingCount = Math.floor(
      (params.buildingCount.min + this.random() * (params.buildingCount.max - params.buildingCount.min)) * densityMultiplier
    );

    // Determine main axis (for grid alignment)
    const mainAxis = mainRoadAngle ?? this.random() * Math.PI;

    // Create settlement shell
    const settlement: Settlement = {
      id: `settlement_${this.settlementCounter++}`,
      name: this.generateName(size),
      position,
      size,
      layoutType: layout,
      bounds: {
        minX: position.x - radius,
        maxX: position.x + radius,
        minZ: position.z - radius,
        maxZ: position.z + radius,
      },
      radius,
      focalPoint: { ...position }, // Will be adjusted for mixed layouts
      mainAxis,
      entryPoints: [],
      buildings: [],
      streets: [],
    };

    // Generate streets based on layout type
    // Hamlets don't have internal streets - just a dirt road to the main road network
    if (size !== 'hamlet') {
      switch (layout) {
        case 'organic':
          this.generateOrganicStreets(settlement, terrain);
          break;
        case 'grid':
          this.generateGridStreets(settlement, terrain);
          break;
        case 'mixed':
          this.generateMixedStreets(settlement);
          break;
      }
    }

    // Generate entry points for external road connections
    this.generateEntryPoints(settlement);

    // Generate buildings
    this.generateBuildings(settlement, buildingCount, densityMultiplier, mapBounds);

    return settlement;
  }

  /**
   * Generate organic (European-style) street layout
   * Streets radiate from a central focal point with irregular cross-connections (web style)
   */
  /**
   * Generate organic (European-style) street layout
   * Streets radiate from a central focal point with irregular cross-connections (web style)
   * Adapts to geography (water, steep terrain)
   */
  private generateOrganicStreets(settlement: Settlement, terrain?: TerrainCell[][]): void {
    const { position, radius } = settlement;
    const streetWidth = ROAD_WIDTHS.town;

    // Number of radial streets (5-8 for cities/large towns)
    const numRadials = 5 + Math.floor(this.random() * 4);
    const radials: { x: number, z: number }[][] = [];

    // 1. Generate Radial Streets (Spokes)
    for (let i = 0; i < numRadials; i++) {
      // Irregular angles: distributes roughly evenly but with noise
      const baseAngle = (i / numRadials) * Math.PI * 2;
      const angle = baseAngle + (this.random() - 0.5) * 0.5; // +/- ~15 degrees variation

      const points: { x: number; z: number }[] = [];
      const numPoints = 8; // More segments for smoother curving

      // Start from center (or near it)
      points.push({ x: position.x, z: position.z });

      let currentX = position.x;
      let currentZ = position.z;
      let currentAngle = angle;

      // Walk outwards
      for (let j = 1; j <= numPoints; j++) {
        const t = j / numPoints;
        const distStep = (radius / numPoints);

        // Add meander/wobble to the angle
        const wobble = (this.random() - 0.5) * 0.4; // Wobble angle
        currentAngle += wobble;

        const nextX = currentX + Math.cos(currentAngle) * distStep;
        const nextZ = currentZ + Math.sin(currentAngle) * distStep;

        // GEOGRAPHY CHECK: Stop if water or steep slope
        if (terrain) {
          const gridX = Math.floor((nextX + (terrain[0]!.length * 10) / 2) / 10);
          const gridZ = Math.floor((nextZ + (terrain.length * 10) / 2) / 10);

          if (gridZ >= 0 && gridZ < terrain.length && gridX >= 0 && gridX < terrain[0]!.length) {
            const cell = terrain[gridZ]![gridX]!;
            if (cell.type === 'water' || cell.type === 'river' || (cell.type === 'mountain' && cell.elevation > 50)) {
              // Hit geography barrier - stop this road early
              break;
            }
          }
        }

        currentX = nextX;
        currentZ = nextZ;

        points.push({ x: currentX, z: currentZ });
      }

      // Store for cross-connecting
      radials.push(points);

      settlement.streets.push({
        id: `${settlement.id}_radial_${i}`,
        points,
        width: streetWidth,
        type: 'town',
      });
    }

    // 2. Generate Cross Streets (The Web)
    // Instead of continuous rings, we connect adjacent radials at random intervals
    const numLayers = Math.floor(radius / 50); // One layer every ~50m

    for (let layer = 1; layer < numLayers; layer++) {
      // For each sector between radials
      for (let i = 0; i < numRadials; i++) {
        const nextI = (i + 1) % numRadials;
        const radialA = radials[i]!;
        const radialB = radials[nextI]!;

        // Pick a point roughly at this layer's distance on both radials
        // Add randomness so it's not a perfect circle
        const indexA = Math.min(Math.floor((layer / numLayers) * radialA.length) + Math.floor((this.random() - 0.5) * 2), radialA.length - 1);
        const indexB = Math.min(Math.floor((layer / numLayers) * radialB.length) + Math.floor((this.random() - 0.5) * 2), radialB.length - 1);

        const safeIndexA = Math.max(1, indexA); // Don't connect at absolute center
        const safeIndexB = Math.max(1, indexB);

        const pA = radialA[safeIndexA]!;
        const pB = radialB[safeIndexB]!;

        // Chance to skip connection (makes it less uniform)
        if (this.random() > 0.85) continue;

        // Create connection
        // Add a midpoint for a slight curve
        const midX = (pA.x + pB.x) / 2;
        const midZ = (pA.z + pB.z) / 2;
        // Push midpoint slightly outward or inward
        const distToCenter = Math.sqrt((midX - position.x) ** 2 + (midZ - position.z) ** 2);
        const slightOffset = (this.random() - 0.5) * 15;
        const factor = 1 + slightOffset / distToCenter;

        const curvePoint = {
          x: position.x + (midX - position.x) * factor,
          z: position.z + (midZ - position.z) * factor
        };

        settlement.streets.push({
          id: `${settlement.id}_web_${layer}_${i}`,
          points: [pA, curvePoint, pB],
          width: streetWidth * 0.8, // Slightly narrower side streets
          type: 'town',
        });
      }
    }
  }

  /**
   * Generate grid (American-style) street layout
   * Rectangular blocks with consistent spacing
   */
  private generateGridStreets(settlement: Settlement, terrain?: TerrainCell[][]): void {
    const { position, radius, mainAxis } = settlement;
    const blockSize = 120 + this.random() * 60; // Larger blocks: 120-180m (was 80-120)
    const streetWidth = ROAD_WIDTHS.town;

    // Calculate grid dimensions
    const gridExtent = radius * 0.85;
    const numBlocks = Math.floor(gridExtent * 2 / blockSize);

    // Generate streets parallel to main axis
    for (let i = -numBlocks / 2; i <= numBlocks / 2; i++) {
      const offset = i * blockSize;
      const perpAngle = mainAxis + Math.PI / 2;

      // Create street perpendicular to main axis
      const startX = position.x + Math.cos(perpAngle) * offset - Math.cos(mainAxis) * gridExtent;
      const startZ = position.z + Math.sin(perpAngle) * offset - Math.sin(mainAxis) * gridExtent;
      const endX = position.x + Math.cos(perpAngle) * offset + Math.cos(mainAxis) * gridExtent;
      const endZ = position.z + Math.sin(perpAngle) * offset + Math.sin(mainAxis) * gridExtent;

      settlement.streets.push({
        id: `${settlement.id}_ns_${i}`,
        points: [
          { x: startX, z: startZ },
          { x: endX, z: endZ },
        ],
        width: i === 0 ? streetWidth * 1.3 : streetWidth, // Main street wider
        type: i === 0 ? 'highway' : 'town',
      });

      // GEOGRAPHY CLIP FOR GRID (Simple endpoint check for now, can be improved)
      if (terrain && settlement.streets.length > 0) {
        const lastStreet = settlement.streets[settlement.streets.length - 1]!;
        const p1 = lastStreet.points[0]!;
        const p2 = lastStreet.points[1]!;

        // Check midpoint
        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.z + p2.z) / 2;

        const gridX = Math.floor((midX + (terrain[0]!.length * 10) / 2) / 10);
        const gridZ = Math.floor((midZ + (terrain.length * 10) / 2) / 10);

        if (gridZ >= 0 && gridZ < terrain.length && gridX >= 0 && gridX < terrain[0]!.length) {
          const cell = terrain[gridZ]![gridX]!;
          if (cell.type === 'water' || cell.type === 'river' || (cell.type === 'mountain' && cell.elevation > 50)) {
            // Remove this street entirely if its center is invalid
            settlement.streets.pop();
          }
        }
      }

      // For the main street (index 0), extend to the edge to meet entry points
      if (i === 0) {
        // North extension
        settlement.streets.push({
          id: `${settlement.id}_ns_ext_N`,
          points: [
            { x: endX, z: endZ },
            {
              x: position.x + Math.cos(perpAngle) * offset + Math.cos(mainAxis) * radius,
              z: position.z + Math.sin(perpAngle) * offset + Math.sin(mainAxis) * radius
            }
          ],
          width: streetWidth * 1.3,
          type: 'highway'
        });

        // South extension
        settlement.streets.push({
          id: `${settlement.id}_ns_ext_S`,
          points: [
            { x: startX, z: startZ },
            {
              x: position.x + Math.cos(perpAngle) * offset - Math.cos(mainAxis) * radius,
              z: position.z + Math.sin(perpAngle) * offset - Math.sin(mainAxis) * radius
            }
          ],
          width: streetWidth * 1.3,
          type: 'highway'
        });
      }
    }

    // Generate streets perpendicular to main axis
    for (let i = -numBlocks / 2; i <= numBlocks / 2; i++) {
      const offset = i * blockSize;

      const startX = position.x + Math.cos(mainAxis) * offset - Math.cos(mainAxis + Math.PI / 2) * gridExtent;
      const startZ = position.z + Math.sin(mainAxis) * offset - Math.sin(mainAxis + Math.PI / 2) * gridExtent;
      const endX = position.x + Math.cos(mainAxis) * offset + Math.cos(mainAxis + Math.PI / 2) * gridExtent;
      const endZ = position.z + Math.sin(mainAxis) * offset + Math.sin(mainAxis + Math.PI / 2) * gridExtent;

      settlement.streets.push({
        id: `${settlement.id}_ew_${i}`,
        points: [
          { x: startX, z: startZ },
          { x: endX, z: endZ },
        ],
        width: streetWidth,
        type: 'town',
      });

      // GEOGRAPHY CLIP FOR GRID (EW)
      if (terrain && settlement.streets.length > 0) {
        const lastStreet = settlement.streets[settlement.streets.length - 1]!;
        const p1 = lastStreet.points[0]!;
        const p2 = lastStreet.points[1]!;

        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.z + p2.z) / 2;

        const gridX = Math.floor((midX + (terrain[0]!.length * 10) / 2) / 10);
        const gridZ = Math.floor((midZ + (terrain.length * 10) / 2) / 10);

        if (gridZ >= 0 && gridZ < terrain.length && gridX >= 0 && gridX < terrain[0]!.length) {
          const cell = terrain[gridZ]![gridX]!;
          if (cell.type === 'water' || cell.type === 'river' || (cell.type === 'mountain' && cell.elevation > 50)) {
            settlement.streets.pop();
          }
        }
      }

      // For the main cross street (index 0), extend to the edge
      if (i === 0) {
        // East extension
        settlement.streets.push({
          id: `${settlement.id}_ew_ext_E`,
          points: [
            { x: endX, z: endZ },
            {
              x: position.x + Math.cos(mainAxis) * offset + Math.cos(mainAxis + Math.PI / 2) * radius,
              z: position.z + Math.sin(mainAxis) * offset + Math.sin(mainAxis + Math.PI / 2) * radius
            }
          ],
          width: streetWidth * 1.1,
          type: 'town'
        });

        // West extension
        settlement.streets.push({
          id: `${settlement.id}_ew_ext_W`,
          points: [
            { x: startX, z: startZ },
            {
              x: position.x + Math.cos(mainAxis) * offset - Math.cos(mainAxis + Math.PI / 2) * radius,
              z: position.z + Math.sin(mainAxis) * offset - Math.sin(mainAxis + Math.PI / 2) * radius
            }
          ],
          width: streetWidth * 1.1,
          type: 'town'
        });
      }
    }
  }

  /**
   * Generate mixed layout - organic core with grid expansion
   */
  private generateMixedStreets(settlement: Settlement, terrain?: TerrainCell[][]): void {
    const { position, radius, mainAxis } = settlement;
    const streetWidth = ROAD_WIDTHS.town;

    // Organic core takes inner 35% of radius
    const coreRadius = radius * 0.35;
    const coreSettlement: Settlement = {
      ...settlement,
      radius: coreRadius,
      bounds: {
        minX: position.x - coreRadius,
        maxX: position.x + coreRadius,
        minZ: position.z - coreRadius,
        maxZ: position.z + coreRadius,
      },
    };

    // Generate organic core
    this.generateOrganicStreets(coreSettlement, terrain);
    settlement.streets.push(...coreSettlement.streets);

    // Add a clear Ring Road separating core from grid
    const ringPoints: { x: number; z: number }[] = [];
    const ringSegments = 24;
    for (let i = 0; i <= ringSegments; i++) {
      const theta = (i / ringSegments) * Math.PI * 2;
      ringPoints.push({
        x: position.x + Math.cos(theta) * coreRadius,
        z: position.z + Math.sin(theta) * coreRadius
      });
    }
    settlement.streets.push({
      id: `${settlement.id}_core_ring`,
      points: ringPoints,
      width: streetWidth * 1.2, // Slightly wider collector road
      type: 'town'
    });

    // Generate grid expansion in outer area
    const gridStreets: Road[] = [];
    const blockSize = 120 + this.random() * 60; // Larger blocks: 120-180m

    // Grid covers the rest of the radius
    const gridExtent = radius * 0.9;
    const numBlocks = Math.floor(gridExtent * 2 / blockSize);

    // Helper to check if a point is outside the core ring (with buffer)
    const isOutsideCore = (x: number, z: number) => {
      const dx = x - position.x;
      const dz = z - position.z;
      return (dx * dx + dz * dz) > (coreRadius * coreRadius) + 400; // coreRadius^2 + buffer
    };

    // Generate Grid Lines
    for (let i = -numBlocks / 2; i <= numBlocks / 2; i++) {
      const offset = i * blockSize;

      // NS Streets
      const perpAngle = mainAxis + Math.PI / 2;
      const startX = position.x + Math.cos(perpAngle) * offset - Math.cos(mainAxis) * gridExtent;
      const startZ = position.z + Math.sin(perpAngle) * offset - Math.sin(mainAxis) * gridExtent;
      const endX = position.x + Math.cos(perpAngle) * offset + Math.cos(mainAxis) * gridExtent;
      const endZ = position.z + Math.sin(perpAngle) * offset + Math.sin(mainAxis) * gridExtent;

      // Split segment if it crosses the core
      // For simplicity in this "mixed" mode, we'll just generate segments that are strictly outside

      const nsPoints: { x: number, z: number }[] = [];
      const steps = 20;
      let drawing = false;
      let currentSegment: { x: number, z: number }[] = [];

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = startX + (endX - startX) * t;
        const pz = startZ + (endZ - startZ) * t;

        // MAP BOUNDS CHECK
        if (settlement.bounds && (Math.abs(px) > 2000 || Math.abs(pz) > 2000)) continue;

        if (isOutsideCore(px, pz)) {
          currentSegment.push({ x: px, z: pz });
          drawing = true;
        } else {
          if (drawing && currentSegment.length > 1) {
            // Finish this segment
            settlement.streets.push({
              id: `${settlement.id}_grid_ns_${i}_${s}`,
              points: [...currentSegment],
              width: streetWidth,
              type: 'town'
            });
            currentSegment = [];
          }
          drawing = false;
        }
      }
      // Push last segment
      if (currentSegment.length > 1) {
        settlement.streets.push({
          id: `${settlement.id}_grid_ns_${i}_end`,
          points: currentSegment,
          width: streetWidth,
          type: 'town'
        });
      }

      // EW Streets (Logic repeated)
      const ewStartX = position.x + Math.cos(mainAxis) * offset - Math.cos(perpAngle) * gridExtent;
      const ewStartZ = position.z + Math.sin(mainAxis) * offset - Math.sin(perpAngle) * gridExtent;
      const ewEndX = position.x + Math.cos(mainAxis) * offset + Math.cos(perpAngle) * gridExtent;
      const ewEndZ = position.z + Math.sin(mainAxis) * offset + Math.sin(perpAngle) * gridExtent;

      currentSegment = [];
      drawing = false;

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = ewStartX + (ewEndX - ewStartX) * t;
        const pz = ewStartZ + (ewEndZ - ewStartZ) * t;

        // MAP BOUNDS CHECK
        if (settlement.bounds && (Math.abs(px) > 2000 || Math.abs(pz) > 2000)) continue;

        if (isOutsideCore(px, pz)) {
          currentSegment.push({ x: px, z: pz });
          drawing = true;
        } else {
          if (drawing && currentSegment.length > 1) {
            settlement.streets.push({
              id: `${settlement.id}_grid_ew_${i}_${s}`,
              points: [...currentSegment],
              width: streetWidth,
              type: 'town'
            });
            currentSegment = [];
          }
          drawing = false;
        }
      }
      if (currentSegment.length > 1) {
        settlement.streets.push({
          id: `${settlement.id}_grid_ew_${i}_end`,
          points: currentSegment,
          width: streetWidth,
          type: 'town'
        });
      }
    }
  }

  /**
   * Generate entry points where external roads should connect
   */
  private generateEntryPoints(settlement: Settlement): void {
    const { position, radius, layoutType, mainAxis, size } = settlement;
    const params = SETTLEMENT_PARAMS[size];
    const numConnections = Math.floor(
      params.roadConnections.min + this.random() * (params.roadConnections.max - params.roadConnections.min + 1)
    );

    // Determine road type based on settlement size
    const roadType: RoadType = size === 'city' ? 'highway' :
      size === 'town' ? 'highway' :
        size === 'village' ? 'town' : 'dirt';

    if (layoutType === 'grid') {
      // Grid settlements have entry points aligned with axes
      const directions = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
      for (let i = 0; i < Math.min(numConnections, 4); i++) {
        const angle = mainAxis + (directions[i] ?? 0);
        settlement.entryPoints.push({
          x: position.x + Math.cos(angle) * radius,
          z: position.z + Math.sin(angle) * radius,
          direction: angle,
          roadType,
        });
      }
    } else {
      // Organic/mixed settlements have more flexible entry points
      for (let i = 0; i < numConnections; i++) {
        const baseAngle = (i / numConnections) * Math.PI * 2;
        const angle = baseAngle + (this.random() - 0.5) * 0.5;
        settlement.entryPoints.push({
          x: position.x + Math.cos(angle) * radius,
          z: position.z + Math.sin(angle) * radius,
          direction: angle,
          roadType,
        });
      }
    }
  }

  /**
   * Generate buildings for the settlement
   */
  private generateBuildings(
    settlement: Settlement,
    targetCount: number,
    densityMultiplier: number = 1.0,
    mapBounds?: { minX: number; minZ: number; maxX: number; maxZ: number }
  ): void {
    const { size, layoutType } = settlement;
    const composition = SETTLEMENT_COMPOSITION[size];

    // Calculate target counts per category
    const categoryTargets: Record<BuildingCategory, number> = {
      residential: 0,
      commercial: 0,
      industrial: 0,
      civic: 0,
      agricultural: 0,
      infrastructure: 0,
    };

    // Calculate maximum buildings that fit in the map bounds if constrained
    // This prevents infinite loops if the settlement is clipped by map edge
    const maxRetries = mapBounds ? 100 : 50; // More retries if we are filtering by bounds, but stick to a limit

    let remaining = targetCount;
    for (const category of Object.keys(composition) as BuildingCategory[]) {
      const { min, max } = composition[category];
      const percentage = min + this.random() * (max - min);
      categoryTargets[category] = Math.floor(targetCount * percentage);
      remaining -= categoryTargets[category];
    }

    // Distribute remaining to residential
    categoryTargets.residential += remaining;

    // Place buildings by category
    const placedBuildings: Building[] = [];

    // Place focal building first (church/chapel for organic, town hall for grid cities)
    const focalBuilding = this.placeFocalBuilding(settlement);
    if (focalBuilding) {
      placedBuildings.push(focalBuilding);
      categoryTargets.civic = Math.max(0, categoryTargets.civic - 1);
    }

    // Generate placement queue
    const placementQueue: { spec: BuildingSpec; category: BuildingCategory }[] = [];

    for (const category of ['civic', 'commercial', 'residential', 'industrial', 'agricultural', 'infrastructure'] as BuildingCategory[]) {
      const count = categoryTargets[category];

      // Get available specs for this category
      const availableSpecs = BUILDING_SPECS.filter(
        s => s.category === category && s.allowedIn.includes(size)
      );

      if (availableSpecs.length > 0) {
        for (let i = 0; i < count; i++) {
          const spec = availableSpecs[Math.floor(this.random() * availableSpecs.length)];
          if (spec) {
            placementQueue.push({ spec, category });
          }
        }
      }
    }

    // Sort queue by priority then footprint size (descending) to place important/large buildings first
    placementQueue.sort((a, b) => {
      const priorityA = this.getBuildingPriority(a.spec);
      const priorityB = this.getBuildingPriority(b.spec);

      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      const areaA = a.spec.footprint.width * a.spec.footprint.depth;
      const areaB = b.spec.footprint.width * b.spec.footprint.depth;
      return areaB - areaA;
    });

    // Track total failures for summary
    let failureCount = 0;

    // Execute placement
    for (const item of placementQueue) {
      const building = this.placeBuilding(settlement, item.spec, item.category, placedBuildings, layoutType, densityMultiplier, mapBounds);
      if (building) {
        placedBuildings.push(building);
      } else {
        failureCount++;
      }
    }

    if (failureCount > 0) {
      console.warn(`[SettlementGenerator] Failed to place ${failureCount}/${placementQueue.length} buildings in settlement ${settlement.name} (${settlement.size})`);
    }

    settlement.buildings = placedBuildings;
  }

  /**
   * Place the focal building (church, town hall, etc.)
   */
  private placeFocalBuilding(settlement: Settlement): Building | null {
    const { size, position, layoutType } = settlement;

    // Determine focal building type
    let spec: BuildingSpec | undefined;
    if (size === 'city') {
      spec = BUILDING_SPECS.find(s => s.subtype === 'cathedral');
    } else if (size === 'town') {
      spec = layoutType === 'grid'
        ? BUILDING_SPECS.find(s => s.subtype === 'town_hall')
        : BUILDING_SPECS.find(s => s.subtype === 'church');
    } else if (size === 'village') {
      spec = BUILDING_SPECS.find(s => s.subtype === 'church');
    } else {
      spec = BUILDING_SPECS.find(s => s.subtype === 'chapel');
    }

    if (!spec) return null;

    return this.createBuilding(spec, position.x, position.z, settlement.id, 0);
  }

  /**
   * Place a building of a specific category
   */
  private placeBuilding(
    settlement: Settlement,
    spec: BuildingSpec,
    category: BuildingCategory,
    existingBuildings: Building[],
    layoutType: LayoutType,
    densityMultiplier: number = 1.0,
    mapBounds?: { minX: number; minZ: number; maxX: number; maxZ: number }
  ): Building | null {
    const { size, position, radius, mainAxis } = settlement;

    // Determine placement zone based on category
    const zoneMultiplier = this.getZoneMultiplier(category, size);

    // Try to place building
    // Reduce random attempts (down to 15), then fall back to street search
    // This provides organic scatter first, but guarantees placement if space exists
    const randomAttempts = 15;

    for (let attempt = 0; attempt < randomAttempts; attempt++) {
      let x: number, z: number, rotation: number;

      if (layoutType === 'grid') {
        // Grid layout: align buildings with grid
        // Pick a block (i, j) relative to center
        const blockSize = 90;
        const maxBlocks = Math.ceil(radius / blockSize);
        // Focus on inner blocks for density
        const range = maxBlocks * (densityMultiplier > 1.5 ? 0.8 : 1.0);
        const i = Math.floor((this.random() - 0.5) * 2 * range);
        const j = Math.floor((this.random() - 0.5) * 2 * range);

        // Local coordinates relative to settlement center, aligned with mainAxis
        // Center of the chosen block
        const blockCenterU = (i + 0.5) * blockSize;
        const blockCenterV = (j + 0.5) * blockSize;

        // Position within block (along the edges)
        const side = Math.floor(this.random() * 4); // 0=Top(+V), 1=Right(+U), 2=Bottom(-V), 3=Left(-U)
        const setback = 5 + this.random() * 3; // 5-8m setback to clear wide roads

        // Spread along the face, keeping away from corners (avoid intersections)
        const cornerBuffer = 15;
        const faceLength = blockSize - (cornerBuffer * 2);
        const offsetAlongFace = (this.random() - 0.5) * Math.max(1, faceLength - Math.max(spec.footprint.width, spec.footprint.depth));

        let u = blockCenterU;
        let v = blockCenterV;
        let rotOffset = 0;

        const halfBlock = blockSize / 2;
        // Assume streets are at i*blockSize (edges of block are +/- halfBlock from center)

        switch (side) {
          case 0: // Top edge (+V), facing +V (away from center) or -V (towards center)? 
            // Streets surround the block. Building should face the street.
            // If Top edge is near V = center + halfBlock.
            // Building fronts the street at +V.
            u += offsetAlongFace;
            v += halfBlock - setback - spec.footprint.depth / 2;
            rotOffset = 0; // Face 'Up' relative to grid (+V)
            break;
          case 1: // Right edge (+U)
            u += halfBlock - setback - spec.footprint.depth / 2;
            v += offsetAlongFace;
            rotOffset = -Math.PI / 2; // Face 'Right' (+U)
            break;
          case 2: // Bottom edge (-V)
            u += offsetAlongFace;
            v -= halfBlock - setback - spec.footprint.depth / 2;
            rotOffset = Math.PI; // Face 'Down' (-V)
            break;
          case 3: // Left edge (-U)
            u -= halfBlock - setback - spec.footprint.depth / 2;
            v += offsetAlongFace;
            rotOffset = Math.PI / 2; // Face 'Left' (-U)
            break;
        }

        // Transform to world coordinates
        // v corresponds to North (Z-) in standard math, but here we just need consistency with generateStreets
        // generateStreets uses: x + cos(perp)*offset
        // perp = mainAxis + PI/2.
        // So 'u' is along mainAxis (cos(axis)), 'v' is along perp (cos(axis+PI/2) = -sin(axis))
        // Wait, generateStreets: 
        // NS streets (perp to axis): x = pos.x + cos(perp)*offset... -> these are the V lines?
        // No, 'offset' in generateStreets iterates -numBlocks..numBlocks.

        // Let's stick to standard 2D rotation:
        // u = along mainAxis
        // v = perpendicular (mainAxis + 90 deg)
        const cos = Math.cos(mainAxis);
        const sin = Math.sin(mainAxis);

        x = position.x + (u * cos - v * sin);
        z = position.z + (u * sin + v * cos);
        rotation = mainAxis + rotOffset;
      } else {
        // Organic layout: place along streets or in zones
        const angle = this.random() * Math.PI * 2;
        const distance = radius * zoneMultiplier.min + this.random() * radius * (zoneMultiplier.max - zoneMultiplier.min);

        x = position.x + Math.cos(angle) * distance;
        z = position.z + Math.sin(angle) * distance;

        // Face toward center (with some variation)
        rotation = Math.atan2(position.z - z, position.x - x) + (this.random() - 0.5) * 0.3;
      }

      // Check map bounds
      if (mapBounds) {
        // Simple bounding box check for the building
        // A loose check is enough: checking center +/- max dim
        const maxDim = Math.max(spec.footprint.width, spec.footprint.depth) / 2;
        if (x - maxDim < mapBounds.minX || x + maxDim > mapBounds.maxX ||
          z - maxDim < mapBounds.minZ || z + maxDim > mapBounds.maxZ) {
          continue; // Out of bounds
        }
      }

      // Check for overlap
      if (!this.checkOverlap(x, z, spec.footprint.width, spec.footprint.depth, rotation, existingBuildings, settlement.streets, densityMultiplier)) {
        if (Math.random() < 0.05) console.log(`[SettlementGenerator] Placed ${category} building at ${x.toFixed(1)}, ${z.toFixed(1)} after ${attempt} attempts`);
        return this.createBuilding(spec, x, z, settlement.id, rotation);
      } else {
        if (Math.random() < 0.01) console.log(`[SettlementGenerator] Failed to place ${category} building at ${x.toFixed(1)}, ${z.toFixed(1)} due to overlap (attempt ${attempt})`);
      }
    }

    // Fallback: Smart street-walking search
    // If random placement failed, try to systematically find a spot along existing streets (Tier 1)
    let fallbackBuilding = this.findSpotAlongStreets(settlement, spec, existingBuildings, densityMultiplier, 1, mapBounds);

    // Tier 2: If Tier 1 failed and this is a small residential/commercial building, try placing it in the "back row"
    if (!fallbackBuilding && (spec.category === 'residential' || (spec.category === 'commercial' && spec.size === 'small'))) {
      fallbackBuilding = this.findSpotAlongStreets(settlement, spec, existingBuildings, densityMultiplier, 2, mapBounds);
    }

    if (fallbackBuilding) {
      // console.log(`[SettlementGenerator] Fallback placement success for ${category}`);
      return fallbackBuilding;
    }

    // "Desperation Phase": Infill Placement
    // If street search failed, try to find ANY valid open spot in the settlement
    // This fills the centers of large blocks
    if (spec.category === 'residential' || (spec.category === 'commercial' && spec.size === 'small')) {
      const desperationAttempts = 30;
      const { position, radius } = settlement;

      for (let i = 0; i < desperationAttempts; i++) {
        // Random spot within radius
        const r = Math.sqrt(this.random()) * radius * 0.9;
        const theta = this.random() * Math.PI * 2;
        const x = position.x + Math.cos(theta) * r;
        const z = position.z + Math.sin(theta) * r;

        // Bounds check
        if (mapBounds) {
          const maxDim = Math.max(spec.footprint.width, spec.footprint.depth) / 2;
          if (x - maxDim < mapBounds.minX || x + maxDim > mapBounds.maxX ||
            z - maxDim < mapBounds.minZ || z + maxDim > mapBounds.maxZ) {
            continue;
          }
        }

        // Align with nearest street
        let rotation = this.random() * Math.PI * 2;
        let minDescDistSq = Infinity;

        // Simple nearest searching
        for (const street of settlement.streets) {
          for (let j = 0; j < street.points.length - 1; j++) {
            const p1 = street.points[j]!;
            const p2 = street.points[j + 1]!;
            // Check distance to segment center for speed
            const mx = (p1.x + p2.x) / 2;
            const mz = (p1.z + p2.z) / 2;
            const dSq = (x - mx) ** 2 + (z - mz) ** 2;

            if (dSq < minDescDistSq) {
              minDescDistSq = dSq;
              // Align parallel to road
              rotation = Math.atan2(p2.z - p1.z, p2.x - p1.x);
            }
          }
        }

        // If really far from any road (>150m), revert to main axis or random
        if (minDescDistSq > 150 * 150) {
          rotation = this.random() * Math.PI * 2;
        }

        if (!this.checkOverlap(x, z, spec.footprint.width, spec.footprint.depth, rotation, existingBuildings, settlement.streets, densityMultiplier)) {
          return this.createBuilding(spec, x, z, settlement.id, rotation);
        }
      }
    }

    // console.warn(`[SettlementGenerator] Failed to place ${category} building after ${randomAttempts} attempts + fallback`);
    return null;
  }

  /**
   * Deterministic fallback: Walk along random streets and try to place buildings on empty lots
   */
  private findSpotAlongStreets(
    settlement: Settlement,
    spec: BuildingSpec,
    existingBuildings: Building[],
    densityMultiplier: number,
    tier: number = 1,
    mapBounds?: { minX: number; minZ: number; maxX: number; maxZ: number }
  ): Building | null {
    // Shuffle streets to avoid bias
    const streets = [...settlement.streets];
    // Fisher-Yates shuffle
    for (let i = streets.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [streets[i], streets[j]] = [streets[j]!, streets[i]!];
    }

    // Parameters for probing
    // Step size matching building width to avoid checking overlapping spots too much
    const stepSize = Math.max(10, spec.footprint.width);

    for (const street of streets) {
      // Calculate specific setback for this street and building
      // Distance from road center to building center
      // Road half-width + Building half-depth + small margin (2m)
      // Tier 2 adds an extra offset tightly behind the first row
      const tierOffset = (tier - 1) * (spec.footprint.depth + 2);
      const setback = (street.width / 2) + (spec.footprint.depth / 2) + 2 + tierOffset;

      // Iterate segments
      for (let i = 0; i < street.points.length - 1; i++) {
        const p1 = street.points[i]!;
        const p2 = street.points[i + 1]!;

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < stepSize) continue;

        const dirX = dx / len;
        const dirZ = dz / len;

        // Perpendicular normals (Left and Right)
        const normX = -dirZ;
        const normZ = dirX;

        // Walk along segment
        for (let d = stepSize / 2; d < len; d += stepSize) {
          // Try Left (-Normal) and Right (+Normal)
          // Randomize order for variety
          const sides = this.random() > 0.5 ? [1, -1] : [-1, 1];

          for (const side of sides) {
            const px = p1.x + dirX * d + normX * setback * side;
            const pz = p1.z + dirZ * d + normZ * setback * side;

            // Rotation: face the street
            const rotation = Math.atan2(-normZ * side, -normX * side);

            // Bounds check
            const maxDim = Math.max(spec.footprint.width, spec.footprint.depth) / 2;
            if (mapBounds) {
              if (px - maxDim < mapBounds.minX || px + maxDim > mapBounds.maxX ||
                pz - maxDim < mapBounds.minZ || pz + maxDim > mapBounds.maxZ) {
                continue;
              }
            }

            if (!this.checkOverlap(px, pz, spec.footprint.width, spec.footprint.depth, rotation, existingBuildings, settlement.streets, densityMultiplier)) {
              return this.createBuilding(spec, px, pz, settlement.id, rotation);
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Get placement priority for a building spec
   * Higher number = higher priority (placed earlier)
   */
  private getBuildingPriority(spec: BuildingSpec): number {
    // High priority: Vital civic, large factories, government
    if (['town_hall', 'cathedral', 'government_office', 'hospital', 'large_factory', 'power_plant'].includes(spec.subtype)) {
      return 3;
    }
    // Medium priority: Infrastructure, large commercial, special civic
    if (['train_station', 'department_store', 'skyscraper', 'school', 'library', 'police_station', 'fire_station', 'market_hall', 'warehouse_complex'].includes(spec.subtype)) {
      return 2;
    }
    // Low priority: Generic residential, small shops, etc.
    return 1;
  }

  /**
   * Get placement zone multipliers based on building category
   */
  private getZoneMultiplier(category: BuildingCategory, _size: SettlementSize): { min: number; max: number } {
    switch (category) {
      case 'civic':
        return { min: 0, max: 0.3 }; // Center
      case 'commercial':
        return { min: 0.1, max: 0.5 }; // Inner
      case 'residential':
        return { min: 0.2, max: 0.8 }; // Spread out
      case 'industrial':
        return { min: 0.5, max: 0.9 }; // Outer
      case 'agricultural':
        return { min: 0.7, max: 1.0 }; // Edge
      case 'infrastructure':
        return { min: 0.3, max: 0.7 }; // Spread
      default:
        return { min: 0.2, max: 0.8 };
    }
  }

  /**
   * Check if a building would overlap with existing buildings
   */
  private checkOverlap(
    x: number,
    z: number,
    width: number,
    depth: number,
    _rotation: number,
    existingBuildings: Building[],
    streets: Road[] | undefined,
    densityMultiplier: number = 1.0
  ): boolean {
    // Reduce padding for dense layouts
    // For extreme density, allow slight overlap (-0.5) to pack tight row houses
    // Modified to 0.5 to prevent z-fighting flicker
    const padding = densityMultiplier > 1.8 ? 0.5 : (densityMultiplier > 1.2 ? 1 : 3);

    for (const building of existingBuildings) {
      const dx = Math.abs(x - building.x);
      const dz = Math.abs(z - building.z);
      const minDx = (width + building.width) / 2 + padding;
      const minDz = (depth + building.depth) / 2 + padding;

      if (dx < minDx && dz < minDz) {
        return true;
      }
    }

    // Check overlap with streets
    if (streets) {
      // Use inner radius (min dimension) to allow buildings to sit closer to roads
      const buildingRadius = Math.min(width, depth) / 2;

      for (const street of streets) {
        // Simple check against street points
        for (let i = 0; i < street.points.length - 1; i++) {
          const p1 = street.points[i]!;
          const p2 = street.points[i + 1]!;

          // Distance from point to line segment
          const l2 = (p1.x - p2.x) ** 2 + (p1.z - p2.z) ** 2;
          if (l2 === 0) continue;

          let t = ((x - p1.x) * (p2.x - p1.x) + (z - p1.z) * (p2.z - p1.z)) / l2;
          t = Math.max(0, Math.min(1, t));

          const px = p1.x + t * (p2.x - p1.x);
          const pz = p1.z + t * (p2.z - p1.z);

          const distSq = (x - px) ** 2 + (z - pz) ** 2;
          // Very tight tolerance for high density cities
          const buffer = densityMultiplier > 1.5 ? 0.5 : 2;
          const minD = buildingRadius + (street.width / 2) + buffer;

          if (distSq < minD * minD) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Create a building from a spec
   */
  private createBuilding(
    spec: BuildingSpec,
    x: number,
    z: number,
    settlementId: string,
    rotation: number
  ): Building {
    const floors = typeof spec.floors === 'number' ? spec.floors : 1;
    const heightPerFloor = 3; // 3m per floor

    // Map subtype to legacy type for backwards compatibility
    const legacyType = this.mapToLegacyType(spec.category, spec.subtype);

    // Base height calculation: 3m per floor + special adjustments
    let baseHeight = floors * heightPerFloor;
    if (spec.subtype === 'clock_tower') baseHeight += 15; // Tall spire
    if (spec.subtype === 'church' || spec.subtype === 'cathedral') baseHeight += 10;
    if (spec.subtype === 'skyscraper') baseHeight += 5; // Penthouse/mechanical
    if (spec.subtype === 'silo_cluster') baseHeight = 15; // Fixed height for silos

    return {
      x,
      z,
      width: spec.footprint.width,
      depth: spec.footprint.depth,
      height: baseHeight,
      type: legacyType,
      category: spec.category,
      subtype: spec.subtype,
      floors,
      garrisonCapacity: Math.max(2, Math.min(5, Math.floor(Math.sqrt(spec.footprint.width * spec.footprint.depth) / 5))),
      defenseBonus: 0.5,
      stealthBonus: 0.5,
      settlementId,
      rotation,
    };
  }

  /**
   * Map building category/subtype to legacy type for backwards compatibility
   */
  private mapToLegacyType(category: BuildingCategory, subtype: BuildingSubtype): LegacyBuildingType {
    switch (category) {
      case 'residential':
      case 'agricultural':
        return 'house';
      case 'civic':
        if (subtype.includes('church') || subtype.includes('cathedral') || subtype.includes('chapel')) {
          return 'church';
        }
        return 'house';
      case 'industrial':
        return 'factory';
      case 'commercial':
      case 'infrastructure':
        if (subtype === 'skyscraper' || subtype === 'office_building') return 'factory'; // Tall buildings feel more like factory blocks
        return 'shop';
      default:
        return 'house';
    }
  }

  /**
   * Utility: Get all buildings from a settlement flattened for map building list
   */
  static flattenSettlementBuildings(settlements: Settlement[]): Building[] {
    return settlements.flatMap(s => s.buildings);
  }

  /**
   * Utility: Get all streets from settlements flattened for map road list
   */
  static flattenSettlementStreets(settlements: Settlement[]): Road[] {
    return settlements.flatMap(s => s.streets);
  }
}
