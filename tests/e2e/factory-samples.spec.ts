import { test, expect, type Page } from '@playwright/test';

/**
 * The factory bank is bundled, but nothing at the browser level proved the real
 * Studio could use it: preset URL → fetch → decode. That wiring is what made
 * the "offline" PWA go silent when presets streamed from third-party hosts.
 * The Jest suite guards the files on disk; this guards the path an artist
 * actually uses when the transport starts.
 */

type SampleResponse = { url: string; status: number };
type AudioProbe = { decoded: number };

/**
 * Count real Web Audio work without reaching into Angular internals. The
 * counter moves when the app decodes a buffer, after the network capture has
 * already proved which bundled files reached the engine.
 */
async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: AudioProbe = { decoded: 0 };
    (
      window as Window & { __factorySampleProbe?: AudioProbe }
    ).__factorySampleProbe = probe;

    const nativeDecode = BaseAudioContext.prototype.decodeAudioData;
    (
      BaseAudioContext.prototype as unknown as {
        decodeAudioData: (...args: unknown[]) => Promise<AudioBuffer>;
      }
    ).decodeAudioData = function (
      this: BaseAudioContext,
      ...args: unknown[]
    ): Promise<AudioBuffer> {
      return nativeDecode.apply(this, args as never).then((buffer) => {
        probe.decoded += 1;
        return buffer;
      });
    };

  });
}

async function openGuestStudio(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /continue as guest/i }).click();
  await expect(page).toHaveURL(/guest-access/);

  // Guest clearance lives in memory; a full reload would drop it and bounce
  // back to /login. Enter through the guest page's Studio card instead.
  const studio = page.getByRole('button', { name: /^studio\b/i }).first();
  await expect(studio).toBeVisible();
  await studio.click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.locator('[data-studio-workspace]')).toBeVisible({
    timeout: 30_000,
  });

  // A brand-new Studio auto-opens the Music Map. It is useful onboarding, but
  // it covers the transport; dismiss it when present.
  const closeMap = page.getByRole('button', {
    name: 'Close the map',
    exact: true,
  });
  await closeMap
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => undefined);
  if (await closeMap.isVisible().catch(() => false)) {
    await closeMap.click();
  }
}

async function readProbe(page: Page): Promise<AudioProbe> {
  return page.evaluate(() => {
    const probe = (
      window as Window & { __factorySampleProbe?: AudioProbe }
    ).__factorySampleProbe;
    return probe ?? { decoded: 0 };
  });
}

test('factory presets load and decode from the bundled sample bank when playback starts', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    }),
  );

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const samples: SampleResponse[] = [];
  page.on('response', (response) => {
    if (!response.url().includes('/assets/samples/factory/')) return;
    samples.push({ url: response.url(), status: response.status() });
  });

  await installAudioProbe(page);
  await openGuestStudio(page);

  const play = page.getByRole('button', {
    name: 'Start playback (Space)',
    exact: true,
  });
  await expect(play).toBeVisible();

  const beforePlay = await readProbe(page);
  await play.click();

  await expect
    .poll(() => samples.length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await readProbe(page)).decoded, { timeout: 30_000 })
    .toBeGreaterThan(beforePlay.decoded);
  await expect(
    page.getByRole('button', {
      name: 'Pause playback (Space)',
      exact: true,
    }),
  ).toBeVisible();

  const origin = new URL(page.url()).origin;
  for (const sample of samples) {
    expect(sample.status, sample.url).toBe(200);
    const url = new URL(sample.url);
    expect(url.origin, sample.url).toBe(origin);
    expect(url.pathname, sample.url).toMatch(
      /^\/assets\/samples\/factory\/[^/]+\.(mp3|m4a)$/i,
    );
  }

  expect(
    new Set(samples.map((sample) => new URL(sample.url).pathname)).size,
    `factory samples requested: ${samples
      .map((sample) => sample.url)
      .join(', ')}`,
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('factory kick pad produces non-silent master output', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    }),
  );

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openGuestStudio(page);
  await page.getByRole('button', { name: /switch to sound pads view/i }).click();
  await expect(page.locator('app-sound-pad-grid')).toBeVisible({
    timeout: 30_000,
  });

  const samples: SampleResponse[] = [];
  page.on('response', (response) => {
    if (!response.url().includes('/assets/samples/factory/')) return;
    samples.push({ url: response.url(), status: response.status() });
  });

  // `masterOutput` is the single bus everything the artist hears passes
  // through. The analyser alone is a dead end, so a zero-gain sink pulls it
  // without changing the audible mix.
  const audible = await page.evaluate(async () => {
    const ng = (window as any).ng;
    const studio = ng.getComponent(document.querySelector('app-studio'));
    const grid = ng.getComponent(document.querySelector('app-sound-pad-grid'));
    const engine = studio.audioEngine as {
      ctx: AudioContext;
      masterOutput: AudioNode;
    };
    const context = engine.ctx;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    const sink = context.createGain();
    sink.gain.value = 0;
    engine.masterOutput.connect(analyser);
    analyser.connect(sink);
    sink.connect(context.destination);

    const data = new Float32Array(analyser.fftSize);
    const readPeak = (): number => {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const magnitude = Math.abs(data[i]);
        if (magnitude > peak) peak = magnitude;
      }
      return peak;
    };

    const baseline = readPeak();
    const kickIndex = grid
      .pads()
      .findIndex((pad: { label: string }) => pad.label === 'KICK');
    if (kickIndex < 0) throw new Error('KICK pad not found');
    // Call the grid's real pad handler: KICK → trap-kit-elite → the bundled
    // Sample Pi kick one-shot. Pointer activation is covered by pad specs.
    grid.triggerPad(kickIndex);
    let peak = baseline;
    const started = performance.now();
    while (performance.now() - started < 4_000) {
      peak = Math.max(peak, readPeak());
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { baseline, peak, contextState: context.state };
  });

  expect(audible.contextState).toBe('running');
  expect(audible.baseline).toBeLessThan(0.001);
  expect(audible.peak).toBeGreaterThan(0.01);

  expect(
    samples.map((sample) => sample.url.split('/').pop()),
    `factory samples requested: ${samples.map((sample) => sample.url).join(', ')}`,
  ).toContain('samples-sample-pi-drums-one-shots-kick-bd-808.m4a');
  for (const sample of samples) {
    expect(sample.status, sample.url).toBe(200);
  }
  expect(errors).toEqual([]);
});
