import { test, expect, type Page } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Cinema project persistence, end to end.
 *
 * Nothing below can be covered by a unit test: jsdom has no IndexedDB, so
 * whether the store exists after a schema upgrade, whether a write lands, and
 * whether the panel renders are all real-browser questions.
 *
 * The database is planted at the *previous* version first, because that is what
 * every existing install has on disk. Upgrading is the one path a new user never
 * exercises and an existing user always does.
 */

const DB_NAME = 'SMUVE_OFFLINE_DB';
const PREVIOUS_VERSION = 5;

/**
 * Create the schema the last release shipped, on a same-origin page that is not
 * the app, so the app is the thing that performs the upgrade.
 */
async function plantPreviousSchema(page: Page) {
  await page.route('**/__blank', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>blank</body></html>',
    })
  );
  await page.goto('/__blank');
  await page.evaluate(
    ({ dbName, version }) =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
        };
        request.onsuccess = (event) => {
          (event.target as IDBOpenDBRequest).result.close();
          resolve();
        };
        request.onerror = () => resolve();
      }),
    { dbName: DB_NAME, version: PREVIOUS_VERSION }
  );
}

/** The database version and store list as they are on disk right now. */
const readDatabase = (page: Page) =>
  page.evaluate(
    (dbName) =>
      new Promise<{ version: number; stores: string[] }>((resolve) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const stores = Array.from(db.objectStoreNames);
          const version = db.version;
          db.close();
          resolve({ version, stores });
        };
        request.onerror = () => resolve({ version: -1, stores: [] });
      }),
    DB_NAME
  );

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
});

test('upgrades an existing database and adds the cinema store', async ({
  page,
}) => {
  await plantPreviousSchema(page);
  expect((await readDatabase(page)).version).toBe(PREVIOUS_VERSION);

  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  const { version, stores } = await readDatabase(page);

  expect(version).toBeGreaterThan(PREVIOUS_VERSION);
  expect(stores).toContain('cinema_projects');
  // The upgrade must not have taken anything with it.
  expect(stores).toContain('projects');
  expect(stores).toContain('audio_blobs');

  // An upgrade that silently failed would still render the panel, so the panel
  // has to agree that storage works rather than showing the failure notice.
  await expect(page.locator('.project-console .camera-error')).toHaveCount(0);
  await expect(page.locator('.project-console .camera-detail')).toContainText(
    /no saved projects/i
  );
});

test('does not wedge the panel when another tab holds an older database', async ({
  page,
}) => {
  // Hold the previous schema open in a second tab and never close it. This is
  // what blocks the upgrade, and it is the case that used to hang: the open
  // request never settled, so the in-flight flag stayed on, the buttons stayed
  // disabled, and the panel explained nothing.
  const holder = await page.context().newPage();
  await holder.route('**/__blank', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>holder</body></html>',
    })
  );
  await holder.goto('/__blank');
  const held = await holder.evaluate(
    ({ dbName, version }) =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
        };
        request.onsuccess = (event) => {
          // Deliberately left open.
          (window as unknown as Record<string, unknown>).heldDb = (
            event.target as IDBOpenDBRequest
          ).result;
          resolve(true);
        };
        request.onerror = () => resolve(false);
      }),
    { dbName: DB_NAME, version: PREVIOUS_VERSION }
  );
  expect(held).toBe(true);

  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  const notice = page.locator('.project-console .camera-error');
  await expect(notice).toContainText(/another open tab/i, { timeout: 15_000 });
  // The browser is fine; telling the operator otherwise sends them nowhere.
  await expect(notice).not.toContainText(/cannot store projects/i);

  await page.getByLabel('Project name').fill('Blocked Feature');
  await page.getByRole('button', { name: /SAVE AS NEW/i }).click();

  // The real regression: the save must settle. A hung availability check left
  // `isBusy` stuck true, which disabled these controls permanently.
  await expect(
    page.getByRole('button', { name: /SAVE AS NEW/i })
  ).toBeEnabled({ timeout: 15_000 });
  await expect(notice).toContainText(/another open tab/i);

  await holder.close();
});

test('saves a project, survives a reload and reopens its edit', async ({
  page,
}) => {
  await plantPreviousSchema(page);
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByLabel('Marker label').fill('Act One');
  await page.getByRole('button', { name: 'MARK', exact: true }).click();

  await page.getByLabel('Project name').fill('Probe Feature');
  await page.getByRole('button', { name: /SAVE AS NEW/i }).click();

  const card = page.locator('.project-card').first();
  await expect(card).toBeVisible();
  // The card is uppercased by CSS, but the stored name keeps the typed case.
  await expect(card.locator('.project-name')).toHaveText('Probe Feature');
  await expect(card.locator('.project-meta').first()).toContainText(
    /1 marker/i
  );

  // A genuinely fresh document: anything that survived came from storage.
  await page.reload();
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  const afterReload = page.locator('.project-card').first();
  await expect(afterReload).toBeVisible();
  await expect(afterReload.locator('.project-name')).toHaveText(
    'Probe Feature'
  );
  // The timeline starts empty; only the project list is restored.
  await expect(page.locator('.timeline-marker')).toHaveCount(0);

  await page.locator('.project-open').first().click();

  await expect(page.locator('.timeline-marker')).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(page.locator('.timeline-marker')).toContainText('Act One');
});
