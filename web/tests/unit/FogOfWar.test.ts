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
  optics: 'Poor' | 'Normal' | 'Good' | 'Very Good' | 'Exceptional' = 'Normal',
  mockGame?: Game
): Unit => {
  const pos = position.clone();

  // If mockGame is provided, set Y coordinate to terrain elevation
  // This matches real game behavior where units are positioned at terrain height
  if (mockGame && mockGame.currentMap) {
    const map = mockGame.currentMap;
    const gridX = Math.floor((pos.x + map.width / 2) / map.cellSize);
    const gridZ = Math.floor((pos.z + map.height / 2) / map.cellSize);
    const cols = map.terrain[0]?.length || 0;
    const rows = map.terrain.length;
    if (gridX >= 0 && gridX < cols && gridZ >= 0 && gridZ < rows) {
      pos.y = map.terrain[gridZ][gridX].elevation;
    }
  }

  return {
    id: `unit_${Math.random()}`,
    name: 'Test Unit',
    unitType: 'infantry',
    team,
    position: pos,
    health: 100,
    maxHealth: 100,
    data: createMockUnitData(optics),
    mesh: {
      visible: true,
    },
  } as unknown as Unit;
};

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
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Test cell at ~150m distance (should be visible)
      expect(fogManager.isVisible(145, 0)).toBe(true);

      // Test cell at >150m distance (should not be visible)
      expect(fogManager.isVisible(160, 0)).toBe(false);
    });

    it('should have correct base vision for different optics ratings', () => {
      // Poor optics = 100m vision radius
      const poorUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Poor', mockGame);
      mockGame.unitManager.addUnit(poorUnit);

      fogManager.forceImmediateUpdate();

      // Should see ~100m
      expect(fogManager.isVisible(95, 0)).toBe(true);
      expect(fogManager.isVisible(110, 0)).toBe(false);

      // Clear and test Good optics = 200m vision radius
      // Need to create a fresh mock game to properly reset the unit manager
      mockGame = createMockGame(() => 0);
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();

      const goodUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Good', mockGame);
      mockGame.unitManager.addUnit(goodUnit);

      fogManager.forceImmediateUpdate();

      // Should see ~200m
      expect(fogManager.isVisible(195, 0)).toBe(true);
      expect(fogManager.isVisible(210, 0)).toBe(false);
    });
  });

  describe('visibility states', () => {
    beforeEach(() => {
      mockGame = createMockGame(() => 0); // Flat terrain
      fogManager = new FogOfWarManager(mockGame);
      fogManager.initialize();
    });

    it('should return Unexplored for never-seen areas', () => {
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Far away cell should be unexplored
      expect(fogManager.getVisibilityState(500, 500)).toBe(VisibilityState.Unexplored);
    });

    it('should return Visible for currently visible areas', () => {
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);
      mockGame.unitManager.addUnit(unit);

      fogManager.forceImmediateUpdate();

      // Close cell should be visible
      expect(fogManager.getVisibilityState(50, 0)).toBe(VisibilityState.Visible);
    });

    it('should return Explored for previously visible areas after unit moves away', () => {
      const unit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);
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
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);
      const enemyUnit = createMockUnit(new THREE.Vector3(300, 0, 0), 'enemy', 'Normal', mockGame);

      mockGame.unitManager.addUnit(playerUnit);
      mockGame.unitManager.addUnit(enemyUnit);

      fogManager.forceImmediateUpdate();

      // Enemy unit far away should not be visible
      expect(fogManager.isUnitVisible(enemyUnit)).toBe(false);
      expect(enemyUnit.mesh.visible).toBe(false);
    });

    it('should reveal enemy units within vision', () => {
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);
      const enemyUnit = createMockUnit(new THREE.Vector3(100, 0, 0), 'enemy', 'Normal', mockGame);

      mockGame.unitManager.addUnit(playerUnit);
      mockGame.unitManager.addUnit(enemyUnit);

      fogManager.forceImmediateUpdate();

      // Enemy unit close by should be visible
      expect(fogManager.isUnitVisible(enemyUnit)).toBe(true);
      expect(enemyUnit.mesh.visible).toBe(true);
    });

    it('should always show player units', () => {
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);

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
      const playerUnit = createMockUnit(new THREE.Vector3(0, 0, 0), 'player', 'Normal', mockGame);
      const enemyUnit = createMockUnit(new THREE.Vector3(500, 0, 0), 'enemy', 'Normal', mockGame);

      mockGame.unitManager.addUnit(playerUnit);
      mockGame.unitManager.addUnit(enemyUnit);

      fogManager.setEnabled(false);

      // All units visible when fog disabled
      expect(fogManager.isUnitVisible(enemyUnit)).toBe(true);
      expect(enemyUnit.mesh.visible).toBe(true);
    });
  });
});
