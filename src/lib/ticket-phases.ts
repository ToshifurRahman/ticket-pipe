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
  // The stage ran but its output was unusable. Not a retryable error, so it is not counted by
  // resolveTicketFailureCounts.
  'triage.invalid': { phase: 'triage', status: 'failed' },
  'draft.invalid': { phase: 'draft', status: 'failed' },
} satisfies Record<string, { phase: PhaseName; status: TicketPhaseStatus }>;

// Pipeline order: a stage's output feeds every stage after it.
const PHASE_ORDER = ['triage', 'draft'] as const satisfies ReadonlyArray<PhaseName>;

// A replay (`ticket.requeued`) is a new attempt that continues from where the ticket stopped: the
// first failed stage (`*.failed` or `*.invalid`) and every stage after it start over, because later
// stages were built on its output. Earlier completed stages are kept.
// A `ticket.needs_attention` with no `*.invalid` marker (recorded before the markers existed, or a
// missing processing result) can't say which stage was bad, so both start over.
// `ticket.requeue_failed` means the replay was rolled back, so the state from before it comes back.
export function resolveTicketPhases(events: ReadonlyArray<TicketEventLike>): TicketPhases {
  let phases: TicketPhases = {
    triage: { status: 'pending' },
    draft: { status: 'pending' },
  };
  let lastTerminal: 'ticket.failed' | 'ticket.needs_attention' | null = null;
  let sawInvalid = false;
  let beforeRequeue: { phases: TicketPhases; sawInvalid: boolean } | null = null;

  for (const { event } of events) {
    if (event === 'ticket.failed' || event === 'ticket.needs_attention') {
      lastTerminal = event;
      continue;
    }
    if (event === 'ticket.requeued') {
      beforeRequeue = { phases: clonePhases(phases), sawInvalid };
      let resetting = lastTerminal === 'ticket.needs_attention' && !sawInvalid;
      for (const name of PHASE_ORDER) {
        if (phases[name].status === 'failed') resetting = true;
        if (resetting) phases[name] = { status: 'pending' };
      }
      sawInvalid = false;
      continue;
    }
    if (event === 'ticket.requeue_failed') {
      if (beforeRequeue) ({ phases, sawInvalid } = beforeRequeue);
      beforeRequeue = null;
      continue;
    }
    if (event === 'triage.invalid' || event === 'draft.invalid') sawInvalid = true;
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
