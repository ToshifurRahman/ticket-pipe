import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type { AIService } from '../src/lib/ai-service.js';

const mockEmit = vi.hoisted(() => vi.fn());
// Everything sent to the ops room gets its own spy, whatever the event name, so the
// per-ticket assertions keep seeing only ticket-room traffic, and the ops assertions
// see everything an ops client could receive.
const mockOpsEmit = vi.hoisted(() => vi.fn());
const mockTo = vi.hoisted(() =>
  vi.fn((room: string) => ({
    emit: (event: string, payload: unknown) =>
      room === 'ops' ? mockOpsEmit(event, payload) : mockEmit(event, payload),
  }))
);

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
  return { ...real, getEmitter: vi.fn(() => ({ to: mockTo })) };
});

import { pool } from '../src/lib/db.js';
import { purgeTicketEvents } from './helpers/purge-ticket-events.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getAllEventsByTicketId, insertEvent } from '../src/repositories/events.js';
import { getProcessingResultByTicketId, upsertTriageOutput, completeDraftOutput } from '../src/repositories/processing.js';
import { deleteMessage } from '../src/lib/queue.js';
import { processMessage } from '../src/worker.js';
import { replayTicket } from '../src/services/tickets.js';

// ---- AIService mock helpers -------------------------------------------

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

const TRIAGE_RESULT = {
  category: TRIAGE_ARGS.category,
  priority: TRIAGE_ARGS.priority,
  sentiment: TRIAGE_ARGS.sentiment,
  escalate: TRIAGE_ARGS.escalate,
  recommendedTeam: TRIAGE_ARGS.recommended_team,
  issueSummary: TRIAGE_ARGS.issue_summary,
};

const DRAFT_RESULT = {
  customerReply: DRAFT_ARGS.customer_reply,
  internalNote: DRAFT_ARGS.internal_note,
  nextSteps: DRAFT_ARGS.next_steps,
};

const mockTriage = vi.fn();
const mockDraft = vi.fn();

function mockAi(): AIService {
  return { triage: mockTriage, draft: mockDraft } as unknown as AIService;
}

function mockAiSuccess(): void {
  mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
  mockDraft.mockResolvedValueOnce(DRAFT_RESULT);
}

// ---- DB cleanup -------------------------------------------------------

const createdIds: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  if (createdIds.length) {
    await purgeTicketEvents(createdIds);
    await pool.query('DELETE FROM ticket_processing WHERE ticket_id = ANY($1::uuid[])', [createdIds]);
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
    createdIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

// ---- Tests ------------------------------------------------------------

describe('processMessage — ops feed (story 4.4)', () => {
  const opsEvents = () =>
    mockOpsEmit.mock.calls
      .filter(([name]) => name === 'ops:ticket_event')
      .map(([, payload]) => payload as Record<string, unknown>);

  // clearAllMocks() keeps implementations, so undo the throwing spy from the last test.
  afterEach(() => mockOpsEmit.mockReset());

  it('publishes one ops:ticket_event per ticket_events row, in order', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-OPS-FEED-001', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const rows = await getAllEventsByTicketId(ticket.id);
    expect(mockTo).toHaveBeenCalledWith('ops');
    expect(opsEvents().map((p) => p.event)).toEqual(rows.map((r) => r.event));
    expect(opsEvents().map((p) => p.event)).toEqual([
      'triage.started',
      'triage.completed',
      'draft.started',
      'draft.completed',
      'ticket.completed',
    ]);
  });

  it('carries status information only: exact keys, no AI output', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-OPS-FEED-002', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(opsEvents().length).toBeGreaterThan(0);
    for (const payload of opsEvents()) {
      expect(Object.keys(payload).sort()).toEqual(['event', 'occurredAt', 'referenceNumber', 'ticketId']);
      expect(payload.ticketId).toBe(ticket.id);
      expect(payload.referenceNumber).toBe('TICK-OPS-FEED-002');
    }
    const wire = JSON.stringify(opsEvents());
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

  it('publishes failure events without leaking the error message', async () => {
    const ticket = await insertTicket('TICK-OPS-FEED-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    mockTriage.mockRejectedValueOnce(new Error('provider said: SECRET-ERROR-TEXT'));

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    expect(opsEvents().map((p) => p.event)).toEqual(['triage.started', 'triage.failed']);
    expect(JSON.stringify(opsEvents())).not.toContain('SECRET-ERROR-TEXT');
  });

  it('publishes ticket.failed to the feed when retries are exhausted', async () => {
    const ticket = await insertTicket('TICK-OPS-FEED-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');
    mockTriage.mockRejectedValueOnce(new Error('Final error'));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    expect(opsEvents().map((p) => p.event)).toEqual([
      'triage.started',
      'triage.failed',
      'ticket.failed',
    ]);
  });

  it('keeps processing when the ops feed cannot be published to', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-OPS-FEED-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    mockOpsEmit.mockImplementation(() => {
      throw new Error('redis is down');
    });

    await expect(processMessage(ticket.id, 'fake-receipt', 1, mockAi())).resolves.toBeUndefined();

    expect((await getTicketById(ticket.id)).status).toBe('completed');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
  });
});

describe('processMessage — ops feed privacy (story 4.5)', () => {
  // A string that must never reach the ops room, planted everywhere customer or AI
  // content can live: the ticket, the AI output, and the error messages.
  const SENTINEL = 'SENTINEL-4F9A';

  // Error text in the same shapes src/lib/llm-client.ts produces, each quoting content.
  const LEAKY_ERRORS = {
    schema: `LLM output failed schema validation: Invalid enum value, received '${SENTINEL}'`,
    json: `Failed to parse function call arguments: Unexpected token '${SENTINEL}' in JSON`,
    http: `LLM call failed: 400 {"error":"prompt was: ${SENTINEL} Cannot sign in"}`,
  };

  afterEach(() => mockOpsEmit.mockReset());

  const everythingOpsReceived = () => JSON.stringify(mockOpsEmit.mock.calls);
  const alerts = (name = 'ticket:failed') =>
    mockOpsEmit.mock.calls
      .filter(([event]) => event === name)
      .map(([, payload]) => payload as Record<string, unknown>);

  it('sends nothing containing AI output or ticket content to ops on success, but still delivers it to the ticket room', async () => {
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, issueSummary: `summary ${SENTINEL}` });
    mockDraft.mockResolvedValueOnce({ ...DRAFT_RESULT, customerReply: `reply ${SENTINEL}` });
    const ticket = await insertTicket('TICK-PRIV-001', `Subject ${SENTINEL}`, `Description ${SENTINEL}`);
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(mockOpsEmit).toHaveBeenCalled();
    expect(everythingOpsReceived()).not.toContain(SENTINEL);

    // The customer's room carries event names only; the page reads the reply from the API.
    expect(mockEmit.mock.calls.some(([, p]) => (p as Record<string, unknown>).event === 'ticket.completed')).toBe(true);
    expect(JSON.stringify(mockEmit.mock.calls)).not.toContain(SENTINEL);
  });

  it.each([
    ['a schema validation error', LEAKY_ERRORS.schema],
    ['a JSON parse error', LEAKY_ERRORS.json],
    ['a provider HTTP error body', LEAKY_ERRORS.http],
  ])('keeps %s out of the ops alert when triage retries are exhausted', async (_label, message) => {
    const ticket = await insertTicket('TICK-PRIV-002', `Subject ${SENTINEL}`, `Description ${SENTINEL}`);
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');
    mockTriage.mockRejectedValueOnce(new Error(message));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    expect(alerts()).toHaveLength(1);
    expect(Object.keys(alerts()[0]!).sort()).toEqual(['occurredAt', 'reason', 'referenceNumber', 'ticketId']);
    expect(alerts()[0]).toMatchObject({
      ticketId: ticket.id,
      referenceNumber: 'TICK-PRIV-002',
      reason: 'triage_retries_exhausted',
    });
    expect(everythingOpsReceived()).not.toContain(SENTINEL);

    // Ops can still investigate: the full text stays in the event history.
    const stored = (await getAllEventsByTicketId(ticket.id)).find((e) => e.event === 'ticket.failed');
    expect(stored?.detail).toBe(message);
  });

  it('keeps the error text out of the ops alert when draft retries are exhausted', async () => {
    const ticket = await insertTicket('TICK-PRIV-003', `Subject ${SENTINEL}`, 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.started');
    await insertEvent(ticket.id, 'triage.completed');
    await upsertTriageOutput(ticket.id, { ...TRIAGE_RESULT, issueSummary: `summary ${SENTINEL}` });
    await insertEvent(ticket.id, 'draft.failed', 'Error 1');
    await insertEvent(ticket.id, 'draft.failed', 'Error 2');
    mockDraft.mockRejectedValueOnce(new Error(LEAKY_ERRORS.http));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({ ticketId: ticket.id, reason: 'draft_retries_exhausted' });
    expect(everythingOpsReceived()).not.toContain(SENTINEL);
  });

  it('keeps AI output out of the ops alert when the output is incomplete', async () => {
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, category: '   ', issueSummary: `summary ${SENTINEL}` });
    const ticket = await insertTicket('TICK-PRIV-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(alerts('ticket:needs_attention')).toHaveLength(1);
    expect(alerts('ticket:needs_attention')[0]).toMatchObject({ ticketId: ticket.id, reason: 'incomplete_output' });
    expect(everythingOpsReceived()).not.toContain(SENTINEL);
  });
});

describe('processMessage — happy path', () => {
  it('sets ticket status to completed', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-WKR-001', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('completed');
  });

  it('writes started and completed events in order', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-WKR-002', 'Billing', 'Charged twice');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual([
      'triage.started',
      'triage.completed',
      'draft.started',
      'draft.completed',
      'ticket.completed',
    ]);
    events.forEach(e => expect(e.detail).toBeNull());
  });

  it('emits ticket:update via socket for each processing stage', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-WKR-002B', 'Socket', 'Test');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(mockTo).toHaveBeenCalledWith(ticket.id);
    const payloads = mockEmit.mock.calls.map(([, payload]) => payload);
    expect(payloads.map((p) => p.event as string)).toEqual([
      'triage.started',
      'triage.completed',
      'draft.started',
      'draft.completed',
      'ticket.completed',
    ]);

    // ticket.completed included: no stage output goes to the customer's room.
    payloads.forEach((payload) => {
      expect(Object.keys(payload).sort()).toEqual(['event', 'occurredAt', 'ticketId']);
    });
  });

  it('completes processing normally even when notification delivery fails (disconnected customer)', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-WKR-002C', 'Disconnected', 'Test');
    createdIds.push(ticket.id);

    mockEmit
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('no subscribers for room (customer disconnected)');
      });

    await expect(processMessage(ticket.id, 'fake-receipt', 1, mockAi())).resolves.toBeUndefined();

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('completed');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map((e) => e.event)).toEqual([
      'triage.started',
      'triage.completed',
      'draft.started',
      'draft.completed',
      'ticket.completed',
    ]);
  });

  it('persists all six triage fields to ticket_processing', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-WKR-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

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
    mockAiSuccess();
    const ticket = await insertTicket('TICK-WKR-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const result = await getProcessingResultByTicketId(ticket.id);
    expect(result!.customerReply).toBe(DRAFT_ARGS.customer_reply);
    expect(result!.internalNote).toBe(DRAFT_ARGS.internal_note);
    expect(result!.nextSteps).toEqual(DRAFT_ARGS.next_steps);
  });
});

describe('processMessage — triage failure', () => {
  it('stays in processing state on first triage failure', async () => {
    mockTriage.mockRejectedValueOnce(new Error('Groq API unavailable'));
    const ticket = await insertTicket('TICK-WKR-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await expect(processMessage(ticket.id, 'fake-receipt', 1, mockAi())).rejects.toThrow('Groq API unavailable');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('processing');
  });

  it('writes triage.failed event with the error message', async () => {
    mockTriage.mockRejectedValueOnce(new Error('Groq API unavailable'));
    const ticket = await insertTicket('TICK-WKR-006', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    const events = await getAllEventsByTicketId(ticket.id);
    const failure = events.find(e => e.event === 'triage.failed');
    expect(failure).toBeDefined();
    expect(failure!.detail).toBe('Groq API unavailable');
  });

  it('does not write draft or completion events on triage failure', async () => {
    mockTriage.mockRejectedValueOnce(new Error('Groq timeout'));
    const ticket = await insertTicket('TICK-WKR-007', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    const events = await getAllEventsByTicketId(ticket.id);
    const eventNames = events.map(e => e.event);
    expect(eventNames).not.toContain('draft.completed');
    expect(eventNames).not.toContain('ticket.completed');
  });
});

describe('processMessage — draft failure', () => {
  it('stays in processing state on first draft failure', async () => {
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockRejectedValueOnce(new Error('Draft service down'));
    const ticket = await insertTicket('TICK-WKR-008', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await expect(processMessage(ticket.id, 'fake-receipt', 1, mockAi())).rejects.toThrow('Draft service down');

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('processing');
  });

  it('writes triage.completed then draft.failed on draft failure', async () => {
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockRejectedValueOnce(new Error('Draft service down'));
    const ticket = await insertTicket('TICK-WKR-009', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    const events = await getAllEventsByTicketId(ticket.id);
    const names = events.map(e => e.event);
    expect(names).toContain('triage.completed');
    expect(names).toContain('draft.failed');
    expect(names).not.toContain('ticket.completed');
  });
});

describe('processMessage — retry behaviour', () => {
  it('writes triage.failed event on every triage failure', async () => {
    mockTriage.mockRejectedValueOnce(new Error('Transient error'));
    const ticket = await insertTicket('TICK-WKR-010', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    const events = await getAllEventsByTicketId(ticket.id);
    const failed = events.find(e => e.event === 'triage.failed');
    expect(failed).toBeDefined();
    expect(failed!.detail).toBe('Transient error');
    expect(events.find(e => e.event === 'ticket.retry')).toBeUndefined();
  });

  it('writes draft.failed event on every draft failure', async () => {
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockRejectedValueOnce(new Error('Transient draft error'));
    const ticket = await insertTicket('TICK-WKR-011', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.find(e => e.event === 'draft.failed')).toBeDefined();
    expect(events.find(e => e.event === 'ticket.retry')).toBeUndefined();
  });

  it('stays in processing state on triage failure with retries remaining', async () => {
    mockTriage.mockRejectedValueOnce(new Error('Transient error'));
    const ticket = await insertTicket('TICK-WKR-012', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('processing');
  });

  it('marks ticket failed after 3 triage failures', async () => {
    const ticket = await insertTicket('TICK-WKR-013', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');

    mockTriage.mockRejectedValueOnce(new Error('Final triage error'));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('triage_retries_exhausted');
    expect(updated.failedAt).toBeInstanceOf(Date);
    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.find(e => e.event === 'ticket.failed')).toBeDefined();
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
  });

  it('counts failures from the full history, even when they are more than 20 events back (story 5.3)', async () => {
    const ticket = await insertTicket('TICK-WKR-013B', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    for (const n of [1, 2, 3]) await insertEvent(ticket.id, 'triage.failed', `Error ${n}`);
    // Enough later events to push the three failures out of the old 20-event window.
    await pool.query(
      "INSERT INTO ticket_events (ticket_id, event) SELECT $1, 'triage.started' FROM generate_series(1, 25)",
      [ticket.id]
    );

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi());

    expect(mockTriage).not.toHaveBeenCalled();
    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('triage_retries_exhausted');
  });

  it('marks ticket failed after 3 draft failures', async () => {
    const ticket = await insertTicket('TICK-WKR-014', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.started');
    await insertEvent(ticket.id, 'triage.completed');
    await upsertTriageOutput(ticket.id, TRIAGE_RESULT);
    await insertEvent(ticket.id, 'draft.failed', 'Error 1');
    await insertEvent(ticket.id, 'draft.failed', 'Error 2');

    mockDraft.mockRejectedValueOnce(new Error('Final draft error'));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('draft_retries_exhausted');
  });

  it('emits ticket:failed to ops room on exhaustion', async () => {
    const ticket = await insertTicket('TICK-WKR-015', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');

    mockTriage.mockRejectedValueOnce(new Error('Final error'));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    expect(mockTo).toHaveBeenCalledWith('ops');
    const opsEmitCall = mockOpsEmit.mock.calls.find(([event]) => event === 'ticket:failed');
    expect(opsEmitCall).toBeDefined();
    expect(opsEmitCall![1]).toMatchObject({ ticketId: ticket.id, reason: 'triage_retries_exhausted' });
    expect(opsEmitCall![1]).not.toHaveProperty('detail');
  });

  it('skips processing and deletes message for a completed ticket', async () => {
    const { deleteMessage } = await import('../src/lib/queue.js');
    const ticket = await insertTicket('TICK-WKR-016', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'completed' WHERE id = $1", [ticket.id]);

    await processMessage(ticket.id, 'fake-receipt', 2, mockAi());

    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
    expect(mockTriage).not.toHaveBeenCalled();
  });

  it('skips processing and deletes message for a needs_attention ticket', async () => {
    const { deleteMessage } = await import('../src/lib/queue.js');
    const ticket = await insertTicket('TICK-WKR-017', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'needs_attention' WHERE id = $1", [ticket.id]);

    await processMessage(ticket.id, 'fake-receipt', 4, mockAi());

    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
    expect(mockTriage).not.toHaveBeenCalled();
  });

  it('resumes from draft when triage already completed', async () => {
    const ticket = await insertTicket('TICK-WKR-018', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.started');
    await insertEvent(ticket.id, 'triage.completed');
    await upsertTriageOutput(ticket.id, TRIAGE_RESULT);

    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);

    await processMessage(ticket.id, 'fake-receipt', 2, mockAi());

    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockDraft).toHaveBeenCalledOnce();
    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('completed');
  });
});

describe('processMessage — output validation', () => {
  it('marks ticket needs_attention when triage output has empty category, without drafting', async () => {
    const incompleteTriageResult = { ...TRIAGE_RESULT, category: '' };
    mockTriage.mockResolvedValueOnce(incompleteTriageResult);
    const ticket = await insertTicket('TICK-WKR-019', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('needs_attention');
    expect(mockDraft).not.toHaveBeenCalled();
    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual(['triage.started', 'triage.invalid', 'ticket.needs_attention']);
    const needsAttention = events.find(e => e.event === 'ticket.needs_attention');
    expect(needsAttention!.detail).toContain('category');
  });

  it('records draft.invalid and keeps the completed triage when the draft output is incomplete', async () => {
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockResolvedValueOnce({ ...DRAFT_RESULT, internalNote: '' });
    const ticket = await insertTicket('TICK-WKR-020B', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual([
      'triage.started', 'triage.completed', 'draft.started', 'draft.invalid', 'ticket.needs_attention',
    ]);
    expect(events.find(e => e.event === 'draft.invalid')!.detail).toContain('internalNote');
  });

  it('marks ticket needs_attention when draft output has empty nextSteps', async () => {
    const incompleteDraftResult = { ...DRAFT_RESULT, nextSteps: [] };
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockResolvedValueOnce(incompleteDraftResult);
    const ticket = await insertTicket('TICK-WKR-020', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('needs_attention');
    const events = await getAllEventsByTicketId(ticket.id);
    const needsAttention = events.find(e => e.event === 'ticket.needs_attention');
    expect(needsAttention).toBeDefined();
    expect(needsAttention!.detail).toContain('nextSteps');
  });

  it('does not write ticket.completed event on validation failure', async () => {
    const incompleteTriageResult = { ...TRIAGE_RESULT, sentiment: '' };
    mockTriage.mockResolvedValueOnce(incompleteTriageResult);
    const ticket = await insertTicket('TICK-WKR-021', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.find(e => e.event === 'ticket.completed')).toBeUndefined();
  });

  it('emits ticket:needs_attention to ops room on validation failure', async () => {
    const incompleteTriageResult = { ...TRIAGE_RESULT, category: '   ' };
    mockTriage.mockResolvedValueOnce(incompleteTriageResult);
    const ticket = await insertTicket('TICK-WKR-022', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(mockTo).toHaveBeenCalledWith('ops');
    const opsEmitCall = mockOpsEmit.mock.calls.find(([event]) => event === 'ticket:needs_attention');
    expect(opsEmitCall).toBeDefined();
    expect(opsEmitCall![1]).toMatchObject({ ticketId: ticket.id, reason: 'incomplete_output' });
    expect(opsEmitCall![1]).not.toHaveProperty('detail');
  });
});

describe('processMessage — permanent failure (story 5.2)', () => {
  it('does not restart a failed ticket: skips it, deletes the message, makes no AI call', async () => {
    const ticket = await insertTicket('TICK-FAIL-001', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'failed' WHERE id = $1", [ticket.id]);

    await processMessage(ticket.id, 'fake-receipt', 4, mockAi());

    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockDraft).not.toHaveBeenCalled();
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
    expect((await getTicketById(ticket.id)).status).toBe('failed');
  });

  it('never leaves a failed ticket in processing: the status is failed, not in-progress', async () => {
    const ticket = await insertTicket('TICK-FAIL-002', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');
    mockTriage.mockRejectedValueOnce(new Error('Final'));

    await expect(processMessage(ticket.id, 'fake-receipt', 3, mockAi())).resolves.toBeUndefined();

    expect((await getTicketById(ticket.id)).status).toBe('failed');
  });

  it('keeps needs_attention for invalid output, with no failure reason', async () => {
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, category: '  ' });
    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);
    const ticket = await insertTicket('TICK-FAIL-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('needs_attention');
    expect(updated.failureReason).toBeNull();
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
  });

  it('rethrows an unexpected error while receives remain, leaving the ticket processing', async () => {
    const ticket = await insertTicket('TICK-FAIL-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    const spy = vi.spyOn(pool, 'query');
    spy.mockImplementationOnce(() => Promise.reject(new Error('db blip')));

    await expect(processMessage(ticket.id, 'fake-receipt', 2, mockAi())).rejects.toThrow('db blip');
    spy.mockRestore();

    expect((await getTicketById(ticket.id)).status).toBe('processing');
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it('marks failed with processing_error on the last allowed receive', async () => {
    const ticket = await insertTicket('TICK-FAIL-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    const realQuery = pool.query.bind(pool);
    const spy = vi.spyOn(pool, 'query');
    // Only the pipeline's first read fails; the failure handler's own queries go through.
    spy.mockImplementationOnce(() => Promise.reject(new Error('db blip')));
    spy.mockImplementation(((...args: unknown[]) => (realQuery as any)(...args)) as any);

    await processMessage(ticket.id, 'fake-receipt', 6, mockAi());
    spy.mockRestore();

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('processing_error');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
    const alert = mockOpsEmit.mock.calls.find(([name]) => name === 'ticket:failed');
    expect(alert?.[1]).toMatchObject({ ticketId: ticket.id, reason: 'processing_error' });
  });

  it('fails a ticket without any work when the message arrives past the receive cap', async () => {
    const ticket = await insertTicket('TICK-FAIL-006', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);

    await processMessage(ticket.id, 'fake-receipt', 7, mockAi());

    expect(mockTriage).not.toHaveBeenCalled();
    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('processing_error');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
  });

  it('leaves a completed ticket completed when a stale message arrives past the cap', async () => {
    const ticket = await insertTicket('TICK-FAIL-007', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'completed' WHERE id = $1", [ticket.id]);

    await processMessage(ticket.id, 'fake-receipt', 8, mockAi());

    expect((await getTicketById(ticket.id)).status).toBe('completed');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
  });

  it('gives a replayed ticket a fresh set of attempts', async () => {
    const ticket = await insertTicket('TICK-FAIL-008', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');
    await insertEvent(ticket.id, 'triage.failed', 'Error 3');
    await insertEvent(ticket.id, 'ticket.requeued');
    mockAiSuccess();

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect((await getTicketById(ticket.id)).status).toBe('completed');
  });
});

describe('ops recovery end to end (story 5.4)', () => {
  // clearAllMocks() keeps queued one-shot results from earlier tests.
  beforeEach(() => {
    mockTriage.mockReset();
    mockDraft.mockReset();
  });

  it('resumes a draft-failed ticket at draft, reusing the stored triage, and completes it', async () => {
    const ticket = await insertTicket('TICK-RECOVER-001', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockRejectedValue(new Error('model overloaded'));
    for (const attempt of [1, 2, 3]) {
      await processMessage(ticket.id, 'fake-receipt', attempt, mockAi()).catch(() => {});
    }
    expect((await getTicketById(ticket.id)).status).toBe('failed');

    const result = await replayTicket(ticket.id);
    expect(result).toMatchObject({ ok: true, previousStatus: 'failed' });

    vi.clearAllMocks();
    mockDraft.mockReset().mockResolvedValueOnce(DRAFT_RESULT);
    await processMessage(ticket.id, 'fake-receipt-2', 1, mockAi());

    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockDraft).toHaveBeenCalledTimes(1);
    expect((await getTicketById(ticket.id)).status).toBe('completed');
    // The customer gets their reply, built on the triage from before the failure.
    expect(mockEmit.mock.calls.some(([, p]) => (p as Record<string, unknown>).event === 'ticket.completed')).toBe(true);
    expect(await getProcessingResultByTicketId(ticket.id)).toMatchObject({
      category: TRIAGE_RESULT.category,
      customerReply: DRAFT_RESULT.customerReply,
    });
  });

  it('re-runs only the draft for a ticket whose draft output was invalid', async () => {
    const ticket = await insertTicket('TICK-RECOVER-003', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);
    mockTriage.mockResolvedValueOnce(TRIAGE_RESULT);
    mockDraft.mockResolvedValueOnce({ ...DRAFT_RESULT, nextSteps: [] });
    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());
    expect((await getTicketById(ticket.id)).status).toBe('needs_attention');

    await replayTicket(ticket.id);
    vi.clearAllMocks();
    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);
    await processMessage(ticket.id, 'fake-receipt-2', 1, mockAi());

    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockDraft).toHaveBeenCalledTimes(1);
    expect((await getTicketById(ticket.id)).status).toBe('completed');
  });

  it('re-runs both stages for a ticket whose triage output was invalid', async () => {
    const ticket = await insertTicket('TICK-RECOVER-004', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, category: '' });
    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());
    expect((await getTicketById(ticket.id)).status).toBe('needs_attention');

    await replayTicket(ticket.id);
    mockAiSuccess();
    await processMessage(ticket.id, 'fake-receipt-2', 1, mockAi());

    expect(mockTriage).toHaveBeenCalledTimes(2);
    expect(mockDraft).toHaveBeenCalledTimes(1);
    expect((await getTicketById(ticket.id)).status).toBe('completed');
  });

  it('reuses triage output saved just before a crash, without running triage again', async () => {
    const ticket = await insertTicket('TICK-RECOVER-005', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.started');
    await upsertTriageOutput(ticket.id, TRIAGE_RESULT);
    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);

    await processMessage(ticket.id, 'fake-receipt', 2, mockAi());

    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockDraft).toHaveBeenCalledTimes(1);
    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).toEqual([
      'triage.started', 'triage.completed', 'draft.started', 'draft.completed', 'ticket.completed',
    ]);
    expect(events[1]!.detail).toBe('reused stored output');
  });

  it('runs triage again when the history says completed but no output was saved', async () => {
    const ticket = await insertTicket('TICK-RECOVER-006', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.started');
    await insertEvent(ticket.id, 'triage.completed');
    mockAiSuccess();

    await processMessage(ticket.id, 'fake-receipt', 2, mockAi());

    expect(mockTriage).toHaveBeenCalledTimes(1);
    expect(mockDraft).toHaveBeenCalledWith(ticket.id, 'Login broken', 'Cannot sign in', TRIAGE_RESULT);
    expect((await getTicketById(ticket.id)).status).toBe('completed');
  });

  it('does not reuse a saved draft once triage has run again', async () => {
    const ticket = await insertTicket('TICK-RECOVER-007', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);
    await upsertTriageOutput(ticket.id, { ...TRIAGE_RESULT, category: '' });
    await completeDraftOutput(ticket.id, { ...DRAFT_RESULT, customerReply: 'stale reply' });
    mockAiSuccess();

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(mockTriage).toHaveBeenCalledTimes(1);
    expect(mockDraft).toHaveBeenCalledTimes(1);
    expect((await getProcessingResultByTicketId(ticket.id))!.customerReply).toBe(DRAFT_RESULT.customerReply);
  });

  it('re-runs both stages for an older needs_attention ticket with no marker and no saved output', async () => {
    const ticket = await insertTicket('TICK-RECOVER-002', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);
    for (const event of ['triage.started', 'triage.completed', 'draft.started', 'draft.completed', 'ticket.needs_attention']) {
      await insertEvent(ticket.id, event);
    }
    await pool.query("UPDATE tickets SET status = 'needs_attention' WHERE id = $1", [ticket.id]);

    const result = await replayTicket(ticket.id);
    expect(result).toMatchObject({ ok: true, previousStatus: 'needs_attention' });

    mockAiSuccess();
    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(mockTriage).toHaveBeenCalledTimes(1);
    expect(mockDraft).toHaveBeenCalledTimes(1);
    expect((await getTicketById(ticket.id)).status).toBe('completed');
    expect(await getProcessingResultByTicketId(ticket.id)).toMatchObject({
      issueSummary: TRIAGE_RESULT.issueSummary,
      customerReply: DRAFT_RESULT.customerReply,
    });
  });
});
