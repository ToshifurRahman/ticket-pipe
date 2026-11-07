import { createClient } from 'redis';

import { getConfig } from './config.js';
import { logger } from './logger.js';

// Fixed-window counters in Redis, for the opt-in rate limit and the daily send cap (story 6.9).
// Its own lazily opened connection, like ops-session.ts: the Socket.IO clients are pub/sub only.

interface CounterRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  quit(): Promise<unknown>;
}
let client: CounterRedis | null = null;

function redis(): CounterRedis {
  if (!client) {
    const created = createClient({ url: getConfig().REDIS_URL });
    created.on('error', (err) => logger.error({ err }, 'Redis counters client error'));
    client = created;
    void created
      .connect()
      .catch((err) => logger.error({ err }, 'Redis counters client failed to connect'));
  }
  return client;
}

/** Adds one to `key` and returns the new count. The window starts at the first hit. */
export async function hit(key: string, windowSeconds: number): Promise<number> {
  const count = await redis().incr(key);
  if (count === 1) await redis().expire(key, windowSeconds);
  return count;
}

export async function closeCounters(): Promise<void> {
  const current = client;
  client = null;
  if (current) await Promise.allSettled([current.quit()]);
}
