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

  await page.goto('/studio?view=arrangement');
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
  await page.goto('/studio?view=arrangement');
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
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector('app-studio'),
    );
    studio.uiService.beginnerMode.set(false);
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
  await page.goto('/studio?view=arrangement');
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
