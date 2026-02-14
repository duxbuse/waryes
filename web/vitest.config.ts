import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // Exclude Bun-specific tests (jsonSchema.test.ts uses bun:test)
    exclude: ['tests/jsonSchema.test.ts', 'node_modules/**'],
    // Use single threaded mode for compatibility with bun
    fileParallelism: false,
    // Verbose reporter for clear test output
    reporters: ['verbose'],
    // Test timeout (10 seconds - no individual test should exceed this)
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@game': resolve(__dirname, './src/game'),
      '@ui': resolve(__dirname, './src/ui'),
      '@data': resolve(__dirname, './src/data'),
      '@utils': resolve(__dirname, './src/utils'),
      '@shared': resolve(__dirname, '../shared/src'),
    },
    dedupe: ['three'],
  },
});
