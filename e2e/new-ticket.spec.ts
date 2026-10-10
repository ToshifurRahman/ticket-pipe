import { expect, test } from '@playwright/test';
import { removeTicket } from './helpers/cleanup-ticket';

// Cloudflare's script is replaced by a stub that passes at once, so the run is offline and
// deterministic. The real widget (test site key) is checked by hand in dev.
const TURNSTILE_STUB = `
  window.turnstile = {
    render(el, opts) { this.cb = opts.callback; setTimeout(() => this.cb('e2e-token')); return 'w1'; },
    reset() { setTimeout(() => this.cb && this.cb('e2e-token')); },
    remove() {},
  };
`;

const created: string[] = [];

test.afterAll(async () => {
  for (const id of created) await removeTicket(id);
});

test('a customer submits a ticket with the keyboard and finds it again after a reload', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB })
  );
  await page.goto('/new');
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();

  const subject = page.getByLabel('Subject');
  const description = page.getByLabel('Description');
  const submit = page.getByRole('button', { name: /Submit ticket/ });

  // Tab in from the top of the page, past the header controls, until Subject has focus.
  for (let i = 0; i < 10 && !(await subject.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(subject).toBeFocused();
  await page.keyboard.type('Re');
  await page.keyboard.press('Tab');
  await expect(page.getByText('Subject needs at least 3 characters.')).toBeVisible();
  await expect(description).toBeFocused();

  // Tabbing into a field selects its text; End puts the caret after "Re" to keep typing.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('End');
  await page.keyboard.type('port export never starts');
  await expect(page.getByText('Subject needs at least 3 characters.')).toBeHidden();
  await page.keyboard.press('Tab');
  await page.keyboard.type('The CSV export button spins for a few seconds and then nothing downloads.');
  await expect(page.getByText('73 / 5000')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await expect(submit).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/tickets') && r.request().method() === 'POST'),
    page.keyboard.press('Enter'),
  ]);
  expect(response.status()).toBe(201);
  const { ticketId, referenceNumber } = (await response.json()) as { ticketId: string; referenceNumber: string };
  created.push(ticketId);
  expect(response.request().postDataJSON()).toMatchObject({ turnstileToken: 'e2e-token' });

  await expect(page.getByRole('heading', { name: "We're on it" })).toBeFocused();
  await expect(page.getByTestId('ticket-reference')).toHaveText(referenceNumber);
  await expect(page.getByRole('link', { name: /Watch it live/ })).toHaveAttribute('href', `/t/${referenceNumber}`);

  await page.reload();
  const recent = page.getByRole('region', { name: 'Your recent tickets' });
  await expect(recent.getByRole('link', { name: /Report export never starts/ })).toHaveAttribute(
    'href',
    `/t/${referenceNumber}`
  );
  await expect(recent.getByText('Processing')).toBeVisible();
});

test('the API rejects lengths outside the limits with field errors', async ({ request }) => {
  const res = await request.post('/api/tickets', { data: { subject: 'ab', description: 'x'.repeat(5001) } });
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({
    errors: {
      subject: 'Subject needs at least 3 characters.',
      description: 'Description can be at most 5000 characters.',
    },
  });
});
