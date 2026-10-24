/**
 * Story 5.7 — the worker emails ops (via SNS) when a ticket newly enters needs_attention.
 * SNS is a fake client that records every publish; the database and the worker are real.
 */
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import type { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { AIService } from '../src/lib/ai-service.js';

const mockSend = vi.hoisted(() => vi.fn());
const mockOpsEmit = vi.hoisted(() => vi.fn());
const mockMarkNeedsAttention = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/sns.js', () => ({
  getSnsClient: () => ({
    client: { send: mockSend } as unknown as SNSClient,
    topicArn: 'arn:aws:sns:us-east-1:000000000000:ticket-needs-attention',
  }),
}));

vi.mock('../src/lib/queue.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/queue.js')>();
  return { ...real, deleteMessage: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../src/lib/socket.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/socket.js')>();
  return {
    ...real,
    getEmitter: vi.fn(() => ({
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => (room === 'ops' ? mockOpsEmit(event, payload) : undefined),
      }),
    })),
  };
});

vi.mock('../src/repositories/tickets.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/repositories/tickets.js')>();
  mockMarkNeedsAttention.mockImplementation(real.markTicketNeedsAttention);
  return { ...real, markTicketNeedsAttention: mockMarkNeedsAttention };
});

import { pool } from '../src/lib/db.js';
import { purgeTicketEvents } from './helpers/purge-ticket-events.js';
import { insertTicket, getTicketById } from '../src/repositories/tickets.js';
import { getAllEventsByTicketId } from '../src/repositories/events.js';
import { deleteMessage } from '../src/lib/queue.js';
import { pendingAlerts } from '../src/services/ops-alerts.js';
import { processMessage } from '../src/worker.js';

const TRIAGE_RESULT = {
  category: 'technical',
  priority: 'high',
  sentiment: 'frustrated',
  escalate: false,
  recommendedTeam: 'tech-support',
  issueSummary: 'Customer cannot log in',
};

const mockTriage = vi.fn();
const mockDraft = vi.fn();
const ai = { triage: mockTriage, draft: mockDraft } as unknown as AIService;

const createdIds: string[] = [];

function published(): PublishCommand['input'][] {
  return mockSend.mock.calls.map(([command]) => (command as PublishCommand).input);
}

afterEach(async () => {
  mockSend.mockReset();
  mockOpsEmit.mockReset();
  mockTriage.mockReset();
  mockDraft.mockReset();
  vi.mocked(deleteMessage).mockClear();
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

describe('processMessage — ops email alert', () => {
  it('publishes exactly one alert, with none of the ticket, AI output or error text', async () => {
    mockSend.mockResolvedValue({});
    const SUBJECT = 'SENTINEL-SUBJECT-7f3a';
    const DESCRIPTION = 'SENTINEL-DESCRIPTION-91c2';
    const AI_OUTPUT = 'SENTINEL-AI-OUTPUT-4be8';
    const ERROR_TEXT = 'SENTINEL-ERROR-TEXT-d05e';

    const ticket = await insertTicket('TICK-ALERT-W01', `Help ${SUBJECT}`, `It broke ${DESCRIPTION}`);
    createdIds.push(ticket.id);

    // First receive: the AI call fails with text that ends up in the ticket's history.
    mockTriage.mockRejectedValueOnce(new Error(`provider error ${ERROR_TEXT}`));
    await expect(processMessage(ticket.id, 'receipt-1', 1, ai)).rejects.toThrow(ERROR_TEXT);
    // Second receive: the AI answers, but its output is unusable, so the ticket needs attention.
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, category: '', issueSummary: AI_OUTPUT });
    await processMessage(ticket.id, 'receipt-2', 2, ai);
    await pendingAlerts();

    expect((await getTicketById(ticket.id)).status).toBe('needs_attention');
    // The sentinels really were in reach: the history holds the error text.
    const history = JSON.stringify(await getAllEventsByTicketId(ticket.id));
    expect(history).toContain(ERROR_TEXT);

    expect(published()).toHaveLength(1);
    const [input] = published();
    expect(input.Subject).toBe(`[Ticket Pipe] TICK-ALERT-W01 needs attention (incomplete_output)`);
    expect(input.Message).toContain(`Ticket ID: ${ticket.id}`);
    const sent = JSON.stringify(input);
    for (const sentinel of [SUBJECT, DESCRIPTION, AI_OUTPUT, ERROR_TEXT]) {
      expect(sent).not.toContain(sentinel);
    }
  });

  it('sends no alert when the ticket was not moved into needs_attention, but still feeds ops', async () => {
    mockSend.mockResolvedValue({});
    mockMarkNeedsAttention.mockResolvedValueOnce(false);
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, category: '' });
    const ticket = await insertTicket('TICK-ALERT-W02', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'receipt-1', 1, ai);
    await pendingAlerts();

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockOpsEmit).toHaveBeenCalledWith('ticket:needs_attention', expect.objectContaining({ ticketId: ticket.id }));
  });

  it('finishes processing while the SNS call hangs', async () => {
    let release!: () => void;
    mockSend.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, category: '' });
    const ticket = await insertTicket('TICK-ALERT-W03', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await processMessage(ticket.id, 'receipt-1', 1, ai);

    expect(mockSend).toHaveBeenCalledOnce();
    expect((await getTicketById(ticket.id)).status).toBe('needs_attention');
    expect(deleteMessage).toHaveBeenCalledWith('receipt-1');

    release();
    await pendingAlerts();
  });

  it('keeps processing when the SNS call fails', async () => {
    mockSend.mockRejectedValue(new Error('SNS is down'));
    mockTriage.mockResolvedValueOnce({ ...TRIAGE_RESULT, category: '' });
    const ticket = await insertTicket('TICK-ALERT-W04', 'Sub', 'Desc');
    createdIds.push(ticket.id);

    await expect(processMessage(ticket.id, 'receipt-1', 1, ai)).resolves.toBeUndefined();
    await pendingAlerts();

    expect((await getTicketById(ticket.id)).status).toBe('needs_attention');
    expect(deleteMessage).toHaveBeenCalledWith('receipt-1');
  });
});
