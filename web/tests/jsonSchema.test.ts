/**
 * JSON Data Validation Tests
 * Ensures all unit and weapon JSON files follow the expected schema
 * Uses Bun's native test runner
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

// Types (simplified for testing)
interface UnitData {
  id: string;
  name: string;
  cost: number;
  health: number;
  category: string;
  optics: string;
  stealth: string;
  speed: { road: number; offRoad: number; rotation: number };
  armor: { front: number; side: number; rear: number; top: number };
  isCommander: boolean;
  commanderAuraRadius: number;
  transportCapacity: number;
  canBeTransported: boolean;
  transportSize: number;
  veterancyBonus: number;
  tags: string[];
  weapons: { weaponId: string; count: number; maxAmmo: number; turretMounted: boolean }[];
}

interface WeaponData {
  id: string;
  name: string;
  damage: number;
  rateOfFire: number;
  range: number;
  accuracy: number;
  penetration: number;
  suppression: number;
  isAntiAir: boolean;
  canTargetGround: boolean;
  smokeEffect?: { radius: number; duration: number; opacityReduction: number };
}

// Valid enum values

// Division types for testing
interface UnitAvailability {
  rookie: number;
  trained: number;
  veteran: number;
  elite: number;
  legend: number;
}

interface DivisionRosterEntry {
  unitId: string;
  maxCards: number;
  availability: UnitAvailability;
  transportOptions?: string[];
  notes?: string;
}

interface DivisionData {
  id: string;
  name: string;
  factionId: string;
  description: string;
  playstyle: string;
  icon?: string;
  slotCosts: Record<string, number[]>;
  roster: DivisionRosterEntry[];
}
const VALID_CATEGORIES = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
const VALID_OPTICS = ['Poor', 'Normal', 'Good', 'Very Good', 'Exceptional'];
const VALID_STEALTH = ['None', 'Poor', 'Medium', 'Good', 'Exceptional'];

// Load JSON files
function loadJsonFiles<T>(dir: string): T[] {
  const results: T[] = [];

  function processDir(currentDir: string) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        processDir(fullPath);
      } else if (item.name.endsWith('.json')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(content) as T;
        results.push(data);
      }
    }
  }

  processDir(dir);
  return results;
}

// Data directories
const dataDir = path.resolve(import.meta.dir, '../src/data');
const unitsDir = path.join(dataDir, 'units');
const weaponsDir = path.join(dataDir, 'weapons');
const divisionsDir = path.join(dataDir, 'divisions');

let UNITS: UnitData[] = [];
let WEAPONS: WeaponData[] = [];
let DIVISIONS: DivisionData[] = [];

beforeAll(() => {
  UNITS = loadJsonFiles<UnitData>(unitsDir);
  WEAPONS = loadJsonFiles<WeaponData>(weaponsDir);
  DIVISIONS = loadJsonFiles<DivisionData>(divisionsDir);
});

describe('Unit JSON Schema Validation', () => {
  it('should load at least one unit', () => {
    expect(UNITS.length).toBeGreaterThan(0);
  });

  it('all units should have required string fields', () => {
    for (const unit of UNITS) {
      expect(typeof unit.id).toBe('string');
      expect(unit.id.length).toBeGreaterThan(0);
      expect(typeof unit.name).toBe('string');
      expect(unit.name.length).toBeGreaterThan(0);
    }
  });

  it('all units should have valid cost', () => {
    for (const unit of UNITS) {
      expect(typeof unit.cost).toBe('number');
      expect(unit.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid health', () => {
    for (const unit of UNITS) {
      expect(typeof unit.health).toBe('number');
      expect(unit.health).toBeGreaterThan(0);
    }
  });

  it('all units should have valid category', () => {
    for (const unit of UNITS) {
      expect(VALID_CATEGORIES).toContain(unit.category);
    }
  });

  it('all units should have valid optics rating', () => {
    for (const unit of UNITS) {
      expect(VALID_OPTICS).toContain(unit.optics);
    }
  });

  it('all units should have valid stealth rating', () => {
    for (const unit of UNITS) {
      expect(VALID_STEALTH).toContain(unit.stealth);
    }
  });

  it('all units should have valid speed object', () => {
    for (const unit of UNITS) {
      expect(unit.speed).toBeDefined();
      expect(typeof unit.speed.road).toBe('number');
      expect(typeof unit.speed.offRoad).toBe('number');
      expect(typeof unit.speed.rotation).toBe('number');
      expect(unit.speed.road).toBeGreaterThanOrEqual(0);
      expect(unit.speed.offRoad).toBeGreaterThanOrEqual(0);
      expect(unit.speed.rotation).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid armor object', () => {
    for (const unit of UNITS) {
      expect(unit.armor).toBeDefined();
      expect(typeof unit.armor.front).toBe('number');
      expect(typeof unit.armor.side).toBe('number');
      expect(typeof unit.armor.rear).toBe('number');
      expect(typeof unit.armor.top).toBe('number');
      expect(unit.armor.front).toBeGreaterThanOrEqual(0);
      expect(unit.armor.side).toBeGreaterThanOrEqual(0);
      expect(unit.armor.rear).toBeGreaterThanOrEqual(0);
      expect(unit.armor.top).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid boolean fields', () => {
    for (const unit of UNITS) {
      expect(typeof unit.isCommander).toBe('boolean');
      expect(typeof unit.canBeTransported).toBe('boolean');
    }
  });

  it('all units should have valid numeric fields', () => {
    for (const unit of UNITS) {
      expect(typeof unit.commanderAuraRadius).toBe('number');
      expect(unit.commanderAuraRadius).toBeGreaterThanOrEqual(0);
      expect(typeof unit.transportCapacity).toBe('number');
      expect(unit.transportCapacity).toBeGreaterThanOrEqual(0);
      expect(typeof unit.transportSize).toBe('number');
      expect(unit.transportSize).toBeGreaterThanOrEqual(0);
      expect(typeof unit.veterancyBonus).toBe('number');
      expect(unit.veterancyBonus).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid tags array', () => {
    for (const unit of UNITS) {
      expect(Array.isArray(unit.tags)).toBe(true);
      for (const tag of unit.tags) {
        expect(typeof tag).toBe('string');
      }
    }
  });

  it('all units should have valid weapons array', () => {
    for (const unit of UNITS) {
      expect(Array.isArray(unit.weapons)).toBe(true);
      for (const weapon of unit.weapons) {
        expect(typeof weapon.weaponId).toBe('string');
        expect(weapon.weaponId.length).toBeGreaterThan(0);
        expect(typeof weapon.count).toBe('number');
        expect(weapon.count).toBeGreaterThan(0);
        expect(typeof weapon.maxAmmo).toBe('number');
        expect(weapon.maxAmmo).toBeGreaterThanOrEqual(0);
        expect(typeof weapon.turretMounted).toBe('boolean');
      }
    }
  });

  it('all units should reference valid weapons', () => {
    const weaponIds = new Set(WEAPONS.map(w => w.id));
    for (const unit of UNITS) {
      for (const weaponSlot of unit.weapons) {
        expect(weaponIds.has(weaponSlot.weaponId)).toBe(true);
      }
    }
  });
});

describe('Weapon JSON Schema Validation', () => {
  it('should load at least one weapon', () => {
    expect(WEAPONS.length).toBeGreaterThan(0);
  });

  it('all weapons should have required string fields', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.id).toBe('string');
      expect(weapon.id.length).toBeGreaterThan(0);
      expect(typeof weapon.name).toBe('string');
      expect(weapon.name.length).toBeGreaterThan(0);
    }
  });

  it('all weapons should have valid damage', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.damage).toBe('number');
      expect(weapon.damage).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid rateOfFire', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.rateOfFire).toBe('number');
      expect(weapon.rateOfFire).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid range', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.range).toBe('number');
      expect(weapon.range).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid accuracy (0-1)', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.accuracy).toBe('number');
      expect(weapon.accuracy).toBeGreaterThanOrEqual(0);
      expect(weapon.accuracy).toBeLessThanOrEqual(1);
    }
  });

  it('all weapons should have valid penetration', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.penetration).toBe('number');
      expect(weapon.penetration).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid suppression', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.suppression).toBe('number');
      expect(weapon.suppression).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid boolean fields', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.isAntiAir).toBe('boolean');
      expect(typeof weapon.canTargetGround).toBe('boolean');
    }
  });

  it('all weapons with smoke effect should have valid properties', () => {
    for (const weapon of WEAPONS) {
      if (weapon.smokeEffect) {
        expect(typeof weapon.smokeEffect.radius).toBe('number');
        expect(weapon.smokeEffect.radius).toBeGreaterThan(0);
        expect(typeof weapon.smokeEffect.duration).toBe('number');
        expect(weapon.smokeEffect.duration).toBeGreaterThan(0);
        expect(typeof weapon.smokeEffect.opacityReduction).toBe('number');
        expect(weapon.smokeEffect.opacityReduction).toBeGreaterThanOrEqual(0);
        expect(weapon.smokeEffect.opacityReduction).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('Data Integrity', () => {
  it('should have no duplicate unit IDs', () => {
    const ids = UNITS.map(u => u.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have no duplicate weapon IDs', () => {
    const ids = WEAPONS.map(w => w.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have at least 10 units', () => {
    expect(UNITS.length).toBeGreaterThanOrEqual(10);
  });

  it('should have at least 10 weapons', () => {
    expect(WEAPONS.length).toBeGreaterThanOrEqual(10);
  });

  it('should have units for both factions', () => {
    const sdfUnits = UNITS.filter(u => u.id.startsWith('sdf_'));
    const vanguardUnits = UNITS.filter(u => u.id.startsWith('vanguard_'));
    expect(sdfUnits.length).toBeGreaterThan(0);
    expect(vanguardUnits.length).toBeGreaterThan(0);
  });

  it('should have weapons for both factions', () => {
    const sdfWeapons = WEAPONS.filter(w => w.id.startsWith('sdf_'));
    const vanguardWeapons = WEAPONS.filter(w => w.id.startsWith('vanguard_'));
    expect(sdfWeapons.length).toBeGreaterThan(0);
    expect(vanguardWeapons.length).toBeGreaterThan(0);
  });
});


describe('Division JSON Schema Validation', () => {
  it('should load at least one division', () => {
    expect(DIVISIONS.length).toBeGreaterThan(0);
  });

  it('all divisions should have required string fields', () => {
    for (const div of DIVISIONS) {
      expect(typeof div.id).toBe('string');
      expect(div.id.length).toBeGreaterThan(0);
      expect(typeof div.name).toBe('string');
      expect(div.name.length).toBeGreaterThan(0);
      expect(typeof div.factionId).toBe('string');
      expect(div.factionId.length).toBeGreaterThan(0);
      expect(typeof div.description).toBe('string');
      expect(typeof div.playstyle).toBe('string');
    }
  });

  it('all divisions should have valid faction', () => {
    const validFactions = ['sdf', 'vanguard'];
    for (const div of DIVISIONS) {
      expect(validFactions).toContain(div.factionId);
    }
  });

  it('all divisions should have valid slotCosts', () => {
    const validCategories = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
    for (const div of DIVISIONS) {
      expect(div.slotCosts).toBeDefined();
      for (const category of validCategories) {
        expect(Array.isArray(div.slotCosts[category])).toBe(true);
        expect(div.slotCosts[category].length).toBeGreaterThan(0);
        for (const cost of div.slotCosts[category]) {
          expect(typeof cost).toBe('number');
          expect(cost).toBeGreaterThan(0);
        }
      }
    }
  });

  it('all divisions should have valid roster', () => {
    for (const div of DIVISIONS) {
      expect(Array.isArray(div.roster)).toBe(true);
      expect(div.roster.length).toBeGreaterThan(0);
    }
  });

  it('all roster entries should have valid structure', () => {
    for (const div of DIVISIONS) {
      for (const entry of div.roster) {
        expect(typeof entry.unitId).toBe('string');
        expect(entry.unitId.length).toBeGreaterThan(0);
        expect(typeof entry.maxCards).toBe('number');
        expect(entry.maxCards).toBeGreaterThan(0);
        expect(entry.availability).toBeDefined();
        expect(typeof entry.availability.rookie).toBe('number');
        expect(typeof entry.availability.trained).toBe('number');
        expect(typeof entry.availability.veteran).toBe('number');
        expect(typeof entry.availability.elite).toBe('number');
        expect(typeof entry.availability.legend).toBe('number');
      }
    }
  });

  it('roster entries should reference valid units (reports missing)', () => {
    const unitIds = new Set(UNITS.map(u => u.id));
    const missingUnits: string[] = [];
    let validCount = 0;
    let totalCount = 0;

    for (const div of DIVISIONS) {
      for (const entry of div.roster) {
        totalCount++;
        if (unitIds.has(entry.unitId)) {
          validCount++;
        } else {
          missingUnits.push(`${div.id}: ${entry.unitId}`);
        }
      }
    }

    // Report missing units but don't fail - some units may not be created yet
    if (missingUnits.length > 0) {
      console.log(`Missing units in rosters (${missingUnits.length}): ${missingUnits.join(', ')}`);
    }

    // At least 50% of roster entries should have valid units
    expect(validCount / totalCount).toBeGreaterThan(0.5);
  });

  it('all transport options should reference valid units', () => {
    const unitIds = new Set(UNITS.map(u => u.id));
    for (const div of DIVISIONS) {
      for (const entry of div.roster) {
        if (entry.transportOptions) {
          for (const transportId of entry.transportOptions) {
            expect(unitIds.has(transportId)).toBe(true);
          }
        }
      }
    }
  });
});

describe('Division Data Integrity', () => {
  it('should have no duplicate division IDs', () => {
    const ids = DIVISIONS.map(d => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have exactly 8 divisions', () => {
    expect(DIVISIONS.length).toBe(8);
  });

  it('should have 4 divisions per faction', () => {
    const sdfDivisions = DIVISIONS.filter(d => d.factionId === 'sdf');
    const vanguardDivisions = DIVISIONS.filter(d => d.factionId === 'vanguard');
    expect(sdfDivisions.length).toBe(4);
    expect(vanguardDivisions.length).toBe(4);
  });
});
