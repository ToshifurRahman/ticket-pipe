import type { TicketDetail } from './types';

// What the ticket page shows, worked out from the public view only. The API decides the
// phases; this only picks which of the customer-facing states they mean.

export type TriageBadges = { category: string; priority: string };

export type SupportSide =
  /** Still being handled. `badges` appear as soon as triage has finished. */
  | { kind: 'working'; stage: 'reviewing' | 'writing'; badges: TriageBadges | null }
  | { kind: 'replied'; reply: string; badges: TriageBadges | null; repliedAt: string | null }
  /** failed or needs_attention: one neutral message, never a reason. */
  | { kind: 'on-hold'; badges: TriageBadges | null };

export function supportSide(ticket: TicketDetail): SupportSide {
  const { status, phases } = ticket;
  const badges = phases.triage.status === 'completed' && phases.triage.output ? phases.triage.output : null;

  if (status === 'failed' || status === 'needs_attention') return { kind: 'on-hold', badges };

  if (status === 'completed' && phases.draft.output) {
    const done = [...ticket.events].reverse().find((e) => e.event === 'ticket.completed');
    return { kind: 'replied', reply: phases.draft.output.customerReply, badges, repliedAt: done?.occurredAt ?? null };
  }

  // queued or processing. A triage retry still reads "Reviewing": the customer never sees one.
  return { kind: 'working', stage: badges ? 'writing' : 'reviewing', badges };
}

export type PlyState = 'done' | 'live' | 'waiting' | 'on-hold';
export type PlyKey = 'received' | 'triage' | 'draft' | 'reply';
/** One cell of the form's ply stack. `time` is an ISO timestamp, set once the stage landed. */
export type Ply = { n: 1 | 2 | 3 | 4; key: PlyKey; label: string; state: PlyState; time: string | null };

// waiting / live / done wording per stage.
const PLY_LABELS: Record<PlyKey, [waiting: string, live: string, done: string]> = {
  received: ['Received', 'Received', 'Received'],
  triage: ['Triage', 'Triaging', 'Triaged'],
  draft: ['Draft', 'Drafting', 'Drafted'],
  reply: ['Reply', 'Reply', 'Replied'],
};

const HOLD_EVENTS = ['ticket.failed', 'ticket.needs_attention'];

/** The latest event of a type: a requeue replays stages, so the newest one is what counts. */
export function latestEventTime(ticket: Pick<TicketDetail, 'events'>, ...names: string[]): string | null {
  let latest: string | null = null;
  for (const e of ticket.events) {
    if (names.includes(e.event) && (!latest || e.occurredAt > latest)) latest = e.occurredAt;
  }
  return latest;
}

/** When the ticket was put on hold, or null if it is not. */
export function onHoldTime(ticket: Pick<TicketDetail, 'events' | 'status'>): string | null {
  const held = ticket.status === 'failed' || ticket.status === 'needs_attention';
  return held ? latestEventTime(ticket, ...HOLD_EVENTS) : null;
}

/**
 * Received, Triage, Draft, Reply. The first unfinished stage is live while the pipeline works.
 * When the team has the ticket the first three plies read done and Reply is on hold, as the
 * Relay Full Demo draws it; nothing is live. Reply is never live.
 */
export function ticketPlies(ticket: TicketDetail): Ply[] {
  const { status, phases } = ticket;
  const working = status === 'queued' || status === 'processing';
  const held = status === 'failed' || status === 'needs_attention';
  const done = held
    ? [true, true, true, false]
    : [true, phases.triage.status === 'completed', phases.draft.status === 'completed', status === 'completed'];
  const firstOpen = done.indexOf(false);
  const times = [
    ticket.createdAt,
    latestEventTime(ticket, 'triage.completed'),
    latestEventTime(ticket, 'draft.completed'),
    latestEventTime(ticket, 'ticket.completed'),
  ];
  const keys: PlyKey[] = ['received', 'triage', 'draft', 'reply'];

  return keys.map((key, i) => {
    const state: PlyState = done[i] ? 'done' : held ? 'on-hold' : i === firstOpen && i < 3 && working ? 'live' : 'waiting';
    const [waiting, live, finished] = PLY_LABELS[key];
    return {
      n: (i + 1) as Ply['n'],
      key,
      state,
      label: state === 'on-hold' ? 'On hold' : state === 'done' ? finished : state === 'live' ? live : waiting,
      time: state === 'done' ? times[i] : state === 'on-hold' ? onHoldTime(ticket) : null,
    };
  });
}

/** "billing_issue" → "Billing issue". Category is free text from the model. */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
