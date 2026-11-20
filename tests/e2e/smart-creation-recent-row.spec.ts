import { expect, test, type Page } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

const MEMORY_KEY = 'smuve_smart_sheet_memory';

/**
 * Seed the sheet's recall payload the way the component persists it: last-used
 * ids plus per-item `recent` stamps (the map behind the Recently Used row).
 */
async function seedRecall(page: Page, memory: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: MEMORY_KEY, value: JSON.stringify(memory) }
  );
}

/**
 * The Studio exposes the 1-Tap trigger in several places (topbar tool, centre
 * CREATE pill, mobile drawer hero). Click whichever one this viewport shows.
 */
const CREATION_TRIGGERS = [
  '.comp-tool-create',
  '.comp-tab-create-hero',
  '.comp-drawer-create-hero',
  '[aria-label="Open 1-Tap Smart Creation Assistant"]',
  '[aria-label="Open 1-Tap Smart Music Creation Assistant"]',
];

async function openCreationSheet(page: Page) {
  for (const selector of CREATION_TRIGGERS) {
    const trigger = page.locator(selector).first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      return;
    }
  }
  throw new Error('No visible Smart Creation trigger found in the Studio');
}

test.describe('Smart Creation Sheet — Recently Used row', () => {
  test('is visible in the Studio and re-arms a groove from its chip', async ({ page }) => {
    test.setTimeout(90_000);
    await seedAuthenticatedSession(page);
    await page.addInitScript(() => {
      // Skip the one-time Music Map; this spec is about the creation sheet.
      localStorage.setItem('smuve_music_map_seen', '1');
    });

    const usedAt = Date.now();
    await seedRecall(page, {
      lastStarterId: 'afrobeats',
      lastVocalPresetId: 'crisp-radio',
      lastChordMoodId: 'gospel',
      lastTab: 'beats',
      updatedAt: usedAt,
      recent: {
        'starter:afrobeats': usedAt - 3000,
        'vocal:crisp-radio': usedAt - 2000,
        'chord:gospel': usedAt - 1000,
      },
    });

    await page.goto('/studio-classic');
    await expect(page.locator('.comp-shell')).toBeVisible({ timeout: 30_000 });

    await openCreationSheet(page);

    const sheet = page.locator('app-smart-creation-sheet .sc-sheet');
    await expect(sheet).toBeVisible();

    // Combined row: newest first, across all three catalogues.
    const chips = sheet.locator('.sc-recent-chip');
    await expect(sheet.locator('.sc-recent-row')).toBeVisible();
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toContainText('Gospel & Soul');
    await expect(chips.nth(0)).toContainText('Chords');
    await expect(chips.nth(1)).toContainText('Crisp Radio Lead');
    await expect(chips.nth(1)).toContainText('Vocal');
    await expect(chips.nth(2)).toContainText('Lagos Sunset');
    await expect(chips.nth(2)).toContainText('Pack');

    // The recalled packs still lead their own grids behind the row.
    await expect(sheet.locator('.sc-starter-card').first()).toContainText('Lagos Sunset');

    // Functional: the pack chip loads the groove, and the Studio closes the
    // sheet through the (closeSheet) binding it wires onto the component.
    // The replacement gate autosaves the seeded starter first; mark the fixture
    // clean so this recall test does not wait on an IndexedDB write.
    await page.evaluate(() => {
      const studio = (window as any).ng.getComponent(
        document.querySelector('app-studio'),
      );
      studio.projectWorkspace.isDirty.set(false);
    });
    await chips.nth(2).click();

    // Studio quiet mode records routine success in the Activity log instead of
    // painting a toast, so the visible proof is the view handoff and unmount.
    // Arrangement is the view the sheet asks for, so its (navigateToView)
    // binding reached the Studio…
    await expect(page).toHaveURL(/view=arrangement/, { timeout: 15_000 });
    // …and (closeSheet) unmounted it.
    await expect(page.locator('app-smart-creation-sheet')).toHaveCount(0);
  });

  test('stays hidden until something has actually been used', async ({ page }) => {
    test.setTimeout(90_000);
    await seedAuthenticatedSession(page);
    await page.addInitScript(() => {
      localStorage.setItem('smuve_music_map_seen', '1');
    });

    await page.goto('/studio-classic');
    await expect(page.locator('.comp-shell')).toBeVisible({ timeout: 30_000 });

    await openCreationSheet(page);

    const sheet = page.locator('app-smart-creation-sheet .sc-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.sc-recent-row')).toHaveCount(0);
  });
});
