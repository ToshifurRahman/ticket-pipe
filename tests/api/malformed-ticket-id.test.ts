import { describe, it, expect, afterAll } from 'vitest';
import request from '../helpers/ops-session.js';
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';

afterAll(async () => {
  await pool.end();
});

describe('malformed ticket id', () => {
  it.each([
    ['get', '/api/tickets/not-a-uuid'],
    ['get', '/api/tickets/not-a-uuid/events'],
    ['get', '/api/ops/tickets/not-a-uuid'],
    ['get', '/api/ops/tickets/not-a-uuid/events'],
    ['post', '/api/tickets/not-a-uuid/replay'],
  ] as const)('%s %s returns 404, not 500', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });
});
