/**
 * Story 4.4 — Organization-Wide Monitoring for Ops.
 *
 * Like tests/notifications.disconnect.test.ts, this deliberately does NOT mock
 * `src/lib/socket.js` or `redis`: worker emitter → Redis → Socket.IO adapter → client
 * socket is the path under test.
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

import { app } from '../src/index.js';
import { pool } from '../src/lib/db.js';
import { purgeTicketEvents } from './helpers/purge-ticket-events.js';
import { init as initSocket, shutdown as shutdownSocket, getIo } from '../src/lib/socket.js';
import { insertTicket } from '../src/repositories/tickets.js';
import { getAllEventsByTicketId, insertEvent } from '../src/repositories/events.js';
import { processMessage } from '../src/worker.js';

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

interface OpsEvent {
  ticketId: string;
  referenceNumber: string;
  event: string;
  occurredAt: string;
}

let httpServer: HttpServer;
let url: string;
const openClients: Socket[] = [];
const createdIds: string[] = [];
let refCounter = 0;

beforeAll(async () => {
  httpServer = createServer(app);
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

async function newTicket() {
  const ticket = await insertTicket(`TICK-OPSF-${++refCounter}`, 'Login broken', 'Cannot sign in');
  createdIds.push(ticket.id);
  return ticket;
}

async function connect(): Promise<Socket> {
  const client = ioClient(url, { transports: ['websocket'], reconnection: false });
  openClients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('connect_error', reject);
  });
  return client;
}

async function subscribeToOps(client: Socket): Promise<OpsEvent[]> {
  const received: OpsEvent[] = [];
  client.on('ops:ticket_event', (payload: OpsEvent) => received.push(payload));
  const ack = await client.timeout(5000).emitWithAck('ops:subscribe');
  expect(ack).toEqual({ ok: true });
  return received;
}

/**
 * The feed is organization-wide, and the other test files share this Redis, so a
 * subscribed client also hears about tickets this test never created. Assert on its own.
 */
function eventsFor(received: OpsEvent[], ticketId: string): OpsEvent[] {
  return received.filter((e) => e.ticketId === ticketId);
}

// Rooms are inspected with `.local`: the Redis adapter's cluster-wide fetchSockets() waits on
// every Socket.IO server sharing this Redis (other test files start their own, in parallel)
// and times out when one shuts down mid-request.
async function opsRoomSize(): Promise<number> {
  return (await getIo()!.local.in('ops').fetchSockets()).length;
}

async function waitFor(check: () => boolean | Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---- Tests ------------------------------------------------------------

describe('ops organization feed', () => {
  it('delivers every ticket event over real Redis to a subscribed ops client, status only', async () => {
    const ticket = await newTicket();
    const ops = await connect();
    const received = await subscribeToOps(ops);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const rows = await getAllEventsByTicketId(ticket.id);
    await waitFor(
      () => eventsFor(received, ticket.id).length === rows.length,
      `ops client got ${eventsFor(received, ticket.id).length} of ${rows.length} events`
    );

    const mine = eventsFor(received, ticket.id);
    expect(mine.map((e) => e.event)).toEqual(rows.map((r) => r.event));
    for (const e of mine) {
      expect(Object.keys(e).sort()).toEqual(['event', 'occurredAt', 'referenceNumber', 'ticketId']);
      expect(e.ticketId).toBe(ticket.id);
      expect(e.referenceNumber).toBe(ticket.referenceNumber);
    }

    const wire = JSON.stringify(mine);
    for (const secret of [
      ...Object.values(TRIAGE_RESULT).map(String),
      DRAFT_RESULT.customerReply,
      DRAFT_RESULT.internalNote,
      ...DRAFT_RESULT.nextSteps,
      'Login broken',
      'Cannot sign in',
    ]) {
      expect(wire).not.toContain(secret);
    }
  });

  it('does not let a customer socket read the feed by joining the "ops" room', async () => {
    const ticket = await newTicket();
    const ops = await connect();
    const received = await subscribeToOps(ops);

    const attacker = await connect();
    const attackerGot: unknown[] = [];
    attacker.on('ops:ticket_event', (p) => attackerGot.push(p));
    attacker.on('ticket:needs_attention', (p) => attackerGot.push(p));
    attacker.emit('join', 'ops');
    // Same-connection events are handled in order, so once this valid join has landed
    // the 'ops' join above has already been handled (or refused).
    const decoy = await newTicket();
    attacker.emit('join', decoy.id);
    await waitFor(
      async () => (await getIo()!.local.in(decoy.id).fetchSockets()).length === 1,
      'attacker never joined its ticket room'
    );

    expect(await opsRoomSize()).toBe(1);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());
    await waitFor(() => eventsFor(received, ticket.id).length === 5, 'ops client never received the feed');

    expect(attackerGot).toEqual([]);
  });

  it('ignores join requests that are not ticket ids', async () => {
    const client = await connect();

    client.emit('join', 'ops');
    client.emit('join', { room: 'ops' });
    client.emit('join', 42);
    client.emit('join');
    const decoy = await newTicket();
    client.emit('join', decoy.id);
    await waitFor(
      async () => (await getIo()!.local.in(decoy.id).fetchSockets()).length === 1,
      'client never joined its ticket room'
    );

    const server = (await getIo()!.local.fetchSockets()).find((s) => s.id === client.id)!;
    const rooms = [...server.rooms];
    expect(rooms).toContain(decoy.id);
    expect(rooms).not.toContain('ops');
    expect(await opsRoomSize()).toBe(0);
  });

  // Story 4.5: ops hears that a ticket needs attention and why, but never the error text,
  // which can quote AI output or customer content.
  it('sends ops a reason code, never the error text, when retries are exhausted', async () => {
    const SENTINEL = 'SENTINEL-4F9A';
    const ticket = await newTicket();
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');
    const ai = {
      triage: vi.fn().mockRejectedValue(new Error(`LLM output failed schema validation: received '${SENTINEL}'`)),
      draft: vi.fn(),
    } as unknown as AIService;

    const ops = await connect();
    await subscribeToOps(ops);
    const alerts: Record<string, unknown>[] = [];
    ops.on('ticket:failed', (p) => alerts.push(p));

    await processMessage(ticket.id, 'fake-receipt', 3, ai).catch(() => {});
    await waitFor(() => alerts.some((a) => a.ticketId === ticket.id), 'ops never received the alert');

    const mine = alerts.find((a) => a.ticketId === ticket.id)!;
    expect(Object.keys(mine).sort()).toEqual(['occurredAt', 'reason', 'referenceNumber', 'ticketId']);
    expect(mine.reason).toBe('triage_retries_exhausted');
    expect(JSON.stringify(mine)).not.toContain(SENTINEL);
  });

  // The other half of the story: the customer's own channel still gets the full output,
  // and ops, subscribed at the same time, gets none of it.
  it('delivers full AI output to the customer only, never to ops', async () => {
    const ticket = await newTicket();
    const ops = await connect();
    const opsGot: unknown[] = [];
    ops.onAny((_name, payload) => opsGot.push(payload));
    await subscribeToOps(ops);

    const customer = await connect();
    const completed = new Promise<Record<string, any>>((resolve) => {
      customer.on('ticket:update', (p: Record<string, any>) => {
        if (p.event === 'ticket.completed') resolve(p);
      });
    });
    customer.emit('join', ticket.id);
    await waitFor(
      async () => (await getIo()!.local.in(ticket.id).fetchSockets()).length === 1,
      'customer never joined its ticket room'
    );

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());
    const payload = await completed;
    expect(payload.draft.customerReply).toBe(DRAFT_RESULT.customerReply);
    expect(payload.triage.issueSummary).toBe(TRIAGE_RESULT.issueSummary);

    await waitFor(
      () => opsGot.filter((p) => (p as OpsEvent).ticketId === ticket.id).length >= 5,
      'ops never received the status events'
    );
    const opsWire = JSON.stringify(opsGot.filter((p) => (p as OpsEvent).ticketId === ticket.id));
    expect(opsWire).not.toContain(DRAFT_RESULT.customerReply);
    expect(opsWire).not.toContain(TRIAGE_RESULT.issueSummary);
    expect(opsWire).not.toContain(DRAFT_RESULT.internalNote);
  });
});
