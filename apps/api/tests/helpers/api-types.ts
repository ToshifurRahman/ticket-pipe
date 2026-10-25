import type {
  AiInteractionSummaryRow,
  ListAiInteractionsResult,
} from '../../src/repositories/ai-interactions.js';
import type { TicketEvent } from '../../src/repositories/events.js';
import type { ListTicketsResult } from '../../src/repositories/tickets.js';
import type {
  EventPageView,
  FullTicketView,
  PublicTicketEvent,
  PublicTicketView,
} from '../../src/services/ticket-views.js';

/** What a value looks like after a JSON round trip: dates become ISO strings. */
export type Wire<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export interface CreatedTicketBody {
  ticketId: string;
  referenceNumber: string;
  createdAt: string;
}

/** `GET /api/tickets/:id` and `/ref/:ref`; `processing` must never appear, so tests probe it. */
export type PublicTicketBody = Wire<PublicTicketView> & { processing?: unknown };
export type OpsTicketBody = Wire<FullTicketView> & { processing?: unknown };
export type PublicEventsBody = Wire<EventPageView<PublicTicketEvent>>;
export type OpsEventsBody = Wire<EventPageView<TicketEvent>>;
export type OpsListBody = Wire<ListTicketsResult>;
export type AiInteractionsBody = Wire<ListAiInteractionsResult>;
export interface AiSummaryBody {
  since: string;
  until: string;
  ticketsInWindow: number;
  summary: AiInteractionSummaryRow[];
}
export interface ReplayBody {
  ticketId?: string;
  status?: string;
  previousStatus?: string;
}
export interface OpsSessionBody {
  signedIn: boolean;
  expiresAt: string;
}
export interface NotificationBody {
  state: string;
  maskedEmail: string | null;
}
export interface ConfirmPreviewBody {
  valid: boolean;
  referenceNumber?: string;
}
