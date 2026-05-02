import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('DJ deck v2.0 visual and functional check', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/studio');

  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByText('STUDIO PRO')).toBeVisible();
  await expect(page.locator('.deck-chassis')).toHaveCount(2);
  await expect(page.locator('.vinyl-platter')).toHaveCount(2);
  await expect(page.locator('.central-mixer-console')).toBeVisible();
  await expect(
    page.locator('.knob-group .label').filter({ hasText: 'DRIVE' })
  ).toBeVisible();
  await expect(
    page.locator('.btn-chrome').filter({ hasText: 'BRAKE' })
  ).toHaveCount(2);
  const deckA = page.locator('.deck-a-transform');
  const styleA = await deckA.evaluate(
    (el) => window.getComputedStyle(el).transform
  );
  expect(styleA).not.toBe('none');
});
