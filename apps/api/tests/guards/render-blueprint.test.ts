/**
 * Story 7.9: the Render blueprint describes the real service, and the list of variables in it
 * is the config schema plus the web build args. This guard reads the actual render.yaml with a
 * small line parser (no YAML dependency) and fails on any drift, so a new variable in
 * apps/api/src/lib/config.ts cannot ship without a place to set it.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { ENV_KEYS } from '../../src/lib/config.js';

const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf-8');

const blueprint = read('render.yaml');
const dockerfile = read('Dockerfile');
const healthRoute = read('apps/api/src/routes/health.ts');
const appSource = read('apps/api/src/app.ts');

// The build args the image declares are the VITE_* names the blueprint must carry: Render
// passes a Docker service's environment variables to the build, and the web bundle bakes them in.
const buildArgs = [...dockerfile.matchAll(/^ARG (VITE_[A-Z0-9_]+)$/gm)].map((match) => match[1]);
// NODE_ENV is set by the image itself (ENV NODE_ENV=production), so a second copy invites drift.
const EXCLUDED = ['NODE_ENV'];

interface Service {
  fields: Map<string, string>;
  envVars: { key: string; fields: Map<string, string> }[];
}

function uncomment(line: string): string {
  return line.replace(/(^|\s)#.*$/, '').trimEnd();
}

/**
 * Just enough of YAML for this file: top-level `services:`, a `- ` service entry at two spaces,
 * its scalar fields at four, the `envVars:` list at six and each entry's fields at eight.
 * Anything outside that shape is reported by the assertions that follow, not guessed at.
 */
function parse(text: string): Service[] {
  const services: Service[] = [];
  let service: Service | undefined;
  let envVar: { key: string; fields: Map<string, string> } | undefined;
  let inEnvVars = false;

  for (const raw of text.split('\n')) {
    const line = uncomment(raw);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (indent === 0) {
      inEnvVars = false;
      continue;
    }
    if (indent === 2 && body.startsWith('- ')) {
      service = { fields: new Map(), envVars: [] };
      services.push(service);
      envVar = undefined;
      inEnvVars = false;
      const field = body.slice(2);
      const [key, ...rest] = field.split(':');
      if (rest.length > 0) service.fields.set(key.trim(), rest.join(':').trim());
      continue;
    }
    if (!service) continue;

    if (indent === 4) {
      const [key, ...rest] = body.split(':');
      if (rest.length === 0) continue;
      const value = rest.join(':').trim();
      if (key.trim() === 'envVars' && value === '') {
        inEnvVars = true;
        envVar = undefined;
        continue;
      }
      inEnvVars = false;
      service.fields.set(key.trim(), value);
      continue;
    }

    if (inEnvVars && indent === 6 && body.startsWith('- ')) {
      envVar = { key: '', fields: new Map() };
      service.envVars.push(envVar);
      const [key, ...rest] = body.slice(2).split(':');
      if (rest.length > 0) {
        const value = rest.join(':').trim();
        if (key.trim() === 'key') envVar.key = value;
        else envVar.fields.set(key.trim(), value);
      }
      continue;
    }
    if (inEnvVars && indent === 8 && envVar && body.includes(':')) {
      const [key, ...rest] = body.split(':');
      envVar.fields.set(key.trim(), rest.join(':').trim());
    }
  }

  return services;
}

const services = parse(blueprint);
const [web] = services;
const field = (name: string) => web?.fields.get(name);
const envNames = () => web?.envVars.map((entry) => entry.key) ?? [];

describe('render.yaml services', () => {
  it('describes exactly one service', () => {
    expect(services).toHaveLength(1);
  });

  it('is a Docker web service on the free plan, named relay, deploying main', () => {
    expect(field('type')).toBe('web');
    expect(field('runtime')).toBe('docker');
    expect(field('plan')).toBe('free');
    expect(field('name')).toBe('relay');
    expect(field('branch')).toBe('main');
    expect(field('region')).toBe('singapore');
  });

  it('leaves numInstances out, since the free plan allows one instance', () => {
    expect(web?.fields.has('numInstances')).toBe(false);
  });
});

describe('render.yaml deploy', () => {
  it('builds the Dockerfile at the repository root, which exists', () => {
    expect(field('dockerfilePath')).toBe('./Dockerfile');
    expect(existsSync(path.join(root, field('dockerfilePath') ?? ''))).toBe(true);
  });

  it('starts the migration before the server, in one shell, so a failed migration stops the start', () => {
    const command = field('dockerCommand') ?? '';
    expect(command.startsWith('/bin/sh -c ')).toBe(true);
    const migrate = command.indexOf('scripts/migrate.ts');
    const main = command.indexOf('src/main.ts');
    expect(migrate, command).toBeGreaterThan(-1);
    expect(main, command).toBeGreaterThan(-1);
    expect(migrate).toBeLessThan(main);
    // `bun scripts/migrate.ts; bun src/main.ts` would start the server after a failed migration.
    expect(command).toContain('&&');
  });

  it('deploys only after the CI checks pass', () => {
    expect(field('autoDeployTrigger')).toBe('checksPass');
  });
});

describe('render.yaml health check', () => {
  it('points at /health/ready', () => {
    expect(field('healthCheckPath')).toBe('/health/ready');
  });

  it('names a path the code actually serves, mounted under the same prefix', () => {
    const healthPath = field('healthCheckPath') ?? '';
    expect(healthPath.startsWith('/')).toBe(true);
    const [prefix, ...rest] = healthPath.split('/').filter(Boolean);
    expect(appSource).toContain(`app.route('/${prefix}', healthRouter)`);
    expect(healthRoute).toContain(`healthRouter.get('/${rest.join('/')}'`);
  });
});

describe('render.yaml environment variables', () => {
  it('declares the three VITE_* build args the Dockerfile takes', () => {
    expect(buildArgs).toEqual(
      expect.arrayContaining([
        'VITE_TURNSTILE_SITE_KEY',
        'VITE_CF_ANALYTICS_TOKEN',
        'VITE_SITE_URL',
      ])
    );
    for (const name of buildArgs) expect(envNames()).toContain(name);
  });

  it('has no repeated variable', () => {
    const names = envNames();
    expect(names).toEqual([...new Set(names)]);
  });

  it('gives every entry a name, sync: false, and no value key', () => {
    for (const entry of web?.envVars ?? []) {
      expect(entry.key, JSON.stringify(entry.fields)).not.toBe('');
      expect(entry.fields.get('sync'), entry.key).toBe('false');
      expect(entry.fields.has('value'), `${entry.key} carries a value`).toBe(false);
    }
  });

  it('lists exactly the config schema plus the build args, minus NODE_ENV', () => {
    const expected = [...ENV_KEYS.filter((key) => !EXCLUDED.includes(key)), ...buildArgs].sort();
    expect([...envNames()].sort()).toEqual(expected);
  });

  it('keeps NODE_ENV out, because the image already sets it', () => {
    for (const key of EXCLUDED) expect(envNames()).not.toContain(key);
  });
});
