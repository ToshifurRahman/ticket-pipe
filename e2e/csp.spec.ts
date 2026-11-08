/**
 * Story 7.4 — the CSP in apps/api/src/middleware/security-headers.ts.
 *
 * Offline: every Cloudflare host is answered by page.route. One half proves the allowed paths
 * (analytics script, Turnstile script and frame, the analytics endpoint, a React inline style);
 * the other proves the policy still blocks a script and a frame from another host. A suite
 * that only proves the allowed paths would pass with no CSP at all.
 */
import { expect, type Page, test } from '@playwright/test';

import { E2E_OPS_TOKEN } from './helpers/ops-session';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__cspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      ((window as unknown as Record<string, unknown>).__cspViolations as unknown[]).push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
      });
    });
  });
});

function violations(page: Page) {
  return page.evaluate(
    () => ((window as unknown as Record<string, unknown>)['__cspViolations'] as unknown[]) ?? []
  );
}

async function expectNoViolations(page: Page, label: string) {
  const found = await violations(page);
  expect(found, `${label}: ${JSON.stringify(found)}`).toEqual([]);
}

// The real widget script is replaced by a stub, but the frame must come from Cloudflare for
// the frame-src check. One route serves JS to script requests and HTML documents to frames.
async function stubCloudflare(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', (route) => {
    const request = route.request();
    const isScript =
      request.resourceType() === 'script' || new URL(request.url()).pathname.endsWith('.js');
    return route.fulfill(
      isScript
        ? {
            contentType: 'text/javascript',
            body: `window.__turnstileRan = true;
              window.turnstile = {
                render(el, opts) { this.cb = opts.callback; setTimeout(() => this.cb('e2e-token')); return 'w1'; },
                reset() { setTimeout(() => this.cb && this.cb('e2e-token')); },
                remove() {},
              };`,
          }
        : { contentType: 'text/html', body: '<!doctype html><body>turnstile frame</body>' }
    );
  });
  await page.route('https://cloudflareinsights.com/**', (route) =>
    route.fulfill({ status: 204, body: '' })
  );
  await page.route('https://static.cloudflareinsights.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__analyticsRan = true;' })
  );
}

test('no CSP violation on the landing page, a signed-in /ops and a real ticket thread', async ({
  page,
  request,
}) => {
  await stubCloudflare(page);

  await page.goto('/');
  await expect(page.getByText(/^Reply from support/)).toBeVisible({ timeout: 15_000 });
  await expectNoViolations(page, 'landing');

  await page.goto('/ops');
  await page.getByLabel('Ops token').fill(E2E_OPS_TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('tab', { name: /^All/ })).toBeVisible();
  await expectNoViolations(page, 'ops');

  const created = await request.post('/api/tickets', {
    data: {
      subject: 'CSP spec ticket',
      description: 'This ticket gives the CSP spec a real thread page with a live socket.',
    },
  });
  expect(created.status()).toBe(201);
  const { referenceNumber } = (await created.json()) as { referenceNumber: string };
  const socketConnected = page.waitForEvent('websocket', {
    predicate: (ws) => ws.url().includes('/socket.io/'),
    timeout: 20_000,
  });
  await page.goto(`/t/${referenceNumber}`);
  await expect(page.getByRole('heading', { name: 'CSP spec ticket' })).toBeVisible();
  const socket = await socketConnected;
  expect(socket.isClosed()).toBe(false);
  await expectNoViolations(page, 'thread');
});

test('allowed hosts run and frames load; another host is blocked in both directions', async ({
  page,
}) => {
  await stubCloudflare(page);
  await page.route('https://example.com/**', (route) => {
    const request = route.request();
    const isScript =
      request.resourceType() === 'script' || new URL(request.url()).pathname.endsWith('.js');
    return route.fulfill(
      isScript
        ? { contentType: 'text/javascript', body: 'window.__evilScriptRan = true;' }
        : { contentType: 'text/html', body: '<!doctype html><body>evil frame</body>' }
    );
  });

  await page.goto('/');
  await expect(page.getByText(/^Reply from support/)).toBeVisible({ timeout: 15_000 });

  // 1. A script from static.cloudflareinsights.com runs.
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = 'https://static.cloudflareinsights.com/probe.js';
    document.head.appendChild(s);
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as never as { __analyticsRan?: boolean }).__analyticsRan)
    )
    .toBe(true);

  // 2. A script from challenges.cloudflare.com runs (own check: stubTurnstile only replaces
  // the script, and the frame needs its own proof below).
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/probe.js';
    document.head.appendChild(s);
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as never as { __turnstileRan?: boolean }).__turnstileRan)
    )
    .toBe(true);

  // 3. A frame from challenges.cloudflare.com loads.
  await page.evaluate(() => {
    const f = document.createElement('iframe');
    f.id = 'cf-frame';
    f.src = 'https://challenges.cloudflare.com/frame';
    document.body.appendChild(f);
  });
  await expect(page.frameLocator('#cf-frame').locator('body')).toHaveText('turnstile frame');

  // 4. cloudflareinsights.com accepts a fetch.
  const fetched = await page.evaluate(async () => {
    const res = await fetch('https://cloudflareinsights.com/cdn-cgi/rum', { method: 'POST' });
    return res.status;
  });
  expect(fetched).toBe(204);

  // 5. A script from example.com is blocked, with a violation, and never runs.
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = 'https://example.com/evil.js';
    document.head.appendChild(s);
  });
  await expect
    .poll(() => violations(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockedURI: 'https://example.com/evil.js',
          effectiveDirective: 'script-src-elem',
        }),
      ])
    );
  expect(
    await page.evaluate(() => (window as never as { __evilScriptRan?: boolean }).__evilScriptRan)
  ).toBeUndefined();

  // 6. A frame from example.com is blocked, with a violation.
  await page.evaluate(() => {
    const f = document.createElement('iframe');
    f.src = 'https://example.com/evil-frame';
    document.body.appendChild(f);
  });
  await expect
    .poll(() => violations(page))
    .toEqual(
      expect.arrayContaining([expect.objectContaining({ effectiveDirective: 'frame-src' })])
    );
  // A blocked iframe still exists in the DOM; its document never receives the routed body.
  await expect(
    page.frameLocator('iframe[src="https://example.com/evil-frame"]').locator('body')
  ).not.toHaveText('evil frame');

  // 7. A style attribute that CSP governs still applies. An element built with innerHTML
  // forces the browser to parse a style attribute (React sets style through the CSSOM, which
  // CSP does not govern), and margin-top: 37px is distinguishable from the 0px default.
  const applied = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = '<span id="csp-style-probe" style="margin-top: 37px">probe</span>';
    document.body.appendChild(host);
    const probe = document.getElementById('csp-style-probe');
    return probe ? getComputedStyle(probe).marginTop : null;
  });
  expect(applied).toBe('37px');
});
