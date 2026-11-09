import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../../src/lib/logger.js';
import {
  TURNSTILE_TIMEOUT_MS,
  TURNSTILE_VERIFY_URL,
  verifyTurnstile,
} from '../../../src/lib/turnstile.js';

const realFetch = globalThis.fetch;

type Answer = Response | Error;

function stubFetch(answer: Answer | ((init: RequestInit) => Answer)) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      // Only siteverify is answered here; every other URL goes to the real fetch.
      if (url !== TURNSTILE_VERIFY_URL) return realFetch(input, init);
      calls.push({ url, init });
      const result = typeof answer === 'function' ? answer(init) : answer;
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }
  );
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = realFetch;
});

describe('verifyTurnstile', () => {
  it('refuses a missing or empty token without a network call', async () => {
    const calls = stubFetch(json({ success: true }));
    expect(await verifyTurnstile(undefined, '203.0.113.7')).toBe('invalid');
    expect(await verifyTurnstile('', '203.0.113.7')).toBe('invalid');
    expect(calls).toEqual([]);
  });

  it('posts the form fields, with remoteip for a real address', async () => {
    const calls = stubFetch(json({ success: true }));
    expect(await verifyTurnstile('token-1', '203.0.113.7')).toBe('ok');

    const [{ url, init }] = calls;
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'application/x-www-form-urlencoded'
    );
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('1x0000000000000000000000000000000AA');
    expect(body.get('response')).toBe('token-1');
    expect(body.get('remoteip')).toBe('203.0.113.7');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves remoteip out when the address is local', async () => {
    const calls = stubFetch(json({ success: true }));
    await verifyTurnstile('token-1', 'local');
    expect((calls[0].init.body as URLSearchParams).has('remoteip')).toBe(false);
  });

  it('accepts the token when Cloudflare says success', async () => {
    stubFetch(json({ success: true, 'error-codes': [] }));
    expect(await verifyTurnstile('token-1', 'local')).toBe('ok');
  });

  it.each(['missing-input-response', 'invalid-input-response', 'timeout-or-duplicate'])(
    'treats %s as an invalid token',
    async (code) => {
      stubFetch(json({ success: false, 'error-codes': [code] }));
      expect(await verifyTurnstile('token-1', 'local')).toBe('invalid');
    }
  );

  it.each(['invalid-input-secret', 'missing-input-secret', 'internal-error', 'bad-request'])(
    'treats %s as an outage',
    async (code) => {
      stubFetch(json({ success: false, 'error-codes': [code] }));
      expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
    }
  );

  it('treats a mixed set of codes as an outage', async () => {
    stubFetch(
      json({ success: false, 'error-codes': ['invalid-input-response', 'internal-error'] })
    );
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('treats an empty failure list as an outage', async () => {
    stubFetch(json({ success: false, 'error-codes': [] }));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('treats success:false with no error-codes as an outage', async () => {
    stubFetch(json({ success: false }));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('treats a null JSON body as an outage', async () => {
    stubFetch(json(null));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('logs a failure without the token or the secret', async () => {
    const spy = vi.spyOn(logger, 'error');
    try {
      stubFetch(json({ success: false, 'error-codes': ['invalid-input-secret'] }));
      expect(await verifyTurnstile('secret-token-value', '203.0.113.7')).toBe('unavailable');
      const logged = JSON.stringify(spy.mock.calls);
      expect(spy).toHaveBeenCalled();
      expect(logged).not.toContain('secret-token-value');
      expect(logged).not.toContain('1x0000000000000000000000000000000AA');
    } finally {
      spy.mockRestore();
    }
  });

  it('treats a non-200 status as an outage', async () => {
    stubFetch(json({ success: true }, 500));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('treats a body that is not the expected JSON as an outage', async () => {
    stubFetch(new Response('<html>nope</html>', { status: 200 }));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');

    stubFetch(json({ ok: true }));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('treats a network error as an outage', async () => {
    stubFetch(new TypeError('fetch failed'));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('treats a timeout as an outage', async () => {
    stubFetch(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    expect(await verifyTurnstile('token-1', 'local')).toBe('unavailable');
  });

  it('caps the siteverify call at five seconds', () => {
    expect(TURNSTILE_TIMEOUT_MS).toBe(5000);
  });
});
