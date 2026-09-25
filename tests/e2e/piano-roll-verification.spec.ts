import { expect, test } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

async function expectNoPageOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Piano Roll production layout', () => {
  test('renders the desktop editor without page-level overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAuthenticatedSession(page);
    await page.goto('/studio?view=piano-roll');

    await expect(page.locator('.piano-roll-surface')).toBeVisible();
    await expect(page.locator('.pr-header')).toBeVisible();
    await expect(page.locator('.pr-grid canvas')).toBeVisible();
    await expect(page.locator('.pr-auto-toolbar')).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test('keeps the grid and inspector usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAuthenticatedSession(page);
    await page.goto('/studio?view=piano-roll');

    await expect(page.locator('.piano-roll-surface')).toBeVisible();
    await expect(page.locator('.pr-header')).toBeVisible();
    await expect(page.locator('.pr-grid')).toBeVisible();
    await expect(page.locator('.pr-canvas-row--inspector')).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
