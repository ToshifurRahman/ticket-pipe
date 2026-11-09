/**
 * `release` against real Redis, on the integration suite's own logical database. The Lua script
 * must take one off the day key and delete it atomically once the count reaches zero.
 */
import { randomUUID } from 'crypto';
import { createClient } from 'redis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closeCounters, release } from '../../../src/lib/counters.js';

const key = `tickets:test:release:${randomUUID()}`;
const redis = createClient({ url: process.env.REDIS_URL });
const MISSING = -2;

beforeAll(async () => {
  await redis.connect();
});

afterEach(async () => {
  await redis.del(key);
});

afterAll(async () => {
  await redis.del(key);
  await redis.quit();
  await closeCounters();
});

describe('release against Redis', () => {
  it('leaves a count of 4 and keeps the TTL', async () => {
    await redis.set(key, '5', { EX: 60 });
    await release(key);
    expect(await redis.get(key)).toBe('4');
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('deletes the key when the count falls from one', async () => {
    await redis.set(key, '1');
    await release(key);
    expect(await redis.exists(key)).toBe(0);
  });

  it('leaves no key behind for an absent key', async () => {
    await release(key);
    expect(await redis.exists(key)).toBe(0);
    expect(await redis.ttl(key)).toBe(MISSING);
  });
});
