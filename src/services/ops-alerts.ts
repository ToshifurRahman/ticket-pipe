import { PublishCommand } from '@aws-sdk/client-sns';
import { getSnsClient, type SnsTarget } from '../lib/sns.js';
import { logger } from '../lib/logger.js';
import type { OpsNeedsAttention } from './ops-feed.js';

// Ops email alerts (story 5.7), sent through SNS when a ticket newly enters needs_attention.
//
// Same privacy boundary as the ops feed (story 4.5): an alert is built field by field from
// OpsNeedsAttention, so it holds the reference number, ticket id, a fixed reason code and a
// time, and nothing else. Never add the subject, description, AI output or error text.
// This is the only module allowed to publish to SNS (tests/ops-alerts.guard.test.ts).

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_MAX_PER_HOUR = 20;

export interface AlertMessage {
  subject: string;
  message: string;
}

export function buildAlertMessage(alert: OpsNeedsAttention): AlertMessage {
  const { referenceNumber, ticketId, reason } = alert;
  return {
    subject: `[Ticket Pipe] ${referenceNumber} needs attention (${reason})`,
    message: [
      `Ticket ${referenceNumber} needs attention.`,
      '',
      `Reference: ${referenceNumber}`,
      `Ticket ID: ${ticketId}`,
      `Reason:    ${reason}`,
      `Time:      ${alert.occurredAt.toISOString()}`,
      '',
      `Replay it from the ops console (or POST /api/tickets/${ticketId}/replay with an ops session) once the cause is fixed.`,
    ].join('\n'),
  };
}

export interface AlerterOptions {
  // Called on every alert; null means alerts are off.
  sns: () => SnsTarget | null;
  maxPerHour: number;
  now?: () => number;
}

export interface NeedsAttentionAlerter {
  alert(alert: OpsNeedsAttention): void;
  // Settles once every publish started so far has finished. For tests only.
  pending(): Promise<void>;
}

// Fire and forget: alert() returns at once, and a failed or slow publish is only logged, so
// it can never fail or delay ticket processing.
//
// The hourly cap keeps a bad AI provider day from flooding the inbox or using up SNS's free
// email allowance. It is a fixed window counted in memory, so it is per process: two workers
// allow twice as many, and a restart starts a fresh window. Over the cap, alerts are dropped
// (the ticket and the ops feed still have the event) and one warning is logged per window.
export function createNeedsAttentionAlerter({
  sns,
  maxPerHour,
  now = Date.now,
}: AlerterOptions): NeedsAttentionAlerter {
  let windowStart = now();
  let sentInWindow = 0;
  let warnedInWindow = false;
  const inFlight = new Set<Promise<void>>();

  function alert(alert: OpsNeedsAttention): void {
    const { ticketId } = alert;
    try {
      const target = sns();
      if (!target) return;

      const time = now();
      if (time - windowStart >= HOUR_MS) {
        windowStart = time;
        sentInWindow = 0;
        warnedInWindow = false;
      }
      if (sentInWindow >= maxPerHour) {
        if (!warnedInWindow) {
          warnedInWindow = true;
          logger.warn({ ticketId, maxPerHour }, 'Ops alert cap reached; dropping alerts for the rest of the hour');
        } else {
          logger.debug({ ticketId }, 'Ops alert dropped (hourly cap)');
        }
        return;
      }
      // Counted before publishing, so failed publishes still use up the allowance.
      sentInWindow++;

      const { subject, message } = buildAlertMessage(alert);
      const publish: Promise<void> = target.client
        .send(new PublishCommand({ TopicArn: target.topicArn, Subject: subject, Message: message }))
        .then(
          () => logger.info({ ticketId }, 'Ops alert sent'),
          (err) => logger.error({ err, ticketId }, 'Failed to send ops alert')
        )
        .finally(() => inFlight.delete(publish));
      inFlight.add(publish);
    } catch (err) {
      logger.error({ err, ticketId }, 'Failed to send ops alert');
    }
  }

  return {
    alert,
    pending: async () => {
      await Promise.all(inFlight);
    },
  };
}

function parseMaxPerHour(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_MAX_PER_HOUR;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  logger.warn({ value }, `Invalid SNS_ALERT_MAX_PER_HOUR; using ${DEFAULT_MAX_PER_HOUR}`);
  return DEFAULT_MAX_PER_HOUR;
}

const defaultAlerter = createNeedsAttentionAlerter({
  sns: getSnsClient,
  maxPerHour: parseMaxPerHour(process.env.SNS_ALERT_MAX_PER_HOUR),
});

export function alertNeedsAttention(alert: OpsNeedsAttention): void {
  defaultAlerter.alert(alert);
}

// For tests: wait for alerts the worker started without awaiting.
export function pendingAlerts(): Promise<void> {
  return defaultAlerter.pending();
}
