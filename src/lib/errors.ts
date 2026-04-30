export class TicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Ticket not found: ${id}`);
    this.name = 'TicketNotFoundError';
  }
}
