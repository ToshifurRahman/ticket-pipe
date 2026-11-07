/**
 * Story 7.4 (PA-7.4-05) — the 100 KB body limit and every public POST route's field maximum.
 * The limit runs before the handler, so no ticket or session is created here.
 */
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import request from '../helpers/request.js';

const OVER_LIMIT = 'x'.repeat(110 * 1024);
const id = '00000000-0000-4000-8000-000000000000';

const post = (path: string, body: unknown) => request(app).post(path).send(body);

describe('body over 100 KB', () => {
  it.each([
    ['POST /api/tickets', '/api/tickets', { subject: 'Subject', description: OVER_LIMIT }],
    [
      'POST /api/tickets/:id/notification',
      `/api/tickets/${id}/notification`,
      { email: 'a@example.test', turnstileToken: OVER_LIMIT },
    ],
    ['POST /api/notifications/confirm', '/api/notifications/confirm', { token: OVER_LIMIT }],
    ['POST /api/ops/session', '/api/ops/session', { token: OVER_LIMIT }],
  ])('%s gets 413', async (_name, path, body) => {
    const res = await post(path, body);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Payload too large' });
  });

  it('a stream body with no Content-Length still gets 413', async () => {
    const body = JSON.stringify({ subject: 'Subject', description: OVER_LIMIT });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    const res = await app.request('/api/tickets', {
      method: 'POST',
      body: stream,
      headers: { 'content-type': 'application/json' },
      duplex: 'half',
    });
    expect(res.status).toBe(413);
  });
});

describe('field maximums on public POST routes', () => {
  it('POST /api/tickets: subject and description over their maximum get 400 with a message', async () => {
    const subject = await post('/api/tickets', {
      subject: 'x'.repeat(121),
      description: 'A valid description that is long enough.',
    });
    expect(subject.status).toBe(400);
    expect(subject.body).toEqual({ errors: { subject: 'Subject can be at most 120 characters.' } });

    const description = await post('/api/tickets', {
      subject: 'A valid subject',
      description: 'x'.repeat(5001),
    });
    expect(description.status).toBe(400);
    expect(description.body).toEqual({
      errors: { description: 'Description can be at most 5000 characters.' },
    });
  });

  it.each([
    ['email over 254', { email: `${'a'.repeat(250)}@example.test` }],
    ['turnstileToken over 4096', { email: 'a@example.test', turnstileToken: 'x'.repeat(4097) }],
  ])('POST /api/tickets/:id/notification: %s gets 400', async (_name, body) => {
    const res = await post(`/api/tickets/${id}/notification`, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });

  it('POST /api/notifications/confirm: token over 256 gets 400', async () => {
    const res = await post('/api/notifications/confirm', { token: 'x'.repeat(257) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });

  it('POST /api/ops/session: token over 512 gets 400', async () => {
    const res = await post('/api/ops/session', { token: 'x'.repeat(513) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });
});

describe('origin gate', () => {
  it('rejects a foreign Origin on /api/* with 403 and does not validate the body', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('origin', 'https://evil.test')
      .send({ subject: 123, description: 456 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Origin not allowed' });
  });

  it('rejects a foreign Origin on POST /api/notifications/confirm', async () => {
    const res = await request(app)
      .post('/api/notifications/confirm')
      .set('origin', 'https://evil.test')
      .send({ token: 'abc' });
    expect(res.status).toBe(403);
  });

  it('rejects a foreign Origin on the real socket.io URL, on both transports', async () => {
    for (const transport of ['polling', 'websocket']) {
      const res = await request(app)
        .get(`/socket.io/?EIO=4&transport=${transport}`)
        .set('origin', 'https://evil.test');
      expect(res.status, transport).toBe(403);
      expect(res.body).toEqual({ error: 'Origin not allowed' });
    }
  });

  it('keeps the site origin working', async () => {
    const res = await request(app)
      .get('/socket.io/?EIO=4&transport=polling')
      .set('origin', 'http://localhost:3100');
    // No engine is bound in this process; the gate passed and the route answered.
    expect(res.status).not.toBe(403);
  });
});
