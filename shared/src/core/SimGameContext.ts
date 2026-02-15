/**
 * SimGameContext - Interface for the game context that both
 * client Game and server AuthoritativeGame implement.
 *
 * This allows shared simulation code (SimUnit, Sim*Managers) to
 * access game state without depending on client-specific types.
 */

import type * as THREE from 'three';
import type { GamePhase } from './GamePhase';
import type { GameMap, TerrainCell, Building, WeaponData, UnitData } from '../data/types';
import type { SimUnit } from '../simulation/SimUnit';

export interface SimGameContext {
  readonly currentMap: GameMap | null;
  phase: GamePhase;

  // Deterministic RNG for this game session
  readonly rng: { next(): number };

  // Terrain queries
  getElevationAt(x: number, z: number): number;
  getTerrainAt(x: number, z: number): TerrainCell | null;

  // Data lookup
  getWeaponData(id: string): WeaponData | undefined;
  getUnitData(id: string): UnitData | undefined;

  // Unit management (spatial queries)
  getUnitsInRadius(position: THREE.Vector3, radius: number, team?: 'player' | 'enemy'): SimUnit[];
  getAllUnits(team: 'player' | 'enemy'): SimUnit[];
  destroyUnit(unit: SimUnit): void;

  // Pathfinding
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null;
  findNearestReachablePosition(from: THREE.Vector3, to: THREE.Vector3, maxRadius: number): THREE.Vector3 | null;

  // Building management
  findNearestBuilding(position: THREE.Vector3, radius: number): Building | null;
  hasBuildingCapacity(building: Building): boolean;
  tryGarrison(unit: SimUnit, building: Building): boolean;
  ungarrison(unit: SimUnit, building: Building): THREE.Vector3 | null;
  spawnDefensiveStructure(unit: SimUnit): Building | null;

  // Transport management
  tryMount(passenger: SimUnit, transport: SimUnit): boolean;
  unloadAll(transport: SimUnit): SimUnit[];

  // Navigation
  isPositionOnNavMesh(x: number, z: number): boolean;

  // Fog of war
  isFogOfWarEnabled(): boolean;
  isPositionVisible(x: number, z: number): boolean;
}
