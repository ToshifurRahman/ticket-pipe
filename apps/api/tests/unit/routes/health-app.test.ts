import { describe, expect, it } from 'vitest';

import { app } from '../../../src/app.js';

// No database mock: the unit project's DATABASE_URL points at a closed port, so this is the
// real wiring of `app.route('/health', ...)` with a real, unreachable pool.
describe('health routes mounted on the real app', () => {
  it('answers /health/live with 200 while the database is unreachable', async () => {
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it.each(['/health/ready', '/health'])(
    'answers %s with 503 while the database is unreachable',
    async (path) => {
      const res = await app.request(path);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: 'error', message: 'Database unavailable' });
    }
  );
});
