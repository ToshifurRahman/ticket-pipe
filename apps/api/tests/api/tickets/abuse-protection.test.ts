/**
 * Story 7.5 — abuse protection on ticket submission. A real app, Postgres and Redis; only
 * Cloudflare's siteverify is stubbed (by the integration setup file, and per test below).
 */
import { randomUUID } from 'crypto';
import { createClient } from 'redis';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/queue.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/queue.js')>()),
  enqueueTicket: vi.fn(() => Promise.resolve('message-id')),
}));

// hitWithin and release delegate to the real counters unless a test says otherwise, so a Redis
// outage can be driven at the route without touching the shared connection.
vi.mock('../../../src/lib/counters.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/lib/counters.js')>();
  return { ...real, hitWithin: vi.fn(real.hitWithin), release: vi.fn(real.release) };
});

// The insert delegates to Postgres unless a test makes it reject, so the handler's release path
// runs against the real day key.
vi.mock('../../../src/repositories/tickets.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/repositories/tickets.js')>();
  return { ...real, insertTicket: vi.fn(real.insertTicket) };
});

import { app } from '../../../src/app.js';
import {
  closeCounters,
  COUNTER_TIMEOUT_MS,
  hitWithin,
  release,
} from '../../../src/lib/counters.js';
import { pool } from '../../../src/lib/db.js';
import { logger } from '../../../src/lib/logger.js';
import { sentMail } from '../../../src/lib/mailer.js';
import { enqueueTicket } from '../../../src/lib/queue.js';
import { shutdown as shutdownSocket } from '../../../src/lib/socket.js';
import { insertTicket } from '../../../src/repositories/tickets.js';
import { purgeTicketEvents } from '../../helpers/purge-ticket-events.js';
import request from '../../helpers/request.js';
import { SITEVERIFY_URL, TOKEN } from '../../helpers/siteverify.js';

process.env.MAIL_DRIVER = 'memory';
process.env.MAIL_FROM = 'relay@example.test';
process.env.PUBLIC_SITE_URL = 'https://relay.test';
process.env.MAIL_DAILY_CAP = '1000000';

// The one network call this file would otherwise make is the setup file's stub; keep the real
// fetch so a test's own stub can pass non-siteverify URLs through.
const realFetch = globalThis.fetch;

// A UTC day no other suite can use. With only Date faked, the day key is isolated from every
// other file's POST while real timers keep Redis and Postgres working.
const ISOLATED_DAY = new Date('2099-06-15T12:00:00.000Z');
const ISOLATED_DAY_KEY = `tickets:day:${ISOLATED_DAY.toISOString().slice(0, 10)}`;

const created: string[] = [];
const createdSubjects: string[] = [];
const ipCounter = { value: 0 };
const freshIp = () => `198.51.100.${++ipCounter.value}-${process.pid}-${Date.now()}`;
const hourKey = (ip: string) => `tickets:ip:${ip}:${new Date().toISOString().slice(0, 13)}`;
const dayKey = () => `tickets:day:${new Date().toISOString().slice(0, 10)}`;

let redis: ReturnType<typeof createClient>;

const post = (body: unknown, forwardedFor?: string) => {
  const pending = request(app).post<{ ticketId: string }>('/api/tickets');
  if (forwardedFor) pending.set('x-forwarded-for', forwardedFor);
  return pending.send(body);
};

function subject() {
  const value = `Abuse ${randomUUID().slice(0, 8)}`;
  createdSubjects.push(value);
  return value;
}
const validBody = (name = subject()) => ({
  subject: name,
  description: 'A description long enough to pass the minimum length.',
  turnstileToken: TOKEN,
});

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Siteverify answers with `body`; every other URL goes to the real fetch. */
function stubSiteVerify(body: () => Response | Promise<Response>): void {
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) =>
    urlOf(input) === SITEVERIFY_URL ? body() : realFetch(input, init)
  );
}

function isolateDay(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ISOLATED_DAY);
}

async function rowsFor(name: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM tickets WHERE subject = $1',
    [name]
  );
  return Number(rows[0].count);
}

async function aiRowsFor(name: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ai_interactions ai
       JOIN tickets t ON t.id = ai.ticket_id WHERE t.subject = $1`,
    [name]
  );
  return Number(rows[0].count);
}

beforeEach(async () => {
  if (!redis?.isOpen) {
    redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
  }
  vi.mocked(enqueueTicket).mockClear();
  vi.mocked(hitWithin).mockClear();
  vi.mocked(insertTicket).mockClear();
  vi.mocked(release).mockClear();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  process.env.TICKET_IP_HOURLY_LIMIT = '100000';
  process.env.TICKET_DAILY_CAP = '100000';
  if (redis?.isOpen) await redis.del(ISOLATED_DAY_KEY);
});

afterAll(async () => {
  await purgeTicketEvents(created);
  await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [created]);
  await pool.query('DELETE FROM tickets WHERE subject = ANY($1::text[])', [createdSubjects]);
  await redis?.del(ISOLATED_DAY_KEY);
  await redis?.quit();
  await pool.end();
  await closeCounters();
  await shutdownSocket();
});

describe('POST /api/tickets with a missing or invalid token', () => {
  it('answers 403 and does no work at all', async () => {
    const name = subject();
    const res = await post(
      { subject: name, description: 'A description long enough to pass the minimum.' },
      freshIp()
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "We couldn't verify your request. Please try again." });
    expect(await rowsFor(name)).toBe(0);
    expect(await aiRowsFor(name)).toBe(0);
    expect(enqueueTicket).not.toHaveBeenCalled();
  });

  it('answers 403 for an empty token', async () => {
    const res = await post({ ...validBody(), turnstileToken: '' }, freshIp());
    expect(res.status).toBe(403);
  });

  it('answers 403 for a token siteverify refuses, and does no work', async () => {
    isolateDay();
    await redis.del(dayKey());
    const before = await redis.get(dayKey());
    const enqueued = vi.mocked(enqueueTicket).mock.calls.length;
    stubSiteVerify(
      () =>
        new Response(
          JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
    );

    const name = subject();
    const res = await post({ ...validBody(name) }, freshIp());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "We couldn't verify your request. Please try again." });
    expect(await rowsFor(name)).toBe(0);
    expect(await aiRowsFor(name)).toBe(0);
    expect(vi.mocked(enqueueTicket).mock.calls.length).toBe(enqueued);
    expect(await redis.get(dayKey())).toBe(before);
  });

  it('does not move the daily counter when it refuses for the token', async () => {
    isolateDay();
    await redis.del(dayKey());
    await post(
      { subject: subject(), description: 'A description long enough to pass the minimum.' },
      freshIp()
    );
    expect(await redis.get(dayKey())).toBeNull();
  });

  it('rejects a token over 4096 characters with 400 before any limit is counted', async () => {
    isolateDay();
    await redis.del(ISOLATED_DAY_KEY);
    const ip = freshIp();
    await redis.del(hourKey(ip));

    const res = await post({ ...validBody(), turnstileToken: 'x'.repeat(4097) }, ip);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { turnstileToken: expect.any(String) as string } });
    expect(await redis.get(hourKey(ip))).toBeNull();
    expect(await redis.get(ISOLATED_DAY_KEY)).toBeNull();
  });
});

describe('per-IP limit', () => {
  it('allows the 15th submission from one address and refuses the 16th', async () => {
    process.env.TICKET_IP_HOURLY_LIMIT = '15';
    const ip = freshIp();
    await redis.del(hourKey(ip));

    for (let i = 1; i <= 15; i++) {
      const name = subject();
      const res = await post(validBody(name), ip);
      expect(res.status, `submission ${i}`).toBe(201);
      created.push(res.body.ticketId);
    }

    const name = subject();
    const enqueued = vi.mocked(enqueueTicket).mock.calls.length;
    const res = await post(validBody(name), ip);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: "You've sent several tickets recently. Please try again in about an hour.",
    });
    expect(res.headers['retry-after']).toBe('3600');
    expect(await rowsFor(name)).toBe(0);
    expect(vi.mocked(enqueueTicket).mock.calls.length).toBe(enqueued);
  });

  it('applies the same limit when X-Forwarded-For is absent', async () => {
    process.env.TICKET_IP_HOURLY_LIMIT = '2';
    await redis.del(hourKey('local'));

    const first = await post(validBody());
    expect(first.status).toBe(201);
    created.push(first.body.ticketId);
    const second = await post(validBody());
    expect(second.status).toBe(201);
    created.push(second.body.ticketId);

    const name = subject();
    const third = await post(validBody(name));
    expect(third.status).toBe(429);
    expect(await rowsFor(name)).toBe(0);
  });

  it('validates the body before it counts the address', async () => {
    process.env.TICKET_IP_HOURLY_LIMIT = '1';
    const ip = freshIp();
    await redis.del(hourKey(ip));

    const first = await post(validBody(), ip);
    expect(first.status).toBe(201);
    created.push(first.body.ticketId);

    const res = await post({ subject: 'x' }, ip);
    expect(res.status).toBe(400);
  });
});

describe('daily cap', () => {
  it('refuses past the cap, enqueues nothing and costs no AI call', async () => {
    isolateDay();
    process.env.TICKET_DAILY_CAP = '2';
    await redis.del(dayKey());

    for (let i = 0; i < 2; i++) {
      const res = await post(validBody(), freshIp());
      expect(res.status).toBe(201);
      created.push(res.body.ticketId);
    }
    expect(await redis.get(dayKey())).toBe('2');

    const name = subject();
    const enqueued = vi.mocked(enqueueTicket).mock.calls.length;
    const res = await post(validBody(name), freshIp());
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: "We've reached today's limit for new tickets. Please try again tomorrow.",
    });
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(86400 + 3600);
    expect(await rowsFor(name)).toBe(0);
    expect(await aiRowsFor(name)).toBe(0);
    expect(vi.mocked(enqueueTicket).mock.calls.length).toBe(enqueued);

    // The refused cap attempt was counted (the 429 is a hit); a 403 is not.
    await post(
      { subject: subject(), description: 'A description long enough to pass.' },
      freshIp()
    );
    expect(await redis.get(dayKey())).toBe('3');
  });

  it('refuses the first submission when TICKET_DAILY_CAP is 0', async () => {
    isolateDay();
    process.env.TICKET_DAILY_CAP = '0';
    await redis.del(dayKey());
    const res = await post(validBody(), freshIp());
    expect(res.status).toBe(429);
  });
});

describe('failed insert', () => {
  it('returns the daily slot and keeps the original error', async () => {
    isolateDay();
    await redis.del(ISOLATED_DAY_KEY);
    vi.mocked(insertTicket).mockRejectedValueOnce(new Error('insert failed'));

    const name = subject();
    const res = await post(validBody(name), freshIp());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(await redis.get(ISOLATED_DAY_KEY)).toBeNull();
    expect(await rowsFor(name)).toBe(0);
    expect(release).toHaveBeenCalledWith(ISOLATED_DAY_KEY);
  });

  it('restores a day count that already had a value', async () => {
    isolateDay();
    await redis.set(ISOLATED_DAY_KEY, '5');
    vi.mocked(insertTicket).mockRejectedValueOnce(new Error('insert failed'));

    const res = await post(validBody(), freshIp());
    expect(res.status).toBe(500);
    expect(await redis.get(ISOLATED_DAY_KEY)).toBe('5');
  });

  it('leaves the count at one after a successful create', async () => {
    isolateDay();
    await redis.del(ISOLATED_DAY_KEY);

    const res = await post(validBody(), freshIp());
    expect(res.status).toBe(201);
    created.push(res.body.ticketId);
    expect(await redis.get(ISOLATED_DAY_KEY)).toBe('1');
    expect(release).not.toHaveBeenCalled();
  });

  it('does not release the slot when the daily cap itself refuses', async () => {
    isolateDay();
    process.env.TICKET_DAILY_CAP = '1';
    await redis.set(ISOLATED_DAY_KEY, '1');

    const res = await post(validBody(), freshIp());
    expect(res.status).toBe(429);
    expect(await redis.get(ISOLATED_DAY_KEY)).toBe('2');
    expect(release).not.toHaveBeenCalled();
  });

  it('keeps the original error and logs when the release fails', async () => {
    isolateDay();
    await redis.del(ISOLATED_DAY_KEY);
    vi.mocked(insertTicket).mockRejectedValueOnce(new Error('insert failed'));
    vi.mocked(release).mockRejectedValueOnce(new Error('release failed'));
    const spy = vi.spyOn(logger, 'error');
    try {
      const res = await post(validBody(), freshIp());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      const releaseLog = spy.mock.calls.find(
        ([, message]) => message === 'Ticket submission daily counter release failed'
      );
      expect(releaseLog?.[0]).toHaveProperty('err');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('dependency failures', () => {
  it('answers 503 and creates nothing when siteverify fails', async () => {
    const name = subject();
    stubSiteVerify(() => new Response('boom', { status: 500 }));
    const res = await post(validBody(name), freshIp());
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "We can't accept new requests right now. Please try again shortly.",
    });
    expect(await rowsFor(name)).toBe(0);
  });

  it('answers 503 when the siteverify body is not JSON', async () => {
    const name = subject();
    stubSiteVerify(() => new Response('<html>nope</html>', { status: 200 }));
    const res = await post(validBody(name), freshIp());
    expect(res.status).toBe(503);
    expect(await rowsFor(name)).toBe(0);
  });

  it('answers 503 within the timeout when siteverify never answers', async () => {
    const name = subject();
    vi.stubGlobal(
      'fetch',
      (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (urlOf(input) !== SITEVERIFY_URL) return realFetch(input, init);
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'TimeoutError'))
          );
        });
      }
    );
    const started = Date.now();
    const res = await post(validBody(name), freshIp());
    expect(res.status).toBe(503);
    expect(await rowsFor(name)).toBe(0);
    expect(Date.now() - started).toBeLessThan(8000);
  }, 20000);

  it('answers 503 within the counter timeout when Redis is unreachable', async () => {
    const name = subject();
    vi.mocked(hitWithin).mockImplementationOnce(
      (_key, _window, timeoutMs = COUNTER_TIMEOUT_MS) =>
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error(`Counter did not answer within ${timeoutMs}ms`)),
            timeoutMs
          );
        })
    );
    const started = Date.now();
    const res = await post(validBody(name), freshIp());
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "We can't accept new requests right now. Please try again shortly.",
    });
    expect(await rowsFor(name)).toBe(0);
    expect(Date.now() - started).toBeLessThan(COUNTER_TIMEOUT_MS + 1000);
  }, 20000);
});

describe('POST /api/tickets/:id/notification', () => {
  async function ticket() {
    const t = await insertTicket(
      `TICK-NOTIFY-ABUSE-${randomUUID().slice(0, 8)}`,
      'Abuse guard',
      'A description long enough to pass the minimum.'
    );
    created.push(t.id);
    return t;
  }
  const optIn = (id: string, body: unknown) =>
    request(app)
      .post(`/api/tickets/${id}/notification`)
      .set('x-forwarded-for', freshIp())
      .send(body);

  async function notificationRows(id: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM ticket_notifications WHERE ticket_id = $1',
      [id]
    );
    return Number(rows[0].count);
  }

  beforeEach(() => {
    sentMail.length = 0;
  });

  it('refuses a missing token with 403 and sends nothing', async () => {
    const t = await ticket();
    const res = await optIn(t.id, { email: 'someone@example.test' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "We couldn't verify your request. Please try again." });
    expect(await notificationRows(t.id)).toBe(0);
    expect(sentMail).toEqual([]);
  });

  it('refuses a token siteverify rejects with 403 and sends nothing', async () => {
    const t = await ticket();
    stubSiteVerify(
      () =>
        new Response(
          JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
    );
    const res = await optIn(t.id, { email: 'someone@example.test', turnstileToken: TOKEN });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "We couldn't verify your request. Please try again." });
    expect(await notificationRows(t.id)).toBe(0);
    expect(sentMail).toEqual([]);
  });

  it('validates the body before the token', async () => {
    const t = await ticket();
    const res = await optIn(t.id, { email: `${'a'.repeat(300)}@example.test` });
    expect(res.status).toBe(400);
    expect(await notificationRows(t.id)).toBe(0);
  });

  it('answers 503 and sends nothing when siteverify is unavailable', async () => {
    const t = await ticket();
    stubSiteVerify(() => new Response('boom', { status: 500 }));
    const res = await optIn(t.id, { email: 'someone@example.test', turnstileToken: TOKEN });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "We can't accept new requests right now. Please try again shortly.",
    });
    expect(await notificationRows(t.id)).toBe(0);
    expect(sentMail).toEqual([]);
  });

  it('accepts a verified token', async () => {
    const t = await ticket();
    const res = await optIn(t.id, { email: 'ok@example.test', turnstileToken: TOKEN });
    expect(res.status).toBe(201);
    expect(await notificationRows(t.id)).toBe(1);
  });
});
