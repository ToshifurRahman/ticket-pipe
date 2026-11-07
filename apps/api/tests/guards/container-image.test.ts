import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Story 7.2: one container recipe (pinned base, key-guarded web build, healthcheck, non-root).
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf-8');
const dockerfile = read('Dockerfile');
const compose = read('docker-compose.yml');
const dockerignore = read('.dockerignore');

const [, webStage = '', runtimeStage = ''] = dockerfile.split(/^FROM /m);

describe('base image', () => {
  it('pins every oven/bun reference to an exact x.y.z tag', () => {
    const refs = [...(dockerfile + compose).matchAll(/oven\/bun(:[^\s]*)?/g)];
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const [ref] of refs) expect(ref).toMatch(/^oven\/bun:\d+\.\d+\.\d+$/);
  });
});

describe('web build args', () => {
  it('declares the three VITE_* args in the web stage', () => {
    for (const name of ['VITE_TURNSTILE_SITE_KEY', 'VITE_CF_ANALYTICS_TOKEN', 'VITE_SITE_URL']) {
      expect(webStage).toMatch(new RegExp(`^ARG ${name}$`, 'm'));
    }
  });

  it('gives the Turnstile key no default', () => {
    expect(webStage).not.toMatch(/^ARG VITE_TURNSTILE_SITE_KEY=/m);
  });

  it('fails the build when the Turnstile key is empty, before building', () => {
    const guard = webStage.indexOf('test -n "$VITE_TURNSTILE_SITE_KEY"');
    const build = webStage.indexOf('bun --filter @ticket-pipe/web build');
    expect(guard).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(guard);
  });
});

describe('runtime stage', () => {
  it('runs as the non-root bun user', () => {
    expect(runtimeStage).toMatch(/^USER bun$/m);
  });

  it('has a healthcheck on /health/live that follows $PORT and needs no curl', () => {
    const healthcheck = runtimeStage.match(/^HEALTHCHECK [\s\S]*?\n(?=[A-Z]+ )/m)?.[0] ?? '';
    expect(healthcheck).not.toBe('');
    expect(healthcheck).toContain('process.env.PORT');
    expect(healthcheck).toContain("/health/live'");
    expect(healthcheck).not.toContain('curl');
  });
});

describe('.dockerignore', () => {
  it('keeps env files (but not .env.example) and dev files out of the build context', () => {
    const lines = dockerignore.split('\n').map((l) => l.trim());
    expect(lines).toContain('**/.env*');
    expect(lines).toContain('!.env.example');
    for (const entry of ['.git', 'e2e', 'apps/api/tests', 'docs', '.claude']) {
      expect(lines).toContain(entry);
    }
  });
});

describe('compose image profile', () => {
  const app = compose.slice(compose.indexOf('\n  app:'), compose.indexOf('\nvolumes:'));

  it('has an app service that only starts with the image profile', () => {
    expect(compose).toContain('\n  app:');
    expect(app).toMatch(/profiles:\s*\[image\]/);
  });

  it('does not load .env and names the Turnstile test key explicitly', () => {
    expect(app).not.toContain('env_file');
    expect(app).toContain('VITE_TURNSTILE_SITE_KEY: 1x00000000000000000000AA');
  });

  it('runs in production mode against its own database and queue', () => {
    expect(app).toContain('NODE_ENV: production');
    expect(app).toContain('ticket_pipe_image');
    expect(app).toContain('ticket-processing-image');
  });
});
