import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

async function expectActionInViewport(action: import('@playwright/test').Locator) {
  await expect(action).toBeInViewport({ ratio: 1 });
  const box = await action.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // A visible bounding box alone does not prove a control is unobstructed.
  await expect.poll(() => action.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !!hit && element.contains(hit);
  })).toBe(true);
}

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

for (const viewport of [
  { width: 360, height: 640 },
  { width: 844, height: 390 },
  { width: 900, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`profile and questionnaire actions remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto('/profile');
    await expect(page.locator('.profile-nav')).toBeVisible();
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const sections = await page.evaluate(() => (window as any).ng.getComponent(
      document.querySelector('app-profile-editor')
    ).sections.map((section: any) => section.id));
    for (const section of sections) {
      await page.evaluate((id) => (window as any).ng.getComponent(
        document.querySelector('app-profile-editor')
      ).activeSection.set(id), section);
      await expect.poll(() => page.locator('.profile-editor-view main').evaluate((main) =>
        [...main.querySelectorAll('button, input, select, textarea')].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 1);
        }).length
      ), { message: `clipped controls in ${section}` }).toBe(0);
    }

    await page.goto('/profile?questionnaire=1');
    await expect(page.locator('.eq-input')).toBeVisible();
    const next = page.locator('.eq-nav-next');
    await expect(next).toHaveText('Next →');
    await page.locator('.eq-input').fill('Questionnaire Sweep Artist');
    await expectActionInViewport(next);
    await next.click();
    await expect(page.locator('.eq-question-title')).toContainText('origin story');
    await page.locator('.eq-option-card').first().click();
    await expectActionInViewport(next);

    // Sweep every currently applicable question, including long genre lists,
    // chips, free text, ranges, and the last question of the last phase.
    const phases = await page.evaluate(() => {
      const component = (window as any).ng.getComponent(document.querySelector('app-artist-questionnaire'));
      return component.phases.map((phase: any, index: number) => ({
        index, count: component.engine.questionsForPhase(phase.id, component.profileDraft()).length,
      }));
    });
    for (const { index, count } of phases) {
      for (let question = 0; question < count; question++) {
        await page.evaluate(({ index, question }) => {
          const component = (window as any).ng.getComponent(document.querySelector('app-artist-questionnaire'));
          component.currentPhaseIndex.set(index);
          component.currentQuestionIndex.set(question);
        }, { index, question });
        await expectActionInViewport(next);
        await expectActionInViewport(page.locator('.eq-close-btn'));
        await expect(page.locator('.eq-flow')).toBeVisible();
      }
    }
    await expect(next).toHaveText('✨ Complete Profile');

    // Choose from the unfiltered long catalogue, then navigate through the UI.
    await page.evaluate(() => {
      const component = (window as any).ng.getComponent(document.querySelector('app-artist-questionnaire'));
      component.currentPhaseIndex.set(1);
      component.currentQuestionIndex.set(0);
    });
    await expect(page.getByRole('textbox', { name: 'Search genres' })).toBeVisible();
    await page.locator('.eq-option-card').last().click();
    await expectActionInViewport(next);
    await next.click();
    await expect.poll(() => page.locator('.eq-main').evaluate((main) => main.scrollTop)).toBe(0);
    await expect(page.locator('.eq-question-title')).toBeInViewport();
    await page.locator('.eq-nav-back').click();
    await expect(page.getByRole('textbox', { name: 'Search genres' })).toBeInViewport();

    // Pin a local result: layout tests must not send paid AI requests.
    await page.evaluate(() => {
      const component = (window as any).ng.getComponent(document.querySelector('app-artist-questionnaire'));
      component.analysisResult.set({ persona: { archetype: 'Independent artist' }, recommendations:
        Array.from({ length: 8 }, () => ({ title: 'Release preparation', content: 'Build your next release plan.', impact: 'High' })) });
    });
    await expectActionInViewport(page.getByRole('button', { name: /commit neural realignment/i }));
    await expectActionInViewport(page.getByRole('button', { name: /discard & exit/i }));

    // The final return control must be scrollable on short landscape screens.
    await page.goto('/profile');
    await expect(page.locator('.profile-nav')).toBeVisible();
    await page.evaluate(async () => {
      const editor = (window as any).ng.getComponent(document.querySelector('app-profile-editor'));
      editor.updateProfileField('artistName', 'Questionnaire Sweep Artist');
      editor.updateProfileField('primaryGenre', 'Electronic');
      await editor.saveProfile();
    });
    const returnButton = page.getByRole('button', { name: 'RETURN_TO_COMMAND' });
    await returnButton.scrollIntoViewIfNeeded();
    await expectActionInViewport(returnButton);
    await returnButton.click();
    await expect(page.locator('app-uplink-console')).toHaveCount(0);
  });
}

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
