import { request } from './api';
import type { CreateTicketResponse, TicketSummary } from './types';

export type CreateTicketInput = {
  subject: string;
  description: string;
  /** Cloudflare Turnstile token. The API ignores it until server-side verification (7.5). */
  turnstileToken: string;
};

export function createTicket(input: CreateTicketInput): Promise<CreateTicketResponse> {
  return request<CreateTicketResponse>('/api/tickets', { method: 'POST', body: JSON.stringify(input) });
}

export function getTicketByRef(ref: string): Promise<TicketSummary> {
  return request<TicketSummary>(`/api/tickets/ref/${encodeURIComponent(ref)}`);
}
