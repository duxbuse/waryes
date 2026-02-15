/**
 * LocalAvoidance - Deterministic ORCA-inspired collision avoidance for RTS units
 *
 * Replaces the simple radius-based repulsion (applySeparation) with smooth,
 * collision-free velocity steering. Each unit computes an adjusted velocity
 * that avoids collisions with nearby units while staying close to its
 * preferred (desired) velocity.
 *
 * Determinism guarantees:
 *   - Uses SpatialHashGrid for neighbor queries (deterministic iteration order)
 *   - Fixed-order processing (units processed by caller, always same order)
 *   - Uses only basic arithmetic (no trig, minimal sqrt)
 *   - Runs in fixedUpdate at fixed 60Hz timestep
 */

import * as THREE from 'three';
import type { SimUnit } from './SimUnit';
import type { SimGameContext } from '../core/SimGameContext';

// Reusable temp vectors (module-level, zero per-frame allocation)
const _relPos = new THREE.Vector3();
const _adjustedVel = new THREE.Vector3();
const _halfPlaneNormal = new THREE.Vector3();
const _correction = new THREE.Vector3();
const _testPos = new THREE.Vector3();

/**
 * Compute an avoidance-adjusted velocity for a unit.
 *
 * @param unit - The unit computing avoidance
 * @param preferredVelocity - The velocity the unit wants to move at (movement direction * speed)
 * @param context - Game context for spatial queries and terrain
 * @returns Adjusted velocity vector (written into preferredVelocity in-place for zero alloc)
 */
export function computeAvoidanceVelocity(
  unit: SimUnit,
  preferredVelocity: THREE.Vector3,
  context: SimGameContext,
): THREE.Vector3 {
  const collisionRadius = unit.getCollisionRadius();
  const checkRadius = collisionRadius * 4;

  const nearbyUnits = context.getUnitsInRadius(unit.simPosition, checkRadius, unit.team);

  if (nearbyUnits.length <= 1) {
    // No neighbors (or only self) — no avoidance needed
    return preferredVelocity;
  }

  _adjustedVel.copy(preferredVelocity);
  let constraintCount = 0;

  for (const other of nearbyUnits) {
    if (other.id === unit.id) continue;
    if (other.health <= 0) continue;

    // Relative position: other relative to unit
    _relPos.subVectors(other.simPosition, unit.simPosition);
    _relPos.y = 0;
    const dist = _relPos.length();

    const otherRadius = other.getCollisionRadius();
    const combinedRadius = collisionRadius + otherRadius + 0.5; // 0.5m buffer

    if (dist >= combinedRadius * 2.5) continue; // Too far for avoidance
    if (dist < 0.01) continue; // Overlapping, skip to avoid NaN

    // Compute ORCA half-plane
    // The velocity obstacle is the set of velocities that would cause collision
    // within the time horizon. We use a simplified version:
    // half-plane normal points from the unit toward the collision boundary

    // Normal: direction from unit to other, normalized
    _halfPlaneNormal.copy(_relPos).divideScalar(dist);

    // How much the unit's velocity projects onto the half-plane normal
    // (velocity component toward the other unit)
    const velTowardOther = _adjustedVel.x * _halfPlaneNormal.x + _adjustedVel.z * _halfPlaneNormal.z;

    // Penetration: how far inside the combined radius we are
    const penetration = combinedRadius - dist;

    if (penetration > 0) {
      // Units are overlapping or very close — push apart
      // Stronger correction for deeper penetration
      const pushStrength = (penetration / combinedRadius) * preferredVelocity.length() * 1.2;

      _correction.copy(_halfPlaneNormal).multiplyScalar(-pushStrength);
      _adjustedVel.add(_correction);
      constraintCount++;
    } else if (velTowardOther > 0) {
      // Moving toward other unit — apply reciprocal avoidance
      // Each agent takes half the responsibility (ORCA reciprocity)
      const timeToCollision = (dist - combinedRadius) / velTowardOther;

      if (timeToCollision < 2.0) { // Only avoid if collision within 2 seconds
        // Correction: remove the velocity component toward the other unit
        // scaled by urgency (closer = stronger correction)
        const urgency = 1.0 - Math.min(timeToCollision / 2.0, 1.0);
        const correctionMagnitude = velTowardOther * urgency * 0.5; // 0.5 for reciprocal

        _correction.copy(_halfPlaneNormal).multiplyScalar(-correctionMagnitude);
        _adjustedVel.add(_correction);
        constraintCount++;
      }
    }
  }

  // Terrain-aware clamping: if the adjusted velocity pushes into steep terrain,
  // project it to stay on walkable ground
  if (constraintCount > 0 && context.getTerrainAt !== undefined) {
    _testPos.copy(unit.simPosition).add(_adjustedVel);
    const currentHeight = context.getElevationAt(unit.simPosition.x, unit.simPosition.z);
    const nextHeight = context.getElevationAt(_testPos.x, _testPos.z);
    const horizontalDist = Math.sqrt(_adjustedVel.x * _adjustedVel.x + _adjustedVel.z * _adjustedVel.z);

    if (horizontalDist > 0.01) {
      const slope = Math.abs(nextHeight - currentHeight) / horizontalDist;
      if (slope > 1.0) {
        // Avoidance is pushing into a cliff — fall back to preferred velocity
        // This prevents avoidance from pushing units off cliffs
        _adjustedVel.copy(preferredVelocity);
      }
    }
  }

  // Preserve original speed (don't let avoidance slow units down too much)
  const originalSpeed = preferredVelocity.length();
  const adjustedSpeed = _adjustedVel.length();
  if (adjustedSpeed > 0.01 && originalSpeed > 0.01) {
    // Clamp adjusted speed to be at least 50% of original
    const minSpeed = originalSpeed * 0.5;
    if (adjustedSpeed < minSpeed) {
      _adjustedVel.multiplyScalar(minSpeed / adjustedSpeed);
    }
    // Don't exceed original speed
    if (adjustedSpeed > originalSpeed) {
      _adjustedVel.multiplyScalar(originalSpeed / adjustedSpeed);
    }
  }

  // Write result back into preferredVelocity (zero allocation)
  preferredVelocity.copy(_adjustedVel);
  return preferredVelocity;
}
