import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { readPackageJson } from '../helpers/package-json.js';

// Story 7.0.8: commit format is enforced and the documented structure matches the tree.
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf-8');

function lintCommit(message: string): number | null {
  return spawnSync(path.join(root, 'node_modules/.bin/commitlint'), [], {
    cwd: root,
    input: message,
    encoding: 'utf-8',
  }).status;
}

describe('commit message rules', () => {
  it('rejects a message with no type', () => {
    expect(lintCommit('update stuff')).not.toBe(0);
  });

  it('accepts a typed and scoped message', () => {
    expect(lintCommit('fix(api): reject empty subject')).toBe(0);
  });

  it('accepts a typed message without a scope', () => {
    expect(lintCommit('docs: tidy readme')).toBe(0);
  });

  it('rejects a scope outside the allowed list', () => {
    expect(lintCommit('feat(nope): add thing')).not.toBe(0);
  });

  it('runs commitlint from the commit-msg hook', () => {
    expect(read('.husky/commit-msg')).toContain('commitlint --edit "$1"');
  });
});

describe('docs/ARCHITECTURE.md', () => {
  const architecture = existsSync(path.join(root, 'docs/ARCHITECTURE.md'))
    ? read('docs/ARCHITECTURE.md')
    : '';
  const folders = [
    'apps/api',
    'apps/api/src',
    'apps/api/tests',
    'apps/web',
    'apps/web/src',
    'apps/web/tests',
  ];

  it.each(folders)('describes every folder in %s', (parent) => {
    const dirs = readdirSync(path.join(root, parent), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .filter((name) => name !== 'node_modules' && name !== 'dist');
    const missing = dirs.filter((name) => !architecture.includes(`\`${name}/\``));
    expect(missing).toEqual([]);
  });
});

describe('contributor docs', () => {
  it('ships CONTRIBUTING and the PR template', () => {
    expect(existsSync(path.join(root, 'CONTRIBUTING.md'))).toBe(true);
    expect(existsSync(path.join(root, '.github/pull_request_template.md'))).toBe(true);
  });

  it('links both docs from the README', () => {
    const readme = read('README.md');
    expect(readme).toContain('docs/ARCHITECTURE.md');
    expect(readme).toContain('CONTRIBUTING.md');
  });
});

describe('root check scripts', () => {
  const scripts = readPackageJson(root, 'package.json').scripts ?? {};

  it('defines test, typecheck and check', () => {
    for (const name of ['test', 'typecheck', 'check']) expect(scripts[name], name).toBeTruthy();
  });

  it('check runs format, lint, typecheck and test', () => {
    for (const step of ['format:check', 'lint', 'typecheck', 'test']) {
      expect(scripts.check).toContain(step);
    }
  });
});
