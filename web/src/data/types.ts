/**
 * Core data types for Stellar Siege
 */

// Unit Categories
export type UnitCategory = 'LOG' | 'INF' | 'TNK' | 'REC' | 'AA' | 'ART' | 'HEL' | 'AIR';

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
}

export interface WeaponSlot {
  weaponId: string;
  count: number;
  turretMounted: boolean;
}

export interface UnitData {
  id: string;
  name: string;
  cost: number;
  category: UnitCategory;
  tags: string[];
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
  optics: number;
  stealth: number;
  isCommander: boolean;
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
}

export interface DivisionRosterEntry {
  unitId: string;
  availability: number[]; // [phase1, phase2, phase3]
}

export interface DivisionData {
  id: string;
  name: string;
  factionId: string;
  description: string;
  roster: DivisionRosterEntry[];
  slotCosts: Record<UnitCategory, number[]>;
}

export interface DeckUnit {
  unitId: string;
  veterancy: number; // 0, 1, 2 (trained, hardened, elite)
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
}

export type TerrainType = 'road' | 'field' | 'forest' | 'building' | 'river' | 'hill' | 'water';
export type CoverType = 'none' | 'light' | 'heavy' | 'full';

export interface Road {
  points: { x: number; z: number }[];
  width: number;
}

export interface Building {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  type: 'house' | 'church' | 'factory' | 'shop';
  garrisonCapacity: number;
}

export interface CaptureZone {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  pointsPerTick: number;
  owner: 'neutral' | 'player' | 'enemy';
  captureProgress: number;
}

export interface DeploymentZone {
  team: 'player' | 'enemy';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface GameMap {
  seed: number;
  size: MapSize;
  width: number;
  height: number;
  terrain: TerrainCell[][];
  roads: Road[];
  buildings: Building[];
  captureZones: CaptureZone[];
  deploymentZones: DeploymentZone[];
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
} as const;

// Map Size Configurations
export const MAP_SIZES: Record<MapSize, { width: number; height: number; zones: number; towns: number }> = {
  small: { width: 200, height: 200, zones: 3, towns: 2 },
  medium: { width: 300, height: 300, zones: 5, towns: 3 },
  large: { width: 400, height: 400, zones: 7, towns: 4 },
};
