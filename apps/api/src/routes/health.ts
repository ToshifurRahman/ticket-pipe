import type { Context } from 'hono';
import { Hono } from 'hono';

import { pool } from '../lib/db.js';

// `lib/db.ts` sets no connection timeout, so a database host that never answers would hang the
// probe instead of failing it. The handler gives up after this long.
export const READY_DB_TIMEOUT_MS = 4000;

export const healthRouter = new Hono();

// Process only: it must not touch the database, so a monitor that pings it keeps the service
// awake without waking the database.
healthRouter.get('/live', (c) => c.json({ status: 'ok' }));

async function ready(c: Context) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const noAnswer = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Database check timed out')), READY_DB_TIMEOUT_MS);
  });
  try {
    await Promise.race([pool.query('SELECT 1'), noAnswer]);
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'error', message: 'Database unavailable' }, 503);
  } finally {
    clearTimeout(timer);
  }
}

healthRouter.get('/ready', ready);
// `/health` stays an alias of ready: the same handler, so the two never differ.
healthRouter.get('/', ready);
