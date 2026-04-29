import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// vi.mock is hoisted above imports, so mockCreate must be hoisted too
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('portkey-ai', () => ({
  Portkey: class {
    chat = { completions: { create: mockCreate } };
  },
}));

// --- Queue mock: skip real SQS for deleteMessage in worker tests ---
vi.mock('../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/queue.js')>();
  return { ...real, deleteMessage: vi.fn().mockResolvedValue(undefined) };
});

import { pool } from '../src/lib/db.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getEventsByTicketId } from '../src/repositories/events.js';
import { getProcessingResultByTicketId } from '../src/repositories/processing.js';
import { processMessage } from '../src/worker.js';

// ---- Groq fixture helpers -------------------------------------------

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

function mockGroqSuccess() {
  mockCreate
    .mockResolvedValueOnce(toolCallResponse(TRIAGE_ARGS))
    .mockResolvedValueOnce(toolCallResponse(DRAFT_ARGS));
}

// ---- DB cleanup -------------------------------------------------------

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

// ---- Tests ------------------------------------------------------------

describe('processMessage — happy path', () => {
  it('sets ticket status to completed', async () => {
    mockGroqSuccess();
    const ticket = await insertTicket('TICK-WKR-001', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('completed');
  });

  it('writes triage.completed, draft.completed, ticket.completed events in order', async () => {
    mockGroqSuccess();
    const ticket = await insertTicket('TICK-WKR-002', 'Billing', 'Charged twice');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt');

    const events = await getEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual([
      'triage.completed',
      'draft.completed',
      'ticket.completed',
    ]);
    events.forEach(e => expect(e.detail).toBeNull());
  });

  it('persists all six triage fields to ticket_processing', async () => {
    mockGroqSuccess();
    const ticket = await insertTicket('TICK-WKR-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt');

    const result = await getProcessingResultByTicketId(ticket.id);
    expect(result).not.toBeNull();
    expect(result!.category).toBe(TRIAGE_ARGS.category);
    expect(result!.priority).toBe(TRIAGE_ARGS.priority);
    expect(result!.sentiment).toBe(TRIAGE_ARGS.sentiment);
    expect(result!.escalate).toBe(TRIAGE_ARGS.escalate);
    expect(result!.recommendedTeam).toBe(TRIAGE_ARGS.recommended_team);
    expect(result!.issueSummary).toBe(TRIAGE_ARGS.issue_summary);
  });

  it('persists all three draft fields to ticket_processing', async () => {
    mockGroqSuccess();
    const ticket = await insertTicket('TICK-WKR-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt');

    const result = await getProcessingResultByTicketId(ticket.id);
    expect(result!.customerReply).toBe(DRAFT_ARGS.customer_reply);
    expect(result!.internalNote).toBe(DRAFT_ARGS.internal_note);
    expect(result!.nextSteps).toEqual(DRAFT_ARGS.next_steps);
  });
});

describe('processMessage — triage failure', () => {
  it('sets status to failed when Groq triage throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Groq API unavailable'));
    const ticket = await insertTicket('TICK-WKR-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await expect(processMessage(ticket.id, 'fake-receipt')).rejects.toThrow('Groq API unavailable');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
  });

  it('writes triage.failed event with the error message', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Groq API unavailable'));
    const ticket = await insertTicket('TICK-WKR-006', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt').catch(() => {});

    const events = await getEventsByTicketId(ticket.id);
    const failure = events.find(e => e.event === 'triage.failed');
    expect(failure).toBeDefined();
    expect(failure!.detail).toBe('Groq API unavailable');
  });

  it('does not write draft or completion events on triage failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Groq timeout'));
    const ticket = await insertTicket('TICK-WKR-007', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt').catch(() => {});

    const events = await getEventsByTicketId(ticket.id);
    const eventNames = events.map(e => e.event);
    expect(eventNames).not.toContain('draft.completed');
    expect(eventNames).not.toContain('ticket.completed');
  });
});

describe('processMessage — draft failure', () => {
  it('sets status to failed when Groq draft throws', async () => {
    mockCreate
      .mockResolvedValueOnce(toolCallResponse(TRIAGE_ARGS))
      .mockRejectedValueOnce(new Error('Draft service down'));
    const ticket = await insertTicket('TICK-WKR-008', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await expect(processMessage(ticket.id, 'fake-receipt')).rejects.toThrow('Draft service down');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
  });

  it('writes triage.completed then draft.failed on draft failure', async () => {
    mockCreate
      .mockResolvedValueOnce(toolCallResponse(TRIAGE_ARGS))
      .mockRejectedValueOnce(new Error('Draft service down'));
    const ticket = await insertTicket('TICK-WKR-009', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt').catch(() => {});

    const events = await getEventsByTicketId(ticket.id);
    const names = events.map(e => e.event);
    expect(names).toContain('triage.completed');
    expect(names).toContain('draft.failed');
    expect(names).not.toContain('ticket.completed');
  });
});
