/**
 * Story 5.7 — the needs_attention alerter: message content, fire-and-forget publishing,
 * failure containment and the hourly cap. SNS is a fake client here; the LocalStack round
 * trip is in ops-alerts.localstack.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { logger } from '../src/lib/logger.js';
import type { SnsTarget } from '../src/lib/sns.js';
import type { OpsNeedsAttention } from '../src/services/ops-feed.js';
import { buildAlertMessage, createNeedsAttentionAlerter } from '../src/services/ops-alerts.js';

const TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:ticket-needs-attention';
const HOUR_MS = 60 * 60 * 1000;

function needsAttention(n = 1): OpsNeedsAttention {
  return {
    ticketId: `00000000-0000-0000-0000-00000000000${n}`,
    referenceNumber: `TICK-ALERT-00${n}`,
    reason: 'incomplete_output',
    occurredAt: new Date('2026-10-08T12:34:56.000Z'),
  };
}

function fakeSns(send: (cmd: PublishCommand) => Promise<unknown> = () => Promise.resolve({})) {
  const spy = vi.fn(send);
  const target: SnsTarget = { client: { send: spy } as unknown as SNSClient, topicArn: TOPIC_ARN };
  return { send: spy, target };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildAlertMessage', () => {
  it('holds only the reference number, ticket id, reason and time', () => {
    const { subject, message } = buildAlertMessage(needsAttention());

    expect(subject).toBe('[Ticket Pipe] TICK-ALERT-001 needs attention (incomplete_output)');
    expect(message).toBe(
      [
        'Ticket TICK-ALERT-001 needs attention.',
        '',
        'Reference: TICK-ALERT-001',
        'Ticket ID: 00000000-0000-0000-0000-000000000001',
        'Reason:    incomplete_output',
        'Time:      2026-10-08T12:34:56.000Z',
        '',
        'Replay it from the ops console (or POST /api/tickets/00000000-0000-0000-0000-000000000001/replay with an ops session) once the cause is fixed.',
      ].join('\n')
    );
  });

  it('ignores fields beyond OpsNeedsAttention even if a caller passes them', () => {
    const smuggled = { ...needsAttention(), detail: 'SECRET-DETAIL' } as OpsNeedsAttention;
    const { subject, message } = buildAlertMessage(smuggled);
    expect(subject + message).not.toContain('SECRET-DETAIL');
  });
});

describe('createNeedsAttentionAlerter', () => {
  it('publishes one alert to the topic', async () => {
    const { send, target } = fakeSns();
    const alerter = createNeedsAttentionAlerter({ sns: () => target, maxPerHour: 20 });

    alerter.alert(needsAttention());
    await alerter.pending();

    expect(send).toHaveBeenCalledOnce();
    const expected = buildAlertMessage(needsAttention());
    expect(send.mock.calls[0][0].input).toEqual({
      TopicArn: TOPIC_ARN,
      Subject: expected.subject,
      Message: expected.message,
    });
  });

  it('does nothing when SNS is not configured', () => {
    const alerter = createNeedsAttentionAlerter({ sns: () => null, maxPerHour: 20 });
    expect(() => alerter.alert(needsAttention())).not.toThrow();
  });

  it('returns before the publish settles', async () => {
    const { send, target } = fakeSns(() => new Promise(() => {}));
    const alerter = createNeedsAttentionAlerter({ sns: () => target, maxPerHour: 20 });

    const returned = alerter.alert(needsAttention());

    expect(returned).toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });

  it('logs a rejected publish instead of throwing', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { target } = fakeSns(() => Promise.reject(new Error('SNS is down')));
    const alerter = createNeedsAttentionAlerter({ sns: () => target, maxPerHour: 20 });

    expect(() => alerter.alert(needsAttention())).not.toThrow();
    await alerter.pending();

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ ticketId: needsAttention().ticketId }), 'Failed to send ops alert');
  });

  it('logs a synchronous throw instead of throwing', () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { target } = fakeSns(() => {
      throw new Error('bad client');
    });
    const alerter = createNeedsAttentionAlerter({ sns: () => target, maxPerHour: 20 });

    expect(() => alerter.alert(needsAttention())).not.toThrow();
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('createNeedsAttentionAlerter — hourly cap', () => {
  it('drops alerts past the cap and warns once', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { send, target } = fakeSns();
    const alerter = createNeedsAttentionAlerter({ sns: () => target, maxPerHour: 3, now: () => 0 });

    for (let n = 1; n <= 6; n++) alerter.alert(needsAttention(n));
    await alerter.pending();

    expect(send).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('opens a fresh window after an hour', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    let time = 0;
    const { send, target } = fakeSns();
    const alerter = createNeedsAttentionAlerter({ sns: () => target, maxPerHour: 2, now: () => time });

    for (let n = 1; n <= 3; n++) alerter.alert(needsAttention(n));
    time = HOUR_MS - 1;
    alerter.alert(needsAttention(4));
    expect(send).toHaveBeenCalledTimes(2);

    time = HOUR_MS;
    for (let n = 5; n <= 7; n++) alerter.alert(needsAttention(n));
    await alerter.pending();

    expect(send).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('counts failed publishes toward the cap', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { send, target } = fakeSns(() => Promise.reject(new Error('SNS is down')));
    const alerter = createNeedsAttentionAlerter({ sns: () => target, maxPerHour: 2, now: () => 0 });

    for (let n = 1; n <= 4; n++) alerter.alert(needsAttention(n));
    await alerter.pending();

    expect(send).toHaveBeenCalledTimes(2);
  });
});
