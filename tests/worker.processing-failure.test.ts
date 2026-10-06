/**
 * Tests processMessage when markTicketCompleted throws during finalization.
 * A finalization error is retried like any other error, and fails the ticket
 * (finalize_failed) only once the receive cap is reached.
 */

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import type { AIService } from '../src/lib/ai-service.js';

const mockMarkTicketCompleted = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/queue.js')>();
  return { ...real, deleteMessage: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../src/lib/socket.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/socket.js')>();
  return { ...real, getEmitter: vi.fn(() => ({ to: () => ({ emit: () => {} }) })) };
});

vi.mock('../src/repositories/tickets.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/repositories/tickets.js')>();
  return { ...real, markTicketCompleted: mockMarkTicketCompleted };
});

import { pool } from '../src/lib/db.js';
import { purgeTicketEvents } from './helpers/purge-ticket-events.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getAllEventsByTicketId } from '../src/repositories/events.js';
import { getProcessingResultByTicketId } from '../src/repositories/processing.js';
import { deleteMessage } from '../src/lib/queue.js';
import { processMessage } from '../src/worker.js';

const TRIAGE_RESULT = {
  category: 'technical',
  priority: 'high',
  sentiment: 'frustrated',
  escalate: false,
  recommendedTeam: 'tech-support',
  issueSummary: 'Customer cannot log in',
};

const DRAFT_RESULT = {
  customerReply: 'We are looking into your login issue.',
  internalNote: 'Check auth service logs.',
  nextSteps: ['Check auth logs', 'Reset session'],
};

const mockTriage = vi.fn();
const mockDraft = vi.fn();

function mockAi(): AIService {
  mockTriage.mockResolvedValue(TRIAGE_RESULT);
  mockDraft.mockResolvedValue(DRAFT_RESULT);
  return { triage: mockTriage, draft: mockDraft } as unknown as AIService;
}

const createdIds: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  mockMarkTicketCompleted.mockReset();
  mockTriage.mockReset();
  mockDraft.mockReset();
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

describe('processMessage — finalization failure', () => {
  it('retries instead of failing while receives remain', async () => {
    mockMarkTicketCompleted.mockRejectedValueOnce(new Error('DB constraint violated'));
    const ticket = await insertTicket('TICK-PROC-001', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await expect(processMessage(ticket.id, 'fake-receipt', 1, mockAi())).rejects.toThrow('DB constraint violated');

    expect((await getTicketById(ticket.id)).status).toBe('processing');
    expect(deleteMessage).not.toHaveBeenCalled();
    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).not.toContain('ticket.failed');
  });

  it('does not run the draft AI call again on the retry', async () => {
    mockMarkTicketCompleted.mockRejectedValueOnce(new Error('DB constraint violated'));
    const ai = mockAi();
    const ticket = await insertTicket('TICK-PROC-002', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, ai).catch(() => {});
    mockMarkTicketCompleted.mockResolvedValueOnce(true);
    await processMessage(ticket.id, 'fake-receipt', 2, ai);

    expect(mockTriage).toHaveBeenCalledTimes(1);
    expect(mockDraft).toHaveBeenCalledTimes(1);
  });

  it('fails the ticket with finalize_failed on the last allowed receive', async () => {
    mockMarkTicketCompleted.mockRejectedValue(new Error('DB constraint violated'));
    const ticket = await insertTicket('TICK-PROC-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 6, mockAi());

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('finalize_failed');
    expect(deleteMessage).toHaveBeenCalledWith('fake-receipt');
    const failedEvent = (await getAllEventsByTicketId(ticket.id)).find(e => e.event === 'ticket.failed');
    expect(failedEvent?.detail).toBe('DB constraint violated');
  });

  it('does not write ticket.completed when finalization fails', async () => {
    mockMarkTicketCompleted.mockRejectedValue(new Error('DB constraint violated'));
    const ticket = await insertTicket('TICK-PROC-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 6, mockAi());

    const events = await getAllEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).not.toContain('ticket.completed');
  });

  it('processing row has triage and draft data even when finalization fails', async () => {
    mockMarkTicketCompleted.mockRejectedValue(new Error('DB constraint violated'));
    const ticket = await insertTicket('TICK-PROC-005', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 6, mockAi());

    const processing = await getProcessingResultByTicketId(ticket.id);
    expect(processing).not.toBeNull();
    expect(processing!.category).toBe(TRIAGE_RESULT.category);
    expect(processing!.customerReply).toBe(DRAFT_RESULT.customerReply);
  });
});
