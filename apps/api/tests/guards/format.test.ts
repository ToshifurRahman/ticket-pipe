import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { expect, it } from 'vitest';

import { readPackageJson } from '../helpers/package-json.js';

// Story 7.0.3: Prettier owns the whole repo. Generated and tool-managed files are listed in
// .prettierignore; everything else must already be formatted.
const root = path.resolve(import.meta.dirname, '../../../..');
const prettier = path.join(root, 'node_modules/.bin/prettier');

it('every file Prettier owns is formatted (run `bun run format`)', () => {
  const result = spawnSync(prettier, ['--check', '.'], { cwd: root, encoding: 'utf-8' });
  const unformatted = `${result.stdout}${result.stderr}`
    .split('\n')
    .filter((line) => line.startsWith('[warn] ') && !line.includes('Code style issues'))
    .map((line) => line.slice('[warn] '.length));
  expect(unformatted).toEqual([]);
  expect(result.status).toBe(0);
}, 120_000);

it('leaves generated and tool-managed files alone', () => {
  expect(existsSync(path.join(root, '.prettierignore'))).toBe(true);
  const ignored = readFileSync(path.join(root, '.prettierignore'), 'utf-8')
    .split('\n')
    .map((line) => line.trim());
  // tokens.css must stay byte-equal to buildTokensCss() (guards/web-tokens.test.ts).
  expect(ignored).toContain('apps/web/src/styles/tokens.css');
});

it('pins Prettier exactly so output cannot drift on install', () => {
  const pkg = readPackageJson(root, 'package.json');
  expect(pkg.devDependencies?.prettier).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg.scripts?.['format:check']).toBe('prettier --check .');
});
