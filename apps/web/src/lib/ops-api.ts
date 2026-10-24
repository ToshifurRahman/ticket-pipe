import { request } from './api';
import type {
  AiInteraction,
  OpsEventPage,
  OpsSession,
  OpsSummary,
  OpsTicketDetail,
  OpsTicketList,
  ReplayResponse,
} from './types';

// Every key starts with 'ops', so one prefix marks everything the console has cached.
export const opsKeys = {
  all: ['ops'] as const,
  session: ['ops-session'] as const,
  summary: ['ops', 'summary'] as const,
  tickets: ['ops', 'tickets'] as const,
  list: (query: string) => ['ops', 'tickets', 'list', query] as const,
  ticket: (id: string) => ['ops', 'tickets', 'one', id] as const,
  events: (id: string) => ['ops', 'tickets', 'events', id] as const,
  ai: (id: string) => ['ops', 'tickets', 'ai', id] as const,
};

export const getOpsSession = () => request<OpsSession>('/api/ops/session');

export const signIn = (token: string) =>
  request<OpsSession>('/api/ops/session', { method: 'POST', body: JSON.stringify({ token }) });

export const signOut = () => request<null>('/api/ops/session', { method: 'DELETE' });

export const listTickets = (query: string) => request<OpsTicketList>(`/api/tickets?${query}`);

export const getOpsTicket = (id: string) => request<OpsTicketDetail>(`/api/ops/tickets/${id}`);

export const getOpsEvents = (id: string, after?: string) =>
  request<OpsEventPage>(`/api/ops/tickets/${id}/events${after ? `?after=${encodeURIComponent(after)}` : ''}`);

export const getOpsSummary = () => request<OpsSummary>('/api/ops/ai-interactions/summary');

export const listAiInteractions = (ticketId: string) =>
  request<{ interactions: AiInteraction[] }>(`/api/ops/ai-interactions?ticketId=${ticketId}&limit=100`);

export const replayTicket = (id: string) => request<ReplayResponse>(`/api/tickets/${id}/replay`, { method: 'POST' });
