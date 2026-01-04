/**
 * MainMenuScreen - The main menu of the game
 */

import { ScreenType, type Screen } from '../core/ScreenManager';

export interface MainMenuCallbacks {
  onSkirmish: () => void;
  onJoinGame: () => void;
  onDeckBuilder: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export function createMainMenuScreen(callbacks: MainMenuCallbacks): Screen {
  const element = document.createElement('div');
  element.id = 'main-menu-screen';
  element.innerHTML = `
    <div class="menu-container">
      <div class="menu-title">
        <h1>STELLAR SIEGE</h1>
        <p class="subtitle">Planetary Conflict</p>
      </div>
      <div class="menu-buttons">
        <button class="menu-btn" id="btn-skirmish">SKIRMISH</button>
        <button class="menu-btn" id="btn-join-game">JOIN GAME</button>
        <button class="menu-btn" id="btn-deck-builder">DECK BUILDER</button>
        <button class="menu-btn" id="btn-settings">SETTINGS</button>
        <button class="menu-btn" id="btn-quit">QUIT</button>
      </div>
      <div class="menu-footer">
        <p>v0.1.0 - Three.js RTS</p>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #main-menu-screen {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a1a 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 100;
    }

    #main-menu-screen .menu-container {
      text-align: center;
      padding: 40px;
    }

    #main-menu-screen .menu-title h1 {
      font-size: 64px;
      font-weight: bold;
      color: #4a9eff;
      text-shadow: 0 0 30px rgba(74, 158, 255, 0.5);
      margin: 0;
      letter-spacing: 8px;
    }

    #main-menu-screen .subtitle {
      font-size: 18px;
      color: #888;
      margin-top: 10px;
      letter-spacing: 4px;
    }

    #main-menu-screen .menu-buttons {
      margin-top: 60px;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    #main-menu-screen .menu-btn {
      padding: 18px 60px;
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 3px;
      background: linear-gradient(135deg, rgba(74, 158, 255, 0.2), rgba(74, 158, 255, 0.1));
      border: 2px solid rgba(74, 158, 255, 0.5);
      color: #e0e0e0;
      cursor: pointer;
      transition: all 0.3s ease;
      border-radius: 4px;
    }

    #main-menu-screen .menu-btn:hover {
      background: linear-gradient(135deg, rgba(74, 158, 255, 0.4), rgba(74, 158, 255, 0.2));
      border-color: #4a9eff;
      color: #fff;
      transform: scale(1.02);
      box-shadow: 0 0 20px rgba(74, 158, 255, 0.3);
    }

    #main-menu-screen .menu-btn:active {
      transform: scale(0.98);
    }

    #main-menu-screen .menu-footer {
      margin-top: 60px;
      color: #444;
      font-size: 12px;
    }

    #main-menu-screen.hidden {
      display: none;
    }
  `;
  document.head.appendChild(style);

  const onEnter = () => {
    // Bind button events
    element.querySelector('#btn-skirmish')?.addEventListener('click', callbacks.onSkirmish);
    element.querySelector('#btn-join-game')?.addEventListener('click', callbacks.onJoinGame);
    element.querySelector('#btn-deck-builder')?.addEventListener('click', callbacks.onDeckBuilder);
    element.querySelector('#btn-settings')?.addEventListener('click', callbacks.onSettings);
    element.querySelector('#btn-quit')?.addEventListener('click', callbacks.onQuit);
  };

  return {
    type: ScreenType.MainMenu,
    element,
    onEnter,
  };
}
