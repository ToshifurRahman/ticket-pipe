import pg from 'pg';

// Story 7.2: proves the production image against the compose stack (Postgres, Redis, LocalStack).
// Needs Docker and no .env, so CI can run it (story 7.7). Run: `bun run test:image`.
// The `app` service (compose profile `image`) uses its own database (ticket_pipe_image, recreated
// here) and its own queues, so dev data is untouched. Provider keys are placeholders: the check
// stops at `triage.started`, which proves Postgres, Redis, SQS and the worker without an LLM call.
// If `docker build` needs host networking on your machine: IMAGE_BUILD_NETWORK=host.

const IMAGE = 'ticket-pipe-app:local';
const DB_NAME = 'ticket_pipe_image';
const BASE = 'http://localhost:3200';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5433/postgres';
const network = process.env.IMAGE_BUILD_NETWORK;

function step(message: string) {
  console.log(`\n==> ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

async function run(cmd: string[], opts: { allowFailure?: boolean } = {}) {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0 && !opts.allowFailure) {
    fail(`${cmd.join(' ')} exited ${code}\n${stdout}${stderr}`);
  }
  return { code, out: stdout.trim(), err: stderr.trim() };
}

const compose = (...args: string[]) => ['docker', 'compose', '--profile', 'image', ...args];

async function checkKeyGuard() {
  step('A build without VITE_TURNSTILE_SITE_KEY must fail');
  const cmd = ['docker', 'build', '--target', 'web', '--build-arg', 'VITE_TURNSTILE_SITE_KEY='];
  if (network) cmd.push('--network', network);
  const { code, err } = await run([...cmd, '-q', '.'], { allowFailure: true });
  if (code === 0) fail('the build passed without a Turnstile key');
  if (!err.includes('VITE_TURNSTILE_SITE_KEY is required')) {
    fail(`the build failed, but not on the key guard:\n${err}`);
  }
  console.log('ok: build refused');
}

async function checkImageContents() {
  step('Image: non-root, healthcheck, no .env / tests / dev dependencies');
  const user = (await run(['docker', 'image', 'inspect', IMAGE, '--format', '{{.Config.User}}']))
    .out;
  if (user !== 'bun') fail(`image user is "${user}", expected bun`);
  const hc = (
    await run(['docker', 'image', 'inspect', IMAGE, '--format', '{{json .Config.Healthcheck}}'])
  ).out;
  if (hc === 'null' || !hc.includes('/health/live')) fail(`no /health/live HEALTHCHECK: ${hc}`);

  const script = [
    'cd /app',
    'found=$(find . \\( -name ".env" -o -name ".env.*" -o -name "*.test.ts" -o -name tests \\) -not -path "*/node_modules/*" | head)',
    'test -z "$found" || { echo "unexpected files: $found"; exit 1; }',
    'for d in pino-pretty vitest typescript eslint; do',
    '  test ! -e node_modules/$d || { echo "dev dependency present: $d"; exit 1; }',
    'done',
  ].join('\n');
  await run(['docker', 'run', '--rm', '--entrypoint', 'sh', IMAGE, '-c', script]);
  console.log('ok: bun user, healthcheck set, image clean');
}

async function resetDatabase() {
  step(`Recreate database ${DB_NAME}`);
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await admin.end();
  }
}

async function waitFor<T>(what: string, timeoutMs: number, probe: () => Promise<T | undefined>) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined);
    if (value !== undefined) return value;
    await Bun.sleep(500);
  }
  return fail(`timed out waiting for ${what}`);
}

async function checkApp() {
  step('GET / serves the web app');
  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  if (!page.ok || !html.includes('id="root"')) fail(`GET / returned ${page.status}`);
  console.log('ok: SPA served');

  // The container healthcheck only proves the process; ready is what proves the database.
  step('GET /health/ready answers 200');
  const ready = await fetch(`${BASE}/health/ready`);
  if (ready.status !== 200) fail(`GET /health/ready returned ${ready.status}`);
  console.log('ok: ready');

  step('POST a ticket and wait for the worker to pick it up');
  const res = await fetch(`${BASE}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: 'Image smoke test',
      description: 'Checking that the production image processes a ticket end to end.',
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    }),
  });
  if (res.status !== 201) fail(`POST /api/tickets returned ${res.status}: ${await res.text()}`);
  const { ticketId } = (await res.json()) as { ticketId: string };

  await waitFor('triage.started', 30_000, async () => {
    const r = await fetch(`${BASE}/api/tickets/${ticketId}/events`);
    const body = (await r.json()) as { events: { event: string }[] };
    return body.events.some((e) => e.event === 'triage.started') || undefined;
  });
  console.log('ok: worker picked the ticket up (triage.started)');
}

async function main() {
  await checkKeyGuard();

  step('Start Postgres, LocalStack and the image profile Redis');
  await run(compose('up', '-d', '--wait', 'postgres', 'localstack', 'redis-image'));

  step('Build the image');
  await run(compose('build', 'app')); // compose reads IMAGE_BUILD_NETWORK from the environment
  await checkImageContents();

  await resetDatabase();
  step('Migrate and create the queues, using scripts shipped in the image');
  for (const script of ['scripts/migrate.ts', 'scripts/setup-infra.ts']) {
    await run(compose('run', '--rm', '--no-deps', 'app', 'bun', script));
  }

  step('Start the app and wait for Docker to report healthy');
  await run(compose('up', '-d', '--wait', '--wait-timeout', '90', 'app'));
  await checkApp();
}

let failure: Error | undefined;
try {
  await main();
} catch (err) {
  failure = err instanceof Error ? err : new Error(String(err));
}

step('Stop the app: a graceful shutdown exits 0');
const logs = (
  await run(compose('logs', '--no-color', '--tail', '40', 'app'), { allowFailure: true })
).out;
await run(compose('stop', '--timeout', '30', 'app'), { allowFailure: true });
const containerId = (await run(compose('ps', '-aq', 'app'), { allowFailure: true })).out;
const exit = await run(['docker', 'inspect', '-f', '{{.State.ExitCode}}', containerId], {
  allowFailure: true,
});
await run(compose('rm', '-sf', 'app'), { allowFailure: true });

if (failure === undefined && exit.out !== '0') {
  failure = new Error(`container exited ${exit.out}, expected 0\n${logs}`);
}
if (failure) {
  console.error(`\nFAILED: ${failure.message}`);
  process.exit(1);
}
console.log(`\nPASSED (container exit ${exit.out})`);
