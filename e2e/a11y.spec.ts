import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { removeTicket } from './helpers/cleanup-ticket';
import { asClient } from './helpers/client-ip';
import { linkIn, uniqueAddress, waitForMail } from './helpers/mailpit';
import { E2E_OPS_TOKEN, opsCookie } from './helpers/ops-session';
import { stubTurnstile } from './helpers/turnstile';

// Story 6.8: every page and its key states must have no axe violations at
// WCAG 2.1 AA, with no horizontal scroll at 360px, and a sensible keyboard order. Contrast is
// only checkable in a real browser, which is why this is not a component test. Reduced motion
// shows the landing demo's final frame, so contrast is not measured mid-animation.

// 'default' keeps one failing state from skipping the rest; the seeded tickets are shared, so
// the file stays on one worker.
test.describe.configure({ mode: 'default' });
test.use({ reducedMotion: 'reduce' });

const UNKNOWN_REF = 'TICK-0000000000000-AAAAAAAA';
const created: string[] = [];
let completed: { id: string; ref: string };
let attention: { id: string; ref: string };

async function seedTicket(api: APIRequestContext, cookie: string, subject: string, description: string, status: string) {
  const res = await api.post('/api/tickets', { data: { subject, description } });
  expect(res.status()).toBe(201);
  const { ticketId, referenceNumber } = (await res.json()) as { ticketId: string; referenceNumber: string };
  created.push(ticketId);
  await expect
    .poll(
      async () => {
        const detail = await api.get(`/api/ops/tickets/${ticketId}`, { headers: { cookie } });
        return ((await detail.json()) as { status: string }).status;
      },
      { timeout: 20_000 }
    )
    .toBe(status);
  return { id: ticketId, ref: referenceNumber };
}

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const cookie = await opsCookie(api);
  completed = await seedTicket(api, cookie, 'Accessibility check', 'The totals on my invoice do not add up.', 'completed');
  attention = await seedTicket(
    api,
    cookie,
    'Accessibility check, needs attention',
    'The totals on my invoice do not add up. [fake:invalid-triage]',
    'needs_attention'
  );
  await api.dispose();
});

test.afterAll(async () => {
  for (const id of created) await removeTicket(id);
});

// A ticket that ends needs_attention (so it stays open to email opt-in) with a pending opt-in.
async function optedInTicket(page: Page) {
  const res = await page.request.post('/api/tickets', {
    data: { subject: 'Accessibility check, email', description: 'The totals on my invoice do not add up. [fake:invalid-triage]' },
  });
  const { ticketId, referenceNumber } = (await res.json()) as { ticketId: string; referenceNumber: string };
  created.push(ticketId);
  const address = uniqueAddress();
  expect((await page.request.post(`/api/tickets/${ticketId}/notification`, { data: { email: address }, headers: asClient() })).status()).toBe(201);
  return { ref: referenceNumber, address };
}

async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, label).toEqual([]);
}

async function signInToOps(page: Page) {
  await page.goto('/ops');
  await page.getByLabel('Ops token').fill(E2E_OPS_TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('tablist', { name: 'Filter by status' })).toBeVisible();
}

async function signInWithCookie(page: Page, request: APIRequestContext) {
  const [name, value] = (await opsCookie(request)).split('=');
  await page.context().addCookies([{ name: name!, value: value!, url: 'http://localhost:3100', secure: true, httpOnly: true }]);
}

type Visit = { name: string; open: (page: Page) => Promise<void> };

const visits: Visit[] = [
  { name: 'landing', open: async (p) => { await p.goto('/'); await expect(p.getByRole('heading', { level: 1 })).toBeVisible(); } },
  { name: 'new ticket', open: async (p) => { await stubTurnstile(p); await p.goto('/new'); await expect(p.getByLabel('Subject')).toBeVisible(); } },
  {
    name: 'new ticket with validation errors',
    open: async (p) => {
      await stubTurnstile(p);
      await p.goto('/new');
      await p.getByLabel('Subject').fill('Hi');
      await p.getByLabel('Description').fill('short');
      await p.getByLabel('Description').blur();
      await expect(p.getByLabel('Subject')).toHaveAttribute('aria-invalid', 'true');
      await expect(p.getByLabel('Description')).toHaveAttribute('aria-invalid', 'true');
    },
  },
  { name: 'ticket completed', open: async (p) => { await p.goto(`/t/${completed.ref}`); await expect(p.getByText(/^Reply from support/)).toBeVisible(); } },
  { name: 'ticket needs attention', open: async (p) => { await p.goto(`/t/${attention.ref}`); await expect(p.getByText(/waiting in our team.s queue/)).toBeVisible(); await expect(p.getByLabel('Email address')).toBeVisible(); } },
  {
    name: 'ticket with the email card pending',
    open: async (p) => {
      const { ref } = await optedInTicket(p);
      await p.goto(`/t/${ref}`);
      await expect(p.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    },
  },
  {
    name: 'confirm email',
    open: async (p) => {
      const { address } = await optedInTicket(p);
      const [mail] = await waitForMail(address);
      await p.goto(linkIn(mail!, '/confirm/'));
      await expect(p.getByRole('button', { name: 'Confirm' })).toBeVisible();
    },
  },
  {
    name: 'confirm email, expired link',
    open: async (p) => {
      await p.goto('/confirm/not-a-real-token');
      await expect(p.getByRole('heading', { name: /expired or was already used/ })).toBeVisible();
    },
  },
  { name: 'ticket not found', open: async (p) => { await p.goto(`/t/${UNKNOWN_REF}`); await expect(p.getByRole('heading', { name: /couldn't find that ticket/ })).toBeVisible(); } },
  { name: 'privacy', open: async (p) => { await p.goto('/privacy'); await expect(p.getByRole('heading', { level: 1 })).toBeVisible(); } },
  { name: 'terms', open: async (p) => { await p.goto('/terms'); await expect(p.getByRole('heading', { level: 1 })).toBeVisible(); } },
  { name: '404', open: async (p) => { await p.goto('/no-such-page'); await expect(p.getByRole('heading', { level: 1 })).toBeVisible(); } },
  { name: 'ops signed out', open: async (p) => { await p.goto('/ops'); await expect(p.getByLabel('Ops token')).toBeVisible(); } },
  {
    name: 'ops list',
    open: async (p) => {
      await signInToOps(p);
      await expect(p.getByRole('button', { name: `Open ${completed.ref}` })).toBeVisible();
    },
  },
  {
    name: 'ops ticket drawer',
    open: async (p) => {
      await signInToOps(p);
      await p.getByRole('button', { name: `Open ${attention.ref}` }).click();
      await expect(p.getByRole('dialog').getByRole('heading', { name: 'AI calls' })).toBeVisible();
    },
  },
];

for (const visit of visits) {
  test(`no axe violations: ${visit.name}`, async ({ page }) => {
    await visit.open(page);
    await expectNoViolations(page, visit.name);
  });
}

test('the ticket submitted from /new shows an accessible confirmation', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/new');
  await page.getByLabel('Subject').fill('Accessibility check, confirmation');
  await page.getByLabel('Description').fill('Checking the confirmation screen for accessibility.');
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/tickets') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /Submit ticket/ }).click(),
  ]);
  created.push(((await response.json()) as { ticketId: string }).ticketId);
  await expect(page.getByRole('link', { name: /Watch it live/ })).toBeVisible();
  await expectNoViolations(page, 'confirmation');
});

test.describe('360px viewport', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const visit of visits) {
    test(`no horizontal scroll: ${visit.name}`, async ({ page }) => {
      await visit.open(page);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});

test.describe('keyboard', () => {
  for (const path of ['/', '/new', '/ops']) {
    test(`skip link first, visible focus after: ${path}`, async ({ page, request }) => {
      await stubTurnstile(page);
      // Signed out, /ops focuses its token field on purpose (the page's one task), so the
      // console is checked signed in. The cookie is Secure; Chromium accepts it for localhost.
      if (path === '/ops') await signInWithCookie(page, request);
      await page.goto(path);
      await page.locator('#main').waitFor(); // the ops layout is lazy-loaded
      if (path === '/new') await page.getByLabel('Subject').waitFor(); // so is the form
      await page.keyboard.press('Tab');

      const skip = page.getByRole('link', { name: 'Skip to content' });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();

      // The next stops are real controls, each with a visible focus indicator.
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const indicator = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const style = getComputedStyle(el);
          const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          return { tag: el.tagName, label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30), visible: outline || style.boxShadow !== 'none' };
        });
        expect(indicator.visible, `${path}: ${indicator.tag} "${indicator.label}"`).toBe(true);
      }

      // Activating the skip link moves focus into the content.
      await page.goto(path);
      await page.locator('#main').waitFor();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main');
    });
  }
});
