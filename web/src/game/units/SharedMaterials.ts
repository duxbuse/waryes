import * as THREE from 'three';

/**
 * Shared materials for units to reduce draw calls and memory usage.
 * Instead of creating a new material per unit, we reuse materials based on team/owner.
 */

// Unit body materials (MeshBasicMaterial for bright colors unaffected by lighting)
const unitMaterials = {
  player: new THREE.MeshBasicMaterial({
    color: 0x4a9eff, // Blue for player's own units
    depthWrite: true,
    depthTest: true,
    transparent: false,
    side: THREE.DoubleSide,
  }),
  ally: new THREE.MeshBasicMaterial({
    color: 0x4aff4a, // Green for allied units
    depthWrite: true,
    depthTest: true,
    transparent: false,
    side: THREE.DoubleSide,
  }),
  enemy: new THREE.MeshBasicMaterial({
    color: 0xff4a4a, // Red for enemies
    depthWrite: true,
    depthTest: true,
    transparent: false,
    side: THREE.DoubleSide,
  }),
};

// Wireframe material (shared across all units)
const wireframeMaterial = new THREE.LineBasicMaterial({
  color: 0x000000,
  linewidth: 2,
});

// Selection ring materials
const selectionRingMaterials = {
  selected: new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  }),
  hover: new THREE.MeshBasicMaterial({
    color: 0xffff00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6,
  }),
};

export type UnitMaterialType = 'player' | 'ally' | 'enemy';

/**
 * Get the appropriate shared material for a unit based on team and owner
 */
export function getUnitMaterial(team: string, ownerId: string): THREE.MeshBasicMaterial {
  if (team === 'enemy') {
    return unitMaterials.enemy;
  }
  if (ownerId === 'player') {
    return unitMaterials.player;
  }
  return unitMaterials.ally;
}

/**
 * Get the shared wireframe material
 */
export function getWireframeMaterial(): THREE.LineBasicMaterial {
  return wireframeMaterial;
}

/**
 * Get the shared selection ring material
 */
export function getSelectionRingMaterial(type: 'selected' | 'hover' = 'selected'): THREE.MeshBasicMaterial {
  return selectionRingMaterials[type];
}

/**
 * Get all shared materials (useful for disposal on cleanup)
 */
export function getAllSharedMaterials(): THREE.Material[] {
  return [
    unitMaterials.player,
    unitMaterials.ally,
    unitMaterials.enemy,
    wireframeMaterial,
    selectionRingMaterials.selected,
    selectionRingMaterials.hover,
  ];
}
