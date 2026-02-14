/**
 * ArmouryScreen - Full deck construction UI
 */

import { ScreenType, type Screen } from '../core/ScreenManager';
import type { DeckData, DeckUnit, UnitData, UnitCategory, DivisionRosterEntry, UnitAvailability } from '../data/types';
import { FACTIONS, UNITS, getUnitById, getWeaponById, getDivisionById, getDivisionsByFaction } from '../data/factions';
import { GAME_CONSTANTS } from '../data/types';
import { showNotification } from '../core/UINotifications';

export interface ArmouryCallbacks {
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


export function createArmouryScreen(callbacks: ArmouryCallbacks): Screen {
  let currentFactionId = FACTIONS[0]?.id ?? '';
  let currentDivisionId = '';
  let currentCategory: UnitCategory = 'INF';
  let deckUnits: DeckUnit[] = [];
  let activationPoints = 0;
  let pinnedUnit: UnitData | null = null;
  let hoveredUnit: UnitData | null = null;
  let deckName = 'New Deck';

  const element = document.createElement('div');
  element.id = 'armoury-screen';
  element.innerHTML = `
    <div class="armoury-container">
      <div class="deck-header">
        <button class="back-btn" id="db-back-btn">&larr; Back</button>
        <div class="deck-header-center">
          <div class="warning-light"></div>
          <span class="header-diamond">&#9670;</span>
          <h2>ARMOURY MANIFEST</h2>
          <span class="header-diamond">&#9670;</span>
          <div class="warning-light"></div>
        </div>
        <div class="deck-actions">
          <span class="deck-id-label" id="deck-id-label">DECK: NEW DECK</span>
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
          <span>&#10016; ACTIVE DECK</span>
          <div class="deck-strip-right">
            <div class="deck-strip-units" id="deck-strip-units"></div>
            <span class="ap-counter"><span id="ap-display" style="color: var(--amber);">0</span> / ${GAME_CONSTANTS.MAX_ACTIVATION_POINTS} AP</span>
          </div>
          <button class="clear-btn" id="clear-deck-btn">Clear All</button>
        </div>
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
    #armoury-screen {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      z-index: 100;
    }

    #armoury-screen.hidden {
      display: none;
    }

    .armoury-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 10px;
      animation: sectionBootUp 1.0s ease-out both;
    }

    @keyframes sectionBootUp {
      0%   { opacity: 0; transform: translateY(30px); filter: brightness(2.5) blur(6px); }
      30%  { filter: brightness(1.5) blur(2px); }
      100% { opacity: 1; transform: translateY(0); filter: brightness(1) blur(0); }
    }

    /* === HEADER — Gothic panel header === */
    .deck-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 20px;
      background: linear-gradient(90deg, var(--steel-dark), var(--steel-mid), var(--steel-dark));
      border: 1px solid var(--steel-highlight);
      border-bottom: 2px solid var(--gold-dim);
      margin-bottom: 10px;
      position: relative;
    }

    .deck-header::before {
      content: '';
      position: absolute;
      inset: -3px;
      border: 1px solid var(--gold-dim);
      opacity: 0.15;
      pointer-events: none;
    }

    .deck-header-center {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .deck-header h2 {
      color: var(--amber);
      letter-spacing: 4px;
      margin: 0;
      font-family: var(--font-heading);
      font-size: 16px;
      text-shadow: 0 0 12px rgba(255, 136, 0, 0.3);
    }

    .header-diamond {
      color: var(--gold);
      font-size: 8px;
      opacity: 0.6;
    }

    .warning-light {
      width: 8px;
      height: 8px;
      background: var(--amber);
      box-shadow: 0 0 6px var(--amber), 0 0 12px rgba(255, 136, 0, 0.3);
      animation: warningPulse 2s ease-in-out infinite;
    }

    @keyframes warningPulse {
      0%, 100% { opacity: 0.4; box-shadow: 0 0 4px var(--amber); }
      50% { opacity: 1; box-shadow: 0 0 8px var(--amber), 0 0 16px rgba(255, 136, 0, 0.4); }
    }

    .deck-id-label {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--steel-bright);
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .back-btn, .action-btn {
      padding: 6px 14px;
      font-family: var(--font-heading);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      background: linear-gradient(180deg, var(--steel-light), var(--steel-mid));
      border: 1px solid rgba(196, 164, 74, 0.2);
      color: var(--gold);
      cursor: pointer;
      transition: all 0.2s;
    }

    .back-btn:hover, .action-btn:hover {
      background: linear-gradient(180deg, var(--steel-highlight), var(--steel-light));
      border-color: var(--gold);
      color: var(--gold-light);
    }

    .back-btn:focus-visible, .action-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .deck-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    /* === MAIN LAYOUT === */
    .deck-main {
      display: flex;
      flex: 1;
      gap: 10px;
      overflow: hidden;
      min-height: 0;
    }

    /* === SIDEBAR === */
    .deck-sidebar {
      width: 220px;
      background: linear-gradient(175deg, var(--steel-mid), var(--steel-dark));
      border: 1px solid var(--steel-highlight);
      padding: 15px;
      position: relative;
      overflow-y: auto;
    }

    /* Watermark behind sidebar content */
    .deck-sidebar::after {
      content: '\u269C';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 120px;
      color: var(--gold);
      opacity: 0.02;
      pointer-events: none;
      font-family: serif;
    }

    .faction-selection, .division-selection, .deck-name-input {
      margin-bottom: 15px;
    }

    .faction-selection label, .division-selection label, .deck-name-input label {
      display: block;
      font-family: var(--font-heading);
      font-size: 9px;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .faction-selection select, .division-selection select, .deck-name-input input {
      width: 100%;
      padding: 8px;
      background: var(--steel-dark);
      border: 1px solid var(--steel-highlight);
      color: #e0e0e0;
      font-family: var(--font-body);
    }

    .faction-selection select:focus-visible, .division-selection select:focus-visible, .deck-name-input input:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
      border-color: var(--blue-primary);
    }

    .deck-stats {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid var(--steel-highlight);
    }

    .deck-stats .stat {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--steel-bright);
    }

    /* === CONTENT AREA === */
    .deck-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: linear-gradient(175deg, var(--steel-mid), var(--steel-dark));
      border: 1px solid var(--steel-highlight);
      overflow: hidden;
      min-height: 0;
    }

    .category-tabs {
      display: flex;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 2px solid var(--steel-highlight);
    }

    .category-tab {
      padding: 10px 18px;
      background: transparent;
      border: none;
      color: var(--steel-bright);
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--font-heading);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .category-tab:hover {
      color: var(--gold-light);
      background: rgba(196, 164, 74, 0.08);
    }

    .category-tab:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: -2px;
    }

    .category-tab.active {
      color: var(--amber);
      background: rgba(255, 136, 0, 0.1);
      border-bottom: 2px solid var(--amber);
      text-shadow: 0 0 8px rgba(255, 136, 0, 0.3);
    }

    /* === UNIT CARDS — Gothic style with corner brackets === */
    .unit-library {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      align-content: start;
    }

    .unit-card {
      background: linear-gradient(170deg, #1d1d28 0%, #13131c 55%, #191924 100%);
      border: 1px solid var(--blue-dim);
      padding: 14px;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: clip;
      animation: cardBoot 0.7s ease-out both;
    }

    .unit-card:nth-child(1) { animation-delay: 0.1s; }
    .unit-card:nth-child(2) { animation-delay: 0.18s; }
    .unit-card:nth-child(3) { animation-delay: 0.26s; }
    .unit-card:nth-child(4) { animation-delay: 0.34s; }
    .unit-card:nth-child(5) { animation-delay: 0.42s; }
    .unit-card:nth-child(6) { animation-delay: 0.50s; }
    .unit-card:nth-child(7) { animation-delay: 0.58s; }
    .unit-card:nth-child(8) { animation-delay: 0.66s; }

    @keyframes cardBoot {
      0%   { opacity: 0; transform: translateY(18px); filter: brightness(2.5); }
      50%  { filter: brightness(1.3); }
      100% { opacity: 1; transform: translateY(0); filter: brightness(1); }
    }

    .unit-card:hover {
      border-color: var(--blue-primary);
      box-shadow: 0 0 20px rgba(0, 170, 255, 0.12), inset 0 0 12px rgba(0, 170, 255, 0.04);
      transform: translateY(-3px);
    }

    .unit-card:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .unit-card.unavailable {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* Gold inner border (illuminated manuscript) */
    .unit-card::before {
      content: '';
      position: absolute; inset: 3px;
      border: 1px solid var(--gold-dim);
      pointer-events: none;
      opacity: 0.3;
      z-index: 1;
    }

    /* Holographic scan line */
    .unit-card::after {
      content: '';
      position: absolute;
      top: -100%; left: 0; right: 0;
      height: 50%;
      background: linear-gradient(180deg, transparent, rgba(0, 170, 255, 0.025), transparent);
      animation: cardScan 4.5s linear infinite;
      pointer-events: none;
      z-index: 2;
    }

    @keyframes cardScan {
      from { top: -50%; }
      to   { top: 150%; }
    }

    /* Gold corner accents on cards */
    .card-bracket-tr, .card-bracket-bl {
      position: absolute;
      pointer-events: none;
      color: var(--gold);
      font-size: 12px;
      text-shadow: 0 0 6px rgba(196, 164, 74, 0.5);
      opacity: 0.7;
      line-height: 1;
      z-index: 3;
    }
    .card-bracket-tr {
      top: 3px; right: 5px;
    }
    .card-bracket-tr::before { content: '\u2557'; }
    .card-bracket-bl {
      bottom: 3px; left: 5px;
    }
    .card-bracket-bl::before { content: '\u255A'; }

    .unit-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 8px;
      margin-bottom: 6px;
      border-bottom: 1px solid rgba(196, 164, 74, 0.15);
      position: relative;
    }

    .unit-card-name {
      font-family: var(--font-heading);
      font-size: 11px;
      font-weight: 700;
      color: var(--blue-primary);
      letter-spacing: 2px;
      text-transform: uppercase;
      text-shadow: 0 0 8px rgba(0, 170, 255, 0.2);
    }

    .unit-card-name::before, .unit-card-name::after {
      content: '\u269C';
      font-size: 8px;
      color: var(--gold-dim);
      text-shadow: 0 0 4px rgba(196, 164, 74, 0.3);
      margin: 0 4px;
    }

    .unit-card-cost {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: bold;
      color: var(--amber);
      background: linear-gradient(135deg, rgba(255, 136, 0, 0.1), rgba(255, 136, 0, 0.04));
      border: 1px solid var(--amber-dim);
      padding: 3px 10px;
      clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%);
      text-shadow: 0 0 6px rgba(255, 136, 0, 0.3);
      white-space: nowrap;
    }

    .unit-card-cost::before {
      content: '\u25C8';
      font-size: 6px;
      margin-right: 3px;
      opacity: 0.6;
    }

    .unit-card-category {
      font-family: var(--font-heading);
      font-size: 8px;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: 3px;
      padding: 2px 8px;
      background: rgba(196, 164, 74, 0.08);
      border: 1px solid rgba(196, 164, 74, 0.15);
      margin-bottom: 6px;
      display: inline-block;
      text-shadow: 0 0 4px rgba(196, 164, 74, 0.2);
    }

    .unit-card-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--gold-dim), transparent);
      margin: 6px 0;
      position: relative;
    }

    .unit-card-divider::before {
      content: '\u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7 \u00B7';
      position: absolute;
      top: -4px; left: 0; right: 0;
      font-size: 6px;
      color: var(--gold-dim);
      opacity: 0.3;
      letter-spacing: 2px;
      text-align: center;
      overflow: hidden;
      white-space: nowrap;
      height: 6px;
    }

    .unit-card-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 12px;
      margin-bottom: 8px;
      font-size: 11px;
    }

    .card-stat {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3px 4px;
      border-bottom: 1px solid rgba(196, 164, 74, 0.06);
      position: relative;
    }

    .card-stat::before {
      content: '\u203A';
      position: absolute;
      left: -2px;
      font-size: 9px;
      color: var(--gold-dim);
      opacity: 0.5;
    }

    .card-stat-label {
      font-family: var(--font-heading);
      font-size: 8px;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: 2px;
      text-shadow: 0 0 4px rgba(196, 164, 74, 0.2);
    }

    .card-stat-value {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: bold;
      color: var(--cyan);
      text-shadow: 0 0 6px rgba(0, 255, 204, 0.3);
    }

    .unit-card-weapon {
      margin-top: 6px;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--gold-light);
      letter-spacing: 0.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .unit-card-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .unit-tag {
      font-family: var(--font-heading);
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 2px 8px;
      background: linear-gradient(135deg, rgba(196, 164, 74, 0.08), rgba(196, 164, 74, 0.03));
      border: 1px solid rgba(196, 164, 74, 0.25);
      color: var(--gold);
      clip-path: polygon(4px 0, calc(100% - 4px) 0, 100% 50%, calc(100% - 4px) 100%, 4px 100%, 0 50%);
      text-shadow: 0 0 4px rgba(196, 164, 74, 0.2);
    }

    .unit-card-availability {
      margin-top: 6px;
      font-size: 10px;
      color: var(--steel-bright);
      font-family: var(--font-mono);
    }

    /* === STATS PANEL (right) === */
    .deck-right {
      width: 280px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
    }

    .stats-panel {
      flex: 1;
      background: linear-gradient(175deg, var(--steel-mid), var(--steel-dark));
      border: 1px solid var(--steel-highlight);
      padding: 15px;
      overflow-y: auto;
      position: relative;
    }

    .stats-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--steel-highlight);
    }

    #stats-title {
      font-family: var(--font-heading);
      font-size: 11px;
      font-weight: 700;
      color: var(--amber);
      letter-spacing: 3px;
      text-transform: uppercase;
    }

    .pin-btn {
      padding: 4px 10px;
      font-family: var(--font-heading);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      background: linear-gradient(180deg, var(--steel-light), var(--steel-mid));
      border: 1px solid var(--steel-highlight);
      color: var(--gold);
      cursor: pointer;
    }

    .pin-btn:hover {
      border-color: var(--gold);
      color: var(--gold-light);
    }

    .pin-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .pin-btn.pinned {
      background: rgba(0, 170, 255, 0.2);
      border-color: var(--blue-primary);
      color: var(--blue-primary);
    }

    .stats-content {
      font-size: 12px;
      line-height: 1.8;
    }

    .stats-content .placeholder {
      color: var(--steel-bright);
      text-align: center;
      padding: 20px;
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 1px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }

    .stat-label {
      color: var(--steel-bright);
      font-family: var(--font-heading);
      font-size: 10px;
      letter-spacing: 1px;
    }

    .stat-value {
      color: var(--cyan);
      font-family: var(--font-mono);
    }

    .stat-section {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--steel-highlight);
    }

    .stat-section-title {
      font-family: var(--font-heading);
      font-size: 9px;
      font-weight: 700;
      color: var(--amber);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .pinned-stats {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 2px solid var(--amber-dim);
    }

    .pinned-stats.hidden {
      display: none;
    }

    .pinned-header {
      font-family: var(--font-heading);
      font-size: 11px;
      color: var(--amber);
      margin-bottom: 10px;
      letter-spacing: 2px;
    }

    /* === DECK STRIP — Bottom bar === */
    .deck-strip {
      background: linear-gradient(90deg, var(--steel-dark), var(--steel-mid), var(--steel-dark));
      border: 1px solid var(--steel-highlight);
      border-top: 2px solid var(--gold-dim);
      margin-top: 10px;
      padding: 10px 16px;
    }

    .deck-strip-header {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .deck-strip-header > span {
      font-family: var(--font-heading);
      font-size: 11px;
      font-weight: 700;
      color: var(--amber);
      letter-spacing: 2px;
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .deck-strip-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .ap-counter {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: bold;
      color: var(--steel-bright);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .clear-btn {
      padding: 4px 12px;
      font-family: var(--font-heading);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      background: rgba(255, 34, 0, 0.15);
      border: 1px solid rgba(255, 34, 0, 0.4);
      color: var(--red-glow);
      cursor: pointer;
      flex-shrink: 0;
    }

    .clear-btn:hover {
      background: rgba(255, 34, 0, 0.3);
      border-color: var(--red-glow);
    }

    .clear-btn:focus-visible {
      outline: 2px solid var(--red-glow);
      outline-offset: 2px;
    }

    .deck-strip-units {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      flex: 1;
    }

    .deck-unit-chip {
      font-family: var(--font-mono);
      font-size: 9px;
      padding: 3px 9px;
      background: rgba(0, 170, 255, 0.05);
      border: 1px solid var(--blue-dim);
      color: var(--blue-primary);
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.2s;
      clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%);
    }

    .deck-unit-chip:hover {
      background: rgba(0, 170, 255, 0.15);
      border-color: var(--blue-primary);
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
      background: linear-gradient(175deg, var(--steel-mid), var(--steel-dark));
      border: 1px solid var(--gold-dim);
      padding: 20px;
      min-width: 300px;
      max-width: 500px;
      position: relative;
    }

    .popup-content::before {
      content: '';
      position: absolute;
      inset: -3px;
      border: 1px solid var(--gold-dim);
      opacity: 0.15;
      pointer-events: none;
    }

    .popup-content h3 {
      margin: 0 0 15px 0;
      color: var(--amber);
      font-family: var(--font-heading);
      letter-spacing: 3px;
      text-transform: uppercase;
      font-size: 14px;
      text-shadow: 0 0 8px rgba(255, 136, 0, 0.3);
    }

    .popup-close {
      width: 100%;
      padding: 10px 20px;
      margin-top: 15px;
      background: linear-gradient(180deg, var(--steel-light), var(--steel-mid));
      border: 1px solid var(--steel-highlight);
      color: var(--gold);
      cursor: pointer;
      font-family: var(--font-heading);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%);
    }

    .popup-close:hover {
      background: linear-gradient(180deg, var(--steel-highlight), var(--steel-light));
      border-color: var(--gold);
      color: var(--gold-light);
    }

    .popup-close:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .transport-option {
      padding: 10px;
      margin: 5px 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--steel-highlight);
      cursor: pointer;
    }

    .transport-option:hover {
      background: rgba(0, 170, 255, 0.2);
      border-color: var(--blue-primary);
    }

    .transport-option:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .saved-deck-item {
      padding: 10px;
      margin: 5px 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--steel-highlight);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
    }

    .saved-deck-item:hover {
      background: rgba(0, 170, 255, 0.2);
      border-color: var(--blue-primary);
    }

    .saved-deck-item:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .saved-deck-item .delete-deck {
      color: var(--red-glow);
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

    // Only show units available in the current division
    const categoryUnits = UNITS.filter(u => u.category === currentCategory && available.has(u.id));

    library.innerHTML = categoryUnits.map(unit => {
      const availability = available.get(unit.id)!;
      const usedCount = getUsedCount(unit.id);
      const totalAvail = getTotalAvailability(availability.availability);
      const remaining = totalAvail - usedCount;
      const primaryWeapon = unit.weapons.length > 0 ? getWeaponById(unit.weapons[0]!.weaponId) : undefined;

      return `
        <div class="unit-card ${remaining <= 0 ? 'unavailable' : ''}"
             data-unit-id="${sanitizeHTML(unit.id)}"
             ${remaining > 0 ? 'tabindex="0"' : 'data-unavailable="true"'}>
          <div class="card-bracket-tr"></div>
          <div class="card-bracket-bl"></div>
          <div class="unit-card-header">
            <span class="unit-card-name">${sanitizeHTML(unit.name)}</span>
            <span class="unit-card-cost">${sanitizeHTML(unit.cost)}</span>
          </div>
          <div class="unit-card-category">[${sanitizeHTML(unit.category)}]</div>
          <div class="unit-card-divider"></div>
          <div class="unit-card-stats">
            <div class="card-stat">
              <span class="card-stat-label">HP</span>
              <span class="card-stat-value">${sanitizeHTML(unit.health)}</span>
            </div>
            <div class="card-stat">
              <span class="card-stat-label">SPD</span>
              <span class="card-stat-value">${sanitizeHTML(unit.speed.road)}</span>
            </div>
            <div class="card-stat">
              <span class="card-stat-label">ARM</span>
              <span class="card-stat-value">${sanitizeHTML(unit.armor.front)}</span>
            </div>
            <div class="card-stat">
              <span class="card-stat-label">RNG</span>
              <span class="card-stat-value">${primaryWeapon ? sanitizeHTML(primaryWeapon.range) + 'm' : '—'}</span>
            </div>
          </div>
          <div class="unit-card-weapon">
            ${primaryWeapon ? sanitizeHTML(primaryWeapon.name) : '—'}
          </div>
          <div class="unit-card-tags">
            ${unit.tags.slice(0, 3).map(t => `<span class="unit-tag">+ ${sanitizeHTML(t)}</span>`).join('')}
          </div>
          <div class="unit-card-availability">
            Available: ${sanitizeHTML(remaining)}/${sanitizeHTML(totalAvail)}
          </div>
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
        <span class="stat-value" style="color: var(--amber)">${sanitizeHTML(unit.cost)}</span>
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
          <span class="stat-value" style="color: var(--amber)">Yes</span>
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
      strip.innerHTML = '<p style="color: #aaa; padding: 10px;">Add units from the library above</p>';
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

      return `
        <div class="deck-unit-chip" data-unit-id="${sanitizeHTML(unitId)}">
          <button class="remove-btn" data-remove-unit="${sanitizeHTML(unitId)}" style="background:none;border:none;color:var(--red-glow);cursor:pointer;font-size:12px;margin-right:4px;padding:0;">&times;</button>
          ${sanitizeHTML(unit.name)}${data.count > 1 ? ` x${sanitizeHTML(data.count)}` : ''}
        </div>
      `;
    }).join('');
  }

  function updateStats(): void {
    activationPoints = calculateTotalAP();
    const totalCost = calculateTotalCost();

    (element.querySelector('#ap-used') as HTMLElement).textContent = activationPoints.toString();
    (element.querySelector('#total-cost') as HTMLElement).textContent = totalCost.toString();
    (element.querySelector('#unit-count') as HTMLElement).textContent = deckUnits.reduce((sum, u) => sum + (u.quantity || 1), 0).toString();

    // Color AP if over limit
    const apEl = element.querySelector('#ap-used') as HTMLElement;
    const overLimit = activationPoints > GAME_CONSTANTS.MAX_ACTIVATION_POINTS;
    apEl.style.color = overLimit ? 'var(--red-glow)' : '#e0e0e0';

    // Sync deck strip AP display
    const apDisplay = element.querySelector('#ap-display') as HTMLElement | null;
    if (apDisplay) {
      apDisplay.textContent = activationPoints.toString();
      apDisplay.style.color = overLimit ? 'var(--red-glow)' : 'var(--amber)';
    }

    // Sync deck ID label in header
    const deckIdLabel = element.querySelector('#deck-id-label') as HTMLElement | null;
    if (deckIdLabel) {
      const nameInput = element.querySelector('#deck-name') as HTMLInputElement;
      deckIdLabel.textContent = `DECK: ${(nameInput.value || 'NEW DECK').toUpperCase()}`;
    }
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
      <div class="transport-option" data-transport-id="${sanitizeHTML(t.id)}" tabindex="0">
        ${sanitizeHTML(t.name)} (${sanitizeHTML(t.transportCapacity)} slots, ${sanitizeHTML(t.cost)}c)
      </div>
    `).join('');

    // Store the unit being added
    popup.setAttribute('data-adding-unit', unitId);
    popup.classList.remove('hidden');

    // Bind transport selection
    options.querySelectorAll('.transport-option').forEach(opt => {
      const selectTransport = () => {
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
      };

      opt.addEventListener('click', selectTransport);
      opt.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          selectTransport();
        }
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
    let savedDecks: DeckData[];
    try {
      savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]');
    } catch {
      savedDecks = [];
    }
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

    let savedDecks: DeckData[];
    try {
      savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]') as DeckData[];
    } catch {
      savedDecks = [];
    }

    if (savedDecks.length === 0) {
      list.innerHTML = '<p style="color: #bbb; text-align: center;">No saved decks</p>';
    } else {
      list.innerHTML = savedDecks.map(d => `
        <div class="saved-deck-item" data-deck-id="${sanitizeHTML(d.id)}" tabindex="0">
          <span>${sanitizeHTML(d.name)} (${sanitizeHTML(d.units.reduce((sum: number, u: {quantity?: number}) => sum + (u.quantity || 1), 0))} units)</span>
          <span class="delete-deck" data-delete-deck="${sanitizeHTML(d.id)}">&times;</span>
        </div>
      `).join('');
    }

    popup.classList.remove('hidden');
  }

  function loadDeck(deckId: string): void {
    let savedDecks: DeckData[];
    try {
      savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]') as DeckData[];
    } catch {
      savedDecks = [];
    }
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
    let savedDecks: DeckData[];
    try {
      savedDecks = JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]') as DeckData[];
    } catch {
      savedDecks = [];
    }
    const filtered = savedDecks.filter((d: DeckData) => d.id !== deckId);
    localStorage.setItem('stellarSiege_decks', JSON.stringify(filtered));
    showLoadPopup();
  }

  let escHandler: ((e: KeyboardEvent) => void) | null = null;

  const onEnter = () => {
    renderFactionSelect();
    renderDivisionSelect();
    renderCategoryTabs();
    renderUnitLibrary();
    renderDeckStrip();
    updateStats();

    // ESC key to go back
    escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        callbacks.onBack();
      }
    };
    document.addEventListener('keydown', escHandler);

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

    element.querySelector('#deck-name')?.addEventListener('input', () => {
      updateStats(); // Syncs deck-id-label in header
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

    element.querySelector('#unit-library')?.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        const card = (e.target as HTMLElement).closest('.unit-card') as HTMLElement;
        if (card && !card.dataset['unavailable']) {
          e.preventDefault();
          addUnit(card.dataset['unitId']!);
        }
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

    element.querySelector('#saved-decks-list')?.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        const item = (e.target as HTMLElement).closest('.saved-deck-item') as HTMLElement;
        if (item) {
          e.preventDefault();
          loadDeck(item.dataset['deckId']!);
        }
      }
    });
  };

  const onExit = () => {
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  };

  return {
    type: ScreenType.Armoury,
    element,
    onEnter,
    onExit,
  };
}

// Export deck loading helper
export function loadSavedDecks(): DeckData[] {
  try {
    return JSON.parse(localStorage.getItem('stellarSiege_decks') || '[]');
  } catch {
    return [];
  }
}
