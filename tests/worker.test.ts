import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type { AIService } from '../src/lib/ai-service.js';

const mockEmit = vi.hoisted(() => vi.fn());
// The ops feed (`ops:ticket_event`) gets its own spy so the per-ticket assertions below
// keep seeing only ticket-room traffic, in the same order they always have.
const mockOpsEmit = vi.hoisted(() => vi.fn());
const mockTo = vi.hoisted(() =>
  vi.fn(() => ({
    emit: (event: string, payload: unknown) =>
      event === 'ops:ticket_event' ? mockOpsEmit(event, payload) : mockEmit(event, payload),
  }))
);

vi.mock('../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/queue.js')>();
  return { ...real, deleteMessage: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../src/lib/socket.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/socket.js')>();
  return { ...real, getEmitter: vi.fn(() => ({ to: mockTo })) };
});

import { pool } from '../src/lib/db.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getEventsByTicketId, insertEvent } from '../src/repositories/events.js';
import { getProcessingResultByTicketId, upsertTriageOutput } from '../src/repositories/processing.js';
import { deleteMessage } from '../src/lib/queue.js';
import { processMessage } from '../src/worker.js';

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

describe('processMessage — ops feed (story 4.4)', () => {
  const opsEvents = () => mockOpsEmit.mock.calls.map(([, payload]) => payload as Record<string, unknown>);

  // clearAllMocks() keeps implementations, so undo the throwing spy from the last test.
  afterEach(() => mockOpsEmit.mockReset());

  it('publishes one ops:ticket_event per ticket_events row, in order', async () => {
    mockAiSuccess();
    const ticket = await insertTicket('TICK-OPS-FEED-001', 'Login broken', 'Cannot sign in');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const rows = await getEventsByTicketId(ticket.id);
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

  it('publishes ticket.needs_attention to the feed when retries are exhausted', async () => {
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
      'ticket.needs_attention',
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

    const events = await getEventsByTicketId(ticket.id);
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

    const lightweightPayloads = payloads.slice(0, 4);
    lightweightPayloads.forEach((payload) => {
      expect(Object.keys(payload).sort()).toEqual(['event', 'occurredAt', 'ticketId']);
    });

    const completedPayload = payloads[4];
    expect(completedPayload.triage).toEqual(TRIAGE_RESULT);
    expect(completedPayload.draft).toEqual({
      customerReply: DRAFT_ARGS.customer_reply,
      internalNote: DRAFT_ARGS.internal_note,
      nextActions: DRAFT_ARGS.next_steps,
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

    const events = await getEventsByTicketId(ticket.id);
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

    const events = await getEventsByTicketId(ticket.id);
    const failure = events.find(e => e.event === 'triage.failed');
    expect(failure).toBeDefined();
    expect(failure!.detail).toBe('Groq API unavailable');
  });

  it('does not write draft or completion events on triage failure', async () => {
    mockTriage.mockRejectedValueOnce(new Error('Groq timeout'));
    const ticket = await insertTicket('TICK-WKR-007', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    const events = await getEventsByTicketId(ticket.id);
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

    const events = await getEventsByTicketId(ticket.id);
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

    const events = await getEventsByTicketId(ticket.id);
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

    const events = await getEventsByTicketId(ticket.id);
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

  it('marks ticket needs_attention after 3 triage failures', async () => {
    const ticket = await insertTicket('TICK-WKR-013', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');

    mockTriage.mockRejectedValueOnce(new Error('Final triage error'));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('needs_attention');
    const events = await getEventsByTicketId(ticket.id);
    expect(events.find(e => e.event === 'ticket.needs_attention')).toBeDefined();
  });

  it('marks ticket needs_attention after 3 draft failures', async () => {
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
    expect(updated.status).toBe('needs_attention');
  });

  it('emits ticket:needs_attention to ops room on exhaustion', async () => {
    const ticket = await insertTicket('TICK-WKR-015', 'Sub', 'Desc');
    createdIds.push(ticket.id);
    await pool.query("UPDATE tickets SET status = 'processing' WHERE id = $1", [ticket.id]);
    await insertEvent(ticket.id, 'triage.failed', 'Error 1');
    await insertEvent(ticket.id, 'triage.failed', 'Error 2');

    mockTriage.mockRejectedValueOnce(new Error('Final error'));

    await processMessage(ticket.id, 'fake-receipt', 3, mockAi()).catch(() => {});

    expect(mockTo).toHaveBeenCalledWith('ops');
    const opsEmitCall = mockEmit.mock.calls.find(([event]) => event === 'ticket:needs_attention');
    expect(opsEmitCall).toBeDefined();
    expect(opsEmitCall![1]).toMatchObject({ ticketId: ticket.id });
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
  it('marks ticket needs_attention when triage output has empty category', async () => {
    const incompleteTriageResult = { ...TRIAGE_RESULT, category: '' };
    mockTriage.mockResolvedValueOnce(incompleteTriageResult);
    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);
    const ticket = await insertTicket('TICK-WKR-019', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('needs_attention');
    const events = await getEventsByTicketId(ticket.id);
    const needsAttention = events.find(e => e.event === 'ticket.needs_attention');
    expect(needsAttention).toBeDefined();
    expect(needsAttention!.detail).toContain('category');
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
    const events = await getEventsByTicketId(ticket.id);
    const needsAttention = events.find(e => e.event === 'ticket.needs_attention');
    expect(needsAttention).toBeDefined();
    expect(needsAttention!.detail).toContain('nextSteps');
  });

  it('does not write ticket.completed event on validation failure', async () => {
    const incompleteTriageResult = { ...TRIAGE_RESULT, sentiment: '' };
    mockTriage.mockResolvedValueOnce(incompleteTriageResult);
    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);
    const ticket = await insertTicket('TICK-WKR-021', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    const events = await getEventsByTicketId(ticket.id);
    expect(events.find(e => e.event === 'ticket.completed')).toBeUndefined();
  });

  it('emits ticket:needs_attention to ops room on validation failure', async () => {
    const incompleteTriageResult = { ...TRIAGE_RESULT, category: '   ' };
    mockTriage.mockResolvedValueOnce(incompleteTriageResult);
    mockDraft.mockResolvedValueOnce(DRAFT_RESULT);
    const ticket = await insertTicket('TICK-WKR-022', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi());

    expect(mockTo).toHaveBeenCalledWith('ops');
    const opsEmitCall = mockEmit.mock.calls.find(([event]) => event === 'ticket:needs_attention');
    expect(opsEmitCall).toBeDefined();
    expect(opsEmitCall![1]).toMatchObject({ ticketId: ticket.id });
  });
});
