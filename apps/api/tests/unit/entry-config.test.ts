/**
 * Starts each real entry point (API, worker, combined, and the three scripts) under Bun with
 * a clean environment (`env -i`) and only the settings named here, never a loaded .env. A
 * missing or invalid variable must stop the process at once, with a message that names it.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const API = path.resolve(import.meta.dirname, '../..');

// The documented minimum for a local run: LocalStack and fake LLM, so no key is needed.
const VALID = {
  DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db',
  REDIS_URL: 'redis://127.0.0.1:1',
  SQS_ENDPOINT: 'http://127.0.0.1:1',
  SQS_QUEUE_NAME: 'tickets',
  LLM_MODE: 'fake',
};

function start(script: string, env: Record<string, string>) {
  const settings = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  const started = Date.now();
  const result = spawnSync(
    'env',
    ['-i', `PATH=${process.env.PATH}`, `HOME=${process.env.HOME}`, ...settings, 'bun', script],
    { cwd: API, encoding: 'utf8', timeout: 20_000 }
  );
  return { status: result.status, stderr: result.stderr, seconds: (Date.now() - started) / 1000 };
}

// The processes that run the whole application keep the full schema.
const ENTRIES = ['src/index.ts', 'src/main.ts', 'src/worker.ts'];

// Each script names only the variables it uses.
const SCRIPTS: Array<[string, string[], Record<string, string>]> = [
  ['scripts/migrate.ts', ['DATABASE_URL'], { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db' }],
  ['scripts/purge.ts', ['DATABASE_URL'], { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db' }],
  [
    'scripts/setup-infra.ts',
    ['SQS_QUEUE_NAME', 'SQS_ENDPOINT'],
    { SQS_QUEUE_NAME: 'tickets', SQS_ENDPOINT: 'http://127.0.0.1:1' },
  ],
];

describe.each(SCRIPTS)('%s', (script, needs, own) => {
  it('names exactly its own missing variables and no others', () => {
    const { status, stderr } = start(script, {});
    expect(status).toBe(1);
    expect(stderr).toContain('Invalid environment:');
    for (const key of needs) expect(stderr).toContain(key);
    for (const key of ['REDIS_URL', 'GOOGLE_API_KEY', 'PORTKEY_API_KEY']) {
      expect(stderr).not.toContain(key);
    }
    expect(stderr).not.toMatch(/\n\s+at /);
  });

  it('gets past the configuration with only its own variables set', () => {
    const { stderr } = start(script, own);
    expect(stderr).not.toContain('Invalid environment');
  });

  it('ignores an invalid variable it does not use', () => {
    const { stderr } = start(script, { ...own, WORKER_CONCURRENCY: 'many' });
    expect(stderr).not.toContain('WORKER_CONCURRENCY');
  });
});

describe.each(ENTRIES)('%s', (script) => {
  it('exits at once and names every missing variable when started with no environment', () => {
    const { status, stderr, seconds } = start(script, {});
    expect(status).toBe(1);
    expect(stderr).toContain('Invalid environment:');
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'SQS_QUEUE_NAME']) {
      expect(stderr).toContain(`${key}: required`);
    }
    expect(stderr).not.toMatch(/\n\s+at /);
    expect(seconds).toBeLessThan(15);
  });

  it('exits at once and names an invalid variable', () => {
    const { status, stderr } = start(script, { ...VALID, WORKER_CONCURRENCY: 'many' });
    expect(status).toBe(1);
    expect(stderr).toContain('WORKER_CONCURRENCY: must be a number');
    expect(stderr).not.toMatch(/\n\s+at /);
  });
});

describe('rules at startup', () => {
  it('refuses fake LLM mode in production before anything connects', () => {
    const { status, stderr } = start('src/index.ts', { ...VALID, NODE_ENV: 'production' });
    expect(status).toBe(1);
    expect(stderr).toContain('LLM_MODE=fake is not allowed when NODE_ENV=production');
  });

  it('asks for AWS keys by name when there is no SQS_ENDPOINT', () => {
    const withoutEndpoint: Record<string, string> = { ...VALID };
    delete withoutEndpoint.SQS_ENDPOINT;
    const { status, stderr } = start('src/worker.ts', withoutEndpoint);
    expect(status).toBe(1);
    expect(stderr).toContain('AWS_ACCESS_KEY_ID: required unless SQS_ENDPOINT is set');
    expect(stderr).toContain('AWS_SECRET_ACCESS_KEY: required unless SQS_ENDPOINT is set');
  });

  it('setup-infra names SQS_ENDPOINT, which only that script needs', () => {
    const { status, stderr } = start('scripts/setup-infra.ts', {
      SQS_QUEUE_NAME: 'tickets',
      AWS_ACCESS_KEY_ID: 'a',
      AWS_SECRET_ACCESS_KEY: 'b',
    });
    expect(status).toBe(1);
    expect(stderr).toContain('SQS_ENDPOINT');
    expect(stderr).not.toContain('REDIS_URL');
  });
});
