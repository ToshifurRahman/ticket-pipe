import { expect, test } from '@playwright/test';
import { removeTicket } from './helpers/cleanup-ticket';
import { E2E_OPS_TOKEN, opsCookie } from './helpers/ops-session';
import { stripFakeMarkers } from './helpers/strip-fake-marker';

// The ops console against the real API, worker, queue and socket, with the fake LLM. The
// ticket is seeded over the API; the page is never reloaded once the operator has signed in.

const created: string[] = [];

test.afterAll(async () => {
  for (const id of created) await removeTicket(id);
});

test('an operator signs in, finds a ticket that needs attention and replays it live', async ({ page, request }) => {
  const res = await request.post('/api/tickets', {
    data: {
      subject: 'Ops console replay check',
      description: 'The totals on my invoice do not add up. [fake:invalid-draft]',
    },
  });
  expect(res.status()).toBe(201);
  const { ticketId, referenceNumber } = (await res.json()) as { ticketId: string; referenceNumber: string };
  created.push(ticketId);

  const cookie = await opsCookie(request);
  await expect
    .poll(
      async () => {
        const detail = await request.get(`/api/ops/tickets/${ticketId}`, { headers: { cookie } });
        return ((await detail.json()) as { status: string }).status;
      },
      { timeout: 20_000 }
    )
    .toBe('needs_attention');

  // Signed out, the page offers nothing but the sign-in card.
  await page.goto('/ops');
  await expect(page.getByLabel('Ops token')).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);

  await page.getByLabel('Ops token').fill(E2E_OPS_TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('tablist', { name: 'Filter by status' })).toBeVisible();

  // Filter, then open the ticket and read what the AI did.
  await page.getByRole('tab', { name: /^Needs attention/ }).click();
  await expect(page).toHaveURL(/status=needs_attention/);
  await page.getByRole('button', { name: `Open ${referenceNumber}` }).click();

  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { name: 'Ops console replay check' })).toBeVisible();
  await expect(drawer.getByText('General', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Medium', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'AI calls' })).toBeVisible();
  await expect(drawer.getByRole('table').getByRole('row')).not.toHaveCount(0);

  // The team fixes the cause, then replays. The row updates with no reload.
  await stripFakeMarkers(ticketId);
  await drawer.getByRole('button', { name: /^Replay/ }).click();
  await drawer.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(`${referenceNumber} replayed. The team re-queued it.`)).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /^All/ }).click();
  const row = page.getByRole('row').filter({ hasText: referenceNumber });
  await expect(row.getByText('Completed')).toBeVisible({ timeout: 15_000 });
});
