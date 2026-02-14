/**
 * MainMenuScreen - The main menu of the game
 * Gothic themed with glitch title, aquila crest, organ pipes, and flourished buttons
 */

import { ScreenType, type Screen } from '../core/ScreenManager';
import { isAuthenticated, getUsername } from '../api/ApiClient';

export interface MainMenuCallbacks {
  onSkirmish: () => void;
  onJoinGame: () => void;
  onArmoury: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onLogin?: () => void;
  onLogout?: () => void;
}

export function createMainMenuScreen(callbacks: MainMenuCallbacks): Screen {
  const element = document.createElement('div');
  element.id = 'main-menu-screen';
  element.innerHTML = `
    <div class="menu-container">
      <div class="aquila-crest">\u269C \u2720 \u269C</div>

      <div class="title-reticle-wrap">
        <div class="reticle-bracket reticle-tl"></div>
        <div class="reticle-bracket reticle-tr"></div>
        <div class="reticle-bracket reticle-bl"></div>
        <div class="reticle-bracket reticle-br"></div>
        <h1 class="game-title" data-text="STELLAR SIEGE">STELLAR SIEGE</h1>
        <div class="title-scanlines"></div>
        <p class="game-subtitle">Planetary Conflict</p>
      </div>

      <span class="fleet-id">BATTLEFLEET OBSCURUS // MANDATE 7741-SIGMA // CRUSADE AUTHORITY ACTIVE</span>

      <div class="gothic-divider">
        <div class="line"></div>
        <span class="sym">\u2720</span>
        <span class="sym">\u2698</span>
        <span class="sym">\u2720</span>
        <div class="line"></div>
      </div>

      <div class="menu-buttons">
        <button class="menu-btn primary" id="btn-skirmish"><span class="btn-flourish">\u269C</span> SKIRMISH <span class="btn-flourish">\u269C</span></button>
        <button class="menu-btn" id="btn-join-game"><span class="btn-flourish">\u2726</span> JOIN GAME <span class="btn-flourish">\u2726</span></button>
        <button class="menu-btn" id="btn-armoury"><span class="btn-flourish">\u2726</span> ARMOURY <span class="btn-flourish">\u2726</span></button>
        <button class="menu-btn" id="btn-settings"><span class="btn-flourish">\u2726</span> SETTINGS <span class="btn-flourish">\u2726</span></button>
        <button class="menu-btn" id="btn-auth"><span class="btn-flourish">\u2726</span> LOGIN <span class="btn-flourish">\u2726</span></button>
        <button class="menu-btn corrupted" id="btn-quit"><span class="btn-flourish warp">\u2620</span> QUIT <span class="btn-flourish warp">\u2620</span></button>
      </div>

      <div class="gothic-divider" style="margin-top:8px;">
        <div class="line"></div>
        <span class="sym">\u269C</span>
        <span class="sym">\u2020</span>
        <span class="sym">\u269C</span>
        <div class="line"></div>
      </div>

      <div class="organ-pipes">
        <div class="organ-pipe"></div><div class="organ-pipe"></div><div class="organ-pipe"></div><div class="organ-pipe"></div>
        <div class="organ-pipe"></div>
        <div class="organ-pipe"></div><div class="organ-pipe"></div><div class="organ-pipe"></div><div class="organ-pipe"></div>
      </div>

      <div class="user-identity" id="user-identity"></div>

      <span class="menu-footer">v0.5.0 \u2014 A-move Studios</span>
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
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 100;
    }

    #main-menu-screen .menu-container {
      text-align: center;
      padding: 40px 20px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      max-width: 680px;
      width: 100%;
      animation: sectionBootUp 1.0s ease-out both;
    }

    #main-menu-screen .fleet-id {
      font-family: var(--font-mono);
      font-size: 9px;
      color: var(--blue-dim);
      letter-spacing: 3px;
      opacity: 0.6;
    }

    #main-menu-screen .menu-buttons {
      display: flex;
      flex-direction: column;
      gap: 7px;
      width: 100%;
      max-width: 330px;
    }

    #main-menu-screen .menu-btn:focus-visible {
      outline: 2px solid var(--blue-primary);
      outline-offset: 2px;
    }

    #main-menu-screen .user-identity {
      display: none;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 2px;
      color: var(--steel-bright);
      padding: 6px 16px;
      border: 1px solid rgba(196, 164, 74, 0.2);
      background: rgba(196, 164, 74, 0.04);
    }
    #main-menu-screen .user-identity.visible {
      display: flex;
    }
    #main-menu-screen .user-identity .ident-label {
      color: var(--blue-dim);
      font-size: 9px;
    }
    #main-menu-screen .user-identity .ident-name {
      color: var(--gold, #c4a44a);
      text-transform: uppercase;
    }
    #main-menu-screen .user-identity .ident-sym {
      color: var(--gold-dim, #8a7030);
      font-size: 8px;
      opacity: 0.6;
    }

    #main-menu-screen .menu-footer {
      font-family: var(--font-mono);
      font-size: 9px;
      color: var(--steel-bright);
      letter-spacing: 2px;
      opacity: 0.6;
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
    element.querySelector('#btn-armoury')?.addEventListener('click', callbacks.onArmoury);
    element.querySelector('#btn-settings')?.addEventListener('click', callbacks.onSettings);
    element.querySelector('#btn-quit')?.addEventListener('click', callbacks.onQuit);

    // Dynamic auth button: LOGIN if guest, LOGOUT if authenticated
    const authBtn = element.querySelector('#btn-auth') as HTMLButtonElement | null;
    const identityEl = element.querySelector('#user-identity') as HTMLElement | null;
    if (authBtn) {
      if (isAuthenticated()) {
        authBtn.innerHTML = '<span class="btn-flourish">\u2726</span> LOGOUT <span class="btn-flourish">\u2726</span>';
        if (callbacks.onLogout) {
          authBtn.addEventListener('click', callbacks.onLogout);
        }
        // Show authenticated user identity
        const username = getUsername();
        if (identityEl && username) {
          identityEl.innerHTML = `<span class="ident-sym">\u2720</span> <span class="ident-label">OPERATIVE:</span> <span class="ident-name"></span> <span class="ident-sym">\u2720</span>`;
          const nameEl = identityEl.querySelector('.ident-name');
          if (nameEl) nameEl.textContent = username;
          identityEl.classList.add('visible');
        }
      } else {
        authBtn.innerHTML = '<span class="btn-flourish">\u2726</span> LOGIN <span class="btn-flourish">\u2726</span>';
        if (callbacks.onLogin) {
          authBtn.addEventListener('click', callbacks.onLogin);
        }
        // Hide identity when not authenticated
        if (identityEl) {
          identityEl.classList.remove('visible');
        }
      }
    }
  };

  return {
    type: ScreenType.MainMenu,
    element,
    onEnter,
  };
}
