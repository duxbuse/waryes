/**
 * SettingsScreen - Game settings configuration
 * Gothic themed with custom toggle switches, sliders, and dropdown controls
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

const QUALITY_SIGNAL_MAP: Record<string, number> = { low: 1, medium: 2, high: 3, ultra: 4 };

export function createSettingsScreen(callbacks: SettingsCallbacks): Screen {
  let settings = loadSettings();

  const element = document.createElement('div');
  element.id = 'settings-screen';
  element.innerHTML = `
    <div class="panel settings-panel warp-flicker-border">
      <div class="corner-flourish tl"><div class="diamond"></div></div>
      <div class="corner-flourish tr"><div class="diamond"></div></div>
      <div class="corner-flourish bl"><div class="diamond"></div></div>
      <div class="corner-flourish br"><div class="diamond"></div></div>
      <div class="buttress-left"></div>
      <div class="buttress-right"></div>
      <div class="panel-watermark">\u2720</div>

      <div class="panel-header">
        <div class="warning-light"></div>
        <span class="title">COGITATOR SETTINGS</span>
        <span class="fleet-tag">SYS-CONFIG</span>
      </div>

      <div class="panel-body settings-body">
        <!-- GRAPHICS -->
        <div class="section-header">GRAPHICS</div>
        <div class="settings-grid">
          <div class="slider-row">
            <span class="setting-label">Quality:</span>
            <div class="dropdown-wrap">
              <select id="setting-quality" class="dropdown-select">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="ultra">Ultra</option>
              </select>
              <span class="dropdown-arrow">\u25BC</span>
            </div>
            <div class="signal-bars" id="quality-signal">
              <div class="signal-bar"></div>
              <div class="signal-bar"></div>
              <div class="signal-bar"></div>
              <div class="signal-bar"></div>
            </div>
          </div>
          <div class="toggle-row">
            <span class="setting-label">Shadows:</span>
            <div class="toggle-switch" id="setting-shadows" tabindex="0" role="switch" aria-checked="true">
              <div class="toggle-knob"></div>
            </div>
            <span class="toggle-status" id="shadows-status">ON</span>
          </div>
          <div class="toggle-row">
            <span class="setting-label">VSync:</span>
            <div class="toggle-switch" id="setting-vsync" tabindex="0" role="switch" aria-checked="true">
              <div class="toggle-knob"></div>
            </div>
            <span class="toggle-status" id="vsync-status">ON</span>
          </div>
        </div>

        <div class="panel-filigree">
          <span class="fili-line"></span>
          <span class="fili-sym">\u2726</span>
          <span class="fili-line"></span>
        </div>

        <!-- AUDIO -->
        <div class="section-header">AUDIO</div>
        <div class="settings-grid">
          <div class="slider-row">
            <span class="setting-label">Master Volume:</span>
            <div class="slider-track" id="slider-master" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="80">
              <div class="slider-fill" style="width:80%">
                <div class="slider-thumb"></div>
              </div>
            </div>
            <span class="slider-value" id="setting-master-value">80</span>
          </div>
          <div class="slider-row">
            <span class="setting-label">Music:</span>
            <div class="slider-track" id="slider-music" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="70">
              <div class="slider-fill" style="width:70%">
                <div class="slider-thumb"></div>
              </div>
            </div>
            <span class="slider-value" id="setting-music-value">70</span>
          </div>
          <div class="slider-row">
            <span class="setting-label">SFX:</span>
            <div class="slider-track" id="slider-sfx" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="80">
              <div class="slider-fill" style="width:80%">
                <div class="slider-thumb"></div>
              </div>
            </div>
            <span class="slider-value" id="setting-sfx-value">80</span>
          </div>
        </div>

        <div class="panel-filigree">
          <span class="fili-line"></span>
          <span class="fili-sym">\u2020</span>
          <span class="fili-line"></span>
        </div>

        <!-- GAMEPLAY -->
        <div class="section-header">GAMEPLAY</div>
        <div class="settings-grid">
          <div class="slider-row">
            <span class="setting-label">Edge Pan Speed:</span>
            <div class="slider-track" id="slider-edgepan" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
              <div class="slider-fill" style="width:50%">
                <div class="slider-thumb"></div>
              </div>
            </div>
            <span class="slider-value" id="setting-edgepan-value">50</span>
          </div>
          <div class="slider-row">
            <span class="setting-label">Scroll Speed:</span>
            <div class="slider-track" id="slider-scroll" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
              <div class="slider-fill" style="width:50%">
                <div class="slider-thumb"></div>
              </div>
            </div>
            <span class="slider-value" id="setting-scroll-value">50</span>
          </div>
          <div class="toggle-row">
            <span class="setting-label">Show Grid:</span>
            <div class="toggle-switch" id="setting-grid" tabindex="0" role="switch" aria-checked="false">
              <div class="toggle-knob"></div>
            </div>
            <span class="toggle-status" id="grid-status">OFF</span>
          </div>
          <div class="slider-row">
            <span class="setting-label">Health Bars:</span>
            <div class="dropdown-wrap">
              <select id="setting-healthbars" class="dropdown-select">
                <option value="always">Always</option>
                <option value="selected">Selected Only</option>
                <option value="never">Never</option>
              </select>
              <span class="dropdown-arrow">\u25BC</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="settings-footer">
        <button class="menu-btn" id="settings-back-btn"><span class="btn-flourish">\u2726</span> BACK <span class="btn-flourish">\u2726</span></button>
        <button class="menu-btn primary" id="settings-apply-btn"><span class="btn-flourish">\u269C</span> APPLY <span class="btn-flourish">\u269C</span></button>
        <button class="menu-btn" id="settings-reset-btn"><span class="btn-flourish">\u2726</span> RESET <span class="btn-flourish">\u2726</span></button>
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
      background: transparent;
      z-index: 100;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    #settings-screen.hidden {
      display: none;
    }

    .settings-panel {
      width: 90%;
      max-width: 620px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .settings-body {
      flex: 1;
      overflow-y: auto;
      padding: 18px 24px !important;
    }

    .settings-footer {
      display: flex;
      justify-content: center;
      gap: 12px;
      padding: 14px 18px;
      border-top: 1px solid var(--steel-highlight);
      background: linear-gradient(90deg, var(--steel-dark), var(--steel-mid), var(--steel-dark));
    }

    .settings-footer .menu-btn {
      font-size: 11px;
      padding: 10px 20px;
      letter-spacing: 3px;
    }

    /* Focus styles for toggles */
    .toggle-switch:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    .slider-track:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);

  function updateSignalBars(): void {
    const quality = (element.querySelector('#setting-quality') as HTMLSelectElement).value;
    const activeBars = QUALITY_SIGNAL_MAP[quality] ?? 3;
    const bars = element.querySelectorAll('#quality-signal .signal-bar');
    for (let i = 0; i < bars.length; i++) {
      bars[i]!.classList.toggle('off', i >= activeBars);
    }
  }

  function setToggle(id: string, active: boolean): void {
    const toggle = element.querySelector(`#${id}`) as HTMLElement;
    if (toggle) {
      toggle.classList.toggle('active', active);
      toggle.setAttribute('aria-checked', active.toString());
    }
    // Update status text
    const statusId = id.replace('setting-', '') + '-status';
    const status = element.querySelector(`#${statusId}`) as HTMLElement;
    if (status) {
      status.textContent = active ? 'ON' : 'OFF';
    }
  }

  function getToggle(id: string): boolean {
    const toggle = element.querySelector(`#${id}`) as HTMLElement;
    return toggle?.classList.contains('active') ?? false;
  }

  function setSlider(trackId: string, valueId: string, value: number): void {
    const track = element.querySelector(`#${trackId}`) as HTMLElement;
    const fill = track?.querySelector('.slider-fill') as HTMLElement;
    const display = element.querySelector(`#${valueId}`) as HTMLElement;
    if (fill) fill.style.width = `${value}%`;
    if (display) display.textContent = value.toString();
    if (track) track.setAttribute('aria-valuenow', value.toString());
  }

  function getSliderValue(valueId: string): number {
    const display = element.querySelector(`#${valueId}`) as HTMLElement;
    return parseInt(display?.textContent ?? '0');
  }

  function bindSlider(trackId: string, valueId: string): void {
    const track = element.querySelector(`#${trackId}`) as HTMLElement;
    if (!track) return;

    const updateFromEvent = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const pct = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
      const fill = track.querySelector('.slider-fill') as HTMLElement;
      const display = element.querySelector(`#${valueId}`) as HTMLElement;
      if (fill) fill.style.width = `${pct}%`;
      if (display) display.textContent = pct.toString();
      track.setAttribute('aria-valuenow', pct.toString());
    };

    track.addEventListener('mousedown', (e: MouseEvent) => {
      updateFromEvent(e.clientX);

      const onMove = (ev: MouseEvent) => updateFromEvent(ev.clientX);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Keyboard support for sliders
    track.addEventListener('keydown', (e: KeyboardEvent) => {
      const current = parseInt(track.getAttribute('aria-valuenow') ?? '50');
      let next = current;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(100, current + 5);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, current - 5);
      else return;
      e.preventDefault();
      setSlider(trackId, valueId, next);
    });
  }

  function updateUI(): void {
    // Graphics
    (element.querySelector('#setting-quality') as HTMLSelectElement).value = settings.graphics.quality;
    updateSignalBars();
    setToggle('setting-shadows', settings.graphics.shadows);
    setToggle('setting-vsync', settings.graphics.vsync);

    // Audio
    setSlider('slider-master', 'setting-master-value', settings.audio.master);
    setSlider('slider-music', 'setting-music-value', settings.audio.music);
    setSlider('slider-sfx', 'setting-sfx-value', settings.audio.sfx);

    // Gameplay
    setSlider('slider-edgepan', 'setting-edgepan-value', settings.gameplay.edgePanSpeed);
    setSlider('slider-scroll', 'setting-scroll-value', settings.gameplay.scrollSpeed);
    setToggle('setting-grid', settings.gameplay.showGrid);
    (element.querySelector('#setting-healthbars') as HTMLSelectElement).value = settings.gameplay.healthBars;
  }

  function readUI(): void {
    settings = {
      graphics: {
        quality: (element.querySelector('#setting-quality') as HTMLSelectElement).value as GameSettings['graphics']['quality'],
        shadows: getToggle('setting-shadows'),
        vsync: getToggle('setting-vsync'),
      },
      audio: {
        master: getSliderValue('setting-master-value'),
        music: getSliderValue('setting-music-value'),
        sfx: getSliderValue('setting-sfx-value'),
      },
      gameplay: {
        edgePanSpeed: getSliderValue('setting-edgepan-value'),
        scrollSpeed: getSliderValue('setting-scroll-value'),
        showGrid: getToggle('setting-grid'),
        healthBars: (element.querySelector('#setting-healthbars') as HTMLSelectElement).value as GameSettings['gameplay']['healthBars'],
      },
    };
  }

  let escHandler: ((e: KeyboardEvent) => void) | null = null;

  const onEnter = () => {
    settings = loadSettings();
    updateUI();

    // ESC key to go back
    escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        callbacks.onBack();
      }
    };
    document.addEventListener('keydown', escHandler);

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

    // Quality dropdown -> update signal bars
    element.querySelector('#setting-quality')?.addEventListener('change', updateSignalBars);

    // Toggle switches
    const toggles = ['setting-shadows', 'setting-vsync', 'setting-grid'];
    for (const id of toggles) {
      const toggle = element.querySelector(`#${id}`) as HTMLElement;
      if (toggle) {
        const handler = () => {
          const isActive = toggle.classList.contains('active');
          setToggle(id, !isActive);
        };
        toggle.addEventListener('click', handler);
        toggle.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handler();
          }
        });
      }
    }

    // Bind custom sliders
    bindSlider('slider-master', 'setting-master-value');
    bindSlider('slider-music', 'setting-music-value');
    bindSlider('slider-sfx', 'setting-sfx-value');
    bindSlider('slider-edgepan', 'setting-edgepan-value');
    bindSlider('slider-scroll', 'setting-scroll-value');
  };

  const onExit = () => {
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  };

  return {
    type: ScreenType.Settings,
    element,
    onEnter,
    onExit,
  };
}
