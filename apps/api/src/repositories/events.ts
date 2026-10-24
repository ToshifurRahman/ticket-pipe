import { pool } from '../lib/db.js';

export interface TicketEvent {
  event: string;
  detail: string | null;
  occurredAt: Date;
}

export interface TicketEventPage {
  events: TicketEvent[];
  /** The `seq` to continue after, or null when this page reaches the end of the history. */
  nextSeq: number | null;
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

interface TicketEventRow {
  seq: string; // BIGINT arrives as a string from pg
  event: string;
  detail: string | null;
  occurred_at: Date;
}

function toTicketEvent(row: TicketEventRow): TicketEvent {
  return { event: row.event, detail: row.detail, occurredAt: row.occurred_at };
}

/**
 * Every event the ticket has ever had, oldest first. Phase status and failure counts must be
 * worked out from this, never from a page, or a long history would give the wrong answer.
 */
export async function getAllEventsByTicketId(ticketId: string): Promise<TicketEvent[]> {
  const result = await pool.query<TicketEventRow>(
    `SELECT seq, event, detail, occurred_at
     FROM ticket_events
     WHERE ticket_id = $1
     ORDER BY seq ASC`,
    [ticketId]
  );
  return result.rows.map(toTicketEvent);
}

/** One page of the ticket's history, oldest first, starting after `afterSeq` when given. */
export async function getEventPage(
  ticketId: string,
  { afterSeq, limit }: { afterSeq?: number; limit: number }
): Promise<TicketEventPage> {
  // One extra row tells us whether another page exists without a COUNT query.
  const result = await pool.query<TicketEventRow>(
    `SELECT seq, event, detail, occurred_at
     FROM ticket_events
     WHERE ticket_id = $1 AND ($2::bigint IS NULL OR seq > $2)
     ORDER BY seq ASC
     LIMIT $3`,
    [ticketId, afterSeq ?? null, limit + 1]
  );
  const rows = result.rows.slice(0, limit);
  const hasMore = result.rows.length > limit;
  return {
    events: rows.map(toTicketEvent),
    nextSeq: hasMore ? Number(rows[rows.length - 1].seq) : null,
  };
}
