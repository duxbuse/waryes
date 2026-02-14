/**
 * SkirmishSetupScreen - Setup screen before battle
 */

import { ScreenType, type Screen } from '../core/ScreenManager';
import type { GameMap, DeckData, MapSize, BiomeType } from '../data/types';
import { loadSavedDecks } from './ArmouryScreen';
import { STARTER_DECKS } from '../data/starterDecks';
import { BIOME_CONFIGS } from '../data/biomeConfigs';
import { getUsername, isAuthenticated } from '../api/ApiClient';

// Create a default deck for quick start using valid SDF units
function createDefaultDeck(): DeckData {
  // Use the first starter deck as default (SDF 7th Mechanized)
  const starterDeck = STARTER_DECKS[0];
  if (starterDeck) {
    return { ...starterDeck, id: 'default_deck', name: 'Quick Start Deck' };
  }

  // Fallback to hardcoded valid SDF units (matches 7th Mechanized starter deck)
  return {
    id: 'default_deck',
    name: 'Quick Start Deck',
    divisionId: 'sdf_7th_mechanized',
    units: [
      { unitId: 'sdf_trooper', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_trooper', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_militia', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_hwt_heavy_bolter', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_hwt_missile', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_field_gun_bombast', veterancy: 0, quantity: 1 },
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0, quantity: 1 },
    ],
    activationPoints: 24,
  };
}

export type SlotType = 'YOU' | 'CPU' | 'OPEN' | 'CLOSED';
export type CPUDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface PlayerSlot {
  type: SlotType;
  difficulty: CPUDifficulty;
  deckId?: string;
}

export interface SkirmishConfig {
  deck: DeckData | null;
  mapSize: MapSize;
  mapSeed: number;
  biome?: BiomeType;  // Optional biome override (undefined = auto-select from seed)
  team1: PlayerSlot[];
  team2: PlayerSlot[];
  existingMap?: GameMap;
}

export interface SkirmishSetupCallbacks {
  onBack: () => void;
  onStartBattle: (config: SkirmishConfig) => void;
  onHostOnline: (config: SkirmishConfig) => Promise<string | null>;
  onCancelHosting: () => void;
}

// Generate a stable guest name for unauthenticated players
const guestId = Math.floor(Math.random() * 900) + 100;

function getPlayerDisplayName(): string {
  if (isAuthenticated()) {
    return getUsername() ?? `Guest-${guestId}`;
  }
  return `Guest-${guestId}`;
}

export function createSkirmishSetupScreen(callbacks: SkirmishSetupCallbacks): Screen {
  // Default to Quick Start deck
  let selectedDeck: DeckData | null = createDefaultDeck();
  let mapSize: MapSize = 'medium';
  let mapSeed = Math.floor(Math.random() * 999999);
  let selectedBiome: BiomeType | undefined = undefined;  // undefined = auto-select from seed
  let generatedMap: GameMap | null = null;
  let isGeneratingMap = false;
  let isHosting = false;
  let hostedGameCode: string | null = null;

  // Team configuration (5v5 format)
  let team1: PlayerSlot[] = [
    { type: 'YOU', difficulty: 'Medium' },
    { type: 'CPU', difficulty: 'Medium' },
    { type: 'CPU', difficulty: 'Medium' },
    { type: 'CLOSED', difficulty: 'Medium' },
    { type: 'CLOSED', difficulty: 'Medium' },
  ];
  let team2: PlayerSlot[] = [
    { type: 'CPU', difficulty: 'Medium' },
    { type: 'CPU', difficulty: 'Medium' },
    { type: 'CPU', difficulty: 'Medium' },
    { type: 'CLOSED', difficulty: 'Medium' },
    { type: 'CLOSED', difficulty: 'Medium' },
  ];

  const element = document.createElement('div');
  element.id = 'skirmish-setup-screen';
  element.innerHTML = `
    <div class="skirmish-container">
      <div class="skirmish-header">
        <button class="back-btn" id="skirmish-back-btn">&larr; Back</button>
        <h2>SKIRMISH SETUP</h2>
        <div class="game-code-display hidden" id="game-code-display">
          <span class="code-label">CODE:</span>
          <span class="code-value" id="game-code-value">----</span>
          <button class="code-copy-btn" id="code-copy-btn" title="Copy game code">COPY</button>
        </div>
      </div>
      <div class="gothic-divider" style="align-self: center;">
        <div class="line"></div>
        <span class="sym">&#10016;</span>
        <span class="sym">&#9880;</span>
        <span class="sym">&#10016;</span>
        <div class="line"></div>
      </div>

      <div class="skirmish-content">
        <div class="teams-row">
          <div class="setup-section team-section">
            <div class="corner-flourish tl"><div class="diamond"></div></div>
            <div class="corner-flourish tr"><div class="diamond"></div></div>
            <div class="corner-flourish bl"><div class="diamond"></div></div>
            <div class="corner-flourish br"><div class="diamond"></div></div>
            <h3>Team 1 (Defenders)</h3>
            <div id="team1-slots" class="team-slots"></div>
          </div>
          <div class="setup-section team-section">
            <div class="corner-flourish tl"><div class="diamond"></div></div>
            <div class="corner-flourish tr"><div class="diamond"></div></div>
            <div class="corner-flourish bl"><div class="diamond"></div></div>
            <div class="corner-flourish br"><div class="diamond"></div></div>
            <h3>Team 2 (Attackers)</h3>
            <div id="team2-slots" class="team-slots"></div>
          </div>
        </div>

        <div class="config-row">
          <div class="setup-section">
            <h3>Deck Info</h3>
            <div id="deck-preview" class="deck-preview">
              <p class="placeholder">Select a deck to see details</p>
            </div>
          </div>

          <div class="setup-section">
            <h3>Map Settings</h3>
            <div class="setting-row">
              <label>Map Size:</label>
              <div class="size-buttons">
                <button class="size-btn" data-size="small">Small (300m)</button>
                <button class="size-btn active" data-size="medium">Medium (1km)</button>
                <button class="size-btn" data-size="large">Large (10km)</button>
              </div>
            </div>
            <div class="setting-row">
              <label>Map Seed:</label>
              <div class="seed-input-row">
                <input type="number" id="map-seed" class="seed-input" value="${mapSeed}" />
                <button id="random-seed-btn" class="random-btn">Random</button>
              </div>
            </div>
            <div class="setting-row">
              <label>Biome:</label>
              <select id="biome-select" class="biome-select">
                <option value="">Auto (From Seed)</option>
                <option value="rainforest">Rainforest</option>
                <option value="tundra">Tundra</option>
                <option value="mesa">Mesa</option>
                <option value="mountains">Mountains</option>
                <option value="plains">Plains</option>
                <option value="farmland">Farmland</option>
                <option value="cities">Urban</option>
              </select>
            </div>
          </div>

          <div class="setup-section map-preview-section">
            <h3>Map Preview</h3>
            <div id="map-preview" class="map-preview">
              <canvas id="preview-canvas" width="200" height="200"></canvas>
              <div id="map-loading" class="map-preview-loading hidden">
                <div class="loading-spinner"></div>
                <span>Generating...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-divider">
        <div class="gothic-divider" style="max-width: none; width: 80%; margin: 0 auto;">
          <div class="line"></div>
          <span class="sym">&#9876;</span>
          <div class="line"></div>
        </div>
      </div>
      <div class="skirmish-footer">
        <button id="skirmish-host-online-btn" class="host-online-btn">
          &#9884; HOST ONLINE &#9884;
        </button>
        <button id="skirmish-start-btn" class="start-btn" disabled>
          &#9884; START BATTLE &#9884;
        </button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #skirmish-setup-screen {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      z-index: 100;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    #skirmish-setup-screen.hidden {
      display: none;
    }

    .skirmish-container {
      width: 90%;
      max-width: 900px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background: linear-gradient(175deg, var(--steel-mid), var(--steel-dark));
      border: 1px solid var(--steel-highlight);
      padding: 20px;
      box-sizing: border-box;
      position: relative;
      animation: sectionBootUp 1.0s ease-out both;
      overflow: hidden;
    }

    /* Outer gold frame */
    .skirmish-container::before {
      content: '';
      position: absolute;
      inset: -3px;
      border: 1px solid var(--gold-dim);
      opacity: 0.15;
      pointer-events: none;
    }

    /* Watermark */
    .skirmish-container::after {
      content: '\u269C';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 200px;
      color: var(--gold);
      opacity: 0.015;
      pointer-events: none;
      font-family: serif;
    }

    @keyframes sectionBootUp {
      0%   { opacity: 0; transform: translateY(30px); filter: brightness(2.5) blur(6px); }
      30%  { filter: brightness(1.5) blur(2px); }
      100% { opacity: 1; transform: translateY(0); filter: brightness(1) blur(0); }
    }

    .skirmish-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--gold-dim);
      position: relative;
    }

    .skirmish-header h2 {
      color: var(--amber);
      font-family: var(--font-heading);
      letter-spacing: 4px;
      margin: 0;
      font-size: 18px;
      text-shadow: 0 0 12px rgba(255, 136, 0, 0.3);
    }

    .back-btn {
      padding: 6px 16px;
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
      clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%);
    }

    .back-btn:hover {
      background: linear-gradient(180deg, var(--steel-highlight), var(--steel-light));
      border-color: var(--gold);
      color: var(--gold-light);
    }

    .back-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .skirmish-content {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 15px;
      overflow-y: auto;
      min-height: 0;
      max-height: calc(90vh - 180px);
    }

    .teams-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }

    .config-row {
      display: grid;
      grid-template-columns: 1fr 1fr 200px;
      gap: 15px;
    }

    .setup-section {
      background: linear-gradient(175deg, rgba(42, 42, 48, 0.9), rgba(26, 26, 32, 0.95));
      border: 1px solid var(--steel-highlight);
      padding: 15px;
      position: relative;
    }

    /* Gold inner frame on setup sections */
    .setup-section::before {
      content: '';
      position: absolute;
      inset: 3px;
      border: 1px solid var(--gold-dim);
      opacity: 0.12;
      pointer-events: none;
    }

    .team-section {
      min-height: 150px;
    }

    .team-slots {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .slot-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--steel-light);
      font-size: 13px;
      min-height: 50px;
    }

    .slot-row.you {
      background: rgba(0, 170, 255, 0.15);
      border: 1px solid rgba(0, 170, 255, 0.4);
    }

    .slot-row.cpu {
      background: rgba(255, 180, 50, 0.1);
      border-color: var(--amber-dim);
    }

    .slot-row.closed {
      background: rgba(50, 50, 50, 0.3);
      border-color: var(--steel-light);
      opacity: 0.5;
    }

    .slot-number {
      width: 20px;
      font-family: var(--font-mono);
      color: #bbb;
      font-weight: bold;
    }

    .slot-type {
      flex: 1;
      font-family: var(--font-mono);
      color: #e0e0e0;
    }

    .slot-type.you {
      color: var(--blue-primary);
      font-weight: bold;
    }

    .slot-type.cpu {
      color: #ffb432;
    }

    .slot-type.closed {
      color: #aaa;
    }

    .slot-controls {
      display: flex;
      gap: 4px;
    }

    .slot-btn {
      padding: 4px 8px;
      font-size: 11px;
      font-family: var(--font-mono);
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--steel-highlight);
      color: #aaa;
      cursor: pointer;
    }

    .slot-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }

    .slot-btn.active {
      background: rgba(0, 170, 255, 0.3);
      border-color: var(--blue-primary);
      color: var(--blue-primary);
    }

    .slot-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .difficulty-select {
      padding: 3px 6px;
      font-size: 11px;
      font-family: var(--font-mono);
      background: var(--steel-dark);
      border: 1px solid var(--steel-highlight);
      color: #e0e0e0;
      cursor: pointer;
    }

    .difficulty-select:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .deck-select {
      padding: 3px 6px;
      font-size: 10px;
      font-family: var(--font-mono);
      background: var(--steel-dark);
      border: 1px solid var(--steel-highlight);
      color: #e0e0e0;
      cursor: pointer;
      max-width: 120px;
    }

    .deck-select:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .setup-section h3 {
      margin: 0 0 15px 0;
      font-family: var(--font-heading);
      font-size: 11px;
      font-weight: 700;
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 3px;
      text-shadow: 0 0 8px rgba(196, 164, 74, 0.3);
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(196, 164, 74, 0.15);
    }

    .setup-section h3::before {
      content: '\u2720 ';
      font-size: 10px;
      opacity: 0.6;
    }

    .setup-section h3::after {
      content: ' \u2720';
      font-size: 10px;
      opacity: 0.6;
    }

    .setup-select {
      width: 100%;
      padding: 10px;
      background: var(--steel-dark);
      border: 1px solid var(--steel-highlight);
      color: #e0e0e0;
      font-size: 14px;
      font-family: var(--font-body);
      cursor: pointer;
    }

    .setup-select:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .biome-select {
      width: 100%;
      padding: 10px;
      background: var(--steel-dark);
      border: 1px solid var(--steel-highlight);
      color: #e0e0e0;
      font-size: 14px;
      font-family: var(--font-body);
      cursor: pointer;
    }

    .biome-select:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .deck-preview {
      margin-top: 15px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--steel-light);
      min-height: 100px;
      max-height: 150px;
      overflow-y: auto;
    }

    .deck-preview .placeholder {
      font-family: var(--font-body);
      color: #aaa;
      text-align: center;
      padding: 20px;
    }

    .deck-info {
      font-size: 12px;
      line-height: 1.8;
    }

    .deck-info .label {
      font-family: var(--font-heading);
      font-size: 9px;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .deck-info .value {
      font-family: var(--font-mono);
      color: var(--cyan);
      text-shadow: 0 0 6px rgba(0, 255, 204, 0.2);
    }

    .setting-row {
      margin-bottom: 15px;
    }

    .setting-row label {
      display: block;
      font-family: var(--font-heading);
      font-size: 9px;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .size-buttons {
      display: flex;
      gap: 8px;
    }

    .size-btn {
      flex: 1;
      padding: 10px;
      font-family: var(--font-mono);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--steel-highlight);
      color: var(--steel-bright);
      cursor: pointer;
      transition: all 0.2s;
      font-size: 12px;
    }

    .size-btn:hover {
      background: rgba(0, 170, 255, 0.1);
      border-color: var(--blue-primary);
      color: #e0e0e0;
    }

    .size-btn.active {
      background: rgba(0, 170, 255, 0.2);
      border-color: var(--blue-primary);
      color: var(--blue-primary);
      text-shadow: 0 0 8px rgba(0, 170, 255, 0.3);
    }

    .size-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .seed-input-row {
      display: flex;
      gap: 10px;
    }

    .seed-input {
      flex: 1;
      padding: 10px;
      font-family: var(--font-mono);
      background: var(--steel-dark);
      border: 1px solid var(--steel-highlight);
      color: #e0e0e0;
      font-size: 14px;
    }

    .seed-input:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .random-btn {
      padding: 10px 20px;
      font-family: var(--font-heading);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      background: linear-gradient(180deg, var(--steel-light), var(--steel-mid));
      border: 1px solid var(--steel-highlight);
      color: var(--gold);
      cursor: pointer;
    }

    .random-btn:hover {
      background: linear-gradient(180deg, var(--steel-highlight), var(--steel-light));
      border-color: var(--gold);
      color: var(--gold-light);
    }

    .random-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .map-preview-section {
      display: flex;
      flex-direction: column;
    }

    .map-preview {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #0a0a1a;
      border: 1px solid var(--steel-light);
    }

    .footer-divider {
      margin-top: 16px;
      margin-bottom: 12px;
    }

    .skirmish-footer {
      display: flex;
      gap: 15px;
      justify-content: center;
      flex-shrink: 0;
      padding-bottom: 10px;
    }

    .start-btn {
      padding: 0 50px;
      height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-heading);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      background: linear-gradient(180deg, rgba(0, 170, 255, 0.3), rgba(0, 136, 221, 0.2));
      border: 1px solid var(--blue-primary);
      color: var(--blue-glow);
      cursor: pointer;
      transition: all 0.2s;
      clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%);
      text-shadow: 0 0 8px rgba(0, 170, 255, 0.4);
    }

    .start-btn:hover:not(:disabled) {
      background: linear-gradient(180deg, rgba(0, 170, 255, 0.5), rgba(0, 136, 221, 0.3));
      box-shadow: 0 0 20px rgba(0, 170, 255, 0.3);
      color: #fff;
    }

    .start-btn:disabled {
      background: linear-gradient(180deg, var(--steel-light), var(--steel-mid));
      border-color: var(--steel-highlight);
      color: var(--steel-bright);
      cursor: not-allowed;
    }

    .start-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .start-btn.loading {
      opacity: 0.7;
      pointer-events: none;
    }

    .button-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top: 2px solid #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 10px;
      vertical-align: middle;
    }

    .host-online-btn {
      padding: 0 50px;
      height: 48px;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: var(--font-heading);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      background: linear-gradient(180deg, rgba(255, 136, 0, 0.3), rgba(255, 136, 0, 0.15));
      border: 1px solid var(--amber);
      color: var(--amber-light);
      cursor: pointer;
      transition: all 0.2s;
      clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%);
      text-shadow: 0 0 8px rgba(255, 136, 0, 0.4);
    }

    .host-online-btn:hover {
      background: linear-gradient(180deg, rgba(255, 136, 0, 0.5), rgba(255, 136, 0, 0.25));
      box-shadow: 0 0 20px rgba(255, 136, 0, 0.3);
      color: #fff;
    }

    .host-online-btn:focus-visible {
      outline: 2px solid var(--amber);
      outline-offset: 2px;
    }

    .host-online-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .host-online-btn.hosting {
      background: linear-gradient(180deg, rgba(0, 255, 136, 0.25), rgba(0, 200, 100, 0.12));
      border: 1px solid var(--cyan);
      color: var(--cyan);
      text-shadow: 0 0 8px rgba(0, 255, 204, 0.4);
      cursor: pointer;
    }

    .host-cancel-hint {
      display: block;
      font-size: 8px;
      letter-spacing: 1px;
      opacity: 0.5;
      margin-top: 2px;
      text-shadow: none;
    }

    .game-code-display {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
    }

    .game-code-display.hidden {
      visibility: hidden;
    }

    .game-code-display .code-label {
      color: var(--gold-dim);
      letter-spacing: 2px;
      font-size: 9px;
      text-transform: uppercase;
    }

    .game-code-display .code-value {
      color: var(--amber);
      font-size: 14px;
      letter-spacing: 3px;
      text-shadow: 0 0 8px rgba(255, 136, 0, 0.4);
    }

    .game-code-display .code-copy-btn {
      padding: 3px 8px;
      font-size: 9px;
      font-family: var(--font-mono);
      letter-spacing: 1px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--steel-highlight);
      color: var(--steel-bright);
      cursor: pointer;
      transition: all 0.2s;
    }

    .game-code-display .code-copy-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: var(--gold);
      border-color: var(--gold-dim);
    }

    .slot-row.open {
      background: rgba(0, 255, 136, 0.08);
      border: 1px dashed rgba(0, 255, 204, 0.3);
    }

    .slot-type.open {
      color: var(--cyan);
      font-style: italic;
    }

    .map-preview {
      position: relative;
    }

    .map-preview-loading {
      position: absolute;
      top: 10%;
      left: 10%;
      width: 80%;
      height: 80%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 10px;
      color: #fff;
      font-size: 14px;
      backdrop-filter: blur(4px);
      transition: opacity 0.2s;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 10;
    }

    .map-preview-loading.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .loading-spinner {
      width: 30px;
      height: 30px;
      border: 3px solid rgba(0, 170, 255, 0.3);
      border-top: 3px solid var(--blue-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  function getDeckOptionsHTML(selectedId?: string): string {
    const savedDecks = loadSavedDecks();

    // Group starter decks by faction
    const sdfStarters = STARTER_DECKS.filter(d => d.id.includes('sdf'));
    const vanguardStarters = STARTER_DECKS.filter(d => d.id.includes('vanguard'));

    const isDefault = selectedId === 'default_deck';

    return `
      <option value="">-- Select a deck --</option>
      <option value="default" ${isDefault ? 'selected' : ''}>Quick Start (Default Deck)</option>
      <optgroup label="SDF Starter Decks">
        ${sdfStarters.map(d => `<option value="${d.id}" ${selectedId === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
      </optgroup>
      <optgroup label="Vanguard Starter Decks">
        ${vanguardStarters.map(d => `<option value="${d.id}" ${selectedId === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
      </optgroup>
      ${savedDecks.length > 0 ? `
        <optgroup label="My Decks">
          ${savedDecks.map(d => {
            const safeName = d.name.replace(/[<>&"']/g, (c: string) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
            const safeId = String(d.id).replace(/[<>&"']/g, (c: string) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
            return `<option value="${safeId}" ${selectedId === d.id ? 'selected' : ''}>${safeName}</option>`;
          }).join('')}
        </optgroup>
      ` : ''}
    `;
  }

  // Remove the old renderDeckSelect function as it's no longer needed
  // function renderDeckSelect(): void { ... }

  function renderTeamSlots(): void {
    const team1Container = element.querySelector('#team1-slots')!;
    const team2Container = element.querySelector('#team2-slots')!;

    function renderSlot(slot: PlayerSlot, index: number, teamNum: 1 | 2): string {
      const isYou = slot.type === 'YOU';
      const isCpu = slot.type === 'CPU';
      const isOpen = slot.type === 'OPEN';

      const slotClass = isYou ? 'you' : isCpu ? 'cpu' : isOpen ? 'open' : 'closed';
      const typeLabel = isYou ? getPlayerDisplayName() : isCpu ? `CPU (${slot.difficulty})` : isOpen ? 'OPEN SLOT' : 'CLOSED';

      let controls = '';
      if (isYou) {
        controls = `
          <div class="slot-controls">
            <select id="your-deck-select" class="deck-select" style="max-width: 200px;">
              ${getDeckOptionsHTML(selectedDeck?.id)}
            </select>
          </div>
        `;
      } else if (isCpu) {
        controls = `
          <div class="slot-controls">
              <button class="slot-btn" data-team="${teamNum}" data-slot="${index}" data-action="open">OPEN</button>
              <button class="slot-btn active" data-team="${teamNum}" data-slot="${index}" data-action="cpu">CPU</button>
              <select class="difficulty-select" data-team="${teamNum}" data-slot="${index}">
                  <option value="Easy" ${slot.difficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                  <option value="Medium" ${slot.difficulty === 'Medium' ? 'selected' : ''}>Medium</option>
                  <option value="Hard" ${slot.difficulty === 'Hard' ? 'selected' : ''}>Hard</option>
              </select>
              <select class="deck-select" data-team="${teamNum}" data-slot="${index}">
                  <option value="">Random Deck</option>
                  ${STARTER_DECKS.map(d => `<option value="${d.id}" ${slot.deckId === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
              </select>
              <button class="slot-btn" data-team="${teamNum}" data-slot="${index}" data-action="close">X</button>
          </div>
          `;
      } else if (isOpen) {
        controls = `
          <div class="slot-controls">
              <button class="slot-btn active" data-team="${teamNum}" data-slot="${index}" data-action="open">OPEN</button>
              <button class="slot-btn" data-team="${teamNum}" data-slot="${index}" data-action="cpu">CPU</button>
              <button class="slot-btn" data-team="${teamNum}" data-slot="${index}" data-action="close">X</button>
          </div>
          `;
      } else {
        // Closed slot
        controls = `
          <div class="slot-controls">
              <button class="slot-btn" data-team="${teamNum}" data-slot="${index}" data-action="open">OPEN</button>
              <button class="slot-btn" data-team="${teamNum}" data-slot="${index}" data-action="cpu">CPU</button>
          </div>
          `;
      }

      return `
        <div class="slot-row ${slotClass}">
          <span class="slot-number">${index + 1}</span>
          <span class="slot-type ${slotClass}">${typeLabel}</span>
          ${controls}
        </div>
      `;
    }

    team1Container.innerHTML = team1.map((slot, i) => renderSlot(slot, i, 1)).join('');
    team2Container.innerHTML = team2.map((slot, i) => renderSlot(slot, i, 2)).join('');
  }

  function setupTeamSlotEvents(): void {
    // Slot button clicks
    element.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const teamNum = parseInt(target.dataset['team']!);
        const slotIndex = parseInt(target.dataset['slot']!);
        const action = target.dataset['action'];

        const team = teamNum === 1 ? team1 : team2;
        const slot = team[slotIndex];
        if (!slot) return;

        if (action === 'cpu') {
          slot.type = 'CPU';
        } else if (action === 'open') {
          slot.type = 'OPEN';
        } else if (action === 'close') {
          slot.type = 'CLOSED';
        }

        renderTeamSlots();
        setupTeamSlotEvents();
      });
    });

    // Difficulty selects
    element.querySelectorAll('.difficulty-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const teamNum = parseInt(target.dataset['team']!);
        const slotIndex = parseInt(target.dataset['slot']!);

        const team = teamNum === 1 ? team1 : team2;
        const slot = team[slotIndex];
        if (slot) {
          slot.difficulty = target.value as CPUDifficulty;
        }
      });
    });

    // Deck selects for CPUs
    element.querySelectorAll('.deck-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const teamNum = parseInt(target.dataset['team']!);
        const slotIndex = parseInt(target.dataset['slot']!);

        const team = teamNum === 1 ? team1 : team2;
        const slot = team[slotIndex];
        if (slot) {
          if (target.value) {
            slot.deckId = target.value;
          } else {
            delete slot.deckId;
          }
        }
      });
    });

    // Your deck select (must be set up after rendering team slots)
    const yourDeckSelect = element.querySelector('#your-deck-select') as HTMLSelectElement;
    if (yourDeckSelect) {
      yourDeckSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const value = target.value;

        if (!value) {
          selectedDeck = null;
        } else if (value === 'default') {
          selectedDeck = createDefaultDeck();
        } else {
          // Check starter decks
          const starter = STARTER_DECKS.find(d => d.id === value);
          if (starter) {
            selectedDeck = starter;
          } else {
            // Check saved decks
            const savedDecks = loadSavedDecks();
            const saved = savedDecks.find(d => d.id === value);
            if (saved) {
              selectedDeck = saved;
            }
          }
        }
        renderDeckPreview();
        updateStartButton();
      });
    }
  }

  function renderDeckPreview(): void {
    const preview = element.querySelector('#deck-preview')!;

    if (!selectedDeck) {
      preview.innerHTML = '<p class="placeholder">Select a deck to see details</p>';
      return;
    }

    // Count units by category
    const categoryCounts = new Map<string, number>();
    for (const unit of selectedDeck.units) {
      const count = categoryCounts.get(unit.unitId) ?? 0;
      categoryCounts.set(unit.unitId, count + 1);
    }

    const deckName = selectedDeck.name.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c));
    preview.innerHTML = `
      <div class="deck-info">
        <div><span class="label">Name:</span> <span class="value">${deckName}</span></div>
        <div><span class="label">Units:</span> <span class="value">${selectedDeck.units.reduce((sum, u) => sum + (u.quantity || 1), 0)}</span></div>
        <div><span class="label">Activation Points:</span> <span class="value">${selectedDeck.activationPoints}/50</span></div>
      </div>
    `;
  }

  function renderMapPreview(): void {
    const canvas = element.querySelector('#preview-canvas') as HTMLCanvasElement;
    if (!canvas) {
      console.error('Preview canvas not found');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2D context for preview canvas');
      return;
    }

    // Show loading state immediately
    const loadingOverlay = element.querySelector('#map-loading');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    // Disable start button while generating
    isGeneratingMap = true;
    updateStartButton();

    // Defer generation to next tick to allow UI to update
    setTimeout(() => {
      // Import map generator dynamically to render preview
      import('../game/map/MapGenerator').then(({ MapGenerator }) => {
        try {
          const generator = new MapGenerator(mapSeed, mapSize, selectedBiome);
          generatedMap = generator.generate(); // Store map for reuse
          const map = generatedMap;

          const canvasSize = 200;
          const biomeConfig = BIOME_CONFIGS[map.biome];

          // Convert hex color to CSS color string
          const hexToCSS = (hex: number) => '#' + hex.toString(16).padStart(6, '0');

          // Clear canvas with biome ground color
          ctx.fillStyle = hexToCSS(biomeConfig.groundColor);
          ctx.fillRect(0, 0, canvasSize, canvasSize);

          const scale = canvasSize / map.width;

          // Draw terrain (simplified) - use biome colors
          const cellSize = map.cellSize * scale;
          for (let z = 0; z < map.terrain.length; z++) {
            for (let x = 0; x < (map.terrain[z]?.length ?? 0); x++) {
              const cell = map.terrain[z]![x]!;
              let color = hexToCSS(biomeConfig.groundColor); // field - use biome color

              switch (cell.type) {
                case 'forest':
                  color = hexToCSS(biomeConfig.forestColor);
                  break;
                case 'road':
                  color = '#5a5a5a';
                  break;
                case 'river':
                case 'water':
                  color = hexToCSS(biomeConfig.waterColor ?? 0x3a6a8a);
                  break;
                case 'hill':
                  // Darken ground color slightly for hills
                  const hillColor = biomeConfig.groundColor;
                  const r = ((hillColor >> 16) & 0xFF) * 0.85;
                  const g = ((hillColor >> 8) & 0xFF) * 0.85;
                  const b = (hillColor & 0xFF) * 0.85;
                  color = `rgb(${r},${g},${b})`;
                  break;
                case 'building':
                  color = '#8a7a6a';
                  break;
              }

              ctx.fillStyle = color;
              ctx.fillRect(x * cellSize, z * cellSize, cellSize, cellSize);
            }
          }

          // Draw elevation shading overlay for mountains/hills
          // This makes mountains visible in the preview
          for (let z = 0; z < map.terrain.length; z++) {
            for (let x = 0; x < (map.terrain[z]?.length ?? 0); x++) {
              const cell = map.terrain[z]![x]!;

              // Add shading based on elevation
              if (cell.elevation > 20) {
                // Calculate intensity based on elevation (20-100m range)
                const intensity = Math.min((cell.elevation - 20) / 80, 1);

                // Darken for mountains (brown/gray tint)
                const alpha = intensity * 0.4;
                ctx.fillStyle = `rgba(80, 70, 60, ${alpha})`;
                ctx.fillRect(x * cellSize, z * cellSize, cellSize, cellSize);
              }
            }
          }

          // Draw terrain feature markers (mountains, plateaus, ridges, hills)
          if ((map as any).terrainFeatures) {
            const terrainFeatures = (map as any).terrainFeatures || [];

            for (const feature of terrainFeatures) {
              const screenX = (feature.x + map.width / 2) * scale;
              const screenZ = (feature.z + map.height / 2) * scale;
              const radius = Math.max(feature.params.radius * scale, 3);

              ctx.save();
              ctx.translate(screenX, screenZ);

              if (feature.type === 'mountain') {
                // Draw mountain symbol (triangle)
                // Shadow/outline
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.beginPath();
                ctx.moveTo(0, -radius - 1);
                ctx.lineTo(-radius * 0.7 - 1, radius * 0.5 + 1);
                ctx.lineTo(radius * 0.7 + 1, radius * 0.5 + 1);
                ctx.closePath();
                ctx.fill();

                // Mountain peak (white/light gray)
                ctx.fillStyle = '#e0e0e0';
                ctx.beginPath();
                ctx.moveTo(0, -radius);
                ctx.lineTo(-radius * 0.7, radius * 0.5);
                ctx.lineTo(radius * 0.7, radius * 0.5);
                ctx.closePath();
                ctx.fill();

                // Outline
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 0.5;
                ctx.stroke();
              } else if (feature.type === 'plateau') {
                // Draw plateau symbol (flat-topped trapezoid)
                const width = radius * 1.5;
                const height = radius * 0.8;

                // Shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(-width / 2 + 1, -height / 2 + 1, width, height);

                // Plateau top (earthy brown/red for mesa)
                ctx.fillStyle = '#b06d45';
                ctx.fillRect(-width / 2, -height / 2, width, height);

                // Dark top edge for depth
                ctx.fillStyle = '#8a5635';
                ctx.fillRect(-width / 2, -height / 2, width, 2);

                // Outline
                ctx.strokeStyle = '#3d2618';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(-width / 2, -height / 2, width, height);
              } else if (feature.type === 'hill' || feature.type === 'ridge') {
                // Draw hill/ridge symbol (small curves)
                const size = radius * 0.6;
                ctx.strokeStyle = '#5a5a5a';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, size, size, Math.PI * 1.2, Math.PI * 1.8);
                ctx.stroke();
              }

              ctx.restore();
            }
          }

          // Draw water bodies with smooth curves
          // Rivers are drawn as stroked lines, lakes as filled polygons
          for (const waterBody of map.waterBodies) {
            ctx.fillStyle = hexToCSS(biomeConfig.waterColor ?? 0x3a6a8a);
            ctx.strokeStyle = hexToCSS(biomeConfig.waterColor ?? 0x3a6a8a);

            const points = waterBody.points;
            if (points.length < 2) continue;

            const isRiver = waterBody.type === 'river';

            if (isRiver) {
              // Draw river as a thick stroked line
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              // Scale width but clamp to reasonable minimum/maximum for readability
              const riverWidth = Math.max(2, Math.min(8, (waterBody.width ?? 10) * scale));
              ctx.lineWidth = riverWidth;
              ctx.beginPath();
            } else {
              // Lake: prepare for fill
              ctx.beginPath();
            }

            // Start at first point
            const p0 = points[0]!;
            const s0x = (p0.x + map.width / 2) * scale;
            const s0z = (p0.z + map.height / 2) * scale;
            ctx.moveTo(s0x, s0z);

            // Draw smooth curve using points as control points
            for (let i = 1; i < points.length - 1; i++) {
              const pCurrent = points[i]!;
              const pNext = points[i + 1]!;

              const scx = (pCurrent.x + map.width / 2) * scale;
              const scz = (pCurrent.z + map.height / 2) * scale;

              const snx = (pNext.x + map.width / 2) * scale;
              const snz = (pNext.z + map.height / 2) * scale;

              // Use midpoint between current and next as the end point of the curve
              // The current point acts as the control point
              const midX = (scx + snx) / 2;
              const midZ = (scz + snz) / 2;

              ctx.quadraticCurveTo(scx, scz, midX, midZ);
            }

            // Connect to last point
            const last = points[points.length - 1]!;
            const slx = (last.x + map.width / 2) * scale;
            const slz = (last.z + map.height / 2) * scale;

            // For the last segment, just draw a straight line or curve to it (using last point as end)
            // But since we used midpoints, we need to bridge the gap from last midpoint
            // The loop handles up to n-1. 
            // Actually, properly: 
            // curve from prev_mid to new_mid using current as control.

            // Let's use a simpler quadratic approach that hits points? No, "Chaikin's algorithms" or just midpoint smoothing is best.
            // My loop above: curve from (prev_cursor) to (midpoint between current and next) using (current) as control.
            // This leaves a gap from the last midpoint to the actual last point.

            // Note: index i=points.length-1 is the last point. Loop goes to points.length-2 (second to last).
            // So pNext is the last point.
            // midX/midZ is midpoint between second-to-last and last.
            // So we just need to lineTo or quadraticTo the last point.

            ctx.lineTo(slx, slz);

            if (isRiver) {
              ctx.fillStyle = 'transparent'; // Explicitly prevent filling for rivers
              ctx.stroke();
            } else {
              ctx.closePath();
              ctx.fill();
              // Optional: stroke lakes too for cleaner edges
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }

          // Draw roads with better visibility
          ctx.strokeStyle = '#888888';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (const road of map.roads) {
            ctx.beginPath();
            for (let i = 0; i < road.points.length; i++) {
              const p = road.points[i]!;
              const screenX = (p.x + map.width / 2) * scale;
              const screenZ = (p.z + map.height / 2) * scale;
              if (i === 0) {
                ctx.moveTo(screenX, screenZ);
              } else {
                ctx.lineTo(screenX, screenZ);
              }
            }
            ctx.stroke();
          }

          // Draw buildings with outlines for better visibility
          for (const building of map.buildings) {
            const screenX = (building.x + map.width / 2) * scale;
            const screenZ = (building.z + map.height / 2) * scale;

            // Ensure buildings are visible even on large maps (min 2px)
            const w = Math.max(building.width * scale, 2);
            const d = Math.max(building.depth * scale, 2);

            // Fill (use high contrast color for urban biome or general building color)
            ctx.fillStyle = map.biome === 'cities' ? '#a0a0a0' : '#d4c4a8';
            ctx.fillRect(screenX - w / 2, screenZ - d / 2, w, d);

            // Outline (only draw if large enough to matter, otherwise it just clutters)
            if (w > 3) {
              ctx.strokeStyle = '#404040';
              ctx.lineWidth = 0.5;
              ctx.strokeRect(screenX - w / 2, screenZ - d / 2, w, d);
            }
          }

          // Draw capture zones with better contrast
          for (const zone of map.captureZones) {
            const screenX = (zone.x + map.width / 2) * scale;
            const screenZ = (zone.z + map.height / 2) * scale;
            const w = Math.max(zone.width * scale, 4); // Ensure minimum visible size
            const h = Math.max(zone.height * scale, 4);

            // Outer glow
            ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.fillRect(screenX - w / 2 - 1, screenZ - h / 2 - 1, w + 2, h + 2);

            // Main rect
            ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
            ctx.fillRect(screenX - w / 2, screenZ - h / 2, w, h);

            // Bold outline
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(screenX - w / 2, screenZ - h / 2, w, h);

            // Center dot
            ctx.beginPath();
            ctx.arc(screenX, screenZ, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffff00';
            ctx.fill();
          }

          // Draw deployment zones with better contrast
          for (const zone of map.deploymentZones) {
            const x1 = (zone.minX + map.width / 2) * scale;
            const x2 = (zone.maxX + map.width / 2) * scale;
            const z1 = (zone.minZ + map.height / 2) * scale;
            const z2 = (zone.maxZ + map.height / 2) * scale;

            const isPlayer = zone.team === 'player';
            const fillColor = isPlayer ? 'rgba(0, 170, 255, 0.4)' : 'rgba(255, 34, 0, 0.4)';
            const strokeColor = isPlayer ? 'var(--blue-primary)' : 'var(--red-glow)';

            // Fill
            ctx.fillStyle = fillColor;
            ctx.fillRect(x1, z1, x2 - x1, z2 - z1);

            // Bold outline
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x1, z1, x2 - x1, z2 - z1);
          }

          // Draw resupply points as directional arrows at map edges
          for (const point of map.resupplyPoints) {
            const screenX = (point.x + map.width / 2) * scale;
            const screenY = (point.z + map.height / 2) * scale;
            const r = point.radius * scale;

            const color = point.team === 'player' ? 'var(--blue-primary)' : 'var(--red-glow)';

            // Arrow dimensions
            const arrowLength = r * 2.5;
            const arrowWidth = r * 1.0;
            const arrowHeadWidth = r * 1.5;
            const arrowHeadLength = r * 0.8;

            // Offset arrow base outside the map edge
            const outsideOffset = r * 0.5;
            const baseY = point.team === 'player'
              ? screenY - outsideOffset  // Player: offset up (outside top edge)
              : screenY + outsideOffset; // Enemy: offset down (outside bottom edge)

            // Save context and position at arrow base
            ctx.save();
            ctx.translate(screenX, baseY);

            // Rotation: arrow shape points UP (-Y), flip based on team
            // Player arrows point DOWN into battlefield, enemy arrows point UP
            ctx.rotate(Math.PI - point.direction);

            // Draw arrow shape (points UP in local space)
            ctx.beginPath();
            ctx.moveTo(-arrowWidth / 2, 0);
            ctx.lineTo(-arrowWidth / 2, -arrowLength + arrowHeadLength);
            ctx.lineTo(-arrowHeadWidth / 2, -arrowLength + arrowHeadLength);
            ctx.lineTo(0, -arrowLength); // Arrow tip
            ctx.lineTo(arrowHeadWidth / 2, -arrowLength + arrowHeadLength);
            ctx.lineTo(arrowWidth / 2, -arrowLength + arrowHeadLength);
            ctx.lineTo(arrowWidth / 2, 0);
            ctx.closePath();

            ctx.fillStyle = color + 'A0'; // Semi-transparent
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Draw circle at base (spawn point)
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            ctx.restore();
          }

          // Draw biome info at bottom of preview
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 190, 200, 10);
          ctx.fillStyle = '#fff';
          ctx.font = '10px monospace';
          ctx.fillText(`Biome: ${biomeConfig.name}`, 5, 198);

        } catch (error) {
          console.error('Map generation failed:', error);
          ctx.fillStyle = '#ff4444';
          ctx.fillRect(0, 0, 200, 200);
          ctx.fillStyle = '#fff';
          ctx.font = '12px monospace';
          ctx.fillText('Generation Error', 50, 100);
        } finally {
          // Always hide loading state and re-enable button
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
          isGeneratingMap = false;
          updateStartButton();
        }
      }).catch(error => {
        console.error('Failed to load MapGenerator:', error);
        if (loadingOverlay) loadingOverlay.classList.add('hidden'); // Also hide here just in case
        isGeneratingMap = false;
        updateStartButton();
      });
    }, 50); // Small delay to let UI render the loading state
  }

  function updateStartButton(): void {
    const btn = element.querySelector('#skirmish-start-btn') as HTMLButtonElement;
    btn.disabled = !selectedDeck || isGeneratingMap;

    if (isGeneratingMap) {
      btn.classList.add('loading');
      btn.innerHTML = '<span class="button-spinner"></span>GENERATING MAP...';
    } else {
      btn.classList.remove('loading');
      btn.innerHTML = '&#9884; START BATTLE &#9884;';
    }
  }

  let escHandler: ((e: KeyboardEvent) => void) | null = null;

  const onEnter = () => {
    renderTeamSlots();
    setupTeamSlotEvents();
    renderDeckPreview();
    renderMapPreview();
    updateStartButton();

    // ESC key to go back
    escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        callbacks.onBack();
      }
    };
    document.addEventListener('keydown', escHandler);

    // Bind events
    element.querySelector('#skirmish-back-btn')?.addEventListener('click', callbacks.onBack);



    element.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        mapSize = target.dataset['size'] as MapSize;

        element.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');

        renderMapPreview();
      });
    });

    element.querySelector('#map-seed')?.addEventListener('change', (e) => {
      mapSeed = parseInt((e.target as HTMLInputElement).value) || 0;
      renderMapPreview();
    });

    element.querySelector('#random-seed-btn')?.addEventListener('click', () => {
      mapSeed = Math.floor(Math.random() * 999999);
      (element.querySelector('#map-seed') as HTMLInputElement).value = mapSeed.toString();
      renderMapPreview();
    });

    element.querySelector('#biome-select')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      selectedBiome = value ? (value as BiomeType) : undefined;
      renderMapPreview();
    });

    element.querySelector('#skirmish-start-btn')?.addEventListener('click', () => {
      if (selectedDeck && !isGeneratingMap && generatedMap) {
        // Show global loading screen for immediate feedback
        const loadingScreen = document.getElementById('loading-screen');
        const loadingText = document.getElementById('loading-text');

        if (loadingScreen && loadingText) {
          loadingScreen.classList.remove('hidden');
          loadingText.textContent = 'Preparing Battlefield...';

          // Small delay to allow loading screen to render before hanging the UI with scene construction
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (selectedDeck) {
                callbacks.onStartBattle({
                  deck: selectedDeck,
                  mapSize,
                  mapSeed,
                  ...(selectedBiome !== undefined && { biome: selectedBiome }),
                  existingMap: generatedMap!, // Use the map we already generated
                  team1,
                  team2,
                });

                // Note: The global loading screen will be hidden by the game logic once ready
              }
            });
          });
        } else {
          // Fallback if loading screen not found
          callbacks.onStartBattle({
            deck: selectedDeck,
            mapSize,
            mapSeed,
            ...(selectedBiome !== undefined && { biome: selectedBiome }),
            existingMap: generatedMap, // Use the map we already generated
            team1,
            team2,
          });
        }
      }
    });

    // Setup copy button (persistent, not re-attached each time)
    element.querySelector('#code-copy-btn')?.addEventListener('click', () => {
      if (hostedGameCode) {
        navigator.clipboard.writeText(hostedGameCode).then(() => {
          const copyBtn = element.querySelector('#code-copy-btn') as HTMLButtonElement;
          if (copyBtn) {
            copyBtn.textContent = 'COPIED!';
            setTimeout(() => { copyBtn.textContent = 'COPY'; }, 1500);
          }
        });
      }
    });

    element.querySelector('#skirmish-host-online-btn')?.addEventListener('click', async () => {
      const hostBtn = element.querySelector('#skirmish-host-online-btn') as HTMLButtonElement;

      if (isHosting) {
        // Cancel hosting
        callbacks.onCancelHosting();
        isHosting = false;
        hostedGameCode = null;

        // Hide game code
        const codeDisplay = element.querySelector('#game-code-display');
        if (codeDisplay) codeDisplay.classList.add('hidden');

        // Reset button
        hostBtn.classList.remove('hosting');
        hostBtn.innerHTML = '&#9884; HOST ONLINE &#9884;';
        return;
      }

      if (selectedDeck) {
        hostBtn.disabled = true;
        hostBtn.innerHTML = '<span class="button-spinner"></span>CONNECTING...';

        const gameCode = await callbacks.onHostOnline({
          deck: selectedDeck,
          mapSize,
          mapSeed,
          ...(selectedBiome !== undefined && { biome: selectedBiome }),
          team1,
          team2,
        });

        if (gameCode) {
          isHosting = true;
          hostedGameCode = gameCode;

          // Show game code in header
          const codeDisplay = element.querySelector('#game-code-display');
          const codeValue = element.querySelector('#game-code-value');
          if (codeDisplay && codeValue) {
            codeValue.textContent = gameCode;
            codeDisplay.classList.remove('hidden');
          }

          // Update button to hosting state (clickable to cancel)
          hostBtn.classList.add('hosting');
          hostBtn.innerHTML = '&#9884; HOSTING &#9884;<span class="host-cancel-hint">press to cancel</span>';
          hostBtn.disabled = false;
        } else {
          // Failed to create lobby
          hostBtn.disabled = false;
          hostBtn.innerHTML = '&#9884; HOST ONLINE &#9884;';
        }
      }
    });
  };

  const onExit = () => {
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
    // Cancel hosting if active when leaving the screen
    if (isHosting) {
      callbacks.onCancelHosting();
    }
    isHosting = false;
    hostedGameCode = null;
    const codeDisplay = element.querySelector('#game-code-display');
    if (codeDisplay) codeDisplay.classList.add('hidden');
    const hostBtn = element.querySelector('#skirmish-host-online-btn') as HTMLButtonElement | null;
    if (hostBtn) {
      hostBtn.classList.remove('hosting');
      hostBtn.disabled = false;
      hostBtn.innerHTML = '&#9884; HOST ONLINE &#9884;';
    }
  };

  return {
    type: ScreenType.SkirmishSetup,
    element,
    onEnter,
    onExit,
  };
}
