import { test, expect } from '@playwright/test';

test('verify career hub upgrades', async ({ page }) => {
  await page.goto('/career');
  await expect(page.locator('h1')).toContainText('CAREER');
  await page.screenshot({ path: 'career_hub_upgraded.png' });
});

test('verify strategy hub upgrades', async ({ page }) => {
  await page.goto('/strategy');
  await expect(page.locator('h1')).toContainText('STRATEGY');
  await page.screenshot({ path: 'strategy_hub_upgraded.png' });
});

test('verify studio holographic mode', async ({ page }) => {
  await page.goto('/studio');
  // Check for holographic console activation button if available
  const btn = page.locator('button:has-text("Activate Holographic Console")');
  if (await btn.isVisible()) {
    await btn.click();
  }
  await page.screenshot({ path: 'studio_holographic_check.png' });
});
