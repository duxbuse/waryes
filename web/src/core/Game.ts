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
import { AIManager } from '../game/managers/AIManager';
import { ReinforcementManager } from '../game/managers/ReinforcementManager';
import { FogOfWarManager } from '../game/managers/FogOfWarManager';
import { MultiplayerManager } from '../game/managers/MultiplayerManager';
import { MultiplayerBattleSync } from '../game/managers/MultiplayerBattleSync';
import { BuildingManager } from '../game/managers/BuildingManager';
import { TransportManager } from '../game/managers/TransportManager';
import { SmokeManager } from '../game/managers/SmokeManager';
import { PathfindingManager } from '../game/managers/PathfindingManager';
import { NavMeshManager } from '../game/navigation/NavMeshManager';
import { DamageNumberManager } from '../game/effects/DamageNumbers';
import { VisualEffectsManager } from '../game/effects/VisualEffects';
import { AudioManager } from '../game/audio/AudioManager';
import { ScreenManager, ScreenType } from './ScreenManager';
import { generateMapAsync } from '../game/map/generateMapAsync';
import { MapRenderer } from '../game/map/MapRenderer';
import { MinimapRenderer } from '../game/ui/MinimapRenderer';
import { PathRenderer } from '../game/rendering/PathRenderer';
import { InstancedUnitRenderer } from '../game/rendering/InstancedUnitRenderer';
import { BatchedUnitUIRenderer } from '../game/rendering/BatchedUnitUIRenderer';
import { LOSPreviewRenderer } from '../game/map/LOSPreviewRenderer';
import { FogOfWarRenderer } from '../game/rendering/FogOfWarRenderer';
import { TacticalIconRenderer } from '../game/rendering/TacticalIconRenderer';
import { LAYERS } from '../game/utils/LayerConstants';
import type { GameMap, DeckData, MapSize, BiomeType, TerrainCell, EntryPoint } from '../data/types';
import type { PlayerSlot } from '../screens/SkirmishSetupScreen';
import { STARTER_DECKS } from '../data/starterDecks';
import { getUnitById } from '../data/factions';
import { BenchmarkManager } from '../game/debug/BenchmarkManager';
import { TraversabilityDebugRenderer } from '../game/debug/TraversabilityDebugRenderer';
import { VectorPool } from '../game/utils/VectorPool';
import { QuaternionPool } from '../game/utils/QuaternionPool';
import { SoundLibrary } from '../game/audio/SoundLibrary';
import { SpatialAudioManager } from '../game/audio/SpatialAudioManager';
import { AUDIO_MANIFEST } from '../data/audioManifest';
import { showConfirmDialog } from './UINotifications';
import { GamePhase } from '@shared/core/GamePhase';
import type { SimGameContext } from '@shared/core/SimGameContext';
import type { SimUnit } from '@shared/simulation/SimUnit';
import { getWeaponById as getWeaponByIdLookup } from '../data/factions';
import { gameRNG } from '../game/utils/DeterministicRNG';

// Re-export GamePhase so existing imports from '../../core/Game' continue working
export { GamePhase } from '@shared/core/GamePhase';

export class Game {
  // Debug flags
  public static verbose = false; // Enable verbose logging (AI profiling, detailed logs)
  public static showPoolStats = false; // Show object pool statistics in FPS overlay
  public static showTraversability = false; // Show navGrid traversability overlay
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
  public readonly aiManager: AIManager;
  public readonly reinforcementManager: ReinforcementManager;
  public readonly fogOfWarManager: FogOfWarManager;
  public readonly multiplayerManager: MultiplayerManager;
  public readonly multiplayerBattleSync: MultiplayerBattleSync;
  public readonly buildingManager: BuildingManager;
  public readonly transportManager: TransportManager;
  public readonly smokeManager: SmokeManager;
  public readonly pathfindingManager: PathfindingManager;
  public readonly navMeshManager: NavMeshManager;
  public readonly damageNumberManager: DamageNumberManager;
  public readonly visualEffectsManager: VisualEffectsManager;
  public readonly audioManager: AudioManager;
  public readonly soundLibrary: SoundLibrary;
  public readonly audioListener: THREE.AudioListener;
  public readonly spatialAudioManager: SpatialAudioManager;
  public readonly screenManager: ScreenManager;
  public mapRenderer: MapRenderer | null = null;
  public minimapRenderer: MinimapRenderer | null = null;
  public pathRenderer: PathRenderer | null = null;
  public instancedUnitRenderer: InstancedUnitRenderer | null = null;
  public batchedUIRenderer: BatchedUnitUIRenderer | null = null;
  public losPreviewRenderer: LOSPreviewRenderer | null = null;
  public fogOfWarRenderer: FogOfWarRenderer | null = null;
  public tacticalIconRenderer: TacticalIconRenderer | null = null;
  public benchmarkManager: BenchmarkManager;
  private traversabilityRenderer: TraversabilityDebugRenderer | null = null;

  // Game state
  private _phase: GamePhase = GamePhase.Loading;
  private _isRunning = false;
  private _lastTime = 0;
  private _isPaused = false;

  // Pause menu elements
  private pauseMenu: HTMLElement | null = null;

  // Debug panel
  private debugPanel: HTMLElement | null = null;
  private debugPanelVisible = false;

  // Last skirmish config (for rematch)
  private lastDeck: DeckData | null = null;
  private lastMapSize: MapSize = 'medium';
  private lastMapSeed: number = 0;
  private lastTeam1: PlayerSlot[] = [];
  private lastTeam2: PlayerSlot[] = [];

  // Fixed timestep for game logic
  private readonly FIXED_TIMESTEP = 1 / 60; // 60 Hz
  private _accumulator = 0;

  // FPS tracking
  private _fpsFrameCount = 0;
  private _fpsLastTime = 0;
  private _currentFps = 0;
  private _fpsOverlay: HTMLElement | null = null;
  private _showFpsOverlay = true;
  private _lastFrameTime = 0; // For measuring true frame-to-frame time

  // Current map
  public currentMap: GameMap | null = null;

  // Pre-orders for setup phase (queued orders that execute when battle starts)
  private preOrders: Map<string, { type: string; target: THREE.Vector3; targetUnit?: any }[]> = new Map();

  // Ground plane for raycasting
  public readonly groundPlane: THREE.Mesh;

  // Sun light reference for shadow optimization
  private sunLight: THREE.DirectionalLight | null = null;

  // Victory callback
  private onVictoryCallback: ((winner: 'player' | 'enemy') => void) | null = null;

  // Game stats tracking
  private gameStartTime = 0;
  private unitsDeployed = 0;
  private unitsLost = 0;
  private unitsDestroyed = 0;
  private _shadowUpdateCounter = 0;
  private _minimapRenderCounter = 0;
  private creditsEarned = 0;
  private creditsSpent = 0;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      stencil: true, // Required for capture circle overlap prevention
      powerPreference: 'high-performance', // Request discrete GPU
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1); // Fixed 1x — saves 2.25x fill rate vs 1.5x on HiDPI displays
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCF cheaper than PCFSoft, smooth enough at RTS camera distance
    // Shadow maps are static (sun doesn't move) - only update periodically, not every frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

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
    this.camera.position.set(0, 150, 150);
    this.camera.lookAt(0, 0, 0);

    // OPTIMIZATION: Configure camera to render DEFAULT and RENDER_ONLY layers
    // RAYCAST_ONLY layer is invisible (used for selection hit-testing only)
    this.camera.layers.enable(LAYERS.DEFAULT);
    this.camera.layers.enable(LAYERS.RENDER_ONLY);
    this.camera.layers.disable(LAYERS.RAYCAST_ONLY);

    // Create AudioListener and attach to camera for spatial audio
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);

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
    this.aiManager = new AIManager(this);
    this.reinforcementManager = new ReinforcementManager(this);
    this.fogOfWarManager = new FogOfWarManager(this);
    this.multiplayerManager = new MultiplayerManager(this);
    this.multiplayerBattleSync = new MultiplayerBattleSync(this);
    this.buildingManager = new BuildingManager(this);
    this.transportManager = new TransportManager(this);
    this.smokeManager = new SmokeManager(this);
    this.pathfindingManager = new PathfindingManager(this);
    this.navMeshManager = new NavMeshManager(this);
    // Initialize recast-navigation WASM early (non-blocking)
    this.navMeshManager.initWasm().catch(err => {
      console.warn('[Game] NavMesh WASM init failed, falling back to grid A*:', err);
    });
    this.damageNumberManager = new DamageNumberManager(this);
    this.visualEffectsManager = new VisualEffectsManager(this);
    this.audioManager = new AudioManager();
    this.soundLibrary = new SoundLibrary();
    this.spatialAudioManager = new SpatialAudioManager(this.audioListener, this.soundLibrary, this.camera);
    // Initialize audio manager with spatial audio capabilities
    this.audioManager.initializeSpatialAudio(this.soundLibrary, this.spatialAudioManager);
    this.screenManager = new ScreenManager();
    // MapRenderer will be created when starting a battle (needs biome parameter)
    this.minimapRenderer = new MinimapRenderer(this);
    this.pathRenderer = new PathRenderer(this.scene, this);
    this.instancedUnitRenderer = new InstancedUnitRenderer(this, this.scene);
    this.instancedUnitRenderer.initialize();
    this.batchedUIRenderer = new BatchedUnitUIRenderer(this, this.scene);
    this.batchedUIRenderer.initialize();
    this.tacticalIconRenderer = new TacticalIconRenderer(this, this.scene);
    this.tacticalIconRenderer.initialize();
    this.losPreviewRenderer = new LOSPreviewRenderer(this);
    this.benchmarkManager = new BenchmarkManager(this);

    // Setup lighting
    this.setupLighting();

    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private setupLighting(): void {
    // ENHANCED LIGHTING SETUP
    // Reduced ambient light to create darker shadows (simulates ambient occlusion)
    const ambientLight = new THREE.AmbientLight(0x303050, 0.3);
    this.scene.add(ambientLight);

    // Main directional light (sun) - increased intensity for better contrast
    this.sunLight = new THREE.DirectionalLight(0xfff4e6, 1.4);
    this.sunLight.position.set(60, 120, 40); // Higher angle for more dramatic shadows
    this.sunLight.castShadow = true;

    // Shadow quality - 2048 provides good quality while maintaining 60 FPS
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;

    // Optimized shadow camera bounds - wider coverage area for better shadow rendering
    this.sunLight.shadow.camera.near = 5;  // Closer near plane for better precision
    this.sunLight.shadow.camera.far = 400; // Extended far plane for larger shadow distance
    this.sunLight.shadow.camera.left = -150;
    this.sunLight.shadow.camera.right = 150;
    this.sunLight.shadow.camera.top = 150;
    this.sunLight.shadow.camera.bottom = -150;

    // Shadow bias values tuned to prevent shadow acne with terrain normal maps
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.08; // Must exceed normalScale-induced perturbation

    // PCF shadow radius for even softer, more realistic shadows
    this.sunLight.shadow.radius = 2.0;

    this.scene.add(this.sunLight);

    // Fill light (soft directional from opposite side) - simulates bounce light
    const fillLight = new THREE.DirectionalLight(0x8899dd, 0.4);
    fillLight.position.set(-40, 60, -30);
    fillLight.castShadow = false; // No shadows for fill light (performance)
    this.scene.add(fillLight);

    // Rim/back light for depth and edge definition
    const rimLight = new THREE.DirectionalLight(0xccddff, 0.3);
    rimLight.position.set(-20, 40, 80);
    rimLight.castShadow = false; // No shadows for rim light (performance)
    this.scene.add(rimLight);

    // Enhanced hemisphere light for sky/ground ambient occlusion effect
    // Brighter sky, darker ground creates natural ambient occlusion gradient
    const hemiLight = new THREE.HemisphereLight(0x9999cc, 0x2a2a1a, 0.5);
    this.scene.add(hemiLight);

    // Create FPS overlay
    this.createFpsOverlay();
  }

  private createFpsOverlay(): void {
    this._fpsOverlay = document.createElement('div');
    this._fpsOverlay.id = 'fps-overlay';
    this._fpsOverlay.style.cssText = `
      position: fixed;
      top: 5px;
      right: 220px;
      background: rgba(0, 0, 0, 0.7);
      color: #0f0;
      font-family: monospace;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 4px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(this._fpsOverlay);
  }

  private updateFps(currentTime: number): void {
    this._fpsFrameCount++;

    // Update FPS every 250ms for more responsive display
    if (currentTime - this._fpsLastTime >= 250) {
      this._currentFps = Math.round((this._fpsFrameCount * 1000) / (currentTime - this._fpsLastTime));
      this._fpsFrameCount = 0;
      this._fpsLastTime = currentTime;

      if (this._fpsOverlay && this._showFpsOverlay) {
        const triangles = this.renderer.info.render.triangles;
        const calls = this.renderer.info.render.calls;

        let html = `
          FPS: ${this._currentFps}<br>
          Draw calls: ${calls}<br>
          Triangles: ${triangles.toLocaleString()}
        `;

        // Add pool statistics if debug flag is enabled
        if (Game.showPoolStats) {
          const vectorPoolStats = VectorPool.getStats();
          const projectilePoolStats = this.combatManager.getProjectilePoolStats();

          html += `<br>
          <br>
          <strong>Pool Stats:</strong><br>
          VectorPool: ${vectorPoolStats.active}/${vectorPoolStats.total}<br>
          ProjectilePool: ${projectilePoolStats.active}/${projectilePoolStats.total}
          `;
        }

        this._fpsOverlay.innerHTML = html;
      }
    }
  }

  /**
   * Configure rendering settings based on map size for performance
   */
  private configureRenderingForMapSize(mapWidth: number, mapHeight: number): void {
    const mapSize = Math.max(mapWidth, mapHeight);

    // Update camera far plane for large maps
    // Ensure far plane is large enough to see corners of map from high angle
    this.camera.far = Math.max(2000, mapSize * 3.0);
    this.camera.updateProjectionMatrix();

    // Update fog for large maps
    const fogNear = Math.max(500, mapSize * 0.5);
    const fogFar = Math.max(2000, mapSize * 2.5);
    this.scene.fog = new THREE.Fog(0x1a1a2e, fogNear, fogFar);

    // Update shadow settings based on map size (use stored reference)
    if (this.sunLight) {
      // For large maps, adjust shadow quality and coverage for performance
      if (mapSize > 5000) {
        // Very large maps - disable shadows entirely for performance
        this.sunLight.castShadow = false;
        this.renderer.shadowMap.enabled = false;
      } else if (mapSize > 2000) {
        // Large maps - reduced shadow quality but still smooth with PCFSoft
        this.sunLight.shadow.mapSize.width = 2048;  // Maintain reasonable quality
        this.sunLight.shadow.mapSize.height = 2048;
        this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCF cheaper than PCFSoft
        this.sunLight.shadow.radius = 1.5; // Slightly reduced radius for performance

        const shadowRange = Math.min(180, mapSize * 0.12);
        this.sunLight.shadow.camera.left = -shadowRange;
        this.sunLight.shadow.camera.right = shadowRange;
        this.sunLight.shadow.camera.top = shadowRange;
        this.sunLight.shadow.camera.bottom = -shadowRange;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = Math.min(450, mapSize * 0.35);

        // Bias tuned for terrain normal map perturbation at lower shadow resolution
        this.sunLight.shadow.bias = -0.0008;
        this.sunLight.shadow.normalBias = 0.1;

        this.sunLight.shadow.camera.updateProjectionMatrix();
      } else if (mapSize > 500) {
        // Medium maps - optimized for 60 FPS with good quality
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.radius = 2.0; // Full soft shadow quality

        const shadowRange = Math.min(160, mapSize * 0.25);
        this.sunLight.shadow.camera.left = -shadowRange;
        this.sunLight.shadow.camera.right = shadowRange;
        this.sunLight.shadow.camera.top = shadowRange;
        this.sunLight.shadow.camera.bottom = -shadowRange;
        this.sunLight.shadow.camera.near = 8;
        this.sunLight.shadow.camera.far = Math.min(420, mapSize * 0.45);

        this.sunLight.shadow.camera.updateProjectionMatrix();
      }
      // Small maps (<= 500) keep default high-quality settings (4096x4096, radius 2.0)
    }
  }

  async loadAssets(): Promise<void> {
    // TODO: Load models, textures, and unit data
    // For now, just simulate loading time
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async initialize(): Promise<void> {
    // Preload audio files
    console.log('[Game] Preloading audio files...');
    const soundManifest: Record<string, string> = {};
    for (const sound of AUDIO_MANIFEST) {
      if (sound.filePath) {
        soundManifest[sound.id] = sound.filePath;
      }
    }
    await this.soundLibrary.preloadSounds(soundManifest);
    const cachedCount = this.soundLibrary.getCachedSoundCount();
    console.log(`[Game] Audio preloading complete: ${cachedCount}/${AUDIO_MANIFEST.length} sounds loaded`);

    // Initialize all managers
    this.inputManager.initialize();
    this.selectionManager.initialize();
    this.unitManager.initialize();
    this.combatManager.initialize();
    this.visualEffectsManager.initialize();

    // Setup victory callback
    this.economyManager.setVictoryCallback(this.onVictory.bind(this));

    // Wire up pause menu buttons
    this.setupPauseMenu();

    // Wire up victory screen buttons
    this.setupVictoryScreen();

    // Wire up start battle button
    this.setupStartBattleButton();

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

    // Measure true frame-to-frame time (includes GPU wait)
    const trueFrameTime = this._lastFrameTime > 0 ? currentTime - this._lastFrameTime : 0;
    this._lastFrameTime = currentTime;

    const deltaTime = (currentTime - this._lastTime) / 1000;
    this._lastTime = currentTime;

    // Clamp delta time to prevent spiral of death
    const clampedDelta = Math.min(deltaTime, 0.1);

    // Fixed timestep update for game logic
    this._accumulator += clampedDelta;
    const fixedStart = performance.now();
    let fixedIterations = 0;
    while (this._accumulator >= this.FIXED_TIMESTEP) {
      this.fixedUpdate(this.FIXED_TIMESTEP);
      this._accumulator -= this.FIXED_TIMESTEP;
      fixedIterations++;
    }
    const fixedEnd = performance.now();
    const fixedTime = fixedEnd - fixedStart;

    // Variable update for visual interpolation
    const updateStart = performance.now();
    this.update(clampedDelta);
    const updateEnd = performance.now();
    const updateTime = updateEnd - updateStart;

    // Render
    const renderStart = performance.now();
    this.render();
    const renderEnd = performance.now();
    const renderTime = renderEnd - renderStart;

    // Calculate our measured time vs true frame time
    const measuredTime = renderEnd - fixedStart;
    const unmeasuredTime = trueFrameTime - measuredTime;

    // Log breakdown if frame is slow (sample 5% to avoid spam)
    if (trueFrameTime > 20 && this._phase === GamePhase.Battle && Math.random() < 0.05) {
      const trueFps = trueFrameTime > 0 ? 1000 / trueFrameTime : 0;
      console.warn(`[PERF] True frame time: ${trueFrameTime.toFixed(1)}ms (${trueFps.toFixed(1)} FPS)`);
      console.log(`  FixedUpdate (${fixedIterations}x): ${fixedTime.toFixed(1)}ms`);
      console.log(`  Update: ${updateTime.toFixed(1)}ms`);
      console.log(`  Render (CPU): ${renderTime.toFixed(1)}ms`);
      console.log(`  Measured total: ${measuredTime.toFixed(1)}ms`);
      console.log(`  Unmeasured (GPU wait + overhead): ${unmeasuredTime.toFixed(1)}ms`);
    }

    // Update FPS display
    this.updateFps(currentTime);
  }

  /**
   * Fixed timestep update for game logic
   */
  private fixedUpdate(dt: number): void {
    if (this._isPaused) return;

    // CRITICAL PERFORMANCE: Reset pathfinding budget at start of each frame
    // This prevents pathfinding from consuming entire frame budget
    this.pathfindingManager.resetFrameBudget();
    this.navMeshManager.resetFrameBudget();

    if (this._phase === GamePhase.Battle) {
      const t0 = performance.now();
      this.unitManager.fixedUpdate(dt);
      const t1 = performance.now();
      this.combatManager.processCombat(dt);
      const t2 = performance.now();

      const fixedTotal = t2 - t0;
      // Log if slow OR randomly sample to see typical values
      if (fixedTotal > 5 || Math.random() < 0.05) {
        console.warn(`[PERF] FixedUpdate: ${fixedTotal.toFixed(1)}ms`);
        console.log(`  UnitManager.fixedUpdate: ${(t1 - t0).toFixed(1)}ms`);
        console.log(`  CombatManager.processCombat: ${(t2 - t1).toFixed(1)}ms`);
      }
    }
  }

  /**
   * Variable timestep update for visuals
   */
  private update(dt: number): void {
    const frameStart = performance.now();

    // Reset vector pool at start of each frame
    VectorPool.reset();

    // Reset quaternion pool at start of each frame
    QuaternionPool.reset();

    // Declare all timing variables at function scope
    let t0, t1, t2, t3, t4, t5, t6;

    // Only update game systems in appropriate phases (and not paused)
    if (!this._isPaused && (this._phase === GamePhase.Setup || this._phase === GamePhase.Battle)) {
      t0 = performance.now();
      this.cameraController.update(dt);
      t1 = performance.now();

      this.inputManager.update(dt);
      t2 = performance.now();

      this.selectionManager.update(dt);
      t3 = performance.now();

      this.unitManager.update(dt);
      t4 = performance.now();

      this.mapRenderer?.update(dt); // Animate capture zone borders, etc.
      t5 = performance.now();

      this.buildingManager.update(); // Update building occupancy indicators (billboard effect)

      this.pathRenderer?.update(dt); // Update path lines as units move
      this.instancedUnitRenderer?.update(); // Update instanced unit rendering
      this.batchedUIRenderer?.update(); // Update batched UI rendering (health/morale bars)
      this.tacticalIconRenderer?.update(); // Update tactical icon rendering
      t6 = performance.now();

      // Update LOS preview if active
      if (this.inputManager.isLOSPreviewActive) {
        const mousePos = this.inputManager.mousePosition;
        const worldPos = this.screenToWorld(mousePos.x, mousePos.y);
        if (worldPos) {
          const selectedUnits = this.selectionManager.getSelectedUnits();
          const unit = selectedUnits.length > 0 ? (selectedUnits[0] ?? null) : null;
          this.losPreviewRenderer?.show(worldPos, unit);
        }
      } else {
        this.losPreviewRenderer?.hide();
      }
    }

    // Update fog of war renderer during setup phase (visual overlay only, no vision recalc)
    if (!this._isPaused && this._phase === GamePhase.Setup) {
      this.fogOfWarRenderer?.update(dt);
    }

    let t7, t8, t9, t10, t11, t12, t13, t14, t15, t16;
    if (!this._isPaused && this._phase === GamePhase.Battle) {
      t7 = performance.now();
      this.economyManager.update(dt);
      t8 = performance.now();

      this.combatManager.update(dt);
      t9 = performance.now();

      this.aiManager.update(dt);
      t10 = performance.now();

      this.reinforcementManager.update(dt);
      t11 = performance.now();

      this.fogOfWarManager.update(dt);
      t12 = performance.now();

      // Update fog of war renderer (visual overlay)
      this.fogOfWarRenderer?.update(dt);

      this.multiplayerBattleSync.update(dt);
      t13 = performance.now();

      this.transportManager.update(dt);
      t14 = performance.now();

      this.smokeManager.update(dt);
      t15 = performance.now();

      this.damageNumberManager.update(dt);
      t16 = performance.now();

      this.visualEffectsManager.update(dt);

      // Update spatial audio manager for cleanup of finished sounds
      this.spatialAudioManager.update();
    }

    const beforeScreen = performance.now();
    // Screen manager always updates
    this.screenManager.update(dt);
    const afterScreen = performance.now();

    // Update benchmark
    this.benchmarkManager.update(dt);

    const frameEnd = performance.now();
    const frameTime = frameEnd - frameStart;

    // Log slow frames (>16.67ms = <60 FPS), sample 30% to get more data
    const isRelevantPhase = this._phase === GamePhase.Battle || this._phase === GamePhase.Setup;
    if (frameTime > 16.67 && isRelevantPhase && Math.random() < 0.3) {
      console.warn(`[PERF] Slow frame: ${frameTime.toFixed(1)}ms (FPS: ${(1000/frameTime).toFixed(1)})`);
      if (t0 !== undefined && t1 !== undefined) {
        console.log(`  Camera: ${(t1 - t0).toFixed(1)}ms`);
        console.log(`  Input: ${(t2! - t1).toFixed(1)}ms`);
        console.log(`  Selection: ${(t3! - t2!).toFixed(1)}ms`);
        console.log(`  UnitManager: ${(t4! - t3!).toFixed(1)}ms`);
        console.log(`  MapRenderer: ${(t5! - t4!).toFixed(1)}ms`);
        console.log(`  PathRenderer: ${(t6! - t5!).toFixed(1)}ms`);
      }
      if (t7) {
        console.log(`  Economy: ${(t8! - t7).toFixed(1)}ms`);
        console.log(`  Combat: ${(t9! - t8!).toFixed(1)}ms`);
        console.log(`  AI: ${(t10! - t9!).toFixed(1)}ms`);
        console.log(`  Reinforcement: ${(t11! - t10!).toFixed(1)}ms`);
        console.log(`  FogOfWar: ${(t12! - t11!).toFixed(1)}ms`);
        console.log(`  Multiplayer: ${(t13! - t12!).toFixed(1)}ms`);
        console.log(`  Transport: ${(t14! - t13!).toFixed(1)}ms`);
        console.log(`  Smoke: ${(t15! - t14!).toFixed(1)}ms`);
        console.log(`  DamageNumbers: ${(t16! - t15!).toFixed(1)}ms`);
        console.log(`  VisualEffects: ${(beforeScreen - t16!).toFixed(1)}ms`);
      }
      console.log(`  ScreenManager: ${(afterScreen - beforeScreen).toFixed(1)}ms`);
    }
  }

  private render(): void {
    // Shadow maps only need updating every ~15 frames (4 Hz at 60 FPS)
    // Sun is static, only unit shadows change - imperceptible at this refresh rate
    this._shadowUpdateCounter++;
    if (this._shadowUpdateCounter >= 15) {
      this.renderer.shadowMap.needsUpdate = true;
      this._shadowUpdateCounter = 0;
    }

    this.renderer.render(this.scene, this.camera);

    // Render minimap at 20 Hz (every 3 frames) — saves ~1ms per frame on off-frames
    this._minimapRenderCounter++;
    if (this._minimapRenderCounter >= 3) {
      this._minimapRenderCounter = 0;
      if (this.minimapRenderer && (this._phase === GamePhase.Setup || this._phase === GamePhase.Battle)) {
        this.minimapRenderer.render();
      }
    }
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

      // Populate player info when showing pause menu
      if (this._isPaused) {
        this.populatePauseMenuPlayers();
      }
    }

    console.log(`Game ${this._isPaused ? 'paused' : 'resumed'}`);
  }

  /**
   * Toggle debug panel visibility (F3 key)
   */
  toggleDebugPanel(): void {
    this.debugPanelVisible = !this.debugPanelVisible;

    if (!this.debugPanel) {
      this.createDebugPanel();
    }

    if (this.debugPanel) {
      this.debugPanel.style.display = this.debugPanelVisible ? 'block' : 'none';
    }
  }

  private createDebugPanel(): void {
    this.debugPanel = document.createElement('div');
    this.debugPanel.id = 'debug-panel';
    this.debugPanel.style.cssText = `
      position: fixed;
      top: 5px;
      right: 5px;
      background: rgba(0, 0, 0, 0.85);
      color: #e0e0e0;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 6px;
      z-index: 10001;
      min-width: 200px;
      border: 1px solid #444;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-weight: bold; margin-bottom: 8px; color: var(--blue-primary, #00aaff); font-family: var(--font-mono, monospace); font-size: 13px;';
    title.textContent = 'DEBUG (F3)';
    this.debugPanel.appendChild(title);

    // FOW toggle
    const fowLabel = document.createElement('label');
    fowLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer;';
    const fowCheckbox = document.createElement('input');
    fowCheckbox.type = 'checkbox';
    fowCheckbox.checked = this.fogOfWarManager.isEnabled();
    fowCheckbox.addEventListener('change', () => {
      this.fogOfWarManager.setEnabled(fowCheckbox.checked);
      if (this.fogOfWarRenderer) {
        // Toggle renderer visibility
        if (!fowCheckbox.checked) {
          this.fogOfWarRenderer.dispose();
          this.fogOfWarRenderer = null;
        } else if (this.currentMap) {
          this.fogOfWarRenderer = new FogOfWarRenderer(this, this.scene);
          this.fogOfWarRenderer.initialize();
          this.fogOfWarManager.forceImmediateUpdate();
        }
      } else if (fowCheckbox.checked && this.currentMap) {
        this.fogOfWarRenderer = new FogOfWarRenderer(this, this.scene);
        this.fogOfWarRenderer.initialize();
        this.fogOfWarManager.forceImmediateUpdate();
      }
    });
    fowLabel.appendChild(fowCheckbox);
    fowLabel.appendChild(document.createTextNode('Fog of War'));
    this.debugPanel.appendChild(fowLabel);

    // Pool stats toggle
    const poolLabel = document.createElement('label');
    poolLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer;';
    const poolCheckbox = document.createElement('input');
    poolCheckbox.type = 'checkbox';
    poolCheckbox.checked = Game.showPoolStats;
    poolCheckbox.addEventListener('change', () => {
      Game.showPoolStats = poolCheckbox.checked;
    });
    poolLabel.appendChild(poolCheckbox);
    poolLabel.appendChild(document.createTextNode('Pool Stats'));
    this.debugPanel.appendChild(poolLabel);

    // Verbose logging toggle
    const verboseLabel = document.createElement('label');
    verboseLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer;';
    const verboseCheckbox = document.createElement('input');
    verboseCheckbox.type = 'checkbox';
    verboseCheckbox.checked = Game.verbose;
    verboseCheckbox.addEventListener('change', () => {
      Game.verbose = verboseCheckbox.checked;
    });
    verboseLabel.appendChild(verboseCheckbox);
    verboseLabel.appendChild(document.createTextNode('Verbose Logging'));
    this.debugPanel.appendChild(verboseLabel);

    // Traversability overlay toggle
    const travLabel = document.createElement('label');
    travLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer;';
    const travCheckbox = document.createElement('input');
    travCheckbox.type = 'checkbox';
    travCheckbox.checked = Game.showTraversability;
    travCheckbox.addEventListener('change', () => {
      Game.showTraversability = travCheckbox.checked;
      if (travCheckbox.checked) {
        if (!this.traversabilityRenderer) {
          this.traversabilityRenderer = new TraversabilityDebugRenderer(this, this.scene);
        }
        this.traversabilityRenderer.build();
      } else {
        this.traversabilityRenderer?.dispose();
      }
    });
    travLabel.appendChild(travCheckbox);
    travLabel.appendChild(document.createTextNode('Navigation'));
    this.debugPanel.appendChild(travLabel);

    // FPS / draw calls overlay toggle
    const fpsLabel = document.createElement('label');
    fpsLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-top: 6px; cursor: pointer;';
    const fpsCheckbox = document.createElement('input');
    fpsCheckbox.type = 'checkbox';
    fpsCheckbox.checked = this._showFpsOverlay;
    fpsCheckbox.addEventListener('change', () => {
      this._showFpsOverlay = fpsCheckbox.checked;
      if (this._fpsOverlay) {
        this._fpsOverlay.style.display = this._showFpsOverlay ? 'block' : 'none';
      }
    });
    fpsLabel.appendChild(fpsCheckbox);
    fpsLabel.appendChild(document.createTextNode('FPS / Draw Calls'));
    this.debugPanel.appendChild(fpsLabel);

    document.body.appendChild(this.debugPanel);
  }

  /**
   * Populate the pause menu with current player information
   */
  private populatePauseMenuPlayers(): void {
    const team1Container = document.getElementById('pause-team1-players');
    const team2Container = document.getElementById('pause-team2-players');

    if (!team1Container || !team2Container) return;

    // Clear existing content
    team1Container.innerHTML = '';
    team2Container.innerHTML = '';

    // Helper to get deck name
    const getDeckName = (slot: PlayerSlot): string => {
      if (slot.deckId) {
        // Check starter decks
        const starterDeck = STARTER_DECKS.find(d => d.id === slot.deckId);
        if (starterDeck) return starterDeck.name;
        // Check saved decks
        try {
          const savedDecks = JSON.parse(localStorage.getItem('waryes_decks') || '[]');
          const savedDeck = savedDecks.find((d: DeckData) => d.id === slot.deckId);
          if (savedDeck) return savedDeck.name;
        } catch { /* corrupted localStorage data */ }
      }
      return 'Random Deck';
    };

    // Render player card
    const renderPlayerCard = (slot: PlayerSlot, index: number, isYou: boolean): string => {
      const name = isYou ? 'Player' : `CPU ${index + 1}`;
      const difficulty = slot.type === 'CPU' ? ` (${slot.difficulty})` : '';
      const deckName = isYou && this.lastDeck ? this.lastDeck.name : getDeckName(slot);

      return `
        <div class="pause-player-card ${isYou ? 'is-you' : ''}">
          <div class="pause-player-name">
            ${name}${difficulty}
            ${isYou ? '<span class="you-badge">YOU</span>' : ''}
          </div>
          <div class="pause-player-deck">
            Deck: <span class="deck-name">${deckName}</span>
          </div>
        </div>
      `;
    };

    // Team 1 (player's team)
    // Add the human player first
    team1Container.innerHTML += renderPlayerCard({ type: 'YOU', difficulty: 'Medium' }, 0, true);

    // Add CPU allies
    let allyIndex = 0;
    for (const slot of this.lastTeam1) {
      if (slot.type === 'CPU') {
        team1Container.innerHTML += renderPlayerCard(slot, allyIndex++, false);
      }
    }

    // Team 2 (enemy team)
    let enemyIndex = 0;
    for (const slot of this.lastTeam2) {
      if (slot.type === 'CPU') {
        team2Container.innerHTML += renderPlayerCard(slot, enemyIndex++, false);
      }
    }

    // If no enemies shown, add a placeholder
    if (team2Container.innerHTML === '') {
      team2Container.innerHTML = `
        <div class="pause-player-card">
          <div class="pause-player-name">CPU 1</div>
          <div class="pause-player-deck">Deck: <span class="deck-name">AI Opponent</span></div>
        </div>
      `;
    }
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

    // Hide standalone top-bar during setup/battle - credits are in the battle-unit-bar
    if (topBar) topBar.style.display = 'none';
    // Score display during both setup and battle
    if (scoreDisplay) scoreDisplay.style.display = inBattle ? 'block' : 'none';
    // Phase indicator only shown during Setup, hidden during Battle
    if (phaseIndicator) phaseIndicator.style.display = phase === GamePhase.Setup ? 'block' : 'none';
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

    // Show unit bar during both Setup and Battle phases
    if (phase === GamePhase.Setup || phase === GamePhase.Battle) {
      this.deploymentManager.showBattleUnitBar();
      // Hide the right-side deployment panel - we only use the top bar now
      this.deploymentManager.hide();
    } else {
      this.deploymentManager.hideBattleUnitBar();
    }
  }

  /**
   * Start a skirmish battle with the given configuration
   */
  async startSkirmish(deck: DeckData, mapSize: MapSize, mapSeed: number, team1?: PlayerSlot[], team2?: PlayerSlot[], biome?: BiomeType, existingMap?: GameMap): Promise<void> {
    // Save configuration for rematch
    this.lastDeck = deck;
    this.lastMapSize = mapSize;
    this.lastMapSeed = mapSeed;
    this.lastTeam1 = team1 ?? [];
    this.lastTeam2 = team2 ?? [];

    // Reset stats for new game
    this.resetStats();

    // Use existing map if provided, otherwise generate new one in worker
    if (existingMap) {
      this.currentMap = existingMap;
    } else {
      this.currentMap = await generateMapAsync(mapSeed, mapSize, biome);
    }

    // Recreate MapRenderer with biome colors
    if (this.mapRenderer) {
      this.mapRenderer.dispose();
    }
    this.mapRenderer = new MapRenderer(this.scene, this.currentMap.biome);

    // Render map
    if (this.mapRenderer) {
      this.mapRenderer.render(this.currentMap);

      // Generate navmesh from rendered terrain
      this.navMeshManager.generateFromScene();

      // Wire terrain zone shader to LOS preview renderer
      if (this.losPreviewRenderer) {
        this.losPreviewRenderer.setTerrainZoneShader(this.mapRenderer.getTerrainZoneShader());
      }
    }

    // Set map for minimap
    if (this.minimapRenderer) {
      this.minimapRenderer.setMap(this.currentMap);
    }

    // Set camera bounds based on map size
    this.cameraController.setBounds(this.currentMap.width, this.currentMap.height);

    // Configure rendering for map size
    this.configureRenderingForMapSize(this.currentMap.width, this.currentMap.height);

    // Hide ground plane (map terrain replaces it)
    this.groundPlane.visible = false;

    // Initialize economy with capture zones
    this.economyManager.initialize(this.currentMap.captureZones);

    // Initialize reinforcement manager with resupply points converted to entry points
    // Convert resupply points to entry point format for spawning
    const entryPointsFromResupply: EntryPoint[] = this.currentMap.resupplyPoints.map((rp) => ({
      id: rp.id,
      team: rp.team,
      x: rp.x,
      z: rp.z,
      type: 'secondary' as const, // Medium spawn rate
      spawnRate: 3, // 3 seconds between spawns (reasonable for mid-battle reinforcements)
      queue: [], // Start with empty queue
      rallyPoint: null, // No rally point initially
    }));
    this.reinforcementManager.initialize(entryPointsFromResupply);

    // Initialize building manager with map buildings
    this.buildingManager.initialize(this.currentMap.buildings);

    // Find player deployment zones
    const playerZones = this.currentMap.deploymentZones.filter(z => z.team === 'player');
    if (playerZones.length > 0) {
      this.deploymentManager.initialize(deck, playerZones);
    }

    // Position camera at first player deployment zone
    const firstPlayerZone = playerZones[0];
    if (firstPlayerZone) {
      const centerX = (firstPlayerZone.minX + firstPlayerZone.maxX) / 2;
      const centerZ = (firstPlayerZone.minZ + firstPlayerZone.maxZ) / 2;
      this.cameraController.setPosition(centerX, centerZ);
    }

    // Initialize AI manager
    this.aiManager.initialize('medium');

    // Spawn AI units for enemy team
    this.spawnEnemyUnits();

    // Spawn ally CPU units (teammates that share vision with player)
    this.spawnAllyAIUnits();

    // Initialize fog of war during deployment so map starts black
    this.fogOfWarManager.initialize();

    // Create fog of war renderer if it doesn't exist
    if (!this.fogOfWarRenderer) {
      this.fogOfWarRenderer = new FogOfWarRenderer(this, this.scene);
    }
    this.fogOfWarRenderer.initialize();

    // Reveal player deployment zones (not unit-based vision, just the zone rectangles)
    const playerDeployZones = this.currentMap.deploymentZones.filter(z => z.team === 'player');
    for (const zone of playerDeployZones) {
      this.fogOfWarManager.revealArea(zone.minX, zone.minZ, zone.maxX, zone.maxZ, 'player');
    }

    // Enter setup phase
    this.setPhase(GamePhase.Setup);
    this.screenManager.switchTo(ScreenType.Battle);
  }

  /**
   * Start a multiplayer battle with server-authoritative sync.
   * Similar to startSkirmish but doesn't spawn AI units (server handles all simulation).
   */
  async startMultiplayerBattle(
    mapSeed: number,
    mapSize: MapSize,
    deckId: string | null,
    playerTeam: 'team1' | 'team2',
  ): Promise<void> {
    this.resetStats();

    // Generate map deterministically from seed (must match server) in worker
    this.currentMap = await generateMapAsync(mapSeed, mapSize);

    // Setup map rendering
    if (this.mapRenderer) {
      this.mapRenderer.dispose();
    }
    this.mapRenderer = new MapRenderer(this.scene, this.currentMap.biome);
    this.mapRenderer.render(this.currentMap);

    // Generate navmesh from rendered terrain
    this.navMeshManager.generateFromScene();

    if (this.losPreviewRenderer) {
      this.losPreviewRenderer.setTerrainZoneShader(this.mapRenderer.getTerrainZoneShader());
    }

    if (this.minimapRenderer) {
      this.minimapRenderer.setMap(this.currentMap);
    }

    // Camera setup
    this.cameraController.setBounds(this.currentMap.width, this.currentMap.height);
    this.configureRenderingForMapSize(this.currentMap.width, this.currentMap.height);
    this.groundPlane.visible = false;

    // Initialize economy with capture zones
    this.economyManager.initialize(this.currentMap.captureZones);

    // Initialize reinforcement manager
    const entryPointsFromResupply: EntryPoint[] = this.currentMap.resupplyPoints.map((rp) => ({
      id: rp.id,
      team: rp.team,
      x: rp.x,
      z: rp.z,
      type: 'secondary' as const,
      spawnRate: 3,
      queue: [],
      rallyPoint: null,
    }));
    this.reinforcementManager.initialize(entryPointsFromResupply);

    // Initialize building manager
    this.buildingManager.initialize(this.currentMap.buildings);

    // Map lobby team to game team for deployment zones
    const gameTeam = playerTeam === 'team1' ? 'player' : 'enemy';
    const deployZones = this.currentMap.deploymentZones.filter(z => z.team === gameTeam);

    // Initialize deployment with player's deck
    const deck = this.getMultiplayerDeck(deckId);
    if (deployZones.length > 0 && deck) {
      this.deploymentManager.initialize(deck, deployZones);
    }

    // Position camera at first deployment zone
    const firstZone = deployZones[0];
    if (firstZone) {
      const centerX = (firstZone.minX + firstZone.maxX) / 2;
      const centerZ = (firstZone.minZ + firstZone.maxZ) / 2;
      this.cameraController.setPosition(centerX, centerZ);
    }

    // Initialize fog of war
    this.fogOfWarManager.initialize();
    if (!this.fogOfWarRenderer) {
      this.fogOfWarRenderer = new FogOfWarRenderer(this, this.scene);
    }
    this.fogOfWarRenderer.initialize();

    // Reveal player deployment zones
    for (const zone of deployZones) {
      this.fogOfWarManager.revealArea(zone.minX, zone.minZ, zone.maxX, zone.maxZ, gameTeam);
    }

    // Enable server-authoritative sync
    const playerId = this.multiplayerManager.getPlayerId();
    this.multiplayerBattleSync.enableAuthoritativeSync(playerId);

    // Listen for server phase changes
    this.multiplayerManager.on('phase_change', (phase: string) => {
      if (phase === 'battle' && this._phase === GamePhase.Setup) {
        this.startBattle();
      }
    });

    // Listen for game events (victory, etc.)
    this.multiplayerManager.on('game_event', (eventType: string, data: any) => {
      if (eventType === 'victory') {
        const winner = data.winner === playerTeam ? 'player' : 'enemy';
        this.onVictory(winner);
      }
    });

    // Enter setup phase
    this.setPhase(GamePhase.Setup);
    this.screenManager.switchTo(ScreenType.Battle);

    console.log(`[Game] Multiplayer battle started (seed: ${mapSeed}, size: ${mapSize}, team: ${playerTeam})`);
  }

  /**
   * Get deck for multiplayer from localStorage or starter decks
   */
  private getMultiplayerDeck(deckId: string | null): DeckData | null {
    if (!deckId) return null;

    // Check starter decks
    const starterDeck = STARTER_DECKS.find(d => d.id === deckId);
    if (starterDeck) return starterDeck;

    // Check saved decks in localStorage
    try {
      const savedDecks: DeckData[] = JSON.parse(localStorage.getItem('waryes_decks') || '[]');
      const savedDeck = savedDecks.find(d => d.id === deckId);
      if (savedDeck) return savedDeck;
    } catch {
      // Ignore parse errors
    }

    return null;
  }

  private spawnEnemyUnits(): void {
    if (!this.currentMap) return;

    const enemyZones = this.currentMap.deploymentZones.filter(z => z.team === 'enemy');
    if (enemyZones.length === 0) return;

    // Get enemy CPU players from team2
    const enemyCPUs = this.lastTeam2.filter(slot => slot.type === 'CPU');

    if (enemyCPUs.length === 0) {
      // Fallback: spawn default enemy units if no CPUs configured
      const fallbackZone = enemyZones[0]!;
      const defaultUnits = ['vanguard_infantry', 'vanguard_infantry', 'vanguard_hunter_tank'];
      defaultUnits.forEach((unitType, i) => {
        const x = fallbackZone.minX + (fallbackZone.maxX - fallbackZone.minX) * (0.3 + 0.2 * i);
        const z = (fallbackZone.minZ + fallbackZone.maxZ) / 2;
        const y = this.getElevationAt(x, z);
        this.unitManager.spawnUnit({
          position: new THREE.Vector3(x, y, z),
          team: 'enemy',
          ownerId: 'enemy',
          unitType,
        });
      });
      return;
    }

    // Distribute CPUs across all available enemy deployment zones
    // Collect all deck unit types for AIManager reinforcement pool
    const allDeckUnitTypes: string[] = [];

    enemyCPUs.forEach((cpu, cpuIndex) => {
      const zone = enemyZones[cpuIndex % enemyZones.length]!;
      const cpusInThisZone = enemyCPUs.filter((_, i) => i % enemyZones.length === cpuIndex % enemyZones.length).length;
      const slotInZone = Math.floor(cpuIndex / enemyZones.length);
      const deck = this.getAIDeck(cpu.deckId);
      const budget = this.getBudgetForDifficulty(cpu.difficulty);

      this.deployAIUnits(
        deck,
        budget,
        zone,
        'enemy',
        `enemy${cpuIndex + 1}`,
        slotInZone,
        cpusInThisZone
      );

      // Collect all unit type IDs from this CPU's deck for reinforcement availability
      for (const deckUnit of deck.units) {
        allDeckUnitTypes.push(deckUnit.unitId);
      }
    });

    // Pass full deck roster to AIManager so it can reinforce with any unit type, not just deployed ones
    if (allDeckUnitTypes.length > 0) {
      this.aiManager.setDeckData('enemy', allDeckUnitTypes);
    }
  }

  private spawnAllyAIUnits(): void {
    if (!this.currentMap) return;

    const playerZones = this.currentMap.deploymentZones.filter(z => z.team === 'player');
    if (playerZones.length === 0) return;

    // Get ally CPU players from team1 (exclude human player)
    const allyCPUs = this.lastTeam1.filter(slot => slot.type === 'CPU');

    if (allyCPUs.length === 0) {
      return; // No ally CPUs to spawn
    }

    // Collect all deck unit types for AIManager reinforcement pool
    const allAllyDeckUnitTypes: string[] = [];

    // Distribute ally CPUs across all available player deployment zones
    // Human player gets zone 0 (slot 0), ally CPUs prefer other zones first
    if (playerZones.length > 1) {
      // Multiple zones: assign ally CPUs to non-human zones first, then overflow
      const allyZones = playerZones.slice(1); // Zones without the human player
      allyCPUs.forEach((cpu, cpuIndex) => {
        const zone = allyZones[cpuIndex % allyZones.length]!;
        const cpusInThisZone = allyCPUs.filter((_, i) => i % allyZones.length === cpuIndex % allyZones.length).length;
        const slotInZone = Math.floor(cpuIndex / allyZones.length);
        const deck = this.getAIDeck(cpu.deckId);
        const budget = this.getBudgetForDifficulty(cpu.difficulty);

        this.deployAIUnits(
          deck,
          budget,
          zone,
          'player',
          `ally${cpuIndex + 1}`,
          slotInZone,
          cpusInThisZone
        );

        for (const deckUnit of deck.units) {
          allAllyDeckUnitTypes.push(deckUnit.unitId);
        }
      });
    } else {
      // Single zone: share with human player (human is slot 0)
      allyCPUs.forEach((cpu, cpuIndex) => {
        const deck = this.getAIDeck(cpu.deckId);
        const budget = this.getBudgetForDifficulty(cpu.difficulty);

        this.deployAIUnits(
          deck,
          budget,
          playerZones[0]!,
          'player',
          `ally${cpuIndex + 1}`,
          cpuIndex + 1,
          allyCPUs.length + 1
        );

        for (const deckUnit of deck.units) {
          allAllyDeckUnitTypes.push(deckUnit.unitId);
        }
      });
    }

    // Pass full ally deck roster to AIManager for reinforcement availability
    if (allAllyDeckUnitTypes.length > 0) {
      this.aiManager.setDeckData('player', allAllyDeckUnitTypes);
    }
  }

  /**
   * Get a deck for AI player - uses specified deck or random starter deck
   */
  private getAIDeck(deckId?: string): DeckData {
    if (deckId) {
      const deck = STARTER_DECKS.find(d => d.id === deckId);
      if (deck) return deck;
    }
    // Return random starter deck (guaranteed to exist)
    const randomDeck = STARTER_DECKS[Math.floor(Math.random() * STARTER_DECKS.length)];
    if (!randomDeck) {
      throw new Error('No starter decks available');
    }
    return randomDeck;
  }

  /**
   * Get deployment budget based on difficulty
   */
  private getBudgetForDifficulty(difficulty: string): number {
    switch (difficulty) {
      case 'Easy': return 600;
      case 'Medium': return 800;
      case 'Hard': return 1000;
      default: return 800;
    }
  }

  /**
   * Deploy AI units from a deck with strategic selection and positioning
   */
  private deployAIUnits(
    deck: DeckData,
    budget: number,
    zone: { minX: number; maxX: number; minZ: number; maxZ: number },
    team: 'player' | 'enemy',
    ownerId: string,
    slotIndex: number,
    totalSlots: number
  ): void {
    let remaining = budget;

    // Calculate this AI's area within the deployment zone
    const zoneWidth = zone.maxX - zone.minX;
    const zoneDepth = zone.maxZ - zone.minZ;
    const slotWidth = zoneWidth / totalSlots;
    const slotStartX = zone.minX + slotIndex * slotWidth;
    const slotEndX = slotStartX + slotWidth;
    const slotCenterX = (slotStartX + slotEndX) / 2;

    // Determine front/back based on team (player at low Z, enemy at high Z)
    const frontZ = team === 'player' ? zone.maxZ : zone.minZ;
    const backZ = team === 'player' ? zone.minZ : zone.maxZ;

    // Categorize available units by role
    const unitsByCategory: { [key: string]: { unitId: string; cost: number }[] } & {
      INF: { unitId: string; cost: number }[];
      TNK: { unitId: string; cost: number }[];
      REC: { unitId: string; cost: number }[];
      ART: { unitId: string; cost: number }[];
      AA: { unitId: string; cost: number }[];
      HEL: { unitId: string; cost: number }[];
      AIR: { unitId: string; cost: number }[];
      LOG: { unitId: string; cost: number }[];
    } = {
      INF: [], TNK: [], REC: [], ART: [], AA: [], HEL: [], AIR: [], LOG: []
    };

    for (const deckUnit of deck.units) {
      const unitData = getUnitById(deckUnit.unitId);
      if (!unitData) continue;
      const category = unitData.category || 'INF';
      if (!unitsByCategory[category]) unitsByCategory[category] = [];
      unitsByCategory[category].push({ unitId: deckUnit.unitId, cost: unitData.cost });
    }

    const deployed: { unitId: string; x: number; z: number }[] = [];
    const jitter = (base: number, range: number) => base + (Math.random() - 0.5) * range;

    // 1. Deploy 2-3 infantry at front line
    const infToSpawn = Math.min(3, unitsByCategory.INF.length);
    for (let i = 0; i < infToSpawn && unitsByCategory.INF.length > 0; i++) {
      const inf = unitsByCategory.INF.shift()!;
      if (remaining < inf.cost) continue;
      remaining -= inf.cost;
      const spreadX = slotWidth * 0.7;
      const x = jitter(slotCenterX + (i - 1) * (spreadX / 3), 3);
      const z = jitter(frontZ - (team === 'player' ? zoneDepth * 0.2 : -zoneDepth * 0.2), 5);
      deployed.push({ unitId: inf.unitId, x, z });
    }

    // 2. Deploy recon on flanks
    for (const rec of unitsByCategory.REC.slice(0, 2)) {
      if (remaining < rec.cost) continue;
      remaining -= rec.cost;
      const side = deployed.length % 2 === 0 ? 1 : -1;
      const x = jitter(slotCenterX + side * (slotWidth * 0.35), 3);
      const z = jitter(frontZ - (team === 'player' ? zoneDepth * 0.1 : -zoneDepth * 0.1), 5);
      deployed.push({ unitId: rec.unitId, x, z });
    }

    // 3. Deploy tanks in center for fire support
    for (const tank of unitsByCategory.TNK.slice(0, 2)) {
      if (remaining < tank.cost) continue;
      remaining -= tank.cost;
      const x = jitter(slotCenterX + (deployed.length % 2 === 0 ? -1 : 1) * (slotWidth * 0.15), 5);
      const z = jitter((frontZ + backZ) / 2, 8);
      deployed.push({ unitId: tank.unitId, x, z });
    }

    // 4. Deploy artillery in the back
    for (const art of unitsByCategory.ART.slice(0, 2)) {
      if (remaining < art.cost) continue;
      remaining -= art.cost;
      const x = jitter(slotCenterX + (deployed.length % 2 === 0 ? -1 : 1) * (slotWidth * 0.25), 5);
      const z = jitter(backZ + (team === 'player' ? zoneDepth * 0.15 : -zoneDepth * 0.15), 5);
      deployed.push({ unitId: art.unitId, x, z });
    }

    // 5. Deploy AA in mid-back
    for (const aa of unitsByCategory.AA.slice(0, 1)) {
      if (remaining < aa.cost) continue;
      remaining -= aa.cost;
      const x = jitter(slotCenterX, 8);
      const z = jitter(backZ + (team === 'player' ? zoneDepth * 0.25 : -zoneDepth * 0.25), 5);
      deployed.push({ unitId: aa.unitId, x, z });
    }

    // 6. Deploy helicopters
    for (const hel of unitsByCategory.HEL.slice(0, 1)) {
      if (remaining < hel.cost) continue;
      remaining -= hel.cost;
      const x = jitter(slotCenterX, 15);
      const z = jitter(backZ + (team === 'player' ? zoneDepth * 0.1 : -zoneDepth * 0.1), 10);
      deployed.push({ unitId: hel.unitId, x, z });
    }

    // 7. Spend remaining budget on more units
    const remainingUnits = [...unitsByCategory.INF, ...unitsByCategory.TNK.slice(2), ...unitsByCategory.REC.slice(2), ...unitsByCategory.LOG];
    for (const unit of remainingUnits) {
      if (remaining < unit.cost) continue;
      remaining -= unit.cost;
      const x = jitter(slotCenterX, slotWidth * 0.4);
      const z = jitter((frontZ + backZ) / 2, zoneDepth * 0.3);
      deployed.push({ unitId: unit.unitId, x, z });
    }

    // Spawn all deployed units
    for (const unit of deployed) {
      const clampedX = Math.max(zone.minX + 5, Math.min(zone.maxX - 5, unit.x));
      const clampedZ = Math.max(zone.minZ + 5, Math.min(zone.maxZ - 5, unit.z));
      const y = this.getElevationAt(clampedX, clampedZ);
      this.unitManager.spawnUnit({
        position: new THREE.Vector3(clampedX, y, clampedZ),
        team,
        ownerId,
        unitType: unit.unitId,
      });
    }

    console.log(`AI ${ownerId} deployed ${deployed.length} units from "${deck.name}" (${budget - remaining}/${budget} credits)`);
  }

  startBattle(): void {
    if (this._phase !== GamePhase.Setup) return;

    // Hide deployment UI
    this.deploymentManager.hide();

    // Hide deployment zone boundaries on the map (no longer needed in battle)
    this.mapRenderer?.setDeploymentZonesVisible(false);

    // Record battle start time
    this.gameStartTime = performance.now();

    // Re-initialize fog of war for battle (clears deployment-only vision)
    this.fogOfWarManager.initialize();

    // Initialize fog of war renderer
    if (!this.fogOfWarRenderer) {
      this.fogOfWarRenderer = new FogOfWarRenderer(this, this.scene);
    }
    this.fogOfWarRenderer.initialize();

    // Immediately compute vision for all units so fog clears around them
    this.fogOfWarManager.forceImmediateUpdate();

    // Initialize pathfinding
    this.pathfindingManager.initialize();

    // Execute all pre-orders
    this.executePreOrders();

    // Clear pre-order path visualizations (dashed lines)
    this.pathRenderer?.clearAllPreOrderPaths();

    // Initialize AI strategy and queue initial movements
    // This ensures AI units have orders ready and begin moving immediately
    this.aiManager.initializeBattle();

    // Start battle
    console.log('[Game] Starting battle...');
    this.setPhase(GamePhase.Battle);
    this.unitManager.unfreezeAll();
    console.log('[Game] Battle started, units unfrozen');
  }

  /**
   * Queue a pre-order for a unit during setup phase
   */
  queuePreOrder(unitId: string, type: string, target: THREE.Vector3, targetUnit?: any): void {
    if (this._phase !== GamePhase.Setup) return; // Only allow during setup

    // Get unit position for path visualization
    const unit = this.unitManager.getUnitById(unitId);
    if (!unit) return;

    if (!this.preOrders.has(unitId)) {
      this.preOrders.set(unitId, []);
    }

    const orders = this.preOrders.get(unitId)!;
    orders.push({ type, target, targetUnit });

    // Show pre-order path (dashed line)
    if (this.pathRenderer) {
      // Get the start position (last order target or unit position)
      const startPos = orders.length > 1
        ? orders[orders.length - 2]!.target
        : unit.position.clone();

      this.pathRenderer.showPreOrderPath(unit, startPos, target, type);
    }

    console.log(`Pre-order queued for unit ${unitId}: ${type}`);
  }

  /**
   * Execute all queued pre-orders when battle starts
   */
  private executePreOrders(): void {
    const allUnits = this.unitManager.getAllUnits();

    this.preOrders.forEach((orders, unitId) => {
      const unit = allUnits.find(u => u.id === unitId);
      if (!unit) return;

      // Execute each order
      orders.forEach(order => {
        switch (order.type) {
          case 'move':
            unit.setMoveCommand(order.target);
            break;
          case 'fast':
            unit.setFastMoveCommand(order.target);
            break;
          case 'reverse':
            unit.setReverseCommand(order.target);
            break;
          case 'attack':
            if (order.targetUnit) {
              unit.setAttackCommand(order.targetUnit);
            }
            break;
          case 'attackMove':
            unit.setAttackMoveCommand(order.target);
            break;
        }
      });

      console.log(`Executed ${orders.length} pre-orders for unit ${unitId}`);
    });

    // Clear pre-orders after execution
    this.preOrders.clear();
  }

  /**
   * Clear all pre-orders (e.g., when restarting setup)
   */
  clearPreOrders(): void {
    this.preOrders.clear();
    // Clear pre-order path visualizations
    this.pathRenderer?.clearAllPreOrderPaths();
  }

  private onVictory(winner: 'player' | 'enemy'): void {
    this.setPhase(GamePhase.Victory);

    // Calculate game time
    const gameTime = (performance.now() - this.gameStartTime) / 1000;
    const minutes = Math.floor(gameTime / 60);
    const seconds = Math.floor(gameTime % 60);
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Get scores
    const scores = this.economyManager.getScore();
    const blueScore = scores.player;
    const redScore = scores.enemy;

    // Get kill stats
    const killStats = this.unitManager.getKillStats('player');

    // Show victory screen
    const victoryScreen = document.getElementById('victory-screen');
    const victoryText = document.getElementById('victory-text');
    const victorySubtitle = document.getElementById('victory-subtitle');

    if (victoryScreen && victoryText) {
      if (winner === 'player') {
        victoryText.textContent = 'VICTORY!';
        victoryText.className = 'victory-text victory-blue';
        if (victorySubtitle) victorySubtitle.textContent = '"The Emperor Protects"';
      } else {
        victoryText.textContent = 'DEFEAT';
        victoryText.className = 'victory-text victory-red';
        if (victorySubtitle) victorySubtitle.textContent = '"We shall return..."';
      }

      // Update stats
      const scoreBlue = document.getElementById('victory-score-blue');
      const scoreRed = document.getElementById('victory-score-red');
      const timeEl = document.getElementById('victory-time');
      const unitsDeployedEl = document.getElementById('victory-units-deployed');
      const unitsLostEl = document.getElementById('victory-units-lost');
      const unitsDestroyedEl = document.getElementById('victory-units-destroyed');
      const creditsEarnedEl = document.getElementById('victory-credits-earned');
      const creditsSpentEl = document.getElementById('victory-credits-spent');

      if (scoreBlue) scoreBlue.textContent = blueScore.toString();
      if (scoreRed) scoreRed.textContent = redScore.toString();
      if (timeEl) timeEl.textContent = timeString;
      if (unitsDeployedEl) unitsDeployedEl.textContent = this.unitsDeployed.toString();
      if (unitsLostEl) unitsLostEl.textContent = this.unitsLost.toString();
      if (unitsDestroyedEl) unitsDestroyedEl.textContent = this.unitsDestroyed.toString();
      if (creditsEarnedEl) creditsEarnedEl.textContent = this.creditsEarned.toString();
      if (creditsSpentEl) creditsSpentEl.textContent = this.creditsSpent.toString();

      // Update hero of match
      const heroName = document.getElementById('hero-unit-name');
      const heroKills = document.getElementById('hero-kills');
      if (heroName && heroKills) {
        if (killStats.heroOfMatch) {
          heroName.textContent = killStats.heroOfMatch.name;
          heroKills.textContent = `${killStats.heroOfMatch.kills} kills`;
        } else {
          heroName.textContent = '---';
          heroKills.textContent = '0 kills';
        }
      }

      // Update most cost effective
      const efficientName = document.getElementById('efficient-unit-name');
      const efficientRatio = document.getElementById('efficient-ratio');
      if (efficientName && efficientRatio) {
        if (killStats.mostCostEffective) {
          efficientName.textContent = killStats.mostCostEffective.name;
          efficientRatio.textContent = `${killStats.mostCostEffective.ratio.toFixed(1)} kills/100cr`;
        } else {
          efficientName.textContent = '---';
          efficientRatio.textContent = '0 kills/100cr';
        }
      }

      // Update top killers list
      const topKillersList = document.getElementById('top-killers-list');
      if (topKillersList) {
        if (killStats.topKillers.length > 0) {
          topKillersList.innerHTML = '';
          for (const [index, unit] of killStats.topKillers.entries()) {
            const row = document.createElement('div');
            row.className = 'killer-row';
            const rank = document.createElement('span');
            rank.className = 'killer-rank';
            rank.textContent = `${index + 1}.`;
            const name = document.createElement('span');
            name.className = 'killer-name';
            name.textContent = unit.name;
            const kills = document.createElement('span');
            kills.className = 'killer-kills';
            kills.textContent = `${unit.kills} kills`;
            row.append(rank, name, kills);
            topKillersList.appendChild(row);
          }
        } else {
          topKillersList.innerHTML = '<div class="killer-row"><span class="killer-name" style="color: #666;">No kills recorded</span></div>';
        }
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
    // No layer restriction for terrain raycasting - we want to hit everything
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
   * Get elevation at a specific world position
   */
  public getElevationAt(x: number, z: number): number {
    if (!this.currentMap) return 0;

    const map = this.currentMap;
    const halfWidth = map.width / 2;
    const halfHeight = map.height / 2;

    // Convert world coords to grid coords
    const gridX = (x + halfWidth) / map.cellSize;
    const gridZ = (z + halfHeight) / map.cellSize;

    // Get the four surrounding grid cells
    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    // Clamp to terrain bounds
    if (!map.terrain || map.terrain.length === 0) return 0;

    const cols = map.terrain[0]?.length || 0;
    const rows = map.terrain.length;
    const cx0 = Math.max(0, Math.min(cols - 1, x0));
    const cx1 = Math.max(0, Math.min(cols - 1, x1));
    const cz0 = Math.max(0, Math.min(rows - 1, z0));
    const cz1 = Math.max(0, Math.min(rows - 1, z1));

    // Get elevations at corners
    const row0 = map.terrain[cz0];
    const row1 = map.terrain[cz1];
    if (!row0 || !row1) return 0;

    const cell00 = row0[cx0];
    const cell10 = row0[cx1];
    const cell01 = row1[cx0];
    const cell11 = row1[cx1];

    if (!cell00 || !cell10 || !cell01 || !cell11) return 0;

    const e00 = cell00.elevation;
    const e10 = cell10.elevation;
    const e01 = cell01.elevation;
    const e11 = cell11.elevation;

    // Bilinear interpolation
    const fx = gridX - x0;
    const fz = gridZ - z0;

    const e0 = e00 * (1 - fx) + e10 * fx;
    const e1 = e01 * (1 - fx) + e11 * fx;

    return e0 * (1 - fz) + e1 * fz;
  }

  /**
   * Get terrain cell at a specific world position
   */
  public getTerrainAt(x: number, z: number): TerrainCell | null {
    if (!this.currentMap) return null;

    const map = this.currentMap;
    const halfWidth = map.width / 2;
    const halfHeight = map.height / 2;

    // Convert world coords to grid coords
    const gridX = Math.floor((x + halfWidth) / map.cellSize);
    const gridZ = Math.floor((z + halfHeight) / map.cellSize);

    // Bounds check
    if (!map.terrain || map.terrain.length === 0) return null;
    const rows = map.terrain.length;
    const cols = map.terrain[0]?.length || 0;

    if (gridZ < 0 || gridZ >= rows || gridX < 0 || gridX >= cols) {
      return null;
    }

    return map.terrain[gridZ]?.[gridX] || null;
  }

  /**
   * Raycast to find units at screen position
   */
  getUnitsAtScreen(screenX: number, screenY: number): THREE.Object3D[] {
    const raycaster = new THREE.Raycaster();
    // OPTIMIZATION: Only test RAYCAST_ONLY layer for unit selection
    // Unit bodyMeshes are on RAYCAST_ONLY layer (invisible but clickable)
    // InstancedUnitRenderer handles actual rendering on RENDER_ONLY layer
    raycaster.layers.set(LAYERS.RAYCAST_ONLY);
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
    this.aiManager.clear();

    if (this.mapRenderer) {
      this.mapRenderer.clear();
    }

    // Clean up fog of war renderer
    if (this.fogOfWarRenderer) {
      this.fogOfWarRenderer.dispose();
      this.fogOfWarRenderer = null;
    }

    // Clean up traversability debug overlay
    if (this.traversabilityRenderer) {
      this.traversabilityRenderer.dispose();
      this.traversabilityRenderer = null;
      Game.showTraversability = false;
    }

    // Clean up visual effects
    this.visualEffectsManager.dispose();

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

  /**
   * Reset stats for a new game
   */
  private resetStats(): void {
    this.gameStartTime = 0;
    this.unitsDeployed = 0;
    this.unitsLost = 0;
    this.unitsDestroyed = 0;
    this.creditsEarned = 0;
    this.creditsSpent = 0;
  }

  /**
   * Increment units deployed counter
   */
  incrementUnitsDeployed(): void {
    this.unitsDeployed++;
  }

  /**
   * Increment units lost counter
   */
  incrementUnitsLost(): void {
    this.unitsLost++;
  }

  /**
   * Increment units destroyed counter
   */
  incrementUnitsDestroyed(): void {
    this.unitsDestroyed++;
  }

  /**
   * Track credits spent
   */
  trackCreditsSpent(amount: number): void {
    this.creditsSpent += amount;
  }

  /**
   * Track credits earned
   */
  trackCreditsEarned(amount: number): void {
    this.creditsEarned += amount;
  }

  /**
   * Setup pause menu event handlers
   */
  private setupPauseMenu(): void {
    this.pauseMenu = document.getElementById('pause-menu');

    const resumeBtn = document.getElementById('pause-resume-btn');
    const settingsBtn = document.getElementById('pause-settings-btn');
    const surrenderBtn = document.getElementById('pause-surrender-btn');
    const quitBtn = document.getElementById('pause-quit-btn');

    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        this.togglePause();
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        // Hide pause menu, show settings screen
        this.togglePause();
        this.screenManager.switchTo(ScreenType.Settings);
      });
    }

    if (surrenderBtn) {
      surrenderBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog('Are you sure you want to surrender?');
        if (confirmed) {
          this.togglePause(); // Unpause first
          this.onVictory('enemy'); // Trigger defeat
        }
      });
    }

    if (quitBtn) {
      quitBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog('Are you sure you want to quit to main menu?');
        if (confirmed) {
          this._isPaused = false; // Reset pause state
          this.returnToMainMenu();
        }
      });
    }

  }

  /**
   * Setup victory screen event handlers
   */
  private setupVictoryScreen(): void {
    const playAgainBtn = document.getElementById('victory-play-again-btn');
    const mainMenuBtn = document.getElementById('victory-main-menu-btn');

    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', async () => {
        // Hide victory screen
        const victoryScreen = document.getElementById('victory-screen');
        if (victoryScreen) {
          victoryScreen.classList.remove('visible');
        }

        // Restart with same settings
        if (this.lastDeck) {
          await this.startSkirmish(this.lastDeck, this.lastMapSize, this.lastMapSeed, this.lastTeam1, this.lastTeam2);
        }
      });
    }

    if (mainMenuBtn) {
      mainMenuBtn.addEventListener('click', () => {
        this.returnToMainMenu();
      });
    }
  }

  /**
   * Setup start battle button
   */
  private setupStartBattleButton(): void {
    const startBtn = document.getElementById('start-battle-btn');
    if (startBtn) {
      console.log('[Game] Start battle button found, attaching listener');
      startBtn.addEventListener('click', () => {
        console.log('[Game] Start battle button clicked');
        this.startBattle();
      });
    } else {
      console.warn('[Game] Start battle button NOT found');
    }
  }

  /**
   * Returns a SimGameContext adapter that bridges the client Game to the shared
   * simulation interfaces. Used by SimUnit to access game services without
   * depending on client-specific types.
   */
  private _simContext: SimGameContext | null = null;

  getSimContext(): SimGameContext {
    if (this._simContext) return this._simContext;

    const game = this;
    this._simContext = {
      get currentMap() { return game.currentMap; },
      get phase() { return game._phase; },
      set phase(p) { game._phase = p; },
      rng: gameRNG,

      getElevationAt: (x, z) => game.getElevationAt(x, z),
      getTerrainAt: (x, z) => game.getTerrainAt(x, z),

      getWeaponData: (id) => getWeaponByIdLookup(id),
      getUnitData: (id) => getUnitById(id),

      getUnitsInRadius: (position, radius, team?) => {
        const units = game.unitManager.getUnitsInRadius(position, radius, team);
        return units.map(u => u.sim);
      },
      getAllUnits: (team) => {
        return game.unitManager.getAllUnits(team).map(u => u.sim);
      },
      destroyUnit: (simUnit: SimUnit) => {
        const unit = game.unitManager.findUnitBySim(simUnit);
        if (unit) game.unitManager.destroyUnit(unit);
      },

      findPath: (from, to) => {
        // Prefer navmesh pathfinding, fall back to grid A*
        if (game.navMeshManager.isReady) {
          const navPath = game.navMeshManager.findPath(from, to);
          if (navPath) return navPath;
        }
        return game.pathfindingManager.findPath(from, to);
      },
      findNearestReachablePosition: (from, to, maxRadius) => {
        if (game.navMeshManager.isReady) {
          const navPos = game.navMeshManager.findNearestReachablePosition(from, to, maxRadius);
          if (navPos) return navPos;
        }
        return game.pathfindingManager.findNearestReachablePosition(from, to, maxRadius);
      },

      findNearestBuilding: (position, radius) =>
        game.buildingManager.findNearestBuilding(position, radius),
      hasBuildingCapacity: (building) =>
        game.buildingManager.hasCapacity(building),
      tryGarrison: (simUnit: SimUnit, building) => {
        const unit = game.unitManager.findUnitBySim(simUnit);
        if (!unit) return false;
        return game.buildingManager.tryGarrison(unit, building);
      },
      ungarrison: (simUnit: SimUnit, building) => {
        const unit = game.unitManager.findUnitBySim(simUnit);
        if (!unit) return null;
        return game.buildingManager.ungarrison(unit, building);
      },
      spawnDefensiveStructure: (simUnit: SimUnit) => {
        const unit = game.unitManager.findUnitBySim(simUnit);
        if (!unit) return null;
        return game.buildingManager.spawnDefensiveStructure(unit);
      },

      tryMount: (passenger: SimUnit, transport: SimUnit) => {
        const passengerUnit = game.unitManager.findUnitBySim(passenger);
        const transportUnit = game.unitManager.findUnitBySim(transport);
        if (!passengerUnit || !transportUnit) return false;
        return game.transportManager.tryMount(passengerUnit, transportUnit);
      },
      unloadAll: (transport: SimUnit) => {
        const transportUnit = game.unitManager.findUnitBySim(transport);
        if (!transportUnit) return [];
        return game.transportManager.unloadAll(transportUnit).map(u => u.sim);
      },

      isPositionOnNavMesh: (x, z) => game.navMeshManager.isPositionOnNavMesh(x, z),

      isFogOfWarEnabled: () => game.fogOfWarManager.isEnabled(),
      isPositionVisible: (x, z) => game.fogOfWarManager.isVisible(x, z),
    };

    return this._simContext;
  }

}
