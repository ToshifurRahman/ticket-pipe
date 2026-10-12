import { expect, test } from '@playwright/test';
import { E2E_OPS_TOKEN, opsCookie } from './helpers/ops-session';

test('staff-only routes refuse a visitor with no session', async ({ request }) => {
  for (const path of ['/api/tickets', '/api/ops/ai-interactions', '/api/ops/ai-interactions/summary']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
  }
  const replay = await request.post('/api/tickets/00000000-0000-4000-8000-000000000000/replay');
  expect(replay.status()).toBe(401);
});

test('a wrong token is refused and the right one signs in and out', async ({ request }) => {
  const wrong = await request.post('/api/ops/session', {
    data: { token: 'not-the-token' },
    headers: { 'x-forwarded-for': '198.51.100.7' },
  });
  expect(wrong.status()).toBe(401);

  const cookie = await opsCookie(request);
  const list = await request.get('/api/tickets', { headers: { cookie } });
  expect(list.status()).toBe(200);

  expect((await request.delete('/api/ops/session', { headers: { cookie } })).status()).toBe(204);
  expect((await request.get('/api/tickets', { headers: { cookie } })).status()).toBe(401);
});

test('the session endpoint reports signed-out without an error', async ({ request }) => {
  const res = await request.get('/api/ops/session');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ signedIn: false });
  expect(E2E_OPS_TOKEN.length).toBeGreaterThan(0);
});
