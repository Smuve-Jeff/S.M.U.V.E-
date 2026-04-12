import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('S.M.U.V.E 2.0 branding and navigation check', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/hub');

  await expect(page).toHaveTitle(/S\.M\.U\.V\.E 2\.0/i);
  await expect(
    page.getByText('S.M.U.V.E 2.0 // EXECUTIVE COMMAND')
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Welcome Back,/i })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Studio' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Tha Spot' })
  ).toBeVisible();
  await expect(page.getByText('©️ Smuve Jeff Presents')).toBeVisible();
});
