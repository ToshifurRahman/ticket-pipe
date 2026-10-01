/**
 * Tests processMessage when markTicketCompleted throws during finalization.
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
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getEventsByTicketId } from '../src/repositories/events.js';
import { getProcessingResultByTicketId } from '../src/repositories/processing.js';
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

function mockAi(): AIService {
  return {
    triage: vi.fn().mockResolvedValue(TRIAGE_RESULT),
    draft: vi.fn().mockResolvedValue(DRAFT_RESULT),
  } as unknown as AIService;
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

describe('processMessage — finalization failure', () => {
  it('sets status to failed when markTicketCompleted throws', async () => {
    mockMarkTicketCompleted.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-001', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    const updated = await getTicketById(ticket.id);
    expect(updated.status).toBe('failed');
  });

  it('writes ticket.failed event with the error message', async () => {
    mockMarkTicketCompleted.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-002', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    const events = await getEventsByTicketId(ticket.id);
    const failedEvent = events.find(e => e.event === 'ticket.failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent!.detail).toBe('DB constraint violated');
  });

  it('does not write ticket.completed when finalization fails', async () => {
    mockMarkTicketCompleted.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-003', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    const events = await getEventsByTicketId(ticket.id);
    expect(events.map(e => e.event)).not.toContain('ticket.completed');
  });

  it('processing row has triage and draft data even when finalization fails', async () => {
    mockMarkTicketCompleted.mockRejectedValueOnce(new Error('DB constraint violated'));

    const ticket = await insertTicket('TICK-PROC-004', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'fake-receipt', 1, mockAi()).catch(() => {});

    const processing = await getProcessingResultByTicketId(ticket.id);
    expect(processing).not.toBeNull();
    expect(processing!.category).toBe(TRIAGE_RESULT.category);
    expect(processing!.customerReply).toBe(DRAFT_RESULT.customerReply);
  });
});
