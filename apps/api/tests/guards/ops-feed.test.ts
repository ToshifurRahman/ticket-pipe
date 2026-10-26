/**
 * Story 4.5 — the ops room is a privacy boundary, so exactly one module may publish to it.
 * Every payload built there is made of IDs, codes and timestamps. If this fails, a new emit
 * site was added: route it through src/services/ops-feed.ts instead.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { sourceFiles } from '../helpers/source-files.js';

const SRC = path.resolve(__dirname, '../../src');
const ALLOWED = path.join(SRC, 'services', 'ops-feed.ts');

describe('ops room publishing', () => {
  it('only src/services/ops-feed.ts publishes to the ops room', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== ALLOWED)
      .filter((file) => /\.to\(\s*(OPS_ROOM|['"`]ops['"`])\s*\)/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('the allowed module really does publish there (the guard is not vacuous)', () => {
    expect(readFileSync(ALLOWED, 'utf8')).toMatch(/\.to\(\s*OPS_ROOM\s*\)/);
  });
});
