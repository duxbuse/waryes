import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    pool: 'forks',
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
    },
  },
  resolve: {
    alias: {
      '@': './src',
      '@core': './src/core',
      '@game': './src/game',
      '@ui': './src/ui',
      '@data': './src/data',
      '@utils': './src/utils',
    },
  },
});
