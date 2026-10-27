import { request } from '@/lib/api';

import type {
  ConfirmPreview,
  ConfirmResult,
  CreateTicketResponse,
  NotificationView,
  TicketDetail,
} from './types';

export type CreateTicketInput = {
  subject: string;
  description: string;
  /** Cloudflare Turnstile token. The API ignores it until server-side verification (7.5). */
  turnstileToken: string;
};

export function createTicket(input: CreateTicketInput): Promise<CreateTicketResponse> {
  return request<CreateTicketResponse>('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Cached under `ticketQueryKey(ref)`, shared by the ticket page and the recent-tickets list. */
export const ticketQueryKey = (ref: string) => ['ticket-by-ref', ref] as const;

export function getTicketByRef(ref: string): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/ref/${encodeURIComponent(ref)}`);
}

// ---- Email notifications (6.9) ----

export const notificationQueryKey = (ticketId: string) =>
  ['ticket-notification', ticketId] as const;

export function getNotification(ticketId: string): Promise<NotificationView> {
  return request<NotificationView>(`/api/tickets/${encodeURIComponent(ticketId)}/notification`);
}

export function requestNotification(
  ticketId: string,
  input: { email: string; turnstileToken: string }
): Promise<NotificationView> {
  return request<NotificationView>(`/api/tickets/${encodeURIComponent(ticketId)}/notification`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function previewConfirmation(token: string): Promise<ConfirmPreview> {
  return request<ConfirmPreview>(`/api/notifications/confirm/${encodeURIComponent(token)}`);
}

export function confirmNotification(token: string): Promise<ConfirmResult> {
  return request<ConfirmResult>('/api/notifications/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
