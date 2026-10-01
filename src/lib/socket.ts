import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { TriageOutput, DraftOutput } from './ticket-phases.js';

let io: Server | null = null;

export function init(server: HttpServer): Server {
  io = new Server(server, { cors: { origin: '*' } });
  io.on('connection', (socket) => {
    socket.on('join', (ticketId: string) => {
      socket.join(ticketId);
    });
  });
  return io;
}

export function getIo(): Server | null {
  return io;
}

export interface TicketCompletedPayload {
  event: 'ticket.completed';
  ticketId: string;
  occurredAt: Date;
  triage: TriageOutput;
  draft: DraftOutput;
}

export function buildTicketCompletedPayload(
  ticketId: string,
  triage: TriageOutput,
  draft: DraftOutput
): TicketCompletedPayload {
  return { event: 'ticket.completed', ticketId, occurredAt: new Date(), triage, draft };
}
