/**
 * Stellar Siege - Main Entry Point
 *
 * This is the entry point for the Three.js RTS game.
 * It initializes the game engine, screens, and starts the main loop.
 */

import { Game } from './core/Game';
import { ScreenType } from './core/ScreenManager';
import { createMainMenuScreen } from './screens/MainMenuScreen';
import { createDeckBuilderScreen } from './screens/DeckBuilderScreen';
import { createSkirmishSetupScreen, type SkirmishConfig } from './screens/SkirmishSetupScreen';
import { createSettingsScreen } from './screens/SettingsScreen';
import { JoinGameScreen } from './screens/JoinGameScreen';
import { GameLobbyScreen } from './screens/GameLobbyScreen';
import { showConfirmDialog } from './core/UINotifications';

// DOM Elements
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const loadingScreen = document.getElementById('loading-screen') as HTMLDivElement;
const loadingProgress = document.getElementById('loading-progress') as HTMLDivElement;
const loadingText = document.getElementById('loading-text') as HTMLDivElement;

// Loading progress helper
function updateLoading(progress: number, text: string): void {
  loadingProgress.style.width = `${progress}%`;
  loadingText.textContent = text;
}

// Main initialization
async function main(): Promise<void> {
  try {
    updateLoading(10, 'Creating game instance...');

    // Create and initialize the game
    const game = new Game(canvas);

    updateLoading(30, 'Loading assets...');
    await game.loadAssets();

    updateLoading(50, 'Setting up screens...');

    // Create and register screens
    const mainMenuScreen = createMainMenuScreen({
      onSkirmish: () => {
        game.screenManager.switchTo(ScreenType.SkirmishSetup);
      },
      onJoinGame: () => {
        game.screenManager.switchTo(ScreenType.JoinGame);
      },
      onDeckBuilder: () => {
        game.screenManager.switchTo(ScreenType.DeckBuilder);
      },
      onSettings: () => {
        game.screenManager.switchTo(ScreenType.Settings);
      },
      onQuit: async () => {
        if (await showConfirmDialog('Are you sure you want to quit?')) {
          window.close();
        }
      },
    });

    const deckBuilderScreen = createDeckBuilderScreen({
      onBack: () => {
        game.screenManager.switchTo(ScreenType.MainMenu);
      },
      onSaveDeck: () => {
        // Deck saved - could show notification
      },
    });

    const skirmishSetupScreen = createSkirmishSetupScreen({
      onBack: () => {
        game.screenManager.switchTo(ScreenType.MainMenu);
      },
      onStartBattle: (config: SkirmishConfig) => {
        if (config.deck) {
          game.startSkirmish(config.deck, config.mapSize, config.mapSeed, config.team1, config.team2, config.biome);
        }
      },
      onHostOnline: async (config: SkirmishConfig) => {
        if (config.deck) {
          try {
            await game.multiplayerManager.createLobby(config.mapSize);
            // Lobby created callback will switch to GameLobby screen
          } catch (error) {
            alert(`Failed to create online lobby: ${error}`);
          }
        }
      },
    });

    const settingsScreen = createSettingsScreen({
      onBack: () => {
        game.screenManager.switchTo(ScreenType.MainMenu);
      },
    });

    // Create multiplayer screens
    const joinGameScreen = new JoinGameScreen(game);
    const gameLobbyScreen = new GameLobbyScreen(game);

    // Setup multiplayer callbacks
    game.multiplayerManager.on('lobby_created', () => {
      game.screenManager.switchTo(ScreenType.GameLobby);
    });

    game.multiplayerManager.on('lobby_joined', () => {
      game.screenManager.switchTo(ScreenType.GameLobby);
    });

    // Create battle screen (just a placeholder - battle uses the 3D canvas)
    const battleScreen = {
      type: ScreenType.Battle,
      element: document.createElement('div'),
      onEnter: () => {
        // Battle screen doesn't need special UI - uses existing HTML
      },
    };
    battleScreen.element.id = 'battle-screen';
    battleScreen.element.classList.add('battle-active');
    // IMPORTANT: Allow clicks to pass through to the canvas
    battleScreen.element.style.pointerEvents = 'none';

    // Register all screens
    game.screenManager.registerScreen(mainMenuScreen);
    game.screenManager.registerScreen(deckBuilderScreen);
    game.screenManager.registerScreen(skirmishSetupScreen);
    game.screenManager.registerScreen(settingsScreen);
    game.screenManager.registerScreen({
      type: ScreenType.JoinGame,
      element: joinGameScreen.getElement(),
      onEnter: () => joinGameScreen.show(),
      onExit: () => joinGameScreen.hide(),
    });
    game.screenManager.registerScreen({
      type: ScreenType.GameLobby,
      element: gameLobbyScreen.getElement(),
      onEnter: () => gameLobbyScreen.show(),
      onExit: () => gameLobbyScreen.hide(),
    });
    game.screenManager.registerScreen(battleScreen);

    updateLoading(70, 'Initializing systems...');
    await game.initialize();

    updateLoading(90, 'Starting game loop...');
    game.start();

    // Switch to main menu
    game.screenManager.switchTo(ScreenType.MainMenu);

    updateLoading(100, 'Ready!');

    // Hide loading screen after a brief delay
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
    }, 500);

    // Expose game instance for debugging
    (window as unknown as { game: Game }).game = game;

    console.log('Stellar Siege initialized successfully');

  } catch (error) {
    console.error('Failed to initialize game:', error);
    loadingText.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    loadingText.style.color = '#ff4a4a';
  }
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
