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
    densityMultiplier: number = 1.0
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
          this.generateOrganicStreets(settlement);
          break;
        case 'grid':
          this.generateGridStreets(settlement);
          break;
        case 'mixed':
          this.generateMixedStreets(settlement);
          break;
      }
    }

    // Generate entry points for external road connections
    this.generateEntryPoints(settlement);

    // Generate buildings
    this.generateBuildings(settlement, buildingCount, densityMultiplier);

    return settlement;
  }

  /**
   * Generate organic (European-style) street layout
   * Streets radiate from a central focal point with curved cross-streets
   */
  private generateOrganicStreets(settlement: Settlement): void {
    const { position, radius } = settlement;
    const streetWidth = ROAD_WIDTHS.town;

    // Number of radial streets (3-6 based on size)
    const numRadials = 3 + Math.floor(this.random() * 4);

    // Generate radial streets from center
    for (let i = 0; i < numRadials; i++) {
      // Irregular angles with some randomness
      const baseAngle = (i / numRadials) * Math.PI * 2;
      const angle = baseAngle + (this.random() - 0.5) * 0.4;

      const points: { x: number; z: number }[] = [];
      const numPoints = 5 + Math.floor(this.random() * 3);

      for (let j = 0; j < numPoints; j++) {
        const t = j / (numPoints - 1);
        const r = t * radius * 0.9;
        // Add some curve/wobble to the street
        const wobble = Math.sin(t * Math.PI * 2) * (this.random() - 0.5) * 20;
        const currentAngle = angle + wobble / (r + 10);

        points.push({
          x: position.x + Math.cos(currentAngle) * r,
          z: position.z + Math.sin(currentAngle) * r,
        });
      }

      settlement.streets.push({
        id: `${settlement.id}_radial_${i}`,
        points,
        width: streetWidth,
        type: 'town',
      });
    }

    // Generate curved cross-streets (rings)
    const numRings = Math.max(1, Math.floor(radius / 60));
    for (let ring = 0; ring < numRings; ring++) {
      const ringRadius = (ring + 1) * radius / (numRings + 1);
      const points: { x: number; z: number }[] = [];
      const segments = 12 + Math.floor(this.random() * 8);

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        // Add irregularity
        const rVariation = ringRadius * (1 + (this.random() - 0.5) * 0.2);
        points.push({
          x: position.x + Math.cos(angle) * rVariation,
          z: position.z + Math.sin(angle) * rVariation,
        });
      }

      settlement.streets.push({
        id: `${settlement.id}_ring_${ring}`,
        points,
        width: streetWidth * 0.8,
        type: 'town',
      });
    }
  }

  /**
   * Generate grid (American-style) street layout
   * Rectangular blocks with consistent spacing
   */
  private generateGridStreets(settlement: Settlement): void {
    const { position, radius, mainAxis } = settlement;
    const blockSize = 80 + this.random() * 40; // 80-120m blocks
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
    }
  }

  /**
   * Generate mixed layout - organic core with grid expansion
   */
  private generateMixedStreets(settlement: Settlement): void {
    const { position, radius } = settlement;

    // Organic core takes inner 40% of radius
    const coreRadius = radius * 0.4;
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
    this.generateOrganicStreets(coreSettlement);
    settlement.streets.push(...coreSettlement.streets);

    // Generate grid expansion in outer area
    const gridStreets: Road[] = [];
    const blockSize = 80 + this.random() * 40;
    const streetWidth = ROAD_WIDTHS.town;
    const { mainAxis } = settlement;

    // Only generate grid outside the core
    const gridExtent = radius * 0.85;
    const numBlocks = Math.floor(gridExtent * 2 / blockSize);

    for (let i = -numBlocks / 2; i <= numBlocks / 2; i++) {
      const offset = i * blockSize;
      const perpAngle = mainAxis + Math.PI / 2;

      // Calculate street endpoints
      const startOffset = -gridExtent;
      const endOffset = gridExtent;

      // Create points, skipping the core area
      const points: { x: number; z: number }[] = [];

      for (let t = 0; t <= 1; t += 0.1) {
        const dist = startOffset + t * (endOffset - startOffset);
        const x = position.x + Math.cos(perpAngle) * offset + Math.cos(mainAxis) * dist;
        const z = position.z + Math.sin(perpAngle) * offset + Math.sin(mainAxis) * dist;

        // Check if point is outside core
        const dx = x - position.x;
        const dz = z - position.z;
        const distFromCenter = Math.sqrt(dx * dx + dz * dz);

        if (distFromCenter > coreRadius * 1.1) {
          points.push({ x, z });
        }
      }

      if (points.length > 1) {
        gridStreets.push({
          id: `${settlement.id}_grid_ns_${i}`,
          points,
          width: streetWidth,
          type: 'town',
        });
      }
    }

    // Add transition streets connecting core to grid
    const transitionAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (const angle of transitionAngles) {
      const adjustedAngle = mainAxis + angle;
      const points = [
        {
          x: position.x + Math.cos(adjustedAngle) * coreRadius,
          z: position.z + Math.sin(adjustedAngle) * coreRadius,
        },
        {
          x: position.x + Math.cos(adjustedAngle) * radius * 0.9,
          z: position.z + Math.sin(adjustedAngle) * radius * 0.9,
        },
      ];

      settlement.streets.push({
        id: `${settlement.id}_transition_${Math.floor(angle * 100)}`,
        points,
        width: streetWidth,
        type: 'town',
      });
    }

    settlement.streets.push(...gridStreets);
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
    densityMultiplier: number = 1.0
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

    // Place buildings by zone (center -> edge)
    for (const category of ['civic', 'commercial', 'residential', 'industrial', 'agricultural', 'infrastructure'] as BuildingCategory[]) {
      const count = categoryTargets[category];
      for (let i = 0; i < count; i++) {
        const building = this.placeBuilding(settlement, category, placedBuildings, layoutType, densityMultiplier);
        if (building) {
          placedBuildings.push(building);
        }
      }
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
    category: BuildingCategory,
    existingBuildings: Building[],
    layoutType: LayoutType,
    densityMultiplier: number = 1.0
  ): Building | null {
    const { size, position, radius, mainAxis } = settlement;

    // Get available building specs for this category and settlement size
    const availableSpecs = BUILDING_SPECS.filter(
      s => s.category === category && s.allowedIn.includes(size)
    );

    if (availableSpecs.length === 0) return null;

    // Pick a random spec
    const spec = availableSpecs[Math.floor(this.random() * availableSpecs.length)];
    if (!spec) return null;

    // Determine placement zone based on category
    const zoneMultiplier = this.getZoneMultiplier(category, size);

    // Try to place building
    // Increase attempts for dense layouts
    const maxAttempts = densityMultiplier > 1.2 ? 50 : 20;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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

      // Check for overlap
      if (!this.checkOverlap(x, z, spec.footprint.width, spec.footprint.depth, rotation, existingBuildings, settlement.streets, densityMultiplier)) {
        if (Math.random() < 0.05) console.log(`[SettlementGenerator] Placed ${category} building at ${x.toFixed(1)}, ${z.toFixed(1)} after ${attempt} attempts`);
        return this.createBuilding(spec, x, z, settlement.id, rotation);
      } else {
        if (Math.random() < 0.01) console.log(`[SettlementGenerator] Failed to place ${category} building at ${x.toFixed(1)}, ${z.toFixed(1)} due to overlap (attempt ${attempt})`);
      }
    }

    console.warn(`[SettlementGenerator] Failed to place ${category} building after ${maxAttempts} attempts`);
    return null;
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
    const padding = densityMultiplier > 1.8 ? -0.5 : (densityMultiplier > 1.2 ? 1 : 3);

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
