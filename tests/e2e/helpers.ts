import type { Page } from '@playwright/test';
import { APP_SECURITY_CONFIG } from '../../src/app/app.security';

/**
 * Seed an authenticated session the way AuthService actually persists it:
 * a base64(`JSON(user)|auth_salt`) blob in SESSION storage under
 * `smuve_auth_session`. Sessions moved from localStorage to sessionStorage
 * (with a salt-integrity check on load), so seeding localStorage never
 * authenticated — every auth-gated e2e spec silently redirected to /login.
 */
export async function seedAuthenticatedSession(page: Page) {
  const user = {
    id: 'user_e2e_exec',
    email: 'e2e@smuve.test',
    artistName: 'Executive Artist',
    role: 'Artist',
    permissions: ['STANDARD'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    lastLogin: new Date('2026-01-01T00:00:00.000Z'),
    profileCompleteness: 100,
  };

  const session = Buffer.from(
    `${JSON.stringify(user)}|${APP_SECURITY_CONFIG.auth_salt}`
  ).toString('base64');

  await page.addInitScript(
    ({ authSession }) => {
      sessionStorage.setItem('smuve_auth_session', authSession);
    },
    { authSession: session }
  );
}
