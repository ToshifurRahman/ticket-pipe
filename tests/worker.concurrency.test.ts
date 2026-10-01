import { setTimeout as sleep } from 'node:timers/promises';
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

const mockQueue = vi.hoisted(
  () =>
    [] as Array<{ ticketId: string; referenceNumber: string; receiptHandle: string; attemptNumber: number }>
);

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

vi.mock('../src/lib/ai-service.js', () => ({
  AIService: class {
    async triage() {
      await sleep(120);
      return TRIAGE_RESULT;
    }
    async draft() {
      await sleep(120);
      return DRAFT_RESULT;
    }
  },
}));

vi.mock('../src/lib/socket.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/socket.js')>();
  return { ...real, getEmitter: vi.fn(() => ({ to: () => ({ emit: () => {} }) })) };
});

vi.mock('../src/lib/queue.js', () => ({
  enqueueTicket: vi.fn(async (ticketId: string, referenceNumber: string) => {
    mockQueue.push({ ticketId, referenceNumber, receiptHandle: `receipt-${ticketId}`, attemptNumber: 1 });
  }),
  receiveMessages: vi.fn(async (options?: { maxMessages?: number }) => {
    const maxMessages = Math.max(1, Math.min(10, Math.floor(options?.maxMessages ?? 10)));
    if (mockQueue.length === 0) return [];
    return mockQueue.splice(0, maxMessages);
  }),
  deleteMessage: vi.fn(async () => undefined),
}));

import { pool } from '../src/lib/db.js';
import { enqueueTicket } from '../src/lib/queue.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getEventsByTicketId } from '../src/repositories/events.js';
import { run } from '../src/worker.js';

const createdIds: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  mockQueue.length = 0;

  if (createdIds.length) {
    await pool.query('DELETE FROM ticket_events WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('run — surge concurrency', () => {
  it('processes 20 simultaneous submissions without serial start blocking', async () => {

    const batchSize = 20;
    const now = Date.now();

    const tickets = await Promise.all(
      Array.from({ length: batchSize }, (_, i) =>
        insertTicket(`TICK-CONC-${now}-${i}`, `Subject ${i}`, `Description ${i}`)
      )
    );
    createdIds.push(...tickets.map(t => t.id));

    await Promise.all(tickets.map(ticket => enqueueTicket(ticket.id, ticket.referenceNumber)));

    await run({ concurrency: 5, stopWhenIdle: true, receiveWaitTimeSeconds: 0 });

    const ticketStates = await Promise.all(tickets.map(ticket => getTicketById(ticket.id)));
    expect(ticketStates.every(ticket => ticket.status === 'completed')).toBe(true);

    const ticketEvents = await Promise.all(tickets.map(ticket => getEventsByTicketId(ticket.id)));
    const startedAt = ticketEvents
      .map(events => events.find(event => event.event === 'triage.started')?.occurredAt)
      .filter((value): value is Date => value instanceof Date);
    const completedAt = ticketEvents
      .map(events => events.find(event => event.event === 'ticket.completed')?.occurredAt)
      .filter((value): value is Date => value instanceof Date);

    expect(startedAt).toHaveLength(batchSize);
    expect(completedAt).toHaveLength(batchSize);

    const firstCompletionMs = Math.min(...completedAt.map(date => date.getTime()));
    const startedBeforeFirstCompletion = startedAt.filter(
      date => date.getTime() <= firstCompletionMs
    ).length;

    expect(startedBeforeFirstCompletion).toBeGreaterThanOrEqual(5);
  });
});
