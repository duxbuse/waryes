/**
 * DeckBuilderScreen - Full deck construction UI
 */

import { ScreenType, type Screen } from '../core/ScreenManager';
import type { DeckData, DeckUnit, UnitData, UnitCategory, DivisionRosterEntry, UnitAvailability } from '../data/types';
import { FACTIONS, UNITS, getUnitById, getDivisionById, getDivisionsByFaction } from '../data/factions';
import { GAME_CONSTANTS } from '../data/types';
import { showNotification } from '../core/UINotifications';

export interface DeckBuilderCallbacks {
  onBack: () => void;
  onSaveDeck: (deck: DeckData) => void;
}

const CATEGORIES: UnitCategory[] = ['LOG', 'INF', 'TNK', 'REC', 'AA', 'ART', 'HEL', 'AIR'];

// Helper to sanitize HTML to prevent XSS
function sanitizeHTML(str: string | number): string {
  const text = String(str);
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper to calculate total availability from UnitAvailability object
function getTotalAvailability(avail: UnitAvailability): number {
  return avail.rookie + avail.trained + avail.veteran + avail.elite + avail.legend;
}

// Helper to get quantity based on veterancy level
function getQuantityForVeterancy(avail: UnitAvailability, veterancy: number): number {
  switch (veterancy) {
    case 0: return avail.trained;  // Trained
    case 1: return avail.veteran;  // Veteran
    case 2: return avail.elite;    // Elite
    case 3: return avail.legend;   // Legend
    default: return avail.trained;
  }
}


export function createDeckBuilderScreen(callbacks: DeckBuilderCallbacks): Screen {
  let currentFactionId = FACTIONS[0]?.id ?? '';
  let currentDivisionId = '';
  let currentCategory: UnitCategory = 'INF';
  let deckUnits: DeckUnit[] = [];
  let activationPoints = 0;
  let pinnedUnit: UnitData | null = null;
  let hoveredUnit: UnitData | null = null;
  let deckName = 'New Deck';

  const element = document.createElement('div');
  element.id = 'deck-builder-screen';
  element.innerHTML = `
    <div class="deck-builder-container">
      <div class="deck-header">
        <button class="back-btn" id="db-back-btn">&larr; Back</button>
        <h2>DECK BUILDER</h2>
        <div class="deck-actions">
          <button class="action-btn" id="db-load-btn">Load</button>
          <button class="action-btn" id="db-save-btn">Save</button>
        </div>
      </div>

      <div class="deck-main">
        <div class="deck-sidebar">
          <div class="faction-selection">
            <label>Faction:</label>
            <select id="faction-select"></select>
          </div>
          <div class="division-selection">
            <label>Division:</label>
            <select id="division-select"></select>
          </div>
          <div class="deck-name-input">
            <label>Deck Name:</label>
            <input type="text" id="deck-name" value="New Deck" />
          </div>
          <div class="deck-stats">
            <div class="stat">
              <span>Activation Points:</span>
              <span id="ap-used">0</span> / ${GAME_CONSTANTS.MAX_ACTIVATION_POINTS}
            </div>
            <div class="stat">
              <span>Total Cost:</span>
              <span id="total-cost">0</span>
            </div>
            <div class="stat">
              <span>Units:</span>
              <span id="unit-count">0</span>
            </div>
          </div>
        </div>

        <div class="deck-content">
          <div class="category-tabs" id="category-tabs"></div>
          <div class="unit-library" id="unit-library"></div>
        </div>

        <div class="deck-right">
          <div class="stats-panel">
            <div class="stats-header">
              <span id="stats-title">Unit Stats</span>
              <button class="pin-btn" id="pin-btn" title="Pin for comparison">Pin</button>
            </div>
            <div id="stats-content" class="stats-content">
              <p class="placeholder">Hover over a unit to see stats</p>
            </div>
            <div id="pinned-stats" class="pinned-stats hidden"></div>
          </div>
        </div>
      </div>

      <div class="deck-strip">
        <div class="deck-strip-header">
          <span>Deck</span>
          <button class="clear-btn" id="clear-deck-btn">Clear All</button>
        </div>
        <div class="deck-strip-units" id="deck-strip-units"></div>
      </div>
    </div>

    <div id="transport-popup" class="transport-popup hidden">
      <div class="popup-content">
        <h3>Select Transport</h3>
        <div id="transport-options"></div>
        <button class="popup-close" id="close-transport-popup">No Transport</button>
      </div>
    </div>

    <div id="load-popup" class="load-popup hidden">
      <div class="popup-content">
        <h3>Load Deck</h3>
        <div id="saved-decks-list"></div>
        <button class="popup-close" id="close-load-popup">Cancel</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #deck-builder-screen {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #0a0a1a 0%, #15152a 100%);
      z-index: 100;
    }

    #deck-builder-screen.hidden {
      display: none;
    }

    .deck-builder-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 10px;
    }

    .deck-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 20px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      margin-bottom: 10px;
    }

    .deck-header h2 {
      color: #4a9eff;
      letter-spacing: 3px;
      margin: 0;
    }

    .back-btn, .action-btn {
      padding: 8px 20px;
      background: rgba(74, 158, 255, 0.2);
      border: 1px solid rgba(74, 158, 255, 0.5);
      color: #e0e0e0;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .back-btn:hover, .action-btn:hover {
      background: rgba(74, 158, 255, 0.4);
      border-color: #4a9eff;
    }

    .deck-actions {
      display: flex;
      gap: 10px;
    }

    .deck-main {
      display: flex;
      flex: 1;
      gap: 10px;
      overflow: hidden;
    }

    .deck-sidebar {
      width: 220px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      padding: 15px;
    }

    .faction-selection, .division-selection, .deck-name-input {
      margin-bottom: 15px;
    }

    .faction-selection label, .division-selection label, .deck-name-input label {
      display: block;
      font-size: 12px;
      color: #888;
      margin-bottom: 5px;
    }

    .faction-selection select, .division-selection select, .deck-name-input input {
      width: 100%;
      padding: 8px;
      background: #1a1a2a;
      border: 1px solid #333;
      color: #e0e0e0;
      border-radius: 4px;
    }

    .deck-stats {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid #333;
    }

    .deck-stats .stat {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .deck-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      overflow: hidden;
    }

    .category-tabs {
      display: flex;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid #333;
    }

    .category-tab {
      padding: 12px 20px;
      background: transparent;
      border: none;
      color: #888;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 13px;
      letter-spacing: 1px;
    }

    .category-tab:hover {
      color: #e0e0e0;
      background: rgba(255, 255, 255, 0.05);
    }

    .category-tab.active {
      color: #4a9eff;
      background: rgba(74, 158, 255, 0.1);
      border-bottom: 2px solid #4a9eff;
    }

    .unit-library {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      align-content: start;
    }

    .unit-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #333;
      border-radius: 6px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .unit-card:hover {
      background: rgba(74, 158, 255, 0.1);
      border-color: #4a9eff;
    }

    .unit-card.unavailable {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .unit-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .unit-card-name {
      font-size: 13px;
      font-weight: bold;
      color: #e0e0e0;
    }

    .unit-card-cost {
      font-size: 12px;
      color: #ffd700;
    }

    .unit-card-tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .unit-tag {
      font-size: 10px;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: #888;
    }

    .unit-card-availability {
      margin-top: 8px;
      font-size: 11px;
      color: #666;
    }

    .deck-right {
      width: 280px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stats-panel {
      flex: 1;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      padding: 15px;
      overflow-y: auto;
    }

    .stats-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #333;
    }

    #stats-title {
      font-size: 14px;
      font-weight: bold;
      color: #4a9eff;
    }

    .pin-btn {
      padding: 4px 10px;
      font-size: 11px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid #444;
      color: #888;
      cursor: pointer;
      border-radius: 3px;
    }

    .pin-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #e0e0e0;
    }

    .pin-btn.pinned {
      background: rgba(74, 158, 255, 0.3);
      border-color: #4a9eff;
      color: #4a9eff;
    }

    .stats-content {
      font-size: 12px;
      line-height: 1.8;
    }

    .stats-content .placeholder {
      color: #555;
      text-align: center;
      padding: 20px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }

    .stat-label {
      color: #888;
    }

    .stat-value {
      color: #e0e0e0;
    }

    .stat-section {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #333;
    }

    .stat-section-title {
      font-size: 11px;
      color: #4a9eff;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .pinned-stats {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 2px solid #4a9eff;
    }

    .pinned-stats.hidden {
      display: none;
    }

    .pinned-header {
      font-size: 12px;
      color: #4a9eff;
      margin-bottom: 10px;
    }

    .deck-strip {
      height: 120px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      margin-top: 10px;
      padding: 10px;
    }

    .deck-strip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .deck-strip-header span {
      font-size: 13px;
      color: #888;
    }

    .clear-btn {
      padding: 4px 12px;
      font-size: 11px;
      background: rgba(255, 74, 74, 0.2);
      border: 1px solid rgba(255, 74, 74, 0.5);
      color: #ff4a4a;
      cursor: pointer;
      border-radius: 3px;
    }

    .clear-btn:hover {
      background: rgba(255, 74, 74, 0.4);
    }

    .deck-strip-units {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 5px;
    }

    .deck-unit-card {
      min-width: 100px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #444;
      border-radius: 4px;
      padding: 8px;
      position: relative;
    }

    .deck-unit-card .remove-btn {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 16px;
      height: 16px;
      background: rgba(255, 74, 74, 0.8);
      border: none;
      border-radius: 50%;
      color: white;
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .deck-unit-card .unit-name {
      font-size: 11px;
      color: #e0e0e0;
      margin-bottom: 4px;
    }

    .deck-unit-card .unit-meta {
      font-size: 10px;
      color: #888;
    }

    .deck-unit-card .slot-cost {
      font-size: 10px;
      color: #ffd700;
    }

    .transport-popup, .load-popup {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 200;
    }

    .transport-popup.hidden, .load-popup.hidden {
      display: none;
    }

    .popup-content {
      background: #1a1a2a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
      min-width: 300px;
      max-width: 500px;
    }

    .popup-content h3 {
      margin: 0 0 15px 0;
      color: #4a9eff;
    }

    .popup-close {
      width: 100%;
      padding: 10px;
      margin-top: 15px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid #444;
      color: #e0e0e0;
      cursor: pointer;
      border-radius: 4px;
    }

    .popup-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .transport-option {
      padding: 10px;
      margin: 5px 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #333;
      border-radius: 4px;
      cursor: pointer;
    }

    .transport-option:hover {
      background: rgba(74, 158, 255, 0.2);
      border-color: #4a9eff;
    }

    .saved-deck-item {
      padding: 10px;
      margin: 5px 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #333;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
    }

    .saved-deck-item:hover {
      background: rgba(74, 158, 255, 0.2);
      border-color: #4a9eff;
    }

    .saved-deck-item .delete-deck {
      color: #ff4a4a;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // Helper functions
  function getAvailableUnitsForDivision(divisionId: string): Map<string, DivisionRosterEntry> {
    const division = getDivisionById(divisionId);
    if (!division) return new Map();

    const available = new Map<string, DivisionRosterEntry>();
    for (const entry of division.roster) {
      available.set(entry.unitId, entry);
    }
    return available;
  }

  function getUsedCount(unitId: string): number {
    return deckUnits.filter(du => du.unitId === unitId).length;
  }

  function getSlotCost(unitId: string, slotIndex: number): number {
    const unit = getUnitById(unitId);
    const division = getDivisionById(currentDivisionId);
    if (!unit || !division) return 0;

    const costs = division.slotCosts[unit.category];
    return costs?.[Math.min(slotIndex, costs.length - 1)] ?? 0;
  }

  function calculateTotalAP(): number {
    let total = 0;
    const unitCounts = new Map<string, number>();

    for (const du of deckUnits) {
      const count = unitCounts.get(du.unitId) ?? 0;
      total += getSlotCost(du.unitId, count);
      unitCounts.set(du.unitId, count + 1);
    }

    return total;
  }

  function calculateTotalCost(): number {
    return deckUnits.reduce((sum, du) => {
      const unit = getUnitById(du.unitId);
      return sum + (unit?.cost ?? 0);
    }, 0);
  }

  function renderFactionSelect(): void {
    const select = element.querySelector('#faction-select') as HTMLSelectElement;
    select.innerHTML = FACTIONS.map(f =>
      `<option value="${sanitizeHTML(f.id)}">${sanitizeHTML(f.name)}</option>`
    ).join('');
    select.value = currentFactionId;
  }

  function renderDivisionSelect(): void {
    const select = element.querySelector('#division-select') as HTMLSelectElement;
    const divisions = getDivisionsByFaction(currentFactionId);
    select.innerHTML = divisions.map(d =>
      `<option value="${sanitizeHTML(d.id)}">${sanitizeHTML(d.name)}</option>`
    ).join('');

    if (divisions.length > 0 && !divisions.find(d => d.id === currentDivisionId)) {
      currentDivisionId = divisions[0]!.id;
    }
    select.value = currentDivisionId;
  }

  function renderCategoryTabs(): void {
    const tabs = element.querySelector('#category-tabs')!;
    tabs.innerHTML = CATEGORIES.map(cat =>
      `<button class="category-tab ${cat === currentCategory ? 'active' : ''}" data-category="${sanitizeHTML(cat)}">${sanitizeHTML(cat)}</button>`
    ).join('');
  }

  function renderUnitLibrary(): void {
    const library = element.querySelector('#unit-library')!;
    const available = getAvailableUnitsForDivision(currentDivisionId);

    const categoryUnits = UNITS.filter(u => u.category === currentCategory);

    library.innerHTML = categoryUnits.map(unit => {
      const availability = available.get(unit.id);
      const isAvailable = availability !== undefined;
      const usedCount = getUsedCount(unit.id);
      const totalAvail = availability ? getTotalAvailability(availability.availability) : 0;
      const remaining = totalAvail - usedCount;

      return `
        <div class="unit-card ${!isAvailable || remaining <= 0 ? 'unavailable' : ''}"
             data-unit-id="${sanitizeHTML(unit.id)}"
             ${isAvailable && remaining > 0 ? '' : 'data-unavailable="true"'}>
          <div class="unit-card-header">
            <span class="unit-card-name">${sanitizeHTML(unit.name)}</span>
            <span class="unit-card-cost">${sanitizeHTML(unit.cost)}</span>
          </div>
          <div class="unit-card-tags">
            ${unit.tags.slice(0, 3).map(t => `<span class="unit-tag">${sanitizeHTML(t)}</span>`).join('')}
          </div>
          ${isAvailable ? `
            <div class="unit-card-availability">
              Available: ${sanitizeHTML(remaining)}/${sanitizeHTML(totalAvail)}
            </div>
          ` : '<div class="unit-card-availability">Not in division</div>'}
        </div>
      `;
    }).join('');
  }

  function renderUnitStats(unit: UnitData | null): void {
    const content = element.querySelector('#stats-content')!;

    if (!unit) {
      content.innerHTML = '<p class="placeholder">Hover over a unit to see stats</p>';
      return;
    }

    content.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">Name:</span>
        <span class="stat-value">${sanitizeHTML(unit.name)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Cost:</span>
        <span class="stat-value" style="color: #ffd700">${sanitizeHTML(unit.cost)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Category:</span>
        <span class="stat-value">${sanitizeHTML(unit.category)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Health:</span>
        <span class="stat-value">${sanitizeHTML(unit.health)}</span>
      </div>

      <div class="stat-section">
        <div class="stat-section-title">Speed</div>
        <div class="stat-row">
          <span class="stat-label">Road:</span>
          <span class="stat-value">${sanitizeHTML(unit.speed.road)} km/h</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Off-road:</span>
          <span class="stat-value">${sanitizeHTML(unit.speed.offRoad)} km/h</span>
        </div>
      </div>

      <div class="stat-section">
        <div class="stat-section-title">Armor</div>
        <div class="stat-row">
          <span class="stat-label">Front:</span>
          <span class="stat-value">${sanitizeHTML(unit.armor.front)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Side:</span>
          <span class="stat-value">${sanitizeHTML(unit.armor.side)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Rear:</span>
          <span class="stat-value">${sanitizeHTML(unit.armor.rear)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Top:</span>
          <span class="stat-value">${sanitizeHTML(unit.armor.top)}</span>
        </div>
      </div>

      <div class="stat-section">
        <div class="stat-section-title">Other</div>
        <div class="stat-row">
          <span class="stat-label">Optics:</span>
          <span class="stat-value">${sanitizeHTML(unit.optics)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Stealth:</span>
          <span class="stat-value">${sanitizeHTML(unit.stealth)}</span>
        </div>
        ${unit.transportCapacity > 0 ? `
        <div class="stat-row">
          <span class="stat-label">Transport:</span>
          <span class="stat-value">${sanitizeHTML(unit.transportCapacity)} slots</span>
        </div>
        ` : ''}
        ${unit.isCommander ? `
        <div class="stat-row">
          <span class="stat-label">Commander:</span>
          <span class="stat-value" style="color: #ffd700">Yes</span>
        </div>
        ` : ''}
      </div>

      <div class="stat-section">
        <div class="stat-section-title">Weapons (${sanitizeHTML(unit.weapons.length)})</div>
        ${unit.weapons.map(w => `
          <div class="stat-row">
            <span class="stat-value">${sanitizeHTML(w.count)}x ${sanitizeHTML(w.weaponId)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderPinnedStats(): void {
    const pinnedEl = element.querySelector('#pinned-stats')!;
    const pinBtn = element.querySelector('#pin-btn')!;

    if (!pinnedUnit) {
      pinnedEl.classList.add('hidden');
      pinBtn.classList.remove('pinned');
      pinBtn.textContent = 'Pin';
      return;
    }

    pinnedEl.classList.remove('hidden');
    pinBtn.classList.add('pinned');
    pinBtn.textContent = 'Unpin';

    pinnedEl.innerHTML = `
      <div class="pinned-header">Pinned: ${sanitizeHTML(pinnedUnit.name)}</div>
      <div class="stat-row">
        <span class="stat-label">Cost:</span>
        <span class="stat-value">${sanitizeHTML(pinnedUnit.cost)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Health:</span>
        <span class="stat-value">${sanitizeHTML(pinnedUnit.health)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Armor (F/S/R):</span>
        <span class="stat-value">${sanitizeHTML(pinnedUnit.armor.front)}/${sanitizeHTML(pinnedUnit.armor.side)}/${sanitizeHTML(pinnedUnit.armor.rear)}</span>
      </div>
    `;
  }

  function renderDeckStrip(): void {
    const strip = element.querySelector('#deck-strip-units')!;

    if (deckUnits.length === 0) {
      strip.innerHTML = '<p style="color: #555; padding: 10px;">Add units from the library above</p>';
      return;
    }

    // Group units by ID and show count
    const grouped = new Map<string, { count: number; indices: number[] }>();
    deckUnits.forEach((du, i) => {
      const existing = grouped.get(du.unitId);
      if (existing) {
        existing.count++;
        existing.indices.push(i);
      } else {
        grouped.set(du.unitId, { count: 1, indices: [i] });
      }
    });

    strip.innerHTML = Array.from(grouped.entries()).map(([unitId, data]) => {
      const unit = getUnitById(unitId);
      if (!unit) return '';

      const totalCost = unit.cost * data.count;
      const apCost = data.indices.reduce((sum, idx) => {
        const countBefore = deckUnits.slice(0, idx).filter(du => du.unitId === unitId).length;
        return sum + getSlotCost(unitId, countBefore);
      }, 0);

      return `
        <div class="deck-unit-card" data-unit-id="${sanitizeHTML(unitId)}">
          <button class="remove-btn" data-remove-unit="${sanitizeHTML(unitId)}">&times;</button>
          <div class="unit-name">${sanitizeHTML(unit.name)}</div>
          <div class="unit-meta">x${sanitizeHTML(data.count)}</div>
          <div class="slot-cost">${sanitizeHTML(totalCost)}c | ${sanitizeHTML(apCost)}AP</div>
        </div>
      `;
    }).join('');
  }

  function updateStats(): void {
    activationPoints = calculateTotalAP();
    const totalCost = calculateTotalCost();

    (element.querySelector('#ap-used') as HTMLElement).textContent = activationPoints.toString();
    (element.querySelector('#total-cost') as HTMLElement).textContent = totalCost.toString();
    (element.querySelector('#unit-count') as HTMLElement).textContent = deckUnits.length.toString();

    // Color AP if over limit
    const apEl = element.querySelector('#ap-used') as HTMLElement;
    apEl.style.color = activationPoints > GAME_CONSTANTS.MAX_ACTIVATION_POINTS ? '#ff4a4a' : '#e0e0e0';
  }

  function addUnit(unitId: string): void {
    const unit = getUnitById(unitId);
    if (!unit) return;

    const available = getAvailableUnitsForDivision(currentDivisionId);
    const rosterEntry = available.get(unitId);
    if (!rosterEntry) return;

    const usedCount = getUsedCount(unitId);
    const totalAvail = getTotalAvailability(rosterEntry.availability);
    if (usedCount >= totalAvail) return;

    // Check if unit can be transported and has transport options
    if (unit.canBeTransported) {
      showTransportPopup(unitId);
    } else {
      // Get quantity based on veterancy level (0 = trained)
      const quantity = getQuantityForVeterancy(rosterEntry.availability, 0);
      deckUnits.push({ unitId, veterancy: 0, quantity });
      renderDeckStrip();
      renderUnitLibrary();
      updateStats();
    }
  }

  function showTransportPopup(unitId: string): void {
    const popup = element.querySelector('#transport-popup')!;
    const options = element.querySelector('#transport-options')!;

    // Find available transports
    const available = getAvailableUnitsForDivision(currentDivisionId);
    const transports = UNITS.filter(u => {
      const avail = available.get(u.id);
      if (!avail) return false;
      const used = getUsedCount(u.id);
      const total = getTotalAvailability(avail.availability);
      return u.transportCapacity > 0 && used < total;
    });

    options.innerHTML = transports.map(t => `
      <div class="transport-option" data-transport-id="${sanitizeHTML(t.id)}">
        ${sanitizeHTML(t.name)} (${sanitizeHTML(t.transportCapacity)} slots, ${sanitizeHTML(t.cost)}c)
      </div>
    `).join('');

    // Store the unit being added
    popup.setAttribute('data-adding-unit', unitId);
    popup.classList.remove('hidden');

    // Bind transport selection
    options.querySelectorAll('.transport-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const transportId = (opt as HTMLElement).dataset['transportId']!;

        // Get quantity for the unit being added
        const available = getAvailableUnitsForDivision(currentDivisionId);
        const rosterEntry = available.get(unitId);
        const quantity = rosterEntry ? getQuantityForVeterancy(rosterEntry.availability, 0) : 1;

        deckUnits.push({ unitId, veterancy: 0, quantity, transportId });

        // Also add the transport if not already added
        const transportInDeck = deckUnits.some(du => du.unitId === transportId);
        if (!transportInDeck) {
          const transportRoster = available.get(transportId);
          const transportQty = transportRoster ? getQuantityForVeterancy(transportRoster.availability, 0) : 1;
          deckUnits.push({ unitId: transportId, veterancy: 0, quantity: transportQty });
        }
        popup.classList.add('hidden');
        renderDeckStrip();
        renderUnitLibrary();
        updateStats();
      });
    });
  }

  function removeUnit(unitId: string): void {
    const index = deckUnits.findIndex(du => du.unitId === unitId);
    if (index >= 0) {
      deckUnits.splice(index, 1);
      renderDeckStrip();
      renderUnitLibrary();
      updateStats();
    }
  }

  function saveDeck(): void {
    const nameInput = element.querySelector('#deck-name') as HTMLInputElement;
    deckName = nameInput.value || 'New Deck';

    const deck: DeckData = {
      id: `deck_${Date.now()}`,
      name: deckName,
      divisionId: currentDivisionId,
      units: [...deckUnits],
      activationPoints,
    };

    // Save to localStorage
    const savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]');
    const existingIndex = savedDecks.findIndex((d: DeckData) => d.name === deckName);
    if (existingIndex >= 0) {
      savedDecks[existingIndex] = deck;
    } else {
      savedDecks.push(deck);
    }
    localStorage.setItem('stellarSiege_decks', JSON.stringify(savedDecks));

    callbacks.onSaveDeck(deck);
    showNotification(`Deck "${deckName}" saved!`);
  }

  function showLoadPopup(): void {
    const popup = element.querySelector('#load-popup')!;
    const list = element.querySelector('#saved-decks-list')!;

    const savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]') as DeckData[];

    if (savedDecks.length === 0) {
      list.innerHTML = '<p style="color: #666; text-align: center;">No saved decks</p>';
    } else {
      list.innerHTML = savedDecks.map(d => `
        <div class="saved-deck-item" data-deck-id="${sanitizeHTML(d.id)}">
          <span>${sanitizeHTML(d.name)} (${sanitizeHTML(d.units.length)} units)</span>
          <span class="delete-deck" data-delete-deck="${sanitizeHTML(d.id)}">&times;</span>
        </div>
      `).join('');
    }

    popup.classList.remove('hidden');
  }

  function loadDeck(deckId: string): void {
    const savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]') as DeckData[];
    const deck = savedDecks.find(d => d.id === deckId);

    if (deck) {
      deckName = deck.name;
      deckUnits = [...deck.units];
      currentDivisionId = deck.divisionId;

      // Find faction from division
      const division = getDivisionById(currentDivisionId);
      if (division) {
        currentFactionId = division.factionId;
      }

      const nameInput = element.querySelector('#deck-name') as HTMLInputElement;
      nameInput.value = deckName;

      renderFactionSelect();
      renderDivisionSelect();
      renderUnitLibrary();
      renderDeckStrip();
      updateStats();
    }

    element.querySelector('#load-popup')!.classList.add('hidden');
  }

  function deleteDeck(deckId: string): void {
    const savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]') as DeckData[];
    const filtered = savedDecks.filter((d: DeckData) => d.id !== deckId);
    localStorage.setItem('stellarSiege_decks', JSON.stringify(filtered));
    showLoadPopup();
  }

  const onEnter = () => {
    renderFactionSelect();
    renderDivisionSelect();
    renderCategoryTabs();
    renderUnitLibrary();
    renderDeckStrip();
    updateStats();

    // Bind events
    element.querySelector('#db-back-btn')?.addEventListener('click', callbacks.onBack);
    element.querySelector('#db-save-btn')?.addEventListener('click', saveDeck);
    element.querySelector('#db-load-btn')?.addEventListener('click', showLoadPopup);
    element.querySelector('#clear-deck-btn')?.addEventListener('click', () => {
      deckUnits = [];
      renderDeckStrip();
      renderUnitLibrary();
      updateStats();
    });

    element.querySelector('#faction-select')?.addEventListener('change', (e) => {
      currentFactionId = (e.target as HTMLSelectElement).value;
      renderDivisionSelect();
      deckUnits = []; // Clear deck when changing faction
      renderDeckStrip();
      renderUnitLibrary();
      updateStats();
    });

    element.querySelector('#division-select')?.addEventListener('change', (e) => {
      currentDivisionId = (e.target as HTMLSelectElement).value;
      deckUnits = []; // Clear deck when changing division
      renderDeckStrip();
      renderUnitLibrary();
      updateStats();
    });

    element.querySelector('#category-tabs')?.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest('.category-tab');
      if (tab) {
        currentCategory = tab.getAttribute('data-category') as UnitCategory;
        renderCategoryTabs();
        renderUnitLibrary();
      }
    });

    element.querySelector('#unit-library')?.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.unit-card') as HTMLElement;
      if (card && !card.dataset['unavailable']) {
        addUnit(card.dataset['unitId']!);
      }
    });

    element.querySelector('#unit-library')?.addEventListener('mouseover', (e) => {
      const card = (e.target as HTMLElement).closest('.unit-card') as HTMLElement;
      if (card) {
        const unit = getUnitById(card.dataset['unitId']!);
        hoveredUnit = unit ?? null;
        renderUnitStats(unit ?? null);
      }
    });

    element.querySelector('#unit-library')?.addEventListener('mouseout', (e) => {
      const card = (e.target as HTMLElement).closest('.unit-card');
      if (card) {
        hoveredUnit = null;
        renderUnitStats(pinnedUnit);
      }
    });

    element.querySelector('#pin-btn')?.addEventListener('click', () => {
      if (pinnedUnit) {
        pinnedUnit = null;
      } else if (hoveredUnit) {
        pinnedUnit = hoveredUnit;
      }
      renderPinnedStats();
      renderUnitStats(hoveredUnit || pinnedUnit);
    });

    element.querySelector('#deck-strip-units')?.addEventListener('click', (e) => {
      const removeBtn = (e.target as HTMLElement).closest('.remove-btn') as HTMLElement;
      if (removeBtn) {
        removeUnit(removeBtn.dataset['removeUnit']!);
      }
    });

    element.querySelector('#close-transport-popup')?.addEventListener('click', () => {
      const popup = element.querySelector('#transport-popup')!;
      const unitId = popup.getAttribute('data-adding-unit');
      if (unitId) {
        // Get quantity for the unit
        const available = getAvailableUnitsForDivision(currentDivisionId);
        const rosterEntry = available.get(unitId);
        const quantity = rosterEntry ? getQuantityForVeterancy(rosterEntry.availability, 0) : 1;

        deckUnits.push({ unitId, veterancy: 0, quantity });
        renderDeckStrip();
        renderUnitLibrary();
        updateStats();
      }
      popup.classList.add('hidden');
    });

    element.querySelector('#close-load-popup')?.addEventListener('click', () => {
      element.querySelector('#load-popup')!.classList.add('hidden');
    });

    element.querySelector('#saved-decks-list')?.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.saved-deck-item') as HTMLElement;
      const deleteBtn = (e.target as HTMLElement).closest('.delete-deck') as HTMLElement;

      if (deleteBtn) {
        e.stopPropagation();
        deleteDeck(deleteBtn.dataset['deleteDeck']!);
      } else if (item) {
        loadDeck(item.dataset['deckId']!);
      }
    });
  };

  return {
    type: ScreenType.DeckBuilder,
    element,
    onEnter,
  };
}

// Export deck loading helper
export function loadSavedDecks(): DeckData[] {
  return JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]');
}
