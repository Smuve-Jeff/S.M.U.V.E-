import { test, expect } from '@playwright/test';

test('Verify Tha Spot Gaming Hub and Filters', async ({ page }) => {
  await page.goto('/tha-spot');

  await expect(page.getByRole('heading', { name: 'All Games' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game library' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tha Battlefield', exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: /Producer Lounge/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Producer Lounge' })
  ).toBeVisible();
  await expect(page.getByText('Producer Lounge Daily Challenge')).toBeVisible();
});
