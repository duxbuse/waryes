/**
 * Stellar Siege - Main Entry Point
 *
 * This is the entry point for the Three.js RTS game.
 * It initializes the game engine and starts the main loop.
 */

import { Game } from './core/Game';

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

    updateLoading(60, 'Initializing systems...');
    await game.initialize();

    updateLoading(90, 'Starting game loop...');
    game.start();

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
