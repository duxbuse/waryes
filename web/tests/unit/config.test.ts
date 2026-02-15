/**
 * Runtime configuration tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Runtime Configuration', () => {
  // Store original values
  let originalAppConfig: any;

  beforeEach(() => {
    // Save original window.APP_CONFIG
    originalAppConfig = (window as any).APP_CONFIG;
  });

  afterEach(() => {
    // Restore original
    (window as any).APP_CONFIG = originalAppConfig;
  });

  it('should use window.APP_CONFIG when available', async () => {
    // Set runtime config
    (window as any).APP_CONFIG = {
      API_URL: 'https://runtime-api.example.com',
      WS_URL: 'wss://runtime-ws.example.com',
    };

    // Re-import to get fresh config
    const { API_URL, WS_URL } = await import('../../src/config');

    expect(API_URL).toBe('https://runtime-api.example.com');
    expect(WS_URL).toBe('wss://runtime-ws.example.com');
  });

  it('should not use template placeholders', async () => {
    // Set config with placeholders (should be ignored)
    (window as any).APP_CONFIG = {
      API_URL: '__VITE_API_URL__',
      WS_URL: '__VITE_WS_URL__',
    };

    // Re-import to get fresh config
    const { API_URL, WS_URL } = await import('../../src/config');

    // Should fall back to defaults, not use placeholders
    expect(API_URL).not.toContain('__VITE_');
    expect(WS_URL).not.toContain('__VITE_');
  });

  it('should have valid URL formats', async () => {
    const { API_URL, WS_URL } = await import('../../src/config');

    // API_URL should start with http:// or https://
    expect(API_URL).toMatch(/^https?:\/\//);

    // WS_URL should start with ws:// or wss://
    expect(WS_URL).toMatch(/^wss?:\/\//);
  });

  it('should export config object', async () => {
    const { config } = await import('../../src/config');

    expect(config).toBeDefined();
    expect(config.API_URL).toBeDefined();
    expect(config.WS_URL).toBeDefined();
  });
});
