import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

const phoneWidths = [360, 430] as const;

for (const width of phoneWidths) {
  test(`the mobile More badge clears its icon at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedAuthenticatedSession(page);
    await page.goto('/hub');

    const moreButton = page.getByRole('button', {
      name: /open more workspaces/i,
    });
    const badge = moreButton.locator('.mobile-nav-badge');
    const icon = moreButton.locator('.material-symbols-outlined').first();

    await expect(moreButton).toBeVisible();
    await expect(badge).toBeVisible();
    await expect(icon).toBeVisible();

    const [badgeBox, iconBox] = await Promise.all([
      badge.boundingBox(),
      icon.boundingBox(),
    ]);

    expect(badgeBox, 'the More badge must have a rendered box').not.toBeNull();
    expect(iconBox, 'the More icon must have a rendered box').not.toBeNull();

    // The badge is allowed to overhang the narrow button, but it must sit to
    // the right of the icon its count belongs to. A negative gap means the
    // number is covering the navigation glyph and the badge needs repositioning.
    const horizontalGap = badgeBox!.x - (iconBox!.x + iconBox!.width);
    expect(
      horizontalGap,
      `badge overlaps the More icon by ${Math.abs(horizontalGap)}px at ${width}px`
    ).toBeGreaterThanOrEqual(0);

    // Keep the badge inside the viewport so clearing the icon cannot push the
    // count itself off the edge of a phone.
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(width + 0.5);
  });
}
