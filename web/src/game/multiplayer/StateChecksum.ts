/**
 * StateChecksum - Detect desynchronization between clients
 *
 * In lockstep multiplayer, all clients should have identical game state.
 * If checksums differ, a desync has occurred and remediation is needed.
 *
 * Uses a fast hash combine for performance during real-time play.
 */

import type { Unit } from '../units/Unit';
import { getGameRNGState } from '../utils/DeterministicRNG';

/**
 * Fast hash combine (djb2 variant)
 * Produces 32-bit hash from accumulated values
 */
function hashCombine(h: number, v: number): number {
  return ((h << 5) - h + v) | 0;
}

/**
 * Hash a float by converting to fixed-point integer
 * Precision: 2 decimal places (multiply by 100)
 */
function hashFloat(h: number, v: number): number {
  return hashCombine(h, Math.floor(v * 100));
}

/**
 * Hash a string by iterating characters
 */
function hashString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h = hashCombine(h, s.charCodeAt(i));
  }
  return h;
}

/**
 * Compute checksum for game state
 * Includes: unit positions, health, morale, RNG state
 */
export function computeGameStateChecksum(units: readonly Unit[]): number {
  let hash = 0;

  // Include RNG state for full determinism verification
  hash = hashCombine(hash, getGameRNGState());

  // Sort by ID for deterministic ordering
  const sorted = [...units].sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of sorted) {
    // Skip dead units
    if (unit.health <= 0) continue;

    // Hash unit identity
    hash = hashString(hash, unit.id);

    // Hash position (2 decimal precision)
    hash = hashFloat(hash, unit.position.x);
    hash = hashFloat(hash, unit.position.z);

    // Hash combat-relevant state
    hash = hashCombine(hash, Math.floor(unit.health));
    hash = hashFloat(hash, unit.morale);
    hash = hashFloat(hash, unit.suppression);

    // Hash command state
    hash = hashCombine(hash, unit.isFrozen ? 1 : 0);
    hash = hashCombine(hash, unit.isRouting ? 1 : 0);
  }

  // Return unsigned 32-bit integer
  return hash >>> 0;
}

/**
 * Compute a quick checksum for position-only verification
 * Faster but less comprehensive than full checksum
 */
export function computePositionChecksum(units: readonly Unit[]): number {
  let hash = 0;

  const sorted = [...units].sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of sorted) {
    if (unit.health <= 0) continue;
    hash = hashFloat(hash, unit.position.x);
    hash = hashFloat(hash, unit.position.z);
  }

  return hash >>> 0;
}

/**
 * Compare checksums and return desync info
 */
export function compareChecksums(
  local: number,
  remote: number,
  tick: number
): { synced: boolean; tick: number; local: number; remote: number } {
  return {
    synced: local === remote,
    tick,
    local,
    remote,
  };
}

/**
 * Format checksum as hex string for debugging
 */
export function formatChecksum(checksum: number): string {
  return checksum.toString(16).padStart(8, '0').toUpperCase();
}
