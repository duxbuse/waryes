import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@game': resolve(__dirname, 'src/game'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@data': resolve(__dirname, 'src/data'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'ES2022',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
