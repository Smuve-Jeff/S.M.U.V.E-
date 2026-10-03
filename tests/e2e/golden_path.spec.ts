import { test, expect } from '@playwright/test';

/**
 * Golden path: register → land in the hub → run the questionnaire and commit
 * it → enter the Studio → run automated mastering → visit Tha Spot.
 *
 * The previous version of this spec drove UI that no longer exists: it clicked
 * "Initialize Genesis" (a register-mode-only label) while the form was in login
 * mode, and asserted on removed copy (`.bento-grid`, "EXECUTIVE HUB",
 * "SMUVE STUDIO PRO", "PLUTO TV"). It had been failing on `main` for that
 * reason, not because the product flow was broken.
 *
 * The API has no server behind the preview, so `/api/**` is stubbed. That is
 * the same seam the other e2e specs use, and it keeps the flow hermetic.
 */
test.describe('SMUVE 2.0 Golden Path Verification', () => {
  test('completes registration, the questionnaire, the studio, and Tha Spot', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/auth/login-email')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"ok":true}',
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'e2e.jwt.token',
          user: {
            id: 1,
            name: 'Elite Artist',
            email: 'elite_artist@smuve.ai',
            role: 'Artist',
            emailVerified: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
            updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          },
          emailVerificationAvailable: false,
        }),
      });
    });

    // ── 1. Register (the form opens in authorization mode) ─────────────
    await page.goto('/login');
    await page.getByRole('button', { name: /new artist designation/i }).click();
    await page.fill('input[type="email"]', 'elite_artist@smuve.ai');
    await page.fill('input[type="password"]', 'HardenedPass123!@#');
    await page.click('button:has-text("Initialize Genesis")');

    // ── 2. Land in the Executive Command hub ──────────────────────────
    await expect(page).toHaveURL(/.*hub/, { timeout: 15000 });
    await expect(page.locator('.hub-command-center')).toBeVisible();
    await expect(
      page.getByText('S.M.U.V.E. 2.0 // EXECUTIVE COMMAND')
    ).toBeVisible();

    // ── 3. Run the questionnaire from the profile editor ──────────────
    await page.goto('/profile');
    await expect(page.locator('.profile-editor-view')).toBeVisible();
    await page.getByRole('button', { name: /open questionnaire/i }).first().click();
    await expect(page.locator('.eq-overlay')).toBeVisible();

    // Answer the first question and select a genre through the real controls.
    await page.locator('.eq-input').first().fill('Elite Artist');
    await page.locator('.eq-nav-next').first().click();
    await page.evaluate(() => {
      const component = (window as any).ng.getComponent(
        document.querySelector('app-artist-questionnaire')
      );
      // Fast-forward to the genre phase: driving all 70+ questions by pointer
      // would take minutes and adds no coverage beyond this path.
      const genrePhase = component.phases.findIndex(
        (phase: any) => phase.id === 'musical-dna'
      );
      component.currentPhaseIndex.set(genrePhase);
      component.currentQuestionIndex.set(0);
    });
    await page.getByRole('button', { name: /Hip Hop/i }).first().click();

    // Jump to the final question so the interview can be finalized.
    await page.evaluate(() => {
      const component = (window as any).ng.getComponent(
        document.querySelector('app-artist-questionnaire')
      );
      component.currentPhaseIndex.set(component.phases.length - 1);
      component.currentQuestionIndex.set(0);
    });
    await page.evaluate(async () => {
      const component = (window as any).ng.getComponent(
        document.querySelector('app-artist-questionnaire')
      );
      // Finalize is the real analysis pass; the pointer path would require
      // walking every remaining question first.
      await component.finalize();
    });
    await expect(page.locator('.eq-persona-card')).toBeVisible({ timeout: 20000 });

    // Commit through the real uplink console.
    await page.getByRole('button', { name: /commit neural realignment/i }).click();
    const uplinkButton = page.getByRole('button', { name: /return_to_command/i });
    await expect(uplinkButton).toBeVisible({ timeout: 20000 });
    await uplinkButton.click();
    await expect(page.locator('.eq-overlay')).toHaveCount(0);

    const committed = await page.evaluate(() => {
      const editor = (window as any).ng.getComponent(
        document.querySelector('app-profile-editor')
      );
      const profile = editor.userProfileService.profile();
      return {
        name: profile.artistName,
        genre: profile.primaryGenre,
        completed: profile.profileSetupCompleted === true,
      };
    });
    expect(committed.name).toBe('Elite Artist');
    expect(committed.genre).toBe('Hip Hop');
    expect(committed.completed).toBe(true);

    // ── 4. Enter the Studio from the hub ─────────────────────────────
    await page.goto('/hub');
    await page.locator('.workspace-card-studio').click();
    await expect(page).toHaveURL(/.*studio/);
    await expect(page.locator('[data-studio-workspace]')).toBeVisible();

    // ── 5. Run automated mastering and read the AI roast ─────────────
    await page.goto('/studio?view=mastering');
    await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
      'data-studio-workspace',
      'mastering'
    );
    // The mastering view is @defer-loaded; wait for the real component.
    await expect(page.locator('.mastering-suite-container')).toBeVisible({
      timeout: 15000,
    });
    // The button carries an aria-label, which becomes its accessible name.
    await page
      .getByRole('button', { name: /automated mastering on the mix/i })
      .click();
    await expect(
      page.locator('.mastering-suite-container p.italic').first()
    ).not.toBeEmpty();

    // ── 6. Tha Spot renders its gaming surface ───────────────────────
    await page.goto('/tha-spot');
    await expect(page.locator('.tha-spot-container')).toBeVisible();
    await expect(page.locator('.spot-title')).toContainText('THA_SPOT');
    await expect(page.getByRole('button', { name: 'GAMING' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
