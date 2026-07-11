import { test, expect } from '@playwright/test';

test('Performance Module keyboard and enhancements verification', async ({
  page,
}) => {
  await page.goto('http://localhost:4200/studio?view=performance');

  // Wait for the container
  const container = page.locator('.performer-container');
  await expect(container).toBeVisible();

  // Check keyboard visibility (first white key)
  const firstKey = page.locator('.perf-key-v42.white-key').first();
  await expect(firstKey).toBeVisible();

  // Verify visualizer presence
  const visualizer = page.locator('.visualizer-mini');
  await expect(visualizer).toBeVisible();

  // Check dashboard buttons (Smart Chords, Arp, etc)
  const smartChordsBtn = page.getByRole('button', { name: /smart chords/i });
  await expect(smartChordsBtn).toBeVisible();

  const arpBtn = page.getByRole('button', { name: /arp/i });
  await expect(arpBtn).toBeVisible();

  // Check Granular Rack knobs
  const cutoffKnob = page.locator('.granular-rack app-knob[label="CUTOFF"]');
  await expect(cutoffKnob).toBeVisible();
});
