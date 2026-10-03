import { generateReferenceNumber } from '../lib/reference.js';
import { insertTicket, listTickets, type Ticket } from '../repositories/tickets.js';
import { enqueueTicket } from '../lib/queue.js';
import { recordTicketEvent } from './ticket-events.js';
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
