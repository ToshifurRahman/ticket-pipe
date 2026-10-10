import type { TicketDetail } from './types';

// What the ticket page shows, worked out from the public view only. The API decides the
// phases; this only picks which of the customer-facing states they mean.

export type TriageBadges = { category: string; priority: string };

export type SupportSide =
  /** Still being handled. `badges` appear as soon as triage has finished. */
  | { kind: 'working'; stage: 'reviewing' | 'writing'; badges: TriageBadges | null }
  | { kind: 'replied'; reply: string; badges: TriageBadges | null; repliedAt: string | null }
  /** failed or needs_attention: one neutral message, never a reason, never badges. */
  | { kind: 'with-team' };

export function supportSide(ticket: TicketDetail): SupportSide {
  const { status, phases } = ticket;
  const badges = phases.triage.status === 'completed' && phases.triage.output ? phases.triage.output : null;

  if (status === 'failed' || status === 'needs_attention') return { kind: 'with-team' };

  if (status === 'completed' && phases.draft.output) {
    const done = [...ticket.events].reverse().find((e) => e.event === 'ticket.completed');
    return { kind: 'replied', reply: phases.draft.output.customerReply, badges, repliedAt: done?.occurredAt ?? null };
  }

  // queued or processing. A triage retry still reads "Reviewing": the customer never sees one.
  return { kind: 'working', stage: badges ? 'writing' : 'reviewing', badges };
}

export type StepState = 'done' | 'active' | 'idle';
export type Step = { label: string; state: StepState };

const STEP_LABELS = ['Received', 'Triaged', 'Drafted', 'Replied'] as const;

/**
 * Received → Triaged → Drafted → Replied. While a ticket is with the team, finished steps
 * stay checked and nothing is active: the stepper never shows which stage went wrong.
 */
export function ticketSteps(ticket: TicketDetail): Step[] {
  const { status, phases } = ticket;
  const done = [
    true,
    phases.triage.status === 'completed',
    phases.draft.status === 'completed',
    status === 'completed',
  ];
  const working = status === 'queued' || status === 'processing';
  const firstOpen = done.indexOf(false);

  return STEP_LABELS.map((label, i) => ({
    label,
    state: done[i] ? 'done' : working && i === firstOpen ? 'active' : 'idle',
  }));
}

/** "billing_issue" → "Billing issue". Category is free text from the model. */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
