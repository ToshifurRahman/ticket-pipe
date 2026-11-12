import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

// Story 7.2: proves the production image against the compose stack (Postgres, Redis, LocalStack).
// Needs Docker and no .env, so CI can run it (story 7.7). Run: `bun run test:image`.
// The `app` service (compose profile `image`) uses its own database (ticket_pipe_image, recreated
// here) and its own queues, so dev data is untouched. Provider keys are placeholders: the check
// stops at `triage.started`, which proves Postgres, Redis, SQS and the worker without an LLM call.
// If `docker build` needs host networking on your machine: IMAGE_BUILD_NETWORK=host.
//
// Story 7.9: the last step runs the image through the exact dockerCommand from render.yaml
// (`/bin/sh -c "bun scripts/migrate.ts && bun src/main.ts"`) against a fresh database, and
// requires a row in schema_migrations plus a 200 from /health/ready.

const IMAGE = 'ticket-pipe-app:local';
const DB_NAME = 'ticket_pipe_image';
const BASE = 'http://localhost:3200';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5433/postgres';
const network = process.env.IMAGE_BUILD_NETWORK;

// The deploy command and the scratch database the 7.9 step uses, kept apart from the app's own.
const DEPLOY_DB_NAME = 'ticket_pipe_image_deploy';
const DEPLOY_CONTAINER = 'ticket-pipe-deploy-check';
const DEPLOY_BASE = 'http://localhost:3201';

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

async function resetDatabase(name = DB_NAME) {
  step(`Recreate database ${name}`);
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
}

async function countMigrations(name: string): Promise<number> {
  const client = new pg.Client({
    connectionString: `postgresql://postgres:postgres@localhost:5433/${name}`,
  });
  await client.connect();
  try {
    const { rows } = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM schema_migrations'
    );
    return Number(rows[0]?.count ?? '0');
  } finally {
    await client.end();
  }
}

// `docker rm` has no `-s` flag (`docker compose rm` does), so stop and remove in two steps.
async function removeContainer(name: string) {
  await run(['docker', 'stop', '--time', '5', name], { allowFailure: true });
  await run(['docker', 'rm', '-f', name], { allowFailure: true });
  await waitFor(`${name} to be removed`, 15_000, async () => {
    const { out } = await run(
      ['docker', 'ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'],
      { allowFailure: true }
    );
    return out === '' ? true : undefined;
  });
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

async function checkDeployCommand() {
  step('Run the render.yaml deploy command against a fresh database');
  const blueprint = readFileSync(path.resolve(import.meta.dirname, '../render.yaml'), 'utf8');
  const line = blueprint.match(/^\s*dockerCommand:\s*(.+)$/m)?.[1]?.trim() ?? '';
  // `/bin/sh -c "cmd"` is the exec form Render runs; the quoted text is the shell script.
  const shell = line.match(/^\/bin\/sh -c "(.+)"$/)?.[1];
  if (!shell) fail(`render.yaml has no /bin/sh -c dockerCommand: ${line}`);
  if (!shell.includes('scripts/migrate.ts') || !shell.includes('src/main.ts')) {
    fail(`the deploy command does not name both scripts: ${shell}`);
  }
  console.log(`command: ${line}`);

  await resetDatabase(DEPLOY_DB_NAME);
  const network = (
    await run([
      'docker',
      'inspect',
      (await run(compose('ps', '-aq', 'app'))).out,
      '--format',
      '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}',
    ])
  ).out;

  const name = DEPLOY_CONTAINER;
  await removeContainer(name);
  const deployEnv = [
    '-e',
    'NODE_ENV=production',
    '-e',
    'PORT=8080',
    '-e',
    'OPS_TOKEN=image-smoke-ops-token-0123456789abcdef',
    '-e',
    `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/${DEPLOY_DB_NAME}`,
    '-e',
    'REDIS_URL=redis://redis-image:6379',
    '-e',
    'SQS_ENDPOINT=http://localstack:4566',
    '-e',
    'SNS_ENDPOINT=http://localstack:4566',
    '-e',
    'SQS_QUEUE_NAME=ticket-processing-image',
    '-e',
    'SQS_DLQ_NAME=ticket-processing-image-dlq',
    '-e',
    'AWS_REGION=us-east-1',
    '-e',
    'AWS_ACCESS_KEY_ID=test',
    '-e',
    'AWS_SECRET_ACCESS_KEY=test',
    '-e',
    'PORTKEY_API_KEY=image-smoke-placeholder',
    '-e',
    'GOOGLE_API_KEY=image-smoke-placeholder',
    '-e',
    'PRIMARY_GATEWAY=google',
    '-e',
    'PRIMARY_MODEL=placeholder',
    '-e',
    'TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA',
  ];
  let failure: Error | undefined;
  try {
    await run([
      'docker',
      'run',
      '-d',
      '--name',
      name,
      '--network',
      network,
      '-p',
      '3201:8080',
      ...deployEnv,
      IMAGE,
      '/bin/sh',
      '-c',
      shell,
    ]);

    const ready = await waitFor('the deploy command to answer /health/ready', 60_000, async () => {
      const res = await fetch(`${DEPLOY_BASE}/health/ready`);
      return res.status === 200 ? res.status : undefined;
    });
    console.log(`ok: /health/ready answered ${ready}`);

    const applied = await countMigrations(DEPLOY_DB_NAME);
    if (applied < 1) fail(`schema_migrations has no rows (${applied})`);
    console.log(`ok: schema_migrations has ${applied} row(s)`);

    const { out, err } = await run(['docker', 'logs', name], { allowFailure: true });
    const migrationLine = `${out}\n${err}`
      .split('\n')
      .find((l) => /^(apply|nothing to migrate)/.test(l.trim()));
    if (!migrationLine) fail(`no migration line in the container log:\n${out}\n${err}`);
    console.log(`ok: ${migrationLine.trim()}`);
  } catch (err) {
    failure = err instanceof Error ? err : new Error(String(err));
  }

  // A free-tier cold start re-runs the same command against an already migrated database. It
  // must apply nothing, print `nothing to migrate`, and still answer /health/ready.
  if (!failure) {
    try {
      step('Run the deploy command a second time, as a cold start would');
      await removeContainer(name);
      await run([
        'docker',
        'run',
        '-d',
        '--name',
        name,
        '--network',
        network,
        '-p',
        '3201:8080',
        ...deployEnv,
        IMAGE,
        '/bin/sh',
        '-c',
        shell,
      ]);
      await waitFor('the second run to migrate and start', 60_000, async () => {
        const { out, err } = await run(['docker', 'logs', name], { allowFailure: true });
        return /nothing to migrate/.test(`${out}\n${err}`) ? true : undefined;
      });
      const { out, err } = await run(['docker', 'logs', name], { allowFailure: true });
      const logs = `${out}\n${err}`;
      if (!/nothing to migrate/.test(logs)) fail(`the second run migrated again:\n${logs}`);
      const ready = await waitFor('the second run to answer /health/ready', 60_000, async () => {
        const res = await fetch(`${DEPLOY_BASE}/health/ready`);
        return res.status === 200 ? res.status : undefined;
      });
      const rows = await countMigrations(DEPLOY_DB_NAME);
      if (rows < 1) fail(`schema_migrations lost its rows (${rows})`);
      console.log(
        `ok: nothing to migrate, ${rows} row(s) still applied, /health/ready answered ${ready}`
      );
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    }
  }

  const { out, err } = await run(['docker', 'logs', name], { allowFailure: true });
  await run(['docker', 'stop', '--time', '5', name], { allowFailure: true });
  const exit = await run(['docker', 'inspect', '-f', '{{.State.ExitCode}}', name], {
    allowFailure: true,
  });
  await removeContainer(name);
  // `exec bun src/main.ts` replaces the shell with bun, so bun is PID 1 and receives Docker's
  // SIGTERM directly: the server's drain runs and the container exits 0. A 137 here would mean
  // the shell swallowed the signal again, which is what Render sends on every deploy.
  if (!failure && exit.out !== '0') {
    failure = new Error(
      `the deploy command container exited ${exit.out}, expected 0 after a graceful stop\n${out}\n${err}`
    );
  }
  if (failure) throw failure;
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

  await checkDeployCommand();
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
