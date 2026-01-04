/**
 * JSON Data Validation Tests
 * Ensures all unit and weapon JSON files follow the expected schema
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { UnitData, WeaponData, UnitCategory, OpticsRating, StealthRating } from '../../src/data/types';

// Valid enum values
const VALID_CATEGORIES: UnitCategory[] = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
const VALID_OPTICS: OpticsRating[] = ['Poor', 'Normal', 'Good', 'Very Good', 'Exceptional'];
const VALID_STEALTH: StealthRating[] = ['None', 'Poor', 'Medium', 'Good', 'Exceptional'];

// Get directory path (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load JSON files directly for testing (bypassing Vite's import.meta.glob)
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
const dataDir = path.resolve(__dirname, '../../src/data');
const unitsDir = path.join(dataDir, 'units');
const weaponsDir = path.join(dataDir, 'weapons');

let UNITS: UnitData[] = [];
let WEAPONS: WeaponData[] = [];

beforeAll(() => {
  UNITS = loadJsonFiles<UnitData>(unitsDir);
  WEAPONS = loadJsonFiles<WeaponData>(weaponsDir);
});

function getUnitById(id: string): UnitData | undefined {
  return UNITS.find(u => u.id === id);
}

function getWeaponById(id: string): WeaponData | undefined {
  return WEAPONS.find(w => w.id === id);
}

describe('Unit JSON Schema Validation', () => {
  it('should load at least one unit', () => {
    expect(UNITS.length).toBeGreaterThan(0);
  });

  it('all units should have required string fields', () => {
    for (const unit of UNITS) {
      expect(typeof unit.id, `Unit missing id`).toBe('string');
      expect(unit.id.length, `Unit has empty id`).toBeGreaterThan(0);

      expect(typeof unit.name, `Unit ${unit.id} missing name`).toBe('string');
      expect(unit.name.length, `Unit ${unit.id} has empty name`).toBeGreaterThan(0);
    }
  });

  it('all units should have valid cost', () => {
    for (const unit of UNITS) {
      expect(typeof unit.cost, `Unit ${unit.id} cost is not a number`).toBe('number');
      expect(unit.cost, `Unit ${unit.id} has negative cost`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid health', () => {
    for (const unit of UNITS) {
      expect(typeof unit.health, `Unit ${unit.id} health is not a number`).toBe('number');
      expect(unit.health, `Unit ${unit.id} has non-positive health`).toBeGreaterThan(0);
    }
  });

  it('all units should have valid category', () => {
    for (const unit of UNITS) {
      expect(VALID_CATEGORIES, `Unit ${unit.id} has invalid category: ${unit.category}`).toContain(unit.category);
    }
  });

  it('all units should have valid optics rating', () => {
    for (const unit of UNITS) {
      expect(VALID_OPTICS, `Unit ${unit.id} has invalid optics: ${unit.optics}`).toContain(unit.optics);
    }
  });

  it('all units should have valid stealth rating', () => {
    for (const unit of UNITS) {
      expect(VALID_STEALTH, `Unit ${unit.id} has invalid stealth: ${unit.stealth}`).toContain(unit.stealth);
    }
  });

  it('all units should have valid speed object', () => {
    for (const unit of UNITS) {
      expect(unit.speed, `Unit ${unit.id} missing speed`).toBeDefined();
      expect(typeof unit.speed.road, `Unit ${unit.id} speed.road is not a number`).toBe('number');
      expect(typeof unit.speed.offRoad, `Unit ${unit.id} speed.offRoad is not a number`).toBe('number');
      expect(typeof unit.speed.rotation, `Unit ${unit.id} speed.rotation is not a number`).toBe('number');
      expect(unit.speed.road, `Unit ${unit.id} has negative road speed`).toBeGreaterThanOrEqual(0);
      expect(unit.speed.offRoad, `Unit ${unit.id} has negative offRoad speed`).toBeGreaterThanOrEqual(0);
      expect(unit.speed.rotation, `Unit ${unit.id} has negative rotation speed`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid armor object', () => {
    for (const unit of UNITS) {
      expect(unit.armor, `Unit ${unit.id} missing armor`).toBeDefined();
      expect(typeof unit.armor.front, `Unit ${unit.id} armor.front is not a number`).toBe('number');
      expect(typeof unit.armor.side, `Unit ${unit.id} armor.side is not a number`).toBe('number');
      expect(typeof unit.armor.rear, `Unit ${unit.id} armor.rear is not a number`).toBe('number');
      expect(typeof unit.armor.top, `Unit ${unit.id} armor.top is not a number`).toBe('number');
      expect(unit.armor.front, `Unit ${unit.id} has negative front armor`).toBeGreaterThanOrEqual(0);
      expect(unit.armor.side, `Unit ${unit.id} has negative side armor`).toBeGreaterThanOrEqual(0);
      expect(unit.armor.rear, `Unit ${unit.id} has negative rear armor`).toBeGreaterThanOrEqual(0);
      expect(unit.armor.top, `Unit ${unit.id} has negative top armor`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid boolean fields', () => {
    for (const unit of UNITS) {
      expect(typeof unit.isCommander, `Unit ${unit.id} isCommander is not a boolean`).toBe('boolean');
      expect(typeof unit.canBeTransported, `Unit ${unit.id} canBeTransported is not a boolean`).toBe('boolean');
    }
  });

  it('all units should have valid numeric fields', () => {
    for (const unit of UNITS) {
      expect(typeof unit.commanderAuraRadius, `Unit ${unit.id} commanderAuraRadius is not a number`).toBe('number');
      expect(unit.commanderAuraRadius, `Unit ${unit.id} has negative commanderAuraRadius`).toBeGreaterThanOrEqual(0);

      expect(typeof unit.transportCapacity, `Unit ${unit.id} transportCapacity is not a number`).toBe('number');
      expect(unit.transportCapacity, `Unit ${unit.id} has negative transportCapacity`).toBeGreaterThanOrEqual(0);

      expect(typeof unit.transportSize, `Unit ${unit.id} transportSize is not a number`).toBe('number');
      expect(unit.transportSize, `Unit ${unit.id} has negative transportSize`).toBeGreaterThanOrEqual(0);

      expect(typeof unit.veterancyBonus, `Unit ${unit.id} veterancyBonus is not a number`).toBe('number');
      expect(unit.veterancyBonus, `Unit ${unit.id} has negative veterancyBonus`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all units should have valid tags array', () => {
    for (const unit of UNITS) {
      expect(Array.isArray(unit.tags), `Unit ${unit.id} tags is not an array`).toBe(true);
      for (const tag of unit.tags) {
        expect(typeof tag, `Unit ${unit.id} has non-string tag`).toBe('string');
      }
    }
  });

  it('all units should have valid weapons array', () => {
    for (const unit of UNITS) {
      expect(Array.isArray(unit.weapons), `Unit ${unit.id} weapons is not an array`).toBe(true);

      for (const weapon of unit.weapons) {
        expect(typeof weapon.weaponId, `Unit ${unit.id} has weapon with non-string weaponId`).toBe('string');
        expect(weapon.weaponId.length, `Unit ${unit.id} has weapon with empty weaponId`).toBeGreaterThan(0);

        expect(typeof weapon.count, `Unit ${unit.id} has weapon with non-number count`).toBe('number');
        expect(weapon.count, `Unit ${unit.id} has weapon with non-positive count`).toBeGreaterThan(0);

        expect(typeof weapon.maxAmmo, `Unit ${unit.id} has weapon with non-number maxAmmo`).toBe('number');
        expect(weapon.maxAmmo, `Unit ${unit.id} has weapon with negative maxAmmo`).toBeGreaterThanOrEqual(0);

        expect(typeof weapon.turretMounted, `Unit ${unit.id} has weapon with non-boolean turretMounted`).toBe('boolean');
      }
    }
  });

  it('all units should reference valid weapons', () => {
    const weaponIds = new Set(WEAPONS.map(w => w.id));

    for (const unit of UNITS) {
      for (const weaponSlot of unit.weapons) {
        expect(
          weaponIds.has(weaponSlot.weaponId),
          `Unit ${unit.id} references unknown weapon: ${weaponSlot.weaponId}`
        ).toBe(true);
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
      expect(typeof weapon.id, `Weapon missing id`).toBe('string');
      expect(weapon.id.length, `Weapon has empty id`).toBeGreaterThan(0);

      expect(typeof weapon.name, `Weapon ${weapon.id} missing name`).toBe('string');
      expect(weapon.name.length, `Weapon ${weapon.id} has empty name`).toBeGreaterThan(0);
    }
  });

  it('all weapons should have valid damage', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.damage, `Weapon ${weapon.id} damage is not a number`).toBe('number');
      expect(weapon.damage, `Weapon ${weapon.id} has negative damage`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid rateOfFire', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.rateOfFire, `Weapon ${weapon.id} rateOfFire is not a number`).toBe('number');
      expect(weapon.rateOfFire, `Weapon ${weapon.id} has negative rateOfFire`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid range', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.range, `Weapon ${weapon.id} range is not a number`).toBe('number');
      expect(weapon.range, `Weapon ${weapon.id} has negative range`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid accuracy (0-1)', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.accuracy, `Weapon ${weapon.id} accuracy is not a number`).toBe('number');
      expect(weapon.accuracy, `Weapon ${weapon.id} has negative accuracy`).toBeGreaterThanOrEqual(0);
      expect(weapon.accuracy, `Weapon ${weapon.id} has accuracy > 1`).toBeLessThanOrEqual(1);
    }
  });

  it('all weapons should have valid penetration', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.penetration, `Weapon ${weapon.id} penetration is not a number`).toBe('number');
      expect(weapon.penetration, `Weapon ${weapon.id} has negative penetration`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid suppression', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.suppression, `Weapon ${weapon.id} suppression is not a number`).toBe('number');
      expect(weapon.suppression, `Weapon ${weapon.id} has negative suppression`).toBeGreaterThanOrEqual(0);
    }
  });

  it('all weapons should have valid boolean fields', () => {
    for (const weapon of WEAPONS) {
      expect(typeof weapon.isAntiAir, `Weapon ${weapon.id} isAntiAir is not a boolean`).toBe('boolean');
      expect(typeof weapon.canTargetGround, `Weapon ${weapon.id} canTargetGround is not a boolean`).toBe('boolean');
    }
  });

  it('all weapons with smoke effect should have valid properties', () => {
    for (const weapon of WEAPONS) {
      if (weapon.smokeEffect) {
        expect(typeof weapon.smokeEffect.radius, `Weapon ${weapon.id} smokeEffect.radius is not a number`).toBe('number');
        expect(weapon.smokeEffect.radius, `Weapon ${weapon.id} has non-positive smoke radius`).toBeGreaterThan(0);

        expect(typeof weapon.smokeEffect.duration, `Weapon ${weapon.id} smokeEffect.duration is not a number`).toBe('number');
        expect(weapon.smokeEffect.duration, `Weapon ${weapon.id} has non-positive smoke duration`).toBeGreaterThan(0);

        expect(typeof weapon.smokeEffect.opacityReduction, `Weapon ${weapon.id} smokeEffect.opacityReduction is not a number`).toBe('number');
        expect(weapon.smokeEffect.opacityReduction, `Weapon ${weapon.id} has negative opacityReduction`).toBeGreaterThanOrEqual(0);
        expect(weapon.smokeEffect.opacityReduction, `Weapon ${weapon.id} has opacityReduction > 1`).toBeLessThanOrEqual(1);
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

    expect(sdfUnits.length, 'No SDF units found').toBeGreaterThan(0);
    expect(vanguardUnits.length, 'No Vanguard units found').toBeGreaterThan(0);
  });

  it('should have weapons for both factions', () => {
    const sdfWeapons = WEAPONS.filter(w => w.id.startsWith('sdf_'));
    const vanguardWeapons = WEAPONS.filter(w => w.id.startsWith('vanguard_'));

    expect(sdfWeapons.length, 'No SDF weapons found').toBeGreaterThan(0);
    expect(vanguardWeapons.length, 'No Vanguard weapons found').toBeGreaterThan(0);
  });
});
