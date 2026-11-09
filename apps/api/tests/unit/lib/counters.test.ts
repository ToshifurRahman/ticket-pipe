import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  decr: vi.fn(),
  del: vi.fn(),
  eval: vi.fn<(script: string, options: { keys: string[] }) => Promise<unknown>>(),
  connect: vi.fn(() => Promise.resolve()),
  quit: vi.fn(() => Promise.resolve()),
  destroy: vi.fn(),
  isReady: true,
}));

vi.mock('redis', () => ({
  createClient: () => ({
    incr: redis.incr,
    expire: redis.expire,
    decr: redis.decr,
    del: redis.del,
    eval: redis.eval,
    connect: redis.connect,
    quit: redis.quit,
    destroy: redis.destroy,
    on: () => undefined,
    get isReady() {
      return redis.isReady;
    },
  }),
}));

import * as countersModule from '../../../src/lib/counters.js';
import { closeCounters, COUNTER_TIMEOUT_MS, hitWithin } from '../../../src/lib/counters.js';

type Release = (key: string, timeoutMs?: number) => Promise<void>;
const release = (countersModule as unknown as { release?: Release }).release;

beforeEach(() => {
  redis.incr.mockReset();
  redis.expire.mockReset();
  redis.decr.mockReset();
  redis.del.mockReset();
  redis.eval.mockReset();
  redis.quit.mockReset();
  redis.destroy.mockReset();
  redis.isReady = true;
});

afterEach(async () => {
  await closeCounters();
});

describe('hitWithin', () => {
  it('counts and starts the window on the first hit, like hit', async () => {
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(true);
    await expect(hitWithin('k', 60)).resolves.toBe(1);
    expect(redis.expire).toHaveBeenCalledWith('k', 60);
  });

  it('does not reset an existing window', async () => {
    redis.incr.mockResolvedValue(2);
    await expect(hitWithin('k', 60)).resolves.toBe(2);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('rejects within the timeout when Redis never answers', async () => {
    redis.incr.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    await expect(hitWithin('k', 60, 30)).rejects.toThrow(/did not answer/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('defaults to a two-second timeout', () => {
    expect(COUNTER_TIMEOUT_MS).toBe(2000);
  });
});

describe('release', () => {
  it('issues one eval with the key in keys and no separate decr or del', async () => {
    expect(release).toBeTypeOf('function');
    if (!release) return;
    const key = 'tickets:day:2099-06-15';
    redis.eval.mockResolvedValue(4);
    await release(key);

    expect(redis.eval).toHaveBeenCalledTimes(1);
    const [script, options] = redis.eval.mock.calls[0];
    expect(options).toEqual({ keys: [key] });
    expect(script).toContain('DECR');
    expect(script).toContain('DEL');
    expect(script).not.toContain(key);
    expect(redis.decr).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('rejects within the timeout when a release never answers', async () => {
    expect(release).toBeTypeOf('function');
    if (!release) return;
    redis.eval.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    await expect(release('k', 30)).rejects.toThrow(/did not answer/);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('closeCounters', () => {
  it('closes a ready client gracefully', async () => {
    redis.isReady = true;
    await hitWithin('k', 60);
    await closeCounters();
    expect(redis.quit).toHaveBeenCalled();
    expect(redis.destroy).not.toHaveBeenCalled();
  });

  it('returns instead of waiting on quit when the client is not ready', async () => {
    redis.isReady = false;
    redis.quit.mockReturnValue(new Promise(() => {}));
    await hitWithin('k', 60);
    const outcome = await Promise.race([
      closeCounters().then(() => 'closed'),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 200)),
    ]);
    expect(outcome).toBe('closed');
    expect(redis.destroy).toHaveBeenCalled();
    expect(redis.quit).not.toHaveBeenCalled();
  });
});
