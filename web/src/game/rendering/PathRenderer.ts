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
import type { Game } from '../../core/Game';

interface PathData {
  line: THREE.Mesh | THREE.Line; // Can be Mesh (ribbon) or Line (fallback)
  unit: Unit;
  target: THREE.Vector3;
}

export class PathRenderer {
  private readonly scene: THREE.Scene;
  private readonly game: Game;
  private pathData: Map<string, PathData[]> = new Map(); // unitId -> path data (multiple for queue)
  private waypointMarkers: Map<string, THREE.Mesh[]> = new Map(); // unitId -> markers
  private preOrderLines: Map<string, (THREE.Line | THREE.Group)[]> = new Map(); // unitId -> dashed lines or groups

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

  // Height offset above terrain for visibility
  private readonly PATH_HEIGHT_OFFSET = 0.5; // 0.5m above terrain

  constructor(scene: THREE.Scene, game: Game) {
    this.scene = scene;
    this.game = game;
  }

  /**
   * Update path visualization for a unit
   * Only shows paths for player-owned units (not enemies or AI allies)
   */
  updatePath(unit: Unit, targetPosition: THREE.Vector3 | null, commandType: string = 'move'): void {
    // Remove existing path
    this.clearPath(unit.id);

    if (!targetPosition) return;

    // Only show paths for player-owned units
    if (unit.ownerId !== 'player') return;

    // Create path line
    const points = [
      unit.position.clone(),
      targetPosition.clone(),
    ];

    // Sample terrain elevation and lift path above it for visibility
    points.forEach(p => {
      const terrainHeight = this.game.getElevationAt(p.x, p.z);
      p.y = terrainHeight + this.PATH_HEIGHT_OFFSET;
    });

    const color = this.PATH_COLORS[commandType as keyof typeof this.PATH_COLORS] ?? this.PATH_COLORS.move;

    // Create a visible ribbon/tube for the path since linewidth doesn't work in WebGL
    const pathWidth = 0.3; // Width of the path ribbon in meters
    const direction = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(pathWidth / 2);

    // Create a ribbon geometry (quad strip along the path)
    const ribbonVertices = new Float32Array([
      // First segment
      points[0].x - perpendicular.x, points[0].y, points[0].z - perpendicular.z,
      points[0].x + perpendicular.x, points[0].y, points[0].z + perpendicular.z,
      points[1].x - perpendicular.x, points[1].y, points[1].z - perpendicular.z,
      points[1].x + perpendicular.x, points[1].y, points[1].z + perpendicular.z,
    ]);

    const ribbonIndices = new Uint16Array([0, 1, 2, 1, 3, 2]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(ribbonVertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(ribbonIndices, 1));

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const line = new THREE.Mesh(geometry, material);
    line.renderOrder = 100; // Render on top
    this.scene.add(line);

    // Store path data with unit reference for dynamic updates
    this.pathData.set(unit.id, [{
      line,
      unit,
      target: targetPosition.clone(),
    }]);

    // Create waypoint marker at destination
    this.createWaypoint(unit.id, targetPosition, color);
  }

  /**
   * Update path queue visualization for a unit with multiple waypoints
   * Shows connected path segments for all queued commands
   * Only shows paths for player-owned units (not enemies or AI allies)
   */
  updatePathQueue(unit: Unit, commandQueue: Array<{ type: string; target?: THREE.Vector3 }>): void {
    // Remove existing path
    this.clearPath(unit.id);

    // Only show paths for player-owned units
    if (unit.ownerId !== 'player') return;

    // Build list of waypoints from command queue
    const waypoints: Array<{ position: THREE.Vector3; commandType: string }> = [];

    // Add all commands with target positions
    for (const command of commandQueue) {
      if (command.target) {
        waypoints.push({
          position: command.target.clone(),
          commandType: command.type,
        });
      }
    }

    // No waypoints to render
    if (waypoints.length === 0) return;

    const pathDataList: PathData[] = [];

    // Create path segments between consecutive waypoints
    let startPos = unit.position.clone();

    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      const endPos = waypoint.position.clone();
      const commandType = waypoint.commandType;

      // Sample terrain elevation and lift path above it for visibility
      const startTerrainHeight = this.game.getElevationAt(startPos.x, startPos.z);
      const endTerrainHeight = this.game.getElevationAt(endPos.x, endPos.z);

      const startY = startTerrainHeight + this.PATH_HEIGHT_OFFSET;
      const endY = endTerrainHeight + this.PATH_HEIGHT_OFFSET;

      const adjustedStart = new THREE.Vector3(startPos.x, startY, startPos.z);
      const adjustedEnd = new THREE.Vector3(endPos.x, endY, endPos.z);

      // Get color for this command type
      const color = this.PATH_COLORS[commandType as keyof typeof this.PATH_COLORS] ?? this.PATH_COLORS.move;

      // Create a visible ribbon for this segment
      const pathWidth = 0.3;
      const direction = new THREE.Vector3().subVectors(adjustedEnd, adjustedStart).normalize();
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(pathWidth / 2);

      // Create a ribbon geometry (quad strip along the path)
      const ribbonVertices = new Float32Array([
        adjustedStart.x - perpendicular.x, adjustedStart.y, adjustedStart.z - perpendicular.z,
        adjustedStart.x + perpendicular.x, adjustedStart.y, adjustedStart.z + perpendicular.z,
        adjustedEnd.x - perpendicular.x, adjustedEnd.y, adjustedEnd.z - perpendicular.z,
        adjustedEnd.x + perpendicular.x, adjustedEnd.y, adjustedEnd.z + perpendicular.z,
      ]);

      const ribbonIndices = new Uint16Array([0, 1, 2, 1, 3, 2]);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(ribbonVertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(ribbonIndices, 1));

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const line = new THREE.Mesh(geometry, material);
      line.renderOrder = 100; // Render on top
      this.scene.add(line);

      // Store path data for this segment
      pathDataList.push({
        line,
        unit,
        target: endPos,
      });

      // Create waypoint marker at this destination
      this.createWaypoint(unit.id, endPos, color);

      // Next segment starts where this one ends
      startPos = endPos;
    }

    // Store all path segments for this unit
    if (pathDataList.length > 0) {
      this.pathData.set(unit.id, pathDataList);
    }
  }

  /**
   * Show pre-order path (dashed line during setup phase)
   * Only shows paths for player-owned units
   */
  showPreOrderPath(unit: Unit, startPos: THREE.Vector3, targetPos: THREE.Vector3, commandType: string = 'move'): void {
    // Only show paths for player-owned units
    if (unit.ownerId !== 'player') return;

    const unitId = unit.id;
    // Create dashed line for pre-order
    const points = [
      startPos.clone(),
      targetPos.clone(),
    ];
    // Sample terrain elevation and lift pre-order path slightly higher for distinction
    points.forEach(p => {
      const terrainHeight = this.game.getElevationAt(p.x, p.z);
      p.y = terrainHeight + this.PATH_HEIGHT_OFFSET + 0.2; // Slightly higher than regular paths
    });

    const color = this.PATH_COLORS[commandType as keyof typeof this.PATH_COLORS] ?? this.PATH_COLORS.move;

    // Create a visible ribbon for pre-order path
    const pathWidth = 0.25; // Slightly thinner than regular paths
    const direction = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(pathWidth / 2);

    // Create dashed ribbon by creating multiple small segments
    const segmentLength = 2; // Length of each dash
    const gapLength = 1; // Length of each gap
    const totalDistance = points[0].distanceTo(points[1]);
    const dashPattern = segmentLength + gapLength;
    const numDashes = Math.floor(totalDistance / dashPattern);

    const segmentGeometries: THREE.BufferGeometry[] = [];

    for (let i = 0; i < numDashes; i++) {
      const t1 = (i * dashPattern) / totalDistance;
      const t2 = Math.min((i * dashPattern + segmentLength) / totalDistance, 1);

      const p1 = new THREE.Vector3().lerpVectors(points[0], points[1], t1);
      const p2 = new THREE.Vector3().lerpVectors(points[0], points[1], t2);

      const segmentVertices = new Float32Array([
        p1.x - perpendicular.x, p1.y, p1.z - perpendicular.z,
        p1.x + perpendicular.x, p1.y, p1.z + perpendicular.z,
        p2.x - perpendicular.x, p2.y, p2.z - perpendicular.z,
        p2.x + perpendicular.x, p2.y, p2.z + perpendicular.z,
      ]);

      const segmentIndices = new Uint16Array([0, 1, 2, 1, 3, 2]);

      const segmentGeometry = new THREE.BufferGeometry();
      segmentGeometry.setAttribute('position', new THREE.BufferAttribute(segmentVertices, 3));
      segmentGeometry.setIndex(new THREE.BufferAttribute(segmentIndices, 1));

      segmentGeometries.push(segmentGeometry);
    }

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create a group to hold all dash segments
    const lineGroup = new THREE.Group();
    segmentGeometries.forEach(geom => {
      const mesh = new THREE.Mesh(geom, material);
      mesh.renderOrder = 99;
      lineGroup.add(mesh);
    });

    this.scene.add(lineGroup);

    if (!this.preOrderLines.has(unitId)) {
      this.preOrderLines.set(unitId, []);
    }
    this.preOrderLines.get(unitId)!.push(lineGroup);

    // Add waypoint marker
    this.createWaypoint(unitId, targetPos, color);
  }

  /**
   * Clear pre-order paths for a unit
   */
  clearPreOrderPaths(unitId: string): void {
    const lines = this.preOrderLines.get(unitId);
    if (lines) {
      lines.forEach(lineOrGroup => {
        this.scene.remove(lineOrGroup);
        if (lineOrGroup instanceof THREE.Group) {
          // Dispose all children in the group
          lineOrGroup.children.forEach(child => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          });
        } else {
          // It's a Line
          lineOrGroup.geometry.dispose();
          (lineOrGroup.material as THREE.Material).dispose();
        }
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
    // Sample terrain elevation and place marker above it
    const terrainHeight = this.game.getElevationAt(position.x, position.z);
    marker.position.y = terrainHeight + this.PATH_HEIGHT_OFFSET - 0.1; // Slightly below path line
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
    const data = this.pathData.get(unitId);
    if (data) {
      data.forEach(d => {
        this.scene.remove(d.line);
        d.line.geometry.dispose();
        (d.line.material as THREE.Material).dispose();
      });
      this.pathData.delete(unitId);
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
   * For multi-segment paths, only the first segment shrinks. When the unit reaches
   * the first waypoint, that segment is removed and the next segment becomes active.
   */
  update(): void {
    // Update each unit's path queue
    for (const [unitId, dataList] of this.pathData) {
      if (dataList.length === 0) continue;

      // Get the first segment (active segment unit is moving toward)
      const firstSegment = dataList[0];
      const unit = firstSegment.unit;
      const target = firstSegment.target;

      // Check if unit has reached the first waypoint
      const distanceToTarget = Math.sqrt(
        Math.pow(unit.position.x - target.x, 2) +
        Math.pow(unit.position.z - target.z, 2)
      );

      // If unit reached waypoint (within 2 meter threshold), remove first segment
      if (distanceToTarget < 2) {
        // Remove the first segment's line
        this.scene.remove(firstSegment.line);
        firstSegment.line.geometry.dispose();
        (firstSegment.line.material as THREE.Material).dispose();

        // Remove the first waypoint marker
        const markers = this.waypointMarkers.get(unitId);
        if (markers && markers.length > 0) {
          const marker = markers.shift()!; // Remove first marker
          this.scene.remove(marker);
          marker.geometry.dispose();
          (marker.material as THREE.Material).dispose();
        }

        // Remove first segment from array
        dataList.shift();

        // If no more segments, remove the unit from pathData
        if (dataList.length === 0) {
          this.pathData.delete(unitId);
          if (markers && markers.length === 0) {
            this.waypointMarkers.delete(unitId);
          }
        }
        continue; // Skip to next unit
      }

      // Update only the first segment (active path) to shrink from unit's current position
      const line = firstSegment.line;
      if (line instanceof THREE.Mesh) {
        // Update ribbon geometry
        const positions = line.geometry.attributes.position as THREE.BufferAttribute;
        if (positions && positions.count === 4) {
          // Ribbon has 4 vertices
          const pathWidth = 0.3;

          // Sample terrain heights
          const startTerrainHeight = this.game.getElevationAt(unit.position.x, unit.position.z);
          const startY = startTerrainHeight + this.PATH_HEIGHT_OFFSET;
          const endTerrainHeight = this.game.getElevationAt(target.x, target.z);
          const endY = endTerrainHeight + this.PATH_HEIGHT_OFFSET;

          // Calculate perpendicular direction
          const dx = target.x - unit.position.x;
          const dz = target.z - unit.position.z;
          const length = Math.sqrt(dx * dx + dz * dz);
          if (length > 0.01) {
            const dirX = dx / length;
            const dirZ = dz / length;
            const perpX = -dirZ * (pathWidth / 2);
            const perpZ = dirX * (pathWidth / 2);

            // Update all 4 vertices of the ribbon
            positions.setXYZ(0, unit.position.x - perpX, startY, unit.position.z - perpZ);
            positions.setXYZ(1, unit.position.x + perpX, startY, unit.position.z + perpZ);
            positions.setXYZ(2, target.x - perpX, endY, target.z - perpZ);
            positions.setXYZ(3, target.x + perpX, endY, target.z + perpZ);
            positions.needsUpdate = true;
          }
        }
      }
    }
  }

  /**
   * Clear all paths
   */
  clearAll(): void {
    this.pathData.forEach((_, unitId) => this.clearPath(unitId));
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearAll();
  }
}
