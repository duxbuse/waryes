export interface IPoolable {
  reset(): void;
  active: boolean;
}

export class ObjectPool<T extends IPoolable> {
  private pool: T[] = [];
  private factory: () => T;
  private maxSize: number;

  constructor(factory: () => T, initialSize: number, maxSize: number) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.preWarm(initialSize);
  }

  preWarm(count: number): void {
    for (let i = 0; i < count; i++) {
      const obj = this.factory();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  acquire(): T | null {
    for (const obj of this.pool) {
      if (!obj.active) {
        obj.active = true;
        return obj;
      }
    }
    if (this.pool.length < this.maxSize) {
      const obj = this.factory();
      obj.active = true;
      this.pool.push(obj);
      return obj;
    }
    return null;
  }

  release(obj: T): void {
    obj.active = false;
    obj.reset();
  }

  getStats(): { active: number; total: number } {
    const active = this.pool.filter(o => o.active).length;
    return { active, total: this.pool.length };
  }
}
