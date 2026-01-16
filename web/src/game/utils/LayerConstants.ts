/**
 * THREE.js layer constants for separating rendering from raycasting
 *
 * Layers allow objects to be selectively rendered or raycast:
 * - Camera.layers controls what gets rendered
 * - Raycaster.layers controls what gets tested for intersection
 */

export const LAYERS = {
  /**
   * Default layer - both rendered and raycast
   * Used for most game objects (terrain, UI, effects)
   */
  DEFAULT: 0,

  /**
   * RAYCAST_ONLY - Objects on this layer are NOT rendered, but ARE raycast-able
   * Used for invisible collision meshes that need to be clicked/selected
   * Example: Unit bodyMesh for selection while instanced mesh handles rendering
   */
  RAYCAST_ONLY: 1,

  /**
   * RENDER_ONLY - Objects on this layer ARE rendered, but NOT raycast-able
   * Used for visual-only objects that don't need interaction
   * Example: Instanced unit meshes (selection handled by RAYCAST_ONLY layer)
   */
  RENDER_ONLY: 2,
} as const;
