/**
 * Story 7.4 (Hidden limits) — the real app.onError response carries the security headers and
 * the CSP, not only responses the middleware sees complete normally. A route's service is
 * mocked so the throw comes from inside the handler.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/tickets.js', () => ({
  createTicket: vi.fn(() => {
    throw new Error('forced failure');
  }),
  listTickets: vi.fn(),
  replayTicket: vi.fn(),
}));

import { app } from '../../src/app.js';
import { createTicket } from '../../src/services/tickets.js';
import request from '../helpers/request.js';

afterEach(() => {
  vi.mocked(createTicket).mockReset();
});

const REQUIRED = [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
  'strict-transport-security',
];

describe('a forced 500 from the real app', () => {
  it('carries the security headers and the CSP', async () => {
    const res = await request(app).post('/api/tickets').send({
      subject: 'A valid subject',
      description: 'A valid description that is long enough.',
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    for (const header of REQUIRED) {
      expect(res.headers[header], header).toBeTruthy();
    }
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});
