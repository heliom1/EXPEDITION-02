import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  // Unit tests only; browser/gameplay tests (tests/browser/*.spec.ts) run under Playwright.
  test: { include: ['tests/**/*.test.ts'] },
});
