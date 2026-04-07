import { test, expect } from '@playwright/test';

test('Strategy Hub Dynamic Features', async ({ page }) => {
  await page.goto('/strategy');

  await expect(page.getByRole('heading', { name: 'STRATEGYHUB' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Real-Time Market Intelligence/i })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Executive Intelligence Briefs/i })
  ).toBeVisible();

  await page.getByRole('button', { name: /^social$/i }).click();
  await expect(
    page.getByRole('heading', { name: /Social Presence Engine/i })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Viral Hook Library/i })
  ).toBeVisible();
});
