/**
 * Tests processMessage when insertProcessingResult throws.
 *
 * These tests WILL FAIL against the current implementation because
 * processMessage is called directly here — the outer .catch() inside run()
 * never fires, so status stays 'processing' and 'ticket.failed' is never written.
 *
 * The fix: wrap insertProcessingResult (and the lines after it) in a try/catch
 * inside processMessage itself, so error recovery doesn't depend on the caller.
 */

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

const mockCreate = vi.hoisted(() => vi.fn());
const mockInsertProcessingResult = vi.hoisted(() => vi.fn());

vi.mock('portkey-ai', () => ({
  Portkey: class {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock('../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/queue.js')>();
  return { ...real, deleteMessage: vi.fn().mockResolvedValue(undefined) };
});

// Mock the processing repository — insertProcessingResult is controlled per-test
vi.mock('../src/repositories/processing.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/repositories/processing.js')>();
  return { ...real, insertProcessingResult: mockInsertProcessingResult };
});

import { pool } from '../src/lib/db.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getEventsByTicketId } from '../src/repositories/events.js';
import { getProcessingResultByTicketId } from '../src/repositories/processing.js';
import { processMessage } from '../src/worker.js';

const TRIAGE_ARGS = {
  category: 'technical',
  priority: 'high',
  sentiment: 'frustrated',
  escalate: false,
  recommended_team: 'tech-support',
  issue_summary: 'Customer cannot log in',
};

const DRAFT_ARGS = {
  customer_reply: 'We are looking into your login issue.',
  internal_note: 'Check auth service logs.',
  next_steps: ['Check auth logs', 'Reset session'],
};

function toolCallResponse(args: object) {
  return {
    choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify(args) } }] } }],
  };
}

const createdIds: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
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

describe('processMessage — insertProcessingResult failure', () => {
  it('sets status to failed when the DB write throws', async () => {
    mockCreate
      .mockResolvedValueOnce(toolCallResponse(TRIAGE_ARGS))
      .mockResolvedValueOnce(toolCallResponse(DRAFT_ARGS));
    mockInsertProcessingResult.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-001', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt').catch(() => {});

    // FAILS: status is 'processing' — run()'s catch never fires when
    // processMessage is called directly, so updateTicketStatus('failed') is never called
    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
  });

  it('writes ticket.failed event with the error message', async () => {
    mockCreate
      .mockResolvedValueOnce(toolCallResponse(TRIAGE_ARGS))
      .mockResolvedValueOnce(toolCallResponse(DRAFT_ARGS));
    mockInsertProcessingResult.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-002', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt').catch(() => {});

    // FAILS: ticket.failed event is never written — insertEvent('ticket.failed') lives
    // in run()'s catch handler, not inside processMessage
    const events = await getEventsByTicketId(ticket.id);
    const names = events.map(e => e.event);
    expect(names).toContain('ticket.failed');

    const failedEvent = events.find(e => e.event === 'ticket.failed');
    expect(failedEvent!.detail).toBe('DB constraint violated');
  });

  it('does not write ticket.completed when DB write fails', async () => {
    mockCreate
      .mockResolvedValueOnce(toolCallResponse(TRIAGE_ARGS))
      .mockResolvedValueOnce(toolCallResponse(DRAFT_ARGS));
    mockInsertProcessingResult.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt').catch(() => {});

    const events = await getEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).not.toContain('ticket.completed');
  });

  it('leaves no processing row in the DB', async () => {
    mockCreate
      .mockResolvedValueOnce(toolCallResponse(TRIAGE_ARGS))
      .mockResolvedValueOnce(toolCallResponse(DRAFT_ARGS));
    mockInsertProcessingResult.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt').catch(() => {});

    const processing = await getProcessingResultByTicketId(ticket.id);
    expect(processing).toBeNull();
  });
});
