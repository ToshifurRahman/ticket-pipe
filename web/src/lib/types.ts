// Hand-written response shapes. The web app never imports from ../src: the API's internal
// fields must not look public, and the packages stay independent. Each story adds the
// shapes it needs, next to its MSW handlers.

/** Body of a 400 from the API: `{ errors: { field: message } }`. */
export type FieldErrors = Record<string, string>;

export type TicketStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'needs_attention';

/** Body of a 201 from POST /api/tickets. */
export type CreateTicketResponse = {
  ticketId: string;
  referenceNumber: string;
  status: TicketStatus;
  createdAt: string;
};

/** The fields of GET /api/tickets/ref/:ref that the recent-tickets list reads. */
export type TicketSummary = {
  referenceNumber: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
};

export type TicketPhaseStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Body of GET /api/tickets/ref/:ref: the public view. It never carries internal AI output or
 * failure reasons; those are on the ops routes.
 */
export type TicketDetail = TicketSummary & {
  id: string;
  description: string;
  events: { event: string; occurredAt: string }[];
  eventsNextCursor: string | null;
  phases: {
    triage: { status: TicketPhaseStatus; output?: { category: string; priority: string } };
    draft: { status: TicketPhaseStatus; output?: { customerReply: string } };
  };
};

// ---- Ops console (6.6). Everything below comes from staff-only routes. ----

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

export type OpsTriageOutput = {
  category: string;
  priority: string;
  sentiment: string;
  escalate: boolean;
  recommendedTeam: string;
  issueSummary: string;
};

export type OpsDraftOutput = { customerReply: string; internalNote: string; nextActions: string[] };

export type OpsTicketEvent = { event: string; detail: string | null; occurredAt: string };

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

export type AiProvider = 'primary' | 'backup';

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

export type OpsSummary = { since: string; until: string; ticketsInWindow: number; summary: AiSummaryRow[] };

/** Body of a 200 from POST /api/tickets/:id/replay. */
export type ReplayResponse = { success: true; status: 'queued'; previousStatus: TicketStatus };
