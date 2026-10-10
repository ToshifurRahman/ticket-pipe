import { describe, expect, it } from 'vitest';
import { ticketAt } from '@/test/ticket-fixtures';
import { humanize, supportSide, ticketSteps } from './ticket-thread';

const states = (ticket: Parameters<typeof ticketSteps>[0]) => ticketSteps(ticket).map((s) => s.state);

describe('supportSide', () => {
  it('reviews until triage finishes, then writes with badges', () => {
    expect(supportSide(ticketAt('queued'))).toEqual({ kind: 'working', stage: 'reviewing', badges: null });
    expect(supportSide(ticketAt('writing'))).toEqual({
      kind: 'working',
      stage: 'writing',
      badges: { category: 'billing', priority: 'high' },
    });
  });

  it('keeps reviewing through a triage retry', () => {
    const retrying = ticketAt('reviewing', {
      phases: { triage: { status: 'failed' }, draft: { status: 'pending' } },
    });
    expect(supportSide(retrying)).toMatchObject({ kind: 'working', stage: 'reviewing' });
  });

  it('gives the reply with its badges once completed', () => {
    expect(supportSide(ticketAt('replied'))).toMatchObject({
      kind: 'replied',
      reply: 'We refunded the duplicate charge.',
      badges: { category: 'billing', priority: 'high' },
    });
  });

  it('shows failed and needs_attention the same way, with nothing else', () => {
    expect(supportSide(ticketAt('failed'))).toEqual({ kind: 'with-team' });
    expect(supportSide(ticketAt('needs_attention'))).toEqual({ kind: 'with-team' });
  });
});

describe('ticketSteps', () => {
  it('marks the first open step active while working', () => {
    expect(states(ticketAt('queued'))).toEqual(['done', 'active', 'idle', 'idle']);
    expect(states(ticketAt('writing'))).toEqual(['done', 'done', 'active', 'idle']);
    expect(states(ticketAt('replied'))).toEqual(['done', 'done', 'done', 'done']);
  });

  it('freezes with no active step while the team has it', () => {
    expect(states(ticketAt('failed'))).toEqual(['done', 'done', 'idle', 'idle']);
  });
});

describe('humanize', () => {
  it('turns model labels into words', () => {
    expect(humanize('billing_issue')).toBe('Billing issue');
    expect(humanize('account-access')).toBe('Account access');
  });
});
