import { defineConfig } from '@playwright/test';

// Lokaal kan PW_CHROMIUM naar een vooraf geïnstalleerde Chromium wijzen.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  webServer: [
    {
      command: 'pnpm --filter @biblio/api start',
      // e2e logt vaak in vanaf één IP: rate limit ruim zetten
      env: { ...(process.env as Record<string, string>), AUTH_RATE_LIMIT_MAX: '1000' },
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec vite --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
