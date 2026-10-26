/**
 * Story 7.0.6 — every test sits under one of the four kinds (unit, integration, api, guards).
 * vitest.config.ts builds its `unit` and `integration` projects from those folders, so a test
 * file anywhere else belongs to no project and silently never runs.
 */
import { readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const TESTS = path.resolve(import.meta.dirname, '..');
const KINDS = ['unit', 'integration', 'api', 'guards'];

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? testFiles(full) : entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('test placement', () => {
  it('puts every *.test.ts under unit/, integration/, api/ or guards/', () => {
    const strays = testFiles(TESTS)
      .map((file) => path.relative(TESTS, file))
      .filter((file) => !KINDS.includes(file.split(path.sep)[0]));
    expect(strays).toEqual([]);
  });
});
