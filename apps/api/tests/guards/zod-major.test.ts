import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { readPackageJson } from '../helpers/package-json.js';

// Story 7.0.2: the whole repo is on one Zod major (4), including transitive copies.
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf-8');
const json = (p: string) => readPackageJson(root, p);

const major = (range: string) => Number(/\d+/.exec(range)?.[0]);

describe('single zod major', () => {
  it('no workspace declares a zod range below 4', () => {
    for (const p of ['package.json', 'apps/api/package.json', 'apps/web/package.json']) {
      const pkg = json(p);
      const range: string | undefined = pkg.dependencies?.zod ?? pkg.devDependencies?.zod;
      if (range !== undefined) expect(major(range), `${p} zod ${range}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('root overrides transitive zod to 4', () => {
    expect(major(json('package.json').overrides?.zod ?? '0')).toBeGreaterThanOrEqual(4);
  });

  it('bun.lock resolves every zod entry to 4.x', () => {
    const versions = [...read('bun.lock').matchAll(/"zod@(\d+)\.[^"]*"/g)].map((m) => Number(m[1]));
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.filter((v) => v !== 4)).toEqual([]);
  });
});
