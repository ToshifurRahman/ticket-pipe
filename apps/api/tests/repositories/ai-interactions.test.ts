import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { pool } from '../../src/lib/db.js';
import { insertTicket } from '../../src/repositories/tickets.js';
import {
  insertAiInteraction,
  listAiInteractions,
  summarizeAiInteractions,
  type AiInteractionRecord,
} from '../../src/repositories/ai-interactions.js';

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

async function newTicket(ref: string): Promise<string> {
  const ticket = await insertTicket(ref, 'Sub', 'Desc');
  createdIds.push(ticket.id);
  return ticket.id;
}

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

describe('insertAiInteraction / listAiInteractions', () => {
  it('lists interactions newest first', async () => {
    const ticketId = await newTicket('TICK-AI-001');
    await insertAiInteraction(record({ ticketId, durationMs: 100 }));
    await insertAiInteraction(record({ ticketId, durationMs: 200 }));

    const { interactions, total } = await listAiInteractions({ ticketId });

    expect(total).toBe(2);
    expect(interactions).toHaveLength(2);
    expect(interactions[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(interactions[1]!.createdAt.getTime());
  });

  it('filters by provider, operation, and outcome', async () => {
    const ticketId = await newTicket('TICK-AI-002');
    await insertAiInteraction(record({ ticketId, provider: 'primary', operation: 'triage', outcome: 'http_error', httpStatus: 429, errorMessage: 'rate limited' }));
    await insertAiInteraction(record({ ticketId, provider: 'backup', operation: 'triage', outcome: 'success' }));
    await insertAiInteraction(record({ ticketId, provider: 'primary', operation: 'draft', outcome: 'success' }));

    const backupOnly = await listAiInteractions({ ticketId, provider: 'backup' });
    expect(backupOnly.total).toBe(1);
    expect(backupOnly.interactions[0]!.operation).toBe('triage');

    const failuresOnly = await listAiInteractions({ ticketId, outcome: 'http_error' });
    expect(failuresOnly.total).toBe(1);
    expect(failuresOnly.interactions[0]!.httpStatus).toBe(429);
    expect(failuresOnly.interactions[0]!.errorMessage).toBe('rate limited');

    const draftOnly = await listAiInteractions({ ticketId, operation: 'draft' });
    expect(draftOnly.total).toBe(1);
  });

  it('paginates with limit and offset', async () => {
    const ticketId = await newTicket('TICK-AI-003');
    for (let i = 0; i < 3; i++) {
      await insertAiInteraction(record({ ticketId, durationMs: i }));
    }

    const page = await listAiInteractions({ ticketId, limit: 2, offset: 1 });

    expect(page.total).toBe(3);
    expect(page.interactions).toHaveLength(2);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(1);
  });

  it('persists token counts when provided and null otherwise', async () => {
    const ticketId = await newTicket('TICK-AI-004');
    await insertAiInteraction(record({ ticketId, promptTokens: 15, completionTokens: 42 }));
    await insertAiInteraction(record({ ticketId }));

    const { interactions } = await listAiInteractions({ ticketId });
    const withTokens = interactions.find(i => i.promptTokens !== null);
    const withoutTokens = interactions.find(i => i.promptTokens === null);

    expect(withTokens).toMatchObject({ promptTokens: 15, completionTokens: 42 });
    expect(withoutTokens).toMatchObject({ promptTokens: null, completionTokens: null });
  });
});

describe('summarizeAiInteractions', () => {
  it('aggregates counts, success rate, durations, and tokens per operation and provider', async () => {
    const ticketId = await newTicket('TICK-AI-SUMMARY-001');
    await insertAiInteraction(record({ ticketId, provider: 'primary', operation: 'triage', outcome: 'success', durationMs: 100, promptTokens: 10, completionTokens: 20 }));
    await insertAiInteraction(record({ ticketId, provider: 'primary', operation: 'triage', outcome: 'success', durationMs: 200, promptTokens: 5, completionTokens: 10 }));
    await insertAiInteraction(record({ ticketId, provider: 'primary', operation: 'triage', outcome: 'http_error', httpStatus: 500, durationMs: 300 }));
    await insertAiInteraction(record({ ticketId, provider: 'backup', operation: 'triage', outcome: 'success', durationMs: 50 }));

    const since = new Date(Date.now() - 60_000);
    const summary = await summarizeAiInteractions({ since });

    const primaryTriage = summary.find(s => s.provider === 'primary' && s.operation === 'triage');
    expect(primaryTriage).toBeDefined();
    expect(primaryTriage!.count).toBe(3);
    expect(primaryTriage!.successCount).toBe(2);
    expect(primaryTriage!.failureCount).toBe(1);
    expect(primaryTriage!.successRate).toBeCloseTo(2 / 3);
    expect(primaryTriage!.outcomeCounts).toEqual({ success: 2, http_error: 1 });
    expect(primaryTriage!.avgDurationMs).toBeCloseTo(200);
    expect(primaryTriage!.p50DurationMs).toBeCloseTo(200);
    expect(primaryTriage!.totalPromptTokens).toBe(15);
    expect(primaryTriage!.totalCompletionTokens).toBe(30);

    const backupTriage = summary.find(s => s.provider === 'backup' && s.operation === 'triage');
    expect(backupTriage!.count).toBe(1);
    expect(backupTriage!.successRate).toBe(1);
  });

  it('excludes interactions outside the requested window', async () => {
    const ticketId = await newTicket('TICK-AI-SUMMARY-002');
    await insertAiInteraction(record({ ticketId }));

    const since = new Date(Date.now() + 60_000); // future window, excludes everything
    const summary = await summarizeAiInteractions({ since });

    expect(summary.find(s => s.provider === 'primary')).toBeUndefined();
  });
});
