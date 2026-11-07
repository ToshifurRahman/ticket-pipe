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

const ENTRIES = [
  'src/index.ts',
  'src/main.ts',
  'src/worker.ts',
  'scripts/migrate.ts',
  'scripts/purge.ts',
  'scripts/setup-infra.ts',
];

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
      ...VALID,
      SQS_ENDPOINT: '',
      AWS_ACCESS_KEY_ID: 'a',
      AWS_SECRET_ACCESS_KEY: 'b',
    });
    expect(status).toBe(1);
    expect(stderr).toContain('SQS_ENDPOINT');
  });
});
