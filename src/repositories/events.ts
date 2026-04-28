import { pool } from '../lib/db.js';

export interface TicketEvent {
  event: string;
  detail: string | null;
  occurredAt: Date;
}

export async function insertEvent(
  ticketId: string,
  event: string,
  detail?: string
): Promise<void> {
  await pool.query(
    'INSERT INTO ticket_events (ticket_id, event, detail) VALUES ($1, $2, $3)',
    [ticketId, event, detail ?? null]
  );
}

export async function getEventsByTicketId(ticketId: string): Promise<TicketEvent[]> {
  const result = await pool.query<{ event: string; detail: string | null; occurred_at: Date }>(
    'SELECT event, detail, occurred_at FROM ticket_events WHERE ticket_id = $1 ORDER BY occurred_at ASC',
    [ticketId]
  );
  return result.rows.map(row => ({
    event: row.event,
    detail: row.detail,
    occurredAt: row.occurred_at,
  }));
}
