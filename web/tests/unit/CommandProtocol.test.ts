/**
 * Unit tests for CommandProtocol
 */

import { describe, it, expect } from 'vitest';
import {
  CommandType,
  type GameCommand,
  serializeCommand,
  deserializeCommand,
  serializeCommands,
  deserializeCommands,
  createMoveCommand,
  createAttackCommand,
  createQueueReinforcementCommand,
  isValidCommand,
} from '../../src/game/multiplayer/CommandProtocol';

describe('CommandProtocol', () => {
  describe('serialization', () => {
    it('should serialize a simple move command', () => {
      const cmd: GameCommand = {
        type: CommandType.Move,
        tick: 100,
        playerId: 'player1',
        unitIds: ['unit1', 'unit2'],
        targetX: 50,
        targetZ: 75,
        queue: false,
      };

      const serialized = serializeCommand(cmd);
      expect(serialized).toBeTruthy();
      expect(typeof serialized).toBe('string');

      const parsed = JSON.parse(serialized);
      expect(parsed.type).toBe(CommandType.Move);
      expect(parsed.tick).toBe(100);
      expect(parsed.playerId).toBe('player1');
      expect(parsed.unitIds).toEqual(['unit1', 'unit2']);
      expect(parsed.targetX).toBe(50);
      expect(parsed.targetZ).toBe(75);
    });

    it('should serialize an attack command with target unit', () => {
      const cmd: GameCommand = {
        type: CommandType.Attack,
        tick: 200,
        playerId: 'player2',
        unitIds: ['tank1'],
        targetUnitId: 'enemy1',
        queue: true,
      };

      const serialized = serializeCommand(cmd);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe(CommandType.Attack);
      expect(parsed.targetUnitId).toBe('enemy1');
      expect(parsed.queue).toBe(true);
    });

    it('should serialize a reinforcement command with all fields', () => {
      const cmd: GameCommand = {
        type: CommandType.QueueReinforcement,
        tick: 300,
        playerId: 'player1',
        unitIds: ['entry_point_1'],
        unitType: 'tank_m1a2',
        targetX: 100,
        targetZ: 200,
        moveType: 'attack',
      };

      const serialized = serializeCommand(cmd);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe(CommandType.QueueReinforcement);
      expect(parsed.unitType).toBe('tank_m1a2');
      expect(parsed.moveType).toBe('attack');
    });

    it('should serialize a command with optional fields omitted', () => {
      const cmd: GameCommand = {
        type: CommandType.Stop,
        tick: 50,
        playerId: 'player3',
        unitIds: ['unit5'],
      };

      const serialized = serializeCommand(cmd);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe(CommandType.Stop);
      expect(parsed.targetX).toBeUndefined();
      expect(parsed.targetZ).toBeUndefined();
      expect(parsed.targetUnitId).toBeUndefined();
    });
  });

  describe('deserialization', () => {
    it('should deserialize a move command', () => {
      const json = JSON.stringify({
        type: CommandType.Move,
        tick: 100,
        playerId: 'player1',
        unitIds: ['unit1', 'unit2'],
        targetX: 50,
        targetZ: 75,
        queue: false,
      });

      const cmd = deserializeCommand(json);

      expect(cmd.type).toBe(CommandType.Move);
      expect(cmd.tick).toBe(100);
      expect(cmd.playerId).toBe('player1');
      expect(cmd.unitIds).toEqual(['unit1', 'unit2']);
      expect(cmd.targetX).toBe(50);
      expect(cmd.targetZ).toBe(75);
      expect(cmd.queue).toBe(false);
    });

    it('should deserialize an attack command', () => {
      const json = JSON.stringify({
        type: CommandType.Attack,
        tick: 200,
        playerId: 'player2',
        unitIds: ['tank1'],
        targetUnitId: 'enemy1',
      });

      const cmd = deserializeCommand(json);

      expect(cmd.type).toBe(CommandType.Attack);
      expect(cmd.targetUnitId).toBe('enemy1');
    });

    it('should round-trip serialize and deserialize', () => {
      const original: GameCommand = {
        type: CommandType.FastMove,
        tick: 500,
        playerId: 'player4',
        unitIds: ['scout1', 'scout2', 'scout3'],
        targetX: 999,
        targetZ: 888,
        queue: true,
      };

      const serialized = serializeCommand(original);
      const deserialized = deserializeCommand(serialized);

      expect(deserialized).toEqual(original);
    });
  });

  describe('batch serialization', () => {
    it('should serialize multiple commands', () => {
      const cmds: GameCommand[] = [
        {
          type: CommandType.Move,
          tick: 100,
          playerId: 'player1',
          unitIds: ['unit1'],
          targetX: 50,
          targetZ: 50,
        },
        {
          type: CommandType.Attack,
          tick: 101,
          playerId: 'player1',
          unitIds: ['unit2'],
          targetUnitId: 'enemy1',
        },
        {
          type: CommandType.Stop,
          tick: 102,
          playerId: 'player2',
          unitIds: ['unit3'],
        },
      ];

      const serialized = serializeCommands(cmds);
      expect(typeof serialized).toBe('string');

      const parsed = JSON.parse(serialized);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(3);
    });

    it('should deserialize multiple commands', () => {
      const json = JSON.stringify([
        {
          type: CommandType.Move,
          tick: 100,
          playerId: 'player1',
          unitIds: ['unit1'],
          targetX: 50,
          targetZ: 50,
        },
        {
          type: CommandType.Attack,
          tick: 101,
          playerId: 'player1',
          unitIds: ['unit2'],
          targetUnitId: 'enemy1',
        },
      ]);

      const cmds = deserializeCommands(json);

      expect(Array.isArray(cmds)).toBe(true);
      expect(cmds.length).toBe(2);
      expect(cmds[0]?.type).toBe(CommandType.Move);
      expect(cmds[1]?.type).toBe(CommandType.Attack);
    });

    it('should handle empty command array', () => {
      const cmds: GameCommand[] = [];
      const serialized = serializeCommands(cmds);
      const deserialized = deserializeCommands(serialized);

      expect(deserialized).toEqual([]);
    });

    it('should round-trip batch serialize and deserialize', () => {
      const original: GameCommand[] = [
        {
          type: CommandType.QueueReinforcement,
          tick: 300,
          playerId: 'player1',
          unitIds: ['entry1'],
          unitType: 'infantry',
          targetX: 100,
          targetZ: 200,
        },
        {
          type: CommandType.Garrison,
          tick: 301,
          playerId: 'player2',
          unitIds: ['transport1'],
          buildingId: 'building1',
        },
      ];

      const serialized = serializeCommands(original);
      const deserialized = deserializeCommands(serialized);

      expect(deserialized).toEqual(original);
    });
  });

  describe('createMoveCommand', () => {
    it('should create a move command with default queue=false', () => {
      const cmd = createMoveCommand(100, 'player1', ['unit1', 'unit2'], 50, 75);

      expect(cmd.type).toBe(CommandType.Move);
      expect(cmd.tick).toBe(100);
      expect(cmd.playerId).toBe('player1');
      expect(cmd.unitIds).toEqual(['unit1', 'unit2']);
      expect(cmd.targetX).toBe(50);
      expect(cmd.targetZ).toBe(75);
      expect(cmd.queue).toBe(false);
    });

    it('should create a move command with queue=true', () => {
      const cmd = createMoveCommand(200, 'player2', ['unit3'], 100, 100, true);

      expect(cmd.type).toBe(CommandType.Move);
      expect(cmd.queue).toBe(true);
    });

    it('should handle negative coordinates', () => {
      const cmd = createMoveCommand(300, 'player1', ['unit1'], -50, -75);

      expect(cmd.targetX).toBe(-50);
      expect(cmd.targetZ).toBe(-75);
    });

    it('should handle multiple unit IDs', () => {
      const unitIds = ['unit1', 'unit2', 'unit3', 'unit4', 'unit5'];
      const cmd = createMoveCommand(400, 'player1', unitIds, 0, 0);

      expect(cmd.unitIds).toEqual(unitIds);
      expect(cmd.unitIds.length).toBe(5);
    });
  });

  describe('createAttackCommand', () => {
    it('should create an attack command with default queue=false', () => {
      const cmd = createAttackCommand(100, 'player1', ['unit1'], 'enemy1');

      expect(cmd.type).toBe(CommandType.Attack);
      expect(cmd.tick).toBe(100);
      expect(cmd.playerId).toBe('player1');
      expect(cmd.unitIds).toEqual(['unit1']);
      expect(cmd.targetUnitId).toBe('enemy1');
      expect(cmd.queue).toBe(false);
    });

    it('should create an attack command with queue=true', () => {
      const cmd = createAttackCommand(200, 'player2', ['tank1', 'tank2'], 'enemy2', true);

      expect(cmd.type).toBe(CommandType.Attack);
      expect(cmd.targetUnitId).toBe('enemy2');
      expect(cmd.queue).toBe(true);
    });

    it('should handle multiple attacking units', () => {
      const unitIds = ['unit1', 'unit2', 'unit3'];
      const cmd = createAttackCommand(300, 'player1', unitIds, 'enemy1');

      expect(cmd.unitIds).toEqual(unitIds);
    });
  });

  describe('createQueueReinforcementCommand', () => {
    it('should create a reinforcement command with all parameters', () => {
      const cmd = createQueueReinforcementCommand(
        100,
        'player1',
        'entry_point_1',
        'tank_m1a2',
        50,
        75,
        'attack'
      );

      expect(cmd.type).toBe(CommandType.QueueReinforcement);
      expect(cmd.tick).toBe(100);
      expect(cmd.playerId).toBe('player1');
      expect(cmd.unitIds).toEqual(['entry_point_1']);
      expect(cmd.unitType).toBe('tank_m1a2');
      expect(cmd.targetX).toBe(50);
      expect(cmd.targetZ).toBe(75);
      expect(cmd.moveType).toBe('attack');
    });

    it('should create a reinforcement command without target position', () => {
      const cmd = createQueueReinforcementCommand(
        200,
        'player2',
        'entry_point_2',
        'infantry_squad'
      );

      expect(cmd.type).toBe(CommandType.QueueReinforcement);
      expect(cmd.unitType).toBe('infantry_squad');
      expect(cmd.targetX).toBeUndefined();
      expect(cmd.targetZ).toBeUndefined();
      expect(cmd.moveType).toBeUndefined();
    });

    it('should handle null moveType', () => {
      const cmd = createQueueReinforcementCommand(
        300,
        'player1',
        'entry1',
        'tank',
        100,
        200,
        null
      );

      expect(cmd.moveType).toBeUndefined();
    });

    it('should handle all moveType values', () => {
      const moveTypes: Array<'normal' | 'attack' | 'reverse' | 'fast'> = [
        'normal',
        'attack',
        'reverse',
        'fast',
      ];

      for (const moveType of moveTypes) {
        const cmd = createQueueReinforcementCommand(
          100,
          'player1',
          'entry1',
          'tank',
          0,
          0,
          moveType
        );
        expect(cmd.moveType).toBe(moveType);
      }
    });
  });

  describe('isValidCommand', () => {
    it('should validate a correct command', () => {
      const cmd: GameCommand = {
        type: CommandType.Move,
        tick: 100,
        playerId: 'player1',
        unitIds: ['unit1'],
        targetX: 50,
        targetZ: 75,
      };

      expect(isValidCommand(cmd)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidCommand(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidCommand(undefined)).toBe(false);
    });

    it('should reject non-object types', () => {
      expect(isValidCommand('string')).toBe(false);
      expect(isValidCommand(123)).toBe(false);
      expect(isValidCommand(true)).toBe(false);
    });

    it('should reject command without type', () => {
      const cmd = {
        tick: 100,
        playerId: 'player1',
        unitIds: ['unit1'],
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should reject command with non-number type', () => {
      const cmd = {
        type: 'Move',
        tick: 100,
        playerId: 'player1',
        unitIds: ['unit1'],
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should reject command without tick', () => {
      const cmd = {
        type: CommandType.Move,
        playerId: 'player1',
        unitIds: ['unit1'],
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should reject command with non-number tick', () => {
      const cmd = {
        type: CommandType.Move,
        tick: '100',
        playerId: 'player1',
        unitIds: ['unit1'],
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should reject command without playerId', () => {
      const cmd = {
        type: CommandType.Move,
        tick: 100,
        unitIds: ['unit1'],
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should reject command with non-string playerId', () => {
      const cmd = {
        type: CommandType.Move,
        tick: 100,
        playerId: 123,
        unitIds: ['unit1'],
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should reject command without unitIds', () => {
      const cmd = {
        type: CommandType.Move,
        tick: 100,
        playerId: 'player1',
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should reject command with non-array unitIds', () => {
      const cmd = {
        type: CommandType.Move,
        tick: 100,
        playerId: 'player1',
        unitIds: 'unit1',
      };

      expect(isValidCommand(cmd)).toBe(false);
    });

    it('should accept command with empty unitIds array', () => {
      const cmd: GameCommand = {
        type: CommandType.Stop,
        tick: 100,
        playerId: 'player1',
        unitIds: [],
      };

      expect(isValidCommand(cmd)).toBe(true);
    });

    it('should accept command with optional fields', () => {
      const cmd: GameCommand = {
        type: CommandType.QueueReinforcement,
        tick: 100,
        playerId: 'player1',
        unitIds: ['entry1'],
        unitType: 'tank',
        targetX: 50,
        targetZ: 75,
        moveType: 'attack',
        queue: true,
        buildingId: 'building1',
        value: true,
      };

      expect(isValidCommand(cmd)).toBe(true);
    });
  });

  describe('command types', () => {
    it('should have unique values for all command types', () => {
      const types = [
        CommandType.Move,
        CommandType.FastMove,
        CommandType.Reverse,
        CommandType.Attack,
        CommandType.AttackMove,
        CommandType.Stop,
        CommandType.Garrison,
        CommandType.Ungarrison,
        CommandType.SpawnUnit,
        CommandType.Mount,
        CommandType.Unload,
        CommandType.DigIn,
        CommandType.SetReturnFireOnly,
        CommandType.QueueReinforcement,
      ];

      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(types.length);
    });

    it('should have numeric values for all command types', () => {
      expect(typeof CommandType.Move).toBe('number');
      expect(typeof CommandType.Attack).toBe('number');
      expect(typeof CommandType.QueueReinforcement).toBe('number');
    });
  });

  describe('synchronization scenarios', () => {
    it('should handle commands from multiple players in same tick', () => {
      const cmds: GameCommand[] = [
        createMoveCommand(100, 'player1', ['unit1'], 50, 50),
        createMoveCommand(100, 'player2', ['unit2'], 100, 100),
        createAttackCommand(100, 'player3', ['unit3'], 'enemy1'),
      ];

      const serialized = serializeCommands(cmds);
      const deserialized = deserializeCommands(serialized);

      expect(deserialized.length).toBe(3);
      expect(deserialized[0]?.playerId).toBe('player1');
      expect(deserialized[1]?.playerId).toBe('player2');
      expect(deserialized[2]?.playerId).toBe('player3');
    });

    it('should maintain command order during serialization', () => {
      const cmds: GameCommand[] = [];
      for (let i = 0; i < 10; i++) {
        cmds.push(createMoveCommand(i, `player${i}`, [`unit${i}`], i * 10, i * 10));
      }

      const serialized = serializeCommands(cmds);
      const deserialized = deserializeCommands(serialized);

      for (let i = 0; i < 10; i++) {
        expect(deserialized[i]?.tick).toBe(i);
        expect(deserialized[i]?.playerId).toBe(`player${i}`);
      }
    });

    it('should handle rapid command sequences', () => {
      const cmds: GameCommand[] = [];
      for (let tick = 100; tick < 200; tick++) {
        cmds.push(createMoveCommand(tick, 'player1', ['unit1'], tick, tick));
      }

      const serialized = serializeCommands(cmds);
      const deserialized = deserializeCommands(serialized);

      expect(deserialized.length).toBe(100);
      expect(deserialized[0]?.tick).toBe(100);
      expect(deserialized[99]?.tick).toBe(199);
    });
  });
});
