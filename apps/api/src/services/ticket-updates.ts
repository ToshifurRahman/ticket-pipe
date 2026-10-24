import { getEmitter } from '../lib/socket.js';
import { logger } from '../lib/logger.js';

// Live updates for one ticket's own room, which only that ticket's customer joins.
// The ops-room counterpart is src/services/ops-feed.ts.
//
// Notification delivery must never affect ticket processing or a replay: a synchronous
// throw from the emitter is logged here, and async publish failures are contained inside
// getEmitter() (see src/lib/socket.ts).
export function emitTicketUpdate(ticketId: string, event: string): void {
  try {
    getEmitter().to(ticketId).emit('ticket:update', { event, ticketId, occurredAt: new Date() });
  } catch (err) {
    logger.error({ err, ticketId }, 'Failed to emit ticket:update');
  }
}
