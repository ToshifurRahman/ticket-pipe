import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { pool } from '../../src/lib/db.js';
import { insertTicket } from '../../src/repositories/tickets.js';
import { insertEvent, getEventsByTicketId } from '../../src/repositories/events.js';

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await pool.query('DELETE FROM ticket_events WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('getEventsByTicketId', () => {
  it('returns an empty array when no events exist', async () => {
    const ticket = await insertTicket('TICK-EVT-001', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    const events = await getEventsByTicketId(ticket.id);
    expect(events).toEqual([]);
  });

  it('returns events ordered by occurred_at ascending', async () => {
    const ticket = await insertTicket('TICK-EVT-002', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await insertEvent(ticket.id, 'ticket.submitted', ticket.referenceNumber);
    await insertEvent(ticket.id, 'triage.completed');
    await insertEvent(ticket.id, 'ticket.completed');

    const events = await getEventsByTicketId(ticket.id);
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

    const events = await getEventsByTicketId(ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('triage.completed');
    expect(events[0].detail).toBeNull();
    expect(events[0].occurredAt).toBeInstanceOf(Date);
  });

  it('stores an event with a detail string', async () => {
    const ticket = await insertTicket('TICK-EVT-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await insertEvent(ticket.id, 'triage.failed', 'Groq API timeout');

    const events = await getEventsByTicketId(ticket.id);
    expect(events[0].detail).toBe('Groq API timeout');
  });

  it('stores ticket.submitted with the reference number as detail', async () => {
    const ticket = await insertTicket('TICK-EVT-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await insertEvent(ticket.id, 'ticket.submitted', ticket.referenceNumber);

    const events = await getEventsByTicketId(ticket.id);
    expect(events[0].detail).toBe('TICK-EVT-005');
  });

  it('returns at most 20 events ordered oldest-first when more exist', async () => {
    const ticket = await insertTicket('TICK-EVT-006', 'Limit test', 'Desc');

    for (let i = 1; i <= 25; i++) {
      await insertEvent(ticket.id, `event-${String(i).padStart(2, '0')}`);
    }

    const events = await getEventsByTicketId(ticket.id);

    expect(events).toHaveLength(20);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].occurredAt.getTime()).toBeGreaterThanOrEqual(
        events[i - 1].occurredAt.getTime()
      );
    }

    await pool.query('DELETE FROM ticket_events WHERE ticket_id = $1', [ticket.id]);
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticket.id]);
  });
});
