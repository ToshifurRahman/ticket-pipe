import { getConfig } from './config.js';
import { logger } from './logger.js';

// Cloudflare Turnstile, server side (story 7.5). `fetch`, `AbortSignal.timeout` and
// URLSearchParams only: the API runs on Bun in production and on Node under Vitest.
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_TIMEOUT_MS = 5000;

// Failures that mean "this token is not good", as opposed to "Cloudflare or the config is broken".
const INVALID_CODES = new Set([
  'missing-input-response',
  'invalid-input-response',
  'timeout-or-duplicate',
]);

export type TurnstileResult = 'ok' | 'invalid' | 'unavailable';

interface SiteVerifyBody {
  success?: unknown;
  'error-codes'?: unknown;
}

function errorCodes(body: SiteVerifyBody): string[] {
  const codes = body['error-codes'];
  return Array.isArray(codes)
    ? codes.filter((code): code is string => typeof code === 'string')
    : [];
}

/**
 * Verifies a token with Cloudflare. A missing token is refused without a network call. Only a
 * clear token failure is `invalid`; everything else that is not a success is `unavailable`, so
 * a caller can refuse rather than let an unverified request through. The token and the secret
 * are never logged.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string
): Promise<TurnstileResult> {
  if (!token) return 'invalid';

  const form = new URLSearchParams({ secret: getConfig().TURNSTILE_SECRET_KEY, response: token });
  if (ip !== 'local') form.set('remoteip', ip);

  let response: Response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error({ err }, 'Turnstile siteverify request failed');
    return 'unavailable';
  }

  if (response.status !== 200) {
    logger.error({ status: response.status }, 'Turnstile siteverify returned a non-200 status');
    return 'unavailable';
  }

  let body: SiteVerifyBody;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    body = parsed;
  } catch (err) {
    logger.error({ err }, 'Turnstile siteverify returned an unexpected body');
    return 'unavailable';
  }

  if (body.success === true) return 'ok';
  if (body.success === false) {
    const codes = errorCodes(body);
    if (codes.length > 0 && codes.every((code) => INVALID_CODES.has(code))) return 'invalid';
    logger.error({ codes }, 'Turnstile siteverify could not verify the token');
    return 'unavailable';
  }

  logger.error('Turnstile siteverify returned an unexpected body');
  return 'unavailable';
}
