import { test, expect } from '@playwright/test';

test('S.M.U.V.E 2.0 Branding and Navigation Check', async ({ page }) => {
  await page.goto('/hub');

  // Verify Title
  const title = await page.textContent('h1');
  expect(title).toContain('S.M.U.V.E 2.0');

  // Verify Navigation buttons exist
  await expect(
    page.locator('.nav-button[title="Artist Profile"]')
  ).toBeVisible();
  await expect(page.locator('.nav-button[title="Hub"]')).toBeVisible();
  await expect(page.locator('.nav-button[title="The Studio"]')).toBeVisible();

  // Check footer watermark
  const footer = page.locator('.watermark-footer');
  await expect(footer).toContainText('Smuve Jeff Presents');
});
