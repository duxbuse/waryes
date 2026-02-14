import * as THREE from 'three';

class VectorPoolClass {
  private vectors: THREE.Vector3[] = [];
  private index: number = 0;
  private readonly POOL_SIZE = 200;

  constructor() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      this.vectors.push(new THREE.Vector3());
    }
  }

  acquire(): THREE.Vector3 {
    if (this.index >= this.vectors.length) {
      // Expand pool if needed
      this.vectors.push(new THREE.Vector3());
    }
    const vector = this.vectors[this.index++];
    if (!vector) {
      throw new Error('Failed to acquire vector from pool');
    }
    return vector.set(0, 0, 0);
  }

  release(vector: THREE.Vector3): void {
    // Simple implementation: no-op for now
    // The pool is reset in bulk at the start of each frame
    // This method exists for API compatibility and future optimization
    void vector;
  }

  reset(): void {
    this.index = 0;
  }

  getStats(): { active: number; total: number } {
    return { active: this.index, total: this.vectors.length };
  }
}

export const VectorPool = new VectorPoolClass();
