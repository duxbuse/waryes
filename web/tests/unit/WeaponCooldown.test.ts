/**
 * Unit tests for per-weapon cooldown and damage tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Unit, type UnitConfig } from '../../src/game/units/Unit';
import type { Game } from '../../src/core/Game';
import type { UnitData, WeaponSlot } from '../../src/data/types';

// Mock the Game class
const mockGame = {
  unitManager: {
    destroyUnit: vi.fn(),
    getAllUnits: vi.fn().mockReturnValue([]),
    getUnitsInRadius: vi.fn().mockReturnValue([]),
  },
  selectionManager: {
    removeFromSelection: vi.fn(),
  },
  scene: {
    add: vi.fn(),
    remove: vi.fn(),
  },
} as unknown as Game;

// Mock weapon data for testing
const mockWeapon1 = {
  id: 'test_weapon_1',
  name: 'Test Weapon 1',
  damage: 50,
  rateOfFire: 60, // 60 rounds per minute = 1 per second = 1s cooldown
  range: 100,
  accuracy: 0.8,
  penetration: 5,
  suppression: 10,
  isAntiAir: false,
  canTargetGround: true,
};

const mockWeapon2 = {
  id: 'test_weapon_2',
  name: 'Test Weapon 2',
  damage: 30,
  rateOfFire: 120, // 120 rounds per minute = 2 per second = 0.5s cooldown
  range: 80,
  accuracy: 0.9,
  penetration: 3,
  suppression: 5,
  isAntiAir: false,
  canTargetGround: true,
};

const mockWeapon3 = {
  id: 'test_weapon_3',
  name: 'Test Weapon 3 (AA)',
  damage: 40,
  rateOfFire: 30, // 30 rounds per minute = 0.5 per second = 2s cooldown
  range: 150,
  accuracy: 0.7,
  penetration: 4,
  suppression: 8,
  isAntiAir: true,
  canTargetGround: false,
};

// Mock getWeaponById to return our test weapons
vi.mock('../../src/data/factions', () => ({
  getUnitById: vi.fn((id: string) => {
    if (id === 'test_unit_multi_weapon') {
      return {
        id: 'test_unit_multi_weapon',
        name: 'Test Multi-Weapon Unit',
        category: 'TNK',
        primaryWeapon: 'test_weapon_1',
        secondaryWeapon: 'test_weapon_2',
        aaWeapon: 'test_weapon_3',
      } as UnitData;
    }
    return undefined;
  }),
  getWeaponById: vi.fn((id: string) => {
    if (id === 'test_weapon_1') return mockWeapon1;
    if (id === 'test_weapon_2') return mockWeapon2;
    if (id === 'test_weapon_3') return mockWeapon3;
    return undefined;
  }),
}));

const createTestUnitWithWeapons = (weapons: WeaponSlot[]): Unit => {
  const unitData: UnitData = {
    id: 'test_unit_multi_weapon',
    name: 'Test Multi-Weapon Unit',
    category: 'TNK',
    cost: 100,
    tags: [],
    health: 100,
    speed: { road: 5, offRoad: 4, rotation: 3 },
    armor: { front: 10, side: 5, rear: 3, top: 2 },
    optics: 'Good',
    stealth: 'Normal',
    isCommander: false,
    commanderAuraRadius: 0,
    transportCapacity: 0,
    canBeTransported: false,
    transportSize: 1,
    weapons: weapons,
    veterancyBonus: 0,
  };

  const config: UnitConfig = {
    id: 'test_unit_1',
    name: 'Test Unit',
    unitType: 'tank',
    team: 'player',
    position: new THREE.Vector3(0, 0, 0),
    maxHealth: 100,
    speed: 5,
    rotationSpeed: 3,
    unitData: unitData,
  };

  return new Unit(config, mockGame);
};

describe('Weapon Cooldown System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize weapon cooldowns to 0', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      expect(unit.getWeaponCooldown(0)).toBe(0);
    });

    it('should initialize multiple weapon cooldowns to 0', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_3', count: 1, maxAmmo: 100 },
      ]);

      expect(unit.getWeaponCooldown(0)).toBe(0);
      expect(unit.getWeaponCooldown(1)).toBe(0);
      expect(unit.getWeaponCooldown(2)).toBe(0);
    });

    it('should return 0 for invalid weapon index', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      expect(unit.getWeaponCooldown(5)).toBe(0);
      expect(unit.getWeaponCooldown(-1)).toBe(0);
    });
  });

  describe('resetWeaponCooldown', () => {
    it('should calculate cooldown from weapon rate of fire (60 rpm = 1s cooldown)', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_1');
      // 60 rounds per minute = 1 round per second = 1 second cooldown
      expect(unit.getWeaponCooldown(0)).toBe(1);
    });

    it('should calculate cooldown from weapon rate of fire (120 rpm = 0.5s cooldown)', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_2');
      // 120 rounds per minute = 2 rounds per second = 0.5 second cooldown
      expect(unit.getWeaponCooldown(0)).toBe(0.5);
    });

    it('should calculate cooldown from weapon rate of fire (30 rpm = 2s cooldown)', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_3', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_3');
      // 30 rounds per minute = 0.5 rounds per second = 2 second cooldown
      expect(unit.getWeaponCooldown(0)).toBe(2);
    });

    it('should set cooldown independently for each weapon', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_3', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_1');
      unit.resetWeaponCooldown(1, 'test_weapon_2');
      unit.resetWeaponCooldown(2, 'test_weapon_3');

      expect(unit.getWeaponCooldown(0)).toBe(1); // 60 rpm = 1s
      expect(unit.getWeaponCooldown(1)).toBe(0.5); // 120 rpm = 0.5s
      expect(unit.getWeaponCooldown(2)).toBe(2); // 30 rpm = 2s
    });
  });

  describe('canWeaponFire', () => {
    it('should return true when weapon cooldown is 0', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      expect(unit.canWeaponFire(0)).toBe(true);
    });

    it('should return false when weapon is on cooldown', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_1');
      expect(unit.canWeaponFire(0)).toBe(false);
    });

    it('should check cooldown independently for each weapon', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
      ]);

      // Set only first weapon on cooldown
      unit.resetWeaponCooldown(0, 'test_weapon_1');

      expect(unit.canWeaponFire(0)).toBe(false); // On cooldown
      expect(unit.canWeaponFire(1)).toBe(true); // Ready to fire
    });
  });

  describe('cooldown decrement over time', () => {
    it('should decrement cooldown during fixedUpdate', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.setFrozen(false);
      unit.resetWeaponCooldown(0, 'test_weapon_1');
      expect(unit.getWeaponCooldown(0)).toBe(1);

      // Update for 0.5 seconds
      unit.fixedUpdate(0.5);
      expect(unit.getWeaponCooldown(0)).toBeCloseTo(0.5, 5);
    });

    it('should decrement cooldown to exactly 0', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.setFrozen(false);
      unit.resetWeaponCooldown(0, 'test_weapon_1');
      expect(unit.getWeaponCooldown(0)).toBe(1);

      // Update for full cooldown duration
      unit.fixedUpdate(1.0);
      expect(unit.getWeaponCooldown(0)).toBeCloseTo(0, 5);
      expect(unit.canWeaponFire(0)).toBe(true);
    });

    it('should not go below 0 cooldown', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.setFrozen(false);
      unit.resetWeaponCooldown(0, 'test_weapon_1');
      expect(unit.getWeaponCooldown(0)).toBe(1);

      // Update beyond cooldown duration
      unit.fixedUpdate(2.0);
      expect(unit.getWeaponCooldown(0)).toBeLessThanOrEqual(0);
    });

    it('should decrement all weapon cooldowns independently', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_3', count: 1, maxAmmo: 100 },
      ]);

      unit.setFrozen(false);
      unit.resetWeaponCooldown(0, 'test_weapon_1'); // 1s cooldown
      unit.resetWeaponCooldown(1, 'test_weapon_2'); // 0.5s cooldown
      unit.resetWeaponCooldown(2, 'test_weapon_3'); // 2s cooldown

      // Update for 0.5 seconds
      unit.fixedUpdate(0.5);

      expect(unit.getWeaponCooldown(0)).toBeCloseTo(0.5, 5);
      expect(unit.getWeaponCooldown(1)).toBeCloseTo(0, 5);
      expect(unit.getWeaponCooldown(2)).toBeCloseTo(1.5, 5);
    });

    it('should not decrement cooldown when frozen', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.setFrozen(true);
      unit.resetWeaponCooldown(0, 'test_weapon_1');
      const initialCooldown = unit.getWeaponCooldown(0);

      unit.fixedUpdate(1.0);
      expect(unit.getWeaponCooldown(0)).toBe(initialCooldown);
    });
  });

  describe('canFire (any weapon)', () => {
    it('should return true when any weapon can fire', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_1'); // On cooldown
      // weapon 2 ready to fire

      expect(unit.canFire()).toBe(true);
    });

    it('should return false when all weapons are on cooldown', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_1');
      unit.resetWeaponCooldown(1, 'test_weapon_2');

      expect(unit.canFire()).toBe(false);
    });
  });

  describe('weapon damage tracking', () => {
    it('should initialize damage tracking to 0', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      expect(unit.getWeaponDamageDealt(0)).toBe(0);
    });

    it('should track damage dealt by weapon', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.addWeaponDamage(0, 50);
      expect(unit.getWeaponDamageDealt(0)).toBe(50);
    });

    it('should accumulate damage over multiple hits', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.addWeaponDamage(0, 30);
      unit.addWeaponDamage(0, 20);
      unit.addWeaponDamage(0, 15);
      expect(unit.getWeaponDamageDealt(0)).toBe(65);
    });

    it('should track damage independently for each weapon', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_3', count: 1, maxAmmo: 100 },
      ]);

      unit.addWeaponDamage(0, 100);
      unit.addWeaponDamage(1, 50);
      unit.addWeaponDamage(2, 75);

      expect(unit.getWeaponDamageDealt(0)).toBe(100);
      expect(unit.getWeaponDamageDealt(1)).toBe(50);
      expect(unit.getWeaponDamageDealt(2)).toBe(75);
    });

    it('should return 0 for invalid weapon index', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      expect(unit.getWeaponDamageDealt(5)).toBe(0);
      expect(unit.getWeaponDamageDealt(-1)).toBe(0);
    });

    it('should handle adding damage to invalid weapon index gracefully', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      // Should not throw error
      unit.addWeaponDamage(5, 50);
      unit.addWeaponDamage(-1, 50);

      // Valid weapon should still work
      expect(unit.getWeaponDamageDealt(0)).toBe(0);
    });
  });

  describe('resupply', () => {
    it('should reset all weapon cooldowns to 0', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_1');
      unit.resetWeaponCooldown(1, 'test_weapon_2');

      unit.resupplyAllWeapons();

      expect(unit.getWeaponCooldown(0)).toBe(0);
      expect(unit.getWeaponCooldown(1)).toBe(0);
    });

    it('should make all weapons ready to fire after resupply', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
      ]);

      unit.resetWeaponCooldown(0, 'test_weapon_1');
      unit.resetWeaponCooldown(1, 'test_weapon_2');

      unit.resupplyAllWeapons();

      expect(unit.canWeaponFire(0)).toBe(true);
      expect(unit.canWeaponFire(1)).toBe(true);
      expect(unit.canFire()).toBe(true);
    });

    it('should not reset damage tracking', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.addWeaponDamage(0, 100);
      unit.resupplyAllWeapons();

      // Damage should persist through resupply
      expect(unit.getWeaponDamageDealt(0)).toBe(100);
    });
  });

  describe('integration tests', () => {
    it('should handle complete firing cycle for single weapon', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
      ]);

      unit.setFrozen(false);

      // Initial state - weapon ready
      expect(unit.canWeaponFire(0)).toBe(true);

      // Fire weapon
      unit.resetWeaponCooldown(0, 'test_weapon_1');
      unit.addWeaponDamage(0, 50);

      // Weapon on cooldown
      expect(unit.canWeaponFire(0)).toBe(false);
      expect(unit.getWeaponDamageDealt(0)).toBe(50);

      // Cooldown in progress
      unit.fixedUpdate(0.5);
      expect(unit.canWeaponFire(0)).toBe(false);

      // Cooldown complete
      unit.fixedUpdate(0.5);
      expect(unit.canWeaponFire(0)).toBe(true);
      expect(unit.getWeaponDamageDealt(0)).toBe(50); // Damage persists
    });

    it('should handle staggered firing of multiple weapons', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 }, // 1s cooldown
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 }, // 0.5s cooldown
      ]);

      unit.setFrozen(false);

      // Fire both weapons at same time
      unit.resetWeaponCooldown(0, 'test_weapon_1');
      unit.resetWeaponCooldown(1, 'test_weapon_2');

      expect(unit.canWeaponFire(0)).toBe(false);
      expect(unit.canWeaponFire(1)).toBe(false);

      // After 0.5s - weapon 2 ready, weapon 1 still cooling
      unit.fixedUpdate(0.5);
      expect(unit.canWeaponFire(0)).toBe(false);
      expect(unit.canWeaponFire(1)).toBe(true);

      // After another 0.5s - both weapons ready
      unit.fixedUpdate(0.5);
      expect(unit.canWeaponFire(0)).toBe(true);
      expect(unit.canWeaponFire(1)).toBe(true);
    });

    it('should track total damage across all weapons', () => {
      const unit = createTestUnitWithWeapons([
        { weaponId: 'test_weapon_1', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_2', count: 1, maxAmmo: 100 },
        { weaponId: 'test_weapon_3', count: 1, maxAmmo: 100 },
      ]);

      unit.addWeaponDamage(0, 100); // Main gun
      unit.addWeaponDamage(1, 50);  // Machine gun
      unit.addWeaponDamage(2, 75);  // AA gun

      const totalDamage =
        unit.getWeaponDamageDealt(0) +
        unit.getWeaponDamageDealt(1) +
        unit.getWeaponDamageDealt(2);

      expect(totalDamage).toBe(225);
    });
  });
});
