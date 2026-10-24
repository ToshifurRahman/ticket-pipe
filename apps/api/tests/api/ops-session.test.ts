import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { assertOpsTokenConfigured } from '../../src/lib/ops-session.js';
import { shutdown as shutdownSocket } from '../../src/lib/socket.js';
import request from '../helpers/request.js';

const TOKEN = process.env.OPS_TOKEN as string;
const PROTECTED = '/api/ops/ai-interactions/summary';

// Sign-in failures are counted per client IP in the Redis shared with other test files, so
// every test here uses its own address (the last X-Forwarded-For hop) and the local one is
// never locked out.
let ipCounter = 0;
const freshIp = () => `203.0.113.${(Date.now() + ++ipCounter) % 250}-${process.pid}-${ipCounter}`;

function signIn(token: unknown, ip = freshIp()) {
  return request(app).post('/api/ops/session').set('x-forwarded-for', ip).send({ token });
}

const cookieOf = (res: { headers: Record<string, string> }) => res.headers['set-cookie'].split(';')[0];

afterAll(async () => {
  await shutdownSocket();
});

describe('POST /api/ops/session', () => {
  it('signs in with the right token and sets a hardened cookie', async () => {
    const res = await signIn(TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.signedIn).toBe(true);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toMatch(/^ops_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toContain('Max-Age=43200');
    expect(setCookie).toContain('Path=/');
    // The token itself never appears in a response.
    expect(res.text).not.toContain(TOKEN);
  });

  it('rejects a wrong token with 401 and no cookie', async () => {
    const res = await signIn('wrong-token');
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a body without a token with 400', async () => {
    const res = await signIn(undefined);
    expect(res.status).toBe(400);
  });

  it('locks an address out after 5 failures, then 429s even for the right token', async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await signIn('nope', ip)).status).toBe(401);

    const locked = await signIn(TOKEN, ip);
    expect(locked.status).toBe(429);
    expect(locked.body).toEqual({ error: 'Too many attempts, try again later' });

    // Someone else is unaffected.
    expect((await signIn(TOKEN)).status).toBe(200);
  });
});

describe('GET /api/ops/session', () => {
  it('says whether the caller is signed in, never 401', async () => {
    const out = await request(app).get('/api/ops/session');
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ signedIn: false });

    const cookie = cookieOf(await signIn(TOKEN));
    const inn = await request(app).get('/api/ops/session').set('cookie', cookie);
    expect(inn.body.signedIn).toBe(true);
    // ~12h from now, never more.
    const remainingS = (Date.parse(inn.body.expiresAt) - Date.now()) / 1000;
    expect(remainingS).toBeGreaterThan(43200 - 30);
    expect(remainingS).toBeLessThanOrEqual(43200);
  });
});

describe('DELETE /api/ops/session', () => {
  it('ends the session server-side, so the old cookie stops working', async () => {
    const cookie = cookieOf(await signIn(TOKEN));
    expect((await request(app).get(PROTECTED).set('cookie', cookie)).status).toBe(200);

    const res = await request(app).delete('/api/ops/session').set('cookie', cookie);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toMatch(/ops_session=;/);

    // The browser's copy is cleared, but a copied cookie is dead too.
    expect((await request(app).get(PROTECTED).set('cookie', cookie)).status).toBe(401);
    expect((await request(app).get('/api/ops/session').set('cookie', cookie)).body).toEqual({ signedIn: false });
  });

  it('is a no-op without a session', async () => {
    expect((await request(app).delete('/api/ops/session')).status).toBe(204);
  });

  it('does not end other sessions', async () => {
    const first = cookieOf(await signIn(TOKEN));
    const second = cookieOf(await signIn(TOKEN));
    await request(app).delete('/api/ops/session').set('cookie', first);
    expect((await request(app).get(PROTECTED).set('cookie', second)).status).toBe(200);
  });
});

describe('startup check', () => {
  const original = { env: process.env.NODE_ENV, token: process.env.OPS_TOKEN };
  afterAll(() => {
    process.env.NODE_ENV = original.env;
    process.env.OPS_TOKEN = original.token;
  });

  it('requires a 32+ character OPS_TOKEN in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.OPS_TOKEN = 'short';
    expect(() => assertOpsTokenConfigured()).toThrow(/OPS_TOKEN/);
    delete process.env.OPS_TOKEN;
    expect(() => assertOpsTokenConfigured()).toThrow(/OPS_TOKEN/);
    process.env.OPS_TOKEN = 'x'.repeat(32);
    expect(() => assertOpsTokenConfigured()).not.toThrow();
  });

  it('does not require it elsewhere', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.OPS_TOKEN;
    expect(() => assertOpsTokenConfigured()).not.toThrow();
  });
});

describe('sign-in without a configured token', () => {
  const token = process.env.OPS_TOKEN;
  beforeAll(() => {
    delete process.env.OPS_TOKEN;
  });
  afterAll(() => {
    process.env.OPS_TOKEN = token;
  });

  it('answers 503 and never signs anyone in', async () => {
    expect((await signIn('')).status).toBe(503);
  });
});
