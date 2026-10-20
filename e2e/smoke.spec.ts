import { expect, test } from '@playwright/test';

test('a deep link renders the app, not a server 404', async ({ page }) => {
  await page.goto('/t/TICK-1759993412345-A1B2C3D4');
  await expect(page.getByRole('heading', { name: 'Ticket' })).toBeVisible();
  await expect(page.getByText('TICK-1759993412345-A1B2C3D4').first()).toBeVisible();
});

test('an unknown route shows the 404 page', async ({ page }) => {
  await page.goto('/nope');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('unknown API paths return JSON, not the app shell', async ({ request }) => {
  const res = await request.get('/api/nope', { headers: { accept: 'text/html' } });
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'Not found' });
});
