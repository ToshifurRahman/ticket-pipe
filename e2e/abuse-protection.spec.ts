import { expect, test } from '@playwright/test';
import pg from 'pg';

import { removeTicket } from './helpers/cleanup-ticket';
import { asClient } from './helpers/client-ip';
import { stubTurnstile, TURNSTILE_DUMMY_TOKEN } from './helpers/turnstile';

// Story 7.5 against the real stack: the real siteverify call (Cloudflare's test secret), a
// refusal with no token that leaves no row, and the form's friendly copy for 403, 429 and 503.
try {
  process.loadEnvFile('.env');
} catch {
  /* rely on the environment */
}

const created: string[] = [];

test.afterAll(async () => {
  for (const id of created) await removeTicket(id);
});

async function countBySubject(subject: string): Promise<number> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tickets WHERE subject = $1',
      [subject]
    );
    return Number(rows[0].count);
  } finally {
    await client.end();
  }
}

test('a form submit passes the real siteverify and creates a ticket', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/new');
  await page.getByLabel('Subject').fill('Abuse guard, real siteverify');
  await page
    .getByLabel('Description')
    .fill('A description long enough to pass the minimum length check.');

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/api/tickets') && r.request().method() === 'POST'
    ),
    page.getByRole('button', { name: /Submit ticket/ }).click(),
  ]);
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { ticketId: string };
  created.push(body.ticketId);
  await expect(page.getByRole('heading', { name: "We're on it" })).toBeFocused();
});

test('a POST with no token is refused with 403 and creates nothing', async ({ request }) => {
  const subject = `No token ${Date.now()}`;
  const res = await request.post('/api/tickets', {
    data: {
      subject,
      description: 'A description long enough to pass the minimum length check.',
    },
    headers: asClient(),
  });
  expect(res.status()).toBe(403);
  expect(await res.json()).toEqual({
    error: "We couldn't verify your request. Please try again.",
  });
  expect(await countBySubject(subject)).toBe(0);
});

test('the form shows the friendly message for 403, 429 and 503', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/new');
  await page.getByLabel('Subject').fill('Abuse guard messages');
  await page
    .getByLabel('Description')
    .fill('A description long enough to pass the minimum length check.');

  for (const [status, message] of [
    [403, "We couldn't verify your request. Please try again."],
    [429, "You've sent several tickets recently. Please try again in about an hour."],
    [503, "We can't accept new requests right now. Please try again shortly."],
  ] as const) {
    await page.route('**/api/tickets', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status, json: { error: message } })
        : route.continue()
    );
    await page.getByRole('button', { name: /Submit ticket/ }).click();
    await expect(page.getByRole('alert')).toHaveText(message);
    await page.unroute('**/api/tickets');
  }
});

test('the notify card shows the friendly message for 403', async ({ page, request }) => {
  await stubTurnstile(page);
  const createdRes = await request.post('/api/tickets', {
    data: {
      subject: `Notify guard ${Date.now()}`,
      description: 'A description long enough to pass the minimum. [fake:invalid-triage]',
      turnstileToken: TURNSTILE_DUMMY_TOKEN,
    },
    headers: asClient(),
  });
  const { ticketId, referenceNumber } = (await createdRes.json()) as {
    ticketId: string;
    referenceNumber: string;
  };
  created.push(ticketId);

  await page.route(`**/api/tickets/${ticketId}/notification`, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 403,
          json: { error: "We couldn't verify your request. Please try again." },
        })
      : route.continue()
  );
  await page.goto(`/t/${referenceNumber}`);
  await page.getByLabel('Email address').fill('someone@example.test');
  await page.getByRole('button', { name: 'Notify me' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    "We couldn't verify your request. Please try again."
  );
});
