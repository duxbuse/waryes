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
import type { EntryPoint } from '../../data/types';

export class ReinforcementManager {
  private readonly game: Game;
  private entryPoints: EntryPoint[] = [];
  private spawnTimers: Map<string, number> = new Map(); // entry point ID -> time until next spawn
  private selectedEntryPoint: EntryPoint | null = null;

  // UI elements
  private reinforcementPanel: HTMLElement | null = null;
  private entryPointButtons: Map<string, HTMLButtonElement> = new Map();

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initialize with map entry points
   */
  initialize(entryPoints: EntryPoint[]): void {
    this.entryPoints = entryPoints.filter(ep => ep.team === 'player');

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
   */
  queueUnit(unitType: string): boolean {
    if (!this.selectedEntryPoint) {
      console.warn('No entry point selected');
      return false;
    }

    // Add to queue
    this.selectedEntryPoint.queue.push(unitType);
    console.log(`Queued ${unitType} at ${this.selectedEntryPoint.type} entry`);

    this.updateUI();
    return true;
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
    for (const ep of this.entryPoints) {
      // Skip if queue is empty
      if (ep.queue.length === 0) continue;

      // Update timer
      const currentTimer = this.spawnTimers.get(ep.id) || 0;
      const newTimer = currentTimer - dt;

      if (newTimer <= 0) {
        // Spawn unit
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
    const unitType = ep.queue.shift();
    if (!unitType) return;

    // Spawn unit at entry point
    const spawnPos = new THREE.Vector3(ep.x, 0, ep.z);

    const unit = this.game.unitManager.spawnUnit({
      position: spawnPos,
      team: 'player',
      unitType,
    });

    console.log(`Spawned ${unitType} from ${ep.type} entry at (${ep.x.toFixed(0)}, ${ep.z.toFixed(0)})`);

    // Mark unit as no longer deployed in deployment manager so it can be called again
    const deck = this.game.deploymentManager.getDeck();
    if (deck) {
      const du = this.game.deploymentManager['deployableUnits']?.find((u: {unitData: {id: string}}) => u.unitData.id === unitType);
      if (du) {
        du.deployed = false;
      }
    }

    // If rally point is set, move unit there automatically
    if (ep.rallyPoint) {
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
