/**
 * CameraController - RTS-style camera controls
 *
 * Features:
 * - WASD/Arrow key panning
 * - Edge panning (mouse at screen edges)
 * - Middle mouse drag panning
 * - Scroll wheel zoom
 * - Height-based speed scaling
 */

import * as THREE from 'three';

export interface CameraConfig {
  minHeight: number;
  maxHeight: number;
  panSpeed: number;
  zoomSpeed: number;
  edgePanThreshold: number;
  edgePanSpeed: number;
  smoothing: number;
  // Map bounds - camera cannot pan outside these limits
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const DEFAULT_CONFIG: CameraConfig = {
  minHeight: 5,
  maxHeight: 150,
  panSpeed: 50,
  zoomSpeed: 10,
  edgePanThreshold: 50, // pixels from edge
  edgePanSpeed: 30,
  smoothing: 0.1,
  // Default bounds - will be updated based on map size
  minX: -250,
  maxX: 250,
  minZ: -250,
  maxZ: 250,
};

export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly config: CameraConfig;

  // Input state
  private readonly keys = new Set<string>();
  // Initialize to center of screen to prevent edge panning on startup
  private mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  private isDragging = false;
  private lastDragPosition = { x: 0, y: 0 };

  // Target position for smooth movement
  private targetPosition: THREE.Vector3;
  private targetHeight: number;

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    config: Partial<CameraConfig> = {}
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.targetPosition = new THREE.Vector3(
      camera.position.x,
      0,
      camera.position.z
    );
    this.targetHeight = camera.position.y;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Keyboard
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));

    // Mouse
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    // Prevent context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);
  }

  private onMouseMove(event: MouseEvent): void {
    this.mousePosition.x = event.clientX;
    this.mousePosition.y = event.clientY;

    if (this.isDragging) {
      const deltaX = event.clientX - this.lastDragPosition.x;
      const deltaY = event.clientY - this.lastDragPosition.y;

      // Move camera in world space (inverted for drag feel)
      const speedMultiplier = this.getHeightSpeedMultiplier() * 0.5;
      this.targetPosition.x -= deltaX * speedMultiplier;
      this.targetPosition.z -= deltaY * speedMultiplier;

      this.lastDragPosition.x = event.clientX;
      this.lastDragPosition.y = event.clientY;
    }
  }

  private onMouseDown(event: MouseEvent): void {
    // Middle mouse button for drag
    if (event.button === 1) {
      this.isDragging = true;
      this.lastDragPosition.x = event.clientX;
      this.lastDragPosition.y = event.clientY;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 1) {
      this.isDragging = false;
      this.canvas.style.cursor = 'default';
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();

    const zoomDelta = event.deltaY > 0 ? 1 : -1;
    this.targetHeight += zoomDelta * this.config.zoomSpeed;
    this.targetHeight = THREE.MathUtils.clamp(
      this.targetHeight,
      this.config.minHeight,
      this.config.maxHeight
    );
  }

  private getHeightSpeedMultiplier(): number {
    // Speed scales with camera height
    const heightRatio = this.camera.position.y / this.config.maxHeight;
    return 0.5 + heightRatio * 1.5;
  }

  update(dt: number): void {
    const speedMultiplier = this.getHeightSpeedMultiplier();
    const moveSpeed = this.config.panSpeed * speedMultiplier * dt;

    // Keyboard panning
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.targetPosition.z -= moveSpeed;
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      this.targetPosition.z += moveSpeed;
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      this.targetPosition.x -= moveSpeed;
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      this.targetPosition.x += moveSpeed;
    }

    // Edge panning (only when not dragging)
    if (!this.isDragging) {
      const edgeSpeed = this.config.edgePanSpeed * speedMultiplier * dt;
      const threshold = this.config.edgePanThreshold;
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (this.mousePosition.x < threshold) {
        this.targetPosition.x -= edgeSpeed;
      } else if (this.mousePosition.x > width - threshold) {
        this.targetPosition.x += edgeSpeed;
      }

      if (this.mousePosition.y < threshold) {
        this.targetPosition.z -= edgeSpeed;
      } else if (this.mousePosition.y > height - threshold) {
        this.targetPosition.z += edgeSpeed;
      }
    }

    // Clamp target position to map bounds
    this.targetPosition.x = THREE.MathUtils.clamp(
      this.targetPosition.x,
      this.config.minX,
      this.config.maxX
    );
    this.targetPosition.z = THREE.MathUtils.clamp(
      this.targetPosition.z,
      this.config.minZ,
      this.config.maxZ
    );

    // Smooth camera movement
    const smoothing = 1 - Math.pow(this.config.smoothing, dt);

    this.camera.position.x = THREE.MathUtils.lerp(
      this.camera.position.x,
      this.targetPosition.x,
      smoothing
    );
    this.camera.position.z = THREE.MathUtils.lerp(
      this.camera.position.z,
      this.targetPosition.z + this.targetHeight * 0.7,
      smoothing
    );
    this.camera.position.y = THREE.MathUtils.lerp(
      this.camera.position.y,
      this.targetHeight,
      smoothing
    );

    // Look at ground below camera
    const lookTarget = new THREE.Vector3(
      this.targetPosition.x,
      0,
      this.targetPosition.z
    );
    this.camera.lookAt(lookTarget);
  }

  // Public methods for external control
  setPosition(x: number, z: number): void {
    this.targetPosition.x = x;
    this.targetPosition.z = z;
  }

  setHeight(height: number): void {
    this.targetHeight = THREE.MathUtils.clamp(
      height,
      this.config.minHeight,
      this.config.maxHeight
    );
  }

  get height(): number {
    return this.camera.position.y;
  }

  get isTacticalView(): boolean {
    return this.camera.position.y > 60;
  }

  /**
   * Set the camera bounds based on map dimensions
   * Adds some padding so the camera can see the edges
   */
  setBounds(mapWidth: number, mapHeight: number): void {
    const padding = 50; // Extra space beyond map edges
    this.config.minX = -mapWidth / 2 - padding;
    this.config.maxX = mapWidth / 2 + padding;
    this.config.minZ = -mapHeight / 2 - padding;
    this.config.maxZ = mapHeight / 2 + padding;
  }
}
