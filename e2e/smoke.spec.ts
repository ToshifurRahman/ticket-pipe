import { expect, test } from '@playwright/test';

test('a deep link renders the app, not a server 404', async ({ page }) => {
  await page.goto('/t/TICK-1759993412345-A1B2C3D4');
  await expect(page.getByRole('heading', { name: 'Ticket' })).toBeVisible();
  await expect(page.getByText('TICK-1759993412345-A1B2C3D4')).toBeVisible();
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

test('dark by default, and a saved light theme is applied before React mounts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(/light/);

  // Record the class at the earliest observable moment of the next load. The theme script
  // sits in <head>, so it must already have run when the document parser reaches <body>.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (document.body) {
        (window as unknown as { __themeAtBody: string }).__themeAtBody = document.documentElement.className;
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  const atBody = await page.evaluate(() => (window as unknown as { __themeAtBody: string }).__themeAtBody);
  expect(atBody).toContain('light');
  expect(atBody).not.toContain('dark');
});
