/**
 * Core data types for Stellar Siege
 */

// Unit Categories
export type UnitCategory = 'LOG' | 'INF' | 'TNK' | 'REC' | 'AA' | 'ART' | 'HEL' | 'AIR';

// Audio Categories for weapon sounds
export type AudioCategory = 'rifle' | 'machinegun' | 'cannon' | 'missile' | 'artillery' | 'launcher';

// Optics and Stealth ratings (strings from JSON, converted to numbers in game)
export type OpticsRating = 'Poor' | 'Normal' | 'Good' | 'Very Good' | 'Exceptional';
export type StealthRating = 'None' | 'Poor' | 'Medium' | 'Good' | 'Exceptional';

// Convert optics rating string to number (0-6)
export function opticsToNumber(optics: OpticsRating): number {
  const map: Record<OpticsRating, number> = {
    'Poor': 2,
    'Normal': 3,
    'Good': 4,
    'Very Good': 5,
    'Exceptional': 6,
  };
  return map[optics] ?? 3;
}

// Convert stealth rating string to number (0-5)
export function stealthToNumber(stealth: StealthRating): number {
  const map: Record<StealthRating, number> = {
    'None': 0,
    'Poor': 1,
    'Medium': 2,
    'Good': 3,
    'Exceptional': 5,
  };
  return map[stealth] ?? 1;
}

export interface WeaponData {
  id: string;
  name: string;
  damage: number;
  rateOfFire: number; // rounds per minute
  range: number;
  accuracy: number; // 0-1
  penetration: number;
  suppression: number;
  isAntiAir: boolean;
  canTargetGround: boolean;
  smokeEffect?: {
    radius: number; // Smoke cloud radius in meters
    duration: number; // Duration in seconds
    opacityReduction: number; // 0-1, how much it blocks vision
  };
  // Audio properties
  soundId?: string; // ID of the weapon fire sound to play
  impactSoundId?: string; // ID of the impact sound to play on hit
}

export interface WeaponSlot {
  weaponId: string;
  count: number;
  turretMounted: boolean;
  maxAmmo: number; // Maximum ammunition capacity for this weapon
}

export interface UnitData {
  id: string;
  name: string;
  cost: number;
  category: UnitCategory;
  tags: string[];
  icon?: string;       // Path to unit icon (optional, auto-generated if not provided)
  health: number;
  speed: {
    road: number;
    offRoad: number;
    rotation: number;
  };
  armor: {
    front: number;
    side: number;
    rear: number;
    top: number;
  };
  optics: OpticsRating;
  stealth: StealthRating;
  isCommander: boolean;
  commanderAuraRadius: number; // Radius in meters for commander aura effect
  transportCapacity: number;
  canBeTransported: boolean;
  transportSize: number;
  weapons: WeaponSlot[];
  veterancyBonus: number;
}

export interface FactionData {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;      // Path to faction icon
  flag: string;      // Path to faction flag
}

// Unit availability by veterancy tier
export interface UnitAvailability {
  rookie: number;
  trained: number;
  veteran: number;
  elite: number;
  legend: number;
}

export interface DivisionRosterEntry {
  unitId: string;
  maxCards: number;
  availability: UnitAvailability;
  transportOptions?: string[];
  notes?: string;
}

export interface DivisionData {
  id: string;
  name: string;
  factionId: string;
  description: string;
  playstyle: string;
  icon?: string;       // Path to division icon (optional)
  roster: DivisionRosterEntry[];
  slotCosts: Record<UnitCategory, number[]>;
}

export interface DeckUnit {
  unitId: string;
  veterancy: number; // 0, 1, 2 (trained, hardened, elite)
  quantity: number; // Number of units this card provides (default based on veterancy)
  transportId?: string;
}

export interface DeckData {
  id: string;
  name: string;
  divisionId: string;
  units: DeckUnit[];
  activationPoints: number;
}

// Map Types
export type MapSize = 'small' | 'medium' | 'large';

export interface TerrainCell {
  type: TerrainType;
  elevation: number;
  cover: CoverType;
  variant?: number; // Visual variant (e.g. crop type for fields)
}

export type TerrainType = 'road' | 'field' | 'forest' | 'building' | 'river' | 'hill' | 'water';
export type CoverType = 'none' | 'light' | 'heavy' | 'full';

// Biome types for map generation
export type BiomeType = 'rainforest' | 'tundra' | 'mesa' | 'mountains' | 'plains' | 'cities';

export type ObjectiveType =
  | 'radio_tower' | 'supply_cache' | 'bunker' | 'hq_bunker' | 'radar_station' | 'supply_depot' | 'vehicle_park' | 'comms_array' // Generic
  | 'hamlet' | 'village' | 'town' | 'city' // Settlements (common for larger zones)
  | 'oil_field' | 'logging_camp' | 'indigenous_settlement' | 'temple_complex' // Rainforest
  | 'research_station' | 'mine' | 'fuel_depot' | 'bio_dome' // Tundra
  | 'mining_operation' | 'observation_post' | 'water_well' | 'harvester_rig' // Mesa
  | 'communication_tower' | 'ski_resort' | 'military_base' | 'orbital_uplink' // Mountains
  | 'grain_silo' | 'wind_farm' | 'rail_junction' // Plains
  | 'processing_plant' | 'irrigation_station' | 'market_town' | 'windmill' // Farmland
  | 'city_district' | 'cooling_tower';  // Cities

// Road types with standard lane widths (meters)
export type RoadType = 'dirt' | 'town' | 'highway' | 'interstate' | 'bridge';

export const ROAD_WIDTHS: Record<RoadType, number> = {
  dirt: 4,        // Narrow dirt road/path
  town: 8,        // 2-lane town road
  highway: 12,    // 4-lane highway
  interstate: 18, // 6-lane interstate
  bridge: 10,     // Standard bridge width
};

export interface Road {
  id?: string; // Optional identifier for intersection tracking
  points: { x: number; z: number }[];
  width: number;
  type: RoadType;
}

// Road intersection where multiple roads meet
export interface Intersection {
  id: string;
  x: number;
  z: number;
  roadIds: string[]; // IDs of roads meeting at this intersection
  type: 'T' | 'cross' | 'Y' | 'merge'; // Type of intersection
}

// Terrain Feature Types for hills, mountains, valleys, etc.
export type TerrainFeatureType = 'hill' | 'ridge' | 'mountain' | 'valley' | 'plateau' | 'plains';

export interface TerrainFeatureParams {
  elevationDelta: number;    // Height change in meters (negative for valleys)
  radius: number;            // Influence radius in meters
  angle?: number;            // For ridges/valleys: orientation in radians
  length?: number;           // For ridges/valleys: length in meters
  falloffExponent?: number;  // Edge steepness (1=linear, 2=smooth, 3=cliff)
  flatTopRadius?: number;    // For plateaus: radius of flat top area
  peakSharpness?: number;    // For mountains: 0=rounded, 1=sharp peak
}

export interface TerrainFeature {
  id: string;
  type: TerrainFeatureType;
  x: number;
  z: number;
  params: TerrainFeatureParams;
}

// Elevation configuration per map size
export interface ElevationConfig {
  baseNoiseScale: number;       // Scale of base terrain noise
  baseNoiseAmplitude: number;   // Height variation from base noise (meters)
  baseElevation: number;        // Starting "sea level" elevation
  featureChances: Record<TerrainFeatureType, number>;  // Probability weights
  featureCount: { min: number; max: number };  // Total major features
}

export const ELEVATION_CONFIGS: Record<MapSize, ElevationConfig> = {
  small: {
    baseNoiseScale: 0.02,
    baseNoiseAmplitude: 8,
    baseElevation: 5,
    featureChances: { hill: 0.30, plains: 0.25, valley: 0.15, ridge: 0.15, mountain: 0.10, plateau: 0.05 },
    featureCount: { min: 0, max: 2 }
  },
  medium: {
    baseNoiseScale: 0.015,
    baseNoiseAmplitude: 15,
    baseElevation: 10,
    featureChances: { ridge: 0.25, hill: 0.25, mountain: 0.20, valley: 0.15, plateau: 0.15, plains: 0.0 },
    featureCount: { min: 2, max: 4 }
  },
  large: {
    baseNoiseScale: 0.01,
    baseNoiseAmplitude: 25,
    baseElevation: 15,
    featureChances: { mountain: 0.30, ridge: 0.25, hill: 0.15, valley: 0.15, plateau: 0.10, plains: 0.05 },
    featureCount: { min: 4, max: 8 }
  }
};

// Feature parameter ranges by type
export const FEATURE_PARAMS: Record<TerrainFeatureType, {
  elevationRange: { min: number; max: number };
  radiusRange: { min: number; max: number };
  radiusScaleWithMap: boolean;
}> = {
  hill: { elevationRange: { min: 10, max: 30 }, radiusRange: { min: 30, max: 80 }, radiusScaleWithMap: true },
  ridge: { elevationRange: { min: 20, max: 50 }, radiusRange: { min: 20, max: 50 }, radiusScaleWithMap: true },
  mountain: { elevationRange: { min: 50, max: 100 }, radiusRange: { min: 120, max: 300 }, radiusScaleWithMap: true },  // Wider base for more realistic mountains
  valley: { elevationRange: { min: -30, max: -10 }, radiusRange: { min: 40, max: 100 }, radiusScaleWithMap: true },
  plateau: { elevationRange: { min: 30, max: 60 }, radiusRange: { min: 40, max: 200 }, radiusScaleWithMap: true },  // Wide range for varied sizes, elongated by 3-7x in length
  plains: { elevationRange: { min: -5, max: 5 }, radiusRange: { min: 100, max: 300 }, radiusScaleWithMap: true },
};

// Biome Configuration System
export interface BiomeConfig {
  id: BiomeType;
  name: string;
  description: string;

  // Visual appearance
  groundColor: number;  // Three.js color hex for terrain
  forestColor: number;  // Hex color for forest floor/foliage
  waterColor?: number;  // Optional water tint

  // Vegetation parameters
  forestDensity: { min: number; max: number };  // Multiplier on base forest count
  forestSizeScale: number;  // Multiplier on forest radius
  treeType?: 'pine' | 'oak' | 'palm' | 'sparse';  // Visual tree model variant

  // Terrain distribution
  terrainWeights: {
    field: number;   // Open terrain weight (0-1)
    forest: number;  // Forest coverage weight (0-1)
    hill: number;    // Hilly terrain weight (0-1)
    // Note: road, building, river, water are generated separately
  };

  // Elevation feature distribution
  elevationFeatureWeights: Partial<Record<TerrainFeatureType, number>>;

  // Settlement parameters
  settlementDensity: number;  // Multiplier on settlement count
  settlementTypes: SettlementSize[];  // Which settlement sizes are allowed

  // Strategic objectives
  objectiveTypes: ObjectiveType[];  // 3-5 objective types for this biome
  objectiveCount: { min: number; max: number };  // Per map size

  // Balance parameters
  openSpaceRatio: number;  // Target % of map that's open terrain (0.3-0.7)
  coverRatio: number;  // Target % with cover/concealment (0.1-0.6)
}

// Settlement System Types
export type SettlementSize = 'hamlet' | 'village' | 'town' | 'city';
export type LayoutType = 'organic' | 'grid' | 'mixed';

// Building categories and subtypes
export type BuildingCategory = 'residential' | 'commercial' | 'industrial' | 'civic' | 'agricultural' | 'infrastructure';

export type ResidentialType = 'cottage' | 'townhouse' | 'detached_house' | 'row_house' | 'apartment_block' | 'manor' | 'tenement' | 'l_building';
export type CommercialType = 'shop' | 'inn' | 'market_hall' | 'hotel' | 'office_building' | 'department_store' | 'skyscraper';
export type IndustrialType = 'workshop' | 'warehouse' | 'small_factory' | 'large_factory' | 'power_plant' | 'warehouse_complex';
export type CivicType = 'chapel' | 'church' | 'cathedral' | 'town_hall' | 'school' | 'hospital' | 'library' | 'clock_tower' | 'government_office';
export type AgriculturalType = 'farmhouse' | 'barn' | 'silo' | 'windmill' | 'stable' | 'silo_cluster';
export type InfrastructureType = 'gas_station' | 'water_tower' | 'train_station' | 'fire_station' | 'police_station' | 'radio_station';

export type BuildingSubtype =
  | ResidentialType
  | CommercialType
  | IndustrialType
  | CivicType
  | AgriculturalType
  | InfrastructureType;

// Legacy building type for backwards compatibility
export type LegacyBuildingType = 'house' | 'church' | 'factory' | 'shop';

export interface Building {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  type: LegacyBuildingType; // Keep for backwards compatibility
  category?: BuildingCategory;
  subtype?: BuildingSubtype;
  floors?: number;
  garrisonCapacity: number;
  defenseBonus?: number; // 0-1 (e.g., 0.5 = 50% damage reduction)
  stealthBonus?: number; // 0-1 (e.g., 0.5 = 50% visibility)
  settlementId?: string; // Reference to parent settlement
  rotation?: number; // Rotation in radians
}

// Building specifications from documentation
export interface BuildingSpec {
  subtype: BuildingSubtype;
  category: BuildingCategory;
  size: 'small' | 'medium' | 'large';
  floors: number | string; // Can be "1 + tower" etc
  footprint: { width: number; depth: number };
  garrisonCapacity: number;
  defenseBonus?: number;
  stealthBonus?: number;
  allowedIn: SettlementSize[];
}

// Settlement entry point for road connections
export interface SettlementEntryPoint {
  x: number;
  z: number;
  direction: number; // Angle in radians
  roadType: RoadType;
}

export interface Settlement {
  id: string;
  name: string;
  position: { x: number; z: number };
  size: SettlementSize;
  layoutType: LayoutType;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  radius: number;
  focalPoint: { x: number; z: number }; // Center of organic core or main intersection
  mainAxis: number; // Angle in radians for grid alignment
  entryPoints: SettlementEntryPoint[];
  buildings: Building[];
  streets: Road[];
  captureZoneId?: string; // Associated capture zone if any
  blockPool?: Array<{ u: number; v: number; failures: number }>; // Smart placement pool
}

// Settlement generation parameters
export const SETTLEMENT_PARAMS: Record<SettlementSize, {
  buildingCount: { min: number; max: number };
  radius: { min: number; max: number };
  roadConnections: { min: number; max: number };
  layoutWeights: Record<LayoutType, number>; // Probability weights
}> = {
  hamlet: {
    buildingCount: { min: 3, max: 8 },
    radius: { min: 25, max: 50 },
    roadConnections: { min: 1, max: 1 },
    layoutWeights: { organic: 1, grid: 0, mixed: 0 }, // Always organic
  },
  village: {
    buildingCount: { min: 10, max: 25 },
    radius: { min: 75, max: 150 },
    roadConnections: { min: 1, max: 2 },
    layoutWeights: { organic: 0.8, grid: 0.1, mixed: 0.1 },
  },
  town: {
    buildingCount: { min: 80, max: 120 },
    radius: { min: 200, max: 350 },
    roadConnections: { min: 2, max: 4 },
    layoutWeights: { organic: 0.2, grid: 0.3, mixed: 0.5 },
  },
  city: {
    buildingCount: { min: 600, max: 1000 },
    radius: { min: 400, max: 600 },
    roadConnections: { min: 4, max: 8 },
    layoutWeights: { organic: 0.1, grid: 0.6, mixed: 0.3 },
  },
};

// Building composition by settlement size (percentages)
export const SETTLEMENT_COMPOSITION: Record<SettlementSize, Record<BuildingCategory, { min: number; max: number }>> = {
  hamlet: {
    residential: { min: 0.4, max: 0.6 },
    commercial: { min: 0, max: 0.1 },
    industrial: { min: 0, max: 0 },
    civic: { min: 0, max: 0.15 },
    agricultural: { min: 0.3, max: 0.5 },
    infrastructure: { min: 0, max: 0 },
  },
  village: {
    residential: { min: 0.4, max: 0.6 },
    commercial: { min: 0.1, max: 0.2 },
    civic: { min: 0.05, max: 0.1 },
    industrial: { min: 0, max: 0.1 },
    agricultural: { min: 0.1, max: 0.25 },
    infrastructure: { min: 0, max: 0.05 },
  },
  town: {
    residential: { min: 0.45, max: 0.55 },
    commercial: { min: 0.15, max: 0.25 },
    civic: { min: 0.08, max: 0.12 },
    industrial: { min: 0.1, max: 0.18 },
    agricultural: { min: 0.05, max: 0.1 },
    infrastructure: { min: 0.02, max: 0.05 },
  },
  city: {
    residential: { min: 0.45, max: 0.55 },
    commercial: { min: 0.18, max: 0.25 },
    civic: { min: 0.08, max: 0.12 },
    industrial: { min: 0.15, max: 0.22 },
    agricultural: { min: 0, max: 0.03 },
    infrastructure: { min: 0.03, max: 0.06 },
  },
};

// Building specifications lookup
export const BUILDING_SPECS: BuildingSpec[] = [
  // Residential
  { subtype: 'cottage', category: 'residential', size: 'small', floors: 1, footprint: { width: 6, depth: 8 }, garrisonCapacity: 4, allowedIn: ['hamlet', 'village'] },
  { subtype: 'townhouse', category: 'residential', size: 'small', floors: 3, footprint: { width: 5, depth: 12 }, garrisonCapacity: 4, allowedIn: ['town', 'city'] },
  { subtype: 'detached_house', category: 'residential', size: 'medium', floors: 2, footprint: { width: 10, depth: 12 }, garrisonCapacity: 8, allowedIn: ['village', 'town'] },
  { subtype: 'row_house', category: 'residential', size: 'medium', floors: 3, footprint: { width: 6, depth: 15 }, garrisonCapacity: 4, allowedIn: ['town', 'city'] },
  { subtype: 'apartment_block', category: 'residential', size: 'large', floors: 4, footprint: { width: 20, depth: 30 }, garrisonCapacity: 16, allowedIn: ['city'] },
  { subtype: 'tenement', category: 'residential', size: 'large', floors: 5, footprint: { width: 20, depth: 25 }, garrisonCapacity: 12, allowedIn: ['city'] },
  { subtype: 'l_building', category: 'residential', size: 'medium', floors: 3, footprint: { width: 15, depth: 15 }, garrisonCapacity: 8, allowedIn: ['town', 'city'] },
  { subtype: 'manor', category: 'residential', size: 'large', floors: 2, footprint: { width: 15, depth: 20 }, garrisonCapacity: 12, allowedIn: ['village'] },
  // Commercial
  { subtype: 'shop', category: 'commercial', size: 'small', floors: 2, footprint: { width: 8, depth: 10 }, garrisonCapacity: 4, allowedIn: ['hamlet', 'village', 'town', 'city'] },
  { subtype: 'inn', category: 'commercial', size: 'medium', floors: 2, footprint: { width: 12, depth: 15 }, garrisonCapacity: 8, allowedIn: ['village', 'town', 'city'] },
  { subtype: 'market_hall', category: 'commercial', size: 'medium', floors: 2, footprint: { width: 15, depth: 20 }, garrisonCapacity: 8, allowedIn: ['town', 'city'] },
  { subtype: 'hotel', category: 'commercial', size: 'large', floors: 4, footprint: { width: 20, depth: 25 }, garrisonCapacity: 16, allowedIn: ['town', 'city'] },
  { subtype: 'office_building', category: 'commercial', size: 'large', floors: 6, footprint: { width: 25, depth: 30 }, garrisonCapacity: 24, allowedIn: ['city'] },
  { subtype: 'department_store', category: 'commercial', size: 'large', floors: 3, footprint: { width: 30, depth: 40 }, garrisonCapacity: 16, allowedIn: ['city'] },
  { subtype: 'skyscraper', category: 'commercial', size: 'large', floors: 12, footprint: { width: 25, depth: 25 }, garrisonCapacity: 32, allowedIn: ['city'] },
  // Industrial
  { subtype: 'workshop', category: 'industrial', size: 'small', floors: 1, footprint: { width: 10, depth: 12 }, garrisonCapacity: 4, allowedIn: ['village', 'town', 'city'] },
  { subtype: 'warehouse', category: 'industrial', size: 'medium', floors: 2, footprint: { width: 20, depth: 30 }, garrisonCapacity: 8, allowedIn: ['town', 'city'] },
  { subtype: 'small_factory', category: 'industrial', size: 'medium', floors: 2, footprint: { width: 25, depth: 40 }, garrisonCapacity: 12, allowedIn: ['town', 'city'] },
  { subtype: 'large_factory', category: 'industrial', size: 'large', floors: 3, footprint: { width: 40, depth: 60 }, garrisonCapacity: 24, allowedIn: ['city'] },
  { subtype: 'warehouse_complex', category: 'industrial', size: 'large', floors: 2, footprint: { width: 40, depth: 50 }, garrisonCapacity: 16, allowedIn: ['city'] },
  { subtype: 'power_plant', category: 'industrial', size: 'large', floors: 2, footprint: { width: 30, depth: 40 }, garrisonCapacity: 8, allowedIn: ['city'] },
  // Civic
  { subtype: 'chapel', category: 'civic', size: 'small', floors: 1, footprint: { width: 8, depth: 12 }, garrisonCapacity: 4, allowedIn: ['hamlet', 'village'] },
  { subtype: 'church', category: 'civic', size: 'medium', floors: 1, footprint: { width: 15, depth: 25 }, garrisonCapacity: 8, allowedIn: ['village', 'town'] },
  { subtype: 'cathedral', category: 'civic', size: 'large', floors: 1, footprint: { width: 30, depth: 50 }, garrisonCapacity: 16, allowedIn: ['city'] },
  { subtype: 'town_hall', category: 'civic', size: 'medium', floors: 3, footprint: { width: 20, depth: 25 }, garrisonCapacity: 12, allowedIn: ['town', 'city'] },
  { subtype: 'school', category: 'civic', size: 'medium', floors: 2, footprint: { width: 20, depth: 30 }, garrisonCapacity: 8, allowedIn: ['village', 'town', 'city'] },
  { subtype: 'hospital', category: 'civic', size: 'large', floors: 4, footprint: { width: 30, depth: 40 }, garrisonCapacity: 16, allowedIn: ['town', 'city'] },
  { subtype: 'library', category: 'civic', size: 'medium', floors: 2, footprint: { width: 20, depth: 25 }, garrisonCapacity: 8, allowedIn: ['town', 'city'] },
  { subtype: 'clock_tower', category: 'civic', size: 'small', floors: 5, footprint: { width: 8, depth: 8 }, garrisonCapacity: 4, allowedIn: ['town', 'city'] },
  { subtype: 'government_office', category: 'civic', size: 'large', floors: 4, footprint: { width: 35, depth: 45 }, garrisonCapacity: 24, allowedIn: ['city'] },
  // Agricultural
  { subtype: 'farmhouse', category: 'agricultural', size: 'medium', floors: 2, footprint: { width: 10, depth: 15 }, garrisonCapacity: 8, allowedIn: ['hamlet', 'village'] },
  { subtype: 'barn', category: 'agricultural', size: 'medium', floors: 2, footprint: { width: 15, depth: 25 }, garrisonCapacity: 8, allowedIn: ['hamlet', 'village'] },
  { subtype: 'silo', category: 'agricultural', size: 'small', floors: 1, footprint: { width: 5, depth: 5 }, garrisonCapacity: 0, allowedIn: ['hamlet', 'village'] },
  { subtype: 'windmill', category: 'agricultural', size: 'small', floors: 3, footprint: { width: 8, depth: 8 }, garrisonCapacity: 4, allowedIn: ['hamlet', 'village'] },
  { subtype: 'stable', category: 'agricultural', size: 'small', floors: 1, footprint: { width: 10, depth: 15 }, garrisonCapacity: 4, allowedIn: ['hamlet', 'village'] },
  { subtype: 'silo_cluster', category: 'agricultural', size: 'medium', floors: 1, footprint: { width: 15, depth: 15 }, garrisonCapacity: 0, allowedIn: ['village'] },
  // Infrastructure
  { subtype: 'gas_station', category: 'infrastructure', size: 'small', floors: 1, footprint: { width: 10, depth: 15 }, garrisonCapacity: 4, allowedIn: ['village', 'town', 'city'] },
  { subtype: 'water_tower', category: 'infrastructure', size: 'small', floors: 1, footprint: { width: 8, depth: 8 }, garrisonCapacity: 0, allowedIn: ['village', 'town', 'city'] },
  { subtype: 'train_station', category: 'infrastructure', size: 'medium', floors: 2, footprint: { width: 15, depth: 40 }, garrisonCapacity: 8, allowedIn: ['town', 'city'] },
  { subtype: 'fire_station', category: 'infrastructure', size: 'medium', floors: 2, footprint: { width: 15, depth: 20 }, garrisonCapacity: 8, allowedIn: ['town', 'city'] },
  { subtype: 'police_station', category: 'infrastructure', size: 'medium', floors: 2, footprint: { width: 15, depth: 20 }, garrisonCapacity: 8, allowedIn: ['town', 'city'] },
  { subtype: 'radio_station', category: 'infrastructure', size: 'medium', floors: 2, footprint: { width: 15, depth: 20 }, garrisonCapacity: 6, allowedIn: ['town', 'city'] },
];

export interface CaptureZone {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  height: number;
  pointsPerTick: number;
  owner: 'neutral' | 'player' | 'enemy';
  captureProgress: number;
  objectiveType?: ObjectiveType;  // Strategic objective type for this zone
  visualVariant?: number;  // 0-2 for visual variety within objective type
  objectiveX?: number; // Specific location for the objective model
  objectiveZ?: number;
}

export interface DeploymentZone {
  team: 'player' | 'enemy';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface QueuedReinforcement {
  unitType: string; // Unit ID to spawn
  destination: { x: number; z: number } | null; // Where unit should move after spawning
  moveType: 'normal' | 'attack' | 'reverse' | 'fast' | null; // Movement modifier
}

export interface EntryPoint {
  id: string;
  team: 'player' | 'enemy';
  x: number;
  z: number;
  type: 'highway' | 'secondary' | 'dirt' | 'air';
  spawnRate: number; // seconds between spawns
  queue: QueuedReinforcement[]; // units waiting to spawn with their commands
  rallyPoint: { x: number; z: number } | null;
}

export interface ResupplyPoint {
  id: string;
  x: number;
  z: number;
  team: 'player' | 'enemy';
  radius: number; // Visual radius for the hexagon marker
  capacity: number; // How many units can spawn simultaneously
  isActive: boolean; // Can be disabled if captured/destroyed
  direction: number; // Angle in radians pointing toward battlefield (0 = up/north, PI/2 = right/east)
}

// Water body types for terrain generation
export type WaterBodyType = 'lake' | 'pond' | 'river';

export interface WaterBody {
  id: string;
  type: WaterBodyType;
  points: { x: number; z: number }[];  // Polygon vertices for lakes/ponds, path for rivers
  width: number;  // Width in meters (mainly for rivers, lakes use radius)
  radius?: number;  // For lakes/ponds - approximate size
}

// Bridge data for road-river crossings
export interface Bridge {
  id: string;
  x: number;
  z: number;
  length: number;  // Length of bridge segment
  width: number;   // Width matches road type
  angle: number;   // Rotation angle in radians
  elevation?: number; // Elevation in meters
  roadId?: string; // Reference to the road this bridge belongs to
}

export interface GameMap {
  seed: number;
  size: MapSize;
  biome: BiomeType;  // Biome type for this map
  width: number;
  height: number;
  cellSize: number; // meters per terrain cell (adaptive based on map size)
  terrain: TerrainCell[][];
  roads: Road[];
  intersections: Intersection[];
  buildings: Building[];
  settlements: Settlement[];
  captureZones: CaptureZone[];
  deploymentZones: DeploymentZone[];
  entryPoints: EntryPoint[];
  resupplyPoints: ResupplyPoint[];
  waterBodies: WaterBody[];
  bridges: Bridge[];
  // Terrain elevation features
  terrainFeatures: TerrainFeature[];
  baseElevation: number;   // Sea level / minimum elevation
  maxElevation: number;    // Highest point on map
}

// Game Constants
export const GAME_CONSTANTS = {
  STARTING_CREDITS: 1500,
  INCOME_PER_TICK: 10,
  TICK_DURATION: 4, // seconds
  VICTORY_THRESHOLD: 2000,
  CAMERA_MIN_HEIGHT: 5,
  CAMERA_MAX_HEIGHT: 150,
  TACTICAL_VIEW_HEIGHT: 60,
  EDGE_PAN_MARGIN: 20,
  MAX_ACTIVATION_POINTS: 50,
  GARRISON_DAMAGE_REDUCTION: 0.5,
  SUPPRESSION_RECOVERY_RATE: 5, // per second
  MORALE_RECOVERY_RATE: 2, // per second when not under fire
  CAPTURE_RATE: 10, // per second
  MAX_TRAVERSABLE_SLOPE: 1.0, // 45° slope (rise/run = 1)
  MIN_MOVEMENT_FOR_SLOPE_CHECK: 0.01, // Skip checks for tiny movements
  HELICOPTER_FLIGHT_ALTITUDE: 20, // meters above terrain
} as const;

// Map Size Configurations
export const MAP_SIZES: Record<MapSize, { width: number; height: number; zones: number; towns: number }> = {
  small: { width: 300, height: 300, zones: 5, towns: 3 },
  medium: { width: 1000, height: 1000, zones: 9, towns: 6 },
  large: { width: 10000, height: 10000, zones: 15, towns: 10 },
};
