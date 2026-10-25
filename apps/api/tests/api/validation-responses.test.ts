/**
 * Story 7.0.2 — pins the 400 bodies and the accept/reject boundaries of the request schemas,
 * so the Zod 3 -> 4 move cannot change what clients see. Zod's own prose for wrong-type input
 * is not pinned (it changes between majors); the response shape is.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { closeCounters } from '../../src/lib/counters.js';
import { shutdown as shutdownSocket } from '../../src/lib/socket.js';
import { sentMail } from '../../src/lib/mailer.js';
import { insertTicket } from '../../src/repositories/tickets.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';
import opsRequest from '../helpers/ops-session.js';
import request from '../helpers/request.js';

process.env.MAIL_DRIVER = 'memory';
process.env.MAIL_FROM = 'relay@example.test';
process.env.PUBLIC_SITE_URL = 'https://relay.test';
process.env.MAIL_DAILY_CAP = '1000000';

const created: string[] = [];
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}-${process.pid}-${Date.now()}`;

afterAll(async () => {
  await purgeTicketEvents(created);
  await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [created]);
  await pool.end();
  await closeCounters();
  await shutdownSocket();
});

async function ticket() {
  const t = await insertTicket(`TICK-VAL-${randomUUID().slice(0, 8)}`, 'Validation', 'Pinning response shapes.');
  created.push(t.id);
  return t;
}
const optIn = (id: string, body: unknown) =>
  request(app).post(`/api/tickets/${id}/notification`).set('x-forwarded-for', freshIp()).send(body as object);

const GOOD_SUBJECT = 'A valid subject line';
const GOOD_DESCRIPTION = 'A valid description that is long enough to pass the minimum.';

describe('POST /api/tickets: wrong-type and malformed bodies', () => {
  it.each([
    ['subject is a number', { subject: 123, description: GOOD_DESCRIPTION }, 'subject'],
    ['subject is null', { subject: null, description: GOOD_DESCRIPTION }, 'subject'],
    ['description is a number', { subject: GOOD_SUBJECT, description: 42 }, 'description'],
    ['description is null', { subject: GOOD_SUBJECT, description: null }, 'description'],
  ])('%s: 400 with one string message under the field', async (_name, body, field) => {
    const res = await request(app).post('/api/tickets').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { [field]: expect.any(String) } });
  });

  it.each([
    ['a JSON string', '"nope"'],
    ['null', 'null'],
  ])('%s body: 400 with an empty errors object', async (_name, raw) => {
    const res = await request(app).post('/api/tickets').set('content-type', 'application/json').send(raw);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: {} });
  });

  it('reports both fields when both are missing', async () => {
    const res = await request(app).post('/api/tickets').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { subject: 'Subject is required', description: 'Description is required' } });
  });
});

describe('POST /api/tickets/:id/notification (opt-in)', () => {
  it.each([
    ['email missing', {}],
    ['email is a number', { email: 5 }],
    ['email is null', { email: null }],
    ['email is over 254 characters', { email: `${'a'.repeat(250)}@example.test` }],
    ['turnstileToken is a number', { email: 'a@example.test', turnstileToken: 1 }],
    ['turnstileToken is over 4096 characters', { email: 'a@example.test', turnstileToken: 'x'.repeat(4097) }],
  ])('%s: 400 { error: "Invalid request body" }', async (_name, body) => {
    const t = await ticket();
    const res = await optIn(t.id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });

  it('a non-object body gets the same 400', async () => {
    const t = await ticket();
    const res = await request(app)
      .post(`/api/tickets/${t.id}/notification`)
      .set('x-forwarded-for', freshIp())
      .set('content-type', 'application/json')
      .send('"nope"');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });
});

describe('opt-in email boundaries', () => {
  it.each([
    ['plain', 'user@example.test'],
    ['plus tag', 'user+tag@example.test'],
    ['subdomain', 'user@mail.example.test'],
    ['upper case (lower-cased)', 'USER@Example.TEST'],
    ['surrounding spaces (trimmed)', '  user@example.test  '],
  ])('accepts %s', async (_name, email) => {
    const t = await ticket();
    expect((await optIn(t.id, { email })).status).toBe(201);
  });

  it.each([
    ['no @', 'not-an-email'],
    ['missing TLD', 'user@example'],
    ['inner space', 'us er@example.test'],
    ['empty', ''],
    ['unicode local part', 'üser@example.test'],
    ['double @', 'a@@example.test'],
  ])('rejects %s', async (_name, email) => {
    const t = await ticket();
    const res = await optIn(t.id, { email });
    expect(res.status).toBe(400);
    sentMail.length = 0;
  });
});

describe('POST /api/notifications/confirm', () => {
  it.each([
    ['token missing', {}],
    ['token empty', { token: '' }],
    ['token a number', { token: 7 }],
    ['token over 256 characters', { token: 't'.repeat(257) }],
  ])('%s: 400 { error: "Invalid request body" }', async (_name, body) => {
    const res = await request(app).post('/api/notifications/confirm').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });
});

describe('POST /api/ops/session', () => {
  it.each([
    ['token missing', {}],
    ['token a number', { token: 5 }],
    ['token over 512 characters', { token: 't'.repeat(513) }],
  ])('%s: 400 { error: "Invalid request body" }', async (_name, body) => {
    const res = await request(app).post('/api/ops/session').set('x-forwarded-for', freshIp()).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('GET /api/ops/ai-interactions query', () => {
  const list = (query: Record<string, string>) => opsRequest(app).get('/api/ops/ai-interactions').query(query);

  it.each([
    ['operation', { operation: 'nope' }],
    ['provider', { provider: 'nope' }],
    ['outcome', { outcome: 'nope' }],
    ['ticketId', { ticketId: 'not-a-uuid' }],
    ['since', { since: 'not-a-date' }],
    ['until', { until: 'not-a-date' }],
    ['since as epoch millis', { since: '1700000000000' }],
    ['limit non-numeric', { limit: 'abc' }],
    ['limit zero', { limit: '0' }],
    ['limit over 200', { limit: '201' }],
    ['limit fractional', { limit: '1.5' }],
    ['offset negative', { offset: '-1' }],
  ])('rejects bad %s with { error: "Invalid query parameters" }', async (_name, query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid query parameters' });
  });

  it.each([
    ['v4 uuid', randomUUID()],
    ['upper-case v4 uuid', randomUUID().toUpperCase()],
    ['nil uuid', '00000000-0000-0000-0000-000000000000'],
  ])('accepts a ticketId that is a %s', async (_name, ticketId) => {
    expect((await list({ ticketId })).status).toBe(200);
  });

  it.each([
    ['ISO date', { since: '2026-01-01' }],
    ['ISO datetime', { since: '2026-01-01T00:00:00.000Z', until: '2026-12-31T00:00:00.000Z' }],
    ['limit 1', { limit: '1' }],
    ['limit 200', { limit: '200' }],
    ['offset 0', { offset: '0' }],
  ])('accepts %s', async (_name, query) => {
    expect((await list(query)).status).toBe(200);
  });
});

describe('GET /api/ops/ai-interactions/summary query', () => {
  const summary = (query: Record<string, string>) => opsRequest(app).get('/api/ops/ai-interactions/summary').query(query);

  it.each([
    ['since', { since: 'not-a-date' }],
    ['until', { until: 'not-a-date' }],
  ])('rejects bad %s with { error: "Invalid query parameters" }', async (_name, query) => {
    const res = await summary(query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid query parameters' });
  });

  it('accepts ISO dates', async () => {
    expect((await summary({ since: '2026-01-01', until: '2026-01-02' })).status).toBe(200);
  });
});
