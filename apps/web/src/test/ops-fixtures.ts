import type { OpsListedTicket, OpsSummary, OpsTicketDetail, OpsTicketList, TicketStatus } from '@/lib/types';

export const OPS_ID = '3f6c0a52-1111-4222-8333-944455556666';
export const OTHER_ID = '9a1b2c3d-2222-4333-8444-a55566667777';

export const listedTicket = (overrides: Partial<OpsListedTicket> = {}): OpsListedTicket => ({
  id: OPS_ID,
  referenceNumber: 'TICK-1759993412345-A1B2C3D4',
  subject: 'Account locked after password reset',
  status: 'needs_attention',
  createdAt: '2026-10-12T14:00:00.000Z',
  updatedAt: '2026-10-12T14:02:21.000Z',
  category: 'account_access',
  priority: 'high',
  failureReason: null,
  failedAt: null,
  ...overrides,
});

export const ticketList = (
  tickets: OpsListedTicket[],
  counts: OpsTicketList['counts'] = { needs_attention: 3, failed: 2, completed: 137 },
  total = tickets.length
): OpsTicketList => ({ tickets, total, page: 1, limit: 20, counts });

export const summary = (overrides: Partial<OpsSummary> = {}): OpsSummary => ({
  since: '2026-10-11T14:00:00.000Z',
  until: '2026-10-12T14:00:00.000Z',
  ticketsInWindow: 142,
  summary: [
    { operation: 'triage', provider: 'primary', count: 190, successCount: 190, avgDurationMs: 2000 },
    { operation: 'draft', provider: 'primary', count: 10, successCount: 3, avgDurationMs: 4000 },
  ],
  ...overrides,
});

const triaged = {
  status: 'completed' as const,
  output: {
    category: 'account_access',
    priority: 'high',
    sentiment: 'frustrated',
    escalate: true,
    recommendedTeam: 'identity_and_access',
    issueSummary: 'User reset their password and now sees "account locked".',
  },
};

/** The full ops view of a ticket in the given state. */
export function opsTicket(status: TicketStatus = 'needs_attention', overrides: Partial<OpsTicketDetail> = {}): OpsTicketDetail {
  const draftDone = status === 'completed';
  return {
    id: OPS_ID,
    referenceNumber: 'TICK-1759993412345-A1B2C3D4',
    subject: 'Account locked after password reset',
    description: 'I reset my password and now every login says my account is locked.',
    status,
    createdAt: '2026-10-12T14:00:00.000Z',
    failureReason: status === 'failed' ? 'draft_retries_exhausted' : null,
    failedAt: status === 'failed' ? '2026-10-12T14:02:21.000Z' : null,
    phases: {
      triage: triaged,
      draft: draftDone
        ? {
            status: 'completed',
            output: {
              customerReply: 'We have unlocked your account.',
              internalNote: 'Lockout counter was not reset by the reset flow.',
              nextActions: ['Confirm login works', 'File a bug for the reset flow'],
            },
          }
        : { status: 'failed' },
    },
    ...overrides,
  };
}

export const events = (...names: (string | [string, string])[]) =>
  names.map((n, i) => ({
    event: Array.isArray(n) ? n[0] : n,
    detail: Array.isArray(n) ? n[1] : null,
    occurredAt: `2026-10-12T14:02:${String(10 + i).padStart(2, '0')}.000Z`,
  }));

export const aiCall = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  ticketId: OPS_ID,
  operation: 'triage',
  provider: 'primary',
  model: 'gemini-3.8-flash',
  outcome: 'success',
  durationMs: 1900,
  createdAt: '2026-10-12T14:02:08.000Z',
  ...over,
});
