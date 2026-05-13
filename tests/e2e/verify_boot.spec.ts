import { test, expect } from '@playwright/test';

test('should boot without blank screen', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  const bodyContent = await page.evaluate(() => document.body.innerHTML);
  console.log('Body length:', bodyContent.length);
  await page.screenshot({ path: 'boot_verification.png' });
  expect(bodyContent.length).toBeGreaterThan(100);
});
