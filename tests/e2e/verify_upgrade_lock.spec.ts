import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('verify studio route loads the production workspace', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.locator('.comp-brand-name')).toHaveText('S.M.U.V.E.');
  await expect(
    page.locator('.comp-rail-item').filter({ hasText: /drum machine/i })
  ).toBeVisible();
});
