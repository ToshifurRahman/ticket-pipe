/**
 * Story 5.3 — a ticket's full history is available through the status lookup, however long
 * it is and however long ago it happened. Long histories continue at /api/tickets/:id/events.
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from '../helpers/request.js';
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';
import { insertTicket } from '../../src/repositories/tickets.js';
import { encodeEventCursor } from '../../src/lib/event-cursor.js';

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await purgeTicketEvents(createdIds);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

async function ticketWithEvents(ref: string, names: string[]) {
  const ticket = await insertTicket(ref, 'Sub', 'Desc');
  createdIds.push(ticket.id);
  await pool.query('INSERT INTO ticket_events (ticket_id, event) SELECT $1, unnest($2::text[])', [ticket.id, names]);
  return ticket;
}

function numbered(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `event-${String(i + 1).padStart(3, '0')}`);
}

async function walkHistory(id: string, limit?: number): Promise<{ events: string[]; pages: number }> {
  const events: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const query: Record<string, string | number> = {};
    if (limit !== undefined) query.limit = limit;
    if (cursor) query.after = cursor;
    const res = await request(app).get(`/api/tickets/${id}/events`).query(query);
    expect(res.status).toBe(200);
    events.push(...res.body.events.map((e: { event: string }) => e.event));
    cursor = res.body.nextCursor;
    pages++;
  } while (cursor);
  return { events, pages };
}

describe('status lookup (story 5.3)', () => {
  it('returns the whole history and a null cursor when it fits in the first page', async () => {
    const ticket = await ticketWithEvents('TICK-HIST-001', ['ticket.submitted', 'triage.started', 'triage.completed']);

    const res = await request(app).get(`/api/tickets/${ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body.events.map((e: { event: string }) => e.event)).toEqual([
      'ticket.submitted',
      'triage.started',
      'triage.completed',
    ]);
    expect(res.body.events[0]).toEqual({ event: 'ticket.submitted', detail: null, occurredAt: expect.any(String) });
    expect(res.body.eventsNextCursor).toBeNull();
  });

  it('embeds the first 50 events, oldest first, and a cursor for the rest', async () => {
    const names = numbered(120);
    const ticket = await ticketWithEvents('TICK-HIST-002', names);

    const res = await request(app).get(`/api/tickets/${ticket.id}`);

    expect(res.body.events.map((e: { event: string }) => e.event)).toEqual(names.slice(0, 50));
    expect(typeof res.body.eventsNextCursor).toBe('string');

    const rest = await request(app).get(`/api/tickets/${ticket.id}/events`).query({ after: res.body.eventsNextCursor });
    expect(rest.body.events[0].event).toBe('event-051');
  });

  it('works the same by reference number', async () => {
    const ticket = await ticketWithEvents('TICK-HIST-003', numbered(60));

    const byId = await request(app).get(`/api/tickets/${ticket.id}`);
    const byRef = await request(app).get(`/api/tickets/ref/${ticket.referenceNumber}`);

    expect(byRef.body.events).toEqual(byId.body.events);
    expect(byRef.body.eventsNextCursor).toBe(byId.body.eventsNextCursor);
  });

  it('works out phases from the full history, not from the first page', async () => {
    // triage completes, then a long run of noise, then draft completes at the very end.
    const names = ['ticket.submitted', 'triage.started', 'triage.completed', ...numbered(80), 'draft.started', 'draft.completed'];
    const ticket = await ticketWithEvents('TICK-HIST-004', names);

    const res = await request(app).get(`/api/tickets/${ticket.id}`);

    expect(res.body.events).toHaveLength(50);
    expect(res.body.phases.triage.status).toBe('completed');
    expect(res.body.phases.draft.status).toBe('completed');
  });

  it('still shows events from months ago', async () => {
    const ticket = await insertTicket('TICK-HIST-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query(
      `INSERT INTO ticket_events (ticket_id, event, occurred_at)
       VALUES ($1, 'ticket.submitted', NOW() - interval '60 days'),
              ($1, 'ticket.completed', NOW() - interval '59 days')`,
      [ticket.id]
    );

    const res = await request(app).get(`/api/tickets/${ticket.id}`);
    expect(res.body.events.map((e: { event: string }) => e.event)).toEqual(['ticket.submitted', 'ticket.completed']);
  });
});

describe('GET /api/tickets/:id/events (story 5.3)', () => {
  it('returns every event, in order, by following nextCursor', async () => {
    const names = numbered(120);
    const ticket = await ticketWithEvents('TICK-HIST-010', names);

    const { events, pages } = await walkHistory(ticket.id);

    expect(events).toEqual(names);
    expect(pages).toBe(3);
  });

  it('honours a custom limit', async () => {
    const names = numbered(7);
    const ticket = await ticketWithEvents('TICK-HIST-011', names);

    const { events, pages } = await walkHistory(ticket.id, 3);

    expect(events).toEqual(names);
    expect(pages).toBe(3);
  });

  it('clamps limit to between 1 and 200', async () => {
    const ticket = await ticketWithEvents('TICK-HIST-012', numbered(250));

    const big = await request(app).get(`/api/tickets/${ticket.id}/events`).query({ limit: 1000 });
    const zero = await request(app).get(`/api/tickets/${ticket.id}/events`).query({ limit: 0 });
    const junk = await request(app).get(`/api/tickets/${ticket.id}/events`).query({ limit: 'abc' });
    const negative = await request(app).get(`/api/tickets/${ticket.id}/events`).query({ limit: -5 });

    expect(big.body.events).toHaveLength(200);
    expect(zero.body.events).toHaveLength(50);
    expect(junk.body.events).toHaveLength(50);
    expect(negative.body.events).toHaveLength(1);
  });

  it('returns an empty page for a ticket with no events', async () => {
    const ticket = await ticketWithEvents('TICK-HIST-013', []);

    const res = await request(app).get(`/api/tickets/${ticket.id}/events`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [], nextCursor: null });
  });

  it('rejects a malformed cursor with 400', async () => {
    const ticket = await ticketWithEvents('TICK-HIST-014', numbered(3));

    for (const after of ['not-a-cursor', Buffer.from('v1:abc').toString('base64url'), `${encodeEventCursor(1)}!!`]) {
      const res = await request(app).get(`/api/tickets/${ticket.id}/events`).query({ after });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid cursor' });
    }
  });

  it('returns 404 for an unknown ticket', async () => {
    const res = await request(app).get('/api/tickets/00000000-0000-0000-0000-000000000000/events');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });
});
