import { Hono } from 'hono';
import { pool } from '../lib/db.js';

export const healthRouter = new Hono();

healthRouter.get('/', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'error', message: 'Database unavailable' }, 503);
  }
});
