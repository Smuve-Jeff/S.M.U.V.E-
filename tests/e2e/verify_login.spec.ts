import { test, expect, type Locator, type Page } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

async function expectReachable(control: Locator) {
  // Center controls rather than align an edge to a fractional CSS pixel.
  await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return rect.height >= 44 && rect.width >= 44 && !!hit && element.contains(hit);
  })).toBe(true);
}

async function sweep(page: Page, root: Locator) {
  await expect(root).toBeVisible();
  await expect.poll(() => root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
  })).toBe(true);
  await expect.poll(() => root.locator('h1').evaluate((heading) => heading.scrollWidth - heading.clientWidth)).toBeLessThanOrEqual(1);
  for (const control of await root.locator('button, input').all()) {
    await expectReachable(control);
  }
}

const user = {
  id: 7, name: 'Sweep Artist', email: 'artist@smuve.test', role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

// Local fixtures only: never create accounts, send mail, or call a paid API.
async function mockApi(page: Page, verification = false) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith('/auth/login') || path.endsWith('/auth/register')) {
      body = { token: 'e2e-test-token', user: { ...user, emailVerified: !verification }, emailVerificationAvailable: verification };
    } else if (path.endsWith('/auth/verify-email/confirm')) {
      body = { ok: true, user: { ...user, emailVerified: true } };
    } else if (path.endsWith('/auth/verify-email/send') || path.endsWith('/auth/forgot-password')) {
      body = { ok: true, message: 'Transmission sent.' };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('login page should be visible and not blank', async ({ page }, testInfo) => {
  await page.goto('/login');
  await expect(page.locator('h1')).toContainText('S.M.U.V.E.');
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('login.png') });
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 844, height: 390 },
  { width: 900, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`auth controls are reachable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Invalid credentials"}' }));
    await page.goto('/login');
    await sweep(page, page.locator('app-login'));
    await page.locator('#email').fill('artist@smuve.test');
    await page.locator('#password').fill('Password1!');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await page.getByRole('button', { name: 'Authorize Access', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('AUTHORIZATION DENIED');
    await sweep(page, page.locator('app-login'));

    await page.getByRole('button', { name: 'New Artist Designation', exact: true }).click();
    await page.locator('#artistName').fill('Sweep Artist');
    await page.locator('#password').fill('x');
    await expect(page.getByText('Cipher Strength', { exact: true })).toBeVisible();
    await sweep(page, page.locator('app-login'));
    await page.getByRole('button', { name: 'Initialize Genesis', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('PASSWORD TOO SHORT');
    await sweep(page, page.locator('app-login'));

    // Challenge layouts are independent of real mail delivery and legacy 2FA.
    await page.evaluate(() => {
      const component = (window as any).ng.getComponent(document.querySelector('app-login'));
      component.isVerifying.set(true);
      component.usesApiAuth.set(true);
    });
    await page.locator('#verificationCode').fill('123456');
    await expect(page.locator('#verificationCode')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.locator('#verificationCode')).toHaveAttribute('autocomplete', 'one-time-code');
    await sweep(page, page.locator('app-login'));
    await page.evaluate(() => {
      const component = (window as any).ng.getComponent(document.querySelector('app-login'));
      component.isVerifying.set(false);
      component.requires2FA.set(true);
    });
    await page.locator('#twoFactorCode').fill('123456');
    await sweep(page, page.locator('app-login'));

    await page.getByRole('button', { name: 'Forgot Access Cipher?', exact: true }).click();
    await expect(page).toHaveURL(/\/reset-password$/);
    await sweep(page, page.locator('app-reset-password'));
    await page.goto('/reset-password?token=layout-test');
    await page.locator('#newPassword').fill('x');
    await page.locator('#confirmPassword').fill('x');
    await sweep(page, page.locator('app-reset-password'));
    await page.getByRole('button', { name: 'Rotate Cipher', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('PASSWORD TOO SHORT');
    await page.screenshot({ path: testInfo.outputPath('recovery.png') });
    await page.getByRole('button', { name: 'Return to Authorization', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  });

  test(`onboarding tour fits at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await seedAuthenticatedSession(page);
    await mockApi(page);
    await page.goto('/hub?onboarding=1');
    const start = page.getByRole('button', { name: /Start the 5-minute tour/ });
    await expectReachable(start);
    await start.click();
    await expect(page).toHaveURL(/\/onboarding\/tour$/);
    await sweep(page, page.locator('.tour-shell'));
    await page.getByRole('button', { name: 'Close tour', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('tour.png') });
    await page.getByRole('button', { name: 'Finish All Steps', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Finish All Steps', exact: true })).toBeDisabled();
    const mark = page.getByRole('button', { name: 'Mark Complete', exact: true });
    for (let remaining = 5; remaining > 0; remaining--) {
      await expect(mark).toHaveCount(remaining);
      await mark.first().click();
    }
    await expect(mark).toHaveCount(0);
    await expect(page.getByText('100% complete', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Finish Tour', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
  });
}

test('signup verifies through the UI and opens onboarding', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/login');
  await page.getByRole('button', { name: 'New Artist Designation', exact: true }).click();
  await page.locator('#artistName').fill('Sweep Artist');
  await page.locator('#email').fill('artist@smuve.test');
  await page.locator('#password').fill('Password1!');
  await page.getByRole('button', { name: 'Initialize Genesis', exact: true }).click();
  await expect(page.locator('#verificationCode')).toBeVisible();
  await page.getByRole('button', { name: 'Resend Transmission', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Transmission sent.');
  await page.locator('#verificationCode').fill('123456');
  await page.getByRole('button', { name: 'Establish Link', exact: true }).click();
  await expect(page).toHaveURL(/\/hub\?onboarding=1$/);
  await expect(page.locator('.hub-onboarding')).toBeVisible();
  await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
});

test('login preserves the requested destination', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login?returnUrl=%2Fprofile%3Fquestionnaire%3D1');
  await page.locator('#email').fill('artist@smuve.test');
  await page.locator('#password').fill('Password1!');
  await page.getByRole('button', { name: 'Authorize Access', exact: true }).click();
  await expect(page).toHaveURL(/\/profile\?questionnaire=1$/);
  await expect(page.locator('.eq-overlay')).toBeVisible();
});

test('recovery requests a link and can return to login', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot Access Cipher?', exact: true }).click();
  await page.locator('#recoveryEmail').fill('artist@smuve.test');
  await page.getByRole('button', { name: 'Transmit Recovery Link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Transmission sent.');
  await page.getByRole('button', { name: 'Return to Authorization', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
