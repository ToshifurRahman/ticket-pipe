// Hand-written response shapes of the staff-only ops routes; see lib/types.ts for why the
// web app never imports them from the API.
import type { TicketPhaseStatus, TicketStatus } from '@/lib/types';

export type OpsSession = { signedIn: boolean; expiresAt?: string };

/** One row of GET /api/tickets, which only ops can call. */
export type OpsListedTicket = {
  id: string;
  referenceNumber: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  /** The time of the ticket's latest event. */
  updatedAt: string;
  /** Null until triage has finished. */
  category: string | null;
  priority: string | null;
  failureReason: string | null;
  failedAt: string | null;
};

export type OpsTicketList = {
  tickets: OpsListedTicket[];
  total: number;
  page: number;
  limit: number;
  /** Per status across the whole table; a status with no tickets is absent. */
  counts: Partial<Record<TicketStatus, number>>;
};

type OpsTriageOutput = {
  category: string;
  priority: string;
  sentiment: string;
  escalate: boolean;
  recommendedTeam: string;
  issueSummary: string;
};

type OpsDraftOutput = { customerReply: string; internalNote: string; nextActions: string[] };

type OpsTicketEvent = { event: string; detail: string | null; occurredAt: string };

/** GET /api/ops/tickets/:id: the full view, with every stage output and the failure reason. */
export type OpsTicketDetail = {
  id: string;
  referenceNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  createdAt: string;
  failureReason: string | null;
  failedAt: string | null;
  phases: {
    triage: { status: TicketPhaseStatus; output?: OpsTriageOutput };
    draft: { status: TicketPhaseStatus; output?: OpsDraftOutput };
  };
};

export type OpsEventPage = { events: OpsTicketEvent[]; nextCursor: string | null };

type AiProvider = 'primary' | 'backup';

export type AiInteraction = {
  id: string;
  ticketId: string;
  operation: 'triage' | 'draft';
  provider: AiProvider;
  model: string;
  outcome: string;
  durationMs: number;
  createdAt: string;
};

export type AiSummaryRow = {
  operation: 'triage' | 'draft';
  provider: AiProvider;
  count: number;
  successCount: number;
  avgDurationMs: number;
};

export type OpsSummary = {
  since: string;
  until: string;
  ticketsInWindow: number;
  summary: AiSummaryRow[];
};

/** Body of a 200 from POST /api/tickets/:id/replay. */
export type ReplayResponse = { success: true; status: 'queued'; previousStatus: TicketStatus };
