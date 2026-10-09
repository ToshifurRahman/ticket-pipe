import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from '../helpers/request.js';
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { purgeTicketEvents } from '../helpers/purge-ticket-events.js';
import { insertTicket, updateTicketStatus } from '../../src/repositories/tickets.js';
import { insertEvent } from '../../src/repositories/events.js';

const createdIds: string[] = [];
let referenceCounter = 0;

function nextReferenceNumber(): string {
  referenceCounter += 1;
  return `TICK-STAT-${Date.now()}-${String(referenceCounter).padStart(4, '0')}`;
}

interface SnapshotSeed {
  status: string;
  events: string[];
}

async function seedSnapshot({ status, events }: SnapshotSeed): Promise<string> {
  const ticket = await insertTicket(
    nextReferenceNumber(),
    'Status accuracy checkpoint',
    'Snapshot setup for ticket status phases'
  );
  createdIds.push(ticket.id);

  if (status !== 'queued') {
    await updateTicketStatus(ticket.id, status);
  }

  for (const event of events) {
    await insertEvent(ticket.id, event);
  }

  return ticket.id;
}

afterEach(async () => {
  if (!createdIds.length) return;
  await purgeTicketEvents(createdIds);
  await pool.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
  await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
  createdIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/tickets/:id phase status accuracy', () => {
  it('returns triage processing immediately after triage.started', async () => {
    const ticketId = await seedSnapshot({
      status: 'processing',
      events: ['triage.started'],
    });

    const res = await request(app).get(`/api/tickets/${ticketId}`);

    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: { status: 'processing' },
      draft: { status: 'pending' },
    });
  });

  it('returns triage completed and draft pending after triage.completed', async () => {
    const ticketId = await seedSnapshot({
      status: 'processing',
      events: ['triage.started', 'triage.completed'],
    });

    const res = await request(app).get(`/api/tickets/${ticketId}`);

    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'pending' },
    });
  });

  it('returns draft processing once draft.started is emitted', async () => {
    const ticketId = await seedSnapshot({
      status: 'processing',
      events: ['triage.started', 'triage.completed', 'draft.started'],
    });

    const res = await request(app).get(`/api/tickets/${ticketId}`);

    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'processing' },
    });
  });

  it('returns triage failed and draft pending for triage.failed path', async () => {
    const ticketId = await seedSnapshot({
      status: 'failed',
      events: ['triage.started', 'triage.failed', 'ticket.failed'],
    });

    const res = await request(app).get(`/api/tickets/${ticketId}`);

    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: { status: 'failed' },
      draft: { status: 'pending' },
    });
  });

  it('returns draft failed for draft.failed path without stale processing state', async () => {
    const ticketId = await seedSnapshot({
      status: 'failed',
      events: ['triage.started', 'triage.completed', 'draft.started', 'draft.failed', 'ticket.failed'],
    });

    const res = await request(app).get(`/api/tickets/${ticketId}`);

    expect(res.status).toBe(200);
    expect(res.body.phases).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'failed' },
    });
    expect(res.body.phases.draft.status).not.toBe('processing');
  });
});
