import * as THREE from 'three';

class QuaternionPoolClass {
  private quaternions: THREE.Quaternion[] = [];
  private index: number = 0;
  private readonly POOL_SIZE = 200;

  constructor() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      this.quaternions.push(new THREE.Quaternion());
    }
  }

  acquire(): THREE.Quaternion {
    if (this.index >= this.quaternions.length) {
      // Expand pool if needed
      this.quaternions.push(new THREE.Quaternion());
    }
    const quaternion = this.quaternions[this.index++];
    if (!quaternion) {
      throw new Error('Failed to acquire quaternion from pool');
    }
    return quaternion.set(0, 0, 0, 1);
  }

  release(quaternion: THREE.Quaternion): void {
    // Simple implementation: no-op for now
    // The pool is reset in bulk at the start of each frame
    // This method exists for API compatibility and future optimization
    void quaternion;
  }

  reset(): void {
    this.index = 0;
  }
}

export const QuaternionPool = new QuaternionPoolClass();
