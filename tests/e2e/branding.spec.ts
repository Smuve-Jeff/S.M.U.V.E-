import { test, expect } from '@playwright/test';

test('S.M.U.V.E 2.0 Branding and Navigation Check', async ({ page }) => {
  await page.goto('/hub');

  // Verify Title
  const title = await page.textContent('h1');
  expect(title).toContain('S.M.U.V.E 2.0');

  // Verify Navigation items exist
  await expect(page.locator('.nav-item[title="Artist Profile"]')).toBeVisible();
  await expect(page.locator('.nav-item[title="Hub"]')).toBeVisible();
  await expect(page.locator('.nav-item[title="The Studio"]')).toBeVisible();

  // Check footer branding
  const footer = page.locator('.app-footer');
  await expect(footer).toContainText('Smuve Jeff Presents');
});
