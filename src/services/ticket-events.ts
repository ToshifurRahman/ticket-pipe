import { insertEvent } from '../repositories/events.js';
import { getEmitter, OPS_ROOM } from '../lib/socket.js';
import { logger } from '../lib/logger.js';

export interface TicketRef {
  id: string;
  referenceNumber: string;
}

// Status information only. Never add the subject, description, AI output or an event's
// free-text `detail`: the ops feed must not expose customer-facing content (story 4.4).
export interface OpsTicketEvent {
  ticketId: string;
  referenceNumber: string;
  event: string;
  occurredAt: Date;
}

// Like the worker's per-ticket emits, publishing must never affect ticket processing:
// a synchronous throw is logged here, and async publish failures are contained inside
// getEmitter().
function emitOpsEvent(ticket: TicketRef, event: string): void {
  const payload: OpsTicketEvent = {
    ticketId: ticket.id,
    referenceNumber: ticket.referenceNumber,
    event,
    occurredAt: new Date(),
  };
  try {
    getEmitter().to(OPS_ROOM).emit('ops:ticket_event', payload);
  } catch (err) {
    logger.error({ err, ticketId: ticket.id }, 'Failed to emit ops:ticket_event');
  }
}

/**
 * The one way to record a ticket event. It writes the `ticket_events` row and then tells
 * the ops feed, so every event ops can see is also in the history, and vice versa.
 * The row is written first: a failed insert rejects and nothing is published.
 */
export async function recordTicketEvent(ticket: TicketRef, event: string, detail?: string): Promise<void> {
  await insertEvent(ticket.id, event, detail);
  emitOpsEvent(ticket, event);
}
