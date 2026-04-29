import { Request, Response } from 'express';
import { z } from 'zod';
import { createTicket } from '../services/tickets.js';
import { logger } from '../lib/logger.js';
import { getTicketById } from '../repositories/tickets.js';
import { getProcessingResultByTicketId } from '../repositories/processing.js';
import { getEventsByTicketId } from '../repositories/events.js';

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
    let processing;
    if (ticket.status === 'completed') {
      const result = await getProcessingResultByTicketId(id);
      processing = result ?? undefined;
    }
    res.json({
      id: ticket.id,
      referenceNumber: ticket.referenceNumber,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      events,
      ...(processing && { processing }),
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
