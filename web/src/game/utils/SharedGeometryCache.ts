import * as THREE from 'three';

const geometryCache = new Map<string, THREE.BufferGeometry>();

const CATEGORY_GEOMETRIES: Record<string, () => THREE.BufferGeometry> = {
  'INF': () => new THREE.BoxGeometry(0.8, 1.8, 0.5),
  'REC': () => new THREE.BoxGeometry(2, 1.2, 3),
  'TNK': () => new THREE.BoxGeometry(3, 1.5, 4),
  'VHC': () => new THREE.BoxGeometry(2.5, 1.5, 4),
  'ART': () => new THREE.BoxGeometry(2.5, 1.2, 5),
  'AA': () => new THREE.BoxGeometry(2.5, 2, 4),
  'HEL': () => new THREE.BoxGeometry(3, 1.5, 8),
  'PLN': () => new THREE.BoxGeometry(4, 1, 10),
  'LOG': () => new THREE.BoxGeometry(2.5, 2, 5),
};

export const CATEGORY_HEIGHTS: Record<string, number> = {
  'INF': 1.8, 'REC': 1.2, 'TNK': 1.5, 'VHC': 1.5,
  'ART': 1.2, 'AA': 2, 'HEL': 1.5, 'PLN': 1, 'LOG': 2,
};

export function getUnitGeometry(category: string): THREE.BufferGeometry {
  const key = category || 'INF';
  if (!geometryCache.has(key)) {
    const factory = CATEGORY_GEOMETRIES[key] || CATEGORY_GEOMETRIES['INF'];
    const geometry = factory();
    geometry.computeBoundingSphere();
    geometryCache.set(key, geometry);
  }
  return geometryCache.get(key)!;
}

export function disposeAllGeometries(): void {
  for (const geometry of geometryCache.values()) {
    geometry.dispose();
  }
  geometryCache.clear();
}
