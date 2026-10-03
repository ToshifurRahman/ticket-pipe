/**
 * Story 4.5 — the ops room is a privacy boundary, so exactly one module may publish to it.
 * Every payload built there is made of IDs, codes and timestamps. If this fails, a new emit
 * site was added: route it through src/services/ops-feed.ts instead.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../src');
const ALLOWED = path.join(SRC, 'services', 'ops-feed.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

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
