import { describe, expect, it } from 'vitest';
import { ticketAt } from '@/test/ticket-fixtures';
import { humanize, onHoldTime, supportSide, ticketPlies } from './ticket-thread';

const states = (ticket: Parameters<typeof ticketPlies>[0]) => ticketPlies(ticket).map((p) => p.state);

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

  it('shows failed and needs_attention the same way, with the triage badges', () => {
    const badges = { category: 'billing', priority: 'high' };
    expect(supportSide(ticketAt('failed'))).toEqual({ kind: 'on-hold', badges });
    expect(supportSide(ticketAt('needs_attention'))).toEqual({ kind: 'on-hold', badges });
  });
});

describe('ticketPlies', () => {
  it('makes the first open ply live while working', () => {
    expect(states(ticketAt('queued'))).toEqual(['done', 'live', 'waiting', 'waiting']);
    expect(states(ticketAt('writing'))).toEqual(['done', 'done', 'live', 'waiting']);
    expect(states(ticketAt('replied'))).toEqual(['done', 'done', 'done', 'done']);
  });

  it('puts the stopped ply on hold with nothing live', () => {
    expect(states(ticketAt('failed'))).toEqual(['done', 'done', 'on-hold', 'waiting']);
    expect(states(ticketAt('needs_attention'))).toEqual(['done', 'done', 'on-hold', 'waiting']);
    const atTriage = ticketAt('failed', { phases: { triage: { status: 'failed' }, draft: { status: 'pending' } } });
    expect(states(atTriage)).toEqual(['done', 'on-hold', 'waiting', 'waiting']);
  });

  it('goes live again after a requeue', () => {
    expect(states(ticketAt('writing', { status: 'queued' }))).toEqual(['done', 'done', 'live', 'waiting']);
  });

  it('words each stage by its state', () => {
    const labels = (stage: Parameters<typeof ticketAt>[0]) => ticketPlies(ticketAt(stage)).map((p) => p.label);
    expect(labels('reviewing')).toEqual(['Received', 'Triaging', 'Draft', 'Reply']);
    expect(labels('writing')).toEqual(['Received', 'Triaged', 'Drafting', 'Reply']);
    expect(labels('replied')).toEqual(['Received', 'Triaged', 'Drafted', 'Replied']);
    expect(labels('failed')).toEqual(['Received', 'Triaged', 'Draft', 'Reply']);
  });

  it('times a finished ply from its latest event only', () => {
    const ticket = ticketAt('replied', {
      createdAt: '2026-01-01T10:00:00Z',
      events: [
        { event: 'draft.completed', occurredAt: '2026-01-01T10:00:09Z' },
        { event: 'triage.completed', occurredAt: '2026-01-01T10:00:04Z' },
        { event: 'draft.completed', occurredAt: '2026-01-01T10:05:00Z' },
        { event: 'ticket.completed', occurredAt: '2026-01-01T10:05:01Z' },
      ],
    });
    expect(ticketPlies(ticket).map((p) => p.time)).toEqual([
      '2026-01-01T10:00:00Z',
      '2026-01-01T10:00:04Z',
      '2026-01-01T10:05:00Z',
      '2026-01-01T10:05:01Z',
    ]);
    // A ply that is not done prints no time, even when an older event exists.
    expect(ticketPlies(ticketAt('writing', { events: ticket.events })).map((p) => p.time)[2]).toBeNull();
  });
});

describe('onHoldTime', () => {
  const events = [
    { event: 'ticket.failed', occurredAt: '2026-01-01T10:00:00Z' },
    { event: 'ticket.requeued', occurredAt: '2026-01-01T10:01:00Z' },
    { event: 'ticket.needs_attention', occurredAt: '2026-01-01T10:02:00Z' },
  ];

  it('is the latest hold event while held, and null otherwise', () => {
    expect(onHoldTime(ticketAt('needs_attention', { events }))).toBe('2026-01-01T10:02:00Z');
    expect(onHoldTime(ticketAt('writing', { events, status: 'queued' }))).toBeNull();
  });
});

describe('humanize', () => {
  it('turns model labels into words', () => {
    expect(humanize('billing_issue')).toBe('Billing issue');
    expect(humanize('account-access')).toBe('Account access');
  });
});
