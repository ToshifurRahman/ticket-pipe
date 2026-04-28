import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

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
    env: { NODE_ENV: 'test', ...parseEnvFile('.env') },
  },
});
