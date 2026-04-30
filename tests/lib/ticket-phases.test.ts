import { describe, it, expect } from 'vitest';
import { resolveTicketPhases, resolveTicketFailureCounts, type TicketEventLike } from '../../src/lib/ticket-phases.js';

function events(...names: string[]): TicketEventLike[] {
  return names.map(event => ({ event }));
}

describe('resolveTicketPhases', () => {
  it('returns pending statuses when there are no events', () => {
    expect(resolveTicketPhases([])).toEqual({
      triage: { status: 'pending' },
      draft: { status: 'pending' },
    });
  });

  it('resolves success flow to completed for both phases', () => {
    expect(
      resolveTicketPhases(
        events(
          'triage.started',
          'triage.completed',
          'draft.started',
          'draft.completed',
          'ticket.completed'
        )
      )
    ).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'completed' },
    });
  });

  it('resolves triage failure while leaving draft pending', () => {
    expect(resolveTicketPhases(events('triage.started', 'triage.failed', 'ticket.failed'))).toEqual({
      triage: { status: 'failed' },
      draft: { status: 'pending' },
    });
  });

  it('resolves draft failure after triage completion', () => {
    expect(
      resolveTicketPhases(events('triage.started', 'triage.completed', 'draft.started', 'draft.failed'))
    ).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'failed' },
    });
  });

  it('uses latest known transition per phase and ignores unknown events', () => {
    expect(
      resolveTicketPhases(
        events(
          'triage.started',
          'something.unexpected',
          'triage.completed',
          'triage.started',
          'draft.started',
          'draft.completed',
          'ticket.failed'
        )
      )
    ).toEqual({
      triage: { status: 'processing' },
      draft: { status: 'completed' },
    });
  });
});

describe('resolveTicketFailureCounts', () => {
  it('returns zero counts for empty events', () => {
    expect(resolveTicketFailureCounts([])).toEqual({ triage: 0, draft: 0 });
  });

  it('counts each triage.failed event independently', () => {
    expect(
      resolveTicketFailureCounts(events('triage.failed', 'triage.failed'))
    ).toEqual({ triage: 2, draft: 0 });
  });

  it('counts each draft.failed event independently', () => {
    expect(
      resolveTicketFailureCounts(events('draft.failed', 'draft.failed', 'draft.failed'))
    ).toEqual({ triage: 0, draft: 3 });
  });

  it('counts both stages independently across a mixed event stream', () => {
    expect(
      resolveTicketFailureCounts(
        events(
          'triage.started',
          'triage.failed',
          'triage.started',
          'triage.completed',
          'draft.started',
          'draft.failed',
          'draft.failed'
        )
      )
    ).toEqual({ triage: 1, draft: 2 });
  });

  it('ignores non-failure events', () => {
    expect(
      resolveTicketFailureCounts(
        events('triage.started', 'triage.completed', 'draft.started', 'draft.completed', 'ticket.completed')
      )
    ).toEqual({ triage: 0, draft: 0 });
  });
});
