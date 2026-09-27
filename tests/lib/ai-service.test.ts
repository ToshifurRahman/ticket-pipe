import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTriage = vi.hoisted(() => vi.fn());
const mockDraft = vi.hoisted(() => vi.fn());
const mockIsBackupConfigured = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/llm-client.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../src/lib/llm-client.js')>();
  return {
    ...real,
    triage: mockTriage,
    draft: mockDraft,
    isBackupConfigured: mockIsBackupConfigured,
    getPrimaryProvider: () => ({ name: 'primary', apiKey: 'primary-key', model: 'primary-model' }),
    getBackupProvider: () => ({ name: 'backup', apiKey: 'backup-key', model: 'backup-model' }),
  };
});

import { AIService } from '../../src/lib/ai-service.js';
import { LlmCallError } from '../../src/lib/llm-client.js';
import type { AiInteractionRecord } from '../../src/repositories/ai-interactions.js';

const TRIAGE_OUTPUT = {
  category: 'technical',
  priority: 'high' as const,
  sentiment: 'frustrated' as const,
  escalate: false,
  recommended_team: 'tech-support',
  issue_summary: 'Customer cannot log in',
};

const DRAFT_OUTPUT = {
  customer_reply: 'We are looking into your login issue.',
  internal_note: 'Check auth service logs.',
  next_steps: ['Check auth logs', 'Reset session'],
};

function successResult<T>(output: T) {
  return { output, usage: { promptTokens: 10, completionTokens: 20 }, httpStatus: 200 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsBackupConfigured.mockReturnValue(true);
});

describe('AIService.triage', () => {
  it('records a single success interaction when the primary provider succeeds', async () => {
    mockTriage.mockResolvedValueOnce(successResult(TRIAGE_OUTPUT));
    const recorder = vi.fn().mockResolvedValue(undefined);
    const service = new AIService(recorder);

    await service.triage('ticket-1', 'Subject', 'Description');

    expect(recorder).toHaveBeenCalledTimes(1);
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', operation: 'triage', provider: 'primary', outcome: 'success' })
    );
  });

  it('records a failure then a success when the backup rescues a failed primary', async () => {
    mockTriage
      .mockRejectedValueOnce(new LlmCallError('http_error', 'rate limited', 429))
      .mockResolvedValueOnce(successResult(TRIAGE_OUTPUT));
    const recorder = vi.fn().mockResolvedValue(undefined);
    const service = new AIService(recorder);

    const result = await service.triage('ticket-2', 'Subject', 'Description');

    expect(result.category).toBe(TRIAGE_OUTPUT.category);
    expect(recorder).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = recorder.mock.calls.map(([r]) => r as AiInteractionRecord);
    expect(firstCall).toMatchObject({ provider: 'primary', outcome: 'http_error', httpStatus: 429 });
    expect(secondCall).toMatchObject({ provider: 'backup', outcome: 'success' });
  });

  it('records two failures and rethrows the primary error when both providers fail', async () => {
    mockTriage
      .mockRejectedValueOnce(new LlmCallError('network_error', 'primary down'))
      .mockRejectedValueOnce(new LlmCallError('network_error', 'backup down'));
    const recorder = vi.fn().mockResolvedValue(undefined);
    const service = new AIService(recorder);

    await expect(service.triage('ticket-3', 'Subject', 'Description')).rejects.toThrow('primary down');

    expect(recorder).toHaveBeenCalledTimes(2);
    const outcomes = recorder.mock.calls.map(([r]) => (r as AiInteractionRecord).outcome);
    expect(outcomes).toEqual(['network_error', 'network_error']);
  });

  it('records a single failure and skips the backup when it is not configured', async () => {
    mockIsBackupConfigured.mockReturnValue(false);
    mockTriage.mockRejectedValueOnce(new LlmCallError('timeout', 'timed out'));
    const recorder = vi.fn().mockResolvedValue(undefined);
    const service = new AIService(recorder);

    await expect(service.triage('ticket-4', 'Subject', 'Description')).rejects.toThrow('timed out');

    expect(recorder).toHaveBeenCalledTimes(1);
    expect(mockDraft).not.toHaveBeenCalled();
  });

  it('still returns the AI result when the recorder throws', async () => {
    mockTriage.mockResolvedValueOnce(successResult(TRIAGE_OUTPUT));
    const recorder = vi.fn().mockRejectedValue(new Error('DB unavailable'));
    const service = new AIService(recorder);

    const result = await service.triage('ticket-5', 'Subject', 'Description');

    expect(result.category).toBe(TRIAGE_OUTPUT.category);
  });
});

describe('AIService.draft', () => {
  const triageResult = {
    category: 'technical',
    priority: 'high',
    sentiment: 'frustrated',
    escalate: false,
    recommendedTeam: 'tech-support',
    issueSummary: 'Customer cannot log in',
  };

  it('records a single success interaction when the primary provider succeeds', async () => {
    mockDraft.mockResolvedValueOnce(successResult(DRAFT_OUTPUT));
    const recorder = vi.fn().mockResolvedValue(undefined);
    const service = new AIService(recorder);

    await service.draft('ticket-6', 'Subject', 'Description', triageResult);

    expect(recorder).toHaveBeenCalledTimes(1);
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-6', operation: 'draft', provider: 'primary', outcome: 'success' })
    );
  });
});
