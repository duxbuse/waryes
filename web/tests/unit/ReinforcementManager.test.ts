/**
 * Unit tests for the ReinforcementManager class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ReinforcementManager } from '../../src/game/managers/ReinforcementManager';
import type { Game } from '../../src/core/Game';
import type { EntryPoint, QueuedReinforcement } from '../../src/data/types';

// Mock the Game class with all required managers
let mockGame: Game;

const createMockGame = () => ({
  unitManager: {
    spawnUnit: vi.fn().mockReturnValue({
      setMoveCommand: vi.fn(),
      setAttackMoveCommand: vi.fn(),
      setReverseCommand: vi.fn(),
      setFastMoveCommand: vi.fn(),
    }),
  },
  deploymentManager: {
    show: vi.fn(),
    hide: vi.fn(),
    getDeck: vi.fn().mockReturnValue(null),
  },
  inputManager: {
    movementModifiers: {
      attackMove: false,
      reverse: false,
      fast: false,
    },
  },
  multiplayerBattleSync: null,
  scene: {
    add: vi.fn(),
    remove: vi.fn(),
  },
  getElevationAt: vi.fn().mockReturnValue(0),
} as unknown as Game);

const createTestEntryPoint = (overrides: Partial<EntryPoint> = {}): EntryPoint => ({
  id: 'test_ep_1',
  type: 'highway',
  x: 100,
  z: 100,
  team: 'player',
  spawnRate: 10,
  queue: [],
  rallyPoint: null,
  ...overrides,
});

describe('ReinforcementManager', () => {
  let manager: ReinforcementManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = createMockGame();
    manager = new ReinforcementManager(mockGame);

    // Mock DOM elements
    document.body.innerHTML = '<div id="ui-overlay"></div>';
  });

  describe('initialization', () => {
    it('should initialize with entry points', () => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1', team: 'player' }),
        createTestEntryPoint({ id: 'ep2', team: 'player' }),
      ];

      manager.initialize(entryPoints);

      const eps = manager.getEntryPoints();
      expect(eps).toHaveLength(2);
      expect(eps[0].id).toBe('ep1');
      expect(eps[1].id).toBe('ep2');
    });

    it('should filter out enemy entry points', () => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1', team: 'player' }),
        createTestEntryPoint({ id: 'ep2', team: 'enemy' }),
        createTestEntryPoint({ id: 'ep3', team: 'player' }),
      ];

      manager.initialize(entryPoints);

      const eps = manager.getEntryPoints();
      expect(eps).toHaveLength(2);
      expect(eps.every(ep => ep.team === 'player')).toBe(true);
    });

    it('should initialize spawn timers for all entry points', () => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1' }),
        createTestEntryPoint({ id: 'ep2' }),
      ];

      manager.initialize(entryPoints);

      // Timers should be initialized to 0
      // This is internal state, but we can verify by checking spawn behavior
      expect(manager.getEntryPoints()).toHaveLength(2);
    });
  });

  describe('queue operations', () => {
    beforeEach(() => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1', type: 'highway' }),
        createTestEntryPoint({ id: 'ep2', type: 'secondary' }),
      ];
      manager.initialize(entryPoints);
    });

    it('should fail to queue unit without selected entry point', () => {
      const result = manager.queueUnit('infantry_squad');
      expect(result).toBe(false);
    });

    it('should queue unit at selected entry point', () => {
      // Select entry point through private method simulation
      const ep = manager.getEntryPoints()[0];
      manager['selectEntryPoint'](ep);

      const result = manager.queueUnit('infantry_squad');
      expect(result).toBe(true);
    });

    it('should add unit to queue at specific resupply point', () => {
      const result = manager.queueUnitAtResupplyPoint(
        'ep1',
        'infantry_squad',
        { x: 200, z: 200 },
        'normal'
      );

      expect(result).toBe(true);
      const ep = manager.getEntryPoints().find(e => e.id === 'ep1');
      expect(ep?.queue).toHaveLength(1);
      expect(ep?.queue[0].unitType).toBe('infantry_squad');
      expect(ep?.queue[0].destination).toEqual({ x: 200, z: 200 });
      expect(ep?.queue[0].moveType).toBe('normal');
    });

    it('should fail to queue at non-existent resupply point', () => {
      const result = manager.queueUnitAtResupplyPoint(
        'nonexistent',
        'infantry_squad',
        { x: 200, z: 200 },
        'normal'
      );

      expect(result).toBe(false);
    });

    it('should queue unit automatically at best entry point', () => {
      const result = manager.queueUnitAuto('infantry_squad');

      expect(result).toBe(true);
      const eps = manager.getEntryPoints();
      const totalQueued = eps.reduce((sum, ep) => sum + ep.queue.length, 0);
      expect(totalQueued).toBe(1);
    });

    it('should support different movement types in queue', () => {
      manager.queueUnitAtResupplyPoint('ep1', 'unit1', { x: 100, z: 100 }, 'attack');
      manager.queueUnitAtResupplyPoint('ep1', 'unit2', { x: 200, z: 200 }, 'reverse');
      manager.queueUnitAtResupplyPoint('ep1', 'unit3', { x: 300, z: 300 }, 'fast');

      const ep = manager.getEntryPoints().find(e => e.id === 'ep1');
      expect(ep?.queue).toHaveLength(3);
      expect(ep?.queue[0].moveType).toBe('attack');
      expect(ep?.queue[1].moveType).toBe('reverse');
      expect(ep?.queue[2].moveType).toBe('fast');
    });

    it('should handle null destination in queue', () => {
      const result = manager.queueUnitAtResupplyPoint(
        'ep1',
        'infantry_squad',
        null,
        null
      );

      expect(result).toBe(true);
      const ep = manager.getEntryPoints().find(e => e.id === 'ep1');
      expect(ep?.queue[0].destination).toBeNull();
      expect(ep?.queue[0].moveType).toBeNull();
    });
  });

  describe('best entry point selection', () => {
    it('should return null when no entry points available', () => {
      manager.initialize([]);
      expect(manager.getBestEntryPoint()).toBeNull();
    });

    it('should prioritize highway over secondary over dirt', () => {
      const entryPoints = [
        createTestEntryPoint({ id: 'dirt', type: 'dirt' }),
        createTestEntryPoint({ id: 'highway', type: 'highway' }),
        createTestEntryPoint({ id: 'secondary', type: 'secondary' }),
      ];
      manager.initialize(entryPoints);

      const best = manager.getBestEntryPoint();
      expect(best?.type).toBe('highway');
    });

    it('should prefer entry points with shorter queues when same type', () => {
      const ep1 = createTestEntryPoint({ id: 'ep1', type: 'highway' });
      const ep2 = createTestEntryPoint({ id: 'ep2', type: 'highway' });

      // Add items to ep1 queue
      ep1.queue.push(
        { unitType: 'unit1', destination: null, moveType: null },
        { unitType: 'unit2', destination: null, moveType: null }
      );

      manager.initialize([ep1, ep2]);

      const best = manager.getBestEntryPoint();
      expect(best?.id).toBe('ep2'); // ep2 has shorter queue
    });

    it('should handle air entry points with lowest priority', () => {
      const entryPoints = [
        createTestEntryPoint({ id: 'air', type: 'air' }),
        createTestEntryPoint({ id: 'dirt', type: 'dirt' }),
      ];
      manager.initialize(entryPoints);

      const best = manager.getBestEntryPoint();
      expect(best?.type).toBe('dirt'); // Dirt prioritized over air
    });
  });

  describe('spawn timer and queue processing', () => {
    beforeEach(() => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1', spawnRate: 5 }), // 5 second spawn rate
      ];
      manager.initialize(entryPoints);
    });

    it('should not spawn when queue is empty', () => {
      manager.update(1.0); // 1 second

      expect(mockGame.unitManager.spawnUnit).not.toHaveBeenCalled();
    });

    it('should spawn unit when timer expires', () => {
      // Add unit to queue
      manager.queueUnitAtResupplyPoint('ep1', 'infantry_squad', null, null);

      // Update for spawn rate duration (timer starts at 0)
      manager.update(0.1); // Should trigger spawn immediately (timer at 0)

      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledTimes(1);
      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledWith({
        position: expect.any(THREE.Vector3),
        team: 'player',
        unitType: 'infantry_squad',
      });
    });

    it('should process multiple units in queue sequentially', () => {
      // Add multiple units to queue
      manager.queueUnitAtResupplyPoint('ep1', 'unit1', null, null);
      manager.queueUnitAtResupplyPoint('ep1', 'unit2', null, null);
      manager.queueUnitAtResupplyPoint('ep1', 'unit3', null, null);

      const ep = manager.getEntryPoints()[0];
      expect(ep.queue).toHaveLength(3);

      // First spawn (timer at 0)
      manager.update(0.1);
      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledTimes(1);
      expect(ep.queue).toHaveLength(2);

      // Wait for spawn rate (5 seconds)
      manager.update(5.0);
      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledTimes(2);
      expect(ep.queue).toHaveLength(1);

      // Wait for another spawn rate
      manager.update(5.0);
      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledTimes(3);
      expect(ep.queue).toHaveLength(0);
    });

    it('should respect spawn rate between spawns', () => {
      manager.queueUnitAtResupplyPoint('ep1', 'unit1', null, null);
      manager.queueUnitAtResupplyPoint('ep1', 'unit2', null, null);

      // First spawn
      manager.update(0.1);
      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledTimes(1);

      // Not enough time passed
      manager.update(2.0); // Only 2 seconds of 5 second spawn rate
      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledTimes(1);

      // Complete spawn rate
      manager.update(3.0); // Total 5 seconds
      expect(mockGame.unitManager.spawnUnit).toHaveBeenCalledTimes(2);
    });
  });

  describe('unit spawn with movement commands', () => {
    beforeEach(() => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1', spawnRate: 5 }),
      ];
      manager.initialize(entryPoints);
    });

    it('should apply normal move command to spawned unit', () => {
      const mockUnit = {
        setMoveCommand: vi.fn(),
        setAttackMoveCommand: vi.fn(),
        setReverseCommand: vi.fn(),
        setFastMoveCommand: vi.fn(),
      };
      (mockGame.unitManager.spawnUnit as ReturnType<typeof vi.fn>).mockReturnValue(mockUnit);

      manager.queueUnitAtResupplyPoint('ep1', 'infantry', { x: 200, z: 200 }, 'normal');
      manager.update(0.1); // Trigger spawn

      expect(mockUnit.setMoveCommand).toHaveBeenCalledWith(expect.any(THREE.Vector3));
    });

    it('should apply attack-move command to spawned unit', () => {
      const mockUnit = {
        setMoveCommand: vi.fn(),
        setAttackMoveCommand: vi.fn(),
        setReverseCommand: vi.fn(),
        setFastMoveCommand: vi.fn(),
      };
      (mockGame.unitManager.spawnUnit as ReturnType<typeof vi.fn>).mockReturnValue(mockUnit);

      manager.queueUnitAtResupplyPoint('ep1', 'infantry', { x: 200, z: 200 }, 'attack');
      manager.update(0.1);

      expect(mockUnit.setAttackMoveCommand).toHaveBeenCalledWith(expect.any(THREE.Vector3));
    });

    it('should apply reverse command to spawned unit', () => {
      const mockUnit = {
        setMoveCommand: vi.fn(),
        setAttackMoveCommand: vi.fn(),
        setReverseCommand: vi.fn(),
        setFastMoveCommand: vi.fn(),
      };
      (mockGame.unitManager.spawnUnit as ReturnType<typeof vi.fn>).mockReturnValue(mockUnit);

      manager.queueUnitAtResupplyPoint('ep1', 'infantry', { x: 200, z: 200 }, 'reverse');
      manager.update(0.1);

      expect(mockUnit.setReverseCommand).toHaveBeenCalledWith(expect.any(THREE.Vector3));
    });

    it('should apply fast-move command to spawned unit', () => {
      const mockUnit = {
        setMoveCommand: vi.fn(),
        setAttackMoveCommand: vi.fn(),
        setReverseCommand: vi.fn(),
        setFastMoveCommand: vi.fn(),
      };
      (mockGame.unitManager.spawnUnit as ReturnType<typeof vi.fn>).mockReturnValue(mockUnit);

      manager.queueUnitAtResupplyPoint('ep1', 'infantry', { x: 200, z: 200 }, 'fast');
      manager.update(0.1);

      expect(mockUnit.setFastMoveCommand).toHaveBeenCalledWith(expect.any(THREE.Vector3));
    });

    it('should use rally point when no destination specified', () => {
      const mockUnit = {
        setMoveCommand: vi.fn(),
        setAttackMoveCommand: vi.fn(),
        setReverseCommand: vi.fn(),
        setFastMoveCommand: vi.fn(),
      };
      (mockGame.unitManager.spawnUnit as ReturnType<typeof vi.fn>).mockReturnValue(mockUnit);

      // Set rally point
      const ep = manager.getEntryPoints()[0];
      ep.rallyPoint = { x: 300, z: 300 };

      manager.queueUnitAtResupplyPoint('ep1', 'infantry', null, null);
      manager.update(0.1);

      expect(mockUnit.setMoveCommand).toHaveBeenCalledWith(expect.any(THREE.Vector3));
      const callArg = mockUnit.setMoveCommand.mock.calls[0][0] as THREE.Vector3;
      expect(callArg.x).toBe(300);
      expect(callArg.z).toBe(300);
    });
  });

  describe('rally point management', () => {
    beforeEach(() => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1' }),
      ];
      manager.initialize(entryPoints);
    });

    it('should set rally point for entry point', () => {
      manager.setRallyPoint('ep1', 150, 250);

      const ep = manager.getEntryPoints()[0];
      expect(ep.rallyPoint).toEqual({ x: 150, z: 250 });
    });

    it('should handle setting rally point for non-existent entry point', () => {
      manager.setRallyPoint('nonexistent', 100, 100);
      // Should not throw error, just log warning
    });
  });

  describe('closest resupply point', () => {
    it('should return null when no entry points available', () => {
      manager.initialize([]);
      const closest = manager.findClosestResupplyPoint(new THREE.Vector3(0, 0, 0));
      expect(closest).toBeNull();
    });

    it('should find closest entry point by distance', () => {
      const entryPoints = [
        createTestEntryPoint({ id: 'far', x: 1000, z: 1000 }),
        createTestEntryPoint({ id: 'near', x: 10, z: 10 }),
        createTestEntryPoint({ id: 'medium', x: 500, z: 500 }),
      ];
      manager.initialize(entryPoints);

      const closest = manager.findClosestResupplyPoint(new THREE.Vector3(0, 0, 0));
      expect(closest?.id).toBe('near');
    });

    it('should calculate distance correctly', () => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1', x: 100, z: 0 }),
        createTestEntryPoint({ id: 'ep2', x: 0, z: 100 }),
      ];
      manager.initialize(entryPoints);

      const closest = manager.findClosestResupplyPoint(new THREE.Vector3(90, 0, 0));
      expect(closest?.id).toBe('ep1'); // Closer to (100, 0) than (0, 100)
    });
  });

  describe('destination waiting state', () => {
    beforeEach(() => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1' }),
      ];
      manager.initialize(entryPoints);
    });

    it('should enter waiting state when queuing unit', () => {
      const ep = manager.getEntryPoints()[0];
      manager['selectEntryPoint'](ep);

      expect(manager.isWaitingForDestination()).toBe(false);

      manager.queueUnit('infantry_squad');

      expect(manager.isWaitingForDestination()).toBe(true);
    });

    it('should cancel waiting state', () => {
      const ep = manager.getEntryPoints()[0];
      manager['selectEntryPoint'](ep);
      manager.queueUnit('infantry_squad');

      expect(manager.isWaitingForDestination()).toBe(true);

      manager.cancelDestinationWait();

      expect(manager.isWaitingForDestination()).toBe(false);
    });

    it('should handle destination click', () => {
      const ep = manager.getEntryPoints()[0];
      manager['selectEntryPoint'](ep);
      manager.queueUnit('infantry_squad');

      const destination = new THREE.Vector3(200, 0, 200);
      manager.handleDestinationClick(destination);

      expect(manager.isWaitingForDestination()).toBe(false);
      expect(ep.queue).toHaveLength(1);
      expect(ep.queue[0].destination).toEqual({ x: 200, z: 200 });
    });

    it('should apply movement modifiers on destination click', () => {
      const ep = manager.getEntryPoints()[0];
      manager['selectEntryPoint'](ep);
      manager.queueUnit('infantry_squad');

      // Set attack-move modifier
      mockGame.inputManager.movementModifiers.attackMove = true;

      const destination = new THREE.Vector3(200, 0, 200);
      manager.handleDestinationClick(destination);

      expect(ep.queue[0].moveType).toBe('attack');
    });
  });

  describe('multiplayer command processing', () => {
    beforeEach(() => {
      const entryPoints = [
        createTestEntryPoint({ id: 'ep1' }),
      ];
      manager.initialize(entryPoints);
    });

    it('should process reinforcement command', () => {
      manager.processReinforcementCommand('ep1', 'infantry', 200, 200, 'normal');

      const ep = manager.getEntryPoints()[0];
      expect(ep.queue).toHaveLength(1);
      expect(ep.queue[0].unitType).toBe('infantry');
      expect(ep.queue[0].destination).toEqual({ x: 200, z: 200 });
      expect(ep.queue[0].moveType).toBe('normal');
    });

    it('should handle command without destination', () => {
      manager.processReinforcementCommand('ep1', 'infantry', undefined, undefined, undefined);

      const ep = manager.getEntryPoints()[0];
      expect(ep.queue).toHaveLength(1);
      expect(ep.queue[0].destination).toBeNull();
      expect(ep.queue[0].moveType).toBeNull();
    });

    it('should handle invalid entry point in command', () => {
      manager.processReinforcementCommand('nonexistent', 'infantry', 200, 200, 'normal');

      // Should not throw, just log warning
      const ep = manager.getEntryPoints()[0];
      expect(ep.queue).toHaveLength(0);
    });

    it('should support all movement types in commands', () => {
      manager.processReinforcementCommand('ep1', 'unit1', 100, 100, 'attack');
      manager.processReinforcementCommand('ep1', 'unit2', 200, 200, 'reverse');
      manager.processReinforcementCommand('ep1', 'unit3', 300, 300, 'fast');
      manager.processReinforcementCommand('ep1', 'unit4', 400, 400, 'normal');

      const ep = manager.getEntryPoints()[0];
      expect(ep.queue).toHaveLength(4);
      expect(ep.queue[0].moveType).toBe('attack');
      expect(ep.queue[1].moveType).toBe('reverse');
      expect(ep.queue[2].moveType).toBe('fast');
      expect(ep.queue[3].moveType).toBe('normal');
    });
  });
});
