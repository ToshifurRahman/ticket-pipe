export type TicketPhaseStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TriageOutput {
  category: string;
  priority: string;
  sentiment: string;
  escalate: boolean;
  recommendedTeam: string;
  issueSummary: string;
}

export interface DraftOutput {
  customerReply: string;
  internalNote: string;
  nextActions: string[];
}

export interface TriagePhase {
  status: TicketPhaseStatus;
  output?: TriageOutput;
}

export interface DraftPhase {
  status: TicketPhaseStatus;
  output?: DraftOutput;
}

export interface TicketPhases {
  triage: TriagePhase;
  draft: DraftPhase;
}

export interface TicketEventLike {
  event: string;
}

type PhaseName = keyof TicketPhases;

const PHASE_TRANSITIONS = {
  'triage.started': { phase: 'triage', status: 'processing' },
  'triage.completed': { phase: 'triage', status: 'completed' },
  'triage.failed': { phase: 'triage', status: 'failed' },
  'draft.started': { phase: 'draft', status: 'processing' },
  'draft.completed': { phase: 'draft', status: 'completed' },
  'draft.failed': { phase: 'draft', status: 'failed' },
} satisfies Record<string, { phase: PhaseName; status: TicketPhaseStatus }>;

// A replay (`ticket.requeued`) is a new attempt. What it resets depends on how the ticket ended:
// - after `ticket.failed`, a stage ran out of attempts; only failed stages start over and completed
//   ones are reused (resume).
// - after `ticket.needs_attention`, both stages completed but their output was unusable, so both
//   start over; resuming would just re-validate the same output.
// `ticket.requeue_failed` means the replay was rolled back, so the state from before it comes back.
export function resolveTicketPhases(events: ReadonlyArray<TicketEventLike>): TicketPhases {
  let phases: TicketPhases = {
    triage: { status: 'pending' },
    draft: { status: 'pending' },
  };
  let lastTerminal: 'ticket.failed' | 'ticket.needs_attention' | null = null;
  let beforeRequeue: TicketPhases | null = null;

  for (const { event } of events) {
    if (event === 'ticket.failed' || event === 'ticket.needs_attention') {
      lastTerminal = event;
      continue;
    }
    if (event === 'ticket.requeued') {
      beforeRequeue = clonePhases(phases);
      for (const name of ['triage', 'draft'] as const) {
        if (lastTerminal === 'ticket.needs_attention' || phases[name].status === 'failed') {
          phases[name] = { status: 'pending' };
        }
      }
      continue;
    }
    if (event === 'ticket.requeue_failed') {
      if (beforeRequeue) phases = beforeRequeue;
      beforeRequeue = null;
      continue;
    }
    const transition = PHASE_TRANSITIONS[event as keyof typeof PHASE_TRANSITIONS];
    if (!transition) continue;
    phases[transition.phase].status = transition.status;
  }

  return phases;
}

function clonePhases(phases: TicketPhases): TicketPhases {
  return { triage: { ...phases.triage }, draft: { ...phases.draft } };
}

export interface TicketFailureCounts {
  triage: number;
  draft: number;
}

// Only failures since the last replay count: a replayed ticket gets a fresh set of attempts.
// A rolled-back replay (`ticket.requeue_failed`) brings the earlier counts back.
export function resolveTicketFailureCounts(events: ReadonlyArray<TicketEventLike>): TicketFailureCounts {
  let counts: TicketFailureCounts = { triage: 0, draft: 0 };
  let beforeRequeue: TicketFailureCounts | null = null;
  for (const { event } of events) {
    if (event === 'ticket.requeued') {
      beforeRequeue = counts;
      counts = { triage: 0, draft: 0 };
    } else if (event === 'ticket.requeue_failed') {
      if (beforeRequeue) counts = beforeRequeue;
      beforeRequeue = null;
    } else if (event === 'triage.failed') counts.triage++;
    else if (event === 'draft.failed') counts.draft++;
  }
  return counts;
}
