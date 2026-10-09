import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// Drives the real Express server serving web/dist. Needs `docker compose up -d`, migrations
// and `bun run setup`, like the backend tests. The worker is added in 6.3, when the first
// test needs a ticket to finish.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run build && node --env-file=.env --import tsx src/index.ts',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { PORT: String(PORT), LLM_MODE: 'fake', LLM_FAKE_DELAY_MS: '0' },
  },
});
