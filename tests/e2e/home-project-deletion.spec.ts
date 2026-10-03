import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  // Network-isolated fixture: never creates an account or writes real cloud data.
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{}',
  }));
});

test('mixed project records render without anomalies and confirmed deletion survives reload', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('Critical System Error')) failures.push(message.text());
  });
  await page.goto('/projects');
  await expect(page.locator('app-projects')).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('SMUVE_OFFLINE_DB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      store.put({ id: 'release-qa', name: 'Keep Release', bpm: 120, tracks: [], tasks: [], status: 'Draft' });
      const bundle = { metadata: { id: 'qa-session', name: 'Studio QA Session', bpm: 128 }, tracks: [], audioAssets: [] };
      store.put({ ...bundle, id: 'project_qa-session' });
      store.put({ ...bundle, id: 'autosave_qa-session' });
      store.put({ ...bundle, id: 'recovery_qa-session' });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator('app-projects h3').filter({ hasText: 'Studio QA Session' })).toHaveCount(1);
  await page.locator('app-projects h3').filter({ hasText: 'Studio QA Session' }).click();
  await page.getByRole('button', { name: 'Delete project Studio QA Session', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('cannot be undone');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Studio QA Session', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete project Studio QA Session', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Studio QA Session', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Keep Release', exact: true })).toHaveCount(2);
  const keys = await page.evaluate(() => new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = indexedDB.open('SMUVE_OFFLINE_DB');
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('projects').objectStore('projects').getAllKeys();
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
    request.onerror = () => reject(request.error);
  }));
  expect(keys).toEqual(['release-qa']);
  await page.getByRole('button', { name: 'Delete project Keep Release', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No Project Selected' })).toBeVisible();
  expect(failures).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`Home is accessible from full-screen and standard workspaces at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/projects', '/tha-spot', '/mixer', '/studio?view=arrangement', '/piano-roll']) {
      await page.goto(route);
      const home = page.getByRole('link', { name: 'Back to Home Hub', exact: true });
      await expect(home).toBeVisible();
      await home.click();
      await expect(page).toHaveURL(/\/hub$/);
      await expect(page.locator('app-hub')).toBeVisible();
    }
  });
}

test('home navigation keeps authentication protection on signed-out deep links', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('app-projects')).toBeVisible();
  await page.evaluate(() => { sessionStorage.clear(); });
  // A separate context does not run the authenticated session seed.
  const context = await page.context().browser()!.newContext();
  try {
    const signedOut = await context.newPage();
    await signedOut.goto('http://127.0.0.1:4200/hub');
    await expect(signedOut).toHaveURL(/\/login\?returnUrl=%2Fhub$/);
    await expect(signedOut.locator('app-login')).toBeVisible();
  } finally {
    await context.close();
  }
});
