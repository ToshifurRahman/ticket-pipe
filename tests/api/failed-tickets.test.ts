import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import request from '../helpers/request.js';

const mockEmit = vi.hoisted(() => vi.fn());
const mockTo = vi.hoisted(() => vi.fn((_room: string) => ({ emit: mockEmit })));

// Replays must not leave real messages on the dev queue, and the failure path needs a failing send.
vi.mock('../../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lib/queue.js')>();
  return { ...real, enqueueTicket: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../src/lib/socket.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lib/socket.js')>();
  return { ...real, getEmitter: vi.fn(() => ({ to: mockTo })) };
});
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';
import {
  insertTicket,
  markTicketFailed,
  getTicketById,
  updateTicketStatus,
} from '../../src/repositories/tickets.js';
import { getAllEventsByTicketId } from '../../src/repositories/events.js';
import { enqueueTicket } from '../../src/lib/queue.js';

// Every emit as [room, eventName, payload].
function emitted(): Array<[string, string, Record<string, unknown>]> {
  return mockEmit.mock.calls.map((call, i) => [mockTo.mock.calls[i]![0], call[0], call[1]]);
}

async function eventNames(ticketId: string): Promise<string[]> {
  return (await getAllEventsByTicketId(ticketId)).map(e => e.event);
}

const createdIds: string[] = [];

afterEach(async () => {
  mockEmit.mockClear();
  mockTo.mockClear();
  vi.mocked(enqueueTicket).mockReset().mockResolvedValue(undefined);
  if (createdIds.length) {
    await purgeTicketEvents(createdIds);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('failed tickets in the API (story 5.2)', () => {
  it('lists a failed ticket with its reason and time, distinct from in-progress tickets', async () => {
    const failed = await insertTicket('TICK-API-FAIL-1', 'Sub', 'Desc');
    const waiting = await insertTicket('TICK-API-FAIL-2', 'Sub', 'Desc');
    createdIds.push(failed.id, waiting.id);
    await markTicketFailed(failed.id, 'triage_retries_exhausted');

    const res = await request(app).get('/api/tickets?status=failed&sort=failedAt&order=asc&limit=100');

    expect(res.status).toBe(200);
    const ids = res.body.tickets.map((t: { id: string }) => t.id);
    expect(ids).toContain(failed.id);
    expect(ids).not.toContain(waiting.id);
    const row = res.body.tickets.find((t: { id: string }) => t.id === failed.id);
    expect(row.status).toBe('failed');
    expect(row.failureReason).toBe('triage_retries_exhausted');
    expect(row.failedAt).toBeTruthy();
  });

  it('shows no failure data on tickets that have not failed', async () => {
    const t = await insertTicket('TICK-API-FAIL-3', 'Sub', 'Desc');
    createdIds.push(t.id);

    const res = await request(app).get('/api/tickets?limit=100');

    const row = res.body.tickets.find((x: { id: string }) => x.id === t.id);
    expect(row.failureReason).toBeNull();
    expect(row.failedAt).toBeNull();
  });

  it('replays a failed ticket: requeues it, clears the failure data, and records ticket.requeued', async () => {
    const t = await insertTicket('TICK-API-FAIL-4', 'Sub', 'Desc');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'draft_retries_exhausted');

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(200);
    const row = (await request(app).get('/api/tickets?limit=100')).body.tickets.find(
      (x: { id: string }) => x.id === t.id
    );
    expect(row.status).toBe('queued');
    expect(row.failureReason).toBeNull();
    expect((await getAllEventsByTicketId(t.id)).map(e => e.event)).toContain('ticket.requeued');
  });

});

describe('POST /api/tickets/:id/replay — ops recovery (story 5.4)', () => {
  it('requeues a failed ticket and sends exactly one message', async () => {
    const t = await insertTicket('TICK-API-REPLAY-1', 'Sub', 'Desc');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'triage_retries_exhausted');

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'queued', previousStatus: 'failed' });
    expect(enqueueTicket).toHaveBeenCalledTimes(1);
    expect(enqueueTicket).toHaveBeenCalledWith(t.id, t.referenceNumber);
  });

  it('requeues a needs_attention ticket', async () => {
    const t = await insertTicket('TICK-API-REPLAY-2', 'Sub', 'Desc');
    createdIds.push(t.id);
    await updateTicketStatus(t.id, 'needs_attention');

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(200);
    expect(res.body.previousStatus).toBe('needs_attention');
    expect((await getTicketById(t.id)).status).toBe('queued');
    expect(await eventNames(t.id)).toEqual(['ticket.requeued']);
  });

  it('tells the customer room and the ops room, without any ticket content', async () => {
    const t = await insertTicket('TICK-API-REPLAY-3', 'Private subject', 'Private description');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'draft_retries_exhausted');

    await request(app).post(`/api/tickets/${t.id}/replay`);

    const customer = emitted().filter(([room]) => room === t.id);
    expect(customer).toHaveLength(1);
    expect(customer[0]![1]).toBe('ticket:update');
    expect(customer[0]![2]).toMatchObject({ event: 'ticket.requeued', ticketId: t.id });

    const alert = emitted().find(([room, name]) => room === 'ops' && name === 'ticket:requeued');
    expect(alert).toBeDefined();
    expect(Object.keys(alert![2]).sort()).toEqual(['occurredAt', 'previousStatus', 'referenceNumber', 'ticketId']);
    expect(alert![2]).toMatchObject({ ticketId: t.id, referenceNumber: t.referenceNumber, previousStatus: 'failed' });
    expect(JSON.stringify(emitted())).not.toContain('Private');
  });

  it.each(['queued', 'processing', 'completed'])('refuses a %s ticket with 409 and its status', async status => {
    const t = await insertTicket(`TICK-API-REPLAY-${status}`, 'Sub', 'Desc');
    createdIds.push(t.id);
    await updateTicketStatus(t.id, status);

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(409);
    expect(res.body.status).toBe(status);
    expect(enqueueTicket).not.toHaveBeenCalled();
    expect(await eventNames(t.id)).toEqual([]);
  });

  it('returns 404 for an unknown ticket', async () => {
    const res = await request(app).post('/api/tickets/00000000-0000-4000-8000-000000000000/replay');

    expect(res.status).toBe(404);
  });

  it('lets only one of two simultaneous replays through', async () => {
    const t = await insertTicket('TICK-API-REPLAY-RACE', 'Sub', 'Desc');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'processing_error');

    const responses = await Promise.all([
      request(app).post(`/api/tickets/${t.id}/replay`),
      request(app).post(`/api/tickets/${t.id}/replay`),
    ]);

    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(enqueueTicket).toHaveBeenCalledTimes(1);
    expect(await eventNames(t.id)).toEqual(['ticket.requeued']);
  });

  it('puts the ticket back and returns 503 when the message cannot be sent', async () => {
    const t = await insertTicket('TICK-API-REPLAY-503', 'Sub', 'Desc');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'finalize_failed');
    const before = await getTicketById(t.id);
    vi.mocked(enqueueTicket).mockRejectedValueOnce(new Error('SQS unavailable'));

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(503);
    const after = await getTicketById(t.id);
    expect(after.status).toBe('failed');
    expect(after.failureReason).toBe('finalize_failed');
    expect(after.failedAt).toEqual(before.failedAt);
    expect(await eventNames(t.id)).toEqual(['ticket.requeued', 'ticket.requeue_failed']);
    expect(emitted().filter(([room]) => room === t.id)).toEqual([]);
    expect(emitted().some(([, name]) => name === 'ticket:requeued')).toBe(false);
  });

  it('can be replayed again after a failed attempt', async () => {
    const t = await insertTicket('TICK-API-REPLAY-AGAIN', 'Sub', 'Desc');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'processing_error');
    vi.mocked(enqueueTicket).mockRejectedValueOnce(new Error('SQS unavailable'));
    await request(app).post(`/api/tickets/${t.id}/replay`);

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(200);
    expect((await getTicketById(t.id)).status).toBe('queued');
  });
});
