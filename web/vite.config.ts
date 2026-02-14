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
      '@shared': resolve(__dirname, '../shared/src'),
    },
    dedupe: ['three'],
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'ES2022',
    sourcemap: process.env.NODE_ENV === 'production' ? false : true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
