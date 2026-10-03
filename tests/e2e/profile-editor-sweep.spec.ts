import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
});

test('profile editor loads with populated strategic intel and commits through the uplink', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/profile');
  await expect(page.locator('.profile-editor-view')).toBeVisible();

  // The Strategic Intel panel reads `intelligenceBriefs`, which nothing wrote
  // before — it shipped as an empty box on every visit.
  const intel = page.locator('.profile-editor-view h4', {
    hasText: 'Strategic Intel',
  });
  await expect(intel).toBeVisible();
  const briefs = intel.locator('xpath=following-sibling::div').first();
  await expect(briefs.locator('h5').first()).toBeVisible();
  await expect(briefs.locator('h5').first()).toHaveText(/\S/);
  await expect(briefs.locator('p').first()).toHaveText(/\S/);

  const committed = await page.evaluate(async () => {
    const editor = (window as any).ng.getComponent(
      document.querySelector('app-profile-editor')
    );
    editor.updateProfileField('artistName', 'QA Sweep Artist');
    editor.updateProfileField('primaryGenre', 'Electronic');
    await editor.saveProfile();
    const profile = editor.userProfileService.profile();
    return {
      status: editor.saveStatus(),
      name: profile.artistName,
      genre: profile.primaryGenre,
    };
  });

  expect(committed.status).toBe('saved');
  expect(committed.name).toBe('QA Sweep Artist');
  expect(committed.genre).toBe('Electronic');
  expect(errors).toEqual([]);
});

test('profile editor sync vocabulary matches the questionnaire and migrates legacy values', async ({
  page,
}) => {
  await page.goto('/profile');
  await expect(page.locator('.profile-editor-view')).toBeVisible();

  const vocabulary = await page.evaluate(() => {
    const editor = (window as any).ng.getComponent(
      document.querySelector('app-profile-editor')
    );
    const sync = editor.syncToggles.find((t: any) => t.field === 'isSyncReady');
    const stems = editor.syncToggles.find((t: any) => t.field === 'hasStems');
    // A legacy profile value must still resolve to a real option.
    editor.setSyncField('isSyncReady', 'Actively Pitching');
    const migrated = editor.syncReadinessValue();
    editor.setSyncField('isSyncReady', 'Not Started');
    return {
      syncOptions: sync.options,
      stemsOptions: stems.options,
      migrated,
    };
  });

  // Both surfaces write `syncDetails.isSyncReady`; they used to disagree.
  expect(vocabulary.syncOptions).toEqual([
    'Not Started',
    'Basics Ready',
    'Full Stem Mastery',
    'One-Stop Qualified',
  ]);
  expect(vocabulary.syncOptions).not.toContain('Actively Pitching');
  expect(vocabulary.stemsOptions).toEqual(['No', 'Partial', 'Full Multitrack']);
  expect(vocabulary.migrated).toBe('One-Stop Qualified');
});

test('questionnaire guards against silently discarding uncommitted answers', async ({
  page,
}) => {
  await page.goto('/profile');
  await expect(page.locator('.profile-editor-view')).toBeVisible();

  // Open the interview through the editor's own trigger (the same path the
  // questionnaire CTA uses) so the modal wiring is covered too.
  await page.evaluate(() => {
    const editor = (window as any).ng.getComponent(
      document.querySelector('app-profile-editor')
    );
    editor.showQuestionnaire.set(true);
  });

  // The host element itself has no box (its only child is `position: fixed`),
  // so assert on the overlay it renders.
  const overlay = page.locator('.eq-overlay');
  await expect(overlay).toBeVisible();

  // Answer one question so the interview has real progress on the clock.
  await page.evaluate(() => {
    const component = (window as any).ng.getComponent(
      document.querySelector('app-artist-questionnaire')
    );
    component.profileDraft.update((draft: any) => ({
      ...draft,
      artistName: 'QA Interview Artist',
    }));
  });

  // Closing must ask first rather than dropping the interview.
  await page.locator('.eq-close-btn').click();
  await expect(page.getByText('Discard your answers?')).toBeVisible();
  await page.getByRole('button', { name: /keep answering/i }).click();
  await expect(overlay).toBeVisible();

  await page.locator('.eq-close-btn').click();
  await page.getByRole('button', { name: /discard & exit/i }).click();
  await expect(page.locator('.eq-overlay')).toHaveCount(0);
});

test('profile editor stays within the phone viewport without horizontal overflow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile');
  await expect(page.locator('.profile-editor-view')).toBeVisible();

  // The header (title + commit button) and the expertise grid used to force a
  // two-column layout at every width.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth
    )
  ).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole('button', { name: /commit neural protocol/i })
  ).toBeVisible();
  expect(errors).toEqual([]);
});
