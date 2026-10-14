import { describe, expect, it } from 'vitest';
import { groupTimeline, humanize, replayStage, stateReason } from './ops-ticket';
import type { OpsTicketDetail } from './types';

const phases = (triage: string, draft: string) =>
  ({ triage: { status: triage }, draft: { status: draft } }) as OpsTicketDetail['phases'];

describe('replayStage', () => {
  it('resumes at the first stage that did not complete', () => {
    expect(replayStage('failed', phases('failed', 'pending'))).toBe('triage');
    expect(replayStage('failed', phases('completed', 'failed'))).toBe('draft');
    expect(replayStage('needs_attention', phases('completed', 'failed'))).toBe('draft');
  });

  it('restarts both stages for needs_attention with no failed stage', () => {
    expect(replayStage('needs_attention', phases('completed', 'completed'))).toBe('triage');
  });

  it('has nothing to resume for a failed ticket whose stages all completed', () => {
    expect(replayStage('failed', phases('completed', 'completed'))).toBeNull();
  });

  it('is not offered for tickets that are not waiting on a person', () => {
    for (const status of ['queued', 'processing', 'completed'] as const) {
      expect(replayStage(status, phases('completed', 'completed'))).toBeNull();
    }
  });
});

describe('stateReason', () => {
  const at = (status: OpsTicketDetail['status'], failureReason: string | null, ph = phases('completed', 'completed')) =>
    stateReason({ status, failureReason, phases: ph });

  it('names why a ticket failed', () => {
    expect(at('failed', 'draft_retries_exhausted')).toBe('Draft retries exhausted');
    expect(at('failed', 'something_new')).toBe('Processing gave up');
    expect(at('failed', null)).toBe('Processing gave up');
  });

  it('names the stage whose output was invalid', () => {
    expect(at('needs_attention', null, phases('failed', 'pending'))).toBe('Triage output invalid');
    expect(at('needs_attention', null, phases('completed', 'failed'))).toBe('Draft output invalid');
    expect(at('needs_attention', null)).toBe('Needs review');
  });

  it('has no reason for a healthy ticket', () => {
    expect(at('completed', null)).toBeNull();
    expect(at('processing', null)).toBeNull();
  });
});

describe('groupTimeline', () => {
  const e = (event: string, detail: string | null, t: string) => ({ event, detail, occurredAt: t });

  it('collapses consecutive identical events and keeps the last time', () => {
    const items = groupTimeline([
      e('triage.completed', null, '1'),
      e('draft.invalid', 'bad', '2'),
      e('draft.invalid', 'bad', '3'),
      e('draft.invalid', 'bad', '4'),
      e('ticket.needs_attention', null, '5'),
    ]);
    expect(items.map((i) => [i.event, i.count, i.occurredAt])).toEqual([
      ['triage.completed', 1, '1'],
      ['draft.invalid', 3, '4'],
      ['ticket.needs_attention', 1, '5'],
    ]);
  });

  it('keeps the same event apart when its detail differs or something sits between', () => {
    const items = groupTimeline([e('x', 'a', '1'), e('x', 'b', '2'), e('y', null, '3'), e('x', 'b', '4')]);
    expect(items.map((i) => i.count)).toEqual([1, 1, 1, 1]);
  });

  it('copes with no events', () => {
    expect(groupTimeline([])).toEqual([]);
  });
});

describe('humanize', () => {
  it('reads like a label', () => {
    expect(humanize('billing_issue')).toBe('Billing issue');
    expect(humanize('urgent')).toBe('Urgent');
  });
});
