import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Verify Tha Spot Gaming Hub and Filters', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');
  const arenaSpotlight = page.getByTestId('arena-spotlight');
  const searchInput = page.getByLabel('Search cabinets');

  await expect(page.getByRole('heading', { name: 'All Games' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game library' })).toBeVisible();
  await expect(searchInput).toBeVisible();
  await expect(
    arenaSpotlight.getByRole('heading', {
      name: 'Tha Battlefield',
      exact: true,
    })
  ).toBeVisible();

  await page.getByRole('button', { name: /Producer Lounge/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Producer Lounge' })
  ).toBeVisible();
  await expect(page.getByText('Producer Lounge Daily Challenge')).toBeVisible();

  await searchInput.fill('Tempo');
  await expect(
    page.locator('.game-card').filter({ hasText: 'Tempo Lockdown' })
  ).toHaveCount(1);
  await expect(
    page.locator('.game-card').filter({ hasText: 'Tha Battlefield' })
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: 'Multiplayer' }).click();
  await expect(
    page.locator('.game-card').filter({ hasText: 'Tha Battlefield' })
  ).toHaveCount(1);
});
