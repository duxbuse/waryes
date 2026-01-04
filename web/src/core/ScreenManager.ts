/**
 * ScreenManager - Manages game screens/menus
 *
 * Handles transitions between:
 * - Main Menu
 * - Deck Builder
 * - Skirmish Setup
 * - Battle
 * - Victory
 */

export enum ScreenType {
  MainMenu = 'main-menu',
  DeckBuilder = 'deck-builder',
  SkirmishSetup = 'skirmish-setup',
  Settings = 'settings',
  JoinGame = 'join-game',
  GameLobby = 'game-lobby',
  Battle = 'battle',
  Victory = 'victory',
}

export interface Screen {
  type: ScreenType;
  element: HTMLElement;
  onEnter?: () => void;
  onExit?: () => void;
  update?: (dt: number) => void;
}

export class ScreenManager {
  private screens: Map<ScreenType, Screen> = new Map();
  private currentScreen: Screen | null = null;
  private screenContainer: HTMLElement;

  constructor() {
    this.screenContainer = document.getElementById('screen-container')!;
    if (!this.screenContainer) {
      this.screenContainer = document.createElement('div');
      this.screenContainer.id = 'screen-container';
      document.getElementById('ui-overlay')?.appendChild(this.screenContainer);
    }
  }

  registerScreen(screen: Screen): void {
    this.screens.set(screen.type, screen);
    screen.element.classList.add('screen');
    screen.element.classList.add('hidden');
    this.screenContainer.appendChild(screen.element);
  }

  switchTo(type: ScreenType): void {
    // Exit current screen
    if (this.currentScreen) {
      this.currentScreen.onExit?.();
      this.currentScreen.element.classList.add('hidden');
    }

    // Enter new screen
    const newScreen = this.screens.get(type);
    if (newScreen) {
      newScreen.element.classList.remove('hidden');
      newScreen.onEnter?.();
      this.currentScreen = newScreen;
    }

    console.log(`Screen switched to: ${type}`);
  }

  getCurrentScreen(): ScreenType | null {
    return this.currentScreen?.type ?? null;
  }

  update(dt: number): void {
    this.currentScreen?.update?.(dt);
  }
}
