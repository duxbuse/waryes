/**
 * SettingsScreen - Game settings configuration
 */

import { ScreenType, type Screen } from '../core/ScreenManager';

export interface SettingsCallbacks {
  onBack: () => void;
}

interface GameSettings {
  graphics: {
    quality: 'low' | 'medium' | 'high' | 'ultra';
    shadows: boolean;
    vsync: boolean;
  };
  audio: {
    master: number;
    music: number;
    sfx: number;
  };
  gameplay: {
    edgePanSpeed: number;
    scrollSpeed: number;
    showGrid: boolean;
    healthBars: 'always' | 'selected' | 'never';
  };
}

const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    quality: 'high',
    shadows: true,
    vsync: true,
  },
  audio: {
    master: 80,
    music: 70,
    sfx: 80,
  },
  gameplay: {
    edgePanSpeed: 50,
    scrollSpeed: 50,
    showGrid: false,
    healthBars: 'always',
  },
};

function loadSettings(): GameSettings {
  const saved = localStorage.getItem('stellarSiegeSettings');
  if (saved) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: GameSettings): void {
  localStorage.setItem('stellarSiegeSettings', JSON.stringify(settings));
}

export function createSettingsScreen(callbacks: SettingsCallbacks): Screen {
  let settings = loadSettings();

  const element = document.createElement('div');
  element.id = 'settings-screen';
  element.innerHTML = `
    <div class="settings-container">
      <div class="settings-header">
        <button class="back-btn" id="settings-back-btn">&larr; Back</button>
        <h2>SETTINGS</h2>
        <div></div>
      </div>

      <div class="settings-content">
        <div class="settings-section">
          <h3>GRAPHICS</h3>
          <div class="setting-row">
            <label>Quality:</label>
            <select id="setting-quality" class="setting-select">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>
          <div class="setting-row">
            <label>Shadows:</label>
            <input type="checkbox" id="setting-shadows" class="setting-checkbox" />
          </div>
          <div class="setting-row">
            <label>VSync:</label>
            <input type="checkbox" id="setting-vsync" class="setting-checkbox" />
          </div>
        </div>

        <div class="settings-section">
          <h3>AUDIO</h3>
          <div class="setting-row">
            <label>Master Volume:</label>
            <input type="range" id="setting-master" min="0" max="100" class="setting-slider" />
            <span id="setting-master-value" class="slider-value">80</span>
          </div>
          <div class="setting-row">
            <label>Music:</label>
            <input type="range" id="setting-music" min="0" max="100" class="setting-slider" />
            <span id="setting-music-value" class="slider-value">70</span>
          </div>
          <div class="setting-row">
            <label>SFX:</label>
            <input type="range" id="setting-sfx" min="0" max="100" class="setting-slider" />
            <span id="setting-sfx-value" class="slider-value">80</span>
          </div>
        </div>

        <div class="settings-section">
          <h3>GAMEPLAY</h3>
          <div class="setting-row">
            <label>Edge Pan Speed:</label>
            <input type="range" id="setting-edgepan" min="0" max="100" class="setting-slider" />
            <span id="setting-edgepan-value" class="slider-value">50</span>
          </div>
          <div class="setting-row">
            <label>Scroll Speed:</label>
            <input type="range" id="setting-scroll" min="0" max="100" class="setting-slider" />
            <span id="setting-scroll-value" class="slider-value">50</span>
          </div>
          <div class="setting-row">
            <label>Show Grid:</label>
            <input type="checkbox" id="setting-grid" class="setting-checkbox" />
          </div>
          <div class="setting-row">
            <label>Health Bars:</label>
            <select id="setting-healthbars" class="setting-select">
              <option value="always">Always</option>
              <option value="selected">Selected Only</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <button id="settings-apply-btn" class="settings-btn primary">Apply</button>
        <button id="settings-reset-btn" class="settings-btn">Reset Defaults</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #settings-screen {
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

    #settings-screen.hidden {
      display: none;
    }

    .settings-container {
      width: 90%;
      max-width: 700px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 12px;
      padding: 20px;
      box-sizing: border-box;
    }

    .settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .settings-header h2 {
      color: #4a9eff;
      letter-spacing: 3px;
      margin: 0;
    }

    .settings-content {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .settings-section {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 15px;
    }

    .settings-section h3 {
      margin: 0 0 15px 0;
      font-size: 14px;
      color: #bbb;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .setting-row {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      gap: 15px;
    }

    .setting-row label {
      flex: 0 0 140px;
      font-size: 13px;
      color: #ccc;
    }

    .setting-select {
      flex: 1;
      padding: 8px;
      background: #1a1a2a;
      border: 1px solid #333;
      color: #e0e0e0;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
    }

    .setting-checkbox {
      width: 20px;
      height: 20px;
      cursor: pointer;
    }

    .setting-slider {
      flex: 1;
      cursor: pointer;
    }

    .slider-value {
      width: 35px;
      text-align: right;
      color: #4a9eff;
      font-size: 13px;
    }

    .settings-footer {
      margin-top: 20px;
      display: flex;
      justify-content: center;
      gap: 15px;
    }

    .settings-btn {
      padding: 12px 30px;
      font-size: 14px;
      font-weight: bold;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid #444;
      color: #e0e0e0;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .settings-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .settings-btn.primary {
      background: linear-gradient(135deg, #4a9eff 0%, #2070cc 100%);
      border: none;
      color: white;
    }

    .settings-btn.primary:hover {
      transform: scale(1.02);
      box-shadow: 0 0 15px rgba(74, 158, 255, 0.3);
    }

    /* Focus styles */
    .back-btn:focus-visible {
      outline: 2px solid #4a9eff;
      outline-offset: 2px;
    }

    .setting-select:focus-visible {
      outline: 2px solid #4a9eff;
      outline-offset: 2px;
      box-shadow: 0 0 8px rgba(74, 158, 255, 0.4);
    }

    .setting-checkbox:focus-visible {
      outline: 2px solid #4a9eff;
      outline-offset: 2px;
    }

    .setting-slider:focus-visible {
      outline: 2px solid #4a9eff;
      outline-offset: 2px;
    }

    .settings-btn:focus-visible {
      outline: 2px solid #4a9eff;
      outline-offset: 2px;
      box-shadow: 0 0 12px rgba(74, 158, 255, 0.5);
    }
  `;
  document.head.appendChild(style);

  function updateUI(): void {
    // Graphics
    (element.querySelector('#setting-quality') as HTMLSelectElement).value = settings.graphics.quality;
    (element.querySelector('#setting-shadows') as HTMLInputElement).checked = settings.graphics.shadows;
    (element.querySelector('#setting-vsync') as HTMLInputElement).checked = settings.graphics.vsync;

    // Audio
    (element.querySelector('#setting-master') as HTMLInputElement).value = settings.audio.master.toString();
    (element.querySelector('#setting-master-value') as HTMLSpanElement).textContent = settings.audio.master.toString();
    (element.querySelector('#setting-music') as HTMLInputElement).value = settings.audio.music.toString();
    (element.querySelector('#setting-music-value') as HTMLSpanElement).textContent = settings.audio.music.toString();
    (element.querySelector('#setting-sfx') as HTMLInputElement).value = settings.audio.sfx.toString();
    (element.querySelector('#setting-sfx-value') as HTMLSpanElement).textContent = settings.audio.sfx.toString();

    // Gameplay
    (element.querySelector('#setting-edgepan') as HTMLInputElement).value = settings.gameplay.edgePanSpeed.toString();
    (element.querySelector('#setting-edgepan-value') as HTMLSpanElement).textContent = settings.gameplay.edgePanSpeed.toString();
    (element.querySelector('#setting-scroll') as HTMLInputElement).value = settings.gameplay.scrollSpeed.toString();
    (element.querySelector('#setting-scroll-value') as HTMLSpanElement).textContent = settings.gameplay.scrollSpeed.toString();
    (element.querySelector('#setting-grid') as HTMLInputElement).checked = settings.gameplay.showGrid;
    (element.querySelector('#setting-healthbars') as HTMLSelectElement).value = settings.gameplay.healthBars;
  }

  function readUI(): void {
    settings = {
      graphics: {
        quality: (element.querySelector('#setting-quality') as HTMLSelectElement).value as GameSettings['graphics']['quality'],
        shadows: (element.querySelector('#setting-shadows') as HTMLInputElement).checked,
        vsync: (element.querySelector('#setting-vsync') as HTMLInputElement).checked,
      },
      audio: {
        master: parseInt((element.querySelector('#setting-master') as HTMLInputElement).value),
        music: parseInt((element.querySelector('#setting-music') as HTMLInputElement).value),
        sfx: parseInt((element.querySelector('#setting-sfx') as HTMLInputElement).value),
      },
      gameplay: {
        edgePanSpeed: parseInt((element.querySelector('#setting-edgepan') as HTMLInputElement).value),
        scrollSpeed: parseInt((element.querySelector('#setting-scroll') as HTMLInputElement).value),
        showGrid: (element.querySelector('#setting-grid') as HTMLInputElement).checked,
        healthBars: (element.querySelector('#setting-healthbars') as HTMLSelectElement).value as GameSettings['gameplay']['healthBars'],
      },
    };
  }

  const onEnter = () => {
    settings = loadSettings();
    updateUI();

    // Bind events
    element.querySelector('#settings-back-btn')?.addEventListener('click', callbacks.onBack);

    element.querySelector('#settings-apply-btn')?.addEventListener('click', () => {
      readUI();
      saveSettings(settings);
    });

    element.querySelector('#settings-reset-btn')?.addEventListener('click', () => {
      settings = { ...DEFAULT_SETTINGS };
      saveSettings(settings);
      updateUI();
    });

    // Slider value updates
    const sliders = [
      { slider: '#setting-master', display: '#setting-master-value' },
      { slider: '#setting-music', display: '#setting-music-value' },
      { slider: '#setting-sfx', display: '#setting-sfx-value' },
      { slider: '#setting-edgepan', display: '#setting-edgepan-value' },
      { slider: '#setting-scroll', display: '#setting-scroll-value' },
    ];

    for (const { slider, display } of sliders) {
      element.querySelector(slider)?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        (element.querySelector(display) as HTMLSpanElement).textContent = value;
      });
    }
  };

  return {
    type: ScreenType.Settings,
    element,
    onEnter,
  };
}
