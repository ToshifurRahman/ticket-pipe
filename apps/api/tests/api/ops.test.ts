import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from '../helpers/ops-session.js';
import { app } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { insertTicket } from '../../src/repositories/tickets.js';
import { insertAiInteraction, type AiInteractionRecord } from '../../src/repositories/ai-interactions.js';

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await pool.query('DELETE FROM ai_interactions WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

function record(overrides: Partial<AiInteractionRecord> & { ticketId: string }): AiInteractionRecord {
  return {
    operation: 'triage',
    provider: 'primary',
    model: 'test-model',
    outcome: 'success',
    durationMs: 100,
    ...overrides,
  };
}

describe('GET /api/ops/ai-interactions', () => {
  it('returns a paginated list shape', async () => {
    const ticket = await insertTicket('TICK-OPS-001', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await insertAiInteraction(record({ ticketId: ticket.id }));

    const res = await request(app).get('/api/ops/ai-interactions').query({ ticketId: ticket.id });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.interactions).toHaveLength(1);
    expect(res.body.interactions[0]).toMatchObject({ ticketId: ticket.id, provider: 'primary', outcome: 'success' });
  });

  it('returns 400 for an invalid outcome filter', async () => {
    const res = await request(app).get('/api/ops/ai-interactions').query({ outcome: 'not-a-real-outcome' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid query parameters' });
  });

  it('returns 400 for a malformed ticketId', async () => {
    const res = await request(app).get('/api/ops/ai-interactions').query({ ticketId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/ops/ai-interactions/summary', () => {
  it('returns a summary shape with the default 24h window', async () => {
    const ticket = await insertTicket('TICK-OPS-002', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await insertAiInteraction(record({ ticketId: ticket.id }));

    const res = await request(app).get('/api/ops/ai-interactions/summary');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('since');
    expect(res.body).toHaveProperty('until');
    // This test's own ticket was created inside the window.
    expect(res.body.ticketsInWindow).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.summary)).toBe(true);
    const primaryTriage = res.body.summary.find(
      (s: { provider: string; operation: string }) => s.provider === 'primary' && s.operation === 'triage'
    );
    expect(primaryTriage).toMatchObject({ count: 1, successCount: 1, successRate: 1 });
  });

  it('returns 400 for a malformed since date', async () => {
    const res = await request(app).get('/api/ops/ai-interactions/summary').query({ since: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});
