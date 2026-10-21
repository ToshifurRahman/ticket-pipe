import { expect, test } from '@playwright/test';

test('privacy and terms open from the footer', async ({ page }) => {
  await page.goto('/');

  const footer = page.getByRole('navigation', { name: 'Legal', exact: true });
  await footer.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();

  await footer.getByRole('link', { name: 'Terms' }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
});

test('the tabs switch documents and mark the current one', async ({ page }) => {
  await page.goto('/legal/privacy');
  const tabs = page.getByRole('navigation', { name: 'Legal page' });
  await expect(tabs.getByRole('link', { name: 'Privacy' })).toHaveAttribute('aria-current', 'page');

  await tabs.getByRole('link', { name: 'Terms' }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(tabs.getByRole('link', { name: 'Terms' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
});

test('the old /privacy and /terms links land on the new routes', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await page.goto('/terms');
  await expect(page).toHaveURL(/\/legal\/terms$/);
});

test('no analytics beacon and no cookies on the legal pages of a non-production build', async ({ page, context }) => {
  const beacon: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('cloudflareinsights')) beacon.push(req.url());
  });
  await page.goto('/legal/privacy');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  expect(beacon).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
