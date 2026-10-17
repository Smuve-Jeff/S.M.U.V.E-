import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Branding + navigation smoke check for the Executive Command hub.
 *
 * The previous assertions had drifted from the shipped design and were failing
 * on `main` before any of this work: it looked for "S.M.U.V.E 2.0 // EXECUTIVE
 * COMMAND" (the hub renders "S.M.U.V.E. 2.0 // EXECUTIVE COMMAND", with the
 * trailing period), a "Welcome Back," heading (the hero reads "Welcome back,"
 * lowercase with the artist name), "Open Studio" / "Open Tha Spot" buttons
 * (the studio entry is the `.workspace-card-studio` tile, and Tha Spot is a
 * footer text button), and "©️ Smuve Jeff Presents" (the footer renders
 * "© Smuve Jeff Presents · est. mmxxvi").
 */
test('S.M.U.V.E 2.0 branding and navigation check', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/hub');

  await expect(page).toHaveTitle(/S\.M\.U\.V\.E 2\.0/i);
  await expect(
    page.getByText('S.M.U.V.E. 2.0 // EXECUTIVE COMMAND')
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Welcome back,/i })
  ).toBeVisible();

  // The studio entry point is the workspace tile, not a labelled button.
  await expect(page.locator('.workspace-card-studio')).toBeVisible();
  await expect(
    page.locator('.workspace-card-studio').filter({ hasText: 'Enter Studio' })
  ).toBeVisible();

  // Tha Spot is reachable from the hub footer. The icon ligature text
  // prefixes the accessible name, so match on the visible label instead of an
  // exact role name.
  await expect(
    page.locator('footer.hub-footer button').filter({ hasText: 'Tha Spot' })
  ).toBeVisible();
  await expect(page.getByText(/Smuve Jeff Presents/)).toBeVisible();
});
