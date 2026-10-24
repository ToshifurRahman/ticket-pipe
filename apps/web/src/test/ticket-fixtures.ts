import type { TicketDetail } from '@/lib/types';

export const TICKET_REF = 'TICK-1759993412345-A1B2C3D4';
export const TICKET_ID = '6f1c2a9e-0b5d-4c1e-9a37-2f8d5b6e7c10';

type Stage = 'queued' | 'reviewing' | 'writing' | 'replied' | 'failed' | 'needs_attention';

/** The public view of one ticket at a given point in its life. */
export function ticketAt(stage: Stage, overrides: Partial<TicketDetail> = {}): TicketDetail {
  const triaged = { status: 'completed' as const, output: { category: 'billing', priority: 'high' } };
  const phases: Record<Stage, TicketDetail['phases']> = {
    queued: { triage: { status: 'pending' }, draft: { status: 'pending' } },
    reviewing: { triage: { status: 'processing' }, draft: { status: 'pending' } },
    writing: { triage: triaged, draft: { status: 'processing' } },
    replied: {
      triage: triaged,
      draft: { status: 'completed', output: { customerReply: 'We refunded the duplicate charge.' } },
    },
    failed: { triage: triaged, draft: { status: 'failed' } },
    needs_attention: { triage: triaged, draft: { status: 'failed' } },
  };
  const status: Record<Stage, TicketDetail['status']> = {
    queued: 'queued',
    reviewing: 'processing',
    writing: 'processing',
    replied: 'completed',
    failed: 'failed',
    needs_attention: 'needs_attention',
  };
  return {
    id: TICKET_ID,
    referenceNumber: TICKET_REF,
    subject: 'Charged twice in March',
    description: 'My card was charged twice for the March invoice.',
    status: status[stage],
    createdAt: new Date().toISOString(),
    events: stage === 'replied' ? [{ event: 'ticket.completed', occurredAt: new Date().toISOString() }] : [],
    eventsNextCursor: null,
    phases: phases[stage],
    ...overrides,
  };
}
