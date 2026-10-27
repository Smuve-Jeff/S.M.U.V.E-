import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('verify the classic studio shell still loads', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/studio-classic');
  await expect(page).toHaveURL(/\/studio-classic$/);
  await expect(page.locator('.comp-brand-name')).toHaveText('S.M.U.V.E.');
  await expect(
    page.locator('.comp-rail-item').filter({ hasText: /drum machine/i })
  ).toBeVisible();
});
