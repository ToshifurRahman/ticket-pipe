import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light'] as const) {
  test(`privacy and terms open from the footer and read in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(new RegExp(theme));

    await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();

    await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Terms' }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();

  });
}

test('no analytics beacon and no cookies on the legal pages of a non-production build', async ({ page, context }) => {
  const beacon: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('cloudflareinsights')) beacon.push(req.url());
  });
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  expect(beacon).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
