import { readFileSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

function parseEnvFile(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const eqIdx = line.indexOf('=');
          return [line.slice(0, eqIdx).trim(), line.slice(eqIdx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}
const env = {
  NODE_ENV: 'test',
  PORTKEY_API_KEY: 'test-portkey-key',
  ...parseEnvFile(path.resolve(import.meta.dirname, '../../.env')),
  // Cloudflare's published always-pass secret, after the .env spread: a developer's own key
  // cannot change what the tests verify against, and spawned entry points inherit it.
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  OPS_TOKEN: 'test-ops-token',
  GOOGLE_API_KEY: 'test-google-key',
  SQS_QUEUE_NAME: 'ticket-processing-test',
  // Abuse protection defaults are small; suites that are not about it must never be throttled.
  TICKET_IP_HOURLY_LIMIT: '100000',
  TICKET_DAILY_CAP: '100000',
};

// `unit` needs no Docker: every infra URL points at a closed port, so a test that reaches for
// the database, Redis, SQS, SNS or SMTP fails on the spot instead of passing against compose.
const DEAD = '127.0.0.1:1';
const unitEnv = {
  ...env,
  DATABASE_URL: `postgres://test:test@${DEAD}/test`,
  REDIS_URL: `redis://${DEAD}`,
  SQS_ENDPOINT: `http://${DEAD}`,
  SNS_ENDPOINT: `http://${DEAD}`,
  SMTP_URL: `smtp://${DEAD}`,
};

// Which folder a test lives in decides its project; tests/guards/test-placement.test.ts keeps
// every file inside one of the four kinds.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/{unit,guards}/**/*.test.ts'],
          env: unitEnv,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/{integration,api}/**/*.test.ts'],
          setupFiles: ['tests/setup/siteverify.ts'],
          env,
        },
      },
    ],
  },
});
