import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import request from '../helpers/request.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'zlib';
import { tmpdir } from 'os';
import path from 'path';
import { mountWebApp } from '../../src/lib/web-app.js';

let dist: string;
let emptyDist: string;

function buildApp(distDir: string) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));
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
  // What `precompress()` in web/vite-plugins.ts writes next to a built file.
  writeFileSync(path.join(dist, 'assets', 'app.js.br'), brotliCompressSync('console.log(1)'));
  writeFileSync(path.join(dist, 'assets', 'app.js.gz'), gzipSync('console.log(1)'));
  writeFileSync(path.join(dist, 'assets', 'plain.js'), 'console.log(2)');
  writeFileSync(path.join(dist, 'index.html.gz'), gzipSync('<!doctype html><title>app shell</title>'));
});

afterAll(() => {
  rmSync(path.dirname(dist), { recursive: true, force: true });
});

async function fetchRaw(app: Hono, url: string, headers: Record<string, string>) {
  const res = await app.request(url, { headers });
  return { res, bytes: Buffer.from(await res.arrayBuffer()) };
}

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

  it('serves the brotli variant when accepted, preferring it over gzip', async () => {
    const { res, bytes } = await fetchRaw(buildApp(dist), '/assets/app.js', { 'accept-encoding': 'gzip, deflate, br' });
    expect(res.headers.get('content-encoding')).toBe('br');
    expect(res.headers.get('vary')).toBe('Accept-Encoding');
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(brotliDecompressSync(bytes).toString()).toBe('console.log(1)');
  });

  it('serves the gzip variant when brotli is not accepted', async () => {
    const { res, bytes } = await fetchRaw(buildApp(dist), '/assets/app.js', { 'accept-encoding': 'gzip' });
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(gunzipSync(bytes).toString()).toBe('console.log(1)');
  });

  it('honours q=0 and serves the original without an Accept-Encoding header', async () => {
    const app = buildApp(dist);
    const refused = await fetchRaw(app, '/assets/app.js', { 'accept-encoding': 'br;q=0, gzip;q=0' });
    expect(refused.res.headers.get('content-encoding')).toBeNull();
    expect(refused.bytes.toString()).toBe('console.log(1)');
    const none = await fetchRaw(app, '/assets/app.js', {});
    expect(none.res.headers.get('content-encoding')).toBeNull();
    expect(none.res.headers.get('vary')).toBe('Accept-Encoding');
  });

  it('falls back to the original when a file has no precompressed sibling', async () => {
    const { res, bytes } = await fetchRaw(buildApp(dist), '/assets/plain.js', { 'accept-encoding': 'br, gzip' });
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(bytes.toString()).toBe('console.log(2)');
  });

  it('compresses the app shell too, and keeps it uncacheable', async () => {
    const { res, bytes } = await fetchRaw(buildApp(dist), '/t/TICK-1759993412345-A1B2C3D4', {
      accept: 'text/html',
      'accept-encoding': 'gzip',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(gunzipSync(bytes).toString()).toContain('app shell');
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
    const app = new Hono();
    expect(mountWebApp(app, emptyDist)).toBe(false);
    expect((await request(app).get('/')).status).toBe(404);
  });
});
