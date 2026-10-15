import { getProcessingResultByTicketId } from '../repositories/processing.js';
import { getAllEventsByTicketId, getEventPage, type TicketEvent } from '../repositories/events.js';
import { getTicketById, type Ticket } from '../repositories/tickets.js';
import { getNotificationStatus, type NotificationState } from '../repositories/notifications.js';
import { maskEmail } from '../lib/mask-email.js';
import { encodeEventCursor } from '../lib/event-cursor.js';
import {
  resolveTicketPhases,
  type PublicTicketPhases,
  type TicketPhases,
  type TriageOutput,
  type DraftOutput,
} from '../lib/ticket-phases.js';

// Two views of one ticket. The full view (ops routes) has every stage output and event
// detail. The public view (customer routes) is built from it field by field, so a field
// added to the full view later stays private until someone adds it here on purpose.

export const EVENTS_DEFAULT_LIMIT = 50;

export interface FullTicketView {
  id: string;
  referenceNumber: string;
  subject: string;
  description: string;
  status: string;
  createdAt: Date;
  /** Ops only: why a failed ticket gave up, and when. Null for every other status. */
  failureReason: string | null;
  failedAt: Date | null;
  events: TicketEvent[];
  eventsNextCursor: string | null;
  phases: TicketPhases;
  /** Ops only, and masked: the customer's email opt-in, if any. */
  notification: { state: NotificationState; maskedEmail: string | null };
}

export interface PublicTicketEvent {
  event: string;
  occurredAt: Date;
}

export interface PublicTicketView {
  id: string;
  referenceNumber: string;
  subject: string;
  description: string;
  status: string;
  createdAt: Date;
  events: PublicTicketEvent[];
  eventsNextCursor: string | null;
  phases: PublicTicketPhases;
}

export interface EventPageView<E> {
  events: E[];
  nextCursor: string | null;
}

function buildTicketPhases(
  events: TicketEvent[],
  processing: Awaited<ReturnType<typeof getProcessingResultByTicketId>>
): TicketPhases {
  const phases = resolveTicketPhases(events);

  if (!processing) return phases;

  if (phases.triage.status === 'completed') {
    const triageOutput: TriageOutput = {
      category: processing.category,
      priority: processing.priority,
      sentiment: processing.sentiment,
      escalate: processing.escalate,
      recommendedTeam: processing.recommendedTeam,
      issueSummary: processing.issueSummary,
    };
    phases.triage.output = triageOutput;
  }

  if (phases.draft.status === 'completed' && processing.customerReply != null) {
    const draftOutput: DraftOutput = {
      customerReply: processing.customerReply,
      internalNote: processing.internalNote!,
      nextActions: processing.nextSteps!,
    };
    phases.draft.output = draftOutput;
  }

  return phases;
}

/**
 * `phases` comes from the ticket's full history; `events` is its first page, and
 * `eventsNextCursor` (null when there is nothing more) continues it at the events route.
 */
export async function buildFullTicketView(ticket: Ticket): Promise<FullTicketView> {
  const [allEvents, firstPage, processing, notification] = await Promise.all([
    getAllEventsByTicketId(ticket.id),
    getEventPage(ticket.id, { limit: EVENTS_DEFAULT_LIMIT }),
    getProcessingResultByTicketId(ticket.id),
    getNotificationStatus(ticket.id),
  ]);

  return {
    id: ticket.id,
    referenceNumber: ticket.referenceNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    createdAt: ticket.createdAt,
    failureReason: ticket.failureReason,
    failedAt: ticket.failedAt,
    events: firstPage.events,
    eventsNextCursor: firstPage.nextSeq === null ? null : encodeEventCursor(firstPage.nextSeq),
    phases: buildTicketPhases(allEvents, processing),
    notification: { state: notification.state, maskedEmail: notification.email ? maskEmail(notification.email) : null },
  };
}

/** Customer-facing history leaves out notification bookkeeping; ops sees all of it. */
export const isPublicEvent = (event: { event: string }) => !event.event.startsWith('notification.');

export function toPublicEvent(event: TicketEvent): PublicTicketEvent {
  return { event: event.event, occurredAt: event.occurredAt };
}

function toPublicPhases(phases: TicketPhases): PublicTicketPhases {
  const { triage, draft } = phases;
  return {
    triage: {
      status: triage.status,
      ...(triage.output && { output: { category: triage.output.category, priority: triage.output.priority } }),
    },
    draft: {
      status: draft.status,
      ...(draft.output && { output: { customerReply: draft.output.customerReply } }),
    },
  };
}

export function toPublicTicketView(full: FullTicketView): PublicTicketView {
  return {
    id: full.id,
    referenceNumber: full.referenceNumber,
    subject: full.subject,
    description: full.description,
    status: full.status,
    createdAt: full.createdAt,
    events: full.events.filter(isPublicEvent).map(toPublicEvent),
    eventsNextCursor: full.eventsNextCursor,
    phases: toPublicPhases(full.phases),
  };
}

/** One page of a ticket's history, oldest first. Throws TicketNotFoundError for an unknown id. */
export async function getTicketEventPageView(
  id: string,
  { afterSeq, limit }: { afterSeq?: number; limit: number }
): Promise<EventPageView<TicketEvent>> {
  await getTicketById(id);
  const page = await getEventPage(id, { afterSeq, limit });
  return {
    events: page.events,
    nextCursor: page.nextSeq === null ? null : encodeEventCursor(page.nextSeq),
  };
}
