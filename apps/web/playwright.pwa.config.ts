import { defineConfig } from '@playwright/test';

// PWA-tests draaien tegen de productiebuild (service worker is alleen daar actief).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/pwa.spec.ts',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
