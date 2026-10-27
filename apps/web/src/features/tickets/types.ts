// Hand-written response shapes of the public ticket routes; see lib/types.ts for why the
// web app never imports them from the API.
import type { TicketPhaseStatus, TicketStatus } from '@/lib/types';

/** Body of a 201 from POST /api/tickets. */
export type CreateTicketResponse = {
  ticketId: string;
  referenceNumber: string;
  status: TicketStatus;
  createdAt: string;
};

/** The fields of GET /api/tickets/ref/:ref that the recent-tickets list reads. */
type TicketSummary = {
  referenceNumber: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
};

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

// ---- Email notifications (6.9) ----

type NotificationState = 'none' | 'pending' | 'confirmed' | 'sent';

/** GET /api/tickets/:id/notification. `available` is false when email is off or not offered. */
export type NotificationView = {
  available: boolean;
  state: NotificationState;
  maskedEmail?: string;
};

/** GET /api/notifications/confirm/:token. Read-only; nothing changes until the POST. */
export type ConfirmPreview = { valid: boolean; referenceNumber?: string; maskedEmail?: string };

/** Body of a 200 from POST /api/notifications/confirm. */
export type ConfirmResult = { referenceNumber: string; status: TicketStatus; maskedEmail: string };
