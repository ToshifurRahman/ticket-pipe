import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createTicket, listTickets, replayTicket } from '../services/tickets.js';
import { logger } from '../lib/logger.js';
import { getTicketById, getTicketByReferenceNumber, type Ticket } from '../repositories/tickets.js';
import { getProcessingResultByTicketId } from '../repositories/processing.js';
import { getAllEventsByTicketId, getEventPage, type TicketEvent } from '../repositories/events.js';
import { encodeEventCursor, decodeEventCursor } from '../lib/event-cursor.js';
import { resolveTicketPhases, type TicketPhases, type TriageOutput, type DraftOutput } from '../lib/ticket-phases.js';

const TicketSchema = z.object({
  subject: z.string({ required_error: 'Subject is required' }).trim().min(1, 'Subject is required'),
  description: z.string({ required_error: 'Description is required' }).trim().min(1, 'Description is required'),
});

const EVENTS_DEFAULT_LIMIT = 50;
const EVENTS_MAX_LIMIT = 200;

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

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = TicketSchema.safeParse(req.body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const errors = Object.fromEntries(
      Object.entries(fieldErrors).map(([k, v]) => [k, v![0]])
    );
    res.status(400).json({ errors });
    return;
  }

  try {
    const ticket = await createTicket(parsed.data.subject, parsed.data.description);
    res.status(201).json({
      ticketId: ticket.id,
      referenceNumber: ticket.referenceNumber,
      status: ticket.status,
      createdAt: ticket.createdAt,
    });
  } catch (err) {
    logger.error({ err, context: 'createTicket' }, 'Ticket creation failed');
    next(err);
  }
}

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

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params['id'] as string;
  try {
    const ticket = await getTicketById(id);
    res.json(await buildTicketResponse(ticket));
  } catch (err) {
    next(err);
  }
}

export async function getByRef(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ref = req.params['referenceNumber'] as string;
  try {
    const ticket = await getTicketByReferenceNumber(ref);
    res.json(await buildTicketResponse(ticket));
  } catch (err) {
    next(err);
  }
}

/** The ticket's full history, a page at a time, oldest first. Follow `nextCursor` until it is null. */
export async function listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params['id'] as string;
  const limit = Math.min(EVENTS_MAX_LIMIT, Math.max(1, Number(req.query.limit) || EVENTS_DEFAULT_LIMIT));

  let afterSeq: number | undefined;
  const after = req.query.after;
  if (after !== undefined) {
    const decoded = typeof after === 'string' ? decodeEventCursor(after) : null;
    if (decoded === null) {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }
    afterSeq = decoded;
  }

  try {
    await getTicketById(id);
    const page = await getEventPage(id, { afterSeq, limit });
    res.json({
      events: page.events,
      nextCursor: page.nextSeq === null ? null : encodeEventCursor(page.nextSeq),
    });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const statusParam = req.query.status as string | undefined;
  const status = statusParam ? statusParam.split(',').filter(s => s) : undefined;
  const sortParam = req.query.sort as string;
  const sort = sortParam === 'status' || sortParam === 'failedAt' ? sortParam : 'createdAt';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';

  try {
    const result = await listTickets({ page, limit, status, sort, order });
    res.json(result);
  } catch (err) {
    logger.error({ err, context: 'listTickets' }, 'List tickets failed');
    next(err);
  }
}

export async function replay(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params['id'] as string;

  try {
    const result = await replayTicket(id);

    if (result.ok) {
      res.json({ success: true, status: 'queued', previousStatus: result.previousStatus });
    } else if (result.reason === 'not_replayable') {
      res.status(409).json({
        error: 'Ticket can only be replayed if status is failed or needs_attention',
        status: result.status,
      });
    } else {
      res.status(503).json({ error: 'Could not requeue the ticket; it was left as it was. Try again.' });
    }
  } catch (err) {
    next(err);
  }
}
