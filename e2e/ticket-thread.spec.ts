import { expect, test, type Page } from '@playwright/test';
import { opsCookie } from './helpers/ops-session';
import { removeTicket } from './helpers/cleanup-ticket';
import { stripFakeMarkers } from './helpers/strip-fake-marker';
import { stubTurnstile } from './helpers/turnstile';

// The thread follows a ticket live, against the real API, worker, queue and socket, with the
// fake LLM (category "general", priority "medium"). No test reloads the page after submitting.

const ON_HOLD = /flagged for the team/;
const created: string[] = [];

test.afterAll(async () => {
  for (const id of created) await removeTicket(id);
});

async function submitAndWatch(page: Page, subject: string, description: string) {
  await stubTurnstile(page);
  await page.goto('/new');
  await page.getByLabel('Subject').fill(subject);
  await page.getByLabel('Description').fill(description);
  const submit = page.getByRole('button', { name: /Submit ticket/ });
  await expect(submit).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/tickets') && r.request().method() === 'POST'),
    submit.click(),
  ]);
  expect(response.status()).toBe(201);
  const { ticketId, referenceNumber } = (await response.json()) as { ticketId: string; referenceNumber: string };
  created.push(ticketId);

  await page.getByRole('link', { name: /Watch it live/ }).click();
  await expect(page).toHaveURL(`/t/${referenceNumber}`);
  return { ticketId, referenceNumber };
}

async function expectReply(page: Page) {
  await expect(page.getByText(/^Reply from support/)).toBeVisible({ timeout: 15_000 });
  const badges = page.getByRole('list', { name: 'Triage' });
  await expect(badges.getByText('General')).toBeVisible();
  await expect(badges.getByText('Medium priority')).toBeVisible();
  await expect(page.getByText(/This conversation is closed/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open a new ticket/ })).toHaveAttribute('href', '/new');
}

test('a submitted ticket gets its reply live on the thread page', async ({ page }) => {
  await submitAndWatch(page, 'Report export never starts', 'The CSV export button spins and then nothing downloads.');

  await expect(page.getByRole('heading', { name: 'Report export never starts' })).toBeVisible();
  await expect(page.getByText('The CSV export button spins and then nothing downloads.')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/Reading your request...|Writing a reply.../);

  await expectReply(page);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('a ticket that needs a closer look picks up live after the team replays it', async ({ page, request }) => {
  const { ticketId } = await submitAndWatch(
    page,
    'Invoice totals look wrong',
    'The totals on my invoice do not add up. [fake:invalid-draft]'
  );

  await expect(page.getByText(ON_HOLD)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('[aria-current="step"]')).toHaveCount(0);

  // The team fixes the cause and replays the ticket; the customer's page is still open.
  await stripFakeMarkers(ticketId);
  const replay = await request.post(`/api/tickets/${ticketId}/replay`, {
    headers: { cookie: await opsCookie(request) },
  });
  expect(replay.status()).toBe(200);

  await expect(page.getByText(ON_HOLD)).toBeHidden({ timeout: 10_000 });
  await expectReply(page);
});

test('an unknown reference shows a friendly not-found state', async ({ page }) => {
  await page.goto('/t/TICK-0000000000000-00000000');
  await expect(page.getByRole('heading', { name: "We couldn't find that ticket" })).toBeVisible();
  await expect(page.getByRole('main').getByLabel('Ticket reference')).toBeVisible();
});
