import { test, expect } from '@playwright/test';

test('Verify Tha Spot v4 High-Voltage Experience', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'smuve_user_profile',
      JSON.stringify({
        artistName: 'Jules Test',
        artistType: 'Producer',
        primaryGenre: 'Electronic',
      })
    );
  });

  await page.goto('http://localhost:4200/tha-spot');

  // Verify Header and Title
  await expect(page.locator('h1:has-text("THA SPOT")')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('p:has-text("High Voltage Mode")')).toBeVisible();

  // Verify Category Filters
  const categories = [
    'All',
    'Shooter',
    'Adventure',
    'Sports',
    'Puzzle',
    'Classic',
  ];
  for (const genre of categories) {
    await expect(page.locator(`button:has-text("${genre}")`)).toBeVisible();
  }

  // Test Filter - Classic (should show Pac-Man and Galaga)
  await page.locator('button:has-text("Classic")').click();
  await expect(page.locator('h3:has-text("Pac-Man Retro")')).toBeVisible();
  await expect(page.locator('h3:has-text("Galaga Retro")')).toBeVisible();

  // Test Search
  await page.fill('input[placeholder="Search Simulation..."]', 'Retro');
  await expect(page.locator('h3:has-text("Pac-Man Retro")')).toBeVisible();
  await page.fill('input[placeholder="Search Simulation..."]', '');

  // Verify Card Design (High-Voltage)
  const firstCard = page.locator('.card-voltage').first();
  await expect(firstCard).toBeVisible();

  // Test Matchmaking (Battle Arena)
  await page.locator('button:has-text("Battle Arena")').click();
  const battleCard = page.locator('h3:has-text("Tha Battlefield")').first();
  await battleCard.click();

  // Verify Matchmaking Overlay
  await expect(page.locator('h2:has-text("SEARCHING RIVALS")')).toBeVisible();

  // Wait for Match Found (simulated progress)
  await expect(page.locator('h2:has-text("MATCH FOUND")')).toBeVisible({
    timeout: 15000,
  });

  // Wait for Game to Load
  await expect(page.locator('iframe')).toBeVisible({ timeout: 15000 });

  await page.screenshot({ path: 'tests/e2e/tha_spot_v4_verified.png' });
});
