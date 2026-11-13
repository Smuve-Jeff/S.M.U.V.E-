import { test, expect, type Page } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

interface SeedSet {
  /** Logical project id (metadata.id). */
  projectId: string;
  name: string;
  bpm: number;
  /** Age in ms — smaller is fresher. */
  savedAgoMs: number;
  source: 'manual' | 'autosave';
  trackCount: number;
  genre?: string;
  version?: number;
}

/**
 * Write Studio project bundles straight into the app's IndexedDB, the same
 * way `ProjectWorkspaceService` persists them (record keys are prefixed
 * project_/autosave_/recovery_, which the bundle scanner requires).
 */
async function seedSets(page: Page, sets: SeedSet[]): Promise<void> {
  await page.evaluate(async (seed) => {
    const openDb = (version?: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = version
          ? indexedDB.open('SMUVE_OFFLINE_DB', version)
          : indexedDB.open('SMUVE_OFFLINE_DB');
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    let db = await openDb();
    if (!db.objectStoreNames.contains('projects')) {
      const nextVersion = db.version + 1;
      db.close();
      db = await openDb(nextVersion);
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      for (const set of seed) {
        const now = Date.now();
        const savedAt = now - set.savedAgoMs;
        const prefix = set.source === 'manual' ? 'project' : 'autosave';
        store.put({
          id: `${prefix}_${set.projectId}`,
          metadata: {
            id: set.projectId,
            name: set.name,
            bpm: set.bpm,
            key: 'C',
            genre: set.genre ?? 'house',
            mood: 'energetic',
            tags: ['qa'],
            createdAt: now - 86_400_000,
            updatedAt: savedAt,
            lastOpenedAt: savedAt,
            version: set.version ?? 1,
          },
          tracks: Array.from({ length: set.trackCount }, (_, index) => ({
            id: `track-${set.projectId}-${index}`,
            name: `Track ${index + 1}`,
            type: 'midi',
            notes: [],
            clips: [],
          })),
          automation: { lanes: [], macros: [], modulationSources: [] },
          mixState: { masterGain: 0.8 },
          notes: '',
          exportedAt: savedAt,
          savedAt,
          source: set.source,
        });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, sets);
}

const SETS: SeedSet[] = [
  {
    projectId: 'set-alpha',
    name: 'Alpha Loop',
    bpm: 128,
    savedAgoMs: 60_000,
    source: 'autosave',
    trackCount: 3,
    genre: 'house',
  },
  {
    projectId: 'set-beta',
    name: 'Beta Sketch',
    bpm: 92,
    savedAgoMs: 120_000,
    source: 'manual',
    trackCount: 2,
    genre: 'rnb',
    version: 2,
  },
];

/** Confirm the replace-dirty-session dialog when it appears. */
async function confirmReplaceIfShown(page: Page): Promise<void> {
  // Scope to the shared alert dialog: the Sets panel itself has role=dialog.
  const dialog = page.locator('app-interaction-dialog [role="dialog"]');
  try {
    await dialog.waitFor({ state: 'visible', timeout: 1_500 });
  } catch {
    return;
  }
  await dialog.getByRole('button', { name: 'Open set', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  // Network-isolated fixture: never creates an account or writes real cloud data.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
});

test('Sets browser opens a saved set and deletes another with durable results', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/studio-classic?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'arrangement',
  );

  await seedSets(page, SETS);
  await page.reload();
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'arrangement',
  );

  // ── Open the browser: one row per project, even with autosave siblings ──
  await page.locator('.comp-sets-btn').click();
  await expect(page.locator('.comp-sets-panel')).toHaveClass(/comp-panel-open/);
  const alphaRow = page.locator('.comp-sets-row', { hasText: 'Alpha Loop' });
  const betaRow = page.locator('.comp-sets-row', { hasText: 'Beta Sketch' });
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);
  await expect(alphaRow).toContainText('128 BPM');
  await expect(alphaRow).toContainText('3 tracks');

  // ── Open Beta: dirty-guard if needed, brand follows, panel closes ──
  await page.getByRole('button', { name: 'Open set Beta Sketch' }).click();
  await confirmReplaceIfShown(page);
  await expect(page.locator('.comp-brand-tag')).toHaveText('Beta Sketch');
  await expect(page.locator('.comp-sets-panel')).not.toHaveClass(
    /comp-panel-open/,
  );

  // ── Reopen: the OPEN marker moved, then delete Alpha ──
  await page.locator('.comp-sets-btn').click();
  await expect(
    page.locator('.comp-sets-row-current .comp-sets-name'),
  ).toContainText('Beta Sketch');
  await page.getByRole('button', { name: 'Delete set Alpha Loop' }).click();
  const dialog = page.locator('app-interaction-dialog [role="dialog"]');
  await expect(dialog).toContainText('Delete');
  await dialog.getByRole('button', { name: 'Delete set', exact: true }).click();
  await expect(alphaRow).toHaveCount(0);
  await expect(betaRow).toHaveCount(1);

  // ── Deletion is durable: reload and confirm Alpha's records are gone ──
  await page.reload();
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'arrangement',
  );
  await page.locator('.comp-sets-btn').click();
  await expect(alphaRow).toHaveCount(0);
  await expect(betaRow).toHaveCount(1);
  const storedIds = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('SMUVE_OFFLINE_DB');
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('projects')
            .objectStore('projects')
            .getAllKeys();
          read.onsuccess = () => {
            db.close();
            resolve(read.result.map(String));
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
  expect(storedIds.filter((id) => id.includes('set-alpha'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('phone one-tap instrumental loads a full loop and exposes the finishing path', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio-classic?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'arrangement',
  );

  await seedSets(page, [SETS[1]]);
  await page.reload();
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'arrangement',
  );

  // The seeded session opens in beginner mode; the quick-start lane is Pro.
  // The lane also starts collapsed on a phone, so expand it before asking for
  // the instrumentals it holds.
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector('app-studio'),
    );
    studio.uiService.beginnerMode.set(false);
    studio.mobileStartExpanded.set(true);
  });

  const lane = page.locator('.comp-mobile-start');
  await expect(lane).toBeVisible();
  await expect(page.locator('.comp-mobile-quick-chip')).toHaveCount(6);

  await page.getByRole('button', { name: /Load the Trap instrumental/ }).click();

  // A curated recipe replaces the canvas with a full instrumental. The
  // handler first snapshots a dirty session, so poll instead of racing it.
  const readLoaded = () =>
    page.evaluate(() => {
      const studio = (window as any).ng.getComponent(
        document.querySelector('app-studio'),
      );
      return {
        tracks: studio.musicManager.tracks().length,
        tempo: studio.audioEngine.tempo(),
        name: studio.projectWorkspace.metadata()?.name as string | undefined,
      };
    });
  await expect.poll(async () => (await readLoaded()).tracks).toBeGreaterThanOrEqual(3);
  const loaded = await readLoaded();
  expect(loaded.tempo).toBe(140);
  expect(loaded.name).toContain('Trap');

  await expect(page.locator('.comp-mobile-next')).toBeVisible();
  await expect(
    page.locator('.comp-mobile-next-btn', { hasText: 'Mix it' }),
  ).toBeVisible();

  // The finishing path routes into the mixer.
  await page.locator('.comp-mobile-next-btn', { hasText: 'Mix it' }).click();
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'mixer',
  );

  // The bottom-bar drawer tab must be directly tappable at this viewport —
  // the shell's floating home link used to float above it and swallow taps.
  // On the mobile Studio shell that link is now hidden because the bottom bar
  // already provides a Home tab.
  await expect(page.locator('.universal-home-link')).toHaveCount(0);
  await page
    .getByRole('tab', { name: 'Open Studio view drawer and tools' })
    .click();
  await expect(page.locator('.comp-drawer')).toHaveClass(/comp-drawer-open/);
  await page.getByRole('button', { name: 'My Sets (saved projects)' }).click();
  await expect(page.locator('.comp-sets-panel')).toHaveClass(/comp-panel-open/);
  await expect(
    page.locator('.comp-sets-row', { hasText: 'Beta Sketch' }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('desktop rail keeps every workflow stage reachable and scrollable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/studio-classic?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'arrangement',
  );

  const rail = page.locator('.comp-rail');
  await expect(rail).toBeVisible();
  await expect(rail.locator('.comp-rail-group')).toHaveCount(4);
  await expect(rail.locator('.comp-rail-group-title')).toContainText([
    'Create & Jam',
    'Song Builder',
    'Mix & Polish',
    'Sounds & Packs',
  ]);

  // The last group's contents must be reachable by scrolling inside the rail,
  // not clipped by an overflow:hidden container.
  const lastView = rail.getByRole('button', {
    name: 'Switch to Plugin Store view',
  });
  await lastView.scrollIntoViewIfNeeded();
  await expect(lastView).toBeVisible();
  await lastView.click();
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'plugins',
  );
});

// ── Device-kept versions ────────────────────────────────────────────────────
// These records only appear when a set is actually saved, so these tests save
// through the Studio instead of seeding IndexedDB: the version a save leaves
// behind is part of what is under test.

const VERSION_SET = 'Version QA';

/** Save the open set `times` over, which leaves one version per save. */
async function saveVersions(page: Page, times: number): Promise<string> {
  return page.evaluate(
    async ({ times, name }) => {
      const studio = (window as any).ng.getComponent(
        document.querySelector('app-studio'),
      );
      studio.projectWorkspace.updateMetadata({ name });
      for (let save = 0; save < times; save++) {
        await studio.saveProject();
      }
      return studio.projectWorkspace.metadata().id as string;
    },
    { times, name: VERSION_SET },
  );
}

/** Open the browser and expand one set's history strip. */
async function openVersions(page: Page, name: string) {
  await page.locator('.comp-sets-btn').click();
  await expect(page.locator('.comp-sets-panel')).toHaveClass(/comp-panel-open/);
  const row = page.locator('.comp-sets-row', { hasText: name });
  await row.getByRole('button', { name: `Show versions of ${name}` }).click();
  const strip = row.locator('.comp-sets-versions');
  await expect(strip).toBeVisible();
  return strip;
}

/** Version numbers this device still keeps for one set, newest first. */
async function keptVersions(page: Page, projectId: string): Promise<number[]> {
  return page.evaluate(async (id) => {
    const studio = (window as any).ng.getComponent(
      document.querySelector('app-studio'),
    );
    const versions = await studio.projectWorkspace.listLocalVersions(id);
    return versions.map((version: { version: number }) => version.version);
  }, projectId);
}

async function openStudio(page: Page): Promise<void> {
  await page.goto('/studio-classic?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
    'data-studio-workspace',
    'arrangement',
  );
}

test('a set history strip clears its own old versions and keeps the newest', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStudio(page);

  const projectId = await saveVersions(page, 3);
  const strip = await openVersions(page, VERSION_SET);
  await expect(strip.locator('.comp-sets-version')).toHaveCount(3);

  const clear = strip.getByRole('button', {
    name: `Delete older versions of ${VERSION_SET}`,
  });
  await expect(clear).toHaveText('Clear 2');
  await clear.click();

  const dialog = page.locator('app-interaction-dialog');
  await expect(dialog).toContainText(
    `Delete 2 older versions of \u201c${VERSION_SET}\u201d`,
  );
  await dialog.getByRole('button', { name: 'Delete versions' }).click();

  await expect(strip.locator('.comp-sets-version')).toHaveCount(1);
  await expect(clear).toBeDisabled();
  // Durable, not just redrawn: the store kept exactly the newest version.
  expect(await keptVersions(page, projectId)).toEqual([4]);
});

test('deleting a single version can be undone', async ({ page }) => {
  test.setTimeout(120_000);
  await openStudio(page);

  const projectId = await saveVersions(page, 3);
  const strip = await openVersions(page, VERSION_SET);
  const rows = strip.locator('.comp-sets-version');
  await expect(rows).toHaveCount(3);

  // v3 is the middle row: v4 newest, v2 oldest.
  await rows
    .nth(1)
    .getByRole('button', { name: `Delete version 3 of ${VERSION_SET}` })
    .click();
  const dialog = page.locator('app-interaction-dialog');
  await expect(dialog).toContainText(
    `Delete version v3 of \u201c${VERSION_SET}\u201d`,
  );
  await dialog.getByRole('button', { name: 'Delete version' }).click();

  await expect(rows).toHaveCount(2);
  expect(await keptVersions(page, projectId)).toEqual([4, 2]);

  const undoRow = strip.locator('.comp-sets-version-undo');
  await expect(undoRow).toContainText('v3 deleted');
  await undoRow
    .getByRole('button', { name: 'Undo deleting version 3' })
    .click();

  await expect(rows).toHaveCount(3);
  await expect(strip.locator('.comp-sets-version-title').nth(1)).toContainText(
    'v3',
  );
  await expect(undoRow).toHaveCount(0);
  expect(await keptVersions(page, projectId)).toEqual([4, 3, 2]);
});

test('the undo offer lapses and the version stays deleted', async ({ page }) => {
  test.setTimeout(120_000);
  await openStudio(page);

  const projectId = await saveVersions(page, 3);
  const strip = await openVersions(page, VERSION_SET);
  const rows = strip.locator('.comp-sets-version');
  await rows
    .nth(1)
    .getByRole('button', { name: `Delete version 3 of ${VERSION_SET}` })
    .click();
  await page
    .locator('app-interaction-dialog')
    .getByRole('button', { name: 'Delete version' })
    .click();

  const undoRow = strip.locator('.comp-sets-version-undo');
  await expect(undoRow).toBeVisible();

  // The offer is short-lived on purpose; after it lapses the delete stands.
  await expect(undoRow).toHaveCount(0, { timeout: 15_000 });
  await expect(rows).toHaveCount(2);
  expect(await keptVersions(page, projectId)).toEqual([4, 2]);
});

test('the near-full warning clears old versions across the shelf', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStudio(page);

  const projectId = await saveVersions(page, 3);
  await page.locator('.comp-sets-btn').click();
  await expect(page.locator('.comp-sets-panel')).toHaveClass(/comp-panel-open/);
  await expect(page.locator('.comp-sets-row').first()).toBeVisible();

  // The panel reads the real quota when it opens. Wait for that read to land,
  // then force a full device: forcing it mid-read gets overwritten and the
  // warning vanishes under the click.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).ng.getComponent(
            document.querySelector('app-studio'),
          ).storageQuota() !== null,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector('app-studio'),
    );
    studio.storageQuota.set({
      usedBytes: 9_500_000,
      totalBytes: 10_000_000,
      percentUsed: 95,
    });
  });

  const warning = page.locator('.comp-sets-storage-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('95% full');

  await warning.getByRole('button', { name: 'Clear 2 old versions' }).click();
  const dialog = page.locator('app-interaction-dialog');
  await expect(dialog).toContainText('Delete 2 older versions');
  await dialog.getByRole('button', { name: 'Delete versions' }).click();

  // The delete finishes after the confirm resolves, so poll the store instead
  // of reading it the instant the click returns.
  await expect
    .poll(() => keptVersions(page, projectId), { timeout: 10_000 })
    .toEqual([4]);
});
