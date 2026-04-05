import { test, expect } from '@playwright/test';

test('DJ Deck V4.2 Visual and Functional Check', async ({ page }) => {
  // Navigate to DJ view (assuming it bypasses auth in dev or we use a session)
  await page.goto('http://localhost:4200/dj');

  // Check for the new skeuomorphic elements
  await expect(page.locator('.deck-chassis')).toHaveCount(2);
  await expect(page.locator('.vinyl-platter')).toHaveCount(2);
  await expect(page.locator('.central-mixer-console')).toBeVisible();

  // Verify Master Saturation Drive knob
  await expect(page.locator('.knob-group .label').filter({ hasText: 'DRIVE' })).toBeVisible();

  // Verify Performance FX buttons
  await expect(page.locator('.btn-chrome').filter({ hasText: 'BRAKE' })).toHaveCount(2);

  // Check for 3D transforms
  const deckA = page.locator('.deck-a-transform');
  const styleA = await deckA.evaluate(el => window.getComputedStyle(el).transform);
  expect(styleA).not.toBe('none');

  // Capture screenshot for visual confirmation
  await page.screenshot({ path: 'dj_deck_v42_verification.png', fullPage: true });
});
