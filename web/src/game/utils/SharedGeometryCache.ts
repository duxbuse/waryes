import * as THREE from 'three';

const geometryCache = new Map<string, THREE.BufferGeometry>();

// Geometry definitions matching Unit.ts dimensions for visual consistency
const CATEGORY_GEOMETRIES: Record<string, () => THREE.BufferGeometry> = {
  'INF': () => new THREE.BoxGeometry(2, 2.5, 2),       // Infantry - upright box
  'REC': () => new THREE.BoxGeometry(2.2, 1.5, 3),    // Recon - medium box
  'TNK': () => new THREE.BoxGeometry(3, 1.5, 4),      // Tanks - large box
  'VHC': () => new THREE.BoxGeometry(2.5, 1.5, 4),    // Vehicles
  'ART': () => new THREE.BoxGeometry(2.5, 1.5, 3.5),  // Artillery - wide box
  'AA': () => new THREE.BoxGeometry(2.2, 1.5, 3),     // Anti-air - medium box
  'HEL': () => new THREE.BoxGeometry(2.5, 0.8, 3.5),  // Helicopters - flat box
  'PLN': () => new THREE.BoxGeometry(3, 0.6, 4),      // Planes - flat wedge-like
  'AIR': () => new THREE.BoxGeometry(3, 0.6, 4),      // Aircraft (alias for PLN)
  'LOG': () => new THREE.BoxGeometry(2.5, 1.5, 3.5),  // Logistics - box
};

// Geometry heights (Y dimension of the box) for ground positioning
export const CATEGORY_HEIGHTS: Record<string, number> = {
  'INF': 2.5, 'REC': 1.5, 'TNK': 1.5, 'VHC': 1.5,
  'ART': 1.5, 'AA': 1.5, 'HEL': 0.8, 'PLN': 0.6, 'AIR': 0.6, 'LOG': 1.5,
};

// Flying altitudes for aircraft (Y position, not geometry height)
export const FLYING_ALTITUDES: Record<string, number> = {
  'HEL': 8,
  'PLN': 15,
  'AIR': 15,
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
