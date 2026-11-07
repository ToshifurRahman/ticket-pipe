import { spawnSync } from 'child_process';
import { ESLint } from 'eslint';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, it } from 'vitest';

import { readPackageJson } from '../helpers/package-json.js';

// Story 7.0.4: one root flat ESLint config, type-aware, applied the same way across the API,
// the web app, e2e and scripts.
const root = path.resolve(import.meta.dirname, '../../../..');

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

// Story 7.0.5: each API folder has one job, and the boundaries are lint errors.
const restricted = 'no-restricted-imports';

it('fails hono in a service', async () => {
  const code = "import { Hono } from 'hono';\nexport const app = new Hono();\n";
  expect(await rulesFor(code, 'apps/api/src/services/__guard__.ts')).toContain(restricted);
}, 60_000);

it('fails hono subpaths and @hono packages outside the HTTP layer', async () => {
  const sub = "import { getCookie } from 'hono/cookie';\nexport const c = getCookie;\n";
  const pkg = "import { zValidator } from '@hono/zod-validator';\nexport const v = zValidator;\n";
  expect(await rulesFor(sub, 'apps/api/src/services/__guard__.ts')).toContain(restricted);
  expect(await rulesFor(pkg, 'apps/api/src/services/__guard__.ts')).toContain(restricted);
}, 60_000);

it('allows hono in routes and middleware', async () => {
  const code = "import { Hono } from 'hono';\nexport const app = new Hono();\n";
  expect(await rulesFor(code, 'apps/api/src/routes/__guard__.ts')).not.toContain(restricted);
  expect(await rulesFor(code, 'apps/api/src/middleware/__guard__.ts')).not.toContain(restricted);
}, 60_000);

it('fails domain importing lib, services or repositories', async () => {
  for (const dir of ['lib/db', 'services/tickets', 'repositories/tickets']) {
    const code = `import * as x from '../${dir}.js';\nexport const y = x;\n`;
    expect(await rulesFor(code, 'apps/api/src/domain/__guard__.ts')).toContain(restricted);
  }
}, 120_000);

it('fails hono in domain', async () => {
  const code = "import { Hono } from 'hono';\nexport const app = new Hono();\n";
  expect(await rulesFor(code, 'apps/api/src/domain/__guard__.ts')).toContain(restricted);
}, 60_000);

it('keeps only infrastructure clients in lib/', () => {
  const libDir = path.join(root, 'apps/api/src/lib');
  expect(readdirSync(libDir).sort()).toEqual(
    [
      'ai-service.ts',
      'config.ts',
      'counters.ts',
      'db.ts',
      'llm-client.ts',
      'logger.ts',
      'mailer.ts',
      'ops-session.ts',
      'queue.ts',
      'rooms.ts',
      'sns.ts',
      'socket.ts',
    ].sort()
  );
});

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
  const pkg = (p: string) => readPackageJson(root, p);
  expect(pkg('package.json').scripts?.lint).toBe('eslint . --max-warnings 0');
  expect(pkg('apps/api/package.json').scripts?.lint).toBeUndefined();
  expect(pkg('apps/web/package.json').scripts?.lint).toBeUndefined();
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
