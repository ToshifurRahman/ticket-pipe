import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const API = path.resolve(import.meta.dirname, '../../..');
const LOGGER = pathToFileURL(path.join(API, 'src/lib/logger.ts')).href;

describe('production logging', () => {
  it('writes one JSON object per line with no pretty-printing', () => {
    const script = `import { logger } from ${JSON.stringify(LOGGER)};
logger.info({ check: 'json' }, 'production log');`;
    const result = spawnSync('bun', ['-e', script], {
      cwd: API,
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const line = result.stdout
      .split('\n')
      .find((candidate) => candidate.includes('production log'));
    expect(line).toBeTruthy();
    expect(line).not.toContain('\u001b[');

    const entry = JSON.parse(line!) as { level: number; msg: string; check: string };
    expect(entry.msg).toBe('production log');
    expect(entry.check).toBe('json');
    expect(entry.level).toBe(30);
  });
});
