import { test, expect } from '@playwright/test';

test.describe('S.M.U.V.E. 2.0 UI Audit', () => {
  test('should load login page and have visible content', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'login_page.png' });
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // Check if background is solid black/dark blue as expected
    const bgColor = await body.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    console.log('Login BG Color:', bgColor);
  });

  test('should load hub with mock session', async ({ page }) => {
    // Inject mock session
    await page.addInitScript(() => {
      const mockSession = btoa(
        JSON.stringify({
          user: { id: 'test-user', artistName: 'Test Artist' },
          expiry: Date.now() + 86400000,
        }) + '|SMUVE_SALT_V4_SECURE_HASH'
      );
      localStorage.setItem('smuve_auth_session', mockSession);
    });

    await page.goto('/hub');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'hub_page.png' });
    await expect(page.locator('.hub-container')).toBeVisible();
  });

  test('should load studio and verify interactive BPM', async ({ page }) => {
    // Inject mock session
    await page.addInitScript(() => {
      const mockSession = btoa(
        JSON.stringify({
          user: { id: 'test-user', artistName: 'Test Artist' },
          expiry: Date.now() + 86400000,
        }) + '|SMUVE_SALT_V4_SECURE_HASH'
      );
      localStorage.setItem('smuve_auth_session', mockSession);
    });

    await page.goto('/studio');
    await page.waitForTimeout(3000);

    // Check BPM display
    const bpmDisplay = page.locator('strong:has-text("124")');
    await expect(bpmDisplay).toBeVisible();

    // Click BPM to trigger prompt
    await bpmDisplay.first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'studio_bpm_prompt.png' });

    // Verify dialog is visible
    const dialog = page.locator('app-interaction-dialog');
    await expect(dialog).toBeVisible();
  });
});
