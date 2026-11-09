import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const counters = vi.hoisted(() => ({ hitWithin: vi.fn(), release: vi.fn() }));
const turnstile = vi.hoisted(() => ({ verifyTurnstile: vi.fn() }));

vi.mock('../../../src/lib/counters.js', () => ({
  hitWithin: counters.hitWithin,
  release: counters.release,
}));
vi.mock('../../../src/lib/turnstile.js', () => ({
  verifyTurnstile: turnstile.verifyTurnstile,
}));

import {
  checkDailyCap,
  checkIpLimit,
  checkTurnstile,
  releaseDailySlot,
  SubmissionRefused,
} from '../../../src/services/submission-guard.js';

const IP = '203.0.113.7';
const NOW = new Date('2026-11-08T16:41:23.000Z');

const env = { ...process.env };

beforeEach(() => {
  counters.hitWithin.mockReset();
  counters.release.mockReset();
  turnstile.verifyTurnstile.mockReset();
  process.env.TICKET_IP_HOURLY_LIMIT = '15';
  process.env.TICKET_DAILY_CAP = '100';
});

afterEach(() => {
  process.env = { ...env };
});

async function refusal(promise: Promise<unknown>): Promise<SubmissionRefused> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(SubmissionRefused);
    return err as SubmissionRefused;
  }
  throw new Error('expected a refusal');
}

describe('checkIpLimit', () => {
  it('uses a UTC-hour key and a one-hour window', async () => {
    counters.hitWithin.mockResolvedValue(15);
    await expect(checkIpLimit(IP, NOW)).resolves.toBeUndefined();
    expect(counters.hitWithin).toHaveBeenCalledWith(`tickets:ip:${IP}:2026-11-08T16`, 3600);
  });

  it('refuses the first hit past the limit with a 429 and Retry-After of an hour', async () => {
    counters.hitWithin.mockResolvedValue(16);
    const err = await refusal(checkIpLimit(IP, NOW));
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(3600);
    expect(err.message).toBe(
      "You've sent several tickets recently. Please try again in about an hour."
    );
  });

  it('honours a configured limit', async () => {
    process.env.TICKET_IP_HOURLY_LIMIT = '2';
    counters.hitWithin.mockResolvedValue(3);
    expect((await refusal(checkIpLimit(IP, NOW))).status).toBe(429);
  });

  it('turns a counter failure into a 503', async () => {
    counters.hitWithin.mockRejectedValue(new Error('timed out'));
    const err = await refusal(checkIpLimit(IP, NOW));
    expect(err.status).toBe(503);
    expect(err.message).toBe("We can't accept new requests right now. Please try again shortly.");
  });
});

describe('checkDailyCap', () => {
  it('uses a UTC-day key and a window past midnight', async () => {
    counters.hitWithin.mockResolvedValue(100);
    await expect(checkDailyCap(NOW)).resolves.toBeUndefined();
    expect(counters.hitWithin).toHaveBeenCalledWith('tickets:day:2026-11-08', 86400 + 3600);
  });

  it('refuses past the cap with the seconds until the next UTC midnight', async () => {
    counters.hitWithin.mockResolvedValue(101);
    const err = await refusal(checkDailyCap(NOW));
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(7 * 3600 + 18 * 60 + 37);
    expect(err.message).toBe(
      "We've reached today's limit for new tickets. Please try again tomorrow."
    );
  });

  it('refuses the first submission when TICKET_DAILY_CAP is 0', async () => {
    process.env.TICKET_DAILY_CAP = '0';
    counters.hitWithin.mockResolvedValue(1);
    expect((await refusal(checkDailyCap(NOW))).status).toBe(429);
    expect(counters.hitWithin).toHaveBeenCalledWith('tickets:day:2026-11-08', 86400 + 3600);
  });

  it('turns a counter failure into a 503', async () => {
    counters.hitWithin.mockRejectedValue(new Error('Redis is down'));
    expect((await refusal(checkDailyCap(NOW))).status).toBe(503);
  });
});

describe('releaseDailySlot', () => {
  it('releases the same UTC-day key that the cap counted', async () => {
    counters.release.mockResolvedValue(undefined);
    await expect(releaseDailySlot(NOW)).resolves.toBeUndefined();
    expect(counters.release).toHaveBeenCalledWith('tickets:day:2026-11-08');
  });

  it('swallows a failed release so the original error can surface', async () => {
    counters.release.mockRejectedValue(new Error('did not answer'));
    await expect(releaseDailySlot(NOW)).resolves.toBeUndefined();
  });
});

describe('checkTurnstile', () => {
  it('passes a verified token', async () => {
    turnstile.verifyTurnstile.mockResolvedValue('ok');
    await expect(checkTurnstile('token', IP)).resolves.toBeUndefined();
    expect(turnstile.verifyTurnstile).toHaveBeenCalledWith('token', IP);
  });

  it('refuses an invalid token with the friendly 403', async () => {
    turnstile.verifyTurnstile.mockResolvedValue('invalid');
    const err = await refusal(checkTurnstile(undefined, IP));
    expect(err.status).toBe(403);
    expect(err.message).toBe("We couldn't verify your request. Please try again.");
  });

  it('refuses an outage with the friendly 503', async () => {
    turnstile.verifyTurnstile.mockResolvedValue('unavailable');
    const err = await refusal(checkTurnstile('token', IP));
    expect(err.status).toBe(503);
    expect(err.message).toBe("We can't accept new requests right now. Please try again shortly.");
  });
});
