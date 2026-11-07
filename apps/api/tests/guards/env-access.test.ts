/**
 * Environment access (PA-7.3). apps/api/src/lib/config.ts validates every variable once and is
 * the only file that reads process.env; all other code takes its settings from getConfig().
 * Tests under apps/api/tests set variables for their own setup and are not scanned.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { sourceFiles } from '../helpers/source-files.js';

const API = path.resolve(import.meta.dirname, '../..');
const CONFIG = path.join(API, 'src/lib/config.ts');

describe('environment access', () => {
  it('reads process.env only in lib/config.ts', () => {
    const offenders = [
      ...sourceFiles(path.join(API, 'src')),
      ...sourceFiles(path.join(API, 'scripts')),
    ]
      .filter((file) => file !== CONFIG)
      .filter((file) =>
        /process\s*\.\s*env|process\s*\[\s*['"]env['"]\s*\]/.test(readFileSync(file, 'utf8'))
      )
      .map((file) => path.relative(API, file));
    expect(offenders).toEqual([]);
  });

  it('scans the files it claims to (the scan is not empty)', () => {
    expect(sourceFiles(path.join(API, 'scripts')).length).toBeGreaterThanOrEqual(3);
    expect(readFileSync(CONFIG, 'utf8')).toContain('process.env');
  });
});
