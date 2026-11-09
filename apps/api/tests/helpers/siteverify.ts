import { vi } from 'vitest';

/** Cloudflare's documented always-pass dummy token, accepted by the test secret. */
export const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const realFetch = globalThis.fetch;

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Installs the stub for one test and restores the global afterwards. */
export function useSiteVerify(): void {
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    if (requestUrl(input) === SITEVERIFY_URL) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, 'error-codes': [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    }
    return realFetch(input, init);
  });
}
