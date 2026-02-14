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
import { showNotification, showConfirmDialog } from '../core/UINotifications';

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
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(game: Game) {
    this.game = game;
    this.container = document.createElement('div');
    this.container.id = 'game-lobby-screen';
    this.buildScreen();
    this.injectStyles();
    this.setupCallbacks();
  }

  private buildScreen(): void {
    this.container.innerHTML = `
      <div class="lobby-container">
        <div class="lobby-header">
          <button class="back-btn" id="lobby-leave-btn">&larr; Leave</button>
          <h2>GAME LOBBY</h2>
          <div class="lobby-game-code">
            <span class="code-label">Game Code:</span>
            <span class="code-value" id="lobby-code-value">----</span>
            <button class="copy-btn" id="lobby-copy-btn">COPY</button>
          </div>
        </div>
        <div class="gothic-divider" style="align-self: center;">
          <div class="line"></div>
          <span class="sym">&#10016;</span>
          <span class="sym">&#9880;</span>
          <span class="sym">&#10016;</span>
          <div class="line"></div>
        </div>

        <div class="lobby-content">
          <div class="teams-row">
            <div class="setup-section team-section">
              <div class="corner-flourish tl"><div class="diamond"></div></div>
              <div class="corner-flourish tr"><div class="diamond"></div></div>
              <div class="corner-flourish bl"><div class="diamond"></div></div>
              <div class="corner-flourish br"><div class="diamond"></div></div>
              <h3>Team 1 (Defenders)</h3>
              <div id="lobby-team1-slots" class="team-slots"></div>
            </div>
            <div class="setup-section team-section">
              <div class="corner-flourish tl"><div class="diamond"></div></div>
              <div class="corner-flourish tr"><div class="diamond"></div></div>
              <div class="corner-flourish bl"><div class="diamond"></div></div>
              <div class="corner-flourish br"><div class="diamond"></div></div>
              <h3>Team 2 (Attackers)</h3>
              <div id="lobby-team2-slots" class="team-slots"></div>
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
        <div class="lobby-footer">
          <button id="lobby-ready-btn" class="lobby-action-btn ready-btn">
            &#9884; READY &#9884;
          </button>
          <button id="lobby-start-btn" class="lobby-action-btn start-btn" style="display:none;">
            &#9884; START GAME &#9884;
          </button>
          <button id="lobby-leave-btn-footer" class="lobby-action-btn leave-btn">
            &#9884; LEAVE LOBBY &#9884;
          </button>
        </div>
      </div>
    `;
  }

  private injectStyles(): void {
    if (document.getElementById('game-lobby-styles')) return;

    const style = document.createElement('style');
    style.id = 'game-lobby-styles';
    style.textContent = `
      #game-lobby-screen {
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

      #game-lobby-screen.hidden {
        display: none;
      }

      .lobby-container {
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

      .lobby-container::before {
        content: '';
        position: absolute;
        inset: -3px;
        border: 1px solid var(--gold-dim);
        opacity: 0.15;
        pointer-events: none;
      }

      .lobby-container::after {
        content: '\\269C';
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

      .lobby-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 2px solid var(--gold-dim);
        position: relative;
      }

      .lobby-header h2 {
        color: var(--amber);
        font-family: var(--font-heading);
        letter-spacing: 4px;
        margin: 0;
        font-size: 18px;
        text-shadow: 0 0 12px rgba(255, 136, 0, 0.3);
      }

      .lobby-game-code {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .lobby-game-code .code-label {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--steel-bright);
        letter-spacing: 1px;
        text-transform: uppercase;
      }

      .lobby-game-code .code-value {
        font-family: var(--font-mono);
        font-size: 20px;
        font-weight: bold;
        color: var(--amber);
        letter-spacing: 3px;
        text-shadow: 0 0 10px rgba(255, 136, 0, 0.4);
      }

      .lobby-game-code .copy-btn {
        padding: 4px 12px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 1px;
        background: linear-gradient(180deg, var(--steel-light), var(--steel-mid));
        border: 1px solid var(--steel-highlight);
        color: var(--gold);
        cursor: pointer;
        transition: all 0.2s;
      }

      .lobby-game-code .copy-btn:hover {
        background: linear-gradient(180deg, var(--steel-highlight), var(--steel-light));
        border-color: var(--gold);
        color: var(--gold-light);
      }

      .lobby-game-code .copy-btn:focus-visible {
        outline: 2px solid var(--blue-primary);
        outline-offset: 2px;
      }

      .lobby-content {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 15px;
        overflow-y: auto;
        min-height: 0;
        max-height: calc(90vh - 220px);
      }

      /* Player slot styling for lobby */
      .lobby-player-slot {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid var(--steel-light);
        font-size: 13px;
        min-height: 46px;
        transition: border-color 0.2s;
      }

      .lobby-player-slot.ready {
        border-color: var(--cyan);
        background: rgba(0, 255, 204, 0.06);
      }

      .lobby-player-slot.is-you {
        background: rgba(0, 170, 255, 0.12);
        border-color: rgba(0, 170, 255, 0.4);
      }

      .lobby-player-slot.is-you.ready {
        border-color: var(--cyan);
        background: rgba(0, 255, 204, 0.1);
      }

      .lobby-player-name {
        flex: 1;
        font-family: var(--font-heading);
        font-size: 13px;
        font-weight: bold;
        color: #e0e0e0;
      }

      .lobby-player-name .host-badge {
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--amber);
        letter-spacing: 1px;
        margin-left: 6px;
        opacity: 0.8;
      }

      .lobby-player-name .you-badge {
        font-family: var(--font-mono);
        font-size: 9px;
        background: var(--blue-primary);
        color: #000;
        padding: 1px 5px;
        margin-left: 6px;
      }

      .lobby-player-status {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 1px;
      }

      .lobby-player-status.ready {
        color: var(--cyan);
      }

      .lobby-player-status.not-ready {
        color: var(--steel-bright);
        opacity: 0.6;
      }

      .lobby-kick-btn {
        padding: 3px 8px;
        font-family: var(--font-mono);
        font-size: 10px;
        background: rgba(255, 34, 0, 0.2);
        border: 1px solid rgba(255, 34, 0, 0.4);
        color: var(--red-glow);
        cursor: pointer;
        transition: all 0.2s;
      }

      .lobby-kick-btn:hover {
        background: rgba(255, 34, 0, 0.4);
        color: #fff;
      }

      .lobby-kick-btn:focus-visible {
        outline: 2px solid var(--red-glow);
        outline-offset: 2px;
      }

      .lobby-empty-slot {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        min-height: 46px;
        border: 1px dashed var(--steel-light);
        opacity: 0.3;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--steel-bright);
        letter-spacing: 2px;
      }

      .lobby-footer {
        display: flex;
        gap: 15px;
        justify-content: center;
        flex-shrink: 0;
        padding-bottom: 10px;
      }

      .lobby-action-btn {
        padding: 14px 40px;
        font-family: var(--font-heading);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 3px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s;
        clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%);
      }

      .lobby-action-btn:focus-visible {
        outline: 2px solid var(--blue-primary);
        outline-offset: 2px;
      }

      .lobby-action-btn.ready-btn {
        background: linear-gradient(180deg, rgba(0, 255, 204, 0.3), rgba(0, 200, 160, 0.2));
        border: 1px solid var(--cyan);
        color: var(--cyan);
        text-shadow: 0 0 8px rgba(0, 255, 204, 0.4);
      }

      .lobby-action-btn.ready-btn:hover {
        background: linear-gradient(180deg, rgba(0, 255, 204, 0.5), rgba(0, 200, 160, 0.3));
        box-shadow: 0 0 20px rgba(0, 255, 204, 0.3);
        color: #fff;
      }

      .lobby-action-btn.ready-btn.is-ready {
        background: linear-gradient(180deg, rgba(255, 34, 0, 0.3), rgba(200, 20, 0, 0.2));
        border-color: var(--red-glow);
        color: var(--red-glow);
        text-shadow: 0 0 8px rgba(255, 34, 0, 0.4);
      }

      .lobby-action-btn.ready-btn.is-ready:hover {
        background: linear-gradient(180deg, rgba(255, 34, 0, 0.5), rgba(200, 20, 0, 0.3));
        box-shadow: 0 0 20px rgba(255, 34, 0, 0.3);
        color: #fff;
      }

      .lobby-action-btn.start-btn {
        background: linear-gradient(180deg, rgba(255, 136, 0, 0.3), rgba(255, 136, 0, 0.15));
        border: 1px solid var(--amber);
        color: var(--amber-light);
        text-shadow: 0 0 8px rgba(255, 136, 0, 0.4);
      }

      .lobby-action-btn.start-btn:hover {
        background: linear-gradient(180deg, rgba(255, 136, 0, 0.5), rgba(255, 136, 0, 0.25));
        box-shadow: 0 0 20px rgba(255, 136, 0, 0.3);
        color: #fff;
      }

      .lobby-action-btn.leave-btn {
        background: linear-gradient(180deg, var(--steel-light), var(--steel-mid));
        border: 1px solid var(--steel-highlight);
        color: var(--steel-bright);
      }

      .lobby-action-btn.leave-btn:hover {
        background: linear-gradient(180deg, var(--steel-highlight), var(--steel-light));
        color: #e0e0e0;
      }
    `;
    document.head.appendChild(style);
  }

  private bindEvents(): void {
    // Copy button
    this.container.querySelector('#lobby-copy-btn')?.addEventListener('click', () => {
      const codeEl = this.container.querySelector('#lobby-code-value');
      const code = codeEl?.textContent;
      if (code && code !== '----') {
        navigator.clipboard.writeText(code);
        const btn = this.container.querySelector('#lobby-copy-btn') as HTMLButtonElement;
        btn.textContent = 'COPIED!';
        setTimeout(() => { btn.textContent = 'COPY'; }, 2000);
      }
    });

    // Leave buttons (header + footer)
    this.container.querySelector('#lobby-leave-btn')?.addEventListener('click', () => this.leaveLobby());
    this.container.querySelector('#lobby-leave-btn-footer')?.addEventListener('click', () => this.leaveLobby());

    // Ready button
    this.container.querySelector('#lobby-ready-btn')?.addEventListener('click', () => this.toggleReady());

    // Start button
    this.container.querySelector('#lobby-start-btn')?.addEventListener('click', () => this.startGame());
  }

  private setupCallbacks(): void {
    this.game.multiplayerManager.on('player_joined', () => this.refreshPlayerLists());
    this.game.multiplayerManager.on('player_left', () => this.refreshPlayerLists());
    this.game.multiplayerManager.on('player_updated', () => this.refreshPlayerLists());

    this.game.multiplayerManager.on('game_starting', (mapSeed: number, mapSize: string) => {
      showNotification(`Game starting! Map: ${mapSize}, Seed: ${mapSeed}`, 5000);

      const lobby = this.game.multiplayerManager.getCurrentLobby();
      const playerId = this.game.multiplayerManager.getPlayerId();
      const player = lobby?.players.find(p => p.id === playerId);
      const deckId = player?.deckId ?? null;
      const playerTeam = player?.team === 'team2' ? 'team2' : 'team1';

      this.game.startMultiplayerBattle(
        mapSeed,
        mapSize as 'small' | 'medium' | 'large',
        deckId,
        playerTeam,
      );
    });

    this.game.multiplayerManager.on('kicked', () => {
      showNotification('You were kicked from the lobby', 5000);
      this.game.screenManager.switchTo(ScreenType.MainMenu);
    });
  }

  private refreshPlayerLists(): void {
    const lobby = this.game.multiplayerManager.getCurrentLobby();
    if (!lobby) return;

    // Update game code
    const codeEl = this.container.querySelector('#lobby-code-value');
    if (codeEl) codeEl.textContent = lobby.code;

    const team1Container = this.container.querySelector('#lobby-team1-slots');
    const team2Container = this.container.querySelector('#lobby-team2-slots');
    if (!team1Container || !team2Container) return;

    const playerId = this.game.multiplayerManager.getPlayerId();
    const isHost = this.game.multiplayerManager.isHost();

    const team1Players = lobby.players.filter((p: MultiplayerPlayer) => p.team === 'team1');
    const team2Players = lobby.players.filter((p: MultiplayerPlayer) => p.team === 'team2');

    // Render team slots (5 slots per team, fill empty with placeholder)
    team1Container.innerHTML = this.renderTeamSlots(team1Players, playerId, isHost);
    team2Container.innerHTML = this.renderTeamSlots(team2Players, playerId, isHost);

    // Bind kick buttons
    this.container.querySelectorAll('.lobby-kick-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const kickId = target.dataset['playerId'];
        const kickName = target.dataset['playerName'] ?? 'this player';
        if (kickId) {
          const confirmed = await showConfirmDialog(`Kick ${kickName}?`);
          if (confirmed) {
            this.game.multiplayerManager.kickPlayer(kickId);
          }
        }
      });
    });

    // Show/hide start button based on host status
    const startBtn = this.container.querySelector('#lobby-start-btn') as HTMLElement;
    if (startBtn) {
      startBtn.style.display = isHost ? 'block' : 'none';
    }
  }

  private renderTeamSlots(players: MultiplayerPlayer[], currentPlayerId: string, isHost: boolean): string {
    const maxSlots = 5;
    let html = '';

    for (let i = 0; i < maxSlots; i++) {
      const player = players[i];
      if (player) {
        const isYou = player.id === currentPlayerId;
        const slotClass = `lobby-player-slot${player.isReady ? ' ready' : ''}${isYou ? ' is-you' : ''}`;
        const statusClass = player.isReady ? 'ready' : 'not-ready';
        const statusText = player.isReady ? '\u2713 READY' : 'WAITING';

        let badges = '';
        if (player.isHost) badges += '<span class="host-badge">(HOST)</span>';
        if (isYou) badges += '<span class="you-badge">YOU</span>';

        let kickBtn = '';
        if (isHost && !isYou) {
          kickBtn = `<button class="lobby-kick-btn" data-player-id="${sanitizeHTML(player.id)}" data-player-name="${sanitizeHTML(player.name)}">KICK</button>`;
        }

        html += `
          <div class="${slotClass}">
            <span class="lobby-player-name">${sanitizeHTML(player.name)}${badges}</span>
            <span class="lobby-player-status ${statusClass}">${statusText}</span>
            ${kickBtn}
          </div>
        `;
      } else {
        html += `<div class="lobby-empty-slot">OPEN SLOT</div>`;
      }
    }

    return html;
  }

  private toggleReady(): void {
    const readyBtn = this.container.querySelector('#lobby-ready-btn') as HTMLButtonElement;
    if (!readyBtn) return;

    const isCurrentlyReady = readyBtn.classList.contains('is-ready');

    this.game.multiplayerManager.updatePlayerState({
      isReady: !isCurrentlyReady,
    });

    if (!isCurrentlyReady) {
      readyBtn.classList.add('is-ready');
      readyBtn.innerHTML = '&#9884; NOT READY &#9884;';
    } else {
      readyBtn.classList.remove('is-ready');
      readyBtn.innerHTML = '&#9884; READY &#9884;';
    }
  }

  private startGame(): void {
    this.game.multiplayerManager.startGame();
  }

  private async leaveLobby(): Promise<void> {
    const confirmed = await showConfirmDialog('Leave lobby?');
    if (confirmed) {
      this.game.multiplayerManager.leaveLobby();
      this.game.screenManager.switchTo(ScreenType.MainMenu);
    }
  }

  show(): void {
    this.container.style.display = 'flex';
    this.bindEvents();
    this.refreshPlayerLists();

    // Reset ready button state
    const readyBtn = this.container.querySelector('#lobby-ready-btn') as HTMLButtonElement;
    if (readyBtn) {
      readyBtn.classList.remove('is-ready');
      readyBtn.innerHTML = '&#9884; READY &#9884;';
    }

    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.leaveLobby();
      }
    };
    document.addEventListener('keydown', this.escHandler);
  }

  hide(): void {
    this.container.style.display = 'none';

    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
