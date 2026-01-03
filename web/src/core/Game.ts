/**
 * Game - Main game class that orchestrates all systems
 *
 * This is the central hub that manages:
 * - Three.js renderer and scene
 * - Game loop (update/render)
 * - All game managers
 * - Game state and phases
 */

import * as THREE from 'three';
import { InputManager } from '../game/managers/InputManager';
import { CameraController } from './CameraController';
import { SelectionManager } from '../game/managers/SelectionManager';
import { UnitManager } from '../game/managers/UnitManager';

export enum GamePhase {
  Loading = 'loading',
  Setup = 'setup',
  Battle = 'battle',
  Victory = 'victory',
}

export class Game {
  // Three.js core
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  // Controllers & Managers
  public readonly cameraController: CameraController;
  public readonly inputManager: InputManager;
  public readonly selectionManager: SelectionManager;
  public readonly unitManager: UnitManager;

  // Game state
  private _phase: GamePhase = GamePhase.Loading;
  private _isRunning = false;
  private _lastTime = 0;

  // Fixed timestep for game logic
  private readonly FIXED_TIMESTEP = 1 / 60; // 60 Hz
  private _accumulator = 0;

  // Ground plane for raycasting
  public readonly groundPlane: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 100, 500);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 50, 50);
    this.camera.lookAt(0, 0, 0);

    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(500, 500, 50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d4a3e,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    this.groundPlane.name = 'ground';
    this.scene.add(this.groundPlane);

    // Add grid helper for visual reference
    const gridHelper = new THREE.GridHelper(500, 100, 0x444444, 0x333333);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // Initialize managers
    this.cameraController = new CameraController(this.camera, canvas);
    this.inputManager = new InputManager(this);
    this.selectionManager = new SelectionManager(this);
    this.unitManager = new UnitManager(this);

    // Setup lighting
    this.setupLighting();

    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private setupLighting(): void {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambientLight);

    // Directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.0);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    this.scene.add(sunLight);

    // Hemisphere light for sky/ground color variation
    const hemiLight = new THREE.HemisphereLight(0x8888aa, 0x444422, 0.3);
    this.scene.add(hemiLight);
  }

  async loadAssets(): Promise<void> {
    // TODO: Load models, textures, and unit data
    // For now, just simulate loading time
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async initialize(): Promise<void> {
    // Initialize all managers
    this.inputManager.initialize();
    this.selectionManager.initialize();
    this.unitManager.initialize();

    // Set initial phase
    this.setPhase(GamePhase.Setup);

    // Spawn some test units
    this.spawnTestUnits();
  }

  private spawnTestUnits(): void {
    // Spawn player units
    for (let i = 0; i < 5; i++) {
      this.unitManager.spawnUnit({
        position: new THREE.Vector3(-20 + i * 10, 0, -30),
        team: 'player',
        unitType: 'infantry',
      });
    }

    // Spawn enemy units
    for (let i = 0; i < 3; i++) {
      this.unitManager.spawnUnit({
        position: new THREE.Vector3(-10 + i * 10, 0, 30),
        team: 'enemy',
        unitType: 'tank',
      });
    }
  }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastTime = performance.now();
    this.gameLoop(this._lastTime);
  }

  stop(): void {
    this._isRunning = false;
  }

  private gameLoop(currentTime: number): void {
    if (!this._isRunning) return;

    requestAnimationFrame(this.gameLoop.bind(this));

    const deltaTime = (currentTime - this._lastTime) / 1000;
    this._lastTime = currentTime;

    // Clamp delta time to prevent spiral of death
    const clampedDelta = Math.min(deltaTime, 0.1);

    // Fixed timestep update for game logic
    this._accumulator += clampedDelta;
    while (this._accumulator >= this.FIXED_TIMESTEP) {
      this.fixedUpdate(this.FIXED_TIMESTEP);
      this._accumulator -= this.FIXED_TIMESTEP;
    }

    // Variable update for visual interpolation
    this.update(clampedDelta);

    // Render
    this.render();
  }

  /**
   * Fixed timestep update for game logic
   */
  private fixedUpdate(dt: number): void {
    if (this._phase === GamePhase.Battle) {
      this.unitManager.fixedUpdate(dt);
    }
  }

  /**
   * Variable timestep update for visuals
   */
  private update(dt: number): void {
    this.cameraController.update(dt);
    this.inputManager.update(dt);
    this.selectionManager.update(dt);
    this.unitManager.update(dt);
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  // Phase management
  get phase(): GamePhase {
    return this._phase;
  }

  setPhase(phase: GamePhase): void {
    const oldPhase = this._phase;
    this._phase = phase;

    // Update UI
    const phaseText = document.getElementById('phase-text');
    const startButton = document.getElementById('start-battle-btn');
    const deploymentPanel = document.getElementById('deployment-panel');

    if (phaseText) {
      phaseText.textContent = phase.toUpperCase();
      phaseText.className = `phase-${phase}`;
    }

    if (startButton) {
      startButton.classList.toggle('visible', phase === GamePhase.Setup);
    }

    if (deploymentPanel) {
      deploymentPanel.classList.toggle('visible', phase === GamePhase.Setup);
    }

    console.log(`Phase changed: ${oldPhase} -> ${phase}`);
  }

  startBattle(): void {
    if (this._phase !== GamePhase.Setup) return;
    this.setPhase(GamePhase.Battle);
    this.unitManager.unfreezeAll();
  }

  /**
   * Raycast from screen coordinates to world position
   */
  screenToWorld(screenX: number, screenY: number): THREE.Vector3 | null {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObject(this.groundPlane);

    if (intersects.length > 0) {
      return intersects[0]!.point;
    }

    return null;
  }

  /**
   * Raycast to find units at screen position
   */
  getUnitsAtScreen(screenX: number, screenY: number): THREE.Object3D[] {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouse, this.camera);

    const unitMeshes = this.unitManager.getAllUnitMeshes();
    return raycaster.intersectObjects(unitMeshes, true).map(i => i.object);
  }
}
