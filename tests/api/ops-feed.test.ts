/**
 * Story 4.4 — the API process owns `ticket.submitted`, which no worker ever sees, so the
 * ops feed has to hear about it from here.
 */
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import request from '../helpers/request.js';

const mockOpsEmit = vi.hoisted(() => vi.fn());
const mockTo = vi.hoisted(() => vi.fn(() => ({ emit: mockOpsEmit })));

vi.mock('../../src/lib/socket.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lib/socket.js')>();
  return { ...real, getEmitter: vi.fn(() => ({ to: mockTo })) };
});

import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';

const createdIds: string[] = [];

afterEach(async () => {
  mockOpsEmit.mockReset();
  if (createdIds.length) {
    await purgeTicketEvents(createdIds);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/tickets — ops feed', () => {
  it('publishes ticket.submitted to the ops room with status information only', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ subject: 'Private subject', description: 'Private description' });
    expect(res.status).toBe(201);
    createdIds.push(res.body.ticketId);

    // The event is written fire-and-forget after the response is built.
    await vi.waitFor(() => expect(mockOpsEmit).toHaveBeenCalledTimes(1));

    expect(mockTo).toHaveBeenCalledWith('ops');
    const [name, payload] = mockOpsEmit.mock.calls[0]!;
    expect(name).toBe('ops:ticket_event');
    expect(Object.keys(payload).sort()).toEqual(['event', 'occurredAt', 'referenceNumber', 'ticketId']);
    expect(payload).toMatchObject({
      event: 'ticket.submitted',
      ticketId: res.body.ticketId,
      referenceNumber: res.body.referenceNumber,
    });
    expect(JSON.stringify(payload)).not.toContain('Private');
  });
});
