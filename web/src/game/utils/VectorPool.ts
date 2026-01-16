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
    return this.vectors[this.index++].set(0, 0, 0);
  }

  reset(): void {
    this.index = 0;
  }
}

export const VectorPool = new VectorPoolClass();
