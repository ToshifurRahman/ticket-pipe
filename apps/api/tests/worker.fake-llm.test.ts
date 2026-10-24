import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

vi.mock('../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/queue.js')>();
  return {
    ...real,
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    enqueueTicket: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../src/lib/socket.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/socket.js')>();
  return { ...real, getEmitter: vi.fn(() => ({ to: () => ({ emit: vi.fn() }) })) };
});

import { pool } from '../src/lib/db.js';
import { purgeTicketEvents } from './helpers/purge-ticket-events.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getAllEventsByTicketId } from '../src/repositories/events.js';
import { AIService } from '../src/lib/ai-service.js';
import { processMessage } from '../src/worker.js';

const createdIds: string[] = [];
const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubEnv('LLM_MODE', 'fake');
  vi.stubEnv('LLM_FAKE_DELAY_MS', '0');
  vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockClear();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (createdIds.length) {
    await purgeTicketEvents(createdIds);
    await pool.query('DELETE FROM ai_interactions WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('LLM_MODE=fake through the worker', () => {
  it('completes a ticket without any provider call and records model "fake"', async () => {
    const ticket = await insertTicket('TICK-FAKE-001', 'Cannot log in', 'I cannot sign in to my account at all');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, new AIService());

    expect((await getTicketById(ticket.id))?.status).toBe('completed');
    expect(fetchSpy).not.toHaveBeenCalled();
    const { rows } = await pool.query('SELECT operation, model, outcome FROM ai_interactions WHERE ticket_id = $1', [ticket.id]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.model === 'fake' && r.outcome === 'success')).toBe(true);
  });

  it('[fake:invalid-triage] takes the needs_attention path', async () => {
    const ticket = await insertTicket('TICK-FAKE-002', 'Odd one', 'Please break triage [fake:invalid-triage]');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, new AIService());

    expect((await getTicketById(ticket.id))?.status).toBe('needs_attention');
    const events = (await getAllEventsByTicketId(ticket.id)).map((e) => e.event);
    expect(events).toContain('triage.invalid');
    expect(events).not.toContain('draft.started');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('[fake:invalid-draft] fails only the draft stage', async () => {
    const ticket = await insertTicket('TICK-FAKE-003', 'Odd two', 'Please break the draft [fake:invalid-draft]');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, new AIService());

    expect((await getTicketById(ticket.id))?.status).toBe('needs_attention');
    const events = (await getAllEventsByTicketId(ticket.id)).map((e) => e.event);
    expect(events).toContain('triage.completed');
    expect(events).toContain('draft.invalid');
  });
});
