import { test, expect } from '@playwright/test';

test('Verify Tha Spot Hub Enhancements', async ({ page }) => {
  // Bypass auth
  await page.goto('/login');
  await page.evaluate(() => {
    const user = { id: 'test-user', artistName: 'Test operative', email: 'test@smuve.com' };
    const salt = 'smuve_auth_salt_v1'; // match GLOBAL_SECURITY_CONFIG.auth_salt
    const session = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(user) + '|' + salt)));
    sessionStorage.setItem('smuve_auth_session', session);
    localStorage.setItem('smuve_db_user_test@smuve.com', JSON.stringify({
      id: 'test-user',
      artistName: 'Test operative',
      email: 'test@smuve.com'
    }));
  });

  await page.goto('/tha-spot');

  // 1. Verify Neural Sync label exists
  await expect(page.locator('text=NEURAL SYNC')).toBeVisible();

  // 2. Verify Discover Operatives section
  await expect(page.locator('text=DISCOVER_OPERATIVES')).toBeVisible();

  // 3. Verify Pre-Stream Config section
  await page.click('button:has-text("LIVE")');
  await expect(page.locator('text=PRE-STREAM CONFIG')).toBeVisible();

  // 4. Verify Connect buttons
  await expect(page.locator('button:has-text("TWITCH (CONNECT)")')).toBeVisible();

  await page.screenshot({ path: 'tha_spot_verification.png', fullPage: true });
});
