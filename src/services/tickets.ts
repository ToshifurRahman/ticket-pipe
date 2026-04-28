import { generateReferenceNumber } from '../lib/reference.js';
import { insertTicket, type Ticket } from '../repositories/tickets.js';
import { enqueueTicket } from '../lib/queue.js';
import { logger } from '../lib/logger.js';

export async function createTicket(subject: string, description: string): Promise<Ticket> {
  const referenceNumber = generateReferenceNumber();
  const ticket = await insertTicket(referenceNumber, subject, description);
  enqueueTicket(ticket.id, ticket.referenceNumber).catch(err =>
    logger.error({ err, ticketId: ticket.id }, 'Failed to enqueue ticket')
  );
  return ticket;
}
