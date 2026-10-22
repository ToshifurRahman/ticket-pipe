import { expect, test, type Page } from '@playwright/test';
import { asClient } from './helpers/client-ip';
import { linkIn, mailCount, uniqueAddress, waitForMail } from './helpers/mailpit';
import { removeTicket } from './helpers/cleanup-ticket';
import { opsCookie } from './helpers/ops-session';
import { stripFakeMarkers } from './helpers/strip-fake-marker';
import { stubTurnstile } from './helpers/turnstile';

// Customer email against the real stack, with Mailpit catching what the SMTP driver sends.

const created: string[] = [];
test.afterAll(async () => {
  for (const id of created) await removeTicket(id);
});

async function createTicket(request: import('@playwright/test').APIRequestContext, subject: string, description: string) {
  const res = await request.post('/api/tickets', { data: { subject, description } });
  expect(res.status()).toBe(201);
  const ticket = (await res.json()) as { ticketId: string; referenceNumber: string };
  created.push(ticket.ticketId);
  return ticket;
}

async function optInThroughPage(page: Page, referenceNumber: string, address: string) {
  await stubTurnstile(page);
  await page.setExtraHTTPHeaders(asClient());
  await page.goto(`/t/${referenceNumber}`);
  await page.getByLabel('Email address').fill(address);
  await page.getByRole('button', { name: 'Notify me' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
}

test('confirming through the emailed link leads to a "reply is ready" email', async ({ page, request }) => {
  const address = uniqueAddress();
  const { ticketId, referenceNumber } = await createTicket(request, 'Dashboard is blank', 'The dashboard shows a blank page after I sign in.');
  // Straight after creating: the fake LLM takes a moment per stage, so the ticket is still open.
  expect((await request.post(`/api/tickets/${ticketId}/notification`, { data: { email: address }, headers: asClient() })).status()).toBe(201);

  const [confirmation] = await waitForMail(address);
  expect(confirmation.subject).toContain(referenceNumber);

  // Opening the link changes nothing; only the button does.
  await page.goto(linkIn(confirmation, '/confirm/'));
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  expect(await mailCount(address)).toBe(1);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();

  const mail = await waitForMail(address, 2);
  expect(mail[1].subject).toMatch(/reply is ready/i);
  expect(linkIn(mail[1], '/t/')).toBe(`/t/${referenceNumber}`);
  expect(mail[1].text).not.toContain('blank page');
});

test('a ticket that needs attention sends one snag email, then the reply after a replay', async ({ page, request }) => {
  const address = uniqueAddress();
  const { ticketId, referenceNumber } = await createTicket(
    request,
    'Invoice totals look wrong',
    'The invoice total does not match the line items. [fake:invalid-draft]'
  );
  await expect
    .poll(async () => ((await (await request.get(`/api/tickets/${ticketId}`)).json()) as { status: string }).status, { timeout: 15_000 })
    .toBe('needs_attention');

  // The card is still offered while the team looks into it.
  await optInThroughPage(page, referenceNumber, address);
  const [confirmation] = await waitForMail(address);
  await page.goto(linkIn(confirmation, '/confirm/'));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();

  // Confirming after the outcome catches up with the snag email.
  const afterConfirm = await waitForMail(address, 2);
  expect(afterConfirm[1].subject).toMatch(/snag/i);

  await stripFakeMarkers(ticketId);
  const cookie = await opsCookie(request);
  expect((await request.post(`/api/tickets/${ticketId}/replay`, { headers: { cookie } })).status()).toBe(200);

  const all = await waitForMail(address, 3);
  expect(all[2].subject).toMatch(/reply is ready/i);
  // Exactly three emails in total: confirmation, one snag, the reply.
  await page.waitForTimeout(1500);
  expect(await mailCount(address)).toBe(3);
});
