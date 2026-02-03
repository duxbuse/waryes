/**
 * Unit tests for FogOfWarManager elevation bonus system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { FogOfWarManager, VisibilityState } from '../../src/game/managers/FogOfWarManager';
import type { Game } from '../../src/core/Game';
import type { Unit } from '../../src/game/units/Unit';
import type { UnitData } from '../../src/data/types';

// Mock unit data with specific optics rating for predictable vision radius
const createMockUnitData = (optics: 'Poor' | 'Normal' | 'Good' | 'Very Good' | 'Exceptional' = 'Normal'): UnitData => ({
  id: 'test_unit',
  name: 'Test Unit',
  cost: 100,
  category: 'INF',
  tags: [],
  health: 100,
  speed: {
    road: 10,
    offRoad: 5,
    rotation: 3,
  },
  armor: {
    front: 2,
    side: 1,
    rear: 1,
    top: 1,
  },
  optics,
  stealth: 'None',
  isCommander: false,
  commanderAuraRadius: 0,
  transportCapacity: 0,
  canBeTransported: true,
  transportSize: 1,
  weapons: [],
  veterancyBonus: 0,
});

// Mock unit for testing
const createMockUnit = (
  position: THREE.Vector3,
  team: 'player' | 'enemy' = 'player',
  optics: 'Poor' | 'Normal' | 'Good' | 'Very Good' | 'Exceptional' = 'Normal'
): Unit => ({
  id: `unit_${Math.random()}`,
  name: 'Test Unit',
  unitType: 'infantry',
  team,
  position: position.clone(),
  health: 100,
  maxHealth: 100,
  data: createMockUnitData(optics),
  mesh: {
    visible: true,
  },
} as unknown as Unit);

// Mock terrain map with controllable elevation
const createMockMap = (getElevationFn: (x: number, z: number) => number) => {
  const width = 1000;
  const height = 1000;
  const cellSize = 10;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);

  // Create terrain grid
  const terrain: any[][] = [];
  for (let z = 0; z < rows; z++) {
    terrain[z] = [];
    for (let x = 0; x < cols; x++) {
      const worldX = (x * cellSize) - (width / 2);
      const worldZ = (z * cellSize) - (height / 2);
      terrain[z][x] = {
        elevation: getElevationFn(worldX, worldZ),
        type: 'grass',
      };
    }
  }

  return {
    width,
    height,
    cellSize,
    terrain,
    buildings: [],
  };
};

// Mock Game class with necessary managers
const createMockGame = (getElevationFn: (x: number, z: number) => number) => {
  const units: Unit[] = [];

  return {
    currentMap: createMockMap(getElevationFn),
    unitManager: {
      getAllUnits: vi.fn(() => units),
      addUnit: (unit: Unit) => units.push(unit),
    },
    smokeManager: {
      blocksLOS: vi.fn(() => false),
    },
    getElevationAt: vi.fn((x: number, z: number) => getElevationFn(x, z)),
  } as unknown as Game;
};

describe('FogOfWarManager - Elevation Bonus', () => {
  let fogManager: FogOfWarManager;
  let mockGame: Game;

  describe('flat terrain (no elevation bonus)', () => {
    beforeEach(() => {
      // Flat terrain - all elevation = 0
      mockGame = createMockGame(() => 0);
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();
    });

    it('should have base vision radius on flat terrain', () => {
      // Normal optics = 150m vision radius
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Test cell at ~150m distance (should be visible)
      expect(fogManager.isVisible(145, 0)).toBe(true);

      // Test cell at >150m distance (should not be visible)
      expect(fogManager.isVisible(160, 0)).toBe(false);
    });

    it('should have correct base vision for different optics ratings', () => {
      // Poor optics = 100m vision radius
      const poorUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Poor');
      mockGame.unitManager.addUnit(poorUnit);

      fogManager.forceImmediateUpdate();

      // Should see ~100m
      expect(fogManager.isVisible(95, 0)).toBe(true);
      expect(fogManager.isVisible(110, 0)).toBe(false);

      // Clear and test Good optics = 200m vision radius
      (mockGame.unitManager as any).getAllUnits = vi.fn(() => []);
      fogManager.initialize();

      const goodUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Good');
      mockGame.unitManager.addUnit(goodUnit);

      fogManager.forceImmediateUpdate();

      // Should see ~200m
      expect(fogManager.isVisible(195, 0)).toBe(true);
      expect(fogManager.isVisible(210, 0)).toBe(false);
    });
  });

  describe('elevation advantage (high ground bonus)', () => {
    beforeEach(() => {
      // Sloped terrain: positive X = higher elevation
      // Elevation increases by 1m per 10m distance
      mockGame = createMockGame((x: number, z: number) => {
        return x / 10; // 10m horizontal = 1m vertical
      });
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();
    });

    it('should grant vision bonus when unit is at higher elevation', () => {
      // Unit at x=100 has elevation = 10m
      // Base vision radius = 150m (Normal optics)
      const unit = createMockUnit(new THREE.Vector3(100, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Looking toward negative X (lower elevation)
      // At x=-50 (distance 150m from unit), target elevation = -5m
      // Elevation difference = 10 - (-5) = 15m
      // Elevation bonus = 15 * 2.0 = 30m extra range
      // Effective vision = 150 + 30 = 180m
      // So should see further than base 150m in the downhill direction

      // Cell at x=-55 (distance ~155m, elevation -5.5m) should be visible with bonus
      // Distance from (100,0) to (-55,0) = 155m
      // Target elevation at -55 = -5.5m
      // Elevation advantage = 10 - (-5.5) = 15.5m
      // Bonus = 15.5 * 2.0 = 31m
      // Effective range = 150 + 31 = 181m
      // 155m < 181m, so should be visible
      expect(fogManager.isVisible(-55, 0)).toBe(true);

      // Looking toward positive X (higher elevation) - less or no bonus
      // At x=250 (distance 150m), target elevation = 25m (higher than unit)
      // Elevation difference = 10 - 25 = -15m (negative = no bonus, clamped to 0)
      // Effective vision = 150 + 0 = 150m
      // So should only see base range in uphill direction
      expect(fogManager.isVisible(255, 0)).toBe(false);
    });

    it('should not apply negative bonus when unit is at lower elevation', () => {
      // Unit at x=-100 has elevation = -10m (lower)
      // Looking at x=50 (higher elevation = 5m)
      const unit = createMockUnit(new THREE.Vector3(-100, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Distance to x=50 is 150m (exactly at vision edge with no bonus)
      // Elevation difference = -10 - 5 = -15m (negative)
      // Bonus = max(0, -15 * 2.0) = 0 (clamped to 0, no penalty)
      // Effective vision = 150 + 0 = 150m

      // Cell at x=45 (distance 145m) should be visible (within base range)
      expect(fogManager.isVisible(45, 0)).toBe(true);

      // Cell at x=55 (distance 155m) should NOT be visible (beyond base range, no bonus)
      expect(fogManager.isVisible(55, 0)).toBe(false);
    });

    it('should cap elevation bonus at 50% of base vision range', () => {
      // Create extreme elevation difference
      // Unit at very high elevation
      mockGame = createMockGame((x: number, z: number) => {
        if (x > 0) return 100; // Very high plateau at x > 0
        return 0; // Sea level at x <= 0
      });
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();

      // Unit at x=50 (elevation 100m) looking at x=-200 (elevation 0m)
      // Base vision = 150m (Normal optics)
      // Max bonus = 150 * 0.5 = 75m
      // Elevation difference = 100 - 0 = 100m
      // Uncapped bonus = 100 * 2.0 = 200m
      // Capped bonus = min(200, 75) = 75m
      // Effective vision = 150 + 75 = 225m

      const unit = createMockUnit(new THREE.Vector3(50, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Cell at x=-170 (distance 220m) should be visible (within 225m effective range)
      expect(fogManager.isVisible(-170, 0)).toBe(true);

      // Cell at x=-180 (distance 230m) should NOT be visible (beyond 225m cap)
      expect(fogManager.isVisible(-180, 0)).toBe(false);
    });

    it('should calculate elevation bonus per-cell based on target elevation', () => {
      // Gradual slope terrain
      mockGame = createMockGame((x: number, z: number) => x / 10);
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();

      // Unit at x=0 (elevation 0m)
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Looking downhill (negative X)
      // At x=-100, elevation = -10m, distance = 100m
      // Elevation advantage = 0 - (-10) = 10m
      // Bonus = 10 * 2.0 = 20m
      // Effective range for this cell = 150 + 20 = 170m
      // 100m < 170m, so visible
      expect(fogManager.isVisible(-100, 0)).toBe(true);

      // At x=-160, elevation = -16m, distance = 160m
      // Elevation advantage = 0 - (-16) = 16m
      // Bonus = 16 * 2.0 = 32m
      // Effective range = 150 + 32 = 182m
      // 160m < 182m, so visible
      expect(fogManager.isVisible(-160, 0)).toBe(true);

      // Looking uphill (positive X)
      // At x=100, elevation = 10m, distance = 100m
      // Elevation advantage = 0 - 10 = -10m (negative)
      // Bonus = max(0, -10 * 2.0) = 0
      // Effective range = 150 + 0 = 150m
      // 100m < 150m, so visible
      expect(fogManager.isVisible(100, 0)).toBe(true);

      // At x=160, elevation = 16m, distance = 160m
      // No bonus (uphill), 160m > 150m base range
      // Should NOT be visible
      expect(fogManager.isVisible(160, 0)).toBe(false);
    });
  });

  describe('visibility states', () => {
    beforeEach(() => {
      mockGame = createMockGame(() => 0); // Flat terrain
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();
    });

    it('should return Unexplored for never-seen areas', () => {
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Far away cell should be unexplored
      expect(fogManager.getVisibilityState(500, 500)).toBe(VisibilityState.Unexplored);
    });

    it('should return Visible for currently visible areas', () => {
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Close cell should be visible
      expect(fogManager.getVisibilityState(50, 0)).toBe(VisibilityState.Visible);
    });

    it('should return Explored for previously visible areas after unit moves away', () => {
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Cell is visible initially
      expect(fogManager.getVisibilityState(50, 0)).toBe(VisibilityState.Visible);

      // Move unit far away
      unit.position.set(500, 0, 500);
      fogManager.forceImmediateUpdate();

      // Cell should now be explored (not currently visible, but was seen before)
      expect(fogManager.getVisibilityState(50, 0)).toBe(VisibilityState.Explored);
    });
  });

  describe('enemy unit visibility', () => {
    beforeEach(() => {
      mockGame = createMockGame(() => 0); // Flat terrain
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();
    });

    it('should hide enemy units outside vision', () => {
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      const enemyUnit = createMockUnit(new THREE.Vector3(300, 0, 0), 'enemy', 'Normal');

      mockGame.unitManager.addUnit(playerUnit);
      mockGame.unitManager.addUnit(enemyUnit);

      fogManager.forceImmediateUpdate();

      // Enemy unit far away should not be visible
      expect(fogManager.isUnitVisible(enemyUnit)).toBe(false);
      expect(enemyUnit.mesh.visible).toBe(false);
    });

    it('should reveal enemy units within vision', () => {
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      const enemyUnit = createMockUnit(new THREE.Vector3(100, 0, 0), 'enemy', 'Normal');

      mockGame.unitManager.addUnit(playerUnit);
      mockGame.unitManager.addUnit(enemyUnit);

      fogManager.forceImmediateUpdate();

      // Enemy unit close by should be visible
      expect(fogManager.isUnitVisible(enemyUnit)).toBe(true);
      expect(enemyUnit.mesh.visible).toBe(true);
    });

    it('should always show player units', () => {
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');

      mockGame.unitManager.addUnit(playerUnit);

      fogManager.forceImmediateUpdate();

      // Player units always visible
      expect(fogManager.isUnitVisible(playerUnit)).toBe(true);
      expect(playerUnit.mesh.visible).toBe(true);
    });
  });

  describe('fog of war toggle', () => {
    beforeEach(() => {
      mockGame = createMockGame(() => 0);
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();
    });

    it('should show all areas when disabled', () => {
      fogManager.setEnabled(false);

      // All areas should be visible when fog disabled
      expect(fogManager.getVisibilityState(0, 0)).toBe(VisibilityState.Visible);
      expect(fogManager.getVisibilityState(500, 500)).toBe(VisibilityState.Visible);
    });

    it('should show all units when disabled', () => {
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal');
      const enemyUnit = createMockUnit(new THREE.Vector3(500, 0, 0), 'enemy', 'Normal');

      mockGame.unitManager.addUnit(playerUnit);
      mockGame.unitManager.addUnit(enemyUnit);

      fogManager.setEnabled(false);

      // All units visible when fog disabled
      expect(fogManager.isUnitVisible(enemyUnit)).toBe(true);
      expect(enemyUnit.mesh.visible).toBe(true);
    });
  });
});
