import { test, expect } from '@playwright/test';

test('Verify Tha Spot Gaming Hub and Filters', async ({ page }) => {
  // Mock localStorage for auth bypass
  await page.addInitScript(() => {
    localStorage.setItem('smuve_user_profile', JSON.stringify({
      artistName: 'Jules Test',
      artistType: 'Producer',
      primaryGenre: 'Electronic',
      bio: 'Test bio',
      skills: ['Producer', 'DJ'],
      careerStage: 'Rising Talent',
      careerGoal: 'Release Album'
    }));
  });

  // Try common routes
  await page.goto('http://localhost:4200/tha-spot');

  // Take initial screenshot to debug
  await page.screenshot({ path: 'tests/e2e/initial_load.png' });

  // Look for the "Tha Spot" header or a button to enter
  const title = page.locator('h1:has-text("Tha Spot")');
  if (await title.count() === 0) {
     // If the route /tha-spot doesn't work directly (maybe /hub contains it)
     await page.goto('http://localhost:4200/hub');
     const spotLink = page.locator('a:has-text("Tha Spot"), button:has-text("Tha Spot")');
     if (await spotLink.count() > 0) {
        await spotLink.click();
     } else {
        // Just try clicking some navigation to find it or screenshot
        await page.screenshot({ path: 'tests/e2e/hub_load.png' });
     }
  }

  // Wait for "Tha Spot" title
  await expect(page.locator('h1:has-text("Tha Spot")')).toBeVisible({ timeout: 15000 });

  // Verify Arcade tab
  await expect(page.locator('.tab-btn.active:has-text("Arcade")')).toBeVisible();

  // Verify genre buttons
  const categories = ['Shooter', 'Adventure', 'Sports', 'RPG', 'Classic'];
  for (const category of categories) {
    const btn = page.locator(`button[aria-label="Filter by ${category}"]`);
    await expect(btn).toBeVisible();
  }

  // Click Adventure filter
  await page.locator('button[aria-label="Filter by Adventure"]').click();
  await expect(page.locator('h3:has-text("Mystic Realms")')).toBeVisible();

  // Click Classic filter
  await page.locator('button[aria-label="Filter by Classic"]').click();
  await expect(page.locator('h3:has-text("Pac-Man Retro")')).toBeVisible();
  await expect(page.locator('h3:has-text("Galaga Retro")')).toBeVisible();

  // Verify "PLAY NOW"
  await expect(page.locator('.game-card >> .play-btn').first()).toBeVisible();

  // Verify accessibility link
  const firstGameLink = page.locator('.game-card >> a').first();
  await expect(firstGameLink).toHaveAttribute('target', '_blank');

  await page.screenshot({ path: 'tests/e2e/tha_spot_verified_final.png' });
});
