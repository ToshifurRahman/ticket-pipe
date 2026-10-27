import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

// Story 7.0.7: the web app imports one way, app → pages → features → shared. Outside code
// reaches a feature only through its index.ts; inside, a feature uses relative paths and never
// climbs out of its folder. landing → tickets is the one allowed cross-feature edge.
const root = path.resolve(import.meta.dirname, '../../../..');
const restricted = 'no-restricted-imports';

// The project service only types files that exist, so the snippet is written to a real path
// inside the app and removed again.
async function rulesFor(code: string, filePath: string) {
  const file = path.join(root, 'apps/web/src', filePath);
  writeFileSync(file, code);
  try {
    const [result] = await new ESLint({ cwd: root }).lintFiles([file]);
    return result.messages.map((m) => m.ruleId ?? m.message);
  } finally {
    rmSync(file, { force: true });
  }
}

const importing = (spec: string) => `import * as x from '${spec}';\nexport const y = x;\n`;

it('fails shared code importing a feature, app or pages', async () => {
  for (const file of ['components/__guard__.ts', 'hooks/__guard__.ts', 'lib/__guard__.ts']) {
    for (const spec of [
      '@/features/tickets',
      '@/features/ops/api',
      '@/app/routes',
      '@/pages/home',
    ]) {
      expect(await rulesFor(importing(spec), file), `${file} → ${spec}`).toContain(restricted);
    }
  }
}, 120_000);

it('fails a feature importing another feature', async () => {
  expect(await rulesFor(importing('@/features/tickets'), 'features/ops/__guard__.ts')).toContain(
    restricted
  );
  expect(
    await rulesFor(importing('@/features/ops'), 'features/tickets/lib/__guard__.ts')
  ).toContain(restricted);
  expect(
    await rulesFor(importing('@/features/ops'), 'features/landing/components/__guard__.ts')
  ).toContain(restricted);
}, 60_000);

it('fails a feature importing itself through the alias', async () => {
  expect(
    await rulesFor(importing('@/features/ops/lib/kpis'), 'features/ops/components/__guard__.ts')
  ).toContain(restricted);
}, 60_000);

it('lets landing use the tickets index, and nothing deeper', async () => {
  const file = 'features/landing/components/__guard__.ts';
  expect(await rulesFor(importing('@/features/tickets'), file)).not.toContain(restricted);
  expect(await rulesFor(importing('@/features/tickets/components/ply-row'), file)).toContain(
    restricted
  );
}, 60_000);

it('fails a relative import that climbs out of a feature', async () => {
  expect(
    await rulesFor(importing('../../ops/api'), 'features/tickets/components/__guard__.ts')
  ).toContain(restricted);
  expect(await rulesFor(importing('../ops/api'), 'features/tickets/__guard__.ts')).toContain(
    restricted
  );
  expect(
    await rulesFor(importing('../lib/ticket-ref'), 'features/tickets/components/__guard__.ts')
  ).not.toContain(restricted);
}, 60_000);

it('fails a feature importing app or pages', async () => {
  expect(await rulesFor(importing('@/app/routes'), 'features/ops/__guard__.ts')).toContain(
    restricted
  );
  expect(await rulesFor(importing('@/pages/home'), 'features/ops/__guard__.ts')).toContain(
    restricted
  );
}, 60_000);

it('fails pages and app reaching inside a feature', async () => {
  const deep = importing('@/features/tickets/lib/ticket-ref');
  expect(await rulesFor(deep, 'pages/__guard__.ts')).toContain(restricted);
  expect(await rulesFor(deep, 'app/__guard__.ts')).toContain(restricted);
  expect(await rulesFor(importing('@/features/tickets'), 'pages/__guard__.ts')).not.toContain(
    restricted
  );
}, 60_000);

it('lets only tests use a feature’s testing fixtures', async () => {
  const fixtures = importing('@/features/tickets/testing');
  expect(await rulesFor(fixtures, 'pages/__guard__.test.ts')).not.toContain(restricted);
  expect(await rulesFor(fixtures, 'app/__guard__.test.ts')).not.toContain(restricted);
  expect(await rulesFor(fixtures, 'pages/__guard__.ts')).toContain(restricted);
}, 60_000);

it('fails pages importing app, except tests rendering the real routes', async () => {
  expect(await rulesFor(importing('@/app/routes'), 'pages/__guard__.ts')).toContain(restricted);
  expect(await rulesFor(importing('@/app/routes'), 'pages/__guard__.test.ts')).not.toContain(
    restricted
  );
  expect(await rulesFor(importing('@/app/analytics'), 'pages/__guard__.test.ts')).toContain(
    restricted
  );
}, 60_000);
