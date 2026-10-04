import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test.beforeEach(async ({ page }) => { await seedAuthenticatedSession(page); });

test('verify career hub upgrades', async ({ page }) => {
  await page.goto('/career');
  await expect(page.locator('app-career-hub h1')).toContainText('EXECUTIVEHUB');
  await page.screenshot({ path: test.info().outputPath('career_hub_upgraded.png') });
});

test('verify strategy hub upgrades', async ({ page }) => {
  await page.goto('/strategy');
  await expect(page.locator('app-strategy-hub h1')).toContainText('S.M.U.V.E. STRATEGY');
  await page.screenshot({ path: test.info().outputPath('strategy_hub_upgraded.png') });
});

test('verify Studio production workspace', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.locator('app-studio')).toBeVisible();
  await expect(page.locator('.comp-brand-name')).toHaveText('S.M.U.V.E.');
  await expect(page.locator('app-beginner-wizard')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('studio_workspace_check.png') });
});
