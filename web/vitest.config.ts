import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Use single threaded mode for compatibility with bun
    fileParallelism: false,
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
    },
  },
});
