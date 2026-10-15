import { request } from './api';
import type { ConfirmPreview, ConfirmResult, NotificationView } from './types';

export const notificationQueryKey = (ticketId: string) => ['ticket-notification', ticketId] as const;

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
  return request<ConfirmResult>('/api/notifications/confirm', { method: 'POST', body: JSON.stringify({ token }) });
}
