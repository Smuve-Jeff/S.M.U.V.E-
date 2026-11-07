import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test.describe('S.M.U.V.E advisor launch and anomaly regression', () => {
  test.setTimeout(120_000);

  test('login is quiet and Hub/header controls open and close the same advisor', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    await page.addInitScript(() => {
      const anomalyWindow = window as Window & {
        __smuveAnomalyToasts?: string[];
      };
      anomalyWindow.__smuveAnomalyToasts = [];
      const collectAnomalyToasts = () => {
        const messages = Array.from(
          document.querySelectorAll('app-notification-toast')
        ).map((toast) => toast.textContent || '');
        for (const message of messages) {
          if (/System Anomaly Detected/i.test(message)) {
            anomalyWindow.__smuveAnomalyToasts?.push(message.trim());
          }
        }
      };
      const startObserving = () => {
        if (!document.documentElement) return;
        new MutationObserver(collectAnomalyToasts).observe(
          document.documentElement,
          { childList: true, subtree: true, characterData: true }
        );
        collectAnomalyToasts();
      };
      if (document.documentElement) {
        startObserving();
      } else {
        document.addEventListener('DOMContentLoaded', startObserving, {
          once: true,
        });
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await page.waitForTimeout(1_000);
    const loginToasts = await page.locator('app-notification-toast').innerText();
    expect(loginToasts).not.toMatch(/System Anomaly Detected/i);
    expect(
      await page.evaluate(() => (window as any).__smuveAnomalyToasts)
    ).toEqual([]);

    await seedAuthenticatedSession(page);
    await page.goto('/hub');
    await expect(page.locator('app-hub .hub-command-center')).toBeVisible();
    await page.waitForTimeout(1_000);
    const hubToasts = await page.locator('app-notification-toast').innerText();
    expect(hubToasts).not.toMatch(/System Anomaly Detected/i);

    const advisor = page.locator('app-chatbot .chatbot-container');
    const hubLaunch = page.getByRole('button', {
      name: 'Activate Access to S.M.U.V.E 2.0, your AI Music Manager',
    });
    const headerLaunch = page.getByRole('button', {
      name: 'Toggle S.M.U.V.E advisor',
    });

    await expect(hubLaunch).toBeVisible();
    await expect(headerLaunch).toBeVisible();
    await hubLaunch.click();
    await expect(advisor).toBeVisible();
    await expect(hubLaunch).toHaveAttribute('aria-expanded', 'true');
    await expect(headerLaunch).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('button', { name: 'Close S.M.U.V.E assistant chat' })
      .click();
    await expect(advisor).toBeHidden();
    await expect(hubLaunch).toHaveAttribute('aria-expanded', 'false');

    await headerLaunch.click();
    await expect(advisor).toBeVisible();
    await expect(hubLaunch).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(advisor).toBeHidden();
    await expect(headerLaunch).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'Open Settings' }).click();
    await expect(page.locator('app-settings')).toBeVisible();
    await page.waitForTimeout(1_000);

    // The persistent header widget must keep working after workspace navigation,
    // and entering a real app surface must not surface a false anomaly toast.
    await headerLaunch.click();
    await expect(advisor).toBeVisible();
    await page
      .getByRole('button', { name: 'Close S.M.U.V.E assistant chat' })
      .click();
    await expect(advisor).toBeHidden();
    await page.waitForTimeout(1_000);

    const appToasts = await page.locator('app-notification-toast').innerText();
    expect(appToasts).not.toMatch(/System Anomaly Detected/i);
    expect(
      await page.evaluate(() => (window as any).__smuveAnomalyToasts)
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);

    console.log(
      'Advisor flow: Hub launcher → close; header launcher → Escape; header widget works after Settings navigation.'
    );
    console.log('Page errors:', JSON.stringify(pageErrors, null, 2));
    console.log('Console errors:', JSON.stringify(consoleErrors, null, 2));
  });

  /**
   * Regression: the advisor drawer is a 384px panel from `md` up, but every
   * dismissal affordance used to be phone-only. The header's control row
   * overflowed the clipped panel — pushing the ✕ past the panel's edge — and
   * the click-to-dismiss scrim carried `md:hidden`. A desktop artist who
   * finished chatting therefore had no pointer way out of the overlay. Clicking
   * the workspace beside the drawer has to dismiss it, and the scrim has to
   * catch that click without dimming the workspace on desktop.
   */
  test('a desktop click beside the advisor drawer dismisses it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAuthenticatedSession(page);
    await page.goto('/hub');

    const advisor = page.locator('app-chatbot .chatbot-container');
    const drawer = page.locator('#smuve-assistant-drawer');
    const headerLaunch = page.getByRole('button', {
      name: 'Toggle S.M.U.V.E advisor',
    });

    await expect(headerLaunch).toBeVisible();
    await headerLaunch.click();
    await expect(advisor).toBeVisible();

    // The ✕ has to land inside the clipped panel rather than past its edge.
    const panel = await drawer.boundingBox();
    const closeBox = await page
      .getByRole('button', { name: 'Close S.M.U.V.E assistant chat' })
      .boundingBox();
    expect(panel).not.toBeNull();
    expect(closeBox).not.toBeNull();
    expect(closeBox!.x).toBeGreaterThanOrEqual(panel!.x);
    expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(
      panel!.x + panel!.width
    );

    // Clear of the drawer (which starts at 1056px on a 1440px viewport).
    const outside = { x: 240, y: 420 };
    const scrim = await page.evaluate((point) => {
      const element = document.elementFromPoint(
        point.x,
        point.y
      ) as HTMLElement | null;
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        blur:
          style.getPropertyValue('backdrop-filter') ||
          style.getPropertyValue('-webkit-backdrop-filter'),
        zIndex: style.zIndex,
      };
    }, outside);
    expect(scrim).not.toBeNull();
    expect(scrim!.zIndex).toBe('30');
    expect(scrim!.background).toBe('rgba(0, 0, 0, 0)');
    expect(scrim!.blur || 'none').toBe('none');

    await page.mouse.click(outside.x, outside.y);
    await expect(advisor).toBeHidden();
    await expect(drawer).toHaveCount(0);
    await expect(headerLaunch).toHaveAttribute('aria-expanded', 'false');
  });
});
