import { Request, Response } from 'express';
import { z } from 'zod';
import { createTicket, listTickets } from '../services/tickets.js';
import { logger } from '../lib/logger.js';
import { getTicketById, requeueTicket } from '../repositories/tickets.js';
import { getProcessingResultByTicketId } from '../repositories/processing.js';
import { getEventsByTicketId } from '../repositories/events.js';
import { enqueueTicket } from '../lib/queue.js';

const TicketSchema = z.object({
  subject: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = TicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body' });
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
    res.status(500).json({ error: 'Failed to create ticket' });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;
  try {
    const ticket = await getTicketById(id);
    const events = await getEventsByTicketId(id);
    const processing = await getProcessingResultByTicketId(id);
    let phases: { triage?: { status: string; output: object }; draft?: { status: string; output: object } } | undefined;

    if (processing) {
      phases = {
        triage: {
          status: 'completed',
          output: {
            category: processing.category,
            priority: processing.priority,
            sentiment: processing.sentiment,
            escalate: processing.escalate,
            recommendedTeam: processing.recommendedTeam,
            issueSummary: processing.issueSummary,
          },
        },
        draft: {
          status: 'completed',
          output: {
            customerReply: processing.customerReply,
            internalNote: processing.internalNote,
            nextActions: processing.nextSteps,
          },
        },
      };
    } else if (ticket.status === 'failed') {
      phases = {
        triage: { status: 'failed', output: {} },
        draft: { status: 'failed', output: {} },
      };
    } else if (ticket.status === 'processing') {
      phases = {
        triage: { status: 'processing', output: {} },
        draft: { status: 'pending', output: {} },
      };
    } else if (ticket.status === 'queued') {
      phases = {
        triage: { status: 'pending', output: {} },
        draft: { status: 'pending', output: {} },
      };
    }

    res.json({
      id: ticket.id,
      referenceNumber: ticket.referenceNumber,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      events,
      ...(phases && { phases }),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Ticket not found')) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    logger.error({ err, id, context: 'getTicketById' }, 'Ticket fetch failed');
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
}

export async function list(req: Request, res: Response): Promise<void> {
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
    res.status(500).json({ error: 'Failed to list tickets' });
  }
}

export async function replay(req: Request, res: Response): Promise<void> {
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
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Ticket not found')) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    logger.error({ err, id, context: 'replay' }, 'Ticket replay failed');
    res.status(500).json({ error: 'Failed to replay ticket' });
  }
}
