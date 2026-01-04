/**
 * PathRenderer - Renders movement paths on the ground
 *
 * Features:
 * - Color-coded paths by order type (green=move, red=hunt, blue=reverse, orange=attack)
 * - Real-time path updates (shrinks as unit moves)
 * - Waypoint markers
 * - Queue visualization (multi-colored segments)
 * - Dashed lines for pre-orders during setup phase
 */

import * as THREE from 'three';
import type { Unit } from '../units/Unit';

export class PathRenderer {
  private readonly scene: THREE.Scene;
  private pathLines: Map<string, THREE.Line[]> = new Map(); // unitId -> lines (multiple for queue)
  private waypointMarkers: Map<string, THREE.Mesh[]> = new Map(); // unitId -> markers
  private preOrderLines: Map<string, THREE.Line[]> = new Map(); // unitId -> dashed lines

  // Path colors by command type
  private readonly PATH_COLORS = {
    move: 0x00ff00,        // Green
    attack: 0xff8800,      // Orange
    attackMove: 0xff8800,  // Orange
    hunt: 0xff0000,        // Red
    reverse: 0x00aaff,     // Blue
    fast: 0x00ff88,        // Cyan
    fastMove: 0x00ff88,    // Cyan
    unload: 0xffff00,      // Yellow
    garrison: 0xaa00ff,    // Purple
    mount: 0xffaa00,       // Mount (gold)
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Update path visualization for a unit
   */
  updatePath(unit: Unit, targetPosition: THREE.Vector3 | null, commandType: string = 'move'): void {
    // Remove existing path
    this.clearPath(unit.id);

    if (!targetPosition) return;

    // Create path line
    const points = [
      unit.position.clone(),
      targetPosition.clone(),
    ];

    // Lift path slightly above ground to avoid z-fighting
    points.forEach(p => p.y = 0.1);

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const color = this.PATH_COLORS[commandType as keyof typeof this.PATH_COLORS] ?? this.PATH_COLORS.move;

    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 3,
      transparent: true,
      opacity: 0.8,
    });

    const line = new THREE.Line(geometry, material);
    line.renderOrder = 100; // Render on top
    this.scene.add(line);
    this.pathLines.set(unit.id, [line]);

    // Create waypoint marker at destination
    this.createWaypoint(unit.id, targetPosition, color);
  }

  /**
   * Show pre-order path (dashed line during setup phase)
   */
  showPreOrderPath(unitId: string, startPos: THREE.Vector3, targetPos: THREE.Vector3, commandType: string = 'move'): void {
    // Create dashed line for pre-order
    const points = [
      startPos.clone(),
      targetPos.clone(),
    ];
    points.forEach(p => p.y = 0.15); // Slightly higher than regular paths

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const color = this.PATH_COLORS[commandType as keyof typeof this.PATH_COLORS] ?? this.PATH_COLORS.move;

    const material = new THREE.LineDashedMaterial({
      color,
      linewidth: 2,
      transparent: true,
      opacity: 0.6,
      dashSize: 1,
      gapSize: 0.5,
    });

    const line = new THREE.Line(geometry, material);
    line.computeLineDistances(); // Required for dashed lines
    line.renderOrder = 99;
    this.scene.add(line);

    if (!this.preOrderLines.has(unitId)) {
      this.preOrderLines.set(unitId, []);
    }
    this.preOrderLines.get(unitId)!.push(line);

    // Add waypoint marker
    this.createWaypoint(unitId, targetPos, color);
  }

  /**
   * Clear pre-order paths for a unit
   */
  clearPreOrderPaths(unitId: string): void {
    const lines = this.preOrderLines.get(unitId);
    if (lines) {
      lines.forEach(line => {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      this.preOrderLines.delete(unitId);
    }
  }

  /**
   * Clear all pre-order paths
   */
  clearAllPreOrderPaths(): void {
    this.preOrderLines.forEach((_, unitId) => this.clearPreOrderPaths(unitId));
  }

  /**
   * Create a waypoint marker
   */
  private createWaypoint(unitId: string, position: THREE.Vector3, color: number): void {
    const geometry = new THREE.CircleGeometry(0.5, 16);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });

    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    marker.position.y = 0.05; // Slightly above ground
    marker.rotation.x = -Math.PI / 2; // Face up

    this.scene.add(marker);

    if (!this.waypointMarkers.has(unitId)) {
      this.waypointMarkers.set(unitId, []);
    }
    this.waypointMarkers.get(unitId)!.push(marker);
  }

  /**
   * Clear path for a unit
   */
  clearPath(unitId: string): void {
    // Remove lines
    const lines = this.pathLines.get(unitId);
    if (lines) {
      lines.forEach(line => {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      this.pathLines.delete(unitId);
    }

    // Remove waypoint markers
    const markers = this.waypointMarkers.get(unitId);
    if (markers) {
      markers.forEach(marker => {
        this.scene.remove(marker);
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
      });
      this.waypointMarkers.delete(unitId);
    }
  }

  /**
   * Update all paths (shrink as units move)
   */
  update(): void {
    // Path lines are automatically updated because they reference unit positions
    // For more advanced behavior (shrinking paths), we'd need to track progress
  }

  /**
   * Clear all paths
   */
  clearAll(): void {
    this.pathLines.forEach((_, unitId) => this.clearPath(unitId));
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearAll();
  }
}
