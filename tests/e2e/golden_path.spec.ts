import { test, expect } from '@playwright/test';

test.describe('SMUVE 2.0 Golden Path Verification', () => {
  test('should complete the full artist onboarding and enter studio', async ({ page }) => {
    // 1. Login/Register (Assuming bypass or mock)
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();

    // Fill in credentials for a new artist
    await page.fill('input[type="email"]', 'elite_artist@smuve.ai');
    await page.fill('input[type="password"]', 'HardenedPass123!@#');
    await page.click('button:has-text("Initialize Genesis")');

    // 2. Artist Questionnaire
    await expect(page).toHaveURL(/.*hub/);
    // Since it's the first time, it should show the questionnaire if not completed
    // Or we navigate to it.
    await page.goto('/profile');
    await expect(page.locator('app-artist-questionnaire')).toBeVisible();

    // Complete a few steps
    await page.click('button:has-text("NEXT")');
    await page.click('button:has-text("NEXT")');
    await page.click('button:has-text("COMPLETE DNA UPLINK")');

    // 3. Executive Hub
    await expect(page).toHaveURL(/.*hub/);
    await expect(page.locator('text=EXECUTIVE HUB')).toBeVisible();
    await expect(page.locator('.bento-grid')).toBeVisible();

    // 4. Enter Studio
    await page.click('button:has-text("STUDIO")');
    await expect(page).toHaveURL(/.*studio/);
    await expect(page.locator('text=SMUVE STUDIO PRO')).toBeVisible();

    // 5. Verify Mastering & Roast
    await page.click('button:has-text("Mastering")');
    await page.click('button:has-text("AUTO-PROCESS")');
    // Check if a roast appears
    const roast = page.locator('.mastering-suite-container p.italic');
    await expect(roast).not.toBeEmpty();

    // 6. Tha Spot Check
    await page.goto('/tha-spot');
    await expect(page.locator('text=THA SPOT')).toBeVisible();
    await expect(page.locator('text=GAMING')).toBeVisible();
    await expect(page.locator('text=PLUTO TV')).toBeVisible();
  });
});
