import { Router } from 'express';
import { pool } from '../lib/db.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});