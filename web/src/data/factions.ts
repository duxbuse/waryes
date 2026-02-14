/**
 * Faction and Division data for Stellar Siege
 * Units, weapons, and divisions are loaded from JSON files via dataLoader
 * FACTIONS constant and getFactionById come from shared package
 */

import type { UnitData, WeaponData, DivisionData } from './types';
import {
  UNITS as UNITS_FROM_JSON,
  WEAPONS as WEAPONS_FROM_JSON,
  DIVISIONS as DIVISIONS_FROM_JSON,
  getUnitById as getUnitByIdFromLoader,
  getWeaponById as getWeaponByIdFromLoader,
  getUnitsByCategory as getUnitsByCategoryFromLoader,
  getDivisionById as getDivisionByIdFromLoader,
  getDivisionsByFaction as getDivisionsByFactionFromLoader,
} from './dataLoader';

// Re-export faction data from shared package
export { FACTIONS, getFactionById } from '@shared/data/factions';

// Re-export starter decks for convenience
export { STARTER_DECKS, getStarterDecksByFaction, getStarterDeckById } from './starterDecks';

// Export units, weapons, and divisions loaded from JSON
export const UNITS: UnitData[] = UNITS_FROM_JSON;
export const WEAPONS: WeaponData[] = WEAPONS_FROM_JSON;
export const DIVISIONS: DivisionData[] = DIVISIONS_FROM_JSON;

// Helper functions - delegate to data loader
export function getUnitById(id: string): UnitData | undefined {
  return getUnitByIdFromLoader(id);
}

export function getWeaponById(id: string): WeaponData | undefined {
  return getWeaponByIdFromLoader(id);
}

export function getDivisionById(id: string): DivisionData | undefined {
  return getDivisionByIdFromLoader(id);
}

export function getDivisionsByFaction(factionId: string): DivisionData[] {
  return getDivisionsByFactionFromLoader(factionId);
}

export function getUnitsByCategory(category: string): UnitData[] {
  return getUnitsByCategoryFromLoader(category);
}
