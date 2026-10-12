import type { APIRequestContext } from '@playwright/test';

// The token the e2e stack runs with (playwright.config.ts passes it as OPS_TOKEN).
export const E2E_OPS_TOKEN = 'e2e-ops-token';

/**
 * Signs in as ops and returns the Cookie header to send on later requests. Sent by hand
 * because the session cookie is `Secure` and the stack is served over plain http.
 */
export async function opsCookie(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/ops/session', { data: { token: E2E_OPS_TOKEN } });
  if (res.status() !== 200) throw new Error(`ops sign-in failed with ${res.status()}`);
  return res.headers()['set-cookie'].split(';')[0];
}
