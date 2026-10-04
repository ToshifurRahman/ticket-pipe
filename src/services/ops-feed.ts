import { getEmitter } from '../lib/socket.js';
import { OPS_ROOM } from '../lib/rooms.js';
import { logger } from '../lib/logger.js';

// THE privacy boundary for the organization-wide ops feed (story 4.5).
//
// This is the only module allowed to publish to the ops room. Everything it sends is
// visible to every ops subscriber, so payloads hold identifiers, codes and timestamps
// only. Never add a subject, description, AI output, or any free text (including error
// messages, which can quote model output or customer content). Anything customer-specific
// belongs on the ticket's own room, which only that customer joins.

export interface TicketRef {
  id: string;
  referenceNumber: string;
}

export interface OpsTicketEvent {
  ticketId: string;
  referenceNumber: string;
  event: string;
  occurredAt: Date;
}

// A closed set rather than a string: the only way to say why a ticket needs attention is
// to pick one of these, so a raw error message can't be passed through by accident.
export type NeedsAttentionReason = 'incomplete_output' | 'processing_result_missing';

// Why processing gave up on a ticket for good (status `failed`). Also the closed set the
// `tickets.failure_reason` column accepts (migration 007).
export type FailureReason =
  | 'triage_retries_exhausted'
  | 'draft_retries_exhausted'
  | 'finalize_failed'
  | 'processing_error';

export interface OpsTicketFailed {
  ticketId: string;
  referenceNumber: string;
  reason: FailureReason;
  occurredAt: Date;
}

export interface OpsNeedsAttention {
  ticketId: string;
  referenceNumber: string;
  reason: NeedsAttentionReason;
  occurredAt: Date;
}

// Publishing must never affect ticket processing: a synchronous throw is logged here, and
// async publish failures are contained inside getEmitter() (see src/lib/socket.ts).
function publish(name: string, payload: OpsTicketEvent | OpsNeedsAttention | OpsTicketFailed): void {
  try {
    getEmitter().to(OPS_ROOM).emit(name, payload);
  } catch (err) {
    logger.error({ err, ticketId: payload.ticketId }, `Failed to emit ${name}`);
  }
}

export function publishTicketEvent(ticket: TicketRef, event: string): void {
  publish('ops:ticket_event', {
    ticketId: ticket.id,
    referenceNumber: ticket.referenceNumber,
    event,
    occurredAt: new Date(),
  });
}

export function publishNeedsAttention(ticket: TicketRef, reason: NeedsAttentionReason): void {
  publish('ticket:needs_attention', {
    ticketId: ticket.id,
    referenceNumber: ticket.referenceNumber,
    reason,
    occurredAt: new Date(),
  });
}

export function publishTicketFailed(ticket: TicketRef, reason: FailureReason): void {
  publish('ticket:failed', {
    ticketId: ticket.id,
    referenceNumber: ticket.referenceNumber,
    reason,
    occurredAt: new Date(),
  });
}
