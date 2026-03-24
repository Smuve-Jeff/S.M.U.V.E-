import { test, expect } from '@playwright/test';

test('Strategy Hub Dynamic Features', async ({ page }) => {
  await page.goto('http://localhost:3000/strategy');
  await page.waitForTimeout(5000);

  // Select Strategy Tab - though it's the default
  const overviewSection = page.locator('h1:has-text("Marketing & Strategy")');
  await expect(overviewSection).toBeVisible();

  // Tasks should be visible
  const tasks = page.locator('.task-item');
  const count = await tasks.count();
  console.log('Found ' + count + ' dynamic tasks');

  // Navigate to Social Tab to see hooks
  await page.click('button:has-text("Social Presence")');
  await page.waitForTimeout(2000);

  const hooks = page.locator('.hook-item');
  const hookCount = await hooks.count();
  console.log('Found ' + hookCount + ' viral hooks');

  await page.screenshot({
    path: '/home/jules/verification/strategy_social.png',
    fullPage: true,
  });
});
