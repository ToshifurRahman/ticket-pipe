import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { createClient } from 'redis';
import type { Server as HttpServer } from 'http';
import type { TriageOutput, DraftOutput } from './ticket-phases.js';
import { logger } from './logger.js';

if (!process.env.REDIS_URL) throw new Error('REDIS_URL environment variable is required');

let io: Server | null = null;
let emitter: Emitter | null = null;

// Both the adapter (here) and the emitter (worker.ts, a separate process) rely on
// the default `socket.io` Redis key prefix to agree with each other. Don't pass a
// custom `key` to either side — it's a cross-process contract that isn't type-checked.
export async function init(server: HttpServer): Promise<Server> {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err) => logger.error({ err }, 'Redis pub client error'));
  subClient.on('error', (err) => logger.error({ err }, 'Redis sub client error'));
  await Promise.all([pubClient.connect(), subClient.connect()]);

  io = new Server(server, { cors: { origin: '*' } });
  io.adapter(createAdapter(pubClient, subClient));
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

// Used by worker.ts, which runs as a separate OS process with no Socket.IO `Server`
// of its own. Publishing into the same Redis channels the adapter above subscribes to
// is how a cross-process `.to(room).emit(...)` call reaches sockets connected to the
// API process.
export function getEmitter(): Emitter {
  if (!emitter) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => logger.error({ err }, 'Redis emitter client error'));
    client.connect().catch((err) => logger.error({ err }, 'Redis emitter client failed to connect'));

    // Emitter.emit()/`.to().emit()` are synchronous and never throw, but internally they
    // call `redisClient.publish(...)` without awaiting it — an unawaited rejected publish
    // (e.g. a dropped connection) would otherwise surface as an unhandled rejection and
    // crash the worker process. Patch publish so a delivery failure can only ever be logged.
    const originalPublish = client.publish.bind(client);
    (client as unknown as { publish: typeof originalPublish }).publish = (
      ...args: Parameters<typeof originalPublish>
    ) =>
      originalPublish(...args).catch((err: Error) => {
        logger.error({ err }, 'Redis publish failed; notification not delivered');
        return 0;
      });

    emitter = new Emitter(client);
  }
  return emitter;
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
