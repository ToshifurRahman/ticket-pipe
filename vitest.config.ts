import { readFileSync } from 'fs';
import { defineConfig } from 'vitest/config';

function parseEnvFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf-8')
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

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { NODE_ENV: 'test', PORTKEY_API_KEY: 'test-portkey-key', ...parseEnvFile('.env'), OPS_TOKEN: 'test-ops-token', SQS_QUEUE_NAME: 'ticket-processing-test' },
    testTimeout: 30000,
  },
});
