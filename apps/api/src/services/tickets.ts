import { generateReferenceNumber } from '../lib/reference.js';
import {
  insertTicket,
  listTickets,
  getTicketById,
  requeueTicket,
  restoreTicketAfterFailedRequeue,
  type Ticket,
  type ReplayableStatus,
} from '../repositories/tickets.js';
import { enqueueTicket } from '../lib/queue.js';
import { recordTicketEvent } from './ticket-events.js';
import { emitTicketUpdate } from './ticket-updates.js';
import { publishTicketRequeued } from './ops-feed.js';
import { logger } from '../lib/logger.js';

export { listTickets };
export async function createTicket(subject: string, description: string): Promise<Ticket> {
  const referenceNumber = generateReferenceNumber();
  const ticket = await insertTicket(referenceNumber, subject, description);
  recordTicketEvent(ticket, 'ticket.submitted', ticket.referenceNumber).catch(err =>
    logger.error({ err, ticketId: ticket.id }, 'Failed to write ticket.submitted event')
  );
  enqueueTicket(ticket.id, ticket.referenceNumber).catch(err =>
    logger.error({ err, ticketId: ticket.id }, 'Failed to enqueue ticket')
  );
  return ticket;
}

export type ReplayResult =
  | { ok: true; ticket: Ticket; previousStatus: ReplayableStatus }
  | { ok: false; reason: 'not_replayable'; status: string }
  | { ok: false; reason: 'enqueue_failed' };

/**
 * Ops recovery (story 5.4): sends a `failed` or `needs_attention` ticket back through
 * processing as a new attempt. The customer does nothing; their open page is told.
 *
 * `ticket.requeued` must be recorded BEFORE the message is sent: the worker derives fresh
 * attempt counts and which stages to re-run from it, and could otherwise pick the message
 * up first and fail the ticket again at once. If recording or sending fails, the ticket is
 * put back exactly as it was and `ticket.requeue_failed` undoes the reset in its history,
 * so it never sits in `queued` with no message behind it.
 *
 * Throws TicketNotFoundError for an unknown id.
 */
export async function replayTicket(id: string): Promise<ReplayResult> {
  const ticket = await getTicketById(id);

  const prev = await requeueTicket(id);
  if (!prev) {
    // Not replayable, or another replay won the race. Re-read so the caller sees the real status.
    const current = await getTicketById(id);
    return { ok: false, reason: 'not_replayable', status: current.status };
  }

  try {
    await recordTicketEvent(ticket, 'ticket.requeued', prev.status);
    await enqueueTicket(ticket.id, ticket.referenceNumber);
  } catch (err) {
    logger.error({ err, ticketId: id }, 'Replay failed; restoring the ticket');
    await restoreTicketAfterFailedRequeue(id, prev);
    await recordTicketEvent(ticket, 'ticket.requeue_failed', (err as Error).message).catch(recordErr =>
      logger.error({ err: recordErr, ticketId: id }, 'Failed to write ticket.requeue_failed event')
    );
    return { ok: false, reason: 'enqueue_failed' };
  }

  emitTicketUpdate(ticket.id, 'ticket.requeued');
  publishTicketRequeued(ticket, prev.status);
  return { ok: true, ticket, previousStatus: prev.status };
}
