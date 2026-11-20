import { expect, test, type Page } from '@playwright/test';
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

/**
 * Phone regressions for the main routed workspaces. These are geometric
 * checks: page-level sideways scroll and route controls outside the viewport.
 * Elements inside an intentional horizontal scroller (profile sections, DJ
 * console, ticker strips) are excluded so a deliberate rail does not read as
 * a layout failure.
 */
const FIXED_PHONE_ROUTES = [
  {
    path: '/hub',
    ready: '.cinematic-stage',
    surfaces: ['.cinematic-stage', '.cinematic-controls'],
    // The stage's thumbnail rail is a deliberate horizontal scroller.
    allowInternalOverflow: true,
  },
  {
    path: '/strategy',
    ready: 'nav[aria-label="Strategy views"]',
    surfaces: ['nav[aria-label="Strategy views"]'],
  },
  {
    path: '/timeline',
    ready: '.sh-header',
    surfaces: ['.sh-header', '.sh-header-actions'],
  },
  {
    path: '/analytics',
    ready: 'section.col-span-12',
    surfaces: ['section.col-span-12'],
  },
  {
    path: '/artist-coach',
    ready: '.coach-container',
    surfaces: ['.coach-container', '.layout'],
  },
  {
    path: '/adaptive-profile',
    ready: '.adaptive-dashboard',
    surfaces: ['.adaptive-dashboard', '.container'],
  },
  {
    path: '/command-center',
    ready: 'h1',
    surfaces: ['h1'],
  },
  {
    path: '/masterclass',
    ready: '.sg-shell',
    surfaces: ['.sg-header', '.sg-tabs'],
    // The section tabs are a deliberate horizontal scroller on phones.
    allowInternalOverflow: true,
  },
] as const;

async function mockAppApi(page: Page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path.endsWith('/security/logs') || path.endsWith('/security/sessions')
        ? '[]'
        : '{}';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body,
    });
  });
}

type OffscreenItem = {
  tag: string;
  text: string;
  left: number;
  right: number;
};

async function offscreenRouteContent(page: Page): Promise<OffscreenItem[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.route-anim-host');
    if (!root) return [{ tag: 'ROUTE', text: 'missing route host', left: 0, right: 0 }];
    const viewport = window.innerWidth;

    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      );
    };

    const insideHorizontalScroller = (element: Element) => {
      for (
        let parent = element.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      ) {
        const overflow = getComputedStyle(parent).overflowX;
        if (overflow === 'auto' || overflow === 'scroll') return true;
      }
      return false;
    };

    return Array.from(
      root.querySelectorAll(
        'button, a, input, select, textarea, h1, h2, h3, h4, h5'
      )
    )
      .filter(isVisible)
      .filter((element) => !insideHorizontalScroller(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
          left: rect.left,
          right: rect.right,
        };
      })
      .filter((item) => item.left < -0.5 || item.right > viewport + 0.5);
  });
}

for (const width of [320, 360, 390] as const) {
  test.describe(`main phone layout at ${width}px`, () => {
    test.use({ viewport: { width, height: 720 } });

    test.beforeEach(async ({ page }) => {
      await seedAuthenticatedSession(page);
      await mockAppApi(page);
    });

    test('fixed routes keep controls and layout surfaces inside the viewport', async ({
      page,
    }) => {
      test.setTimeout(150_000);

      for (const route of FIXED_PHONE_ROUTES) {
        await test.step(route.path, async () => {
          await page.goto(route.path);
          const ready = page.locator(route.ready).first();
          await expect(ready).toBeVisible({ timeout: 30_000 });
          await page.waitForTimeout(450);

          const offenders = await offscreenRouteContent(page);
          expect(offenders, `${route.path} has offscreen content`).toEqual([]);
          expect(
            await horizontalOverflow(page),
            `${route.path} page has sideways overflow`
          ).toBeLessThanOrEqual(1);

          const allowInternalOverflow =
            'allowInternalOverflow' in route && route.allowInternalOverflow;

          for (const surface of route.surfaces) {
            const locator = page.locator(surface).first();
            const box = await locator.boundingBox();
            expect(box, `${route.path} ${surface} is not rendered`).not.toBeNull();
            expect(box!.x, `${route.path} ${surface} starts offscreen`).toBeGreaterThanOrEqual(
              -0.5
            );
            expect(
              box!.x + box!.width,
              `${route.path} ${surface} ends offscreen`
            ).toBeLessThanOrEqual(width + 0.5);
            if (!allowInternalOverflow) {
              expect(
                await locator.evaluate(
                  (element) => element.scrollWidth - element.clientWidth
                ),
                `${route.path} ${surface} has internal horizontal overflow`
              ).toBeLessThanOrEqual(1);
            }
          }
        });
      }
    });
  });
}

test.describe('Masterclass phone layout at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAppApi(page);
  });

  test('all three tabs keep the strip and lesson body inside the phone', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/masterclass');
    await expect(page.locator('.sg-shell')).toBeVisible({ timeout: 30_000 });

    const tabs = page.locator('.sg-tab');
    await expect(tabs).toHaveCount(3);

    for (let index = 0; index < 3; index += 1) {
      await tabs.nth(index).click();
      await page.waitForTimeout(250);

      expect(
        await horizontalOverflow(page),
        `Masterclass tab ${index} has sideways overflow`
      ).toBeLessThanOrEqual(1);
      expect(
        await offscreenRouteContent(page),
        `Masterclass tab ${index} has offscreen content`
      ).toEqual([]);

      const strip = await page.locator('.sg-tabs').boundingBox();
      const tab = await tabs.nth(index).boundingBox();
      expect(strip, `Masterclass tab ${index} strip is not rendered`).not.toBeNull();
      expect(tab, `Masterclass tab ${index} is not rendered`).not.toBeNull();
      expect(
        strip!.height,
        `Masterclass tab ${index} is vertically clipped`
      ).toBeGreaterThanOrEqual(tab!.height);

      await expect(page.locator('.sg-scroll')).toBeVisible();
    }
  });
});

test.describe('Settings tabs at 320px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAppApi(page);
  });

  test('every tab keeps its controls inside the content area', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/settings');

    const content = page.locator('.settings-content-area');
    await expect(content).toBeVisible({ timeout: 30_000 });

    const tabs = page.locator('.settings-tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      await tabs.nth(index).click();
      await page.waitForTimeout(120);

      const result = await content.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const offscreen = Array.from(
          element.querySelectorAll(
            'button, input, select, textarea, h1, h2, h3, h4, h5, p, .setting-item'
          )
        )
          .filter((child) => {
            const childRect = child.getBoundingClientRect();
            const style = getComputedStyle(child);
            return (
              childRect.width > 0 &&
              childRect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              (childRect.left < rect.left - 0.5 ||
                childRect.right > rect.right + 0.5)
            );
          })
          .map((child) => ({
            tag: child.tagName,
            text: (child.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
          }));

        return {
          overflow: element.scrollWidth - element.clientWidth,
          offscreen,
        };
      });

      expect(result.overflow, `Settings tab ${index} width`).toBeLessThanOrEqual(1);
      expect(result.offscreen, `Settings tab ${index} offscreen controls`).toEqual([]);
    }
  });
});
