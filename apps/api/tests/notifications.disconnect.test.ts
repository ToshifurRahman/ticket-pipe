/**
 * Story 4.3 — No Disruption from Disconnected Customers.
 *
 * Unlike tests/worker.test.ts, this file deliberately does NOT mock `src/lib/socket.js`
 * or `redis`: the whole point is to prove the real notification path — worker emitter →
 * Redis → Socket.IO adapter → client socket — behaves identically whether the customer
 * is connected, gone, or a zombie the server hasn't noticed is gone yet.
 *
 * Requires the docker-compose stack (Postgres, Redis, LocalStack) to be running.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'net';
import type { AIService } from '../src/lib/ai-service.js';

vi.mock('../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/queue.js')>();
  return { ...real, deleteMessage: vi.fn().mockResolvedValue(undefined) };
});

import { pool } from '../src/lib/db.js';
import { purgeTicketEvents } from './helpers/purge-ticket-events.js';
import { init as initSocket, shutdown as shutdownSocket, getIo } from '../src/lib/socket.js';
import { deleteMessage } from '../src/lib/queue.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getAllEventsByTicketId } from '../src/repositories/events.js';
import { processMessage } from '../src/worker.js';

// ---- AIService stub ---------------------------------------------------

const TRIAGE_RESULT = {
  category: 'technical',
  priority: 'high',
  sentiment: 'frustrated',
  escalate: false,
  recommendedTeam: 'tech-support',
  issueSummary: 'Customer cannot log in',
};

const DRAFT_RESULT = {
  customerReply: 'We are looking into your login issue.',
  internalNote: 'Check auth service logs.',
  nextSteps: ['Check auth logs', 'Reset session'],
};

function mockAi(): AIService {
  return {
    triage: vi.fn().mockResolvedValue(TRIAGE_RESULT),
    draft: vi.fn().mockResolvedValue(DRAFT_RESULT),
  } as unknown as AIService;
}

// ---- Harness ----------------------------------------------------------

let httpServer: HttpServer;
let url: string;
const openClients: Socket[] = [];
const createdIds: string[] = [];
let refCounter = 0;

beforeAll(async () => {
  httpServer = createServer();
  await initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of openClients.splice(0)) client.disconnect();
  if (createdIds.length) {
    await purgeTicketEvents(createdIds);
    await pool.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await shutdownSocket();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await pool.end();
});

async function newTicket(): Promise<string> {
  const ticket = await insertTicket(`TICK-DISC-${++refCounter}`, 'Login broken', 'Cannot sign in');
  createdIds.push(ticket.id);
  return ticket.id;
}

/**
 * How many sockets this test's server currently has in a ticket's room. `.local` matters:
 * without it the Redis adapter asks every Socket.IO server on this Redis, including the ones
 * other test files start in parallel, and times out if one of them shuts down mid-request.
 */
async function roomSize(ticketId: string): Promise<number> {
  const sockets = await getIo()!.local.in(ticketId).fetchSockets();
  return sockets.length;
}

/** Polls the server's own view of a room — client-side events fire too early to trust. */
async function waitForRoomSize(ticketId: string, expected: number): Promise<void> {
  const deadline = Date.now() + 5000;
  let actual = await roomSize(ticketId);
  while (actual !== expected) {
    if (Date.now() > deadline) {
      throw new Error(`room ${ticketId} held ${actual} sockets, expected ${expected}`);
    }
    await new Promise((r) => setTimeout(r, 20));
    actual = await roomSize(ticketId);
  }
}

/**
 * Connects a real client and waits until the server has actually joined it to the room.
 * `reconnection: false` matters for the abrupt-drop case — otherwise the client would
 * immediately reconnect and quietly undo the disconnect we are trying to test.
 */
async function connectAndJoin(ticketId: string): Promise<Socket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  openClients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('connect_error', reject);
  });

  // `join` is fire-and-forget with no ack, so wait on the server's own view of the
  // room rather than guessing at a delay.
  client.emit('join', ticketId);
  await waitForRoomSize(ticketId, 1);
  return client;
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

// ---- Tests ------------------------------------------------------------

describe('notification delivery vs. ticket processing', () => {
  // The control case. Without it the three cases below could all pass while
  // cross-process delivery was broken outright — nothing would be delivered to
  // anyone, and "the disconnected customer caused no problem" would be vacuous.
  it('delivers ticket.completed over real Redis to a connected client', async () => {
    const ticketId = await newTicket();
    const client = await connectAndJoin(ticketId);

    const received = new Promise<Record<string, unknown>>((resolve) => {
      client.on('ticket:update', (payload: Record<string, unknown>) => {
        if (payload.event === 'ticket.completed') resolve(payload);
      });
    });

    await processMessage(ticketId, 'fake-receipt', 1, mockAi());

    const payload = await Promise.race([
      received,
      rejectAfter(5000, 'no ticket.completed event delivered to connected client'),
    ]);

    // Only the event name reaches the customer's room: the page refetches the public view,
    // so no stage output (internal note, sentiment, …) travels over the socket.
    expect(payload).toEqual({ event: 'ticket.completed', ticketId, occurredAt: expect.any(String) });
    expect((await getTicketById(ticketId)).status).toBe('completed');
  });

  it('completes a ticket nobody is subscribed to', async () => {
    const ticketId = await newTicket();

    await expect(processMessage(ticketId, 'fake-receipt', 1, mockAi())).resolves.toBeUndefined();

    expect((await getTicketById(ticketId)).status).toBe('completed');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
  });

  it('completes a ticket after the customer cleanly disconnects', async () => {
    const ticketId = await newTicket();
    const client = await connectAndJoin(ticketId);

    client.disconnect();
    // The client's own `disconnect` event fires before the server has processed the
    // close, so wait on the server's view of the room instead.
    await waitForRoomSize(ticketId, 0);

    await expect(processMessage(ticketId, 'fake-receipt', 1, mockAi())).resolves.toBeUndefined();

    expect((await getTicketById(ticketId)).status).toBe('completed');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');

    const events = await getAllEventsByTicketId(ticketId);
    expect(events.map((e) => e.event)).toEqual([
      'triage.started',
      'triage.completed',
      'draft.started',
      'draft.completed',
      'ticket.completed',
    ]);
  });

  // The harder half: killing the transport sends no disconnect packet, so the server
  // keeps the socket in the room until pingTimeout (20s). The worker therefore emits
  // into a room that still contains a dead socket — the only case here where the room
  // is not empty. Processing must be just as unaffected.
  it('completes a ticket after the customer drops abruptly, with the socket still in the room', async () => {
    const ticketId = await newTicket();
    const client = await connectAndJoin(ticketId);

    client.io.engine.close();

    // The server got no disconnect packet, so it still believes the socket is there.
    // If this ever fails the test has stopped exercising the zombie path.
    expect(await roomSize(ticketId)).toBe(1);

    await expect(processMessage(ticketId, 'fake-receipt', 1, mockAi())).resolves.toBeUndefined();

    expect((await getTicketById(ticketId)).status).toBe('completed');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
  });
});
