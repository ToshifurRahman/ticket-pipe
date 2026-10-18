import { expect, test } from '@playwright/test';

const SECTIONS = [/see your ticket move/i, /four stages/i, 'Rates', 'Questions'];

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

test('the demo does not autoplay again after a reload in the same tab', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('socket.io')) calls.push(url);
  });
  await page.goto('/');
  await expect(page.getByText('Reply from support')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByText('Reply from support')).toBeVisible({ timeout: 1_000 });
  await expect(page.getByText('Reviewing your request…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('a reload before the reply lands plays the demo again', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Reviewing your request…')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Reviewing your request…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay' })).toHaveCount(0);
});

for (const theme of ['dark', 'light'] as const) {
  test(`the finished demo has the same layout played or restored at 360px in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const demo = page.getByRole('region', { name: 'Example ticket' });

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 15_000 });
    const played = await demo.boundingBox();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 1_000 });
    const restored = await demo.boundingBox();

    expect(restored?.width).toBe(played?.width);
    expect(restored?.height).toBe(played?.height);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

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
