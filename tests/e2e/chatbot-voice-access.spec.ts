import { test, expect, type Page } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Voice access in the advisor widget used to be a single boolean: the mic
 * rendered "supported" whenever a recognition constructor existed. A blocked
 * microphone, an insecure context and a packaged shell with no speech service
 * at all therefore all produced a mic button that looked alive and then did
 * nothing — silently, because every start/stop/error event was swallowed.
 *
 * These specs drive the real widget in each access state and assert the artist
 * is told what is wrong and what to do about it.
 */

const BLOCKED_NOTICE = 'Microphone access is blocked';
const NATIVE_SHELL_NOTICE = "Dictation isn't available inside the mobile app shell";

/** A recognition engine that exists but whose capture the browser refuses. */
const DENIED_ENGINE = `
  class DeniedRecognition {
    continuous = false;
    interimResults = false;
    lang = '';
    maxAlternatives = 1;
    onresult = null;
    onend = null;
    onerror = null;
    start() {
      Promise.resolve().then(() => this.onerror && this.onerror({ error: 'not-allowed' }));
    }
    stop() {}
    abort() {}
  }
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    writable: true,
    value: DeniedRecognition,
  });
`;

async function openAdvisor(page: Page) {
  await seedAuthenticatedSession(page);
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
  await page.goto('/hub');
  await page.getByRole('button', { name: 'Toggle S.M.U.V.E advisor' }).click();
  await expect(page.locator('app-chatbot .chatbot-container')).toBeVisible();
  return {
    mic: page.getByRole('button', { name: 'Start voice input', exact: true }),
    composer: page.getByLabel('Artist request'),
    notice: page.locator('app-chatbot [role="status"]'),
  };
}

test.describe('S.M.U.V.E advisor voice access', () => {
  test.setTimeout(120_000);

  test('a blocked microphone explains itself, stays retryable and keeps text input working', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(DENIED_ENGINE);
    await page.addInitScript(() => {
      // The browser has already refused the mic for this origin, and asking
      // again (getUserMedia) is refused too — the exact phone/desktop state
      // where the old widget went silent.
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: { query: async () => ({ state: 'denied' }) },
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () =>
            Promise.reject(
              Object.assign(new Error('Permission denied'), {
                name: 'NotAllowedError',
              })
            ),
        },
      });
    });

    const { mic, composer, notice } = await openAdvisor(page);

    // The mic stays pressable on purpose: pressing it is how the artist is told
    // what to fix, so it must not be a disabled dead control.
    await expect(mic).toBeVisible();
    await expect(mic).toBeEnabled();
    await expect(mic).toHaveAttribute('title', /dictate a command/i);

    await mic.click();

    await expect(notice).toBeVisible();
    await expect(notice).toContainText(BLOCKED_NOTICE);
    await expect(notice).toContainText('Allow the microphone for this site');

    // Voice being unusable must never take typed commands with it.
    await composer.fill('draft the hook');
    await expect(composer).toHaveValue('draft the hook');
    await expect(page.locator('app-chatbot .chatbot-container')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('a shell without a dictation engine names the reason instead of offering a dead mic', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
      // Android WebView (the packaged app) ships no Web Speech recognizer.
      Object.defineProperty(window, 'SpeechRecognition', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      Object.defineProperty(window, 'webkitSpeechRecognition', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        writable: true,
        value: { isNativePlatform: () => true, getPlatform: () => 'android' },
      });
    });

    const { mic, composer, notice } = await openAdvisor(page);

    // The reason is the button's accessible name, so it reaches screen readers
    // and not just a hover tooltip.
    const disabledMic = page.getByRole('button', {
      name: new RegExp(NATIVE_SHELL_NOTICE, 'i'),
    });
    await expect(disabledMic).toBeVisible();
    await expect(disabledMic).toBeDisabled();
    await expect(disabledMic).toHaveAttribute('title', /open S\.M\.U\.V\.E\. in Chrome/i);

    // Nothing the artist can tap produces a notice, because nothing is tappable
    // in a state where no amount of permission would help — but the explanation
    // is present, and the composer still works.
    await expect(notice).toBeHidden();
    await expect(mic).toHaveCount(0);
    await composer.fill('write a bridge');
    await expect(composer).toHaveValue('write a bridge');
    expect(pageErrors).toEqual([]);
  });
});
