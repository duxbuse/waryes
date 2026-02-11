/**
 * Token Bucket Rate Limiter
 *
 * Implements the token bucket algorithm to limit the rate of operations per identifier.
 * Each identifier (e.g., connection ID, user ID) has its own bucket of tokens.
 *
 * Algorithm:
 * - Bucket starts with a fixed capacity of tokens
 * - Tokens are refilled over time at a constant rate
 * - Each operation consumes one token
 * - If no tokens available, operation is rejected
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private capacity: number;
  private windowMs: number;
  private refillRate: number; // tokens per millisecond

  /**
   * Create a new rate limiter
   * @param capacity - Maximum number of tokens in the bucket
   * @param windowMs - Time window in milliseconds to refill all tokens
   */
  constructor(capacity: number, windowMs: number) {
    this.capacity = capacity;
    this.windowMs = windowMs;
    this.refillRate = capacity / windowMs; // Calculate tokens per millisecond
  }

  /**
   * Try to consume a token for the given identifier
   * @param identifier - Unique identifier (e.g., connection ID, user ID)
   * @returns true if token was consumed, false if rate limit exceeded
   */
  tryConsume(identifier: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(identifier);

    // First request from this identifier - create new bucket
    if (!bucket) {
      bucket = {
        tokens: this.capacity - 1, // Start with full capacity minus one consumed
        lastRefill: now,
      };
      this.buckets.set(identifier, bucket);
      return true;
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Try to consume a token
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    // Rate limit exceeded
    return false;
  }

  /**
   * Clear rate limit data for an identifier
   * @param identifier - Unique identifier to clear
   */
  clear(identifier: string): void {
    this.buckets.delete(identifier);
  }

  /**
   * Clear all rate limit data
   */
  clearAll(): void {
    this.buckets.clear();
  }

  /**
   * Get current token count for an identifier (for debugging/monitoring)
   * @param identifier - Unique identifier
   * @returns Current number of tokens, or capacity if identifier not found
   */
  getTokenCount(identifier: string): number {
    const bucket = this.buckets.get(identifier);
    if (!bucket) return this.capacity;

    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    return Math.min(this.capacity, bucket.tokens + tokensToAdd);
  }

  /**
   * Get milliseconds until next token is available for an identifier
   * @param identifier - Unique identifier
   * @returns Milliseconds to wait, or 0 if tokens are available
   */
  getRetryAfter(identifier: string): number {
    const bucket = this.buckets.get(identifier);
    if (!bucket) return 0;

    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    const currentTokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);

    // If we have tokens, no wait needed
    if (currentTokens >= 1) return 0;

    // Calculate time needed to get 1 token
    const tokensNeeded = 1 - currentTokens;
    const msNeeded = tokensNeeded / this.refillRate;

    return Math.ceil(msNeeded);
  }
}
