import { expect, test } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

const protectedRoutes = [
  '/hub',
  '/studio?view=arrangement',
  '/studio?view=session',
  '/studio?view=piano-roll',
  '/studio?view=mixer',
  '/studio?view=performance',
  '/studio?view=mastering',
  '/studio?view=drum-machine',
  '/studio?view=channel-rack',
  '/studio?view=effects-rack',
  '/studio?view=vocal-suite',
  '/studio?view=dj',
  '/studio?view=audio-recorder',
  '/studio?view=sampler',
  '/studio?view=score',
  '/studio?view=plugins',
  '/studio?view=sample-library',
  '/studio?view=sound-browser',
  '/studio?view=sound-pad',
  '/studio?view=synthesizer',
  '/studio?view=chord-editor',
  '/studio?view=ai-produce',
  '/vocal-suite',
  '/profile',
  '/journey',
  '/practice',
  '/analytics',
  '/strategy',
  '/career',
  '/projects',
  '/release-pipeline',
  '/produce',
  '/command-center',
  '/neural-foundry',
  '/business-suite',
  '/knowledge-base',
  '/lyric-editor',
  '/remix-arena',
  '/image-video-lab',
  '/settings',
  '/inbox',
  '/performance',
  '/mastering',
  '/cowrite',
  '/artist-development',
  '/store',
  '/products',
  '/cloud',
  '/timeline',
];

test('should boot without blank screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const bodyContent = await page.evaluate(() => document.body.innerHTML);
  expect(bodyContent.length).toBeGreaterThan(100);
});

test('login and music-manager flows work without anomalies', async ({ page }) => {
  test.setTimeout(90_000);
  const anomalies: string[] = [];
  page.on('pageerror', (error) => anomalies.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /System Anomaly Detected|NG\d{4}|ExpressionChangedAfterItHasBeenCheckedError|TypeError:|Cannot read propert/i.test(
        message.text()
      )
    ) {
      anomalies.push(`console: ${message.text()}`);
    }
  });

  await page.goto('/login');
  await expect(page.getByText('SYSTEM AUTHORIZATION')).toBeVisible();

  const email = `preview-${Date.now()}@example.com`;
  await page.getByRole('button', { name: 'New Artist Designation' }).click();
  await page.getByLabel('Artist Designation').fill('Preview Artist');
  await page.getByLabel('Secure Channel').fill(email);
  await page.getByLabel('Access Cipher').fill('PreviewPass1!');
  await page.getByRole('button', { name: 'Initialize Genesis' }).click();

  await expect(page.getByText('Authorization Cipher')).toBeVisible({
    timeout: 30_000,
  });
  const verificationCode = await page.evaluate(
    (address) => localStorage.getItem(`smuve_verification_${address}`),
    email
  );
  expect(verificationCode).toBeTruthy();
  await page.getByLabel('Authorization Cipher').fill(verificationCode!);
  await page.getByRole('button', { name: 'Establish Link' }).click();

  await expect(page).toHaveURL(/\/hub/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Toggle S.M.U.V.E advisor' }).click();
  const chatInput = page.getByPlaceholder(/Command S\.M\.U\.V\.E/);
  await chatInput.fill('make a beat at 120 in C minor');
  await chatInput.press('Enter');

  await expect(page.getByText(/Beat forged:/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/C minor at 120 BPM/)).toBeVisible();
  expect(anomalies).toEqual([]);
});

test('protected application routes do not emit runtime errors', async ({ page }) => {
  test.setTimeout(180_000);
  await seedAuthenticatedSession(page);

  const anomalyErrors = new Set<string>();
  let activeRoute = '';
  const recordIfAnomaly = (source: string, text: string) => {
    const isAngularFailure = /\bNG\d{4}\b/.test(text);
    const isRuntimeFailure =
      /Critical System Error|System Anomaly Detected|TypeError:|Cannot read propert|\.is not a function/i.test(
        text,
      );
    if (isAngularFailure || isRuntimeFailure) {
      anomalyErrors.add(`${activeRoute || 'initial'} ${source}: ${text}`);
    }
  };

  page.on('pageerror', (error) =>
    recordIfAnomaly('[pageerror]', error.message),
  );
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      recordIfAnomaly(`[console:${message.type()}]`, message.text());
    }
  });

  for (const route of protectedRoutes) {
    activeRoute = route;
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(750);
  }

  expect([...anomalyErrors].sort()).toEqual([]);
});
