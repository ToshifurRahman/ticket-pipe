import { spawnSync } from 'child_process';
import { ESLint } from 'eslint';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, it } from 'vitest';

// Story 7.0.4: one root flat ESLint config, type-aware, applied the same way across the API,
// the web app, e2e and scripts.
const root = path.resolve(import.meta.dirname, '../../..');

// The project service only types files that exist, so the snippet is written to a real path
// inside the app and removed again.
async function rulesFor(code: string, filePath: string) {
  const file = path.join(root, filePath);
  writeFileSync(file, code);
  try {
    const [result] = await new ESLint({ cwd: root }).lintFiles([file]);
    return result.messages.map((m) => m.ruleId ?? m.message);
  } finally {
    rmSync(file, { force: true });
  }
}

it('fails a floating promise', async () => {
  const code = 'async function f() {}\nexport function g() {\n  f();\n}\n';
  expect(await rulesFor(code, 'apps/api/src/__guard__.ts')).toContain(
    '@typescript-eslint/no-floating-promises'
  );
}, 60_000);

it('fails unsorted imports', async () => {
  const code = "import b from 'node:path';\nimport a from 'node:fs';\nexport const x = [a, b];\n";
  expect(await rulesFor(code, 'apps/api/src/__guard__.ts')).toContain('simple-import-sort/imports');
}, 60_000);

it('fails a disable comment without a reason', async () => {
  const code = '// eslint-disable-next-line no-console\nconsole.log(1);\n';
  expect(await rulesFor(code, 'apps/api/src/__guard__.ts')).toContain(
    '@eslint-community/eslint-comments/require-description'
  );
}, 60_000);

it('applies jsx-a11y to the web app', async () => {
  const code = 'export const A = () => <img src="x" />;\n';
  expect(await rulesFor(code, 'apps/web/src/__guard__.tsx')).toContain('jsx-a11y/alt-text');
}, 60_000);

it('has exactly one ESLint config, at the root', () => {
  expect(existsSync(path.join(root, 'eslint.config.js'))).toBe(true);
  expect(existsSync(path.join(root, 'apps/api/eslint.config.js'))).toBe(false);
  expect(existsSync(path.join(root, 'apps/web/eslint.config.js'))).toBe(false);
});

it('runs lint from the root only', () => {
  const pkg = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf-8'));
  expect(pkg('package.json').scripts.lint).toBe('eslint . --max-warnings 0');
  expect(pkg('apps/api/package.json').scripts.lint).toBeUndefined();
  expect(pkg('apps/web/package.json').scripts.lint).toBeUndefined();
});

it('lints the whole repo with zero warnings (run `bun run lint:fix`)', () => {
  const result = spawnSync(
    path.join(root, 'node_modules/.bin/eslint'),
    ['.', '--max-warnings', '0'],
    {
      cwd: root,
      encoding: 'utf-8',
    }
  );
  expect(result.stdout.slice(-2000)).toBe('');
  expect(result.status).toBe(0);
}, 120_000);
