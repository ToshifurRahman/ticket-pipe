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
