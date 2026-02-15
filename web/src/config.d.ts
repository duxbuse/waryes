/**
 * Type definitions for runtime configuration
 * Configuration is loaded from window.APP_CONFIG via config.js
 */

export interface AppConfig {
  API_URL: string;
  WS_URL: string;
}

declare global {
  interface Window {
    APP_CONFIG: AppConfig;
  }
}

export {};
