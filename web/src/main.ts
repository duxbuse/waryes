/**
 * Stellar Siege - Main Entry Point
 *
 * This is the entry point for the Three.js RTS game.
 * It initializes the game engine, screens, and starts the main loop.
 */

// Self-hosted fonts (no external Google Fonts dependency)
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/playfair-display-sc/400.css';
import '@fontsource/playfair-display-sc/700.css';
import '@fontsource/playfair-display-sc/900.css';
import '@fontsource/crimson-pro/300.css';
import '@fontsource/crimson-pro/400.css';
import '@fontsource/crimson-pro/600.css';
import '@fontsource/crimson-pro/700.css';
import '@fontsource/share-tech-mono/400.css';
import './styles/theme.css';
import { Game } from './core/Game';
import { ScreenType } from './core/ScreenManager';
import { initBackground, showBackground, hideBackground } from './ui/BackgroundCanvas';
import { createLoginScreen } from './screens/LoginScreen';
import { createRegisterScreen } from './screens/RegisterScreen';
import { createMainMenuScreen } from './screens/MainMenuScreen';
import { createArmouryScreen } from './screens/ArmouryScreen';
import { createSkirmishSetupScreen, type SkirmishConfig } from './screens/SkirmishSetupScreen';
import { createSettingsScreen } from './screens/SettingsScreen';
import { JoinGameScreen } from './screens/JoinGameScreen';
import { GameLobbyScreen } from './screens/GameLobbyScreen';
import { showConfirmDialog, showNotification } from './core/UINotifications';
import { logout } from './api/AuthApi';

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

    // Create auth screens
    const loginScreen = createLoginScreen({
      onLoginSuccess: () => {
        game.screenManager.switchTo(ScreenType.MainMenu);
      },
      onRegister: () => {
        game.screenManager.switchTo(ScreenType.Register);
      },
      onGuest: () => {
        game.screenManager.switchTo(ScreenType.MainMenu);
      },
    });

    const registerScreen = createRegisterScreen({
      onRegisterSuccess: () => {
        game.screenManager.switchTo(ScreenType.MainMenu);
      },
      onBackToLogin: () => {
        game.screenManager.switchTo(ScreenType.Login);
      },
    });

    // Create and register screens
    const mainMenuScreen = createMainMenuScreen({
      onSkirmish: () => {
        game.screenManager.switchTo(ScreenType.SkirmishSetup);
      },
      onJoinGame: () => {
        game.screenManager.switchTo(ScreenType.JoinGame);
      },
      onArmoury: () => {
        game.screenManager.switchTo(ScreenType.Armoury);
      },
      onSettings: () => {
        game.screenManager.switchTo(ScreenType.Settings);
      },
      onLogin: () => {
        game.screenManager.switchTo(ScreenType.Login);
      },
      onLogout: async () => {
        await logout();
        game.screenManager.switchTo(ScreenType.MainMenu);
      },
      onQuit: async () => {
        if (await showConfirmDialog('Are you sure you want to quit?')) {
          window.close();
        }
      },
    });

    const armouryScreen = createArmouryScreen({
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
          game.startSkirmish(
            config.deck,
            config.mapSize,
            config.mapSeed,
            config.team1,
            config.team2,
            config.biome,
            config.existingMap
          );

          // Hide global loading screen if it was shown
          // Use setTimeout to ensure DOM updates and allow any pending frames
          setTimeout(() => {
            const globalLoadingScreen = document.getElementById('loading-screen');
            if (globalLoadingScreen) {
              globalLoadingScreen.classList.add('hidden');
            }
          }, 500);
        }
      },
      onHostOnline: async (config: SkirmishConfig): Promise<string | null> => {
        if (config.deck) {
          try {
            return new Promise<string | null>((resolve) => {
              game.multiplayerManager.on('lobby_created', (lobby: { code: string }) => {
                resolve(lobby.code);
              });
              game.multiplayerManager.createLobby(config.mapSize).catch((error) => {
                showNotification(`Failed to create online lobby: ${error}`, 5000);
                resolve(null);
              });
            });
          } catch (error) {
            showNotification(`Failed to create online lobby: ${error}`, 5000);
            return null;
          }
        }
        return null;
      },
      onCancelHosting: () => {
        game.multiplayerManager.leaveLobby();
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
    // lobby_created is handled by the skirmish screen's onHostOnline callback
    // (host stays on skirmish setup screen and sees the game code there)

    game.multiplayerManager.on('lobby_joined', () => {
      game.screenManager.switchTo(ScreenType.GameLobby);
    });

    // Initialize animated background (starfield + planet + particles)
    initBackground();
    showBackground();

    // Create battle screen (just a placeholder - battle uses the 3D canvas)
    const battleScreen = {
      type: ScreenType.Battle,
      element: document.createElement('div'),
      onEnter: () => {
        // Hide animated background during battle to protect 60 FPS budget
        hideBackground();
        document.body.classList.add('battle-active');
      },
      onExit: () => {
        // Restore animated background when leaving battle
        showBackground();
        document.body.classList.remove('battle-active');
      },
    };
    battleScreen.element.id = 'battle-screen';
    battleScreen.element.classList.add('battle-active');
    // IMPORTANT: Allow clicks to pass through to the canvas
    battleScreen.element.style.pointerEvents = 'none';

    // Register all screens
    game.screenManager.registerScreen(loginScreen);
    game.screenManager.registerScreen(registerScreen);
    game.screenManager.registerScreen(mainMenuScreen);
    game.screenManager.registerScreen(armouryScreen);
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

    // Always start at main menu - guests can play without logging in
    game.screenManager.switchTo(ScreenType.MainMenu);

    updateLoading(100, 'Ready!');

    // Hide loading screen after a brief delay
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
    }, 500);

    // Expose game instance for debugging (dev only)
    if (import.meta.env.DEV) {
      (window as unknown as { game: Game }).game = game;
    }

    console.log('Stellar Siege initialized successfully');

    // Check for benchmark mode
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('benchmark') === 'true') {
      game.benchmarkManager.startBenchmark();
    }


  } catch (error) {
    console.error('Failed to initialize game:', error);
    loadingText.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    loadingText.style.color = 'var(--red-glow, #ff4444)';
  }
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
