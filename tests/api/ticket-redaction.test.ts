/**
 * Story 6.3 — the customer routes return a public view: the customer's own ticket, the reply
 * and its category/priority, and event names. Internal AI output and event detail are only on
 * the ops routes (/api/ops/tickets/:id).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from '../helpers/request.js';
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';
import { insertTicket, updateTicketStatus, type Ticket } from '../../src/repositories/tickets.js';
import { insertEvent } from '../../src/repositories/events.js';
import { insertProcessingResult } from '../../src/repositories/processing.js';

const PROCESSING = {
  category: 'billing',
  priority: 'high',
  sentiment: 'frustrated',
  escalate: true,
  recommendedTeam: 'billing-team',
  issueSummary: 'Double charge on the March invoice',
  customerReply: 'Sorry about the double charge. We have refunded it.',
  internalNote: 'Refund issued via Stripe, check for a duplicate webhook.',
  nextSteps: ['Confirm refund', 'Audit webhooks'],
};

const REDACTED = ['internalNote', 'nextActions', 'nextSteps', 'sentiment', 'escalate', 'recommendedTeam', 'issueSummary', 'detail'];
const PRIVATE_VALUES = [PROCESSING.internalNote, PROCESSING.issueSummary, PROCESSING.recommendedTeam, 'secret provider error'];

const created: string[] = [];
let completed: Ticket;
let failed: Ticket;

beforeAll(async () => {
  completed = await insertTicket('TICK-REDACT-001', 'Double charge', 'I was charged twice for March.');
  failed = await insertTicket('TICK-REDACT-002', 'Export broken', 'The CSV export never downloads.');
  created.push(completed.id, failed.id);

  for (const ticket of [completed, failed]) await insertProcessingResult(ticket.id, PROCESSING);

  await updateTicketStatus(completed.id, 'completed');
  for (const event of ['triage.started', 'triage.completed', 'draft.started', 'draft.completed', 'ticket.completed']) {
    await insertEvent(completed.id, event, event === 'draft.completed' ? 'reused stored output' : undefined);
  }

  await updateTicketStatus(failed.id, 'failed');
  await insertEvent(failed.id, 'triage.started');
  await insertEvent(failed.id, 'triage.completed');
  await insertEvent(failed.id, 'draft.started');
  await insertEvent(failed.id, 'draft.failed', 'secret provider error');
  await insertEvent(failed.id, 'ticket.failed', 'secret provider error');
});

afterAll(async () => {
  await purgeTicketEvents(created);
  await pool.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [created]);
  await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [created]);
  await pool.end();
});

/** Every key path in a JSON value, with array items collapsed to `[]`. */
function keyPaths(value: unknown, prefix = ''): Set<string> {
  const paths = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) for (const p of keyPaths(item, `${prefix}[]`)) paths.add(p);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);
      for (const p of keyPaths(child, path)) paths.add(p);
    }
  }
  return paths;
}

const TICKET_KEYS = [
  'id',
  'referenceNumber',
  'subject',
  'description',
  'status',
  'createdAt',
  'events',
  'events[].event',
  'events[].occurredAt',
  'eventsNextCursor',
  'phases',
  'phases.triage',
  'phases.triage.status',
  'phases.draft',
  'phases.draft.status',
];

function expectNothingPrivate(body: unknown) {
  const wire = JSON.stringify(body);
  for (const key of REDACTED) expect(wire).not.toContain(`"${key}"`);
  for (const value of PRIVATE_VALUES) expect(wire).not.toContain(value);
}

describe('public ticket view', () => {
  it('returns exactly the public fields for a completed ticket, by reference and by id', async () => {
    const byRef = await request(app).get(`/api/tickets/ref/${completed.referenceNumber}`);
    const byId = await request(app).get(`/api/tickets/${completed.id}`);

    for (const res of [byRef, byId]) {
      expect(res.status).toBe(200);
      expect([...keyPaths(res.body)].sort()).toEqual(
        [
          ...TICKET_KEYS,
          'phases.triage.output',
          'phases.triage.output.category',
          'phases.triage.output.priority',
          'phases.draft.output',
          'phases.draft.output.customerReply',
        ].sort()
      );
      expect(res.body.phases).toEqual({
        triage: { status: 'completed', output: { category: 'billing', priority: 'high' } },
        draft: { status: 'completed', output: { customerReply: PROCESSING.customerReply } },
      });
      expect(res.body.description).toBe('I was charged twice for March.');
      expectNothingPrivate(res.body);
    }
  });

  it('returns exactly the public fields for a failed ticket, with no failure reason', async () => {
    const res = await request(app).get(`/api/tickets/ref/${failed.referenceNumber}`);

    expect(res.status).toBe(200);
    expect([...keyPaths(res.body)].sort()).toEqual(
      [...TICKET_KEYS, 'phases.triage.output', 'phases.triage.output.category', 'phases.triage.output.priority'].sort()
    );
    expectNothingPrivate(res.body);
  });

  it('pages events without detail', async () => {
    const res = await request(app).get(`/api/tickets/${failed.id}/events`);

    expect(res.status).toBe(200);
    expect([...keyPaths(res.body)].sort()).toEqual(['events', 'events[].event', 'events[].occurredAt', 'nextCursor']);
    expect(res.body.events.map((e: { event: string }) => e.event)).toContain('ticket.failed');
    expectNothingPrivate(res.body);
  });
});

describe('ops ticket view', () => {
  it('returns every stage output and the event detail', async () => {
    const res = await request(app).get(`/api/ops/tickets/${completed.id}`);

    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: {
        status: 'completed',
        output: {
          category: 'billing',
          priority: 'high',
          sentiment: 'frustrated',
          escalate: true,
          recommendedTeam: 'billing-team',
          issueSummary: PROCESSING.issueSummary,
        },
      },
      draft: {
        status: 'completed',
        output: {
          customerReply: PROCESSING.customerReply,
          internalNote: PROCESSING.internalNote,
          nextActions: PROCESSING.nextSteps,
        },
      },
    });
    expect(res.body.events).toContainEqual({
      event: 'draft.completed',
      detail: 'reused stored output',
      occurredAt: expect.any(String),
    });
  });

  it('pages events with detail', async () => {
    const res = await request(app).get(`/api/ops/tickets/${failed.id}/events`).query({ limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
    expect(typeof res.body.nextCursor).toBe('string');

    const rest = await request(app).get(`/api/ops/tickets/${failed.id}/events`).query({ after: res.body.nextCursor });
    expect(rest.body.events).toContainEqual({
      event: 'ticket.failed',
      detail: 'secret provider error',
      occurredAt: expect.any(String),
    });
  });

  it('returns 404 for an unknown ticket and 400 for a bad cursor', async () => {
    const missing = await request(app).get('/api/ops/tickets/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);

    const badCursor = await request(app).get(`/api/ops/tickets/${failed.id}/events`).query({ after: 'nope' });
    expect(badCursor.status).toBe(400);
  });
});
