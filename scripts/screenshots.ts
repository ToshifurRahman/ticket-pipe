import { chromium, expect, type Page } from '@playwright/test';
import pg from 'pg';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { removeTicket } from '../e2e/helpers/cleanup-ticket.js';
import { stripFakeMarkers } from '../e2e/helpers/strip-fake-marker.js';
import { stubTurnstile } from '../e2e/helpers/turnstile.js';

// README showcase (story 6.8): PNGs of the customer flow and the ops console plus a GIF of a
// ticket being worked live. Runs the e2e stack with the fake LLM (a visible delay per stage),
// dark theme. Output goes to docs/screenshots/ and is committed; story 7.11 embeds it.
// Needs `docker compose up -d` and `bun run setup`. Run: `bun run screenshots`.
// It uses its own database (ticket_pipe_screenshots, created and migrated here), so the ops
// console shows only the tickets seeded below, never whatever is in the dev database.

const PORT = 3102;
const BASE = `http://localhost:${PORT}`;
const OPS_TOKEN = 'screenshots-ops-token';
const OUT = path.resolve(import.meta.dirname, '../docs/screenshots');
const DESKTOP = { width: 1440, height: 900 };
const created: string[] = [];

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env: rely on the environment */
}
const DB_NAME = 'ticket_pipe_screenshots';
const devUrl = new URL(process.env.DATABASE_URL ?? '');
const adminUrl = new URL(devUrl);
adminUrl.pathname = '/postgres';
const shotsUrl = new URL(devUrl);
shotsUrl.pathname = `/${DB_NAME}`;
// removeTicket() (shared with the e2e tests) reads this variable.
process.env.DATABASE_URL = shotsUrl.toString();

async function ensureDatabase() {
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (!rowCount) await admin.query(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await admin.end();
  }
}

const CUSTOMER = {
  subject: 'I was charged twice for my subscription',
  description:
    'Hi, I noticed two charges for the Pro plan on my card this month, both on the 3rd. Could you refund the duplicate? My account email is the one I wrote to you from. Thanks!',
};

const SEED: { subject: string; description: string }[] = [
  { subject: 'Cannot reset my password', description: 'The reset email never arrives, even after several tries and checking spam.' },
  { subject: 'Export to CSV crashes the app', description: 'Every time I export the monthly report the page goes blank and I lose my filters.' },
  { subject: 'Invoice totals do not add up', description: 'The line items on invoice 1042 add up to more than the total shown. [fake:invalid-draft]' },
  { subject: 'Need to change the billing address', description: 'We moved offices last month and the old address is still on our invoices.' },
  { subject: 'Refund request for annual plan', description: 'I upgraded by mistake and would like to go back to monthly. [fake:invalid-triage]' },
];

function run(cmd: string[]) {
  const result = Bun.spawnSync(cmd, { stdio: ['inherit', 'inherit', 'inherit'], env: process.env });
  if (result.exitCode !== 0) throw new Error(`${cmd[0]} failed with ${result.exitCode}`);
}

async function waitForStack() {
  for (let i = 0; ; i++) {
    if (i === 60) throw new Error('the stack did not start');
    if (await fetch(`${BASE}/health`).then((r) => r.ok, () => false)) return;
    await Bun.sleep(500);
  }
}

async function submit(page: Page, subject: string, description: string) {
  await page.goto('/new');
  await page.getByLabel('Subject').fill(subject);
  await page.getByLabel('Description').fill(description);
  const submit = page.getByRole('button', { name: /Submit ticket/ });
  await expect(submit).toBeEnabled();
  return submit;
}

async function seed() {
  for (const ticket of SEED) {
    const res = await fetch(`${BASE}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ticket),
    });
    created.push(((await res.json()) as { ticketId: string }).ticketId);
  }
}

run(['bun', 'run', 'build']);
await ensureDatabase();
run(['bun', 'scripts/migrate.ts']);
await mkdir(OUT, { recursive: true });
const videoDir = await mkdtemp(path.join(tmpdir(), 'relay-video-'));

const stack = Bun.spawn(['bun', '--env-file=.env', 'e2e/stack.ts'], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, PORT: String(PORT), LLM_MODE: 'fake', LLM_FAKE_DELAY_MS: '1500', OPS_TOKEN, DATABASE_URL: shotsUrl.toString() },
});
const browser = await chromium.launch();

try {
  await waitForStack();
  const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, name) });

  // Landing and the form: reduced motion shows the hero demo's final frame.
  const still = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, reducedMotion: 'reduce', colorScheme: 'dark' });
  const stillPage = await still.newPage();
  await stubTurnstile(stillPage);
  await stillPage.goto('/');
  await expect(stillPage.getByRole('heading', { level: 1 })).toBeVisible();
  await stillPage.evaluate('document.fonts.ready');
  await shot(stillPage, 'landing.png');
  await submit(stillPage, CUSTOMER.subject, CUSTOMER.description);
  await shot(stillPage, 'new-ticket.png');
  await still.close();

  // The customer flow, recorded: submit, watch the thread fill in, reply arrives.
  const flow = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  });
  const flowPage = await flow.newPage();
  await stubTurnstile(flowPage);
  const submitButton = await submit(flowPage, CUSTOMER.subject, CUSTOMER.description);
  await flowPage.waitForTimeout(600);
  const [response] = await Promise.all([
    flowPage.waitForResponse((r) => r.url().endsWith('/api/tickets') && r.request().method() === 'POST'),
    submitButton.click(),
  ]);
  const { ticketId, referenceNumber } = (await response.json()) as { ticketId: string; referenceNumber: string };
  created.push(ticketId);
  await flowPage.waitForTimeout(500);
  await flowPage.getByRole('link', { name: /Watch it live/ }).click();
  await flowPage.waitForTimeout(1100); // mid-pipeline: triaged, the draft still being written
  await shot(flowPage, 'ticket-live.png');
  await expect(flowPage.getByText(/^Reply from support/)).toBeVisible({ timeout: 20_000 });
  await flowPage.waitForTimeout(1500);
  await shot(flowPage, 'ticket-completed.png');
  await flowPage.waitForTimeout(1500);
  const video = flowPage.video();
  await flow.close();
  const webm = await video!.path();

  const gif = path.join(OUT, 'customer-flow.gif');
  for (const [fps, width] of [[12, 960], [10, 800], [8, 720]] as const) {
    run([
      'ffmpeg', '-y', '-loglevel', 'error', '-i', webm,
      '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      gif,
    ]);
    const size = (await stat(gif)).size;
    console.log(`customer-flow.gif: ${(size / 1024 / 1024).toFixed(2)} MB at ${fps} fps, ${width}px`);
    if (size <= 2 * 1024 * 1024) break;
  }

  // The same ticket on a phone.
  const phone = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    colorScheme: 'dark',
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(`/t/${referenceNumber}`);
  await expect(phonePage.getByText(/^Reply from support/)).toBeVisible();
  await shot(phonePage, 'mobile-ticket.png');
  await phone.close();

  // The ops console: a mix of finished and needs-attention tickets.
  await seed();
  const ops = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, colorScheme: 'dark' });
  const opsPage = await ops.newPage();
  await opsPage.goto('/ops');
  await opsPage.getByLabel('Ops token').fill(OPS_TOKEN);
  await opsPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(opsPage.getByRole('tablist', { name: 'Filter by status' })).toBeVisible();
  await expect(opsPage.getByRole('tab', { name: /^Needs attention/ })).toContainText('2', { timeout: 30_000 });
  // The fake-LLM markers did their job; take them out so the drawer reads like a real ticket.
  for (const id of created) await stripFakeMarkers(id);
  await opsPage.evaluate('document.fonts.ready');
  await opsPage.waitForTimeout(8000); // let the needs-attention toasts expire
  await shot(opsPage, 'ops-list.png');
  await opsPage.getByRole('tab', { name: /^Needs attention/ }).click();
  await opsPage.getByRole('button', { name: /^Open TICK-/ }).first().click();
  await expect(opsPage.getByRole('dialog').getByRole('heading', { name: 'AI calls' })).toBeVisible();
  await opsPage.waitForTimeout(600);
  await shot(opsPage, 'ops-drawer.png');
  await ops.close();
} finally {
  await browser.close();
  stack.kill('SIGTERM');
  await stack.exited;
  for (const id of created) await removeTicket(id).catch((err) => console.error('cleanup failed', id, err));
  await rm(videoDir, { recursive: true, force: true });
}
console.log(`Wrote screenshots to ${OUT}`);
process.exit(0);
