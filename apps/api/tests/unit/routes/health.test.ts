import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../../src/lib/db.js', () => ({ pool: { query } }));

import { healthRouter, READY_DB_TIMEOUT_MS } from '../../../src/routes/health.js';

const SECRET_MARKER = 'secret-marker-7f3a';
const ERROR_BODY = { status: 'error', message: 'Database unavailable' };

const app = new Hono().route('/health', healthRouter);

beforeEach(() => {
  query.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /health/live', () => {
  it('answers 200 and never queries the database', async () => {
    query.mockRejectedValue(new Error('database is down'));
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('answers a HEAD request with 200', async () => {
    const res = await app.request('/health/live', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(query).not.toHaveBeenCalled();
  });
});

describe.each(['/health/ready', '/health'])('GET %s', (path) => {
  it('answers 200 when the database answers SELECT 1', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('answers 503 with no error detail when the query fails', async () => {
    query.mockRejectedValue(new Error(`connect ECONNREFUSED ${SECRET_MARKER}`));
    const res = await app.request(path);
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual(ERROR_BODY);
    expect(text).not.toContain(SECRET_MARKER);
  });

  it('answers 503 once READY_DB_TIMEOUT_MS passes with no answer, and not before', async () => {
    vi.useFakeTimers();
    query.mockReturnValue(new Promise(() => {}));
    let response: Response | undefined;
    const pending = Promise.resolve(app.request(path)).then((res) => {
      response = res;
    });

    await vi.advanceTimersByTimeAsync(READY_DB_TIMEOUT_MS - 1);
    expect(response).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual(ERROR_BODY);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('raises no unhandled rejection when the query rejects after the timeout fired', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      vi.useFakeTimers();
      let rejectQuery: (reason: Error) => void = () => {};
      query.mockReturnValue(
        new Promise((_, reject) => {
          rejectQuery = reject;
        })
      );
      const pending = Promise.resolve(app.request(path));

      await vi.advanceTimersByTimeAsync(READY_DB_TIMEOUT_MS);
      const res = await pending;
      expect(res.status).toBe(503);

      rejectQuery(new Error('connection lost after the timeout'));
      // Node reports an unhandled rejection after the microtask queue drains, so wait on real
      // macrotasks before reading what the listener saw.
      vi.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      vi.useRealTimers();
    }
  });

  it('leaves no timer behind after an answer or a failure', async () => {
    vi.useFakeTimers();
    query.mockResolvedValueOnce({ rows: [] });
    await app.request(path);
    expect(vi.getTimerCount()).toBe(0);

    query.mockRejectedValueOnce(new Error('boom'));
    await app.request(path);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the timeout bound', () => {
  it('is 4000 ms', () => {
    expect(READY_DB_TIMEOUT_MS).toBe(4000);
  });
});
