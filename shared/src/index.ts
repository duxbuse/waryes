/**
 * @stellar-siege/shared - Shared game logic package
 *
 * Pure game logic, data types, and utilities used by both
 * the web client and the authoritative game server.
 */

// Core
export { GamePhase } from './core/GamePhase';
export type { SimGameContext } from './core/SimGameContext';

// Data types (re-export everything from types)
export * from './data/types';
export { FACTIONS, getFactionById } from './data/factions';
export {
  STARTER_DECKS,
  getStarterDecksByFaction,
  getStarterDeckById,
  getStarterDeckByDivision,
} from './data/starterDecks';
export { BIOME_CONFIGS, selectBiomeFromSeed } from './data/biomeConfigs';

// Multiplayer protocol
export {
  CommandType,
  serializeCommand,
  deserializeCommand,
  serializeCommands,
  deserializeCommands,
  createMoveCommand,
  createAttackCommand,
  createQueueReinforcementCommand,
  isValidCommand,
} from './multiplayer/CommandProtocol';
export type { GameCommand } from './multiplayer/CommandProtocol';
export { TickManager } from './multiplayer/TickManager';
export {
  computeGameStateChecksum,
  computePositionChecksum,
  compareChecksums,
  formatChecksum,
} from './multiplayer/StateChecksum';
export type { ChecksumUnit } from './multiplayer/StateChecksum';

// Simulation
export { SimUnit, UnitCommand } from './simulation/SimUnit';
export type { SimUnitConfig, SimCommandData, SimUnitEvent } from './simulation/SimUnit';
export { SimEconomyManager } from './simulation/SimEconomyManager';
export type { TeamScore, ZoneCaptureEvent, ZonePresence, ZoneUnitEntry, GetUnitsInZoneFn } from './simulation/SimEconomyManager';
export { SimSmokeManager } from './simulation/SimSmokeManager';
export type { SimSmokeCloud, SmokeEvent, SmokeType } from './simulation/SimSmokeManager';
export { SimTransportManager } from './simulation/SimTransportManager';
export type { TransportEvent } from './simulation/SimTransportManager';
export { SimBuildingManager } from './simulation/SimBuildingManager';
export type { BuildingEvent } from './simulation/SimBuildingManager';

// Utils
export {
  DeterministicRNG,
  gameRNG,
  setGameSeed,
  getGameRNGState,
} from './utils/DeterministicRNG';
export { VectorPool } from './utils/VectorPool';
export { SpatialHashGrid } from './utils/SpatialHashGrid';
export { ObjectPool } from './utils/ObjectPool';
export type { IPoolable } from './utils/ObjectPool';
export { QuaternionPool } from './utils/QuaternionPool';
