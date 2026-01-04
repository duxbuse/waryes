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
  public readonly aiManager: AIManager;
  public readonly screenManager: ScreenManager;
  public mapRenderer: MapRenderer | null = null;

  // Game state
  private _phase: GamePhase = GamePhase.Loading;
  private _isRunning = false;
  private _lastTime = 0;
  private _isPaused = false;

  // Pause menu elements
  private pauseMenu: HTMLElement | null = null;

  // Last skirmish config (for rematch)
  private lastDeck: DeckData | null = null;
  private lastMapSize: MapSize = 'medium';
  private lastMapSeed: number = 0;

  // Fixed timestep for game logic
  private readonly FIXED_TIMESTEP = 1 / 60; // 60 Hz
  private _accumulator = 0;

  // Current map
  public currentMap: GameMap | null = null;

  // Ground plane for raycasting
  public readonly groundPlane: THREE.Mesh;

  // Victory callback
  private onVictoryCallback: ((winner: 'player' | 'enemy') => void) | null = null;

  // Game stats tracking
  private gameStartTime = 0;
  private unitsDeployed = 0;
  private unitsLost = 0;
  private unitsDestroyed = 0;
  private creditsEarned = 0;
  private creditsSpent = 0;

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
    this.aiManager = new AIManager(this);
    this.screenManager = new ScreenManager();
    this.mapRenderer = new MapRenderer(this.scene);

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
    this.combatManager.initialize();

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
      this.aiManager.update(dt);
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
    // Save configuration for rematch
    this.lastDeck = deck;
    this.lastMapSize = mapSize;
    this.lastMapSeed = mapSeed;

    // Reset stats for new game
    this.resetStats();

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

    // Initialize AI manager
    this.aiManager.initialize('medium');

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

    // Record battle start time
    this.gameStartTime = performance.now();

    // Start battle
    this.setPhase(GamePhase.Battle);
    this.unitManager.unfreezeAll();
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
          topKillersList.innerHTML = killStats.topKillers.map((unit, index) => `
            <div class="killer-row">
              <span class="killer-rank">${index + 1}.</span>
              <span class="killer-name">${unit.name}</span>
              <span class="killer-kills">${unit.kills} kills</span>
            </div>
          `).join('');
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
    this.aiManager.clear();

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
        // TODO: Open settings from pause menu
        console.log('Settings from pause menu not yet implemented');
      });
    }

    if (surrenderBtn) {
      surrenderBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to surrender?')) {
          this.togglePause(); // Unpause first
          this.onVictory('enemy'); // Trigger defeat
        }
      });
    }

    if (quitBtn) {
      quitBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to quit to main menu?')) {
          this._isPaused = false; // Reset pause state
          this.returnToMainMenu();
        }
      });
    }

    // ESC key to toggle pause
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this._phase === GamePhase.Setup || this._phase === GamePhase.Battle) {
          this.togglePause();
        }
      }
    });
  }

  /**
   * Setup victory screen event handlers
   */
  private setupVictoryScreen(): void {
    const playAgainBtn = document.getElementById('victory-play-again-btn');
    const mainMenuBtn = document.getElementById('victory-main-menu-btn');

    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', () => {
        // Hide victory screen
        const victoryScreen = document.getElementById('victory-screen');
        if (victoryScreen) {
          victoryScreen.classList.remove('visible');
        }

        // Restart with same settings
        if (this.lastDeck) {
          this.startSkirmish(this.lastDeck, this.lastMapSize, this.lastMapSeed);
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
      startBtn.addEventListener('click', () => {
        this.startBattle();
      });
    }
  }
}
