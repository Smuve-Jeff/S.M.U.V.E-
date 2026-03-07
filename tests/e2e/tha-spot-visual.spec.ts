import { test, expect } from '@playwright/test';
test('Tha Spot Visual Verification', async ({ page }) => {
  await page.goto('http://localhost:3000/tha-spot');
  await page.waitForTimeout(5000);
  const terminal = page.locator('input[placeholder*="S.M.U.V.E. TERMINAL"]');
  await expect(terminal).toBeVisible({ timeout: 15000 });
});
