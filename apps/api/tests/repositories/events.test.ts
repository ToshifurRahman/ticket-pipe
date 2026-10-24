import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { pool } from '../../src/lib/db.js';
import { insertTicket } from '../../src/repositories/tickets.js';
import { insertEvent, getAllEventsByTicketId, getEventPage } from '../../src/repositories/events.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';

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

describe('getAllEventsByTicketId', () => {
  it('returns an empty array when no events exist', async () => {
    const ticket = await insertTicket('TICK-EVT-001', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events).toEqual([]);
  });

  it('returns events ordered by occurred_at ascending', async () => {
    const ticket = await insertTicket('TICK-EVT-002', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await insertEvent(ticket.id, 'ticket.submitted', ticket.referenceNumber);
    await insertEvent(ticket.id, 'triage.completed');
    await insertEvent(ticket.id, 'ticket.completed');

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual([
      'ticket.submitted',
      'triage.completed',
      'ticket.completed',
    ]);
  });
});

describe('insertEvent', () => {
  it('stores an event without detail', async () => {
    const ticket = await insertTicket('TICK-EVT-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await insertEvent(ticket.id, 'triage.completed');

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('triage.completed');
    expect(events[0].detail).toBeNull();
    expect(events[0].occurredAt).toBeInstanceOf(Date);
  });

  it('stores an event with a detail string', async () => {
    const ticket = await insertTicket('TICK-EVT-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await insertEvent(ticket.id, 'triage.failed', 'Groq API timeout');

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events[0].detail).toBe('Groq API timeout');
  });

  it('stores ticket.submitted with the reference number as detail', async () => {
    const ticket = await insertTicket('TICK-EVT-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await insertEvent(ticket.id, 'ticket.submitted', ticket.referenceNumber);

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events[0].detail).toBe('TICK-EVT-005');
  });

  it('returns every event in insertion order, however long the history is', async () => {
    const ticket = await insertTicket('TICK-EVT-006', 'Long history', 'Desc');
    createdIds.push(ticket.id);
    const names = await insertNumberedEvents(ticket.id, 120);

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual(names);
  });

  it('keeps events that happened months ago', async () => {
    const ticket = await insertTicket('TICK-EVT-007', 'Old ticket', 'Desc');
    createdIds.push(ticket.id);
    await pool.query(
      `INSERT INTO ticket_events (ticket_id, event, occurred_at)
       VALUES ($1, 'ticket.submitted', NOW() - interval '90 days'),
              ($1, 'ticket.completed', NOW() - interval '89 days')`,
      [ticket.id]
    );

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual(['ticket.submitted', 'ticket.completed']);
    expect(Date.now() - events[0].occurredAt.getTime()).toBeGreaterThan(89 * 24 * 3600 * 1000);
  });
});

async function insertNumberedEvents(ticketId: string, count: number): Promise<string[]> {
  const names = Array.from({ length: count }, (_, i) => `event-${String(i + 1).padStart(3, '0')}`);
  // One statement, so every row gets the same NOW(): order must come from seq, not the clock.
  await pool.query(
    'INSERT INTO ticket_events (ticket_id, event) SELECT $1, unnest($2::text[])',
    [ticketId, names]
  );
  return names;
}

describe('getEventPage', () => {
  it('walks the whole history page by page, with no gaps or repeats', async () => {
    const ticket = await insertTicket('TICK-EVT-008', 'Paging', 'Desc');
    createdIds.push(ticket.id);
    const names = await insertNumberedEvents(ticket.id, 120);

    const seen: string[] = [];
    let afterSeq: number | undefined;
    let pages = 0;
    for (;;) {
      const page = await getEventPage(ticket.id, { afterSeq, limit: 50 });
      seen.push(...page.events.map(e => e.event));
      pages++;
      if (page.nextSeq === null) break;
      afterSeq = page.nextSeq;
    }

    expect(pages).toBe(3);
    expect(seen).toEqual(names);
  });

  it('returns a null nextSeq when the history fits exactly in one page', async () => {
    const ticket = await insertTicket('TICK-EVT-009', 'Exact fit', 'Desc');
    createdIds.push(ticket.id);
    await insertNumberedEvents(ticket.id, 5);

    const page = await getEventPage(ticket.id, { limit: 5 });
    expect(page.events).toHaveLength(5);
    expect(page.nextSeq).toBeNull();
  });

  it('only returns events of the requested ticket', async () => {
    const a = await insertTicket('TICK-EVT-010', 'A', 'Desc');
    const b = await insertTicket('TICK-EVT-011', 'B', 'Desc');
    createdIds.push(a.id, b.id);
    await insertEvent(a.id, 'ticket.submitted');
    await insertEvent(b.id, 'ticket.submitted');
    await insertEvent(a.id, 'ticket.completed');

    const page = await getEventPage(a.id, { limit: 50 });
    expect(page.events.map(e => e.event)).toEqual(['ticket.submitted', 'ticket.completed']);
  });
});

describe('ticket_events is append-only', () => {
  it('rejects DELETE, UPDATE and TRUNCATE from the application connection', async () => {
    const ticket = await insertTicket('TICK-EVT-012', 'Protected', 'Desc');
    createdIds.push(ticket.id);
    await insertEvent(ticket.id, 'ticket.submitted');

    await expect(pool.query('DELETE FROM ticket_events WHERE ticket_id = $1', [ticket.id]))
      .rejects.toThrow(/append-only/);
    await expect(pool.query("UPDATE ticket_events SET event = 'tampered' WHERE ticket_id = $1", [ticket.id]))
      .rejects.toThrow(/append-only/);
    await expect(pool.query('TRUNCATE ticket_events')).rejects.toThrow(/append-only/);

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual(['ticket.submitted']);
  });

  it('lets test cleanup purge rows, without leaving the bypass on the pooled connection', async () => {
    const ticket = await insertTicket('TICK-EVT-013', 'Purge', 'Desc');
    createdIds.push(ticket.id);
    await insertEvent(ticket.id, 'ticket.submitted');

    await purgeTicketEvents(ticket.id);
    expect(await getAllEventsByTicketId(ticket.id)).toEqual([]);

    // A single-connection pool would reuse the purge connection; check the flag is gone anyway.
    const { rows } = await pool.query("SELECT current_setting('app.allow_event_purge', true) AS flag");
    expect(rows[0].flag === null || rows[0].flag === '').toBe(true);
  });
});
