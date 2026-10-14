import type { OpsTicketDetail, TicketStatus } from './types';

export const TICKET_STATUSES_FOR_TABS = ['needs_attention', 'failed', 'completed'] as const;

export const STATUS_LABELS: Record<TicketStatus, string> = {
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  needs_attention: 'Needs attention',
};

const FAILURE_REASONS: Record<string, string> = {
  triage_retries_exhausted: 'Triage retries exhausted',
  draft_retries_exhausted: 'Draft retries exhausted',
  finalize_failed: 'Could not save the finished reply',
  processing_error: 'Processing kept erroring',
};

/** "billing_issue" → "Billing issue". Category and priority are free text from the model. */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Phases = OpsTicketDetail['phases'];
export type ReplayStage = 'triage' | 'draft' | null;

/**
 * Where a replay picks up. The API resets the first stage that did not complete and
 * everything after it; a needs_attention ticket with no failed stage resets both.
 */
export function replayStage(status: TicketStatus, phases: Phases): ReplayStage {
  if (status !== 'failed' && status !== 'needs_attention') return null;
  if (phases.triage.status !== 'completed') return 'triage';
  if (phases.draft.status !== 'completed') return 'draft';
  return status === 'needs_attention' ? 'triage' : null;
}

/** Why a ticket is waiting on a person, in words. Null when it is not. */
export function stateReason(ticket: Pick<OpsTicketDetail, 'status' | 'failureReason' | 'phases'>): string | null {
  if (ticket.status === 'failed') {
    return (ticket.failureReason && FAILURE_REASONS[ticket.failureReason]) || 'Processing gave up';
  }
  if (ticket.status === 'needs_attention') {
    if (ticket.phases.triage.status === 'failed') return 'Triage output invalid';
    if (ticket.phases.draft.status === 'failed') return 'Draft output invalid';
    return 'Needs review';
  }
  return null;
}

export type TimelineItem = { event: string; detail: string | null; occurredAt: string; count: number };

/** Consecutive identical events (the same name and detail) collapse into one "×N" row. */
export function groupTimeline(events: { event: string; detail: string | null; occurredAt: string }[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const e of events) {
    const last = out.at(-1);
    if (last && last.event === e.event && last.detail === e.detail) {
      last.count += 1;
      last.occurredAt = e.occurredAt;
    } else {
      out.push({ ...e, count: 1 });
    }
  }
  return out;
}
