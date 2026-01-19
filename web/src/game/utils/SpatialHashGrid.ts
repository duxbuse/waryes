import * as THREE from 'three';

export class SpatialHashGrid<T extends { position: THREE.Vector3; id: string }> {
  private cells: Map<string, Set<T>> = new Map();
  private entityCells: Map<string, string> = new Map(); // entity id -> cell key
  private cellSize: number;

  constructor(cellSize: number = 50) {
    this.cellSize = cellSize;
  }

  private getCellKey(x: number, z: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);
    return `${cellX},${cellZ}`;
  }

  insert(entity: T): void {
    const key = this.getCellKey(entity.position.x, entity.position.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(entity);
    this.entityCells.set(entity.id, key);
  }

  remove(entity: T): void {
    const key = this.entityCells.get(entity.id);
    if (key) {
      this.cells.get(key)?.delete(entity);
      this.entityCells.delete(entity.id);
    }
  }

  update(entity: T): void {
    const oldKey = this.entityCells.get(entity.id);
    const newKey = this.getCellKey(entity.position.x, entity.position.z);

    if (oldKey !== newKey) {
      if (oldKey) {
        this.cells.get(oldKey)?.delete(entity);
      }
      if (!this.cells.has(newKey)) {
        this.cells.set(newKey, new Set());
      }
      this.cells.get(newKey)!.add(entity);
      this.entityCells.set(entity.id, newKey);
    }
  }

  queryRadius(center: THREE.Vector3, radius: number): T[] {
    const results: T[] = [];
    const radiusSq = radius * radius;

    const minCellX = Math.floor((center.x - radius) / this.cellSize);
    const maxCellX = Math.floor((center.x + radius) / this.cellSize);
    const minCellZ = Math.floor((center.z - radius) / this.cellSize);
    const maxCellZ = Math.floor((center.z + radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const cell = this.cells.get(`${cx},${cz}`);
        if (cell) {
          for (const entity of cell) {
            const dx = entity.position.x - center.x;
            const dz = entity.position.z - center.z;
            if (dx * dx + dz * dz <= radiusSq) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  clear(): void {
    this.cells.clear();
    this.entityCells.clear();
  }
}
