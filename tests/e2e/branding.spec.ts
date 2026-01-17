import { test, expect } from '@playwright/test';

test('S.M.U.V.E 2.0 Branding and Navigation Check', async ({ page }) => {
  await page.goto('/hub');

  // Verify Title
  const title = await page.textContent('h1');
  expect(title).toContain('S.M.U.V.E 2.0');

  // Verify Navigation buttons exist
  const navButtons = page.locator('.nav-button');
  const count = await navButtons.count();
  expect(count).toBeGreaterThan(5);

  // Check footer watermark
  const footer = await page.locator('footer');
  expect(await footer.innerText()).toContain('Smuve Jeff Presents');
});
