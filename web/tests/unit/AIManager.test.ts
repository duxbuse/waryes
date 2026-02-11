/**
 * Tests for AIManager composition analysis
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { AIManager } from '../../src/game/managers/AIManager';
import type { Game } from '../../src/core/Game';
import type { Unit } from '../../src/game/units/Unit';
import type { UnitData, WeaponData } from '../../src/data/types';
import { setGameSeed, getGameRNGState } from '../../src/game/utils/DeterministicRNG';

// Mock the factions module so AIManager's imported getWeaponById uses our test weapons
vi.mock('../../src/data/factions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/data/factions')>();
  return {
    ...original,
    getWeaponById: (id: string) => {
      const weapons: Record<string, WeaponData> = {
        'test_rifle': { id: 'test_rifle', name: 'Test Rifle', damage: 25, rateOfFire: 60, range: 50, accuracy: 0.7, penetration: 2, suppression: 5, isAntiAir: false, canTargetGround: true },
        'test_at': { id: 'test_at', name: 'Test AT Weapon', damage: 80, rateOfFire: 10, range: 100, accuracy: 0.8, penetration: 15, suppression: 10, isAntiAir: false, canTargetGround: true },
        'test_aa': { id: 'test_aa', name: 'Test AA Weapon', damage: 40, rateOfFire: 120, range: 150, accuracy: 0.6, penetration: 3, suppression: 2, isAntiAir: true, canTargetGround: false },
      };
      return weapons[id] ?? original.getWeaponById(id);
    },
  };
});

// Mock weapon data
const mockWeapon: WeaponData = {
  id: 'test_rifle',
  name: 'Test Rifle',
  damage: 25,
  rateOfFire: 60,
  range: 50,
  accuracy: 0.7,
  penetration: 2,
  suppression: 5,
  isAntiAir: false,
  canTargetGround: true,
};

const mockATWeapon: WeaponData = {
  id: 'test_at',
  name: 'Test AT Weapon',
  damage: 80,
  rateOfFire: 10,
  range: 100,
  accuracy: 0.8,
  penetration: 15,
  suppression: 10,
  isAntiAir: false,
  canTargetGround: true,
};

const mockAAWeapon: WeaponData = {
  id: 'test_aa',
  name: 'Test AA Weapon',
  damage: 40,
  rateOfFire: 120,
  range: 150,
  accuracy: 0.6,
  penetration: 3,
  suppression: 2,
  isAntiAir: true,
  canTargetGround: false,
};

// Mock unit data
const createMockUnitData = (category: string): UnitData => ({
  id: `test_${category}`,
  name: `Test ${category}`,
  cost: 100,
  category: category as any,
  tags: [],
  health: 100,
  speed: {
    road: 10,
    offRoad: 8,
    rotation: 3,
  },
  armor: {
    front: 2,
    side: 1,
    rear: 1,
    top: 1,
  },
  optics: 'Normal',
  stealth: 'None',
  isCommander: false,
  commanderAuraRadius: 0,
  transportCapacity: 0,
  canBeTransported: false,
  transportSize: 1,
  weapons: [
    {
      weaponId: category === 'TNK' ? 'test_at' : category === 'AA' ? 'test_aa' : 'test_rifle',
      count: 1,
      turretMounted: false,
      maxAmmo: 100,
    },
  ],
  veterancyBonus: 0,
});

// Mock unit
const createMockUnit = (category: string, health: number = 100, maxHealth: number = 100): Unit => {
  const unitData = createMockUnitData(category);
  return {
    id: `unit_${category}_${Math.random()}`,
    health,
    maxHealth,
    unitData,
    category: unitData.category,
    getWeapons: () => unitData.weapons,
    position: new THREE.Vector3(0, 0, 0),
    team: 'player',
  } as unknown as Unit;
};

// Mock game
const mockGame = {
  unitManager: {
    getAllUnits: vi.fn().mockReturnValue([]),
  },
  getWeaponById: vi.fn((id: string) => {
    if (id === 'test_rifle') return mockWeapon;
    if (id === 'test_at') return mockATWeapon;
    if (id === 'test_aa') return mockAAWeapon;
    return null;
  }),
} as unknown as Game;

describe('AIManager - Group Composition Analysis', () => {
  let aiManager: AIManager;

  beforeEach(() => {
    vi.clearAllMocks();
    aiManager = new AIManager(mockGame);
    aiManager.initialize();
  });

  describe('analyzeGroupComposition', () => {
    it('should return empty composition for empty group', () => {
      const composition = aiManager.analyzeGroupComposition([]);

      expect(composition.totalUnits).toBe(0);
      expect(composition.totalStrength).toBe(0);
      expect(composition.averageHealth).toBe(0);
      expect(composition.hasLogistics).toBe(false);
      expect(composition.canCapture).toBe(false);
      expect(composition.isBalanced).toBe(false);
    });

    it('should count units by category', () => {
      const units = [
        createMockUnit('INF'),
        createMockUnit('INF'),
        createMockUnit('TNK'),
        createMockUnit('LOG'),
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      expect(composition.totalUnits).toBe(4);
      expect(composition.categoryCounts['INF']).toBe(2);
      expect(composition.categoryCounts['TNK']).toBe(1);
      expect(composition.categoryCounts['LOG']).toBe(1);
    });

    it('should detect logistics units', () => {
      const units = [
        createMockUnit('INF'),
        createMockUnit('LOG'),
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      expect(composition.hasLogistics).toBe(true);
      expect(composition.canCapture).toBe(true);
    });

    it('should detect various unit types', () => {
      const units = [
        createMockUnit('INF'),
        createMockUnit('TNK'),
        createMockUnit('REC'),
        createMockUnit('AA'),
        createMockUnit('ART'),
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      expect(composition.hasInfantry).toBe(true);
      expect(composition.hasArmor).toBe(true);
      expect(composition.hasRecon).toBe(true);
      expect(composition.hasAA).toBe(true);
      expect(composition.hasArtillery).toBe(true);
    });

    it('should detect air units', () => {
      const unitsHeli = [createMockUnit('HEL')];
      const unitsAir = [createMockUnit('AIR')];

      const compositionHeli = aiManager.analyzeGroupComposition(unitsHeli);
      const compositionAir = aiManager.analyzeGroupComposition(unitsAir);

      expect(compositionHeli.hasAir).toBe(true);
      expect(compositionAir.hasAir).toBe(true);
    });

    it('should calculate average health correctly', () => {
      const units = [
        createMockUnit('INF', 100, 100), // 100% health
        createMockUnit('TNK', 50, 100),  // 50% health
        createMockUnit('REC', 75, 100),  // 75% health
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      // Average: (1.0 + 0.5 + 0.75) / 3 = 0.75
      expect(composition.averageHealth).toBeCloseTo(0.75, 2);
      expect(composition.totalStrength).toBe(225);
    });

    it('should detect balanced groups (3+ unit types)', () => {
      const balancedUnits = [
        createMockUnit('INF'),
        createMockUnit('TNK'),
        createMockUnit('AA'),
      ];

      const unbalancedUnits = [
        createMockUnit('INF'),
        createMockUnit('INF'),
      ];

      const balancedComp = aiManager.analyzeGroupComposition(balancedUnits);
      const unbalancedComp = aiManager.analyzeGroupComposition(unbalancedUnits);

      expect(balancedComp.isBalanced).toBe(true);
      expect(unbalancedComp.isBalanced).toBe(false);
    });

    it('should calculate max weapon range', () => {
      const units = [
        createMockUnit('INF'),  // rifle: range 50
        createMockUnit('AA'),   // AA: range 150
        createMockUnit('TNK'),  // AT: range 100
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      expect(composition.maxWeaponRange).toBe(150);
    });

    it('should calculate anti-armor capability', () => {
      const units = [
        createMockUnit('TNK'), // AT weapon: penetration 15
        createMockUnit('TNK'),
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      // Each TNK has 1 AT weapon with penetration 15
      expect(composition.antiArmorCapability).toBe(30);
    });

    it('should calculate anti-infantry capability', () => {
      const units = [
        createMockUnit('INF'), // Rifle: damage 25, penetration 2
        createMockUnit('INF'),
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      // Each INF has rifle with damage 25, low penetration
      expect(composition.antiInfantryCapability).toBe(50);
    });

    it('should ignore dead units', () => {
      const units = [
        createMockUnit('INF', 100, 100),
        createMockUnit('TNK', 0, 100), // Dead
        createMockUnit('AA', 50, 100),
      ];

      const composition = aiManager.analyzeGroupComposition(units);

      expect(composition.totalUnits).toBe(2); // Only living units
      expect(composition.categoryCounts['TNK']).toBeUndefined();
    });

    it('should handle units with multiple weapons', () => {
      const multiWeaponUnit = createMockUnit('TNK');
      multiWeaponUnit.unitData.weapons = [
        { weaponId: 'test_at', count: 1, turretMounted: true, maxAmmo: 50 },
        { weaponId: 'test_rifle', count: 2, turretMounted: false, maxAmmo: 200 },
      ];

      const composition = aiManager.analyzeGroupComposition([multiWeaponUnit]);

      expect(composition.maxWeaponRange).toBe(100); // AT weapon range
      expect(composition.antiArmorCapability).toBeGreaterThan(0);
      expect(composition.antiInfantryCapability).toBeGreaterThan(0);
    });
  });

  describe('Deterministic Behavior', () => {
    it('should produce identical decisions with the same random seed', () => {
      // Setup: Create multiple enemy units for AI to choose from
      const enemies = [
        createMockUnit('INF'),
        createMockUnit('TNK'),
        createMockUnit('REC'),
        createMockUnit('AA'),
        createMockUnit('ART'),
      ];

      // Position them at different locations
      enemies[0]!.position.set(10, 0, 10);
      enemies[1]!.position.set(20, 0, 20);
      enemies[2]!.position.set(30, 0, 30);
      enemies[3]!.position.set(40, 0, 40);
      enemies[4]!.position.set(50, 0, 50);

      const aiUnit = createMockUnit('INF');
      aiUnit.team = 'enemy';
      aiUnit.position.set(0, 0, 0);

      // Mock unit manager to return these units
      const mockUnitManager = {
        getAllUnits: vi.fn().mockReturnValue([aiUnit, ...enemies]),
        getUnitsInRadius: vi.fn((pos: THREE.Vector3, radius: number, team?: number) => {
          // Return enemies within radius
          return enemies.filter(e => e.position.distanceTo(pos) <= radius);
        }),
      };

      const testGame = {
        ...mockGame,
        unitManager: mockUnitManager,
        fogOfWarManager: null,
        economyManager: {
          getCaptureZones: vi.fn().mockReturnValue([]),
        },
        getElevationAt: vi.fn().mockReturnValue(0),
        currentMap: null,
      } as unknown as Game;

      // Create AI manager with easy difficulty (uses random decision making)
      const testAI = new AIManager(testGame);
      testAI.initialize('easy');

      // Test 1: Run with seed 12345
      setGameSeed(12345);
      const stateAfterFirstRun = getGameRNGState();
      const decisions1: string[] = [];

      // Simulate AI making decisions for 5 iterations
      for (let i = 0; i < 5; i++) {
        // Get the private method using type assertion
        const aiManagerAny = testAI as any;
        const target = aiManagerAny.selectBestTarget(aiUnit, 100);
        decisions1.push(target ? target.id : 'none');
      }

      // Test 2: Reset seed and run again
      setGameSeed(12345);
      const stateAfterSecondSeed = getGameRNGState();
      const decisions2: string[] = [];

      // Same iterations
      for (let i = 0; i < 5; i++) {
        const aiManagerAny = testAI as any;
        const target = aiManagerAny.selectBestTarget(aiUnit, 100);
        decisions2.push(target ? target.id : 'none');
      }

      // Verify: Same seed should produce identical RNG state
      expect(stateAfterFirstRun).toBe(stateAfterSecondSeed);

      // Verify: Same seed should produce identical decisions
      expect(decisions1).toEqual(decisions2);
      expect(decisions1.length).toBe(5);
      expect(decisions2.length).toBe(5);

      // Additional verification: Different seed should produce different results
      setGameSeed(99999);
      const decisions3: string[] = [];

      for (let i = 0; i < 5; i++) {
        const aiManagerAny = testAI as any;
        const target = aiManagerAny.selectBestTarget(aiUnit, 100);
        decisions3.push(target ? target.id : 'none');
      }

      // With easy AI (30% random mistakes), different seed should produce different results
      // Note: There's a small chance this could be the same, but statistically unlikely
      const isDifferent = decisions3.some((decision, i) => decision !== decisions1[i]);
      expect(isDifferent).toBe(true);
    });

    it('should use gameRNG for random decisions', () => {
      // This test verifies that AI uses gameRNG, not Math.random()
      // We can verify this by checking that RNG state changes after AI decisions

      const enemy1 = createMockUnit('INF');
      enemy1.position.set(10, 0, 10);

      const enemy2 = createMockUnit('INF');
      enemy2.position.set(15, 0, 15);

      const aiUnit = createMockUnit('INF');
      aiUnit.team = 'enemy';
      aiUnit.position.set(0, 0, 0);

      const mockUnitManager = {
        getAllUnits: vi.fn().mockReturnValue([aiUnit, enemy1, enemy2]),
        getUnitsInRadius: vi.fn(() => [enemy1, enemy2]),
      };

      const testGame = {
        ...mockGame,
        unitManager: mockUnitManager,
        fogOfWarManager: null,
        economyManager: {
          getCaptureZones: vi.fn().mockReturnValue([]),
        },
      } as unknown as Game;

      const testAI = new AIManager(testGame);
      testAI.initialize('easy');

      // Set seed and record initial state
      setGameSeed(54321);
      const initialState = getGameRNGState();

      // Make AI decision (on easy difficulty, has 30% chance to make random choice)
      const aiManagerAny = testAI as any;

      // Call multiple times to ensure RNG is used
      for (let i = 0; i < 10; i++) {
        aiManagerAny.selectBestTarget(aiUnit, 100);
      }

      // RNG state should have changed (proving gameRNG was used)
      const finalState = getGameRNGState();
      expect(finalState).not.toBe(initialState);
    });
  });
});
