import { chromium } from '@playwright/test';
import { removeTicket } from '../e2e/helpers/cleanup-ticket.js';

// Local Lighthouse gate (story 6.8): >= 90 in all four categories on /, /new and /t/:ref.
// Builds the web app, runs the e2e stack (API + worker, fake LLM) on its own port, seeds one
// finished ticket for the /t/:ref page, then runs `lhci autorun` with lighthouserc.cjs.
// Needs `docker compose up -d`, migrations and `bun run setup`, like the e2e tests.
// Not part of `test:e2e`: performance scores are noisy and the run takes a few minutes.

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;

function run(cmd: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(cmd, { stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, ...env } });
  return result.exitCode;
}

if (run(['bun', 'run', 'build']) !== 0) process.exit(1);

const stack = Bun.spawn(['bun', '--env-file=.env', 'e2e/stack.ts'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, PORT: String(PORT), LLM_MODE: 'fake', LLM_FAKE_DELAY_MS: '0', OPS_TOKEN: 'lighthouse-ops-token' },
});

let ticketId: string | undefined;
let exitCode = 1;
try {
  for (let i = 0; ; i++) {
    if (i === 60) throw new Error('the stack did not start');
    if (await fetch(`${BASE}/health`).then((r) => r.ok, () => false)) break;
    await Bun.sleep(500);
  }

  const created = await fetch(`${BASE}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject: 'Lighthouse check', description: 'The totals on my invoice do not add up.' }),
  });
  if (created.status !== 201) throw new Error(`could not create a ticket: ${created.status}`);
  const ticket = (await created.json()) as { ticketId: string; referenceNumber: string };
  ticketId = ticket.ticketId;

  for (let i = 0; ; i++) {
    if (i === 60) throw new Error('the ticket did not complete');
    const view = await fetch(`${BASE}/api/tickets/ref/${ticket.referenceNumber}`).then((r) => r.json() as Promise<{ status: string }>);
    if (view.status === 'completed') break;
    await Bun.sleep(500);
  }

  exitCode = run(['bunx', 'lhci', 'autorun', '--config=lighthouserc.cjs'], {
    LH_BASE_URL: BASE,
    LH_TICKET_REF: ticket.referenceNumber,
    LH_CHROME_PATH: chromium.executablePath(),
  });
} finally {
  stack.kill('SIGTERM');
  await stack.exited;
  if (ticketId) await removeTicket(ticketId).catch((err) => console.error('cleanup failed', err));
}
process.exit(exitCode);
