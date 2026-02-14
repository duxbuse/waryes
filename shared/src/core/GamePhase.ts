/**
 * Game phases / state machine states
 * Shared between client and server
 */
export enum GamePhase {
  Loading = 'loading',
  MainMenu = 'mainMenu',
  Armoury = 'armoury',
  SkirmishSetup = 'skirmishSetup',
  Setup = 'setup',
  Battle = 'battle',
  Victory = 'victory',
}
