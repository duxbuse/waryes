/**
 * GameLobbyScreen - Multiplayer lobby where players prepare for battle
 *
 * Features:
 * - Show all players with team assignments
 * - Team selection (Team 1 / Team 2 / Spectator)
 * - Deck selection
 * - Ready status
 * - Host can kick players and start game
 * - Display game code for sharing
 */

import type { Game } from '../core/Game';
import { ScreenType } from '../core/ScreenManager';
import type { MultiplayerPlayer } from '../game/managers/MultiplayerManager';

// Helper to sanitize HTML to prevent XSS (defense-in-depth)
function sanitizeHTML(str: string | number): string {
  const text = String(str);
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export class GameLobbyScreen {
  private readonly game: Game;
  private container: HTMLElement;
  private gameCodeDisplay: HTMLElement | null = null;
  private team1List: HTMLElement | null = null;
  private team2List: HTMLElement | null = null;
  private spectatorsList: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private readyButton: HTMLButtonElement | null = null;

  constructor(game: Game) {
    this.game = game;
    this.container = this.createScreen();
    this.setupCallbacks();
  }

  private createScreen(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'game-lobby-screen';
    container.className = 'screen';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      display: none;
      padding: 40px;
      overflow-y: auto;
      z-index: 1000;
    `;

    // Main panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      max-width: 1200px;
      margin: 0 auto;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
    `;

    const title = document.createElement('h1');
    title.textContent = 'Game Lobby';
    title.style.cssText = `
      color: #4a90e2;
      font-size: 36px;
      margin: 0;
      text-shadow: 0 0 20px rgba(74, 144, 226, 0.5);
    `;

    this.gameCodeDisplay = document.createElement('div');
    this.gameCodeDisplay.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
    `;

    const codeLabel = document.createElement('span');
    codeLabel.textContent = 'Game Code:';
    codeLabel.style.cssText = `
      color: #e0e0e0;
      font-size: 18px;
    `;

    const codeValue = document.createElement('span');
    codeValue.id = 'game-code-value';
    codeValue.textContent = '----';
    codeValue.style.cssText = `
      color: #4a90e2;
      font-size: 24px;
      font-weight: bold;
      letter-spacing: 2px;
    `;

    const copyButton = document.createElement('button');
    copyButton.textContent = 'COPY';
    copyButton.style.cssText = `
      padding: 8px 16px;
      background: #4a90e2;
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s;
    `;

    copyButton.addEventListener('click', () => {
      const code = codeValue.textContent;
      if (code && code !== '----') {
        navigator.clipboard.writeText(code);
        copyButton.textContent = 'COPIED!';
        setTimeout(() => {
          copyButton.textContent = 'COPY';
        }, 2000);
      }
    });

    this.gameCodeDisplay.appendChild(codeLabel);
    this.gameCodeDisplay.appendChild(codeValue);
    this.gameCodeDisplay.appendChild(copyButton);

    header.appendChild(title);
    header.appendChild(this.gameCodeDisplay);

    // Teams section
    const teamsSection = document.createElement('div');
    teamsSection.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    `;

    // Team 1
    const team1Panel = this.createTeamPanel('Team 1', '#4a90e2');
    this.team1List = team1Panel.querySelector('.player-list') as HTMLElement;

    // Team 2
    const team2Panel = this.createTeamPanel('Team 2', '#e24a4a');
    this.team2List = team2Panel.querySelector('.player-list') as HTMLElement;

    teamsSection.appendChild(team1Panel);
    teamsSection.appendChild(team2Panel);

    // Spectators section
    const spectatorsPanel = document.createElement('div');
    spectatorsPanel.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid #666;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    `;

    const spectatorsTitle = document.createElement('h3');
    spectatorsTitle.textContent = 'Spectators';
    spectatorsTitle.style.cssText = `
      color: #aaa;
      font-size: 20px;
      margin: 0 0 15px 0;
    `;

    this.spectatorsList = document.createElement('div');
    this.spectatorsList.className = 'player-list';
    this.spectatorsList.style.cssText = `
      min-height: 50px;
    `;

    spectatorsPanel.appendChild(spectatorsTitle);
    spectatorsPanel.appendChild(this.spectatorsList);

    // Bottom controls
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      gap: 15px;
      justify-content: center;
    `;

    // Ready button
    this.readyButton = document.createElement('button');
    this.readyButton.textContent = 'READY';
    this.readyButton.style.cssText = `
      flex: 1;
      max-width: 300px;
      padding: 15px;
      font-size: 20px;
      background: #4caf50;
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      transition: all 0.3s;
    `;

    this.readyButton.addEventListener('click', () => this.toggleReady());

    // Start button (host only)
    this.startButton = document.createElement('button');
    this.startButton.textContent = 'START GAME';
    this.startButton.style.cssText = `
      flex: 1;
      max-width: 300px;
      padding: 15px;
      font-size: 20px;
      background: #ff9800;
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      transition: all 0.3s;
      display: none;
    `;

    this.startButton.addEventListener('click', () => this.startGame());

    // Leave button
    const leaveButton = document.createElement('button');
    leaveButton.textContent = 'LEAVE LOBBY';
    leaveButton.style.cssText = `
      flex: 1;
      max-width: 300px;
      padding: 15px;
      font-size: 18px;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid #666;
      border-radius: 8px;
      color: #e0e0e0;
      cursor: pointer;
      transition: all 0.3s;
    `;

    leaveButton.addEventListener('click', () => this.leaveLobby());

    controls.appendChild(this.readyButton);
    controls.appendChild(this.startButton);
    controls.appendChild(leaveButton);

    // Assemble
    panel.appendChild(header);
    panel.appendChild(teamsSection);
    panel.appendChild(spectatorsPanel);
    panel.appendChild(controls);
    container.appendChild(panel);

    return container;
  }

  private createTeamPanel(teamName: string, color: string): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid ${color};
      border-radius: 12px;
      padding: 20px;
    `;

    const title = document.createElement('h2');
    title.textContent = teamName;
    title.style.cssText = `
      color: ${color};
      font-size: 24px;
      margin: 0 0 15px 0;
    `;

    const playerList = document.createElement('div');
    playerList.className = 'player-list';
    playerList.style.cssText = `
      min-height: 200px;
    `;

    panel.appendChild(title);
    panel.appendChild(playerList);

    return panel;
  }

  private setupCallbacks(): void {
    // Player joined
    this.game.multiplayerManager.on('player_joined', () => {
      this.refreshPlayerLists();
    });

    // Player left
    this.game.multiplayerManager.on('player_left', () => {
      this.refreshPlayerLists();
    });

    // Player updated
    this.game.multiplayerManager.on('player_updated', () => {
      this.refreshPlayerLists();
    });

    // Game starting
    this.game.multiplayerManager.on('game_starting', (mapSeed: number, mapSize: string) => {
      alert(`Game starting! Map: ${mapSize}, Seed: ${mapSeed}`);
      // TODO: Transition to battle screen with multiplayer mode
    });

    // Kicked
    this.game.multiplayerManager.on('kicked', () => {
      alert('You were kicked from the lobby');
      this.game.screenManager.switchTo(ScreenType.MainMenu);
    });
  }

  private refreshPlayerLists(): void {
    const lobby = this.game.multiplayerManager.getCurrentLobby();
    if (!lobby) return;

    // Update game code
    const codeValue = this.gameCodeDisplay?.querySelector('#game-code-value');
    if (codeValue) {
      codeValue.textContent = lobby.code;
    }

    // Clear lists
    if (this.team1List) this.team1List.innerHTML = '';
    if (this.team2List) this.team2List.innerHTML = '';
    if (this.spectatorsList) this.spectatorsList.innerHTML = '';

    // Populate lists
    lobby.players.forEach((player: MultiplayerPlayer) => {
      const playerCard = this.createPlayerCard(player);

      if (player.team === 'team1') {
        this.team1List?.appendChild(playerCard);
      } else if (player.team === 'team2') {
        this.team2List?.appendChild(playerCard);
      } else {
        this.spectatorsList?.appendChild(playerCard);
      }
    });

    // Update buttons based on host status
    const isHost = this.game.multiplayerManager.isHost();
    if (this.startButton) {
      this.startButton.style.display = isHost ? 'block' : 'none';
    }
  }

  private createPlayerCard(player: MultiplayerPlayer): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid ${player.isReady ? '#4caf50' : '#666'};
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const info = document.createElement('div');

    const name = document.createElement('div');
    name.textContent = sanitizeHTML(player.name) + (player.isHost ? ' (Host)' : '');
    name.style.cssText = `
      color: #e0e0e0;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 5px;
    `;

    const status = document.createElement('div');
    status.textContent = player.isReady ? '✓ Ready' : 'Not Ready';
    status.style.cssText = `
      color: ${player.isReady ? '#4caf50' : '#888'};
      font-size: 14px;
    `;

    info.appendChild(name);
    info.appendChild(status);

    card.appendChild(info);

    // Kick button (host only, can't kick yourself)
    const isHost = this.game.multiplayerManager.isHost();
    const isCurrentPlayer = player.id === this.game.multiplayerManager.getPlayerId();

    if (isHost && !isCurrentPlayer) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'KICK';
      kickBtn.style.cssText = `
        padding: 6px 12px;
        background: #e74c3c;
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 12px;
      `;

      kickBtn.addEventListener('click', () => {
        if (confirm(`Kick ${sanitizeHTML(player.name)}?`)) {
          this.game.multiplayerManager.kickPlayer(player.id);
        }
      });

      card.appendChild(kickBtn);
    }

    return card;
  }

  private toggleReady(): void {
    if (!this.readyButton) return;

    const currentReady = this.readyButton.textContent === 'NOT READY';

    this.game.multiplayerManager.updatePlayerState({
      isReady: !currentReady,
    });

    this.readyButton.textContent = !currentReady ? 'NOT READY' : 'READY';
    this.readyButton.style.background = !currentReady ? '#f44336' : '#4caf50';
  }

  private startGame(): void {
    this.game.multiplayerManager.startGame();
  }

  private leaveLobby(): void {
    if (confirm('Leave lobby?')) {
      this.game.multiplayerManager.leaveLobby();
      this.game.screenManager.switchTo(ScreenType.MainMenu);
    }
  }

  show(): void {
    this.container.style.display = 'block';
    this.refreshPlayerLists();
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
