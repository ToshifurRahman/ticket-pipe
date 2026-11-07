import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CSP_DIRECTIVES, securityHeaders } from '../../../src/middleware/security-headers.js';

const app = new Hono();
app.use('*', securityHeaders);
app.get('/ok', (c) => c.json({ ok: true }));
app.get('/boom', () => {
  throw new Error('boom');
});
app.onError((_err, c) => c.json({ error: 'Internal server error' }, 500));

const REQUIRED_HEADERS = [
  'content-security-policy',
  'cross-origin-resource-policy',
  'cross-origin-opener-policy',
  'origin-agent-cluster',
  'referrer-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-dns-prefetch-control',
  'x-download-options',
  'x-frame-options',
  'x-permitted-cross-domain-policies',
  'x-xss-protection',
];

function expectSecurityHeaders(res: Response) {
  for (const header of REQUIRED_HEADERS) {
    expect(res.headers.get(header), header).toBeTruthy();
  }
  const csp = res.headers.get('content-security-policy') ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain('https://challenges.cloudflare.com');
  expect(csp).toContain('https://static.cloudflareinsights.com');
  expect(csp).toContain('https://cloudflareinsights.com');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('upgrade-insecure-requests');
  expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
}

describe('security headers', () => {
  it('are on a normal response', async () => {
    expectSecurityHeaders(await app.request('/ok'));
  });

  it('are on the framework 404', async () => {
    const res = await app.request('/missing');
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });

  it('are on a 500 from onError', async () => {
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    expectSecurityHeaders(res);
  });

  it("never put 'unsafe-inline' or 'unsafe-eval' in script-src or style-src", () => {
    expect(CSP_DIRECTIVES.scriptSrc).not.toContain("'unsafe-inline'");
    expect(CSP_DIRECTIVES.scriptSrc).not.toContain("'unsafe-eval'");
    expect(CSP_DIRECTIVES.styleSrc).not.toContain("'unsafe-inline'");
  });
});
