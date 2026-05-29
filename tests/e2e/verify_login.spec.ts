import { test, expect } from '@playwright/test';

test('login page should be visible and not blank', async ({ page }) => {
  await page.goto('http://localhost:3000/login');

  // Wait for the S.M.U.V.E. text to appear
  const header = page.locator('h1');
  await expect(header).toContainText('S.M.U.V.E.');

  // Check for the login form
  const emailInput = page.locator('input[name="email"]');
  await expect(emailInput).toBeVisible();

  const passwordInput = page.locator('input[name="password"]');
  await expect(passwordInput).toBeVisible();

  // Take a screenshot for verification
  await page.screenshot({ path: 'login_verification.png' });
});
