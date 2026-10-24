import { request } from './api';
import type { CreateTicketResponse, TicketDetail } from './types';

export type CreateTicketInput = {
  subject: string;
  description: string;
  /** Cloudflare Turnstile token. The API ignores it until server-side verification (7.5). */
  turnstileToken: string;
};

export function createTicket(input: CreateTicketInput): Promise<CreateTicketResponse> {
  return request<CreateTicketResponse>('/api/tickets', { method: 'POST', body: JSON.stringify(input) });
}

/** Cached under `ticketQueryKey(ref)`, shared by the ticket page and the recent-tickets list. */
export const ticketQueryKey = (ref: string) => ['ticket-by-ref', ref] as const;

export function getTicketByRef(ref: string): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/ref/${encodeURIComponent(ref)}`);
}
