/**
 * Runtime configuration accessor
 * Reads from window.APP_CONFIG (injected at runtime) with fallbacks to build-time env vars
 */

import type { AppConfig } from './config.d';

/**
 * Get runtime configuration with fallbacks
 * Priority:
 * 1. window.APP_CONFIG (runtime config from config.js)
 * 2. import.meta.env (build-time Vite env vars)
 * 3. Hard-coded defaults
 */
function getConfig(): AppConfig {
  // Check if window.APP_CONFIG exists and is properly initialized
  if (
    typeof window !== 'undefined' &&
    window.APP_CONFIG &&
    window.APP_CONFIG.API_URL &&
    !window.APP_CONFIG.API_URL.includes('__VITE_') // Not a template placeholder
  ) {
    return window.APP_CONFIG;
  }

  // Fallback to build-time environment variables (development mode)
  return {
    API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
    WS_URL: import.meta.env.VITE_WS_URL || 'ws://localhost:3001',
  };
}

// Export config values
export const config = getConfig();

// Export individual values for convenience
export const API_URL = config.API_URL;
export const WS_URL = config.WS_URL;

// Log configuration in development
if (import.meta.env.DEV) {
  console.log('[Config] Runtime configuration loaded:', {
    API_URL,
    WS_URL,
    source: window.APP_CONFIG ? 'runtime (window.APP_CONFIG)' : 'build-time (import.meta.env)',
  });
}

// Security check: enforce HTTPS in production builds
if (import.meta.env.PROD && !API_URL.startsWith('https://')) {
  console.error('[Security] VITE_API_URL must use HTTPS in production. Current:', API_URL);
}
