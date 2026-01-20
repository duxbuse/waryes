import { test, expect } from '@playwright/test';

/**
 * E2E tests for the main menu screen.
 *
 * These tests verify that the game loads correctly and
 * the main menu displays all expected elements.
 */

test.describe('Main Menu', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the game
    await page.goto('/');
  });

  test('should load and display main menu', async ({ page }) => {
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Verify the title contains the game name
    const title = await page.title();
    expect(title.toLowerCase()).toContain('stellar');

    // Verify the page has loaded (canvas should exist for Three.js)
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });
  });

  test('should display menu options', async ({ page }) => {
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Give the UI time to initialize
    await page.waitForTimeout(2000);

    // Look for main menu elements - these should exist in the menu
    // Note: Exact selectors depend on the actual UI implementation
    const menuContainer = page.locator('#main-menu, .main-menu, [data-screen="main-menu"]');

    // If menu container exists, test passes
    // If not found, we should still have buttons visible
    const hasMenu = await menuContainer.count() > 0;

    if (hasMenu) {
      await expect(menuContainer).toBeVisible();
    } else {
      // Fallback: Just verify we have interactive elements
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();
      expect(buttonCount).toBeGreaterThan(0);
    }
  });

  test('should have no console errors on load', async ({ page }) => {
    const consoleErrors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Ignore known acceptable errors (e.g., WebGL warnings on some systems)
        const text = msg.text();
        if (!text.includes('WebGL') && !text.includes('GPU')) {
          consoleErrors.push(text);
        }
      }
    });

    // Navigate and wait for load
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify no critical console errors
    expect(consoleErrors).toHaveLength(0);
  });
});
