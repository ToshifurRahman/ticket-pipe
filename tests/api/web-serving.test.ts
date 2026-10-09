import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { apiNotFound, mountWebApp } from '../../src/lib/web-app.js';

let dist: string;
let emptyDist: string;

function buildApp(distDir: string) {
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', apiNotFound);
  mountWebApp(app, distDir);
  return app;
}

beforeAll(() => {
  const root = mkdtempSync(path.join(tmpdir(), 'web-serving-'));
  dist = path.join(root, 'dist');
  emptyDist = path.join(root, 'missing');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>app shell</title>');
  writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
});

afterAll(() => {
  rmSync(path.dirname(dist), { recursive: true, force: true });
});

describe('web app serving', () => {
  it('serves the app shell for deep links', async () => {
    const res = await request(buildApp(dist)).get('/t/TICK-1759993412345-A1B2C3D4').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('app shell');
  });

  it('serves static assets as-is', async () => {
    const res = await request(buildApp(dist)).get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.text).toBe('console.log(1)');
  });

  it('answers unknown /api paths with a JSON 404, never the shell', async () => {
    const res = await request(buildApp(dist)).get('/api/nope').set('Accept', 'text/html');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('leaves /health and /socket.io to their own handlers', async () => {
    const app = buildApp(dist);
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/socket.io/').set('Accept', 'text/html')).text).not.toContain('app shell');
  });

  it('does not serve the shell for non-HTML requests', async () => {
    const res = await request(buildApp(dist)).get('/some/path').set('Accept', 'application/json');
    expect(res.status).toBe(404);
  });

  it('mounts nothing and does not crash when the build is missing', async () => {
    const app = express();
    expect(mountWebApp(app, emptyDist)).toBe(false);
    expect((await request(app).get('/')).status).toBe(404);
  });
});
