import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { pool } from '../../src/lib/db.js';
import { insertTicket } from '../../src/repositories/tickets.js';
import { insertEvent } from '../../src/repositories/events.js';
import { insertAiInteraction } from '../../src/repositories/ai-interactions.js';
import { purgeExpiredTickets, RETENTION_DAYS } from '../../src/services/ticket-retention.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await purgeTicketEvents(createdIds);
    await pool.query('DELETE FROM ai_interactions WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

async function ticketAged(ref: string, days: number): Promise<string> {
  const ticket = await insertTicket(ref, 'Sub', 'Desc');
  createdIds.push(ticket.id);
  await pool.query("UPDATE tickets SET created_at = NOW() - make_interval(days => $2) WHERE id = $1", [ticket.id, days]);
  await insertEvent(ticket.id, 'ticket.created');
  await insertAiInteraction({
    ticketId: ticket.id,
    operation: 'triage',
    provider: 'primary',
    model: 'test-model',
    outcome: 'success',
    durationMs: 10,
  });
  return ticket.id;
}

async function count(table: string, ticketId: string, column = 'ticket_id'): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = $1`, [ticketId]);
  return rows[0].n;
}

describe('purgeExpiredTickets', () => {
  it('deletes tickets past the window with their events and AI rows, and keeps newer ones', async () => {
    const oldId = await ticketAged('TICK-RET-OLD', RETENTION_DAYS + 1);
    const freshId = await ticketAged('TICK-RET-FRESH', RETENTION_DAYS - 1);

    await purgeExpiredTickets();

    expect(await count('tickets', oldId, 'id')).toBe(0);
    expect(await count('ticket_events', oldId)).toBe(0);
    expect(await count('ai_interactions', oldId)).toBe(0);
    expect(await count('tickets', freshId, 'id')).toBe(1);
    expect(await count('ticket_events', freshId)).toBe(1);
    expect(await count('ai_interactions', freshId)).toBe(1);
  });

  it('leaves the append-only protection on afterwards', async () => {
    const id = await ticketAged('TICK-RET-GUARD', 1);
    await purgeExpiredTickets();
    await expect(pool.query('DELETE FROM ticket_events WHERE ticket_id = $1', [id])).rejects.toThrow(/append-only/);
  });
});
