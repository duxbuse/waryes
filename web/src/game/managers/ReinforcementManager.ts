/**
 * ReinforcementManager - Handles mid-battle unit reinforcements
 *
 * Manages:
 * - Entry point selection
 * - Spawn queues
 * - Spawn timers
 * - Rally points
 * - Unit spawning from entry points
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { EntryPoint, QueuedReinforcement } from '../../data/types';

export class ReinforcementManager {
  private readonly game: Game;
  private entryPoints: EntryPoint[] = [];
  private enemyEntryPoints: EntryPoint[] = [];
  private enemySpawnTimers: Map<string, number> = new Map();
  private spawnTimers: Map<string, number> = new Map(); // entry point ID -> time until next spawn
  private selectedEntryPoint: EntryPoint | null = null;

  // UI elements
  private reinforcementPanel: HTMLElement | null = null;
  private entryPointButtons: Map<string, HTMLButtonElement> = new Map();

  // Waiting for destination click
  private pendingUnitType: string | null = null;
  private pendingEntryPoint: EntryPoint | null = null;
  private waitingForDestination = false;

  // Path preview visualization
  private previewPath: THREE.Line | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initialize with map entry points
   */
  initialize(entryPoints: EntryPoint[]): void {
    console.log(`[REINFORCE] Initializing with ${entryPoints.length} total entry points`);
    this.entryPoints = entryPoints.filter(ep => ep.team === 'player');
    this.enemyEntryPoints = entryPoints.filter(ep => ep.team === 'enemy');
    console.log(`[REINFORCE] Filtered to ${this.entryPoints.length} player and ${this.enemyEntryPoints.length} enemy entry points`);

    // Initialize spawn timers
    for (const ep of this.entryPoints) {
      this.spawnTimers.set(ep.id, 0);
    }
    for (const ep of this.enemyEntryPoints) {
      this.enemySpawnTimers.set(ep.id, 0);
    }

    // Setup UI
    this.setupUI();
  }

  /**
   * Setup reinforcement UI panel
   */
  private setupUI(): void {
    // Create reinforcement panel if it doesn't exist
    let panel = document.getElementById('reinforcement-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'reinforcement-panel';
      panel.style.cssText = `
        position: absolute;
        top: 60px;
        left: 10px;
        width: 280px;
        max-height: 400px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 8px;
        padding: 10px;
        display: none;
        overflow-y: auto;
      `;
      document.getElementById('ui-overlay')?.appendChild(panel);
    }

    this.reinforcementPanel = panel;

    // Create entry point selector
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: bold; margin-bottom: 10px; color: #4a9eff;';
    header.textContent = 'CALL REINFORCEMENTS';
    panel.appendChild(header);

    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 10px;';
    subtitle.textContent = 'Select entry point, then choose units from deployment panel';
    panel.appendChild(subtitle);

    // Create button for each entry point
    this.entryPointButtons.clear();
    for (const ep of this.entryPoints) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        width: 100%;
        padding: 8px;
        margin: 4px 0;
        background: rgba(74, 158, 255, 0.2);
        border: 1px solid rgba(74, 158, 255, 0.5);
        color: #e0e0e0;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        text-align: left;
      `;

      const typeName = ep.type.charAt(0).toUpperCase() + ep.type.slice(1);
      const queueCount = ep.queue.length;
      btn.innerHTML = `
        <div style="display: flex; justify-content: space-between;">
          <span>${typeName} Entry</span>
          <span class="queue-count" style="color: ${queueCount > 0 ? '#ffd700' : '#666'};">Queue: ${queueCount}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div style="font-size: 10px; color: #888;">
            Spawn rate: ${ep.spawnRate}s
          </div>
          <div class="spawn-timer" style="font-size: 10px; font-weight: bold; color: #4a9eff;">
            Ready
          </div>
        </div>
      `;

      btn.addEventListener('click', () => {
        this.selectEntryPoint(ep);
      });

      this.entryPointButtons.set(ep.id, btn);
      panel.appendChild(btn);
    }

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancel';
    closeBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-top: 10px;
      background: rgba(255, 74, 74, 0.2);
      border: 1px solid rgba(255, 74, 74, 0.5);
      color: #e0e0e0;
      border-radius: 4px;
      cursor: pointer;
    `;
    closeBtn.addEventListener('click', () => {
      this.hide();
    });
    panel.appendChild(closeBtn);
  }

  /**
   * Show reinforcement panel for unit selection
   */
  show(): void {
    if (this.reinforcementPanel) {
      this.reinforcementPanel.style.display = 'block';
      this.updateUI();
    }
  }

  /**
   * Hide reinforcement panel
   */
  hide(): void {
    if (this.reinforcementPanel) {
      this.reinforcementPanel.style.display = 'none';
    }
    this.selectedEntryPoint = null;
  }

  /**
   * Select an entry point for spawning
   */
  private selectEntryPoint(ep: EntryPoint): void {
    this.selectedEntryPoint = ep;

    // Highlight selected button
    this.entryPointButtons.forEach((btn, id) => {
      if (id === ep.id) {
        btn.style.background = 'rgba(74, 158, 255, 0.5)';
        btn.style.borderColor = '#4a9eff';
      } else {
        btn.style.background = 'rgba(74, 158, 255, 0.2)';
        btn.style.borderColor = 'rgba(74, 158, 255, 0.5)';
      }
    });

    console.log(`Selected entry point: ${ep.type} at (${ep.x.toFixed(0)}, ${ep.z.toFixed(0)})`);

    // Show deployment panel for unit selection
    this.game.deploymentManager.show();
  }

  /**
   * Queue a unit for spawning at selected entry point
   * Enters waiting mode for destination click
   */
  queueUnit(unitType: string): boolean {
    if (!this.selectedEntryPoint) {
      console.warn('No entry point selected');
      return false;
    }

    // Save entry point reference before hide() clears it
    this.pendingEntryPoint = this.selectedEntryPoint;
    this.pendingUnitType = unitType;
    this.waitingForDestination = true;

    console.log(`[REINFORCE] Waiting for destination click for ${unitType}. Use movement modifiers (A/R/F) before clicking.`);

    // Hide panels to show the map
    this.hide();
    this.game.deploymentManager.hide();

    return true;
  }

  /**
   * Handle destination click for pending reinforcement
   */
  handleDestinationClick(worldPos: THREE.Vector3): void {
    if (!this.waitingForDestination || !this.pendingUnitType || !this.pendingEntryPoint) {
      return;
    }

    // Get movement modifiers from input manager
    const movementMods = this.game.inputManager.movementModifiers;
    let moveType: 'normal' | 'attack' | 'reverse' | 'fast' | null = 'normal';

    if (movementMods.attackMove) {
      moveType = 'attack';
    } else if (movementMods.reverse) {
      moveType = 'reverse';
    } else if (movementMods.fast) {
      moveType = 'fast';
    }

    // Send multiplayer command if in command sync mode
    if (this.game.multiplayerBattleSync?.isUsingCommandSync()) {
      this.game.multiplayerBattleSync.sendQueueReinforcementCommand(
        this.pendingEntryPoint.id,
        this.pendingUnitType,
        worldPos.x,
        worldPos.z,
        moveType
      );
      console.log(`[REINFORCE] Sent MP command to queue ${this.pendingUnitType} at ${this.pendingEntryPoint.type} entry with ${moveType} move to (${worldPos.x.toFixed(0)}, ${worldPos.z.toFixed(0)})`);
    } else {
      // Local mode: add to queue directly
      const reinforcement: QueuedReinforcement = {
        unitType: this.pendingUnitType,
        destination: { x: worldPos.x, z: worldPos.z },
        moveType,
      };

      this.pendingEntryPoint.queue.push(reinforcement);
      console.log(`[REINFORCE] Queued ${this.pendingUnitType} at ${this.pendingEntryPoint.type} entry with ${moveType} move to (${worldPos.x.toFixed(0)}, ${worldPos.z.toFixed(0)})`);
    }

    // Clear waiting state
    this.pendingUnitType = null;
    this.pendingEntryPoint = null;
    this.waitingForDestination = false;
    this.clearPreviewPath();

    this.updateUI();
  }

  /**
   * Cancel waiting for destination
   */
  cancelDestinationWait(): void {
    if (this.waitingForDestination) {
      console.log('[REINFORCE] Cancelled destination wait');
      this.pendingUnitType = null;
      this.pendingEntryPoint = null;
      this.waitingForDestination = false;
      this.clearPreviewPath();
    }
  }

  /**
   * Check if waiting for destination click
   */
  isWaitingForDestination(): boolean {
    return this.waitingForDestination;
  }

  /**
   * Find the closest player resupply point to a world position
   */
  findClosestResupplyPoint(worldPos: THREE.Vector3): EntryPoint | null {
    if (this.entryPoints.length === 0) {
      return null;
    }

    let closest: EntryPoint | null = null;
    let closestDist = Infinity;

    for (const ep of this.entryPoints) {
      const dx = ep.x - worldPos.x;
      const dz = ep.z - worldPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < closestDist) {
        closestDist = dist;
        closest = ep;
      }
    }

    return closest;
  }

  /**
   * Queue a unit at a specific resupply point with destination
   */
  queueUnitAtResupplyPoint(
    resupplyPointId: string,
    unitType: string,
    destination: { x: number; z: number } | null,
    moveType: 'normal' | 'attack' | 'reverse' | 'fast' | null
  ): boolean {
    const ep = this.entryPoints.find(e => e.id === resupplyPointId);
    if (!ep) {
      console.warn(`[REINFORCE] Resupply point ${resupplyPointId} not found`);
      return false;
    }

    // Send multiplayer command if in command sync mode
    if (this.game.multiplayerBattleSync?.isUsingCommandSync()) {
      this.game.multiplayerBattleSync.sendQueueReinforcementCommand(
        resupplyPointId,
        unitType,
        destination?.x,
        destination?.z,
        moveType
      );
      console.log(`[REINFORCE] Sent MP command to queue ${unitType} at ${resupplyPointId} with ${moveType} move to (${destination?.x.toFixed(0)}, ${destination?.z.toFixed(0)})`);
    } else {
      // Local mode: add to queue directly
      const reinforcement: QueuedReinforcement = {
        unitType,
        destination,
        moveType,
      };

      ep.queue.push(reinforcement);
      console.log(`[REINFORCE] Queued ${unitType} at ${resupplyPointId} with ${moveType} move to (${destination?.x.toFixed(0)}, ${destination?.z.toFixed(0)})`);
    }

    this.updateUI();
    return true;
  }

  /**
   * Update preview path from resupply point to mouse cursor
   * Legacy method for old workflow
   */
  updatePreviewPath(mouseWorldPos: THREE.Vector3): void {
    if (!this.waitingForDestination || !this.selectedEntryPoint) {
      return;
    }
    this.updatePreviewPathFromPoint(this.selectedEntryPoint, mouseWorldPos);
  }

  /**
   * Update preview path from a specific entry point to mouse cursor
   */
  updatePreviewPathFromPoint(entryPoint: EntryPoint, mouseWorldPos: THREE.Vector3): void {
    // Remove old preview path
    if (this.previewPath) {
      this.game.scene.remove(this.previewPath);
      this.previewPath.geometry.dispose();
      (this.previewPath.material as THREE.Material).dispose();
      this.previewPath = null;
    }

    // Get movement modifier color
    const movementMods = this.game.inputManager.movementModifiers;
    let color = 0x00ff00; // Default green for normal move
    if (movementMods.attackMove) {
      color = 0xff8800; // Orange for attack-move
    } else if (movementMods.reverse) {
      color = 0x00aaff; // Blue for reverse
    } else if (movementMods.fast) {
      color = 0x00ff88; // Cyan for fast move
    }

    // Create line from entry point to mouse position
    const startPos = new THREE.Vector3(
      entryPoint.x,
      this.game.getElevationAt(entryPoint.x, entryPoint.z) + 0.5,
      entryPoint.z
    );
    const endPos = new THREE.Vector3(
      mouseWorldPos.x,
      this.game.getElevationAt(mouseWorldPos.x, mouseWorldPos.z) + 0.5,
      mouseWorldPos.z
    );

    const points = [startPos, endPos];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
      depthWrite: false,
      depthTest: true,
    });

    this.previewPath = new THREE.Line(geometry, material);
    this.previewPath.renderOrder = 100; // Render on top
    this.game.scene.add(this.previewPath);
  }

  /**
   * Clear preview path visualization
   */
  clearPreviewPath(): void {
    if (this.previewPath) {
      this.game.scene.remove(this.previewPath);
      this.previewPath.geometry.dispose();
      (this.previewPath.material as THREE.Material).dispose();
      this.previewPath = null;
    }
  }

  /**
   * Update reinforcement UI
   */
  private updateUI(): void {
    // Update queue counts and spawn timers on buttons
    this.entryPointButtons.forEach((btn, id) => {
      const ep = this.entryPoints.find(e => e.id === id);
      if (ep) {
        // Update queue count
        const queueCount = ep.queue.length;
        const queueSpan = btn.querySelector('.queue-count');
        if (queueSpan) {
          queueSpan.textContent = `Queue: ${queueCount}`;
          (queueSpan as HTMLElement).style.color = queueCount > 0 ? '#ffd700' : '#666';
        }

        // Update spawn timer display
        const timerSpan = btn.querySelector('.spawn-timer');
        if (timerSpan) {
          const currentTimer = this.spawnTimers.get(ep.id) || 0;

          if (queueCount === 0) {
            // No queue, show "Ready"
            timerSpan.textContent = 'Ready';
            (timerSpan as HTMLElement).style.color = '#4a9eff';
          } else if (currentTimer <= 0) {
            // Timer expired, ready to spawn
            timerSpan.textContent = 'Spawning...';
            (timerSpan as HTMLElement).style.color = '#00ff00';
          } else {
            // Show countdown
            const seconds = Math.ceil(currentTimer);
            timerSpan.textContent = `${seconds}s`;
            // Color based on remaining time
            if (currentTimer < 2) {
              (timerSpan as HTMLElement).style.color = '#00ff88'; // Cyan - almost ready
            } else if (currentTimer < 5) {
              (timerSpan as HTMLElement).style.color = '#ffd700'; // Gold - soon
            } else {
              (timerSpan as HTMLElement).style.color = '#ff8800'; // Orange - waiting
            }
          }
        }
      }
    });
  }

  /**
   * Update spawn timers and process queues
   */
  update(dt: number): void {
    // Check total queue length across all entry points
    const totalQueued = this.entryPoints.reduce((sum, ep) => sum + ep.queue.length, 0);
    if (totalQueued > 0) {
      console.log(`[REINFORCE] Update called, dt=${dt.toFixed(3)}, total queued: ${totalQueued}`);
    }

    let timersChanged = false;

    for (const ep of this.entryPoints) {
      // Skip if queue is empty
      if (ep.queue.length === 0) continue;

      // Update timer
      const currentTimer = this.spawnTimers.get(ep.id) || 0;
      const newTimer = currentTimer - dt;

      console.log(`[REINFORCE] Entry ${ep.id}: queue=${ep.queue.length}, timer=${currentTimer.toFixed(2)} -> ${newTimer.toFixed(2)}`);

      if (newTimer <= 0) {
        // Spawn unit
        console.log(`[REINFORCE] Timer expired for ${ep.id}, spawning unit...`);
        this.spawnUnitFromQueue(ep);

        // Reset timer
        this.spawnTimers.set(ep.id, ep.spawnRate);
        timersChanged = true;
      } else {
        this.spawnTimers.set(ep.id, newTimer);
        timersChanged = true;
      }
    }

    // Process enemy entry point queues
    for (const ep of this.enemyEntryPoints) {
      if (ep.queue.length === 0) continue;

      const currentTimer = this.enemySpawnTimers.get(ep.id) || 0;
      const newTimer = currentTimer - dt;

      if (newTimer <= 0) {
        this.spawnEnemyUnitFromQueue(ep);
        this.enemySpawnTimers.set(ep.id, ep.spawnRate);
      } else {
        this.enemySpawnTimers.set(ep.id, newTimer);
      }
    }

    // Update UI if panel is visible and timers changed
    if (timersChanged && this.reinforcementPanel && this.reinforcementPanel.style.display !== 'none') {
      this.updateUI();
    }
  }

  /**
   * Spawn a unit from entry point queue
   */
  private spawnUnitFromQueue(ep: EntryPoint): void {
    const reinforcement = ep.queue.shift();
    if (!reinforcement) return;

    // Spawn unit at entry point (use terrain elevation)
    const spawnPos = new THREE.Vector3(ep.x, this.game.getElevationAt(ep.x, ep.z), ep.z);

    const unit = this.game.unitManager.spawnUnit({
      position: spawnPos,
      team: 'player',
      unitType: reinforcement.unitType,
      ...(reinforcement.ownerId && { ownerId: reinforcement.ownerId }),
    });

    // Create spawn effect
    this.createSpawnEffect(spawnPos);

    console.log(`Spawned ${reinforcement.unitType} (owner: ${reinforcement.ownerId ?? 'player'}) from ${ep.type} entry at (${ep.x.toFixed(0)}, ${ep.z.toFixed(0)}) - vulnerable immediately`);

    // Note: deployedCount is managed by DeploymentManager when units are queued

    // Apply movement command if destination was set
    if (reinforcement.destination) {
      const destPos = new THREE.Vector3(
        reinforcement.destination.x,
        this.game.getElevationAt(reinforcement.destination.x, reinforcement.destination.z),
        reinforcement.destination.z
      );

      switch (reinforcement.moveType) {
        case 'attack':
          unit.setAttackMoveCommand(destPos);
          console.log(`Unit auto-attack-moving to (${reinforcement.destination.x.toFixed(0)}, ${reinforcement.destination.z.toFixed(0)})`);
          break;
        case 'reverse':
          unit.setReverseCommand(destPos);
          console.log(`Unit auto-reversing to (${reinforcement.destination.x.toFixed(0)}, ${reinforcement.destination.z.toFixed(0)})`);
          break;
        case 'fast':
          unit.setFastMoveCommand(destPos);
          console.log(`Unit auto-fast-moving to (${reinforcement.destination.x.toFixed(0)}, ${reinforcement.destination.z.toFixed(0)})`);
          break;
        default:
          unit.setMoveCommand(destPos);
          console.log(`Unit auto-moving to (${reinforcement.destination.x.toFixed(0)}, ${reinforcement.destination.z.toFixed(0)})`);
          break;
      }
    }
    // Fallback to old rally point system if no destination was set
    else if (ep.rallyPoint) {
      const rallyPos = new THREE.Vector3(
        ep.rallyPoint.x,
        this.game.getElevationAt(ep.rallyPoint.x, ep.rallyPoint.z),
        ep.rallyPoint.z
      );
      unit.setMoveCommand(rallyPos);
      console.log(`Unit auto-moving to rally point at (${ep.rallyPoint.x.toFixed(0)}, ${ep.rallyPoint.z.toFixed(0)})`);
    }

    this.updateUI();
  }

  /**
   * Create a spawn effect at a position
   * Shows a bright blue flash when units spawn from entry points
   */
  private createSpawnEffect(position: THREE.Vector3): void {
    // Create spawn flash sprite
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Create radial gradient for spawn flash (blue/cyan colors)
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');      // Bright white center
    gradient.addColorStop(0.2, 'rgba(100, 200, 255, 1)');    // Bright cyan
    gradient.addColorStop(0.5, 'rgba(74, 158, 255, 0.8)');   // Blue
    gradient.addColorStop(0.8, 'rgba(50, 100, 200, 0.4)');   // Dark blue
    gradient.addColorStop(1, 'rgba(30, 80, 150, 0)');        // Fade to transparent

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.position.y = this.game.getElevationAt(position.x, position.z) + 1; // Slightly above ground
    sprite.scale.set(3, 3, 1); // Larger spawn effect
    sprite.renderOrder = 1500;
    this.game.scene.add(sprite);

    // Animate and remove the effect
    const duration = 0.4; // 400ms
    let timeAlive = 0;

    const animateEffect = (dt: number) => {
      timeAlive += dt;
      const progress = timeAlive / duration;

      if (progress >= 1) {
        // Remove effect
        this.game.scene.remove(sprite);
        sprite.geometry.dispose();
        material.dispose();
        texture.dispose();
      } else {
        // Fade out and scale up
        material.opacity = 1 - progress;
        const scale = 3 + progress * 2; // Expand from 3 to 5
        sprite.scale.set(scale, scale, 1);

        // Continue animation next frame
        requestAnimationFrame(() => animateEffect(1 / 60));
      }
    };

    // Start animation
    requestAnimationFrame(() => animateEffect(1 / 60));
  }

  /**
   * Spawn an enemy unit from an enemy entry point queue
   */
  private spawnEnemyUnitFromQueue(ep: EntryPoint): void {
    const reinforcement = ep.queue.shift();
    if (!reinforcement) return;

    const spawnPos = new THREE.Vector3(ep.x, this.game.getElevationAt(ep.x, ep.z), ep.z);

    const unit = this.game.unitManager.spawnUnit({
      position: spawnPos,
      team: 'enemy',
      unitType: reinforcement.unitType,
    });

    this.createSpawnEffect(spawnPos);

    console.log(`[REINFORCE] Enemy spawned ${reinforcement.unitType} from entry at (${ep.x.toFixed(0)}, ${ep.z.toFixed(0)})`);

    // Apply movement command if destination was set
    if (reinforcement.destination) {
      const destPos = new THREE.Vector3(
        reinforcement.destination.x,
        this.game.getElevationAt(reinforcement.destination.x, reinforcement.destination.z),
        reinforcement.destination.z
      );
      unit.setMoveCommand(destPos);
    }
  }

  /**
   * Queue an enemy unit for spawning at the best enemy entry point
   */
  queueEnemyUnit(unitType: string, destination?: { x: number; z: number }): boolean {
    const bestEntry = this.getBestEnemyEntryPoint();
    if (!bestEntry) {
      console.warn('[REINFORCE] No enemy entry points available');
      return false;
    }

    const reinforcement: QueuedReinforcement = {
      unitType,
      destination: destination || null,
      moveType: 'normal',
    };
    bestEntry.queue.push(reinforcement);
    console.log(`[REINFORCE] Enemy queued ${unitType} at entry (${bestEntry.x.toFixed(0)}, ${bestEntry.z.toFixed(0)}), queue: ${bestEntry.queue.length}`);
    return true;
  }

  /**
   * Queue an ally AI unit for spawning at the best player entry point
   */
  queueAllyUnit(unitType: string, ownerId: string, destination?: { x: number; z: number }): boolean {
    const bestEntry = this.getBestEntryPoint();
    if (!bestEntry) {
      console.warn('[REINFORCE] No player entry points available for ally unit');
      return false;
    }

    const reinforcement: QueuedReinforcement = {
      unitType,
      destination: destination || null,
      moveType: 'normal',
      ownerId,
    };
    bestEntry.queue.push(reinforcement);
    console.log(`[REINFORCE] Ally (${ownerId}) queued ${unitType} at entry (${bestEntry.x.toFixed(0)}, ${bestEntry.z.toFixed(0)}), queue: ${bestEntry.queue.length}`);
    return true;
  }

  /**
   * Get the best enemy entry point for spawning (shortest queue)
   */
  getBestEnemyEntryPoint(): EntryPoint | null {
    if (this.enemyEntryPoints.length === 0) return null;

    const sorted = [...this.enemyEntryPoints].sort((a, b) => a.queue.length - b.queue.length);
    return sorted[0] || null;
  }

  /**
   * Get selected entry point
   */
  getSelectedEntryPoint(): EntryPoint | null {
    return this.selectedEntryPoint;
  }

  /**
   * Get all entry points
   */
  getEntryPoints(): EntryPoint[] {
    return this.entryPoints;
  }

  /**
   * Get the best entry point for spawning (auto-selection)
   * Priority: highway > secondary > dirt (then by shortest queue)
   */
  getBestEntryPoint(): EntryPoint | null {
    if (this.entryPoints.length === 0) return null;

    // Priority order for entry point types
    const typePriority: Record<string, number> = {
      'highway': 1,
      'secondary': 2,
      'dirt': 3,
      'air': 4
    };

    // Sort by type priority, then by queue length (shortest first)
    const sorted = [...this.entryPoints].sort((a, b) => {
      const priorityA = typePriority[a.type] ?? 99;
      const priorityB = typePriority[b.type] ?? 99;

      // First sort by type priority
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Then sort by queue length (prefer less congested)
      return a.queue.length - b.queue.length;
    });

    return sorted[0] || null;
  }

  /**
   * Queue a unit at the best available entry point (auto-selection)
   */
  queueUnitAuto(unitType: string): boolean {
    console.log(`[REINFORCE] queueUnitAuto called for ${unitType}, entryPoints count: ${this.entryPoints.length}`);
    const bestEntry = this.getBestEntryPoint();
    if (!bestEntry) {
      console.warn('[REINFORCE] No entry points available');
      return false;
    }

    // Send multiplayer command if in command sync mode
    if (this.game.multiplayerBattleSync?.isUsingCommandSync()) {
      // Use rally point destination if set
      const rallyX = bestEntry.rallyPoint?.x;
      const rallyZ = bestEntry.rallyPoint?.z;
      this.game.multiplayerBattleSync.sendQueueReinforcementCommand(
        bestEntry.id,
        unitType,
        rallyX,
        rallyZ,
        null
      );
      console.log(`[REINFORCE] Sent MP command to queue ${unitType} at ${bestEntry.type} entry (auto-selected)`);
    } else {
      // Local mode: add to queue directly
      const reinforcement: QueuedReinforcement = {
        unitType,
        destination: null,
        moveType: null,
      };
      bestEntry.queue.push(reinforcement);
      console.log(`[REINFORCE] Queued ${unitType} at ${bestEntry.type} entry (auto-selected), queue length now: ${bestEntry.queue.length}`);
    }

    this.updateUI();
    return true;
  }

  /**
   * Set rally point for entry point (Shift+Right-click)
   */
  setRallyPoint(entryPointId: string, x: number, z: number): void {
    const ep = this.entryPoints.find(e => e.id === entryPointId);
    if (ep) {
      ep.rallyPoint = { x, z };
      console.log(`Set rally point for ${ep.type} entry to (${x.toFixed(0)}, ${z.toFixed(0)})`);
    }
  }

  /**
   * Process received reinforcement command (for multiplayer sync)
   * Called by MultiplayerBattleSync when receiving QueueReinforcement commands
   */
  processReinforcementCommand(
    entryPointId: string,
    unitType: string,
    targetX?: number,
    targetZ?: number,
    moveType?: string
  ): void {
    const ep = this.entryPoints.find(e => e.id === entryPointId);
    if (!ep) {
      console.warn(`[REINFORCE] Entry point ${entryPointId} not found for command`);
      return;
    }

    const destination = targetX !== undefined && targetZ !== undefined
      ? { x: targetX, z: targetZ }
      : null;

    const typedMoveType = (moveType === 'attack' || moveType === 'reverse' || moveType === 'fast' || moveType === 'normal')
      ? moveType
      : null;

    const reinforcement: QueuedReinforcement = {
      unitType,
      destination,
      moveType: typedMoveType,
    };

    ep.queue.push(reinforcement);
    console.log(`[REINFORCE] Processed MP command: queued ${unitType} at ${entryPointId} with ${moveType} move`);

    this.updateUI();
  }
}
