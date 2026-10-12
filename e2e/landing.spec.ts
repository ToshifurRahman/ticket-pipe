import { expect, test } from '@playwright/test';

const SECTIONS = [/already understood/i, /from inbox to answer/i, 'Simple pricing', 'Questions'];

for (const theme of ['dark', 'light'] as const) {
  test(`every section fits a 360px screen in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(new RegExp(theme));

    for (const name of SECTIONS) await expect(page.getByRole('heading', { name })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the demo plays to the reply without touching the API', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('socket.io')) calls.push(url);
  });
  await page.goto('/');
  await expect(page.getByText('Reviewing your request…')).toBeVisible();
  await expect(page.getByText('Reply from support')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('reduced motion shows the finished demo straight away', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('Reply from support')).toBeVisible({ timeout: 1_000 });
  await expect(page.getByRole('button', { name: 'Replay' })).toHaveCount(0);
});

test('the hero CTA opens the submit page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /submit a ticket/i }).first().click();
  await expect(page).toHaveURL(/\/new$/);
});

test('the hero track field opens a ticket', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('main').getByRole('textbox', { name: 'Ticket reference' }).fill('tick-1759993412345-a1b2c3d4');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/t\/TICK-1759993412345-A1B2C3D4$/);
});
