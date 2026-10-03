import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { createClient } from 'redis';
import type { Server as HttpServer } from 'http';
import type { TriageOutput, DraftOutput } from './ticket-phases.js';
import { logger } from './logger.js';
import { isUuid } from './ids.js';

if (!process.env.REDIS_URL) throw new Error('REDIS_URL environment variable is required');

// Only what shutdown() needs. The two createClient() call sites below infer
// incompatible node-redis generics, so tracking them structurally keeps this list
// honest without dragging those generics through the module.
interface ClosableClient {
  quit(): Promise<unknown>;
}

// The organization-wide ops feed. This deployment is a single tenant, so there is one room;
// a multi-tenant version would use `ops:<orgId>` here and at the emit site.
export const OPS_ROOM = 'ops';

let io: Server | null = null;
let emitter: Emitter | null = null;
// Settles once the emitter's Redis client has connected (or failed to). Never rejects.
let emitterReady: Promise<void> = Promise.resolve();

// Every Redis client this module opens, registered so shutdown() can close it.
let openClients: ClosableClient[] = [];

// Both the adapter (here) and the emitter (worker.ts, a separate process) rely on
// the default `socket.io` Redis key prefix to agree with each other. Don't pass a
// custom `key` to either side — it's a cross-process contract that isn't type-checked.
export async function init(server: HttpServer): Promise<Server> {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  openClients.push(pubClient, subClient);
  pubClient.on('error', (err) => logger.error({ err }, 'Redis pub client error'));
  subClient.on('error', (err) => logger.error({ err }, 'Redis sub client error'));
  await Promise.all([pubClient.connect(), subClient.connect()]);

  io = new Server(server, { cors: { origin: '*' } });
  io.adapter(createAdapter(pubClient, subClient));
  io.on('connection', (socket) => {
    // A customer joins the room of their own ticket. Only ticket ids are accepted: the
    // room name is client-controlled, so anything else (notably 'ops') would let a
    // customer read the organization feed.
    socket.on('join', (ticketId: unknown) => {
      if (!isUuid(ticketId)) {
        logger.debug({ socketId: socket.id }, 'Ignoring join for a non-ticket room');
        return;
      }
      socket.join(ticketId);
    });

    // Ops staff subscribe to the organization-wide feed (`ops:ticket_event`). The ack lets
    // the client know it is subscribed before any events are expected.
    // TODO(7.6): reject here unless the socket presents a valid ops token.
    socket.on('ops:subscribe', (ack?: (response: { ok: true }) => void) => {
      socket.join(OPS_ROOM);
      if (typeof ack === 'function') ack({ ok: true });
    });
  });
  // The API publishes `ticket.submitted` to the ops feed, so it needs a connected emitter
  // before the first request. Redis is already known to be up at this point.
  await warmEmitter();
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
    // `disableOfflineQueue` keeps a Redis outage from turning into unbounded memory
    // growth: node-redis would otherwise buffer every undelivered publish forever.
    // Failing fast is the right trade here — a notification nobody can receive is
    // meant to be dropped, and dropping it must never slow ticket processing down.
    const client = createClient({ url: process.env.REDIS_URL, disableOfflineQueue: true });
    openClients.push(client);
    client.on('error', (err) => logger.error({ err }, 'Redis emitter client error'));
    emitterReady = client
      .connect()
      .then(() => undefined)
      .catch((err) => logger.error({ err }, 'Redis emitter client failed to connect'));

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

// The emitter connects lazily and, with `disableOfflineQueue`, drops anything published
// before it is connected, so the first events after a process starts would be lost.
// Call this at startup to connect it ahead of time. It never rejects, so a worker can
// fire it without blocking ticket processing on Redis.
export function warmEmitter(): Promise<void> {
  getEmitter();
  return emitterReady;
}

let shuttingDown: Promise<void> | null = null;

// Closes the Socket.IO server and every Redis client this module owns. Safe to call
// concurrently (a second caller joins the in-flight shutdown) and safe to call when
// parts were never initialized — a worker process has no `io`, an API process may
// have no emitter. Resetting the singletons afterwards lets init() run again.
export function shutdown(): Promise<void> {
  if (!shuttingDown) {
    shuttingDown = doShutdown().finally(() => {
      shuttingDown = null;
    });
  }
  return shuttingDown;
}

async function doShutdown(): Promise<void> {
  const server = io;
  const clients = openClients;
  io = null;
  emitter = null;
  emitterReady = Promise.resolve();
  openClients = [];

  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  // allSettled: a client that never connected rejects on quit(), and that must not
  // turn a graceful shutdown into a crash.
  await Promise.allSettled(clients.map((client) => client.quit()));
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
