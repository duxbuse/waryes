/**
 * CommandProtocol - Defines serializable command structure for multiplayer
 *
 * Commands are the unit of communication between clients in lockstep multiplayer.
 * Each command represents an action a player wants to take, and is replicated
 * to all clients for deterministic execution.
 */

export enum CommandType {
  Move = 1,
  FastMove = 2,
  Reverse = 3,
  Attack = 4,
  AttackMove = 5,
  Stop = 6,
  Garrison = 7,
  Ungarrison = 8,
  SpawnUnit = 9,
  Mount = 10,
  Unload = 11,
  DigIn = 12,
  SetReturnFireOnly = 13,
}

export interface GameCommand {
  type: CommandType;
  tick: number;            // Game tick when command should execute
  playerId: string;        // ID of player who issued command
  unitIds: string[];       // Units affected by command
  targetX?: number;        // Target world X position
  targetZ?: number;        // Target world Z position
  targetUnitId?: string;   // Target unit for attack/mount commands
  queue?: boolean;         // Whether to queue or replace current command
  // Additional fields for specific commands
  unitType?: string;       // For SpawnUnit
  buildingId?: string;     // For Garrison
  value?: boolean;         // For SetReturnFireOnly
}

/**
 * Serialize a command to JSON string
 * JSON is used for simplicity; binary serialization can be added for bandwidth optimization
 */
export function serializeCommand(cmd: GameCommand): string {
  return JSON.stringify(cmd);
}

/**
 * Deserialize a command from JSON string
 */
export function deserializeCommand(data: string): GameCommand {
  return JSON.parse(data) as GameCommand;
}

/**
 * Serialize multiple commands for batch transmission
 */
export function serializeCommands(cmds: GameCommand[]): string {
  return JSON.stringify(cmds);
}

/**
 * Deserialize multiple commands from batch transmission
 */
export function deserializeCommands(data: string): GameCommand[] {
  return JSON.parse(data) as GameCommand[];
}

/**
 * Create a move command
 */
export function createMoveCommand(
  tick: number,
  playerId: string,
  unitIds: string[],
  targetX: number,
  targetZ: number,
  queue: boolean = false
): GameCommand {
  return {
    type: CommandType.Move,
    tick,
    playerId,
    unitIds,
    targetX,
    targetZ,
    queue,
  };
}

/**
 * Create an attack command
 */
export function createAttackCommand(
  tick: number,
  playerId: string,
  unitIds: string[],
  targetUnitId: string,
  queue: boolean = false
): GameCommand {
  return {
    type: CommandType.Attack,
    tick,
    playerId,
    unitIds,
    targetUnitId,
    queue,
  };
}

/**
 * Validate command structure
 */
export function isValidCommand(cmd: unknown): cmd is GameCommand {
  if (!cmd || typeof cmd !== 'object') return false;
  const c = cmd as GameCommand;
  return (
    typeof c.type === 'number' &&
    typeof c.tick === 'number' &&
    typeof c.playerId === 'string' &&
    Array.isArray(c.unitIds)
  );
}
