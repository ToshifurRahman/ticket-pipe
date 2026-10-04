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

export function resolveTicketPhases(events: ReadonlyArray<TicketEventLike>): TicketPhases {
  const phases: TicketPhases = {
    triage: { status: 'pending' },
    draft: { status: 'pending' },
  };

  for (const { event } of events) {
    const transition = PHASE_TRANSITIONS[event as keyof typeof PHASE_TRANSITIONS];
    if (!transition) continue;
    phases[transition.phase].status = transition.status;
  }

  return phases;
}

export interface TicketFailureCounts {
  triage: number;
  draft: number;
}

// Only failures since the last replay count: a replayed ticket gets a fresh set of attempts.
export function resolveTicketFailureCounts(events: ReadonlyArray<TicketEventLike>): TicketFailureCounts {
  const counts: TicketFailureCounts = { triage: 0, draft: 0 };
  for (const { event } of events) {
    if (event === 'ticket.requeued') {
      counts.triage = 0;
      counts.draft = 0;
    }
    if (event === 'triage.failed') counts.triage++;
    else if (event === 'draft.failed') counts.draft++;
  }
  return counts;
}
