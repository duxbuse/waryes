/**
 * Unit tests for the QuaternionPool utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { QuaternionPool } from '../../src/game/utils/QuaternionPool';

describe('QuaternionPool', () => {
  beforeEach(() => {
    // Reset the pool before each test
    QuaternionPool.reset();
  });

  describe('initialization', () => {
    it('should create a pool with default size', () => {
      // The pool should be pre-initialized with 200 quaternions
      // We can verify this by acquiring 200 quaternions without triggering expansion
      const quaternions: THREE.Quaternion[] = [];

      for (let i = 0; i < 200; i++) {
        quaternions.push(QuaternionPool.acquire());
      }

      expect(quaternions.length).toBe(200);
      expect(quaternions[0]).toBeInstanceOf(THREE.Quaternion);
    });
  });

  describe('acquire', () => {
    it('should return a quaternion with identity values', () => {
      const quat = QuaternionPool.acquire();

      expect(quat.x).toBe(0);
      expect(quat.y).toBe(0);
      expect(quat.z).toBe(0);
      expect(quat.w).toBe(1);
    });

    it('should return different quaternion instances', () => {
      const quat1 = QuaternionPool.acquire();
      const quat2 = QuaternionPool.acquire();

      expect(quat1).not.toBe(quat2);
    });

    it('should reset quaternion to identity on acquire', () => {
      const quat = QuaternionPool.acquire();

      // Modify the quaternion
      quat.set(0.5, 0.5, 0.5, 0.5);

      // Reset pool and acquire again
      QuaternionPool.reset();
      const resetQuat = QuaternionPool.acquire();

      // Should be reset to identity
      expect(resetQuat.x).toBe(0);
      expect(resetQuat.y).toBe(0);
      expect(resetQuat.z).toBe(0);
      expect(resetQuat.w).toBe(1);
    });

    it('should expand pool when exhausted', () => {
      // Acquire more than the initial pool size (200)
      const quaternions: THREE.Quaternion[] = [];

      for (let i = 0; i < 250; i++) {
        quaternions.push(QuaternionPool.acquire());
      }

      expect(quaternions.length).toBe(250);

      // All should be valid quaternion instances
      for (const quat of quaternions) {
        expect(quat).toBeInstanceOf(THREE.Quaternion);
        expect(quat.x).toBe(0);
        expect(quat.y).toBe(0);
        expect(quat.z).toBe(0);
        expect(quat.w).toBe(1);
      }
    });

    it('should return quaternions in sequence', () => {
      const quat1 = QuaternionPool.acquire();
      const quat2 = QuaternionPool.acquire();
      const quat3 = QuaternionPool.acquire();

      // Modify quaternions to track them
      quat1.set(1, 0, 0, 0);
      quat2.set(0, 1, 0, 0);
      quat3.set(0, 0, 1, 0);

      // Reset and acquire again
      QuaternionPool.reset();
      const resetQuat1 = QuaternionPool.acquire();
      const resetQuat2 = QuaternionPool.acquire();
      const resetQuat3 = QuaternionPool.acquire();

      // Should get the same instances (but reset)
      expect(resetQuat1).toBe(quat1);
      expect(resetQuat2).toBe(quat2);
      expect(resetQuat3).toBe(quat3);
    });
  });

  describe('release', () => {
    it('should accept a quaternion without error', () => {
      const quat = QuaternionPool.acquire();

      // Release should not throw
      expect(() => {
        QuaternionPool.release(quat);
      }).not.toThrow();
    });

    it('should be a no-op (quaternion state unchanged)', () => {
      const quat = QuaternionPool.acquire();
      quat.set(0.5, 0.5, 0.5, 0.5);

      QuaternionPool.release(quat);

      // Values should remain the same after release
      expect(quat.x).toBe(0.5);
      expect(quat.y).toBe(0.5);
      expect(quat.z).toBe(0.5);
      expect(quat.w).toBe(0.5);
    });
  });

  describe('reset', () => {
    it('should reset the pool index', () => {
      // Acquire some quaternions
      QuaternionPool.acquire();
      QuaternionPool.acquire();
      QuaternionPool.acquire();

      // Reset the pool
      QuaternionPool.reset();

      // The next acquire should return the first quaternion from the pool
      const quat = QuaternionPool.acquire();
      expect(quat).toBeInstanceOf(THREE.Quaternion);
      expect(quat.x).toBe(0);
      expect(quat.y).toBe(0);
      expect(quat.z).toBe(0);
      expect(quat.w).toBe(1);
    });

    it('should allow reusing quaternions after reset', () => {
      // Acquire and modify quaternions
      const quat1 = QuaternionPool.acquire();
      const quat2 = QuaternionPool.acquire();

      quat1.set(1, 1, 1, 1);
      quat2.set(2, 2, 2, 2);

      // Reset the pool
      QuaternionPool.reset();

      // Acquire again - should get the same instances (reset to identity)
      const resetQuat1 = QuaternionPool.acquire();
      const resetQuat2 = QuaternionPool.acquire();

      expect(resetQuat1).toBe(quat1);
      expect(resetQuat2).toBe(quat2);
      expect(resetQuat1.x).toBe(0);
      expect(resetQuat1.y).toBe(0);
      expect(resetQuat1.z).toBe(0);
      expect(resetQuat1.w).toBe(1);
    });

    it('should handle multiple resets', () => {
      QuaternionPool.acquire();
      QuaternionPool.reset();
      QuaternionPool.acquire();
      QuaternionPool.reset();
      QuaternionPool.acquire();
      QuaternionPool.reset();

      // Should still work correctly
      const quat = QuaternionPool.acquire();
      expect(quat).toBeInstanceOf(THREE.Quaternion);
      expect(quat.x).toBe(0);
      expect(quat.y).toBe(0);
      expect(quat.z).toBe(0);
      expect(quat.w).toBe(1);
    });
  });

  describe('performance', () => {
    it('should handle rapid acquire/reset cycles', () => {
      for (let cycle = 0; cycle < 10; cycle++) {
        // Acquire many quaternions
        for (let i = 0; i < 100; i++) {
          const quat = QuaternionPool.acquire();
          expect(quat).toBeInstanceOf(THREE.Quaternion);
        }

        // Reset for next cycle
        QuaternionPool.reset();
      }

      // Pool should still work correctly
      const quat = QuaternionPool.acquire();
      expect(quat).toBeInstanceOf(THREE.Quaternion);
      expect(quat.x).toBe(0);
      expect(quat.y).toBe(0);
      expect(quat.z).toBe(0);
      expect(quat.w).toBe(1);
    });

    it('should efficiently reuse quaternions', () => {
      // Acquire quaternions
      const firstBatch: THREE.Quaternion[] = [];
      for (let i = 0; i < 50; i++) {
        firstBatch.push(QuaternionPool.acquire());
      }

      // Reset and acquire again
      QuaternionPool.reset();
      const secondBatch: THREE.Quaternion[] = [];
      for (let i = 0; i < 50; i++) {
        secondBatch.push(QuaternionPool.acquire());
      }

      // Should have reused the same instances
      for (let i = 0; i < 50; i++) {
        expect(secondBatch[i]).toBe(firstBatch[i]);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle acquiring exactly the pool size', () => {
      const quaternions: THREE.Quaternion[] = [];

      for (let i = 0; i < 200; i++) {
        quaternions.push(QuaternionPool.acquire());
      }

      expect(quaternions.length).toBe(200);

      // All should be valid
      for (const quat of quaternions) {
        expect(quat).toBeInstanceOf(THREE.Quaternion);
      }
    });

    it('should handle acquiring one more than pool size', () => {
      const quaternions: THREE.Quaternion[] = [];

      for (let i = 0; i < 201; i++) {
        quaternions.push(QuaternionPool.acquire());
      }

      expect(quaternions.length).toBe(201);

      // All should be valid
      for (const quat of quaternions) {
        expect(quat).toBeInstanceOf(THREE.Quaternion);
        expect(quat.x).toBe(0);
        expect(quat.y).toBe(0);
        expect(quat.z).toBe(0);
        expect(quat.w).toBe(1);
      }
    });

    it('should handle reset without prior acquire', () => {
      // Reset without acquiring anything
      expect(() => {
        QuaternionPool.reset();
      }).not.toThrow();

      // Should still work normally
      const quat = QuaternionPool.acquire();
      expect(quat).toBeInstanceOf(THREE.Quaternion);
    });
  });
});
