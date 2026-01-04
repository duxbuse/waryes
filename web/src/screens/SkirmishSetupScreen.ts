/**
 * SkirmishSetupScreen - Setup screen before battle
 */

import { ScreenType, type Screen } from '../core/ScreenManager';
import type { DeckData, MapSize } from '../data/types';
import { loadSavedDecks } from './DeckBuilderScreen';
import { FACTIONS, getDivisionsByFaction } from '../data/factions';

// Create a default deck for quick start
function createDefaultDeck(): DeckData {
  const faction = FACTIONS[0]; // PDF
  const divisions = getDivisionsByFaction(faction?.id ?? '');
  const division = divisions[0]; // Infantry Division

  // Create a basic deck with some infantry and a tank
  return {
    id: 'default_deck',
    name: 'Quick Start Deck',
    divisionId: division?.id ?? 'pdf_infantry',
    units: [
      { unitId: 'pdf_infantry', veterancy: 0 },
      { unitId: 'pdf_infantry', veterancy: 0 },
      { unitId: 'pdf_heavy_weapons', veterancy: 0 },
      { unitId: 'pdf_leman_russ', veterancy: 0 },
    ],
    activationPoints: 8,
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
  team1: PlayerSlot[];
  team2: PlayerSlot[];
}

export interface SkirmishSetupCallbacks {
  onBack: () => void;
  onStartBattle: (config: SkirmishConfig) => void;
}

export function createSkirmishSetupScreen(callbacks: SkirmishSetupCallbacks): Screen {
  let selectedDeck: DeckData | null = null;
  let mapSize: MapSize = 'medium';
  let mapSeed = Math.floor(Math.random() * 999999);

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
        <div></div>
      </div>

      <div class="skirmish-content">
        <div class="teams-row">
          <div class="setup-section team-section">
            <h3>Team 1 (Defenders)</h3>
            <div id="team1-slots" class="team-slots"></div>
          </div>
          <div class="setup-section team-section">
            <h3>Team 2 (Attackers)</h3>
            <div id="team2-slots" class="team-slots"></div>
          </div>
        </div>

        <div class="config-row">
          <div class="setup-section">
            <h3>Your Deck</h3>
            <select id="deck-select" class="setup-select">
              <option value="">-- Select a deck --</option>
            </select>
            <div id="deck-preview" class="deck-preview">
              <p class="placeholder">Select a deck to see details</p>
            </div>
          </div>

          <div class="setup-section">
            <h3>Map Settings</h3>
            <div class="setting-row">
              <label>Map Size:</label>
              <div class="size-buttons">
                <button class="size-btn" data-size="small">Small (200m)</button>
                <button class="size-btn active" data-size="medium">Medium (300m)</button>
                <button class="size-btn" data-size="large">Large (400m)</button>
              </div>
            </div>
            <div class="setting-row">
              <label>Map Seed:</label>
              <div class="seed-input-row">
                <input type="number" id="map-seed" class="seed-input" value="${mapSeed}" />
                <button id="random-seed-btn" class="random-btn">Random</button>
              </div>
            </div>
          </div>

          <div class="setup-section map-preview-section">
            <h3>Map Preview</h3>
            <div id="map-preview" class="map-preview">
              <canvas id="preview-canvas" width="200" height="200"></canvas>
            </div>
          </div>
        </div>
      </div>

      <div class="skirmish-footer">
        <button id="skirmish-start-btn" class="start-btn" disabled>
          START BATTLE
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
      background: linear-gradient(135deg, #0a0a1a 0%, #15152a 100%);
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
      background: rgba(0, 0, 0, 0.5);
      border-radius: 12px;
      padding: 20px;
      box-sizing: border-box;
    }

    .skirmish-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .skirmish-header h2 {
      color: #4a9eff;
      letter-spacing: 3px;
      margin: 0;
    }

    .back-btn {
      padding: 8px 20px;
      background: rgba(74, 158, 255, 0.2);
      border: 1px solid rgba(74, 158, 255, 0.5);
      color: #e0e0e0;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .back-btn:hover {
      background: rgba(74, 158, 255, 0.4);
      border-color: #4a9eff;
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
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 15px;
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
      border-radius: 4px;
      font-size: 13px;
    }

    .slot-row.you {
      background: rgba(74, 158, 255, 0.2);
      border: 1px solid rgba(74, 158, 255, 0.5);
    }

    .slot-row.cpu {
      background: rgba(255, 180, 50, 0.15);
    }

    .slot-row.closed {
      background: rgba(50, 50, 50, 0.3);
      opacity: 0.5;
    }

    .slot-number {
      width: 20px;
      color: #666;
      font-weight: bold;
    }

    .slot-type {
      flex: 1;
      color: #e0e0e0;
    }

    .slot-type.you {
      color: #4a9eff;
      font-weight: bold;
    }

    .slot-type.cpu {
      color: #ffb432;
    }

    .slot-type.closed {
      color: #555;
    }

    .slot-controls {
      display: flex;
      gap: 4px;
    }

    .slot-btn {
      padding: 4px 8px;
      font-size: 11px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid #444;
      color: #aaa;
      cursor: pointer;
      border-radius: 3px;
    }

    .slot-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }

    .slot-btn.active {
      background: rgba(74, 158, 255, 0.3);
      border-color: #4a9eff;
      color: #4a9eff;
    }

    .difficulty-select {
      padding: 3px 6px;
      font-size: 11px;
      background: #1a1a2a;
      border: 1px solid #444;
      color: #e0e0e0;
      border-radius: 3px;
      cursor: pointer;
    }

    .setup-section h3 {
      margin: 0 0 15px 0;
      font-size: 14px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .setup-select {
      width: 100%;
      padding: 10px;
      background: #1a1a2a;
      border: 1px solid #333;
      color: #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
    }

    .deck-preview {
      margin-top: 15px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
      min-height: 100px;
      max-height: 150px;
      overflow-y: auto;
    }

    .deck-preview .placeholder {
      color: #555;
      text-align: center;
      padding: 20px;
    }

    .deck-info {
      font-size: 13px;
      line-height: 1.8;
    }

    .deck-info .label {
      color: #888;
    }

    .deck-info .value {
      color: #e0e0e0;
    }

    .setting-row {
      margin-bottom: 15px;
    }

    .setting-row label {
      display: block;
      font-size: 13px;
      color: #888;
      margin-bottom: 8px;
    }

    .size-buttons {
      display: flex;
      gap: 8px;
    }

    .size-btn {
      flex: 1;
      padding: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #333;
      color: #888;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 12px;
    }

    .size-btn:hover {
      background: rgba(74, 158, 255, 0.1);
      border-color: #4a9eff;
      color: #e0e0e0;
    }

    .size-btn.active {
      background: rgba(74, 158, 255, 0.3);
      border-color: #4a9eff;
      color: #4a9eff;
    }

    .seed-input-row {
      display: flex;
      gap: 10px;
    }

    .seed-input {
      flex: 1;
      padding: 10px;
      background: #1a1a2a;
      border: 1px solid #333;
      color: #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
    }

    .random-btn {
      padding: 10px 20px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid #444;
      color: #e0e0e0;
      border-radius: 4px;
      cursor: pointer;
    }

    .random-btn:hover {
      background: rgba(255, 255, 255, 0.2);
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
      border-radius: 4px;
    }

    #preview-canvas {
      border-radius: 4px;
    }

    .skirmish-footer {
      margin-top: 20px;
      display: flex;
      justify-content: center;
      flex-shrink: 0;
      padding-bottom: 10px;
    }

    .start-btn {
      padding: 15px 60px;
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 3px;
      background: linear-gradient(135deg, #4a9eff 0%, #2070cc 100%);
      border: none;
      color: white;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
    }

    .start-btn:hover:not(:disabled) {
      transform: scale(1.02);
      box-shadow: 0 0 30px rgba(74, 158, 255, 0.4);
    }

    .start-btn:disabled {
      background: #333;
      color: #666;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);

  function renderDeckSelect(): void {
    const select = element.querySelector('#deck-select') as HTMLSelectElement;
    const decks = loadSavedDecks();

    select.innerHTML = `
      <option value="">-- Select a deck --</option>
      <option value="default">Quick Start (Default Deck)</option>
      ${decks.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
    `;
  }

  function renderTeamSlots(): void {
    const team1Container = element.querySelector('#team1-slots')!;
    const team2Container = element.querySelector('#team2-slots')!;

    function renderSlot(slot: PlayerSlot, index: number, teamNum: 1 | 2): string {
      const isYou = slot.type === 'YOU';
      const isCpu = slot.type === 'CPU';
      const isClosed = slot.type === 'CLOSED';

      const slotClass = isYou ? 'you' : isCpu ? 'cpu' : 'closed';
      const typeLabel = isYou ? 'YOU' : isCpu ? `CPU (${slot.difficulty})` : 'CLOSED';

      let controls = '';
      if (!isYou) {
        controls = `
          <div class="slot-controls">
            <button class="slot-btn ${isCpu ? 'active' : ''}" data-team="${teamNum}" data-slot="${index}" data-action="cpu">CPU</button>
            <button class="slot-btn ${isClosed ? 'active' : ''}" data-team="${teamNum}" data-slot="${index}" data-action="close">X</button>
            ${isCpu ? `
              <select class="difficulty-select" data-team="${teamNum}" data-slot="${index}">
                <option value="Easy" ${slot.difficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                <option value="Medium" ${slot.difficulty === 'Medium' ? 'selected' : ''}>Medium</option>
                <option value="Hard" ${slot.difficulty === 'Hard' ? 'selected' : ''}>Hard</option>
              </select>
            ` : ''}
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

    preview.innerHTML = `
      <div class="deck-info">
        <div><span class="label">Name:</span> <span class="value">${selectedDeck.name}</span></div>
        <div><span class="label">Units:</span> <span class="value">${selectedDeck.units.length}</span></div>
        <div><span class="label">Activation Points:</span> <span class="value">${selectedDeck.activationPoints}/50</span></div>
      </div>
    `;
  }

  function renderMapPreview(): void {
    const canvas = element.querySelector('#preview-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    // Import map generator dynamically to render preview
    import('../game/map/MapGenerator').then(({ MapGenerator }) => {
      const generator = new MapGenerator(mapSeed, mapSize);
      const map = generator.generate();

      const canvasSize = 200;
      // Clear canvas
      ctx.fillStyle = '#4a7c4e';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      const scale = canvasSize / map.width;

      // Draw terrain (simplified)
      const cellSize = 4 * scale;
      for (let z = 0; z < map.terrain.length; z++) {
        for (let x = 0; x < (map.terrain[z]?.length ?? 0); x++) {
          const cell = map.terrain[z]![x]!;
          let color = '#4a7c4e'; // field

          switch (cell.type) {
            case 'forest':
              color = '#2d5a30';
              break;
            case 'road':
              color = '#5a5a5a';
              break;
            case 'river':
            case 'water':
              color = '#3a6a8a';
              break;
            case 'hill':
              color = '#6b8e5a';
              break;
            case 'building':
              color = '#8a7a6a';
              break;
          }

          ctx.fillStyle = color;
          ctx.fillRect(x * cellSize, z * cellSize, cellSize, cellSize);
        }
      }

      // Draw roads
      ctx.strokeStyle = '#7a7a7a';
      ctx.lineWidth = 3;
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

      // Draw buildings
      ctx.fillStyle = '#d4c4a8';
      for (const building of map.buildings) {
        const screenX = (building.x + map.width / 2) * scale;
        const screenZ = (building.z + map.height / 2) * scale;
        const w = building.width * scale;
        const d = building.depth * scale;
        ctx.fillRect(screenX - w / 2, screenZ - d / 2, w, d);
      }

      // Draw capture zones
      for (const zone of map.captureZones) {
        const screenX = (zone.x + map.width / 2) * scale;
        const screenZ = (zone.z + map.height / 2) * scale;
        const r = zone.radius * scale;

        ctx.beginPath();
        ctx.arc(screenX, screenZ, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw deployment zones
      for (const zone of map.deploymentZones) {
        const x1 = (zone.minX + map.width / 2) * scale;
        const x2 = (zone.maxX + map.width / 2) * scale;
        const z1 = (zone.minZ + map.height / 2) * scale;
        const z2 = (zone.maxZ + map.height / 2) * scale;

        ctx.fillStyle = zone.team === 'player'
          ? 'rgba(74, 158, 255, 0.3)'
          : 'rgba(255, 74, 74, 0.3)';
        ctx.fillRect(x1, z1, x2 - x1, z2 - z1);

        ctx.strokeStyle = zone.team === 'player' ? '#4a9eff' : '#ff4a4a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, z1, x2 - x1, z2 - z1);
      }
    });
  }

  function updateStartButton(): void {
    const btn = element.querySelector('#skirmish-start-btn') as HTMLButtonElement;
    btn.disabled = !selectedDeck;
  }

  const onEnter = () => {
    renderTeamSlots();
    setupTeamSlotEvents();
    renderDeckSelect();
    renderDeckPreview();
    renderMapPreview();
    updateStartButton();

    // Bind events
    element.querySelector('#skirmish-back-btn')?.addEventListener('click', callbacks.onBack);

    element.querySelector('#deck-select')?.addEventListener('change', (e) => {
      const deckId = (e.target as HTMLSelectElement).value;
      if (deckId === 'default') {
        selectedDeck = createDefaultDeck();
      } else {
        const decks = loadSavedDecks();
        selectedDeck = decks.find(d => d.id === deckId) ?? null;
      }
      renderDeckPreview();
      updateStartButton();
    });

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

    element.querySelector('#skirmish-start-btn')?.addEventListener('click', () => {
      if (selectedDeck) {
        callbacks.onStartBattle({
          deck: selectedDeck,
          mapSize,
          mapSeed,
          team1,
          team2,
        });
      }
    });
  };

  return {
    type: ScreenType.SkirmishSetup,
    element,
    onEnter,
  };
}
