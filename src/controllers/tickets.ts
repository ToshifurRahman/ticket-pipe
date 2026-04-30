import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createTicket, listTickets } from '../services/tickets.js';
import { logger } from '../lib/logger.js';
import { getTicketById, requeueTicket, getTicketByReferenceNumber } from '../repositories/tickets.js';
import { getProcessingResultByTicketId } from '../repositories/processing.js';
import { getEventsByTicketId } from '../repositories/events.js';
import { enqueueTicket } from '../lib/queue.js';
import { resolveTicketPhases, type TicketPhases, type TriageOutput, type DraftOutput } from '../lib/ticket-phases.js';

const TicketSchema = z.object({
  subject: z.string({ required_error: 'Subject is required' }).trim().min(1, 'Subject is required'),
  description: z.string({ required_error: 'Description is required' }).trim().min(1, 'Description is required'),
});

function buildTicketPhases(
  events: Awaited<ReturnType<typeof getEventsByTicketId>>,
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

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params['id'] as string;
  try {
    const ticket = await getTicketById(id);
    const events = await getEventsByTicketId(id);
    const processing = await getProcessingResultByTicketId(id);
    const phases = buildTicketPhases(events, processing);

    res.json({
      id: ticket.id,
      referenceNumber: ticket.referenceNumber,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      events,
      phases,
    });
  } catch (err) {
    next(err);
  }
}

export async function getByRef(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ref = req.params['referenceNumber'] as string;
  try {
    const ticket = await getTicketByReferenceNumber(ref);
    const events = await getEventsByTicketId(ticket.id);
    const processing = await getProcessingResultByTicketId(ticket.id);
    const phases = buildTicketPhases(events, processing);

    res.json({
      id: ticket.id,
      referenceNumber: ticket.referenceNumber,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      events,
      phases,
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
  const sort = (req.query.sort as string) === 'status' ? 'status' : 'createdAt';
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
    const ticket = await getTicketById(id);

    if (ticket.status !== 'failed') {
      res.status(400).json({ error: 'Ticket can only be replayed if status is failed' });
      return;
    }

    await requeueTicket(id);
    await enqueueTicket(id, ticket.referenceNumber).catch(err =>
      logger.error({ err, ticketId: id }, 'Failed to enqueue ticket during replay')
    );

    res.json({ success: true, status: 'queued' });
  } catch (err) {
    next(err);
  }
}
