/**
 * Faction and Division data for Stellar Siege
 * Units, weapons, and divisions are loaded from JSON files via dataLoader
 */

import type { FactionData, DivisionData, UnitData, WeaponData } from './types';
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

// Re-export starter decks for convenience
export { STARTER_DECKS, getStarterDecksByFaction, getStarterDeckById } from './starterDecks';

export const FACTIONS: FactionData[] = [
  {
    id: 'sdf',
    name: 'System Defense Force',
    description: 'Local garrison forces defending their homeworld. Rely on numbers, entrenchment, and knowledge of terrain.',
    color: '#4a9eff',
    icon: '/assets/icons/factions/sdf_faction_icon_main.png',
    flag: '/assets/icons/factions/sdf_flag.png',
  },
  {
    id: 'vanguard',
    name: 'Vanguard Legions',
    description: 'Elite assault forces specialized in planetary siege warfare. Superior firepower and armor.',
    color: '#ff4a4a',
    icon: '/assets/icons/factions/vanguard_faction_icon_main.png',
    flag: '/assets/icons/factions/vanguard_flag.png',
  },
];

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

export function getFactionById(id: string): FactionData | undefined {
  return FACTIONS.find((f) => f.id === id);
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
