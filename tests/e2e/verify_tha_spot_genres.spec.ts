import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Verify each Tha Spot genre facet surfaces matching cabinets', async ({
  page,
}) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');

  const genreSelect = page.getByTestId('genre-select');
  await expect(genreSelect).toBeVisible();

  // Collect every facet the dropdown exposes. The "all" sentinel is
  // excluded because it intentionally aggregates every cabinet.
  const facetOptions = await genreSelect
    .locator('option')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          value: (node as HTMLOptionElement).value,
          label: (node as HTMLOptionElement).textContent?.trim() ?? '',
        }))
        .filter((opt) => opt.value && opt.value !== 'all')
    );

  expect(facetOptions.length).toBeGreaterThan(5);

  for (const facet of facetOptions) {
    await genreSelect.selectOption(facet.value);

    const cards = page.getByTestId('game-card');
    const count = await cards.count();
    // Every named facet must surface at least one cabinet — otherwise the
    // taxonomy has a phantom or synonym mismatch that hides real games.
    expect(
      count,
      `genre facet "${facet.label}" (${facet.value}) returned no cabinets`
    ).toBeGreaterThan(0);
  }

  // Reset to the aggregate "all" view so later assertions / screenshots
  // land on the original library snapshot.
  await genreSelect.selectOption('all');
  await expect(page.getByTestId('game-card').first()).toBeVisible();
});
