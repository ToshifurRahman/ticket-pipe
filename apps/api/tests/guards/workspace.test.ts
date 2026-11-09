import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { readPackageJson } from '../helpers/package-json.js';

// Story 7.0.1: the repo is a Bun workspace (apps/api + apps/web, one root lockfile).
const root = path.resolve(import.meta.dirname, '../../../..');
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
      'apps/web/tsconfig.test.json',
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

describe('production commands', () => {
  const rootScripts = json('package.json').scripts ?? {};
  const apiScripts = json('apps/api/package.json').scripts ?? {};

  it('builds the web app and type-checks the API without emitting a dist/', () => {
    expect(rootScripts.build).toBe(
      'tsc --noEmit -p apps/api && bun --filter @ticket-pipe/web build'
    );
  });

  it('starts the combined entry point and each service from the root', () => {
    expect(rootScripts.start).toBe('bun --filter @ticket-pipe/api start');
    expect(rootScripts['start:api']).toBe('bun --filter @ticket-pipe/api start:api');
    expect(rootScripts['start:worker']).toBe('bun --filter @ticket-pipe/api start:worker');
  });

  it('runs Bun directly against the TypeScript entry points', () => {
    expect(apiScripts.start).toBe('bun src/main.ts');
    expect(apiScripts['start:api']).toBe('bun src/index.ts');
    expect(apiScripts['start:worker']).toBe('bun src/worker.ts');
  });

  it('loads ../../.env for smoke:infra like the other scripts', () => {
    expect(apiScripts['smoke:infra']).toBe('bun --env-file=../../.env scripts/smoke-infra.ts');
    expect(apiScripts['smoke:infra']).not.toContain('--env-file-if-exists');
  });

  it('keeps pretty logging out of production dependencies', () => {
    const api = json('apps/api/package.json');
    expect(api.dependencies?.['pino-pretty']).toBeUndefined();
    expect(api.devDependencies?.['pino-pretty']).toBeTruthy();
  });

  it('starts the combined API and worker entry point in the image', () => {
    expect(read('Dockerfile')).toContain('CMD ["bun", "src/main.ts"]');
  });
});
