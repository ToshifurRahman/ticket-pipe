import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  decr: vi.fn(),
  del: vi.fn(),
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
  it('takes one off the key and keeps it while the count stays at one or more', async () => {
    expect(release).toBeTypeOf('function');
    if (!release) return;
    redis.decr.mockResolvedValue(3);
    await release('k');
    expect(redis.decr).toHaveBeenCalledWith('k');
    expect(redis.del).not.toHaveBeenCalled();
  });

  it.each([0, -1])('deletes the key when the count falls to %i', async (left) => {
    expect(release).toBeTypeOf('function');
    if (!release) return;
    redis.decr.mockResolvedValue(left);
    await release('k');
    expect(redis.del).toHaveBeenCalledWith('k');
  });

  it('rejects within the timeout when a release never answers', async () => {
    expect(release).toBeTypeOf('function');
    if (!release) return;
    redis.decr.mockReturnValue(new Promise(() => {}));
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
