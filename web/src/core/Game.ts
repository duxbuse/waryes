/**
 * Game - Main game class that orchestrates all systems
 *
 * This is the central hub that manages:
 * - Three.js renderer and scene
 * - Game loop (update/render)
 * - All game managers
 * - Game state and phases
 * - Screen management
 */

import * as THREE from 'three';
import { InputManager } from '../game/managers/InputManager';
import { CameraController } from './CameraController';
import { SelectionManager } from '../game/managers/SelectionManager';
import { UnitManager } from '../game/managers/UnitManager';
import { DeploymentManager } from '../game/managers/DeploymentManager';
import { EconomyManager } from '../game/managers/EconomyManager';
import { CombatManager } from '../game/managers/CombatManager';
import { ScreenManager, ScreenType } from './ScreenManager';
import { MapGenerator } from '../game/map/MapGenerator';
import { MapRenderer } from '../game/map/MapRenderer';
import type { GameMap, DeckData, MapSize } from '../data/types';

export enum GamePhase {
  Loading = 'loading',
  MainMenu = 'mainMenu',
  DeckBuilder = 'deckBuilder',
  SkirmishSetup = 'skirmishSetup',
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
  public readonly deploymentManager: DeploymentManager;
  public readonly economyManager: EconomyManager;
  public readonly combatManager: CombatManager;
  public readonly screenManager: ScreenManager;
  public mapRenderer: MapRenderer | null = null;

  // Game state
  private _phase: GamePhase = GamePhase.Loading;
  private _isRunning = false;
  private _lastTime = 0;
  private _isPaused = false;

  // Pause menu elements
  private pauseMenu: HTMLElement | null = null;

  // Fixed timestep for game logic
  private readonly FIXED_TIMESTEP = 1 / 60; // 60 Hz
  private _accumulator = 0;

  // Current map
  public currentMap: GameMap | null = null;

  // Ground plane for raycasting
  public readonly groundPlane: THREE.Mesh;

  // Victory callback
  private onVictoryCallback: ((winner: 'player' | 'enemy') => void) | null = null;

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

    // Create ground plane (will be replaced by map terrain)
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

    // Initialize managers
    this.cameraController = new CameraController(this.camera, canvas);
    this.inputManager = new InputManager(this);
    this.selectionManager = new SelectionManager(this);
    this.unitManager = new UnitManager(this);
    this.deploymentManager = new DeploymentManager(this);
    this.economyManager = new EconomyManager(this);
    this.combatManager = new CombatManager(this);
    this.screenManager = new ScreenManager();
    this.mapRenderer = new MapRenderer(this.scene);

    // Setup lighting
    this.setupLighting();

    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));

    // Setup pause menu
    this.setupPauseMenu();
  }

  private setupPauseMenu(): void {
    this.pauseMenu = document.getElementById('pause-menu');

    // Resume button
    document.getElementById('pause-resume-btn')?.addEventListener('click', () => {
      this.togglePause();
    });

    // Settings button
    document.getElementById('pause-settings-btn')?.addEventListener('click', () => {
      // Could open settings from pause - for now just resume
      this.togglePause();
    });

    // Surrender button
    document.getElementById('pause-surrender-btn')?.addEventListener('click', () => {
      this.togglePause();
      this.onVictory('enemy');
    });

    // Quit to Menu button
    document.getElementById('pause-quit-btn')?.addEventListener('click', () => {
      this.togglePause();
      this.returnToMainMenu();
    });
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
    this.combatManager.initialize();

    // Setup victory callback
    this.economyManager.setVictoryCallback(this.onVictory.bind(this));

    // Set initial phase - go to main menu
    this.setPhase(GamePhase.MainMenu);
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
    if (this._isPaused) return;

    if (this._phase === GamePhase.Battle) {
      this.unitManager.fixedUpdate(dt);
      this.combatManager.processCombat(dt);
    }
  }

  /**
   * Variable timestep update for visuals
   */
  private update(dt: number): void {
    // Only update game systems in appropriate phases (and not paused)
    if (!this._isPaused && (this._phase === GamePhase.Setup || this._phase === GamePhase.Battle)) {
      this.cameraController.update(dt);
      this.inputManager.update(dt);
      this.selectionManager.update(dt);
      this.unitManager.update(dt);
    }

    if (!this._isPaused && this._phase === GamePhase.Battle) {
      this.economyManager.update(dt);
      this.combatManager.update(dt);
    }

    // Screen manager always updates
    this.screenManager.update(dt);
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

  // Pause management
  get isPaused(): boolean {
    return this._isPaused;
  }

  togglePause(): void {
    if (this._phase !== GamePhase.Setup && this._phase !== GamePhase.Battle) {
      return; // Only allow pause during gameplay
    }

    this._isPaused = !this._isPaused;

    if (this.pauseMenu) {
      this.pauseMenu.classList.toggle('visible', this._isPaused);
    }

    console.log(`Game ${this._isPaused ? 'paused' : 'resumed'}`);
  }

  // Phase management
  get phase(): GamePhase {
    return this._phase;
  }

  setPhase(phase: GamePhase): void {
    const oldPhase = this._phase;
    this._phase = phase;

    // Update UI elements
    this.updatePhaseUI(phase);

    console.log(`Phase changed: ${oldPhase} -> ${phase}`);
  }

  private updatePhaseUI(phase: GamePhase): void {
    const phaseText = document.getElementById('phase-text');
    const startButton = document.getElementById('start-battle-btn');
    const topBar = document.getElementById('top-bar');
    const scoreDisplay = document.getElementById('score-display');
    const phaseIndicator = document.getElementById('phase-indicator');
    const minimap = document.getElementById('minimap');

    // Hide/show UI based on phase
    const inBattle = phase === GamePhase.Setup || phase === GamePhase.Battle;

    if (topBar) topBar.style.display = inBattle ? 'flex' : 'none';
    if (scoreDisplay) scoreDisplay.style.display = inBattle ? 'block' : 'none';
    if (phaseIndicator) phaseIndicator.style.display = inBattle ? 'block' : 'none';
    if (minimap) minimap.style.display = inBattle ? 'block' : 'none';

    if (phaseText) {
      if (phase === GamePhase.Setup) {
        phaseText.textContent = 'DEPLOYMENT';
        phaseText.className = 'phase-setup';
      } else if (phase === GamePhase.Battle) {
        phaseText.textContent = 'BATTLE';
        phaseText.className = 'phase-battle';
      }
    }

    if (startButton) {
      startButton.classList.toggle('visible', phase === GamePhase.Setup);
    }
  }

  /**
   * Start a skirmish battle with the given configuration
   */
  startSkirmish(deck: DeckData, mapSize: MapSize, mapSeed: number): void {
    // Generate map
    const generator = new MapGenerator(mapSeed, mapSize);
    this.currentMap = generator.generate();

    // Render map
    if (this.mapRenderer) {
      this.mapRenderer.render(this.currentMap);
    }

    // Set camera bounds based on map size
    this.cameraController.setBounds(this.currentMap.width, this.currentMap.height);

    // Hide ground plane (map terrain replaces it)
    this.groundPlane.visible = false;

    // Initialize economy with capture zones
    this.economyManager.initialize(this.currentMap.captureZones);

    // Find player deployment zone
    const playerZone = this.currentMap.deploymentZones.find(z => z.team === 'player');
    if (playerZone) {
      this.deploymentManager.initialize(deck, playerZone);
    }

    // Position camera at player deployment zone
    if (playerZone) {
      const centerX = (playerZone.minX + playerZone.maxX) / 2;
      const centerZ = (playerZone.minZ + playerZone.maxZ) / 2;
      this.cameraController.setPosition(centerX, centerZ);
    }

    // Spawn AI units for enemy team
    this.spawnEnemyUnits();

    // Enter setup phase
    this.setPhase(GamePhase.Setup);
    this.screenManager.switchTo(ScreenType.Battle);
  }

  private spawnEnemyUnits(): void {
    if (!this.currentMap) return;

    const enemyZone = this.currentMap.deploymentZones.find(z => z.team === 'enemy');
    if (!enemyZone) return;

    // Spawn some enemy units for testing
    const enemyUnits = [
      'vanguard_marines',
      'vanguard_marines',
      'vanguard_marines',
      'vanguard_predator',
      'vanguard_predator',
    ];

    enemyUnits.forEach((unitType, i) => {
      const x = enemyZone.minX + (enemyZone.maxX - enemyZone.minX) * (0.2 + 0.15 * i);
      const z = (enemyZone.minZ + enemyZone.maxZ) / 2;

      this.unitManager.spawnUnit({
        position: new THREE.Vector3(x, 0, z),
        team: 'enemy',
        unitType,
      });
    });
  }

  startBattle(): void {
    if (this._phase !== GamePhase.Setup) return;

    // Hide deployment UI
    this.deploymentManager.hide();

    // Start battle
    this.setPhase(GamePhase.Battle);
    this.unitManager.unfreezeAll();
  }

  private onVictory(winner: 'player' | 'enemy'): void {
    this.setPhase(GamePhase.Victory);

    // Show victory screen
    const victoryScreen = document.getElementById('victory-screen');
    const victoryText = document.getElementById('victory-text');

    if (victoryScreen && victoryText) {
      if (winner === 'player') {
        victoryText.textContent = 'VICTORY!';
        victoryText.className = 'victory-text victory-blue';
      } else {
        victoryText.textContent = 'DEFEAT';
        victoryText.className = 'victory-text victory-red';
      }
      victoryScreen.classList.add('visible');
    }

    this.onVictoryCallback?.(winner);
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

    // Check map terrain first
    if (this.mapRenderer) {
      const mapGroup = this.mapRenderer.getMapGroup();
      const intersects = raycaster.intersectObject(mapGroup, true);
      if (intersects.length > 0) {
        return intersects[0]!.point;
      }
    }

    // Fall back to ground plane
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

  /**
   * Return to main menu
   */
  returnToMainMenu(): void {
    // Clean up current game state
    this.unitManager.destroyAllUnits();

    if (this.mapRenderer) {
      this.mapRenderer.clear();
    }

    this.currentMap = null;
    this.groundPlane.visible = true;

    // Hide victory screen
    const victoryScreen = document.getElementById('victory-screen');
    if (victoryScreen) {
      victoryScreen.classList.remove('visible');
    }

    this.setPhase(GamePhase.MainMenu);
    this.screenManager.switchTo(ScreenType.MainMenu);
  }
}
