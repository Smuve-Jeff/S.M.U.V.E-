import {
  test,
  expect,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Real touch coverage for the two studio gestures that phones depend on and
 * that jsdom can never prove: the Performance Grid long-press "overwrite this
 * scene" and the Channel Rack drag-paint step lane.
 *
 * Both are driven through Chrome DevTools touch events rather than synthetic
 * pointer events, because the interesting part of each gesture is what the
 * browser does to a touch pointer stream:
 *
 *  - a long press must not also fire the tap that launches the scene;
 *  - a drag must keep painting while the browser holds implicit pointer
 *    capture on the cell that received `pointerdown`, so sibling cells never
 *    see `pointerenter` or `pointermove` themselves.
 */

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

type Point = { x: number; y: number };

async function sendTouch(
  client: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  point?: Point
) {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y) }] : [],
  });
}

const patternOps = (page: Page) =>
  page.evaluate(() => (window as any).__patternOps as string[]);

/**
 * Press and hold until the gesture has visibly registered, then release a beat
 * later. Releasing on a fixed timer made this race the app's click-suppression
 * window; releasing just after the press is acknowledged reproduces what a real
 * half-second hold does — and proves the release tap stays swallowed.
 */
async function touchHoldUntil(
  page: Page,
  client: CDPSession,
  point: Point,
  until: () => Promise<boolean>,
  releaseAfterMs = 250
) {
  await sendTouch(client, 'touchStart', point);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (await until()) break;
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(releaseAfterMs);
  await sendTouch(client, 'touchEnd');
}

async function touchDrag(
  page: Page,
  client: CDPSession,
  from: Point,
  to: Point,
  steps = 10
) {
  await sendTouch(client, 'touchStart', from);
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps;
    await sendTouch(client, 'touchMove', {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    });
    await page.waitForTimeout(16);
  }
  await sendTouch(client, 'touchEnd');
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no layout box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
});

test.describe('phone touch gestures', () => {
  test.setTimeout(240_000);

  /**
   * The studio is a 3.4 MB lazy route chunk that the dev server compiles on
   * first request, so the first paint of a cold run can take a while. These
   * specs must not mistake that for a missing view.
   */
  const FIRST_PAINT_MS = 120_000;

  test('Performance Grid hold overwrites the scene and swallows the launch tap', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/studio?view=performer');
    // The studio is a 3.4 MB lazy chunk in dev; give the first paint room.
    await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
      'data-studio-workspace',
      'performer',
      { timeout: FIRST_PAINT_MS }
    );
    // Studio views are deferred `on viewport`; on a phone the workspace frame
    // starts below the fold, so it has to be scrolled in before it renders.
    await page.locator('.studio-workspace-frame').scrollIntoViewIfNeeded();
    await expect(page.locator('app-performer')).toBeVisible({ timeout: 30_000 });
    // The Performance Grid lives in the Performer's scene matrix, which is a
    // tab rather than the default keyboard layout.
    await page.getByRole('tab', { name: 'Matrix' }).click();
    await expect(page.locator('app-performance-grid')).toBeVisible({
      timeout: 30_000,
    });

    const seeded = await page.evaluate(() => {
      const studio = (window as any).ng.getComponent(
        document.querySelector('app-studio')
      );
      const manager = studio.musicManager;
      const tracks = manager.tracks();
      if (!tracks.length) throw new Error('studio has no tracks to scene-capture');
      const trackId = tracks[0].id;

      // A scene that exists but holds an older pattern...
      manager.tracks.update((list: any[]) =>
        list.map((track) =>
          track.id === trackId
            ? {
                ...track,
                notes: [
                  { id: 'qa-stale', midi: 67, step: 4, length: 1, velocity: 0.8 },
                ],
                steps: new Array(64).fill(false),
                patternSlots: [],
                activePatternSlotId: null,
              }
            : track
        )
      );
      manager.capturePatternSlot(trackId, 'slot-0', 'Scene 1');

      // ...while the live pattern is something else, so launching the scene
      // would be visible as a restore of the stale notes.
      manager.tracks.update((list: any[]) =>
        list.map((track) =>
          track.id === trackId
            ? {
                ...track,
                notes: [
                  { id: 'qa-live', midi: 60, step: 0, length: 1, velocity: 0.8 },
                ],
                activePatternSlotId: null,
              }
            : track
        )
      );

      // Record which real operation each gesture reaches.
      const scope = window as any;
      scope.__patternOps = [];
      const capture = manager.capturePatternSlot.bind(manager);
      const recall = manager.recallPatternSlot.bind(manager);
      manager.capturePatternSlot = (id: string, slotId: string, name: string) => {
        scope.__patternOps.push(`capture:${slotId}`);
        return capture(id, slotId, name);
      };
      manager.recallPatternSlot = (id: string, slotId: string) => {
        scope.__patternOps.push(`recall:${slotId}`);
        return recall(id, slotId);
      };

      const track = manager.tracks().find((t: any) => t.id === trackId);
      return {
        trackId,
        column: manager.tracks().findIndex((t: any) => t.id === trackId),
        versions: track.patternSlots[0].versions.length,
      };
    });

    const slot = page
      .locator('app-performance-grid .clip-cell-v42')
      .nth(seeded.column * 8);
    await expect(slot).toBeVisible();
    await slot.scrollIntoViewIfNeeded();
    const slotBox = await slot.boundingBox();
    expect(slotBox!.x).toBeGreaterThanOrEqual(0);
    expect(slotBox!.x + slotBox!.width).toBeLessThanOrEqual(390);
    const client = await page.context().newCDPSession(page);

    // Long press (500 ms) then release: the finger is held past the threshold,
    // and the compatibility click Chrome fires on release must not launch the
    // scene the press just overwrote. No click is injected here — the browser's
    // own release click is the thing under test.
    await touchHoldUntil(
      page,
      client,
      await centerOf(slot),
      async () => (await patternOps(page)).length > 0,
      150
    );
    await page.waitForTimeout(400);

    const afterHold = await page.evaluate((trackId) => {
      const studio = (window as any).ng.getComponent(
        document.querySelector('app-studio')
      );
      const track = studio.musicManager.tracks().find((t: any) => t.id === trackId);
      const slotState = track.patternSlots.find((s: any) => s.id === 'slot-0');
      return {
        ops: (window as any).__patternOps as string[],
        versions: slotState.versions.length,
        latest: slotState.versions[slotState.versions.length - 1].notes.map(
          (note: any) => note.id
        ),
        live: track.notes.map((note: any) => note.id),
      };
    }, seeded.trackId);

    expect(afterHold.ops).toEqual(['capture:slot-0']);
    expect(afterHold.versions).toBe(seeded.versions + 1);
    expect(afterHold.latest).toEqual(['qa-live']);
    expect(afterHold.live).toEqual(['qa-live']);

    // The suppression window must expire, otherwise the long-press fix would
    // have broken ordinary tapping. A launch touches every track holding a scene
    // in that row, so the tap is asserted as "a recall happens" rather than as an
    // exact op count.
    await page.waitForTimeout(900);
    await slot.dispatchEvent('click');
    const afterTap = await patternOps(page);
    expect(afterTap[0]).toBe('capture:slot-0');
    expect(afterTap).toContain('recall:slot-0');
    expect(afterTap.filter((op) => op.startsWith('capture'))).toHaveLength(1);
    expect(pageErrors).toEqual([]);
  });

  test('Channel Rack touch drag paints and erases a run of steps', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/studio?view=channel-rack');
    await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
      'data-studio-workspace',
      'channel-rack',
      { timeout: FIRST_PAINT_MS }
    );
    await page.locator('.studio-workspace-frame').scrollIntoViewIfNeeded();
    await expect(page.locator('app-channel-rack')).toBeVisible({ timeout: 30_000 });

    const seeded = await page.evaluate(() => {
      const rack = (window as any).ng.getComponent(
        document.querySelector('app-channel-rack')
      );
      const manager = rack.musicManager;
      const tracks = manager.tracks();
      if (!tracks.length) throw new Error('channel rack has no tracks');
      const trackId = tracks[0].id;
      manager.selectedTrackId.set(trackId);
      manager.tracks.update((list: any[]) =>
        list.map((track) =>
          track.id === trackId
            ? {
                ...track,
                notes: [
                  { id: 'qa-anchor', midi: 60, step: 0, length: 1, velocity: 0.8 },
                ],
                steps: new Array(64).fill(false),
                patternSlots: [],
                activePatternSlotId: null,
              }
            : track
        )
      );
      return { trackId, windowStart: rack.windowStart() };
    });

    const grid = page.locator(
      `app-channel-rack .channel-rack-step-grid[data-track-id="${seeded.trackId}"]`
    );
    await expect(grid).toBeVisible();
    const cells = grid.locator('.channel-rack-step-cell');
    await expect(cells).toHaveCount(16);

    const start = seeded.windowStart + 1;
    const cellState = async () =>
      Promise.all(
        [0, 1, 2, 3, 4, 5, 6].map(async (index) =>
          (await cells.nth(index).getAttribute('aria-pressed')) === 'true'
        )
      );

    expect(await cellState()).toEqual([
      true, false, false, false, false, false, false,
    ]);

    // Paint step 1 → 5 with one continuous touch drag. Both ends have to be
    // inside the phone viewport, otherwise the touch never lands on the lane —
    // which is exactly the bug the lane's overflow alignment used to cause.
    const client = await page.context().newCDPSession(page);
    const from = await centerOf(cells.nth(1));
    const to = await centerOf(cells.nth(5));
    expect(Math.min(from.x, to.x)).toBeGreaterThan(0);
    expect(Math.max(from.x, to.x)).toBeLessThan(390);
    await touchDrag(page, client, from, to);

    expect(await cellState()).toEqual([
      true, true, true, true, true, true, false,
    ]);

    const painted = await page.evaluate(
      ({ trackId, start }) => {
        const rack = (window as any).ng.getComponent(
          document.querySelector('app-channel-rack')
        );
        const track = rack.musicManager
          .tracks()
          .find((t: any) => t.id === trackId);
        return track.notes
          .map((note: any) => note.step)
          .filter((step: number) => step > 0)
          .sort((a: number, b: number) => a - b)
          .map((step: number) => step - start);
      },
      { trackId: seeded.trackId, start }
    );
    expect(painted).toEqual([0, 1, 2, 3, 4]);

    // Erase steps 1 → 3 by dragging across the lit run.
    await touchDrag(page, client, await centerOf(cells.nth(1)), await centerOf(cells.nth(3)));


    expect(await cellState()).toEqual([
      true, false, false, false, true, true, false,
    ]);
    expect(pageErrors).toEqual([]);
  });
});
