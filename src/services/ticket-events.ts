import { insertEvent } from '../repositories/events.js';
import { publishTicketEvent, type TicketRef } from './ops-feed.js';

export type { TicketRef };

/**
 * The one way to record a ticket event. It writes the `ticket_events` row and then tells
 * the ops feed, so every event ops can see is also in the history, and vice versa.
 * The row is written first: a failed insert rejects and nothing is published.
 *
 * `detail` is stored with the row only. The ops feed never receives it, because error
 * messages can quote AI output or customer content (see src/services/ops-feed.ts).
 */
export async function recordTicketEvent(ticket: TicketRef, event: string, detail?: string): Promise<void> {
  await insertEvent(ticket.id, event, detail);
  publishTicketEvent(ticket, event);
}
