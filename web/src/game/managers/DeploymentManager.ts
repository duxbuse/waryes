/**
 * DeploymentManager - Manages unit deployment during setup phase
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { DeckData, DeckUnit, UnitData, DeploymentZone, UnitCategory } from '../../data/types';
import { getUnitById } from '../../data/factions';
import { GAME_CONSTANTS } from '../../data/types';

export interface DeployableUnit {
  deckUnit: DeckUnit;
  unitData: UnitData;
  deployed: boolean;
  deployedUnitId: string | undefined;
}

export class DeploymentManager {
  private readonly game: Game;
  private deck: DeckData | null = null;
  private deployableUnits: DeployableUnit[] = [];
  private selectedUnitIndex: number = -1;
  private deploymentZone: DeploymentZone | null = null;
  private currentCategory: UnitCategory = 'INF';
  private credits: number = GAME_CONSTANTS.STARTING_CREDITS;

  // UI Elements
  private deploymentPanel: HTMLElement | null = null;
  private unitCardsContainer: HTMLElement | null = null;
  private categoryTabs: HTMLElement | null = null;
  private creditsDisplay: HTMLElement | null = null;

  // Ghost preview mesh
  private ghostMesh: THREE.Mesh | null = null;
  private isPlacingUnit = false;

  constructor(game: Game) {
    this.game = game;
  }

  initialize(deck: DeckData, deploymentZone: DeploymentZone): void {
    this.deck = deck;
    this.deploymentZone = deploymentZone;
    this.credits = GAME_CONSTANTS.STARTING_CREDITS;

    // Create deployable units from deck
    this.deployableUnits = deck.units.map(deckUnit => {
      const unitData = getUnitById(deckUnit.unitId);
      return {
        deckUnit,
        unitData: unitData!,
        deployed: false,
        deployedUnitId: undefined,
      };
    }).filter(du => du.unitData !== undefined);

    this.setupUI();
    this.renderUI();
  }

  private setupUI(): void {
    // Get or create deployment panel
    this.deploymentPanel = document.getElementById('deployment-panel');
    if (!this.deploymentPanel) {
      this.deploymentPanel = document.createElement('div');
      this.deploymentPanel.id = 'deployment-panel';
      document.getElementById('ui-overlay')?.appendChild(this.deploymentPanel);
    }
    // Make sure panel is visible
    this.deploymentPanel.classList.remove('hidden');
    this.deploymentPanel.classList.add('visible');

    this.deploymentPanel.innerHTML = `
      <div class="deployment-header">
        <span class="credits-display">Credits: <span id="credits-value">${this.credits}</span></span>
      </div>
      <div class="category-tabs" id="deploy-category-tabs"></div>
      <div class="unit-cards" id="deploy-unit-cards"></div>
    `;

    this.categoryTabs = document.getElementById('deploy-category-tabs');
    this.unitCardsContainer = document.getElementById('deploy-unit-cards');
    this.creditsDisplay = document.getElementById('credits-value');

    // Add deployment panel styles if not already present
    if (!document.getElementById('deployment-styles')) {
      const style = document.createElement('style');
      style.id = 'deployment-styles';
      style.textContent = `
        #deployment-panel {
          position: absolute;
          top: 60px;
          right: 10px;
          width: 280px;
          max-height: calc(100% - 120px);
          background: rgba(0, 0, 0, 0.85);
          border-radius: 8px;
          padding: 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        #deployment-panel.hidden {
          display: none;
        }

        .deployment-header {
          padding: 8px;
          border-bottom: 1px solid #333;
          margin-bottom: 10px;
        }

        .credits-display {
          font-size: 16px;
          color: #ffd700;
        }

        #deploy-category-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 10px;
        }

        .deploy-cat-tab {
          padding: 6px 10px;
          font-size: 11px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid #333;
          color: #888;
          cursor: pointer;
          border-radius: 4px;
        }

        .deploy-cat-tab:hover {
          background: rgba(74, 158, 255, 0.1);
          color: #e0e0e0;
        }

        .deploy-cat-tab.active {
          background: rgba(74, 158, 255, 0.3);
          border-color: #4a9eff;
          color: #4a9eff;
        }

        .deploy-cat-tab .count {
          margin-left: 4px;
          opacity: 0.7;
        }

        #deploy-unit-cards {
          flex: 1;
          overflow-y: auto;
        }

        .deploy-unit-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          margin: 5px 0;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid #333;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .deploy-unit-card:hover {
          background: rgba(74, 158, 255, 0.1);
          border-color: #4a9eff;
        }

        .deploy-unit-card.selected {
          background: rgba(74, 158, 255, 0.3);
          border-color: #4a9eff;
        }

        .deploy-unit-card.deployed {
          opacity: 0.5;
        }

        .deploy-unit-card.too-expensive {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .deploy-unit-icon {
          width: 40px;
          height: 40px;
          background: #333;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .deploy-unit-info {
          flex: 1;
        }

        .deploy-unit-name {
          font-size: 13px;
          font-weight: bold;
          color: #e0e0e0;
        }

        .deploy-unit-cost {
          font-size: 12px;
          color: #ffd700;
        }

        .deploy-unit-status {
          font-size: 10px;
          color: #4aff4a;
        }
      `;
      document.head.appendChild(style);
    }

    // Bind events
    this.categoryTabs?.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest('.deploy-cat-tab');
      if (tab) {
        this.currentCategory = tab.getAttribute('data-category') as UnitCategory;
        this.renderUI();
      }
    });

    this.unitCardsContainer?.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.deploy-unit-card') as HTMLElement;
      if (card && !card.classList.contains('deployed') && !card.classList.contains('too-expensive')) {
        const index = parseInt(card.getAttribute('data-index')!);
        this.selectUnit(index);
      }
    });

    // Setup mouse events for placement
    const canvas = this.game.renderer.domElement;
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('click', this.onClick.bind(this));
    canvas.addEventListener('contextmenu', this.onRightClick.bind(this));
  }

  private renderUI(): void {
    if (!this.categoryTabs || !this.unitCardsContainer || !this.creditsDisplay) return;

    // Update credits
    this.creditsDisplay.textContent = this.credits.toString();

    // Count units per category
    const categoryCounts = new Map<UnitCategory, { total: number; deployed: number }>();
    for (const du of this.deployableUnits) {
      const cat = du.unitData.category;
      const existing = categoryCounts.get(cat) ?? { total: 0, deployed: 0 };
      existing.total++;
      if (du.deployed) existing.deployed++;
      categoryCounts.set(cat, existing);
    }

    // Render category tabs
    const categories: UnitCategory[] = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
    this.categoryTabs.innerHTML = categories
      .filter(cat => categoryCounts.has(cat))
      .map(cat => {
        const counts = categoryCounts.get(cat)!;
        const remaining = counts.total - counts.deployed;
        return `
          <button class="deploy-cat-tab ${cat === this.currentCategory ? 'active' : ''}"
                  data-category="${cat}">
            ${cat}<span class="count">(${remaining})</span>
          </button>
        `;
      }).join('');

    // Render unit cards for current category
    const categoryUnits = this.deployableUnits
      .map((du, index) => ({ ...du, index }))
      .filter(du => du.unitData.category === this.currentCategory);

    this.unitCardsContainer.innerHTML = categoryUnits.map(du => {
      const isDeployed = du.deployed;
      const tooExpensive = du.unitData.cost > this.credits;
      const isSelected = du.index === this.selectedUnitIndex;

      const icon = this.getUnitIcon(du.unitData.category);

      return `
        <div class="deploy-unit-card ${isDeployed ? 'deployed' : ''} ${tooExpensive ? 'too-expensive' : ''} ${isSelected ? 'selected' : ''}"
             data-index="${du.index}">
          <div class="deploy-unit-icon">${icon}</div>
          <div class="deploy-unit-info">
            <div class="deploy-unit-name">${du.unitData.name}</div>
            <div class="deploy-unit-cost">${du.unitData.cost} credits</div>
            ${isDeployed ? '<div class="deploy-unit-status">Deployed</div>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  private getUnitIcon(category: UnitCategory): string {
    const icons: Record<UnitCategory, string> = {
      LOG: '📦',
      INF: '🚶',
      TNK: '🛡️',
      REC: '👁️',
      AA: '🎯',
      ART: '💥',
      HEL: '🚁',
      AIR: '✈️',
    };
    return icons[category] ?? '❓';
  }

  private selectUnit(index: number): void {
    this.selectedUnitIndex = index;
    this.isPlacingUnit = true;
    this.renderUI();

    // Create ghost preview
    this.createGhostMesh();
  }

  private createGhostMesh(): void {
    // Remove existing ghost
    if (this.ghostMesh) {
      this.game.scene.remove(this.ghostMesh);
      this.ghostMesh.geometry.dispose();
      (this.ghostMesh.material as THREE.Material).dispose();
    }

    const du = this.deployableUnits[this.selectedUnitIndex];
    if (!du) return;

    // Create simple ghost mesh
    let geometry: THREE.BufferGeometry;
    switch (du.unitData.category) {
      case 'TNK':
        geometry = new THREE.BoxGeometry(2, 1, 3);
        break;
      case 'INF':
        geometry = new THREE.CapsuleGeometry(0.3, 1, 8, 16);
        break;
      default:
        geometry = new THREE.BoxGeometry(1.5, 1, 2);
    }

    const material = new THREE.MeshBasicMaterial({
      color: 0x4a9eff,
      transparent: true,
      opacity: 0.5,
    });

    this.ghostMesh = new THREE.Mesh(geometry, material);
    this.ghostMesh.position.y = 0.5;
    this.game.scene.add(this.ghostMesh);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isPlacingUnit || !this.ghostMesh) return;

    const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
    if (worldPos) {
      this.ghostMesh.position.set(worldPos.x, 0.5, worldPos.z);

      // Check if in deployment zone
      const inZone = this.isInDeploymentZone(worldPos.x, worldPos.z);
      (this.ghostMesh.material as THREE.MeshBasicMaterial).color.setHex(
        inZone ? 0x4aff4a : 0xff4a4a
      );
    }
  }

  private onClick(event: MouseEvent): void {
    // Only handle left clicks
    if (event.button !== 0) return;

    if (!this.isPlacingUnit) return;

    const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
    if (!worldPos) return;

    // Check if in deployment zone
    if (!this.isInDeploymentZone(worldPos.x, worldPos.z)) {
      return;
    }

    // Deploy the unit
    this.deployUnit(this.selectedUnitIndex, worldPos);
  }

  private onRightClick(event: MouseEvent): void {
    event.preventDefault();

    // Cancel placement
    if (this.isPlacingUnit) {
      this.cancelPlacement();
    }
  }

  private isInDeploymentZone(x: number, z: number): boolean {
    if (!this.deploymentZone) return false;

    return x >= this.deploymentZone.minX &&
           x <= this.deploymentZone.maxX &&
           z >= this.deploymentZone.minZ &&
           z <= this.deploymentZone.maxZ;
  }

  private deployUnit(index: number, position: THREE.Vector3): void {
    const du = this.deployableUnits[index];
    if (!du || du.deployed) return;

    // Check credits
    if (du.unitData.cost > this.credits) return;

    // Spawn the unit
    const unit = this.game.unitManager.spawnUnit({
      position,
      team: 'player',
      unitType: du.unitData.id,
      name: du.unitData.name,
    });

    // Update unit stats from data
    // (The unit is already created with default stats, we'd need to update these)

    // Mark as deployed
    du.deployed = true;
    du.deployedUnitId = unit.id;

    // Deduct credits
    this.credits -= du.unitData.cost;

    // Cancel placement mode
    this.cancelPlacement();

    // Re-render UI
    this.renderUI();
  }

  private cancelPlacement(): void {
    this.isPlacingUnit = false;
    this.selectedUnitIndex = -1;

    // Remove ghost mesh
    if (this.ghostMesh) {
      this.game.scene.remove(this.ghostMesh);
      this.ghostMesh.geometry.dispose();
      (this.ghostMesh.material as THREE.Material).dispose();
      this.ghostMesh = null;
    }

    this.renderUI();
  }

  // Called when a deployed unit is sold
  onUnitSold(unitId: string, refund: number): void {
    const du = this.deployableUnits.find(d => d.deployedUnitId === unitId);
    if (du) {
      du.deployed = false;
      du.deployedUnitId = undefined;
      this.credits += refund;
      this.renderUI();
    }
  }

  getCredits(): number {
    return this.credits;
  }

  getDeck(): DeckData | null {
    return this.deck;
  }

  addCredits(amount: number): void {
    this.credits += amount;
    if (this.creditsDisplay) {
      this.creditsDisplay.textContent = this.credits.toString();
    }
  }

  hide(): void {
    this.cancelPlacement();
    if (this.deploymentPanel) {
      this.deploymentPanel.classList.add('hidden');
    }
  }

  show(): void {
    if (this.deploymentPanel) {
      this.deploymentPanel.classList.remove('hidden');
    }
  }

  dispose(): void {
    this.cancelPlacement();
  }
}
