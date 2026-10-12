import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// Drives the real stack: e2e/stack.ts runs the Bun API (serving web/dist) and the worker in
// one process, with the fake LLM. Needs `docker compose up -d`, migrations and
// `bun run setup`, like the backend tests. Stop any dev worker first: it shares the queue
// and, in real mode, would spend LLM calls on e2e tickets.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run build && bun --env-file=.env e2e/stack.ts',
    url: `http://localhost:${PORT}/health`,
    // Locally, a stack left running from an earlier run is reused.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // A short fake delay keeps the typing indicator on screen long enough to see.
    env: { PORT: String(PORT), LLM_MODE: 'fake', LLM_FAKE_DELAY_MS: '400', OPS_TOKEN: 'e2e-ops-token' },
  },
});
