import { createClient } from 'redis';

import { getConfig } from './config.js';
import { logger } from './logger.js';

// Fixed-window counters in Redis, for the opt-in rate limit and the daily send cap (story 6.9).
// Its own lazily opened connection, like ops-session.ts: the Socket.IO clients are pub/sub only.

interface CounterRedis {
  readonly isReady: boolean;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
  destroy(): void;
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

// The request path cannot wait on a dependency that may never answer (story 7.5).
export const COUNTER_TIMEOUT_MS = 2000;

async function within<T>(key: string, timeoutMs: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Counter "${key}" did not answer within ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like `hit`, but rejects when Redis does not answer within `timeoutMs`. The lazy client queues
 * commands while it is disconnected, so a plain `hit` can hang forever during an outage.
 */
export async function hitWithin(
  key: string,
  windowSeconds: number,
  timeoutMs = COUNTER_TIMEOUT_MS
): Promise<number> {
  return within(key, timeoutMs, hit(key, windowSeconds));
}

async function releaseNow(key: string): Promise<void> {
  // A key left at zero or below would linger forever: `hit` only sets a TTL on the first hit.
  if ((await redis().decr(key)) < 1) await redis().del(key);
}

/**
 * Takes one off `key`, bounded like `hitWithin`. Deletes the key when the count falls below one,
 * so a released slot leaves neither a zero count nor a key without a TTL.
 */
export async function release(key: string, timeoutMs = COUNTER_TIMEOUT_MS): Promise<void> {
  await within(key, timeoutMs, releaseNow(key));
}

export async function closeCounters(): Promise<void> {
  const current = client;
  client = null;
  if (!current) return;
  // `quit()` waits for pending commands and a client that is not ready can queue them forever.
  if (!current.isReady) {
    current.destroy();
    return;
  }
  await Promise.allSettled([current.quit()]);
}
