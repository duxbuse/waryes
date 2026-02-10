/**
 * SelectionManager - Manages unit selection state and visualization
 *
 * Responsibilities:
 * - Track selected units
 * - Update selection visuals (rings, UI)
 * - Handle selection operations (add, remove, clear, cycle)
 */

import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import { getWeaponById } from '../../data/factions';

export class SelectionManager {
  private readonly game: Game;
  private selectedUnits: Unit[] = [];
  private selectedTypes: string[] = [];
  private currentTypeIndex = 0;

  // Control groups (1-9)
  private controlGroups: Map<number, Unit[]> = new Map();

  // UI Elements
  private selectionPanel: HTMLElement | null = null;
  private selectionHeader: HTMLElement | null = null;
  private selectionStats: HTMLElement | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  initialize(): void {
    this.selectionPanel = document.getElementById('selection-panel');
    this.selectionHeader = document.getElementById('selection-header');
    this.selectionStats = document.getElementById('selection-stats');
  }

  /**
   * Set selection to specific units (replaces existing)
   */
  setSelection(units: readonly Unit[]): void {
    // Deselect old units
    for (const unit of this.selectedUnits) {
      unit.setSelected(false);
    }

    // Select new units
    this.selectedUnits = [...units];
    for (const unit of this.selectedUnits) {
      unit.setSelected(true);
    }

    // Play selection sound if units were selected
    if (units.length > 0) {
      this.game.audioManager.playSound('unit_select');
    }

    this.updateSelectedTypes();
    this.updateUI();
  }

  /**
   * Add units to current selection
   */
  addToSelection(units: Unit[]): void {
    for (const unit of units) {
      if (!this.selectedUnits.includes(unit)) {
        this.selectedUnits.push(unit);
        unit.setSelected(true);
      }
    }

    this.updateSelectedTypes();
    this.updateUI();
  }

  /**
   * Toggle unit in selection
   */
  toggleSelection(unit: Unit): void {
    const index = this.selectedUnits.indexOf(unit);
    if (index >= 0) {
      this.selectedUnits.splice(index, 1);
      unit.setSelected(false);
    } else {
      this.selectedUnits.push(unit);
      unit.setSelected(true);
    }

    this.updateSelectedTypes();
    this.updateUI();
  }

  /**
   * Clear all selection
   */
  clearSelection(): void {
    for (const unit of this.selectedUnits) {
      unit.setSelected(false);
    }
    this.selectedUnits = [];
    this.selectedTypes = [];
    this.currentTypeIndex = 0;
    this.updateUI();
  }

  /**
   * Select all units of a specific type
   */
  selectAllOfType(unitType: string): void {
    const units = this.game.unitManager.getUnitsByType(unitType, 'player');
    this.setSelection(units);
  }

  /**
   * Select all player units
   */
  selectAllPlayerUnits(): void {
    const units = this.game.unitManager.getAllUnits('player');
    this.setSelection(units);
  }

  /**
   * Cycle through different unit types in selection (Tab key)
   */
  cycleSelectionType(): void {
    if (this.selectedTypes.length <= 1) return;

    this.currentTypeIndex = (this.currentTypeIndex + 1) % this.selectedTypes.length;
    const targetType = this.selectedTypes[this.currentTypeIndex];

    if (targetType) {
      // Filter selection to only the current type
      const filteredUnits = this.selectedUnits.filter(u => u.unitType === targetType);
      this.setSelection(filteredUnits);
    }
  }

  /**
   * Assign current selection to a control group (Ctrl+1-9)
   */
  assignControlGroup(groupNumber: number): void {
    if (groupNumber < 1 || groupNumber > 9) return;
    if (this.selectedUnits.length === 0) return;

    // Filter out dead units
    const aliveUnits = this.selectedUnits.filter(u => u.health > 0);
    this.controlGroups.set(groupNumber, [...aliveUnits]);
  }

  /**
   * Recall a control group (1-9)
   */
  recallControlGroup(groupNumber: number): void {
    if (groupNumber < 1 || groupNumber > 9) return;

    const group = this.controlGroups.get(groupNumber);
    if (!group || group.length === 0) return;

    // Filter out dead units
    const aliveUnits = group.filter(u => u.health > 0);
    if (aliveUnits.length === 0) {
      this.controlGroups.delete(groupNumber);
      return;
    }

    // Update group to only include alive units
    this.controlGroups.set(groupNumber, aliveUnits);

    // Select the group
    this.setSelection(aliveUnits);
  }

  /**
   * Get currently selected units
   */
  getSelectedUnits(): Unit[] {
    return [...this.selectedUnits];
  }

  /**
   * Check if a unit is selected
   */
  isSelected(unit: Unit): boolean {
    return this.selectedUnits.includes(unit);
  }

  /**
   * Remove a unit from selection (e.g., when it dies)
   */
  removeFromSelection(unit: Unit): void {
    const index = this.selectedUnits.indexOf(unit);
    if (index >= 0) {
      this.selectedUnits.splice(index, 1);
      unit.setSelected(false);
      this.updateSelectedTypes();
      this.updateUI();
    }
  }

  private updateSelectedTypes(): void {
    const types = new Set<string>();
    for (const unit of this.selectedUnits) {
      types.add(unit.unitType);
    }
    this.selectedTypes = Array.from(types);
    this.currentTypeIndex = 0;
  }

  private updateUI(): void {
    if (!this.selectionPanel || !this.selectionHeader || !this.selectionStats) {
      return;
    }

    if (this.selectedUnits.length === 0) {
      this.selectionPanel.classList.remove('visible');
      return;
    }

    this.selectionPanel.classList.add('visible');

    // Update header
    if (this.selectedUnits.length === 1) {
      const unit = this.selectedUnits[0]!;
      this.selectionHeader.textContent = unit.name;
    } else {
      this.selectionHeader.textContent = `${this.selectedUnits.length} units selected`;
    }

    // Update stats
    if (this.selectedUnits.length === 1) {
      const unit = this.selectedUnits[0]!;
      let statsHtml = `
        <div>Type: ${unit.unitType}</div>
        <div>Health: ${unit.health}/${unit.maxHealth}</div>
        <div>Morale: ${Math.round(unit.morale)}%</div>
        <div>Team: ${unit.team}</div>
      `;

      // Add transport/garrison status
      if (unit.isGarrisoned && unit.garrisonedBuilding) {
        const building = unit.garrisonedBuilding;
        statsHtml += `<div style="margin-top: 4px; color: #4aff4a;">🏠 Garrisoned in ${building.name}</div>`;
      }

      // Check if unit is a transport with passengers
      if (unit.transportCapacity > 0) {
        const passengers = this.game.transportManager.getPassengers(unit);
        statsHtml += `<div style="margin-top: 4px; color: #4a9eff;">🚚 Passengers: ${passengers.length}/${unit.transportCapacity}</div>`;
      }

      // Add weapon stats
      const weapons = unit.getWeapons();
      if (weapons.length > 0) {
        statsHtml += '<div style="margin-top: 8px; border-top: 1px solid #333; padding-top: 8px;">';
        statsHtml += '<strong>Weapons:</strong>';
        for (let i = 0; i < weapons.length; i++) {
          const weaponSlot = weapons[i];
          if (weaponSlot) {
            const weapon = getWeaponById(weaponSlot.weaponId);
            if (weapon) {
              const cooldown = unit.getWeaponCooldown(i);
              const damage = unit.getWeaponDamageDealt(i);
              const status = cooldown > 0 ? `Reloading (${cooldown.toFixed(1)}s)` : 'Ready';
              statsHtml += `<div>${weapon.name}: ${status} | Damage: ${damage.toFixed(0)}</div>`;
            }
          }
        }
        statsHtml += '</div>';
      }

      this.selectionStats.innerHTML = statsHtml;
    } else {
      // Show breakdown by type
      const typeCounts = new Map<string, number>();
      let totalHealth = 0;
      let totalMaxHealth = 0;

      for (const unit of this.selectedUnits) {
        typeCounts.set(unit.unitType, (typeCounts.get(unit.unitType) || 0) + 1);
        totalHealth += unit.health;
        totalMaxHealth += unit.maxHealth;
      }

      let statsHtml = '';
      for (const [type, count] of typeCounts) {
        statsHtml += `<div>${type}: ${count}</div>`;
      }
      statsHtml += `<div>Total HP: ${totalHealth}/${totalMaxHealth}</div>`;

      this.selectionStats.innerHTML = statsHtml;
    }
  }

  update(_dt: number): void {
    // Could update selection visuals here if needed
  }
}
