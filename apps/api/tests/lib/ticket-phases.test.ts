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

describe('resolveTicketFailureCounts — replay', () => {
  it('counts only failures since the last ticket.requeued', () => {
    expect(
      resolveTicketFailureCounts(
        events('triage.failed', 'triage.failed', 'triage.failed', 'ticket.failed', 'ticket.requeued', 'triage.failed')
      )
    ).toEqual({ triage: 1, draft: 0 });
  });

  it('resets both stages on a replay', () => {
    expect(
      resolveTicketFailureCounts(events('triage.failed', 'draft.failed', 'ticket.requeued'))
    ).toEqual({ triage: 0, draft: 0 });
  });
});

describe('resolveTicketPhases — replay (story 5.4)', () => {
  const draftFailed = events(
    'triage.started', 'triage.completed',
    'draft.started', 'draft.failed', 'draft.started', 'draft.failed', 'draft.started', 'draft.failed',
    'ticket.failed'
  );
  const needsAttention = events(
    'triage.started', 'triage.completed', 'draft.started', 'draft.completed', 'ticket.needs_attention'
  );

  it('after ticket.failed, resets only the failed phase and keeps completed ones', () => {
    expect(resolveTicketPhases([...draftFailed, ...events('ticket.requeued')])).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'pending' },
    });
  });

  it('after a ticket.needs_attention with no *.invalid marker, resets both phases', () => {
    expect(resolveTicketPhases([...needsAttention, ...events('ticket.requeued')])).toEqual({
      triage: { status: 'pending' },
      draft: { status: 'pending' },
    });
  });

  it('tracks the new attempt after the reset', () => {
    expect(
      resolveTicketPhases([...needsAttention, ...events('ticket.requeued', 'triage.started', 'triage.completed')])
    ).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'pending' },
    });
  });

  it('restores the earlier phases when the replay is rolled back', () => {
    expect(resolveTicketPhases([...draftFailed, ...events('ticket.requeued', 'ticket.requeue_failed')])).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'failed' },
    });
  });

  it('uses the most recent ending: a needs_attention ticket that later failed only resumes', () => {
    expect(
      resolveTicketPhases([
        ...needsAttention,
        ...events('ticket.requeued', 'triage.started', 'triage.completed', 'draft.started', 'draft.failed', 'ticket.failed', 'ticket.requeued'),
      ])
    ).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'pending' },
    });
  });
});

describe('resolveTicketPhases — resume from the first bad stage', () => {
  const draftInvalid = events(
    'triage.started', 'triage.completed', 'draft.started', 'draft.invalid', 'ticket.needs_attention'
  );
  const triageInvalid = events('triage.started', 'triage.invalid', 'ticket.needs_attention');

  it('shows the invalid stage as failed', () => {
    expect(resolveTicketPhases(draftInvalid)).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'failed' },
    });
  });

  it('after an invalid draft, keeps the completed triage and resets only the draft', () => {
    expect(resolveTicketPhases([...draftInvalid, ...events('ticket.requeued')])).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'pending' },
    });
  });

  it('after an invalid triage, resets both stages', () => {
    expect(resolveTicketPhases([...triageInvalid, ...events('ticket.requeued')])).toEqual({
      triage: { status: 'pending' },
      draft: { status: 'pending' },
    });
  });

  it('after a failed triage, resets every stage from triage onward', () => {
    expect(
      resolveTicketPhases(events('triage.started', 'triage.failed', 'ticket.failed', 'ticket.requeued'))
    ).toEqual({
      triage: { status: 'pending' },
      draft: { status: 'pending' },
    });
  });

  it('keeps the marker across a rolled-back replay', () => {
    expect(
      resolveTicketPhases([...draftInvalid, ...events('ticket.requeued', 'ticket.requeue_failed', 'ticket.requeued')])
    ).toEqual({
      triage: { status: 'completed' },
      draft: { status: 'pending' },
    });
  });

  it('does not let a marker from an earlier attempt apply to a later unmarked needs_attention', () => {
    expect(
      resolveTicketPhases([
        ...draftInvalid,
        ...events('ticket.requeued', 'draft.started', 'draft.completed', 'ticket.needs_attention', 'ticket.requeued'),
      ])
    ).toEqual({
      triage: { status: 'pending' },
      draft: { status: 'pending' },
    });
  });

  it('does not count *.invalid as a failure', () => {
    expect(resolveTicketFailureCounts([...triageInvalid, ...draftInvalid])).toEqual({ triage: 0, draft: 0 });
  });
});

describe('resolveTicketFailureCounts — rolled-back replay (story 5.4)', () => {
  it('brings the earlier counts back on ticket.requeue_failed', () => {
    expect(
      resolveTicketFailureCounts(
        events('draft.failed', 'draft.failed', 'draft.failed', 'ticket.failed', 'ticket.requeued', 'ticket.requeue_failed')
      )
    ).toEqual({ triage: 0, draft: 3 });
  });

  it('starts fresh again on the next successful replay', () => {
    expect(
      resolveTicketFailureCounts(
        events('draft.failed', 'draft.failed', 'ticket.failed', 'ticket.requeued', 'ticket.requeue_failed', 'ticket.requeued')
      )
    ).toEqual({ triage: 0, draft: 0 });
  });
});
