import { defineConfig } from '@playwright/test';

/**
 * Browser/gameplay tests. Uses the installed Google Chrome (no Playwright browser download; C: has little space).
 * Reuses a running `npm run dev` server, or starts one. CF_GPU=high asks Chrome for the discrete GPU on hybrid laptops.
 */
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'tools/out/playwright',
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1600, height: 900 },
    // CF_URL points tests at another dev server (e.g. a fresh one on a spare port).
    baseURL: process.env.CF_URL ?? 'http://localhost:5173/',
    launchOptions: {
      args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', ...(process.env.CF_GPU === 'high' ? ['--force_high_performance_gpu'] : [])],
    },
  },
  webServer: { command: 'npm run dev', url: process.env.CF_URL ?? 'http://localhost:5173/', reuseExistingServer: true, timeout: 120_000 },
});
