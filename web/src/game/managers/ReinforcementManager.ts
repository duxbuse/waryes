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
  private spawnTimers: Map<string, number> = new Map(); // entry point ID -> time until next spawn
  private selectedEntryPoint: EntryPoint | null = null;

  // UI elements
  private reinforcementPanel: HTMLElement | null = null;
  private entryPointButtons: Map<string, HTMLButtonElement> = new Map();

  // Waiting for destination click
  private pendingUnitType: string | null = null;
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
    console.log(`[REINFORCE] Filtered to ${this.entryPoints.length} player entry points:`,
      this.entryPoints.map(ep => `${ep.id} (${ep.type}) at (${ep.x.toFixed(0)}, ${ep.z.toFixed(0)})`));

    // Initialize spawn timers
    for (const ep of this.entryPoints) {
      this.spawnTimers.set(ep.id, 0);
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
          <span style="color: ${queueCount > 0 ? '#ffd700' : '#666'};">Queue: ${queueCount}</span>
        </div>
        <div style="font-size: 10px; color: #888; margin-top: 2px;">
          Spawn rate: ${ep.spawnRate}s
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

    // Enter waiting mode for destination click
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
    if (!this.waitingForDestination || !this.pendingUnitType || !this.selectedEntryPoint) {
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

    // Add to queue with command
    const reinforcement: QueuedReinforcement = {
      unitType: this.pendingUnitType,
      destination: { x: worldPos.x, z: worldPos.z },
      moveType,
    };

    this.selectedEntryPoint.queue.push(reinforcement);

    console.log(`[REINFORCE] Queued ${this.pendingUnitType} at ${this.selectedEntryPoint.type} entry with ${moveType} move to (${worldPos.x.toFixed(0)}, ${worldPos.z.toFixed(0)})`);

    // Clear waiting state
    this.pendingUnitType = null;
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

    const reinforcement: QueuedReinforcement = {
      unitType,
      destination,
      moveType,
    };

    ep.queue.push(reinforcement);
    console.log(`[REINFORCE] Queued ${unitType} at ${resupplyPointId} with ${moveType} move to (${destination?.x.toFixed(0)}, ${destination?.z.toFixed(0)})`);

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
    // Update queue counts on buttons
    this.entryPointButtons.forEach((btn, id) => {
      const ep = this.entryPoints.find(e => e.id === id);
      if (ep) {
        const queueCount = ep.queue.length;
        const spans = btn.querySelectorAll('span');
        if (spans.length >= 2) {
          spans[1]!.textContent = `Queue: ${queueCount}`;
          spans[1]!.style.color = queueCount > 0 ? '#ffd700' : '#666';
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
      } else {
        this.spawnTimers.set(ep.id, newTimer);
      }
    }
  }

  /**
   * Spawn a unit from entry point queue
   */
  private spawnUnitFromQueue(ep: EntryPoint): void {
    const reinforcement = ep.queue.shift();
    if (!reinforcement) return;

    // Spawn unit at entry point
    const spawnPos = new THREE.Vector3(ep.x, 0, ep.z);

    const unit = this.game.unitManager.spawnUnit({
      position: spawnPos,
      team: 'player',
      unitType: reinforcement.unitType,
    });

    console.log(`Spawned ${reinforcement.unitType} from ${ep.type} entry at (${ep.x.toFixed(0)}, ${ep.z.toFixed(0)}) - vulnerable immediately`);

    // Mark unit as no longer deployed in deployment manager so it can be called again
    const deck = this.game.deploymentManager.getDeck();
    if (deck) {
      const du = this.game.deploymentManager['deployableUnits']?.find((u: {unitData: {id: string}}) => u.unitData.id === reinforcement.unitType);
      if (du) {
        du.deployed = false;
      }
    }

    // Apply movement command if destination was set
    if (reinforcement.destination) {
      const destPos = new THREE.Vector3(reinforcement.destination.x, 0, reinforcement.destination.z);

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
      const rallyPos = new THREE.Vector3(ep.rallyPoint.x, 0, ep.rallyPoint.z);
      unit.setMoveCommand(rallyPos);
      console.log(`Unit auto-moving to rally point at (${ep.rallyPoint.x.toFixed(0)}, ${ep.rallyPoint.z.toFixed(0)})`);
    }

    this.updateUI();
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

    // Add to queue with no destination (will use rally point if set)
    const reinforcement: QueuedReinforcement = {
      unitType,
      destination: null,
      moveType: null,
    };
    bestEntry.queue.push(reinforcement);
    console.log(`[REINFORCE] Queued ${unitType} at ${bestEntry.type} entry (auto-selected), queue length now: ${bestEntry.queue.length}`);

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
}
