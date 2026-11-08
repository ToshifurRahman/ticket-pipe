import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  connect: vi.fn(() => Promise.resolve()),
  quit: vi.fn(() => Promise.resolve()),
}));

vi.mock('redis', () => ({
  createClient: () => ({
    incr: redis.incr,
    expire: redis.expire,
    connect: redis.connect,
    quit: redis.quit,
    on: () => undefined,
  }),
}));

import { closeCounters, COUNTER_TIMEOUT_MS, hitWithin } from '../../../src/lib/counters.js';

beforeEach(() => {
  redis.incr.mockReset();
  redis.expire.mockReset();
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
