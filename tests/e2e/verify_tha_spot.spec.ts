import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Verify Tha Spot Gaming Hub and Filters', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');
  const searchInput = page.getByLabel('Search cabinets').filter({ visible: true });
  const rooms = page.locator('.catalog-filters-row select').first();
  await expect(page.getByRole('heading', { name: 'ALL_CABINETS' })).toBeVisible();
  await expect(searchInput).toBeVisible();
  await expect(page.getByTestId('game-card').first()).toBeVisible();
  await rooms.selectOption({ label: 'Producer Lounge' });
  await expect(rooms.locator('option:checked')).toHaveText('Producer Lounge');
  await searchInput.fill('Tempo');
  await expect(page.getByTestId('game-card').filter({ hasText: 'Tempo Lockdown' })).toHaveCount(1);
  await expect(page.getByTestId('game-card').filter({ hasText: 'Tha Battlefield' })).toHaveCount(0);
  await page.getByRole('button', { name: 'RESET', exact: true }).click();
  await expect(searchInput).toHaveValue('');
  await expect(rooms).toHaveValue('all');
  await expect(page.getByTestId('game-card').first()).toBeVisible();
});
