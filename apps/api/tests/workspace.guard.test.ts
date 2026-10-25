import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { readPackageJson } from './helpers/package-json.js';

// Story 7.0.1: the repo is a Bun workspace (apps/api + apps/web, one root lockfile).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf-8');
const json = (p: string) => readPackageJson(root, p);

describe('bun workspace layout', () => {
  it('root declares the apps/* workspaces', () => {
    expect(json('package.json').workspaces).toEqual(['apps/*']);
  });

  it('names the apps with the @ticket-pipe scope', () => {
    expect(json('apps/api/package.json').name).toBe('@ticket-pipe/api');
    expect(json('apps/web/package.json').name).toBe('@ticket-pipe/web');
  });

  it('keeps a single lockfile at the root', () => {
    expect(existsSync(path.join(root, 'bun.lock'))).toBe(true);
    expect(existsSync(path.join(root, 'apps/web/bun.lock'))).toBe(false);
    expect(existsSync(path.join(root, 'web/bun.lock'))).toBe(false);
  });

  it('shares tsconfig.base.json', () => {
    expect(existsSync(path.join(root, 'tsconfig.base.json'))).toBe(true);
    for (const f of [
      'apps/api/tsconfig.json',
      'apps/web/tsconfig.app.json',
      'apps/web/tsconfig.node.json',
    ]) {
      expect(json(f).extends, f).toBe('../../tsconfig.base.json');
    }
  });

  it('never installs or builds through cd web', () => {
    const pkgs = ['package.json', 'apps/api/package.json', 'apps/web/package.json'];
    for (const p of pkgs) {
      for (const [name, cmd] of Object.entries<string>(json(p).scripts ?? {})) {
        expect(cmd, `${p} script ${name}`).not.toMatch(/cd web/);
      }
    }
    expect(read('Dockerfile')).not.toMatch(/cd web/);
  });
});
