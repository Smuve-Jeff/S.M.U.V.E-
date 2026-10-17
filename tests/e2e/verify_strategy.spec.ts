import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Strategy Hub Dynamic Features', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/strategy');
  await expect(page.getByRole('heading', { name: 'S.M.U.V.E. STRATEGY' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'POWERFUL UPGRADES' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'COMMAND CENTER BRIEFS' })).toBeVisible();
  await page.locator('app-strategy-hub').getByRole('button', { name: /^analytics$/i }).click();
  await expect(page.getByRole('heading', { name: 'PERFORMANCE METRICS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MARKET ANOMALIES' })).toBeVisible();
  await page.locator('app-strategy-hub').getByRole('button', { name: /^overview$/i }).click();
  await expect(page.getByRole('heading', { name: 'POWERFUL UPGRADES' })).toBeVisible();
});
