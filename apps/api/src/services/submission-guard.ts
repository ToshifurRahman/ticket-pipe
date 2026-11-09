import { getConfig } from '../lib/config.js';
import { hitWithin, release } from '../lib/counters.js';
import { logger } from '../lib/logger.js';
import { verifyTurnstile } from '../lib/turnstile.js';

// The abuse-protection checks for ticket submission (story 7.5). They run in a fixed order in
// the handlers and throw a ref usable as the response body: 403 for a bad token, 429 for a
// limit or the daily cap, 503 when a dependency cannot answer. A refusal does no work.
export type RefusalStatus = 403 | 429 | 503;

export const REFUSAL_MESSAGES = {
  invalidToken: "We couldn't verify your request. Please try again.",
  ipLimit: "You've sent several tickets recently. Please try again in about an hour.",
  dailyCap: "We've reached today's limit for new tickets. Please try again tomorrow.",
  unavailable: "We can't accept new requests right now. Please try again shortly.",
} as const;

export class SubmissionRefused extends Error {
  constructor(
    readonly status: RefusalStatus,
    message: string,
    /** Set on a 429; the handler sends it as Retry-After. */
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'SubmissionRefused';
  }
}

const HOUR_SECONDS = 3600;
const DAILY_WINDOW_SECONDS = 86400 + HOUR_SECONDS;
const SECONDS_PER_DAY = 86400;

// The hour is part of the key because `hit` sets the expiry in a second command: a key left
// without a TTL blocks that address for one hour, never forever.
const hourKey = (ip: string, now: Date) => `tickets:ip:${ip}:${now.toISOString().slice(0, 13)}`;
const dayKey = (now: Date) => `tickets:day:${now.toISOString().slice(0, 10)}`;

function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

async function count(key: string, windowSeconds: number): Promise<number> {
  try {
    return await hitWithin(key, windowSeconds);
  } catch (err) {
    logger.error({ err }, 'Ticket submission counter unavailable');
    throw new SubmissionRefused(503, REFUSAL_MESSAGES.unavailable);
  }
}

/** Counts this address in the current UTC hour and refuses once it is past the limit. */
export async function checkIpLimit(ip: string, now: Date = new Date()): Promise<void> {
  const countInHour = await count(hourKey(ip, now), HOUR_SECONDS);
  if (countInHour > getConfig().TICKET_IP_HOURLY_LIMIT) {
    throw new SubmissionRefused(429, REFUSAL_MESSAGES.ipLimit, HOUR_SECONDS);
  }
}

/** Counts this ticket in the current UTC day and refuses once it is past the cap. */
export async function checkDailyCap(now: Date = new Date()): Promise<void> {
  const countToday = await count(dayKey(now), DAILY_WINDOW_SECONDS);
  if (countToday > getConfig().TICKET_DAILY_CAP) {
    throw new SubmissionRefused(
      429,
      REFUSAL_MESSAGES.dailyCap,
      Math.min(SECONDS_PER_DAY + HOUR_SECONDS, secondsUntilUtcMidnight(now))
    );
  }
}

/**
 * Gives back the daily slot counted for a submission whose insert then failed. It takes the
 * same `now` as `checkDailyCap`, so a request that crosses midnight releases the day it counted.
 * A release failure is logged and swallowed: the caller still surfaces the original error.
 */
export async function releaseDailySlot(now: Date = new Date()): Promise<void> {
  try {
    await release(dayKey(now));
  } catch (err) {
    logger.error({ err }, 'Ticket submission daily counter release failed');
  }
}

/** Maps Cloudflare's three outcomes onto the API's refusal statuses. */
export async function checkTurnstile(token: string | undefined, ip: string): Promise<void> {
  const result = await verifyTurnstile(token, ip);
  if (result === 'invalid') throw new SubmissionRefused(403, REFUSAL_MESSAGES.invalidToken);
  if (result === 'unavailable') throw new SubmissionRefused(503, REFUSAL_MESSAGES.unavailable);
}
