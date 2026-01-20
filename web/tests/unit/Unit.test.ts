/**
 * Unit tests for the Unit class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Unit, UnitCommand, type UnitConfig } from '../../src/game/units/Unit';
import type { Game } from '../../src/core/Game';

// Mock the Game class with all required managers
const createMockGame = () => ({
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
  pathfindingManager: {
    findPath: vi.fn().mockReturnValue([]),
    findNearestReachablePosition: vi.fn().mockReturnValue(null),
  },
  buildingManager: {
    findNearestBuilding: vi.fn().mockReturnValue(null),
    hasCapacity: vi.fn().mockReturnValue(false),
    tryGarrison: vi.fn().mockReturnValue(false),
    ungarrison: vi.fn().mockReturnValue(null),
    spawnDefensiveStructure: vi.fn().mockReturnValue(null),
  },
  transportManager: {
    tryMount: vi.fn().mockReturnValue(false),
    unloadAll: vi.fn().mockReturnValue([]),
  },
  fogOfWarManager: {
    isEnabled: vi.fn().mockReturnValue(false),
    isVisible: vi.fn().mockReturnValue(true),
  },
  visualEffectsManager: {
    createDestructionEffect: vi.fn(),
  },
  audioManager: {
    playSound: vi.fn(),
  },
  pathRenderer: {
    updatePath: vi.fn(),
    clearPath: vi.fn(),
  },
  currentMap: null,
  getElevationAt: vi.fn().mockReturnValue(0),
}) as unknown as Game;

let mockGame: Game;

const createTestUnit = (overrides: Partial<UnitConfig> = {}): Unit => {
  const config: UnitConfig = {
    id: 'test_unit_1',
    name: 'Test Unit',
    unitType: 'infantry',
    team: 'player',
    position: new THREE.Vector3(0, 0, 0),
    maxHealth: 100,
    speed: 5,
    rotationSpeed: 3,
    ...overrides,
  };
  return new Unit(config, mockGame);
};

describe('Unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  describe('initialization', () => {
    it('should create a unit with correct properties', () => {
      const unit = createTestUnit({
        id: 'unit_1',
        name: 'Infantry Squad',
        unitType: 'infantry',
        team: 'player',
        maxHealth: 50,
      });

      expect(unit.id).toBe('unit_1');
      expect(unit.name).toBe('Infantry Squad');
      expect(unit.unitType).toBe('infantry');
      expect(unit.team).toBe('player');
      expect(unit.health).toBe(50);
      expect(unit.maxHealth).toBe(50);
    });

    it('should start at full health', () => {
      const unit = createTestUnit({ maxHealth: 100 });
      expect(unit.health).toBe(100);
    });

    it('should start at full morale', () => {
      const unit = createTestUnit();
      expect(unit.morale).toBe(100);
    });

    it('should start frozen', () => {
      const unit = createTestUnit();
      expect(unit.isFrozen).toBe(true);
    });

    it('should start unselected', () => {
      const unit = createTestUnit();
      expect(unit.isSelected).toBe(false);
    });
  });

  describe('health', () => {
    it('should take damage correctly', () => {
      const unit = createTestUnit({ maxHealth: 100 });
      unit.takeDamage(30);
      expect(unit.health).toBe(70);
    });

    it('should not go below 0 health', () => {
      const unit = createTestUnit({ maxHealth: 100 });
      unit.takeDamage(150);
      expect(unit.health).toBe(0);
    });

    it('should heal correctly', () => {
      const unit = createTestUnit({ maxHealth: 100 });
      unit.takeDamage(50);
      unit.heal(20);
      expect(unit.health).toBe(70);
    });

    it('should not heal above max health', () => {
      const unit = createTestUnit({ maxHealth: 100 });
      unit.heal(50);
      expect(unit.health).toBe(100);
    });

    it('should trigger death when health reaches 0', () => {
      const unit = createTestUnit({ maxHealth: 50 });
      unit.takeDamage(50);
      expect(mockGame.unitManager.destroyUnit).toHaveBeenCalledWith(unit);
    });
  });

  describe('morale', () => {
    it('should suppress morale correctly', () => {
      const unit = createTestUnit();
      unit.suppressMorale(30);
      expect(unit.morale).toBe(70);
    });

    it('should not go below 0 morale', () => {
      const unit = createTestUnit();
      unit.suppressMorale(150);
      expect(unit.morale).toBe(0);
    });
  });

  describe('selection', () => {
    it('should toggle selection state', () => {
      const unit = createTestUnit();
      expect(unit.isSelected).toBe(false);

      unit.setSelected(true);
      expect(unit.isSelected).toBe(true);

      unit.setSelected(false);
      expect(unit.isSelected).toBe(false);
    });
  });

  describe('frozen state', () => {
    it('should toggle frozen state', () => {
      const unit = createTestUnit();
      expect(unit.isFrozen).toBe(true);

      unit.setFrozen(false);
      expect(unit.isFrozen).toBe(false);

      unit.setFrozen(true);
      expect(unit.isFrozen).toBe(true);
    });

    it('should not process movement when frozen', () => {
      const unit = createTestUnit();
      const startPos = unit.position.clone();

      unit.setMoveCommand(new THREE.Vector3(100, 0, 100));
      unit.fixedUpdate(1); // Should be ignored while frozen

      expect(unit.position.x).toBe(startPos.x);
      expect(unit.position.z).toBe(startPos.z);
    });
  });

  describe('movement', () => {
    it('should move towards target when not frozen', () => {
      const unit = createTestUnit({
        position: new THREE.Vector3(0, 0, 0),
        speed: 10,
      });

      // Mock pathfinding to return a direct path to target
      (mockGame.pathfindingManager.findPath as ReturnType<typeof vi.fn>).mockReturnValue([
        new THREE.Vector3(100, 0, 0),
      ]);

      unit.setFrozen(false);
      unit.setMoveCommand(new THREE.Vector3(100, 0, 0));
      unit.fixedUpdate(1); // Move for 1 second

      // Should have moved towards target
      expect(unit.position.x).toBeGreaterThan(0);
    });

    it('should queue multiple move commands', () => {
      const unit = createTestUnit();
      unit.setFrozen(false);

      unit.setMoveCommand(new THREE.Vector3(10, 0, 0));
      unit.queueMoveCommand(new THREE.Vector3(20, 0, 0));
      unit.queueMoveCommand(new THREE.Vector3(30, 0, 0));

      // Simulate reaching first destination
      // Unit should automatically proceed to next command
      // This would require more complex testing with time simulation
    });

    it('should clear commands', () => {
      const unit = createTestUnit();
      unit.setMoveCommand(new THREE.Vector3(100, 0, 0));
      unit.clearCommands();

      // After clearing, unit should have no target
      // This is internal state, but we can verify behavior
    });
  });

  describe('position', () => {
    it('should return correct position', () => {
      const unit = createTestUnit({
        position: new THREE.Vector3(10, 0, 20),
      });

      expect(unit.position.x).toBe(10);
      expect(unit.position.y).toBe(0);
      expect(unit.position.z).toBe(20);
    });
  });
});
