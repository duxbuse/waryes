/**
 * JoinGameScreen - Enter game code to join multiplayer lobby
 *
 * Features:
 * - Game code input field (XXXX-NNNN format)
 * - Game browser showing all open lobbies
 * - Join button
 * - Back to main menu
 */

import type { Game } from '../core/Game';
import { ScreenType } from '../core/ScreenManager';
import type { LobbyListItem } from '../game/managers/MultiplayerManager';
import { showNotification } from '../core/UINotifications';

export class JoinGameScreen {
  private readonly game: Game;
  private container: HTMLElement;
  private codeInput: HTMLInputElement | null = null;
  private lobbyList: HTMLElement | null = null;
  private refreshInterval: number | null = null;

  constructor(game: Game) {
    this.game = game;
    this.container = this.createScreen();
  }

  private createScreen(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'join-game-screen';
    container.className = 'screen';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    // Add focus-visible styles
    const style = document.createElement('style');
    style.textContent = `
      #join-game-screen button:focus-visible {
        outline: 3px solid #4a90e2;
        outline-offset: 2px;
        box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.3), 0 0 20px rgba(74, 144, 226, 0.5);
      }
      #join-game-screen input:focus-visible {
        outline: 3px solid #4a90e2;
        outline-offset: 2px;
        box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.3), 0 0 20px rgba(74, 144, 226, 0.5);
      }
    `;
    container.appendChild(style);

    // Main panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(26, 26, 46, 0.95);
      border: 2px solid #4a90e2;
      border-radius: 12px;
      padding: 40px;
      max-width: 800px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    `;

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Join Multiplayer Game';
    title.style.cssText = `
      color: #4a90e2;
      font-size: 36px;
      margin: 0 0 30px 0;
      text-align: center;
      text-shadow: 0 0 20px rgba(74, 144, 226, 0.5);
    `;

    // Code input section
    const codeSection = document.createElement('div');
    codeSection.style.cssText = `
      margin-bottom: 40px;
    `;

    const codeLabel = document.createElement('label');
    codeLabel.textContent = 'Enter Game Code:';
    codeLabel.style.cssText = `
      color: #e0e0e0;
      font-size: 18px;
      display: block;
      margin-bottom: 10px;
    `;

    const codeInputContainer = document.createElement('div');
    codeInputContainer.style.cssText = `
      display: flex;
      gap: 10px;
    `;

    this.codeInput = document.createElement('input');
    this.codeInput.type = 'text';
    this.codeInput.placeholder = 'XXXX-NNNN';
    this.codeInput.maxLength = 9;
    this.codeInput.style.cssText = `
      flex: 1;
      padding: 12px 20px;
      font-size: 20px;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid #4a90e2;
      border-radius: 8px;
      color: #e0e0e0;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 2px;
    `;

    // Auto-format input
    this.codeInput.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      let value = input.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();

      if (value.length > 4) {
        value = value.slice(0, 4) + '-' + value.slice(4, 8);
      }

      input.value = value;
    });

    const joinButton = document.createElement('button');
    joinButton.textContent = 'JOIN';
    joinButton.className = 'btn-primary';
    joinButton.style.cssText = `
      padding: 12px 30px;
      font-size: 18px;
      background: #4a90e2;
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      transition: all 0.3s;
    `;

    joinButton.addEventListener('mouseenter', () => {
      joinButton.style.background = '#357abd';
      joinButton.style.transform = 'scale(1.05)';
    });

    joinButton.addEventListener('mouseleave', () => {
      joinButton.style.background = '#4a90e2';
      joinButton.style.transform = 'scale(1)';
    });

    joinButton.addEventListener('click', () => this.joinByCode());

    // Allow Enter key to join
    this.codeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.joinByCode();
      }
    });

    codeInputContainer.appendChild(this.codeInput);
    codeInputContainer.appendChild(joinButton);
    codeSection.appendChild(codeLabel);
    codeSection.appendChild(codeInputContainer);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 2px;
      background: linear-gradient(90deg, transparent, #4a90e2, transparent);
      margin: 30px 0;
    `;

    // Lobby browser section
    const browserSection = document.createElement('div');

    const browserTitle = document.createElement('h2');
    browserTitle.textContent = 'Open Lobbies';
    browserTitle.style.cssText = `
      color: #e0e0e0;
      font-size: 24px;
      margin: 0 0 15px 0;
    `;

    this.lobbyList = document.createElement('div');
    this.lobbyList.style.cssText = `
      max-height: 300px;
      overflow-y: auto;
    `;

    browserSection.appendChild(browserTitle);
    browserSection.appendChild(this.lobbyList);

    // Back button
    const backButton = document.createElement('button');
    backButton.textContent = 'BACK TO MENU';
    backButton.className = 'btn-secondary';
    backButton.style.cssText = `
      width: 100%;
      padding: 12px;
      margin-top: 30px;
      font-size: 16px;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid #666;
      border-radius: 8px;
      color: #e0e0e0;
      cursor: pointer;
      transition: all 0.3s;
    `;

    backButton.addEventListener('mouseenter', () => {
      backButton.style.background = 'rgba(255, 255, 255, 0.2)';
    });

    backButton.addEventListener('mouseleave', () => {
      backButton.style.background = 'rgba(255, 255, 255, 0.1)';
    });

    backButton.addEventListener('click', () => {
      this.game.screenManager.switchTo(ScreenType.MainMenu);
    });

    // Assemble
    panel.appendChild(title);
    panel.appendChild(codeSection);
    panel.appendChild(divider);
    panel.appendChild(browserSection);
    panel.appendChild(backButton);
    container.appendChild(panel);

    return container;
  }

  private async joinByCode(): Promise<void> {
    if (!this.codeInput) return;

    const code = this.codeInput.value.trim().toUpperCase();

    if (code.length !== 9 || !code.match(/^[A-Z]{4}-[0-9]{4}$/)) {
      showNotification('Invalid game code format. Use XXXX-NNNN (4 letters, 4 numbers)');
      return;
    }

    try {
      await this.game.multiplayerManager.joinLobby(code);
      // On success, screen will change via callback
    } catch (error) {
      showNotification(`Failed to join game: ${error}`);
    }
  }

  private async refreshLobbyList(): Promise<void> {
    if (!this.lobbyList) return;

    try {
      const lobbies = await this.game.multiplayerManager.getOpenLobbies();

      if (lobbies.length === 0) {
        this.lobbyList.innerHTML = `
          <div style="
            text-align: center;
            color: #bbb;
            padding: 40px 20px;
            font-size: 18px;
          ">
            No open lobbies found.<br>
            Create a lobby from Skirmish Setup!
          </div>
        `;
        return;
      }

      this.lobbyList.innerHTML = '';

      lobbies.forEach((lobby: LobbyListItem) => {
        const lobbyCard = this.createLobbyCard(lobby);
        this.lobbyList!.appendChild(lobbyCard);
      });
    } catch (error) {
      console.error('[JoinGame] Failed to refresh lobbies:', error);
      this.lobbyList.innerHTML = `
        <div style="
          text-align: center;
          color: #ff6b6b;
          padding: 40px 20px;
          font-size: 18px;
        ">
          Failed to connect to server.<br>
          Is the multiplayer server running?
        </div>
      `;
    }
  }

  private createLobbyCard(lobby: LobbyListItem): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid #4a90e2;
      border-radius: 8px;
      padding: 15px 20px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.3s;
    `;

    card.addEventListener('mouseenter', () => {
      card.style.background = 'rgba(74, 144, 226, 0.1)';
      card.style.transform = 'translateX(5px)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.background = 'rgba(255, 255, 255, 0.05)';
      card.style.transform = 'translateX(0)';
    });

    const info = document.createElement('div');
    info.style.cssText = `
      flex: 1;
    `;

    const code = document.createElement('div');
    code.textContent = lobby.code;
    code.style.cssText = `
      font-size: 20px;
      font-weight: bold;
      color: #4a90e2;
      letter-spacing: 2px;
      margin-bottom: 5px;
    `;

    const details = document.createElement('div');
    details.textContent = `Host: ${lobby.host} • ${lobby.mapSize} • ${lobby.playerCount}/${lobby.maxPlayers} players`;
    details.style.cssText = `
      font-size: 14px;
      color: #ccc;
    `;

    info.appendChild(code);
    info.appendChild(details);

    const joinBtn = document.createElement('button');
    joinBtn.textContent = 'JOIN';
    joinBtn.style.cssText = `
      padding: 8px 20px;
      background: #4a90e2;
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s;
    `;

    joinBtn.addEventListener('mouseenter', () => {
      joinBtn.style.background = '#357abd';
    });

    joinBtn.addEventListener('mouseleave', () => {
      joinBtn.style.background = '#4a90e2';
    });

    joinBtn.addEventListener('click', async () => {
      try {
        await this.game.multiplayerManager.joinLobby(lobby.code);
      } catch (error) {
        showNotification(`Failed to join: ${error}`);
      }
    });

    card.appendChild(info);
    card.appendChild(joinBtn);

    return card;
  }

  show(): void {
    this.container.style.display = 'flex';
    if (this.codeInput) {
      this.codeInput.value = '';
      this.codeInput.focus();
    }

    // Start auto-refresh
    this.refreshLobbyList();
    this.refreshInterval = window.setInterval(() => {
      this.refreshLobbyList();
    }, 5000); // Refresh every 5 seconds
  }

  hide(): void {
    this.container.style.display = 'none';

    // Stop auto-refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
