/**
 * Data loader for units, weapons, and divisions from JSON files
 * Uses Vite's glob import to load all JSON files at build time
 */

import type { UnitData, WeaponData, DivisionData } from './types';

// Type for Vite's glob import result
type GlobModule<T> = Record<string, { default: T }>;

// Import all unit JSON files using Vite's glob import (eager mode)
// Falls back to empty object in test environments where import.meta.glob is not available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let unitModules: GlobModule<UnitData> = {};
try {
  // In Vite environment, this will be transformed at build time
  // In test environment, this will throw and we'll use the fallback empty object
  unitModules = (import.meta as any).glob('./units/**/*.json', { eager: true });
} catch (e) {
  // Test environment fallback
  unitModules = {};
}

// Import all weapon JSON files using Vite's glob import (eager mode)
// Falls back to empty object in test environments where import.meta.glob is not available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let weaponModules: GlobModule<WeaponData> = {};
try {
  weaponModules = (import.meta as any).glob('./weapons/**/*.json', { eager: true });
} catch (e) {
  // Test environment fallback
  weaponModules = {};
}

// Import all division JSON files using Vite's glob import (eager mode)
// Falls back to empty object in test environments where import.meta.glob is not available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let divisionModules: GlobModule<DivisionData> = {};
try {
  divisionModules = (import.meta as any).glob('./divisions/**/*.json', { eager: true });
} catch (e) {
  // Test environment fallback
  divisionModules = {};
}

// Extract unit data from modules
export const UNITS: UnitData[] = Object.values(unitModules).map(
  (module) => module.default
);

// Extract weapon data from modules
export const WEAPONS: WeaponData[] = Object.values(weaponModules).map(
  (module) => module.default
);

// Extract division data from modules
export const DIVISIONS: DivisionData[] = Object.values(divisionModules).map(
  (module) => module.default
);

// Unit helper functions
export function getUnitById(id: string): UnitData | undefined {
  return UNITS.find((u) => u.id === id);
}

export function getWeaponById(id: string): WeaponData | undefined {
  return WEAPONS.find((w) => w.id === id);
}

export function getUnitsByCategory(category: string): UnitData[] {
  return UNITS.filter((u) => u.category === category);
}

export function getUnitsByFaction(factionPrefix: string): UnitData[] {
  return UNITS.filter((u) => u.id.startsWith(factionPrefix));
}

// Division helper functions
export function getDivisionById(id: string): DivisionData | undefined {
  return DIVISIONS.find((d) => d.id === id);
}

export function getDivisionsByFaction(factionId: string): DivisionData[] {
  return DIVISIONS.filter((d) => d.factionId === factionId);
}

// Debug: log loaded data counts (only in non-test environments)
if (UNITS.length > 0 || WEAPONS.length > 0 || DIVISIONS.length > 0) {
  console.log(`Loaded ${UNITS.length} units, ${WEAPONS.length} weapons, and ${DIVISIONS.length} divisions from JSON`);
} else if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  console.warn('dataLoader: Running in test environment - JSON data not loaded via import.meta.glob (this is expected)');
}
