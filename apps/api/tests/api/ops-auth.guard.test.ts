/**
 * Story 6.5: every staff-only route refuses a caller with no session, and nothing public
 * got locked by accident. A route added to /api/ops later is covered by the first test
 * without anyone remembering to list it.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { shutdown as shutdownSocket } from '../../src/lib/socket.js';
import request from '../helpers/request.js';

const ID = '00000000-0000-4000-8000-000000000000';

afterAll(async () => {
  await shutdownSocket();
});

describe('staff-only routes', () => {
  const guarded = app.routes
    .filter((r) => r.path.startsWith('/api/ops/') && !r.path.startsWith('/api/ops/session') && r.method !== 'ALL')
    .map((r) => [r.method, r.path.replace(':id', ID)] as const);

  it('finds the ops routes to check', () => {
    expect(guarded.length).toBeGreaterThanOrEqual(4);
  });

  it.each(guarded)('%s %s needs a session', async (method, path) => {
    const res = await (request(app) as any)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it.each([
    ['get', '/api/tickets'],
    ['post', `/api/tickets/${ID}/replay`],
  ])('%s %s needs a session', async (method, path) => {
    const res = await (request(app) as any)[method](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('refuses a forged or malformed session cookie', async () => {
    for (const cookie of ['ops_session=forged', 'ops_session=', 'other=1', 'ops_session']) {
      const res = await request(app).get('/api/ops/ai-interactions').set('cookie', cookie);
      expect(res.status).toBe(401);
    }
  });
});

describe('public routes', () => {
  // None of these may ask for a session: a 401 here would lock customers out of their ticket.
  it.each([
    ['get', `/api/tickets/${ID}`],
    ['get', '/api/tickets/ref/TICK-1759993412345-A1B2C3D4'],
    ['get', `/api/tickets/${ID}/events`],
    ['post', '/api/tickets'],
    ['get', '/health'],
    ['get', '/api/ops/session'],
  ])('%s %s is open', async (method, path) => {
    const res = await (request(app) as any)[method](path);
    expect(res.status).not.toBe(401);
  });
});
