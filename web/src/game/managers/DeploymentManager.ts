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
  totalQuantity: number;      // Total units available from this card
  deployedCount: number;       // How many have been deployed
  deployedUnitIds: string[];  // IDs of all deployed units from this card
}

// Grouped unit type for stacked display
interface StackedUnitType {
  unitData: UnitData;
  indices: number[];  // Indices into deployableUnits array
  available: number;  // Count of undeployed units
  deployed: number;   // Count of deployed units
}

export class DeploymentManager {
  private readonly game: Game;
  private deck: DeckData | null = null;
  private deployableUnits: DeployableUnit[] = [];
  private selectedUnitIndex: number = -1;
  private selectedUnitTypeId: string | null = null;  // For multi-placement with shift
  private deploymentZones: DeploymentZone[] = [];
  private currentCategory: UnitCategory = 'INF';
  private battleBarCategory: UnitCategory = 'INF';  // Category for the top unit bar
  private credits: number = GAME_CONSTANTS.STARTING_CREDITS;

  // UI Elements
  private deploymentPanel: HTMLElement | null = null;
  private unitCardsContainer: HTMLElement | null = null;
  private categoryTabs: HTMLElement | null = null;
  private creditsDisplay: HTMLElement | null = null;

  // Ghost preview mesh
  private ghostMesh: THREE.Mesh | null = null;
  private isPlacingUnit = false;

  // Battle phase reinforcement waiting state
  private waitingForReinforcementDestination = false;
  private pendingReinforcementUnitIndex = -1;

  constructor(game: Game) {
    this.game = game;
  }

  initialize(deck: DeckData, deploymentZones: DeploymentZone[]): void {
    this.deck = deck;
    this.deploymentZones = deploymentZones;
    this.credits = GAME_CONSTANTS.STARTING_CREDITS;

    // Create deployable units from deck
    this.deployableUnits = deck.units.map(deckUnit => {
      const unitData = getUnitById(deckUnit.unitId);
      if (!unitData) {
        console.warn('[Deploy] Could not find unit data for:', deckUnit.unitId);
      }
      return {
        deckUnit,
        unitData: unitData!,
        totalQuantity: deckUnit.quantity || 1,  // Use quantity from card, default to 1
        deployedCount: 0,                       // None deployed yet
        deployedUnitIds: [],                    // Empty array
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
        <span class="shift-hint">Hold SHIFT for multi-place</span>
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
          top: 120px;
          right: 10px;
          width: 260px;
          max-height: calc(100% - 180px);
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
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .credits-display {
          font-size: 16px;
          color: #ffd700;
        }

        .shift-hint {
          font-size: 10px;
          color: #666;
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
          position: relative;
        }

        .deploy-unit-card:hover {
          background: rgba(74, 158, 255, 0.1);
          border-color: #4a9eff;
        }

        .deploy-unit-card.selected {
          background: rgba(74, 158, 255, 0.3);
          border-color: #4a9eff;
        }

        .deploy-unit-card.all-deployed {
          opacity: 0.4;
          cursor: not-allowed;
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
          position: relative;
        }

        .deploy-unit-count {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 18px;
          height: 18px;
          background: #4a9eff;
          border-radius: 9px;
          font-size: 11px;
          font-weight: bold;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }

        .deploy-unit-count.low {
          background: #ff9f4a;
        }

        .deploy-unit-count.empty {
          background: #666;
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
          color: #888;
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
      if (card && !card.classList.contains('all-deployed') && !card.classList.contains('too-expensive')) {
        const unitTypeId = card.getAttribute('data-unit-type')!;
        this.selectUnitByType(unitTypeId);
      }
    });

    // Setup mouse events for placement
    const canvas = this.game.renderer.domElement;
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('click', this.onClick.bind(this));
    canvas.addEventListener('contextmenu', this.onRightClick.bind(this));

    // Setup keyboard hotkeys for unit bar
    document.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  private renderUI(): void {
    if (!this.categoryTabs || !this.unitCardsContainer || !this.creditsDisplay) return;

    // Update credits
    this.creditsDisplay.textContent = this.credits.toString();

    // Group units by type and category
    const stackedByType = this.getStackedUnitTypes();

    // Count units per category
    const categoryCounts = new Map<UnitCategory, { total: number; deployed: number }>();
    for (const du of this.deployableUnits) {
      const cat = du.unitData.category;
      const existing = categoryCounts.get(cat) ?? { total: 0, deployed: 0 };
      existing.total += du.totalQuantity;
      existing.deployed += du.deployedCount;
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

    // Filter stacked units for current category
    const categoryStacks = stackedByType.filter(
      stack => stack.unitData.category === this.currentCategory
    );

    // Render stacked unit cards
    this.unitCardsContainer.innerHTML = categoryStacks.map(stack => {
      const allDeployed = stack.available === 0;
      const tooExpensive = stack.unitData.cost > this.credits;
      const isSelected = this.selectedUnitTypeId === stack.unitData.id;
      const total = stack.available + stack.deployed;

      const icon = this.getUnitIcon(stack.unitData.category);
      const countClass = stack.available === 0 ? 'empty' : (stack.available === 1 ? 'low' : '');

      return `
        <div class="deploy-unit-card ${allDeployed ? 'all-deployed' : ''} ${tooExpensive && !allDeployed ? 'too-expensive' : ''} ${isSelected ? 'selected' : ''}"
             data-unit-type="${stack.unitData.id}">
          <div class="deploy-unit-icon">
            ${icon}
            <span class="deploy-unit-count ${countClass}">${stack.available}</span>
          </div>
          <div class="deploy-unit-info">
            <div class="deploy-unit-name">${stack.unitData.name}</div>
            <div class="deploy-unit-cost">${stack.unitData.cost} credits</div>
            <div class="deploy-unit-status">${stack.deployed}/${total} deployed</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Group deployable units by their unit type
   */
  private getStackedUnitTypes(): StackedUnitType[] {
    const stacks = new Map<string, StackedUnitType>();

    this.deployableUnits.forEach((du, index) => {
      const typeId = du.unitData.id;
      if (!stacks.has(typeId)) {
        stacks.set(typeId, {
          unitData: du.unitData,
          indices: [],
          available: 0,
          deployed: 0,
        });
      }
      const stack = stacks.get(typeId)!;
      stack.indices.push(index);

      // Sum up quantities from this card
      const remainingFromCard = du.totalQuantity - du.deployedCount;
      stack.available += remainingFromCard;
      stack.deployed += du.deployedCount;
    });

    return Array.from(stacks.values());
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

  /**
   * Select a unit by its type ID - finds the first available unit of that type
   */
  private selectUnitByType(unitTypeId: string): void {
    // Find the first card with available units of this type
    const index = this.deployableUnits.findIndex(
      du => du.unitData.id === unitTypeId && du.deployedCount < du.totalQuantity
    );

    if (index === -1) return;

    this.selectedUnitTypeId = unitTypeId;
    this.selectUnit(index);
  }

  private selectUnit(index: number): void {
    const du = this.deployableUnits[index];
    if (!du) return;

    // In battle phase, queue for reinforcement instead of placing
    if (this.game.phase === 'battle') {
      // Check if card has units available
      if (du.deployedCount >= du.totalQuantity) return;

      const success = this.game.reinforcementManager.queueUnit(du.unitData.id);
      if (success) {
        // Note: Credits and deployment count are NOT deducted here
        // They will be deducted when the destination is clicked and the unit is actually queued
        // (in handleReinforcementDestinationClick)
        console.log(`Waiting for destination for ${du.unitData.name} reinforcement`);
      }
      return;
    }

    // Setup phase: normal instant placement
    this.selectedUnitIndex = index;
    this.selectedUnitTypeId = du.unitData.id;
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
    if (!this.isInDeploymentZone(worldPos.x, worldPos.z)) return;

    // Check if shift is held for multi-placement
    const shiftHeld = event.shiftKey;

    // Deploy the unit
    this.deployUnit(this.selectedUnitIndex, worldPos, shiftHeld);
  }

  private onRightClick(event: MouseEvent): void {
    event.preventDefault();

    // Cancel placement
    if (this.isPlacingUnit) {
      this.cancelPlacement();
    }
  }

  /**
   * Handle keyboard hotkeys for the unit bar
   * F1-F12: Select unit 1-12 in current category
   * Ctrl+F1-F12: Switch to tab 1-12
   */
  private onKeyDown(event: KeyboardEvent): void {
    // Only handle F1-F12 keys
    const fKeyMatch = event.key.match(/^F(\d+)$/);
    if (!fKeyMatch || !fKeyMatch[1]) return;

    const fKeyNum = parseInt(fKeyMatch[1], 10);
    if (fKeyNum < 1 || fKeyNum > 12) return;

    // Only handle if unit bar is visible (Setup or Battle phase)
    const unitBar = document.getElementById('battle-unit-bar');
    if (!unitBar || !unitBar.classList.contains('visible')) return;

    event.preventDefault();

    if (event.ctrlKey) {
      // Ctrl+F1-F12: Switch category tabs
      this.switchToTabByIndex(fKeyNum - 1);
    } else {
      // F1-F12: Select unit by index in current category
      this.selectUnitByIndex(fKeyNum - 1);
    }
  }

  /**
   * Switch to a category tab by index (0-based)
   */
  private switchToTabByIndex(index: number): void {
    const stackedByType = this.getStackedUnitTypes();

    // Get categories that have available units
    const categories: UnitCategory[] = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
    const availableCategories = categories.filter(cat =>
      stackedByType.some(stack => stack.unitData.category === cat && stack.available > 0)
    );

    if (index >= 0 && index < availableCategories.length) {
      this.battleBarCategory = availableCategories[index]!;
      this.renderBattleUnitBar();
    }
  }

  /**
   * Select a unit by index in the current category (0-based)
   */
  private selectUnitByIndex(index: number): void {
    const stackedByType = this.getStackedUnitTypes();

    // Get units in current category that are available
    const categoryUnits = stackedByType.filter(
      stack => stack.unitData.category === this.battleBarCategory && stack.available > 0
    );

    if (index >= 0 && index < categoryUnits.length) {
      const unit = categoryUnits[index]!;
      if (unit.unitData.cost <= this.credits) {
        this.queueUnitFromBar(unit.unitData.id);
      }
    }
  }

  private isInDeploymentZone(x: number, z: number): boolean {
    if (this.deploymentZones.length === 0) return false;

    return this.deploymentZones.some(zone =>
      x >= zone.minX &&
      x <= zone.maxX &&
      z >= zone.minZ &&
      z <= zone.maxZ
    );
  }

  private deployUnit(index: number, position: THREE.Vector3, continueAfter: boolean = false): void {
    const du = this.deployableUnits[index];
    // Check if card has units available
    if (!du || du.deployedCount >= du.totalQuantity) return;

    // Check credits
    if (du.unitData.cost > this.credits) return;

    const unitTypeId = du.unitData.id;

    // Spawn the unit
    const unit = this.game.unitManager.spawnUnit({
      position,
      team: 'player',
      ownerId: 'player',
      unitType: unitTypeId,
      name: du.unitData.name,
    });

    // Track deployment
    du.deployedCount++;
    du.deployedUnitIds.push(unit.id);

    // Deduct credits
    this.credits -= du.unitData.cost;

    // Check if we should continue placing more units of the same type
    if (continueAfter && this.selectedUnitTypeId) {
      // Check if current card still has units available
      if (du.deployedCount < du.totalQuantity && du.unitData.cost <= this.credits) {
        // Continue with same card
        this.renderUI();
        return;
      }

      // Find the next card with available units of the same type
      const nextIndex = this.deployableUnits.findIndex(
        d => d.unitData.id === this.selectedUnitTypeId && d.deployedCount < d.totalQuantity
      );

      if (nextIndex !== -1 && this.deployableUnits[nextIndex]!.unitData.cost <= this.credits) {
        // Continue placing from next card
        this.selectedUnitIndex = nextIndex;
        this.renderUI();
        return;
      }
    }

    // Cancel placement mode
    this.cancelPlacement();

    // Re-render UI (both right panel and battle unit bar)
    this.renderUI();
    this.renderBattleUnitBar();
    this.updateCreditsDisplay();
  }

  private cancelPlacement(): void {
    this.isPlacingUnit = false;
    this.selectedUnitIndex = -1;
    this.selectedUnitTypeId = null;

    // Remove ghost mesh
    if (this.ghostMesh) {
      this.game.scene.remove(this.ghostMesh);
      this.ghostMesh.geometry.dispose();
      (this.ghostMesh.material as THREE.Material).dispose();
      this.ghostMesh = null;
    }

    this.renderUI();
    this.renderBattleUnitBar();
  }

  // Called when a deployed unit is sold
  onUnitSold(unitId: string, refund: number): void {
    const du = this.deployableUnits.find(d => d.deployedUnitIds.includes(unitId));
    if (du) {
      // Remove the unit ID from the array
      const index = du.deployedUnitIds.indexOf(unitId);
      if (index !== -1) {
        du.deployedUnitIds.splice(index, 1);
        du.deployedCount--;
      }
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

  /**
   * Render the horizontal battle unit bar for quick reinforcement access
   */
  renderBattleUnitBar(): void {
    const unitBar = document.getElementById('battle-unit-bar');
    const unitTabs = document.getElementById('battle-unit-tabs');
    const unitCards = document.getElementById('battle-unit-cards');
    if (!unitBar || !unitTabs || !unitCards) return;

    // Get stacked unit types (grouped by type)
    const stackedByType = this.getStackedUnitTypes();

    // Count available and total units per category
    const categoryCounts = new Map<UnitCategory, { available: number; total: number }>();
    for (const stack of stackedByType) {
      const cat = stack.unitData.category;
      const existing = categoryCounts.get(cat) ?? { available: 0, total: 0 };
      existing.available += stack.available;
      existing.total += stack.available + stack.deployed;
      categoryCounts.set(cat, existing);
    }

    // If current category is empty and has no units at all, switch to first with any units
    const currentCatData = categoryCounts.get(this.battleBarCategory);
    if (!currentCatData || currentCatData.total === 0) {
      const firstCat = Array.from(categoryCounts.entries()).find(([_, data]) => data.total > 0)?.[0];
      if (firstCat) {
        this.battleBarCategory = firstCat;
      }
    }

    // Render category tabs (show all categories that have any units, gray out empty ones)
    const categories: UnitCategory[] = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];
    unitTabs.innerHTML = categories
      .filter(cat => {
        const data = categoryCounts.get(cat);
        return data && data.total > 0; // Only show tabs for categories that had units in deck
      })
      .map(cat => {
        const data = categoryCounts.get(cat) ?? { available: 0, total: 0 };
        const isActive = cat === this.battleBarCategory;
        const isEmpty = data.available === 0;
        return `
          <button class="battle-tab ${isActive ? 'active' : ''} ${isEmpty ? 'empty' : ''}"
                  data-category="${cat}" ${isEmpty ? 'disabled' : ''}>
            ${cat}<span class="tab-count">(${data.available})</span>
          </button>
        `;
      }).join('');

    // Bind tab click handlers
    unitTabs.querySelectorAll('.battle-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabEl = e.currentTarget as HTMLElement;
        const category = tabEl.getAttribute('data-category') as UnitCategory;
        if (category) {
          this.battleBarCategory = category;
          this.renderBattleUnitBar();
        }
      });
    });

    // Filter and render unit cards for current category (show all, gray out unavailable)
    unitCards.innerHTML = stackedByType
      .filter(stack => stack.unitData.category === this.battleBarCategory)
      .map(stack => {
        const allDeployed = stack.available === 0;
        const tooExpensive = stack.unitData.cost > this.credits;

        // Check if this unit type is selected (setup phase or battle phase reinforcement)
        const isSetupPlacement = this.selectedUnitTypeId === stack.unitData.id && this.isPlacingUnit;
        const isBattleReinforcement = this.waitingForReinforcementDestination &&
                                      this.pendingReinforcementUnitIndex !== -1 &&
                                      this.deployableUnits[this.pendingReinforcementUnitIndex]?.unitData.id === stack.unitData.id;
        const isSelected = isSetupPlacement || isBattleReinforcement;

        return `
          <div class="battle-unit-card ${allDeployed ? 'all-deployed' : ''} ${tooExpensive && !allDeployed ? 'too-expensive' : ''} ${isSelected ? 'selected' : ''}"
               data-unit-type="${stack.unitData.id}"
               title="${stack.unitData.name} - ${stack.unitData.cost} credits${allDeployed ? ' (all deployed)' : ''}">
            <span class="unit-count-badge ${allDeployed ? 'empty' : ''}">${stack.available}</span>
            <span class="unit-name">${stack.unitData.name.slice(0, 8)}</span>
            <span class="unit-cost">${stack.unitData.cost}</span>
          </div>
        `;
      }).join('');

    // Bind card click handlers
    unitCards.querySelectorAll('.battle-unit-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const cardEl = e.currentTarget as HTMLElement;
        if (cardEl.classList.contains('too-expensive')) return;
        if (cardEl.classList.contains('all-deployed')) return;

        const unitTypeId = cardEl.getAttribute('data-unit-type');
        if (unitTypeId) {
          this.queueUnitFromBar(unitTypeId);
        }
      });
    });
  }

  /**
   * Handle unit selection from the battle unit bar
   * - Setup phase: Start ghost placement mode (click to place)
   * - Battle phase: Enter waiting mode for destination click
   */
  private queueUnitFromBar(unitTypeId: string): void {
    // Find the first card with available units of this type
    const duIndex = this.deployableUnits.findIndex(
      d => d.unitData.id === unitTypeId && d.deployedCount < d.totalQuantity
    );

    if (duIndex === -1) {
      return;
    }

    const du = this.deployableUnits[duIndex]!;

    // Check credits
    if (du.unitData.cost > this.credits) {
      return;
    }

    // Setup phase: Start ghost placement mode
    if (this.game.phase === 'setup') {
      this.selectedUnitIndex = duIndex;
      this.selectedUnitTypeId = unitTypeId;
      this.isPlacingUnit = true;
      this.createGhostMesh();
      this.renderBattleUnitBar(); // Update selection state
      return;
    }

    // Battle phase: Enter waiting mode for destination click
    this.waitingForReinforcementDestination = true;
    this.pendingReinforcementUnitIndex = duIndex;

      // Track deployment
      du.deployedCount++;

      // Re-render both the battle unit bar and update credits display
      this.renderBattleUnitBar();
      this.updateCreditsDisplay();

      console.log(`Queued ${du.unitData.name} for reinforcement (${du.unitData.cost} credits)`);
    }
  }

  /**
   * Update all credits displays
   */
  private updateCreditsDisplay(): void {
    if (this.creditsDisplay) {
      this.creditsDisplay.textContent = this.credits.toString();
    }
    // Update top-bar credits
    const topCredits = document.getElementById('credits-value');
    if (topCredits) {
      topCredits.textContent = this.credits.toString();
    }
  }

  /**
   * Show the battle unit bar
   */
  showBattleUnitBar(): void {
    const unitBar = document.getElementById('battle-unit-bar');
    if (unitBar) {
      unitBar.classList.add('visible');
      this.renderBattleUnitBar();
    }
  }

  /**
   * Hide the battle unit bar
   */
  hideBattleUnitBar(): void {
    const unitBar = document.getElementById('battle-unit-bar');
    if (unitBar) {
      unitBar.classList.remove('visible');
    }
  }

  /**
   * Check if waiting for reinforcement destination click
   */
  isWaitingForReinforcementDestination(): boolean {
    return this.waitingForReinforcementDestination;
  }

  /**
   * Handle destination click for battle phase reinforcement
   */
  handleReinforcementDestinationClick(worldPos: THREE.Vector3): void {
    if (!this.waitingForReinforcementDestination || this.pendingReinforcementUnitIndex === -1) {
      return;
    }

    const du = this.deployableUnits[this.pendingReinforcementUnitIndex];
    if (!du) {
      this.cancelReinforcementWait();
      return;
    }

    // Check credits one more time
    if (du.unitData.cost > this.credits) {
      this.cancelReinforcementWait();
      return;
    }

    // Find closest resupply point to destination
    const closestResupplyPoint = this.game.reinforcementManager.findClosestResupplyPoint(worldPos);
    if (!closestResupplyPoint) {
      this.cancelReinforcementWait();
      return;
    }

    // Get movement modifiers
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
      // MP mode: send command, don't update local state (will be updated when command is processed)
      this.game.multiplayerBattleSync.sendQueueReinforcementCommand(
        closestResupplyPoint.id,
        du.unitData.id,
        worldPos.x,
        worldPos.z,
        moveType
      );
      console.log(`[DEPLOY] Sent MP command to queue ${du.unitData.name} at ${closestResupplyPoint.type} entry point`);

      // Update local state - credit deduction and tracking
      // Note: In MP mode, state is updated locally but will be validated when command is processed
      this.processQueueReinforcementLocal(du, closestResupplyPoint.id);
    } else {
      // Local mode: queue directly and update state
      const success = this.game.reinforcementManager.queueUnitAtResupplyPoint(
        closestResupplyPoint.id,
        du.unitData.id,
        { x: worldPos.x, z: worldPos.z },
        moveType
      );

      if (success) {
        this.processQueueReinforcementLocal(du, closestResupplyPoint.id);
      }
    }

    // Check if shift is held for multi-placement
    const shiftHeld = this.game.inputManager.modifiers.shift;
    if (shiftHeld) {
      // Find next undeployed unit of the same type
      const unitTypeId = du.unitData.id;
      const nextUnitIndex = this.deployableUnits.findIndex(
        d => d.unitData.id === unitTypeId && !d.deployed
      );

      if (nextUnitIndex !== -1) {
        // Found another unit of same type, keep waiting for next placement
        this.pendingReinforcementUnitIndex = nextUnitIndex;
        // Re-render to update unit count but keep selection
        this.renderBattleUnitBar();
      } else {
        // No more units of this type available
        this.waitingForReinforcementDestination = false;
        this.pendingReinforcementUnitIndex = -1;
        this.game.reinforcementManager.clearPreviewPath();
        this.renderBattleUnitBar();
      }
    } else {
      // Clear waiting state
      this.waitingForReinforcementDestination = false;
      this.pendingReinforcementUnitIndex = -1;
      this.game.reinforcementManager.clearPreviewPath();
      this.renderBattleUnitBar();
    }
  }

  /**
   * Process reinforcement queue locally (credit deduction and state updates)
   */
  private processQueueReinforcementLocal(du: DeployableUnit, entryPointId: string): void {
    // Deduct credits
    this.credits -= du.unitData.cost;

    // Mark as deployed
    du.deployed = true;

    // Increment deployment count
    du.deployedCount++;

    // Update UI
    this.renderBattleUnitBar();
    this.updateCreditsDisplay();

    console.log(`[DEPLOY] Queued ${du.unitData.name} for reinforcement at entry point ${entryPointId} (${du.unitData.cost} credits)`);
  }

  /**
   * Process received reinforcement command (for multiplayer sync)
   * Called by MultiplayerBattleSync when receiving QueueReinforcement commands
   * Handles credit deduction and deployment tracking
   */
  processReinforcementCommand(unitType: string, entryPointId: string): void {
    // Find the deployable unit by type
    const du = this.deployableUnits.find(d => d.unitData.id === unitType);
    if (!du) {
      console.warn(`[DEPLOY] Cannot process reinforcement command: unit type ${unitType} not found in deck`);
      return;
    }

    // Check if we have units available
    if (du.deployedCount >= du.totalQuantity) {
      console.warn(`[DEPLOY] Cannot process reinforcement command: no units of type ${unitType} available`);
      return;
    }

    // Check if we have enough credits
    if (this.credits < du.unitData.cost) {
      console.warn(`[DEPLOY] Cannot process reinforcement command: insufficient credits for ${unitType}`);
      return;
    }

    // Process the reinforcement
    this.processQueueReinforcementLocal(du, entryPointId);
  }

  /**
   * Cancel waiting for reinforcement destination
   */
  cancelReinforcementWait(): void {
    if (this.waitingForReinforcementDestination) {
      this.waitingForReinforcementDestination = false;
      this.pendingReinforcementUnitIndex = -1;
      // Clear the preview path
      this.game.reinforcementManager.clearPreviewPath();
      // Re-render to clear selection visual
      this.renderBattleUnitBar();
    }
  }

  /**
   * Update reinforcement preview path
   */
  updateReinforcementPreviewPath(mouseWorldPos: THREE.Vector3): void {
    if (!this.waitingForReinforcementDestination || this.pendingReinforcementUnitIndex === -1) {
      return;
    }

    // Find closest resupply point to show path from
    const closestResupplyPoint = this.game.reinforcementManager.findClosestResupplyPoint(mouseWorldPos);
    if (!closestResupplyPoint) {
      return;
    }

    // Update the reinforcement manager's preview path
    this.game.reinforcementManager.updatePreviewPathFromPoint(
      closestResupplyPoint,
      mouseWorldPos
    );
  }

  dispose(): void {
    this.cancelPlacement();
    this.cancelReinforcementWait();
  }
}
