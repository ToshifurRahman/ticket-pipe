import { describe, it, expect } from 'vitest';
import { buildTicketCompletedPayload } from '../../src/lib/socket.js';
import type { TriageOutput, DraftOutput } from '../../src/lib/ticket-phases.js';

function triage(): TriageOutput {
  return {
    category: 'technical',
    priority: 'high',
    sentiment: 'frustrated',
    escalate: false,
    recommendedTeam: 'tech-support',
    issueSummary: 'Customer cannot log in',
  };
}

function draft(): DraftOutput {
  return {
    customerReply: 'We are looking into your login issue.',
    internalNote: 'Check auth service logs.',
    nextActions: ['Check auth logs', 'Reset session'],
  };
}

describe('buildTicketCompletedPayload', () => {
  it('builds a self-sufficient ticket.completed payload', () => {
    const payload = buildTicketCompletedPayload('ticket-123', triage(), draft());

    expect(payload.event).toBe('ticket.completed');
    expect(payload.ticketId).toBe('ticket-123');
    expect(payload.occurredAt).toBeInstanceOf(Date);
    expect(payload.triage).toEqual(triage());
    expect(payload.draft).toEqual(draft());
  });
});
