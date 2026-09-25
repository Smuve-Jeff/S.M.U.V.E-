import { expect, test } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

type ProductionView = {
  route: string;
  selector: string;
};

const productionViews: ProductionView[] = [
  {
    route: 'arrangement',
    selector: 'app-beginner-wizard, app-arrangement-view',
  },
  { route: 'session', selector: 'app-session-view' },
  { route: 'piano-roll', selector: 'app-piano-roll' },
  { route: 'mixer', selector: 'app-mixer' },
  { route: 'performance', selector: 'app-performance-mode' },
  { route: 'performer', selector: 'app-performer' },
  { route: 'mastering', selector: 'app-mastering-suite' },
  { route: 'drum-machine', selector: 'app-drum-machine' },
  { route: 'channel-rack', selector: 'app-channel-rack' },
  { route: 'effects-rack', selector: 'app-effects-rack-ui' },
  { route: 'vocal-suite', selector: 'app-vocal-suite' },
  { route: 'dj', selector: 'app-dj-deck' },
  { route: 'audio-recorder', selector: 'app-audio-recorder-view' },
  { route: 'sampler', selector: 'app-sampler' },
  { route: 'score', selector: 'app-score-view' },
  { route: 'plugins', selector: 'app-plugin-store' },
  { route: 'sample-library', selector: 'app-sample-library' },
  { route: 'sound-browser', selector: 'app-sound-browser' },
  { route: 'sound-pad', selector: 'app-sound-pad-grid' },
  { route: 'synthesizer', selector: 'app-synthesizer' },
  { route: 'chord-editor', selector: 'app-chord-editor' },
  { route: 'ai-produce', selector: 'app-ai-produce' },
];

const desktopWorkspaces = [
  { name: 'landscape', width: 1440, height: 900 },
  { name: 'portrait', width: 1080, height: 1920 },
  { name: 'short landscape', width: 1366, height: 768 },
];

for (const viewport of desktopWorkspaces) {
  test.describe(`Studio production views · desktop ${viewport.name}`, () => {
    for (const view of productionViews) {
      test(`${view.route} stays inside the production canvas`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await seedAuthenticatedSession(page);
        await page.goto(`/studio?view=${view.route}`);
        await expect(page).toHaveURL(new RegExp(`/studio\\?view=${view.route}`));

        const workspace = page.locator('[data-studio-workspace]');
        const canvas = page.locator('.comp-canvas.studio-primary-canvas');
        const surface = page.locator(view.selector).first();

        await expect(workspace).toHaveAttribute('data-studio-workspace', view.route);
        await expect(canvas).toBeVisible();
        await expect(surface).toBeVisible();

        const layout = await page.evaluate((surfaceSelector) => {
          const root = document.documentElement;
          const workspaceElement = document.querySelector<HTMLElement>(
            '[data-studio-workspace]',
          );
          const canvasElement = document.querySelector<HTMLElement>(
            '.comp-canvas.studio-primary-canvas',
          );
          const surfaceElement = document.querySelector<HTMLElement>(
            surfaceSelector,
          );
          const workspaceRect = workspaceElement?.getBoundingClientRect();
          const canvasRect = canvasElement?.getBoundingClientRect();
          const surfaceRect = surfaceElement?.getBoundingClientRect();

          return {
            viewportWidth: root.clientWidth,
            documentWidth: root.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            workspaceWidth: workspaceRect?.width ?? 0,
            workspaceHeight: workspaceRect?.height ?? 0,
            canvasWidth: canvasRect?.width ?? 0,
            canvasHeight: canvasRect?.height ?? 0,
            canvasLeft: canvasRect?.left ?? 0,
            canvasTop: canvasRect?.top ?? 0,
            canvasRight: canvasRect?.right ?? 0,
            canvasBottom: canvasRect?.bottom ?? 0,
            surfaceLeft: surfaceRect?.left ?? 0,
            surfaceTop: surfaceRect?.top ?? 0,
            surfaceRight: surfaceRect?.right ?? 0,
            surfaceBottom: surfaceRect?.bottom ?? 0,
          };
        }, view.selector);

        const horizontalOverflow = Math.max(
          layout.documentWidth,
          layout.bodyWidth,
        ) - layout.viewportWidth;
        expect(
          horizontalOverflow,
          `${view.route} must not create page-level horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        expect(layout.workspaceWidth).toBeGreaterThan(0);
        expect(layout.workspaceHeight).toBeGreaterThan(0);
        expect(layout.canvasWidth).toBeGreaterThan(320);
        expect(layout.canvasHeight).toBeGreaterThan(180);
        expect(layout.surfaceLeft).toBeGreaterThanOrEqual(layout.canvasLeft - 1);
        expect(layout.surfaceTop).toBeGreaterThanOrEqual(layout.canvasTop - 1);
        expect(layout.surfaceRight).toBeLessThanOrEqual(layout.canvasRight + 1);
        expect(layout.surfaceBottom).toBeLessThanOrEqual(layout.canvasBottom + 1);
        expect(
          pageErrors,
          `${view.route} should not emit uncaught browser errors`,
        ).toEqual([]);
      });
    }
  });
}
