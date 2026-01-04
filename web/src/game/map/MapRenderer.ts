/**
 * MapRenderer - Renders the procedurally generated map in Three.js
 */

import * as THREE from 'three';
import type { GameMap, Building, Road, CaptureZone, DeploymentZone, ResupplyPoint } from '../../data/types';
import { ZoneFillRenderer, type FillEntry } from './ZoneFillRenderer';

export class MapRenderer {
  private scene: THREE.Scene;
  private mapGroup: THREE.Group;
  private captureZoneMeshes: Map<string, THREE.Group> = new Map();
  private animationTime: number = 0; // For pulsing animations

  // Zone fill renderer for territorial capture visualization
  private zoneFillRenderer: ZoneFillRenderer | null = null;

  // Materials
  private materials: {
    ground: THREE.MeshStandardMaterial;
    road: THREE.MeshStandardMaterial;
    forest: THREE.MeshStandardMaterial;
    hill: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    building: THREE.MeshStandardMaterial;
    church: THREE.MeshStandardMaterial;
    factory: THREE.MeshStandardMaterial;
    roof: THREE.MeshStandardMaterial;
    deploymentPlayer: THREE.MeshBasicMaterial;
    deploymentEnemy: THREE.MeshBasicMaterial;
    captureNeutral: THREE.MeshBasicMaterial;
    capturePlayer: THREE.MeshBasicMaterial;
    captureEnemy: THREE.MeshBasicMaterial;
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mapGroup = new THREE.Group();
    this.mapGroup.name = 'map';

    // Initialize materials
    this.materials = {
      ground: new THREE.MeshStandardMaterial({
        color: 0x4a7c4e,
        roughness: 0.9,
        metalness: 0.0,
      }),
      road: new THREE.MeshStandardMaterial({
        color: 0x5a5a5a,
        roughness: 0.8,
        metalness: 0.1,
      }),
      forest: new THREE.MeshStandardMaterial({
        color: 0x2d5a30,
        roughness: 0.95,
        metalness: 0.0,
      }),
      hill: new THREE.MeshStandardMaterial({
        color: 0x6b8e5a,
        roughness: 0.9,
        metalness: 0.0,
      }),
      water: new THREE.MeshStandardMaterial({
        color: 0x3a6a8a,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.8,
      }),
      building: new THREE.MeshStandardMaterial({
        color: 0xd4c4a8,
        roughness: 0.8,
        metalness: 0.1,
      }),
      church: new THREE.MeshStandardMaterial({
        color: 0xc9b896,
        roughness: 0.7,
        metalness: 0.1,
      }),
      factory: new THREE.MeshStandardMaterial({
        color: 0x8a7a6a,
        roughness: 0.9,
        metalness: 0.2,
      }),
      roof: new THREE.MeshStandardMaterial({
        color: 0x8b4513,
        roughness: 0.8,
        metalness: 0.0,
      }),
      deploymentPlayer: new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      deploymentEnemy: new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      captureNeutral: new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      capturePlayer: new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
      captureEnemy: new THREE.MeshBasicMaterial({
        color: 0xff4a4a,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    };
  }

  render(map: GameMap): void {
    // Clear existing map
    this.clear();

    // Render terrain
    this.renderTerrain(map);

    // Render roads
    this.renderRoads(map.roads);

    // Render buildings
    this.renderBuildings(map.buildings);

    // Render deployment zones
    this.renderDeploymentZones(map.deploymentZones);

    // Render capture zones
    this.renderCaptureZones(map.captureZones);

    // Render resupply points
    this.renderResupplyPoints(map.resupplyPoints);

    // Add trees to forests
    this.renderForestTrees(map);

    // Add to scene
    this.scene.add(this.mapGroup);
  }

  clear(): void {
    if (this.mapGroup.parent) {
      this.scene.remove(this.mapGroup);
    }

    // Dispose geometries
    this.mapGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });

    this.mapGroup.clear();
    this.captureZoneMeshes.clear();

    // Clear zone fill renderer
    if (this.zoneFillRenderer) {
      this.zoneFillRenderer.dispose();
      this.zoneFillRenderer = null;
    }
  }

  private renderTerrain(map: GameMap): void {
    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;

    // Create a single merged geometry for performance
    const groundGeometry = new THREE.PlaneGeometry(
      map.width,
      map.height,
      cols,
      rows
    );
    groundGeometry.rotateX(-Math.PI / 2);

    // Apply elevation to vertices
    const positionAttr = groundGeometry.attributes['position']!;
    for (let i = 0; i < positionAttr.count; i++) {
      const x = Math.floor(((positionAttr.getX(i) + map.width / 2) / map.width) * cols);
      const z = Math.floor(((positionAttr.getZ(i) + map.height / 2) / map.height) * rows);

      const cell = map.terrain[Math.min(z, rows - 1)]?.[Math.min(x, cols - 1)];
      if (cell) {
        positionAttr.setY(i, cell.elevation);
      }
    }

    groundGeometry.computeVertexNormals();

    const groundMesh = new THREE.Mesh(groundGeometry, this.materials.ground);
    groundMesh.receiveShadow = true;
    groundMesh.name = 'terrain-ground';
    this.mapGroup.add(groundMesh);

    // Render terrain overlays for different types
    this.renderTerrainOverlays(map);
  }

  private renderTerrainOverlays(map: GameMap): void {
    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;
    const cellSize = 4;

    // Group cells by type for batching
    const forestCells: { x: number; z: number; elevation: number }[] = [];
    const waterCells: { x: number; z: number }[] = [];

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const cell = map.terrain[z]![x]!;
        const worldX = x * cellSize - map.width / 2 + cellSize / 2;
        const worldZ = z * cellSize - map.height / 2 + cellSize / 2;

        if (cell.type === 'forest') {
          forestCells.push({ x: worldX, z: worldZ, elevation: cell.elevation });
        } else if (cell.type === 'river' || cell.type === 'water') {
          waterCells.push({ x: worldX, z: worldZ });
        }
      }
    }

    // Render forest floor overlay
    if (forestCells.length > 0) {
      const forestGroup = new THREE.Group();
      forestGroup.name = 'forest-floor';

      for (const cell of forestCells) {
        const geo = new THREE.PlaneGeometry(cellSize, cellSize);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.materials.forest);
        mesh.position.set(cell.x, cell.elevation + 0.05, cell.z);
        mesh.receiveShadow = true;
        forestGroup.add(mesh);
      }

      this.mapGroup.add(forestGroup);
    }

    // Render water
    if (waterCells.length > 0) {
      const waterGroup = new THREE.Group();
      waterGroup.name = 'water';

      for (const cell of waterCells) {
        const geo = new THREE.PlaneGeometry(cellSize, cellSize);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.materials.water);
        mesh.position.set(cell.x, 0.1, cell.z);
        waterGroup.add(mesh);
      }

      this.mapGroup.add(waterGroup);
    }
  }

  private renderRoads(roads: Road[]): void {
    const roadGroup = new THREE.Group();
    roadGroup.name = 'roads';

    for (const road of roads) {
      // Create road segments between points
      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i]!;
        const p2 = road.points[i + 1]!;

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);

        const geometry = new THREE.PlaneGeometry(road.width, length);
        geometry.rotateX(-Math.PI / 2);
        geometry.rotateY(angle);

        const mesh = new THREE.Mesh(geometry, this.materials.road);
        mesh.position.set(
          (p1.x + p2.x) / 2,
          0.15,
          (p1.z + p2.z) / 2
        );
        mesh.receiveShadow = true;

        roadGroup.add(mesh);
      }
    }

    this.mapGroup.add(roadGroup);
  }

  private renderBuildings(buildings: Building[]): void {
    const buildingGroup = new THREE.Group();
    buildingGroup.name = 'buildings';

    for (const building of buildings) {
      const buildingMesh = this.createBuildingMesh(building);
      buildingGroup.add(buildingMesh);
    }

    this.mapGroup.add(buildingGroup);
  }

  private createBuildingMesh(building: Building): THREE.Group {
    const group = new THREE.Group();

    // Select material based on building type
    let wallMaterial = this.materials.building;
    if (building.type === 'church') {
      wallMaterial = this.materials.church;
    } else if (building.type === 'factory') {
      wallMaterial = this.materials.factory;
    }

    // Main building body
    const bodyGeometry = new THREE.BoxGeometry(
      building.width,
      building.height,
      building.depth
    );
    const bodyMesh = new THREE.Mesh(bodyGeometry, wallMaterial);
    bodyMesh.position.y = building.height / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Roof
    if (building.type === 'house' || building.type === 'shop') {
      // Pitched roof
      const roofGeometry = new THREE.ConeGeometry(
        Math.max(building.width, building.depth) * 0.7,
        building.height * 0.4,
        4
      );
      roofGeometry.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeometry, this.materials.roof);
      roofMesh.position.y = building.height + building.height * 0.2;
      roofMesh.castShadow = true;
      group.add(roofMesh);
    } else if (building.type === 'church') {
      // Church spire
      const spireGeometry = new THREE.ConeGeometry(
        building.width * 0.3,
        building.height * 0.8,
        8
      );
      const spireMesh = new THREE.Mesh(spireGeometry, this.materials.roof);
      spireMesh.position.y = building.height + building.height * 0.4;
      spireMesh.castShadow = true;
      group.add(spireMesh);
    } else if (building.type === 'factory') {
      // Flat roof with chimney
      const chimneyGeometry = new THREE.CylinderGeometry(1, 1.5, building.height * 0.5, 8);
      const chimneyMesh = new THREE.Mesh(chimneyGeometry, this.materials.factory);
      chimneyMesh.position.set(
        building.width * 0.3,
        building.height + building.height * 0.25,
        building.depth * 0.3
      );
      chimneyMesh.castShadow = true;
      group.add(chimneyMesh);
    }

    group.position.set(building.x, 0, building.z);
    group.userData['building'] = building;

    return group;
  }

  private renderDeploymentZones(zones: DeploymentZone[]): void {
    const zoneGroup = new THREE.Group();
    zoneGroup.name = 'deployment-zones';

    for (const zone of zones) {
      const width = zone.maxX - zone.minX;
      const depth = zone.maxZ - zone.minZ;

      const geometry = new THREE.PlaneGeometry(width, depth);
      geometry.rotateX(-Math.PI / 2);

      const material = zone.team === 'player'
        ? this.materials.deploymentPlayer
        : this.materials.deploymentEnemy;

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (zone.minX + zone.maxX) / 2,
        0.5, // Above terrain
        (zone.minZ + zone.maxZ) / 2
      );
      mesh.renderOrder = 99; // Render after terrain

      zoneGroup.add(mesh);

      // Border
      const borderGeometry = new THREE.EdgesGeometry(
        new THREE.PlaneGeometry(width, depth)
      );
      const borderMaterial = new THREE.LineBasicMaterial({
        color: zone.team === 'player' ? 0x4a9eff : 0xff4a4a,
        depthWrite: false,
        depthTest: false,
      });
      const border = new THREE.LineSegments(borderGeometry, borderMaterial);
      border.rotation.x = -Math.PI / 2;
      border.position.copy(mesh.position);
      border.position.y = 1.0; // Above the zone mesh
      border.renderOrder = 100;

      zoneGroup.add(border);
    }

    this.mapGroup.add(zoneGroup);
  }

  private renderCaptureZones(zones: CaptureZone[]): void {
    const zoneGroup = new THREE.Group();
    zoneGroup.name = 'capture-zones';

    // Create zone fill renderer
    this.zoneFillRenderer = new ZoneFillRenderer(this.mapGroup);

    for (const zone of zones) {
      const group = new THREE.Group();
      group.name = `capture-zone-${zone.id}`;

      // Zone border ring (outline of the capture zone)
      const ringGeometry = new THREE.RingGeometry(zone.radius - 0.5, zone.radius, 64);
      ringGeometry.rotateX(-Math.PI / 2);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      ringMesh.position.set(zone.x, 0.55, zone.z);
      ringMesh.userData.isBorderRing = true;
      ringMesh.renderOrder = 92;
      group.add(ringMesh);

      // Zone flag/marker
      const poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 8, 8);
      const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const poleMesh = new THREE.Mesh(poleGeometry, poleMaterial);
      poleMesh.position.set(zone.x, 4, zone.z);
      poleMesh.castShadow = true;
      group.add(poleMesh);

      // Flag
      const flagGeometry = new THREE.PlaneGeometry(4, 2);
      const flagMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
      flagMesh.position.set(zone.x + 2, 7, zone.z);
      flagMesh.userData.isFlag = true;
      group.add(flagMesh);

      this.captureZoneMeshes.set(zone.id, group);
      zoneGroup.add(group);

      // Initialize zone in fill renderer
      this.zoneFillRenderer.initializeZone(zone.id, zone.x, zone.z, zone.radius);
    }

    this.mapGroup.add(zoneGroup);
  }

  private renderResupplyPoints(resupplyPoints: ResupplyPoint[]): void {
    const resupplyGroup = new THREE.Group();
    resupplyGroup.name = 'resupply-points';

    for (const point of resupplyPoints) {
      const group = new THREE.Group();
      group.name = `resupply-point-${point.id}`;

      const teamColor = point.team === 'player' ? 0x4a9eff : 0xff4a4a;
      const radius = point.radius;

      // Arrow dimensions - larger for better visibility at map edge
      const arrowLength = radius * 2.5;
      const arrowWidth = radius * 1.0;
      const arrowHeadLength = radius * 0.8;
      const arrowHeadWidth = radius * 1.5;

      // Offset the arrow base outside the map edge
      // Player (bottom): arrow starts below the map edge, pointing up (+Z)
      // Enemy (top): arrow starts above the map edge, pointing down (-Z)
      const outsideOffset = radius * 0.5;
      const baseZ = point.team === 'player'
        ? point.z - outsideOffset
        : point.z + outsideOffset;

      // Arrow shape drawn pointing toward +Z (up on map)
      // Shape drawn in X-Y plane, then rotated to X-Z plane
      const arrowShape = new THREE.Shape();
      // Draw arrow pointing in -Y direction (becomes +Z after rotateX)
      arrowShape.moveTo(-arrowWidth / 2, 0);
      arrowShape.lineTo(-arrowWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(-arrowHeadWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(0, -arrowLength); // Arrow tip
      arrowShape.lineTo(arrowHeadWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(arrowWidth / 2, -(arrowLength - arrowHeadLength));
      arrowShape.lineTo(arrowWidth / 2, 0);
      arrowShape.closePath();

      const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
      arrowGeometry.rotateX(-Math.PI / 2);
      // Rotate to match direction (direction 0 = +Z, direction PI = -Z)
      arrowGeometry.rotateY(-point.direction);

      const arrowMaterial = new THREE.MeshBasicMaterial({
        color: teamColor,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });

      const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
      arrowMesh.position.set(point.x, 0.6, baseZ);
      arrowMesh.renderOrder = 95;
      group.add(arrowMesh);

      // Arrow border outline
      const borderPoints: THREE.Vector3[] = [
        new THREE.Vector3(-arrowWidth / 2, 0, 0),
        new THREE.Vector3(-arrowWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(-arrowHeadWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(0, 0, arrowLength), // Arrow tip
        new THREE.Vector3(arrowHeadWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(arrowWidth / 2, 0, arrowLength - arrowHeadLength),
        new THREE.Vector3(arrowWidth / 2, 0, 0),
        new THREE.Vector3(-arrowWidth / 2, 0, 0),
      ];

      const borderGeometry = new THREE.BufferGeometry().setFromPoints(borderPoints);
      const borderMaterial = new THREE.LineBasicMaterial({
        color: teamColor,
        linewidth: 2,
        depthWrite: false,
        depthTest: false,
      });
      const border = new THREE.Line(borderGeometry, borderMaterial);
      border.position.set(point.x, 0.7, baseZ);
      border.rotation.y = -point.direction;
      border.renderOrder = 96;
      group.add(border);

      // Add small circle at arrow base to show spawn point
      const circleGeometry = new THREE.CircleGeometry(radius * 0.35, 16);
      circleGeometry.rotateX(-Math.PI / 2);
      const circleMaterial = new THREE.MeshBasicMaterial({
        color: teamColor,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
      circleMesh.position.set(point.x, 0.65, baseZ);
      circleMesh.renderOrder = 97;
      group.add(circleMesh);

      resupplyGroup.add(group);
    }

    this.mapGroup.add(resupplyGroup);
  }

  private renderForestTrees(map: GameMap): void {
    const treeGroup = new THREE.Group();
    treeGroup.name = 'trees';

    const cellSize = 4;
    const cols = map.terrain[0]?.length ?? 0;
    const rows = map.terrain.length;

    // Tree geometry (shared)
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 3, 6);
    const foliageGeometry = new THREE.ConeGeometry(2, 5, 8);

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2a5a2a });

    // Place trees in forest cells (sparse)
    for (let z = 0; z < rows; z += 2) {
      for (let x = 0; x < cols; x += 2) {
        const cell = map.terrain[z]?.[x];
        if (cell?.type === 'forest') {
          // Random offset within cell
          const offsetX = (Math.random() - 0.5) * cellSize * 0.8;
          const offsetZ = (Math.random() - 0.5) * cellSize * 0.8;

          const worldX = x * cellSize - map.width / 2 + cellSize / 2 + offsetX;
          const worldZ = z * cellSize - map.height / 2 + cellSize / 2 + offsetZ;

          const tree = new THREE.Group();

          // Trunk
          const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
          trunk.position.y = 1.5;
          trunk.castShadow = true;
          tree.add(trunk);

          // Foliage
          const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
          foliage.position.y = 5.5;
          foliage.castShadow = true;
          tree.add(foliage);

          // Random scale and rotation
          const scale = 0.7 + Math.random() * 0.6;
          tree.scale.setScalar(scale);
          tree.rotation.y = Math.random() * Math.PI * 2;

          tree.position.set(worldX, cell.elevation, worldZ);
          treeGroup.add(tree);
        }
      }
    }

    this.mapGroup.add(treeGroup);
  }

  // Update capture zone visuals based on ownership
  updateCaptureZone(zoneId: string, owner: 'neutral' | 'player' | 'enemy', _progress: number, isContested = false): void {
    const group = this.captureZoneMeshes.get(zoneId);
    if (!group) return;

    const ringMesh = group.children[0] as THREE.Mesh; // Border ring
    const flagMesh = group.children.find(c => c.userData.isFlag) as THREE.Mesh;

    // Mark border ring as contested for pulsing animation
    if (ringMesh?.userData.isBorderRing && ringMesh.material instanceof THREE.MeshBasicMaterial) {
      ringMesh.userData.isContested = isContested;

      // Update ring color based on owner
      let ringColor: number;
      switch (owner) {
        case 'player':
          ringColor = 0x4a9eff;
          break;
        case 'enemy':
          ringColor = 0xff4a4a;
          break;
        default:
          ringColor = 0xffffff;
      }
      ringMesh.material.color.setHex(ringColor);

      // Reset to normal opacity when not contested
      if (!isContested) {
        ringMesh.material.opacity = 0.6;
      }
    }

    if (flagMesh?.material instanceof THREE.MeshBasicMaterial) {
      let flagColor: number;
      switch (owner) {
        case 'player':
          flagColor = 0x4a9eff;
          break;
        case 'enemy':
          flagColor = 0xff4a4a;
          break;
        default:
          flagColor = 0xffffff;
      }
      flagMesh.material.color.setHex(flagColor);
    }
  }

  /**
   * Update zone fill visualization with unit entries
   */
  updateZoneFill(zoneId: string, entries: FillEntry[], dt: number): void {
    if (!this.zoneFillRenderer) {
      console.warn('MapRenderer: zoneFillRenderer not initialized');
      return;
    }
    this.zoneFillRenderer.updateZone(zoneId, entries, dt);
  }

  /**
   * Get fill state for a zone
   */
  getZoneFillState(zoneId: string): { playerPercent: number; enemyPercent: number; isFullyFilled: boolean; isCaptured: boolean; capturedBy: 'player' | 'enemy' | null } | null {
    return this.zoneFillRenderer?.getZoneFillState(zoneId) ?? null;
  }

  getMapGroup(): THREE.Group {
    return this.mapGroup;
  }

  /**
   * Update animations (border pulsing, etc.)
   */
  update(dt: number): void {
    this.animationTime += dt;

    // Animate border rings for contested zones
    this.captureZoneMeshes.forEach((group) => {
      const ringMesh = group.children.find(child => child.userData.isBorderRing) as THREE.Mesh | undefined;
      if (ringMesh && ringMesh.userData.isContested) {
        // Pulsing effect: oscillate opacity between 0.3 and 1.0
        const pulseSpeed = 3; // Hz
        const opacity = 0.5 + 0.5 * Math.sin(this.animationTime * pulseSpeed * Math.PI * 2);
        (ringMesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      }
    });
  }

  dispose(): void {
    // Dispose all materials
    Object.values(this.materials).forEach(mat => mat.dispose());
    this.clear();
  }
}
