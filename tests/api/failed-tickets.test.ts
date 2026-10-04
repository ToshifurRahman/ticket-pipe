import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';
import { pool } from '../../src/lib/db.js';
import { insertTicket, markTicketFailed } from '../../src/repositories/tickets.js';
import { getEventsByTicketId } from '../../src/repositories/events.js';

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await pool.query('DELETE FROM ticket_events WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('failed tickets in the API (story 5.2)', () => {
  it('lists a failed ticket with its reason and time, distinct from in-progress tickets', async () => {
    const failed = await insertTicket('TICK-API-FAIL-1', 'Sub', 'Desc');
    const waiting = await insertTicket('TICK-API-FAIL-2', 'Sub', 'Desc');
    createdIds.push(failed.id, waiting.id);
    await markTicketFailed(failed.id, 'triage_retries_exhausted');

    const res = await request(app).get('/api/tickets?status=failed&sort=failedAt&order=asc&limit=100');

    expect(res.status).toBe(200);
    const ids = res.body.tickets.map((t: { id: string }) => t.id);
    expect(ids).toContain(failed.id);
    expect(ids).not.toContain(waiting.id);
    const row = res.body.tickets.find((t: { id: string }) => t.id === failed.id);
    expect(row.status).toBe('failed');
    expect(row.failureReason).toBe('triage_retries_exhausted');
    expect(row.failedAt).toBeTruthy();
  });

  it('shows no failure data on tickets that have not failed', async () => {
    const t = await insertTicket('TICK-API-FAIL-3', 'Sub', 'Desc');
    createdIds.push(t.id);

    const res = await request(app).get('/api/tickets?limit=100');

    const row = res.body.tickets.find((x: { id: string }) => x.id === t.id);
    expect(row.failureReason).toBeNull();
    expect(row.failedAt).toBeNull();
  });

  it('replays a failed ticket: requeues it, clears the failure data, and records ticket.requeued', async () => {
    const t = await insertTicket('TICK-API-FAIL-4', 'Sub', 'Desc');
    createdIds.push(t.id);
    await markTicketFailed(t.id, 'draft_retries_exhausted');

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(200);
    const row = (await request(app).get('/api/tickets?limit=100')).body.tickets.find(
      (x: { id: string }) => x.id === t.id
    );
    expect(row.status).toBe('queued');
    expect(row.failureReason).toBeNull();
    expect((await getEventsByTicketId(t.id)).map(e => e.event)).toContain('ticket.requeued');
  });

  it('refuses to replay a ticket that has not failed', async () => {
    const t = await insertTicket('TICK-API-FAIL-5', 'Sub', 'Desc');
    createdIds.push(t.id);

    const res = await request(app).post(`/api/tickets/${t.id}/replay`);

    expect(res.status).toBe(400);
  });
});
