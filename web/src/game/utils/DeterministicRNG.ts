/**
 * DeterministicRNG - Seeded PRNG for reproducible game simulation
 *
 * Uses Mulberry32 algorithm - fast, deterministic 32-bit PRNG.
 * Essential for lockstep multiplayer where all clients must
 * produce identical results given the same seed.
 */

export class DeterministicRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * Generate next random number in [0, 1)
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generate random integer in [min, max] (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate random float in [min, max)
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Generate random boolean with given probability of true
   */
  nextBool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Get current RNG state (for checksum/sync verification)
   */
  getState(): number {
    return this.state;
  }

  /**
   * Set RNG state (for sync/rollback)
   */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  /**
   * Reset to a new seed
   */
  setSeed(seed: number): void {
    this.state = seed >>> 0;
  }
}

// Global game RNG instance - used for all game logic that needs to be deterministic
export const gameRNG = new DeterministicRNG(12345);

/**
 * Set the game seed (called at battle start)
 */
export function setGameSeed(seed: number): void {
  gameRNG.setSeed(seed);
}

/**
 * Get current RNG state for sync verification
 */
export function getGameRNGState(): number {
  return gameRNG.getState();
}
