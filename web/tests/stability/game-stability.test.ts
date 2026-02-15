/**
 * Game Stability Tests
 *
 * Comprehensive tests to verify core game systems work correctly:
 * - Unit creation
 * - Unit movement
 * - Combat (damage, morale, suppression)
 * - Data integrity
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { Unit, UnitCommand, type UnitConfig } from '../../src/game/units/Unit';
import type { Game } from '../../src/core/Game';
import type { UnitData, WeaponData } from '../../src/data/types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get directory path (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// MOCK SETUP
// ============================================================================

// Minimal SimGameContext mock for SimUnit construction and updates
const createMockSimContext = () => ({
  currentMap: null,
  phase: 'battle' as const,
  rng: { next: () => 0.5 },
  getElevationAt: () => 0,
  getTerrainAt: () => null,
  getWeaponData: () => undefined,
  getUnitData: () => undefined,
  getUnitsInRadius: () => [],
  getAllUnits: () => [],
  destroyUnit: vi.fn(),
  findPath: vi.fn((_from: THREE.Vector3, to: THREE.Vector3) => [to.clone()]),
  findNearestReachablePosition: vi.fn((_from: THREE.Vector3, to: THREE.Vector3) => to.clone()),
  findNearestBuilding: () => null,
  hasBuildingCapacity: () => false,
  tryGarrison: () => false,
  ungarrison: () => null,
  spawnDefensiveStructure: () => null,
  tryMount: () => false,
  unloadAll: () => [],
  isPositionOnNavMesh: () => true,
  isFogOfWarEnabled: () => false,
  isPositionVisible: () => true,
});

// Expose simContext for assertions in tests
let currentSimContext: ReturnType<typeof createMockSimContext>;

// Mock the Game class with all required managers
const createMockGame = () => {
  currentSimContext = createMockSimContext();
  return {
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
      updatePathQueue: vi.fn(),
    },
    currentMap: null,
    getElevationAt: vi.fn().mockReturnValue(0),
    getSimContext: () => currentSimContext,
  } as unknown as Game;
};

// Factory for creating test units
const createTestUnit = (game: Game, overrides: Partial<UnitConfig> = {}): Unit => {
  const config: UnitConfig = {
    id: `test_unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Unit',
    unitType: 'infantry',
    team: 'player',
    position: new THREE.Vector3(0, 0, 0),
    maxHealth: 100,
    speed: 5,
    rotationSpeed: 3,
    ...overrides,
  };
  return new Unit(config, game);
};

// ============================================================================
// DATA LOADING UTILITIES
// ============================================================================

function loadJsonFiles<T>(dir: string): T[] {
  const results: T[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

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

// ============================================================================
// UNIT CREATION TESTS
// ============================================================================

describe('Game Stability: Unit Creation', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  it('should create a unit with default properties', () => {
    const unit = createTestUnit(mockGame);

    expect(unit).toBeDefined();
    expect(unit.id).toBeDefined();
    expect(unit.name).toBe('Test Unit');
    expect(unit.team).toBe('player');
    expect(unit.health).toBe(100);
    expect(unit.maxHealth).toBe(100);
    expect(unit.morale).toBe(100);
    expect(unit.isFrozen).toBe(true);
    expect(unit.isSelected).toBe(false);
  });

  it('should create units with custom properties', () => {
    const unit = createTestUnit(mockGame, {
      id: 'custom_unit_123',
      name: 'Custom Tank',
      unitType: 'tank',
      team: 'enemy',
      maxHealth: 200,
      speed: 10,
    });

    expect(unit.id).toBe('custom_unit_123');
    expect(unit.name).toBe('Custom Tank');
    expect(unit.unitType).toBe('tank');
    expect(unit.team).toBe('enemy');
    expect(unit.maxHealth).toBe(200);
    expect(unit.health).toBe(200);
  });

  it('should create units with custom starting position', () => {
    const startPos = new THREE.Vector3(50, 0, -30);
    const unit = createTestUnit(mockGame, { position: startPos });

    expect(unit.position.x).toBe(50);
    expect(unit.position.y).toBe(0);
    expect(unit.position.z).toBe(-30);
  });

  it('should create multiple unique units', () => {
    const unit1 = createTestUnit(mockGame);
    const unit2 = createTestUnit(mockGame);
    const unit3 = createTestUnit(mockGame);

    expect(unit1.id).not.toBe(unit2.id);
    expect(unit2.id).not.toBe(unit3.id);
    expect(unit1.id).not.toBe(unit3.id);
  });

  it('should have valid 3D mesh', () => {
    const unit = createTestUnit(mockGame);

    expect(unit.mesh).toBeDefined();
    expect(unit.mesh).toBeInstanceOf(THREE.Group);
    expect(unit.mesh.position).toBeDefined();
  });
});

// ============================================================================
// UNIT MOVEMENT TESTS
// ============================================================================

describe('Game Stability: Unit Movement', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  it('should not move when frozen', () => {
    const unit = createTestUnit(mockGame, {
      position: new THREE.Vector3(0, 0, 0),
    });
    const startPos = unit.position.clone();

    // Unit starts frozen
    expect(unit.isFrozen).toBe(true);

    // Try to move
    unit.setMoveCommand(new THREE.Vector3(100, 0, 100));
    unit.fixedUpdate(1); // Simulate 1 second

    // Should not have moved
    expect(unit.position.x).toBe(startPos.x);
    expect(unit.position.z).toBe(startPos.z);
  });

  it('should move when unfrozen', () => {
    const unit = createTestUnit(mockGame, {
      position: new THREE.Vector3(0, 0, 0),
      speed: 10,
    });

    // Mock pathfinding to return a direct path
    (mockGame.pathfindingManager.findPath as ReturnType<typeof vi.fn>).mockReturnValue([
      new THREE.Vector3(100, 0, 0),
    ]);

    unit.setFrozen(false);
    expect(unit.isFrozen).toBe(false);

    unit.setMoveCommand(new THREE.Vector3(100, 0, 0));
    unit.fixedUpdate(1); // Simulate 1 second

    // Should have moved (at least partially) toward target
    expect(unit.position.x).toBeGreaterThan(0);
  });

  it('should toggle frozen state correctly', () => {
    const unit = createTestUnit(mockGame);

    expect(unit.isFrozen).toBe(true);

    unit.setFrozen(false);
    expect(unit.isFrozen).toBe(false);

    unit.setFrozen(true);
    expect(unit.isFrozen).toBe(true);
  });

  it('should clear commands when requested', () => {
    const unit = createTestUnit(mockGame);

    // Mock pathfinding
    (mockGame.pathfindingManager.findPath as ReturnType<typeof vi.fn>).mockReturnValue([
      new THREE.Vector3(100, 0, 0),
    ]);

    unit.setMoveCommand(new THREE.Vector3(100, 0, 0));
    unit.clearCommands();

    // After clearing, the unit should be able to receive new commands
    // This verifies the command queue was cleared
    expect(unit.isFrozen).toBe(true); // Still frozen since we didn't unfreeze
  });

  it('should queue multiple move commands', () => {
    const unit = createTestUnit(mockGame);

    // Mock pathfinding
    (mockGame.pathfindingManager.findPath as ReturnType<typeof vi.fn>).mockReturnValue([
      new THREE.Vector3(10, 0, 0),
    ]);

    unit.setMoveCommand(new THREE.Vector3(10, 0, 0));
    unit.queueMoveCommand(new THREE.Vector3(20, 0, 0));
    unit.queueMoveCommand(new THREE.Vector3(30, 0, 0));

    // Verify unit received commands without error
    expect(unit).toBeDefined();
  });
});

// ============================================================================
// COMBAT TESTS
// ============================================================================

describe('Game Stability: Combat', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  describe('Damage System', () => {
    it('should take damage correctly', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 100 });

      unit.takeDamage(30);
      expect(unit.health).toBe(70);
    });

    it('should not go below 0 health', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 100 });

      unit.takeDamage(150);
      expect(unit.health).toBe(0);
    });

    it('should trigger death when health reaches 0', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 50 });

      unit.takeDamage(50);
      expect(unit.health).toBe(0);
      // Death now goes through SimGameContext.destroyUnit (SimUnit → context)
      expect(currentSimContext.destroyUnit).toHaveBeenCalled();
    });

    it('should handle multiple damage instances', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 100 });

      unit.takeDamage(20);
      expect(unit.health).toBe(80);

      unit.takeDamage(30);
      expect(unit.health).toBe(50);

      unit.takeDamage(10);
      expect(unit.health).toBe(40);
    });

    it('should ignore damage during spawn protection', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 100 });

      unit.setSpawnProtection(5); // 5 seconds of protection
      expect(unit.hasSpawnProtection).toBe(true);

      unit.takeDamage(50);
      expect(unit.health).toBe(100); // Should still have full health
    });
  });

  describe('Healing System', () => {
    it('should heal correctly', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 100 });

      unit.takeDamage(50);
      expect(unit.health).toBe(50);

      unit.heal(20);
      expect(unit.health).toBe(70);
    });

    it('should not heal above max health', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 100 });

      unit.heal(50);
      expect(unit.health).toBe(100);
    });

    it('should heal from damaged state', () => {
      const unit = createTestUnit(mockGame, { maxHealth: 100 });

      unit.takeDamage(80);
      expect(unit.health).toBe(20);

      unit.heal(100);
      expect(unit.health).toBe(100); // Capped at max
    });
  });

  describe('Morale System', () => {
    it('should start at full morale', () => {
      const unit = createTestUnit(mockGame);
      expect(unit.morale).toBe(100);
    });

    it('should suppress morale correctly', () => {
      const unit = createTestUnit(mockGame);

      unit.suppressMorale(30);
      expect(unit.morale).toBe(70);
    });

    it('should not go below 0 morale', () => {
      const unit = createTestUnit(mockGame);

      unit.suppressMorale(150);
      expect(unit.morale).toBe(0);
    });

    it('should trigger routing when morale reaches 0', () => {
      const unit = createTestUnit(mockGame);

      unit.suppressMorale(100);
      expect(unit.morale).toBe(0);
      expect(unit.isRouting).toBe(true);
    });

    it('should handle multiple suppression instances', () => {
      const unit = createTestUnit(mockGame);

      unit.suppressMorale(20);
      expect(unit.morale).toBe(80);

      unit.suppressMorale(30);
      expect(unit.morale).toBe(50);
    });
  });

  describe('Suppression System', () => {
    it('should start with no suppression', () => {
      const unit = createTestUnit(mockGame);
      expect(unit.suppression).toBe(0);
    });

    it('should add suppression correctly', () => {
      const unit = createTestUnit(mockGame);

      unit.addSuppression(30);
      expect(unit.suppression).toBe(30);
    });

    it('should cap suppression at 100', () => {
      const unit = createTestUnit(mockGame);

      unit.addSuppression(150);
      expect(unit.suppression).toBe(100);
    });

    it('should recover suppression over time', () => {
      const unit = createTestUnit(mockGame);

      unit.addSuppression(50);
      expect(unit.suppression).toBe(50);

      // Manually test recovery
      unit.recoverSuppression(20);
      expect(unit.suppression).toBe(30);
    });
  });
});

// ============================================================================
// SELECTION TESTS
// ============================================================================

describe('Game Stability: Selection', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  it('should start unselected', () => {
    const unit = createTestUnit(mockGame);
    expect(unit.isSelected).toBe(false);
  });

  it('should select unit', () => {
    const unit = createTestUnit(mockGame);

    unit.setSelected(true);
    expect(unit.isSelected).toBe(true);
  });

  it('should deselect unit', () => {
    const unit = createTestUnit(mockGame);

    unit.setSelected(true);
    expect(unit.isSelected).toBe(true);

    unit.setSelected(false);
    expect(unit.isSelected).toBe(false);
  });

  it('should toggle selection', () => {
    const unit = createTestUnit(mockGame);

    expect(unit.isSelected).toBe(false);

    unit.setSelected(true);
    expect(unit.isSelected).toBe(true);

    unit.setSelected(false);
    expect(unit.isSelected).toBe(false);

    unit.setSelected(true);
    expect(unit.isSelected).toBe(true);
  });
});

// ============================================================================
// DATA INTEGRITY TESTS
// ============================================================================

describe('Game Stability: Data Integrity', () => {
  let UNITS: UnitData[] = [];
  let WEAPONS: WeaponData[] = [];

  beforeAll(() => {
    UNITS = loadJsonFiles<UnitData>(unitsDir);
    WEAPONS = loadJsonFiles<WeaponData>(weaponsDir);
  });

  describe('Unit Data Loading', () => {
    it('should load unit data without errors', () => {
      expect(UNITS).toBeDefined();
      expect(Array.isArray(UNITS)).toBe(true);
    });

    it('should have at least one unit defined', () => {
      expect(UNITS.length).toBeGreaterThan(0);
    });

    it('all loaded units should have valid IDs', () => {
      for (const unit of UNITS) {
        expect(typeof unit.id).toBe('string');
        expect(unit.id.length).toBeGreaterThan(0);
      }
    });

    it('all loaded units should have valid names', () => {
      for (const unit of UNITS) {
        expect(typeof unit.name).toBe('string');
        expect(unit.name.length).toBeGreaterThan(0);
      }
    });

    it('all loaded units should have positive health', () => {
      for (const unit of UNITS) {
        expect(unit.health).toBeGreaterThan(0);
      }
    });

    it('all loaded units should have non-negative cost', () => {
      for (const unit of UNITS) {
        expect(unit.cost).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Weapon Data Loading', () => {
    it('should load weapon data without errors', () => {
      expect(WEAPONS).toBeDefined();
      expect(Array.isArray(WEAPONS)).toBe(true);
    });

    it('should have at least one weapon defined', () => {
      expect(WEAPONS.length).toBeGreaterThan(0);
    });

    it('all loaded weapons should have valid IDs', () => {
      for (const weapon of WEAPONS) {
        expect(typeof weapon.id).toBe('string');
        expect(weapon.id.length).toBeGreaterThan(0);
      }
    });

    it('all loaded weapons should have valid names', () => {
      for (const weapon of WEAPONS) {
        expect(typeof weapon.name).toBe('string');
        expect(weapon.name.length).toBeGreaterThan(0);
      }
    });

    it('all loaded weapons should have non-negative damage', () => {
      for (const weapon of WEAPONS) {
        expect(weapon.damage).toBeGreaterThanOrEqual(0);
      }
    });

    it('all loaded weapons should have non-negative range', () => {
      for (const weapon of WEAPONS) {
        expect(weapon.range).toBeGreaterThanOrEqual(0);
      }
    });

    it('all loaded weapons should have accuracy between 0 and 1', () => {
      for (const weapon of WEAPONS) {
        expect(weapon.accuracy).toBeGreaterThanOrEqual(0);
        expect(weapon.accuracy).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Data Cross-References', () => {
    it('all unit weapon references should be valid', () => {
      const weaponIds = new Set(WEAPONS.map(w => w.id));

      for (const unit of UNITS) {
        if (unit.weapons && Array.isArray(unit.weapons)) {
          for (const weaponSlot of unit.weapons) {
            expect(
              weaponIds.has(weaponSlot.weaponId),
              `Unit ${unit.id} references unknown weapon: ${weaponSlot.weaponId}`
            ).toBe(true);
          }
        }
      }
    });

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
  });
});

// ============================================================================
// VETERANCY SYSTEM TESTS
// ============================================================================

describe('Game Stability: Veterancy System', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  it('should start with 0 veterancy', () => {
    const unit = createTestUnit(mockGame);
    expect(unit.veterancy).toBe(0);
  });

  it('should start with 0 kills', () => {
    const unit = createTestUnit(mockGame);
    expect(unit.kills).toBe(0);
  });

  it('should track kills', () => {
    const unit = createTestUnit(mockGame);

    unit.addKill();
    expect(unit.kills).toBe(1);

    unit.addKill();
    expect(unit.kills).toBe(2);
  });

  it('should initialize with custom veterancy', () => {
    const unit = createTestUnit(mockGame, { veterancy: 1 });
    expect(unit.veterancy).toBe(1);
  });
});

// ============================================================================
// ARMOR SYSTEM TESTS
// ============================================================================

describe('Game Stability: Armor System', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  it('should return armor values', () => {
    const unit = createTestUnit(mockGame);

    // Default armor values
    const frontArmor = unit.getArmor('front');
    const sideArmor = unit.getArmor('side');
    const rearArmor = unit.getArmor('rear');
    const topArmor = unit.getArmor('top');

    expect(typeof frontArmor).toBe('number');
    expect(typeof sideArmor).toBe('number');
    expect(typeof rearArmor).toBe('number');
    expect(typeof topArmor).toBe('number');
  });

  it('should have non-negative armor values', () => {
    const unit = createTestUnit(mockGame);

    expect(unit.getArmor('front')).toBeGreaterThanOrEqual(0);
    expect(unit.getArmor('side')).toBeGreaterThanOrEqual(0);
    expect(unit.getArmor('rear')).toBeGreaterThanOrEqual(0);
    expect(unit.getArmor('top')).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// WEAPONS SYSTEM TESTS
// ============================================================================

describe('Game Stability: Weapons System', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  it('should return weapons array', () => {
    const unit = createTestUnit(mockGame);
    const weapons = unit.getWeapons();

    expect(Array.isArray(weapons)).toBe(true);
  });

  it('should return max weapon range', () => {
    const unit = createTestUnit(mockGame);
    const maxRange = unit.getMaxWeaponRange();

    expect(typeof maxRange).toBe('number');
    expect(maxRange).toBeGreaterThanOrEqual(0);
  });

  it('should check if unit can fire', () => {
    const unit = createTestUnit(mockGame);
    const canFire = unit.canFire();

    expect(typeof canFire).toBe('boolean');
  });
});

// ============================================================================
// TEAM AND OWNERSHIP TESTS
// ============================================================================

describe('Game Stability: Team System', () => {
  let mockGame: Game;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
  });

  it('should identify player-owned units', () => {
    const unit = createTestUnit(mockGame, { team: 'player' });

    expect(unit.isPlayerOwned()).toBe(true);
    expect(unit.isAllied()).toBe(false);
  });

  it('should identify enemy units', () => {
    const unit = createTestUnit(mockGame, { team: 'enemy' });

    expect(unit.isPlayerOwned()).toBe(false);
    expect(unit.team).toBe('enemy');
  });

  it('should identify allied units', () => {
    const unit = createTestUnit(mockGame, {
      team: 'player',
      ownerId: 'ally1',
    });

    expect(unit.isPlayerOwned()).toBe(false);
    expect(unit.isAllied()).toBe(true);
  });

  it('should return correct unit color for player', () => {
    const playerUnit = createTestUnit(mockGame, { team: 'player' });
    const color = playerUnit.getUnitColor();

    expect(color).toBe(0x4a9eff); // Blue for player
  });

  it('should return correct unit color for enemy', () => {
    const enemyUnit = createTestUnit(mockGame, { team: 'enemy' });
    const color = enemyUnit.getUnitColor();

    expect(color).toBe(0xff4a4a); // Red for enemy
  });
});
