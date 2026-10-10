import { zValidator } from '@hono/zod-validator';
import { createFactory } from 'hono/factory';
import { z } from 'zod';
import { createTicket, listTickets, replayTicket } from '../services/tickets.js';
import { logger } from '../lib/logger.js';
import { getTicketById, getTicketByReferenceNumber, type Ticket } from '../repositories/tickets.js';
import { getProcessingResultByTicketId } from '../repositories/processing.js';
import { getAllEventsByTicketId, getEventPage, type TicketEvent } from '../repositories/events.js';
import { encodeEventCursor, decodeEventCursor } from '../lib/event-cursor.js';
import { resolveTicketPhases, type TicketPhases, type TriageOutput, type DraftOutput } from '../lib/ticket-phases.js';

// Lengths count after trimming. web/src/lib/ticket-form.ts repeats these limits and messages
// for inline validation; keep the two in step.
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;

// Checks run in order and the handler reports the first message per field, so an empty
// value still reads "is required" rather than "needs at least N characters".
const TicketSchema = z.object({
  subject: z
    .string({ required_error: 'Subject is required' })
    .trim()
    .min(1, 'Subject is required')
    .min(SUBJECT_MIN, `Subject needs at least ${SUBJECT_MIN} characters.`)
    .max(SUBJECT_MAX, `Subject can be at most ${SUBJECT_MAX} characters.`),
  description: z
    .string({ required_error: 'Description is required' })
    .trim()
    .min(1, 'Description is required')
    .min(DESCRIPTION_MIN, `Description needs at least ${DESCRIPTION_MIN} characters.`)
    .max(DESCRIPTION_MAX, `Description can be at most ${DESCRIPTION_MAX} characters.`),
});

const EVENTS_DEFAULT_LIMIT = 50;
const EVENTS_MAX_LIMIT = 200;

const factory = createFactory();

// Query params are lenient on purpose: anything unparseable (or 0) falls back to the
// default, and out-of-range values are clamped rather than rejected.
const lenientInt = (fallback: number, max = Infinity) =>
  z.unknown().transform((v) => Math.min(max, Math.max(1, Number(v) || fallback)));
const optionalString = z.unknown().transform((v) => (typeof v === 'string' ? v : undefined));

const ListQuerySchema = z.object({
  page: lenientInt(1),
  limit: lenientInt(20, 100),
  status: optionalString,
  sort: optionalString,
  order: optionalString,
});

const EventsQuerySchema = z.object({
  limit: lenientInt(EVENTS_DEFAULT_LIMIT, EVENTS_MAX_LIMIT),
  // Kept raw: a present-but-undecodable cursor is a 400, and that is decided in the handler.
  after: z.unknown(),
});

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

export const create = factory.createHandlers(
  zValidator('json', TicketSchema, (result, c) => {
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    const errors = Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v![0]]));
    return c.json({ errors }, 400);
  }),
  async (c) => {
    const { subject, description } = c.req.valid('json');
    try {
      const ticket = await createTicket(subject, description);
      return c.json(
        {
          ticketId: ticket.id,
          referenceNumber: ticket.referenceNumber,
          status: ticket.status,
          createdAt: ticket.createdAt,
        },
        201
      );
    } catch (err) {
      logger.error({ err, context: 'createTicket' }, 'Ticket creation failed');
      throw err;
    }
  }
);

/**
 * The status lookup. `phases` comes from the ticket's full history; `events` is its first
 * page, and `eventsNextCursor` (null when there is nothing more) continues it at
 * GET /api/tickets/:id/events.
 */
async function buildTicketResponse(ticket: Ticket) {
  const [allEvents, firstPage, processing] = await Promise.all([
    getAllEventsByTicketId(ticket.id),
    getEventPage(ticket.id, { limit: EVENTS_DEFAULT_LIMIT }),
    getProcessingResultByTicketId(ticket.id),
  ]);

  return {
    id: ticket.id,
    referenceNumber: ticket.referenceNumber,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt,
    events: firstPage.events,
    eventsNextCursor: firstPage.nextSeq === null ? null : encodeEventCursor(firstPage.nextSeq),
    phases: buildTicketPhases(allEvents, processing),
  };
}

export const getById = factory.createHandlers(async (c) => {
  const ticket = await getTicketById((c.req.param('id') as string));
  return c.json(await buildTicketResponse(ticket));
});

export const getByRef = factory.createHandlers(async (c) => {
  const ticket = await getTicketByReferenceNumber((c.req.param('referenceNumber') as string));
  return c.json(await buildTicketResponse(ticket));
});

/** The ticket's full history, a page at a time, oldest first. Follow `nextCursor` until it is null. */
export const listEvents = factory.createHandlers(
  zValidator('query', EventsQuerySchema),
  async (c) => {
    const id = (c.req.param('id') as string);
    const { limit, after } = c.req.valid('query');

    let afterSeq: number | undefined;
    if (after !== undefined) {
      const decoded = typeof after === 'string' ? decodeEventCursor(after) : null;
      if (decoded === null) return c.json({ error: 'Invalid cursor' }, 400);
      afterSeq = decoded;
    }

    await getTicketById(id);
    const page = await getEventPage(id, { afterSeq, limit });
    return c.json({
      events: page.events,
      nextCursor: page.nextSeq === null ? null : encodeEventCursor(page.nextSeq),
    });
  }
);

export const list = factory.createHandlers(
  zValidator('query', ListQuerySchema),
  async (c) => {
    const { page, limit, status: statusParam, sort: sortParam, order: orderParam } = c.req.valid('query');
    const status = statusParam ? statusParam.split(',').filter((s) => s) : undefined;
    const sort = sortParam === 'status' || sortParam === 'failedAt' ? sortParam : 'createdAt';
    const order = orderParam === 'asc' ? 'asc' : 'desc';

    try {
      return c.json(await listTickets({ page, limit, status, sort, order }));
    } catch (err) {
      logger.error({ err, context: 'listTickets' }, 'List tickets failed');
      throw err;
    }
  }
);

export const replay = factory.createHandlers(async (c) => {
  const result = await replayTicket((c.req.param('id') as string));

  if (result.ok) {
    return c.json({ success: true, status: 'queued', previousStatus: result.previousStatus });
  }
  if (result.reason === 'not_replayable') {
    return c.json(
      {
        error: 'Ticket can only be replayed if status is failed or needs_attention',
        status: result.status,
      },
      409
    );
  }
  return c.json({ error: 'Could not requeue the ticket; it was left as it was. Try again.' }, 503);
});
