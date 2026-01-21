import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Stellar Siege E2E testing.
 *
 * Features:
 * - Auto-starts Vite dev server before tests
 * - Screenshots on failure for debugging
 * - Sensible timeouts for game loading
 * - Chromium-only for game testing (WebGL)
 */
export default defineConfig({
  // Test directory for E2E tests
  testDir: './tests/e2e',

  // Maximum time one test can run
  timeout: 30_000,

  // Maximum time for expect() assertions
  expect: {
    timeout: 10_000,
  },

  // Run tests in parallel (set to false if tests interfere with each other)
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry failed tests on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI to avoid resource contention
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:5173',

    // Capture screenshot on failure
    screenshot: 'only-on-failure',

    // Capture trace on failure for debugging
    trace: 'on-first-retry',

    // Video recording (disabled by default, enable for debugging)
    video: 'off',

    // Viewport size suitable for game testing
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors (not relevant for local dev)
    ignoreHTTPSErrors: true,
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Enable WebGL for Three.js rendering
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=gl',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
    // Firefox and WebKit can be added for cross-browser testing
    // but are disabled by default since game uses WebGL features
    // that work best in Chromium
    //
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Web server configuration - auto-starts Vite before tests
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // 2 minutes to start (allows for dependency installation)
    stdout: 'pipe',
    stderr: 'pipe',
  },

  // Output directory for test artifacts (screenshots, traces, videos)
  outputDir: './test-results',
});
