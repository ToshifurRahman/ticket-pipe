import { expect, test } from '@playwright/test';

test('privacy and terms open from the footer', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Terms' }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
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
