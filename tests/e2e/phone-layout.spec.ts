import { expect, test } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Phone-width guard for the merged Songwriting Studio and the Business Hub.
 *
 * Both defects this pins down shipped through a fully green unit suite: tab
 * labels broke mid-word ("Writer's / Pad") because a labels' box was allowed to
 * wrap, and the pipeline phase heading ran underneath the floating advisor
 * button. Neither is visible to a component test — only the laid-out page knows
 * the width it was given.
 */
const PHONE = { width: 360, height: 640 };

/** Horizontal scroll means something on the page is wider than the phone. */
async function horizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
}

test.describe('phone layout', () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
  });

  test('Songwriting Studio tabs stay whole and never scroll sideways', async ({
    page,
  }) => {
    await page.goto('/songwriting');
    await expect(page.locator('.songwriting-tab')).toHaveCount(2);

    const labels = page.locator('.songwriting-tab .tab-label');
    for (const label of await labels.all()) {
      const box = await label.boundingBox();
      // ~0.95rem text: one line is about 23-25px, a wrapped pair is 45px+.
      expect(box?.height ?? 0).toBeLessThan(32);
      await expect(label).toHaveCSS('white-space', 'nowrap');
    }

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('the Co-Write tab renders its room without overflow', async ({
    page,
  }) => {
    await page.goto('/songwriting/cowrite');

    await expect(page.locator('.cowrite-container')).toBeVisible();
    await expect(
      page.locator('.songwriting-tab.is-active .tab-label')
    ).toHaveText('Co-Write');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('Business Hub reports counted status and fits the phone', async ({
    page,
  }) => {
    await page.goto('/business-suite');

    const status = page.locator('header .text-brand-primary.italic').first();
    await expect(status).toBeVisible();
    // A fixed "OPERATIONAL" claim is exactly what this chip must not say.
    await expect(status).not.toHaveText('OPERATIONAL');

    // Every pathway type the engine builds is offered, not a subset.
    await expect(page.locator('.biz-module-card')).toHaveCount(11, {
      timeout: 15_000,
    });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
