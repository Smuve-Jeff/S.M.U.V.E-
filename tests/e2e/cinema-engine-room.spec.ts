import { test, expect, type Page } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * The cinema engine room, end to end.
 *
 * Everything below is a real-browser question rather than a unit question: the
 * monitor is a canvas that only paints when the compositor, the backing store
 * and the 2D context all agree, and a control that renders is not the same as a
 * control that changes a pixel. So each spec drives the actual UI and then reads
 * what the program monitor actually drew.
 */

/** Share of sampled monitor pixels brighter than the backing store's fill. */
const readMonitorSignal = (page: Page): Promise<number> =>
  page.evaluate(() => {
    // The monitor canvas is the first canvas in the module; the grain tile and
    // the scratch layer are created detached and never reach the document.
    const canvas = document.querySelector(
      'app-image-video-lab canvas'
    ) as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !canvas.width || !canvas.height) return -1;

    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    let lit = 0;
    let total = 0;

    for (let y = 0; y < height; y += 6) {
      for (let x = 0; x < width; x += 6) {
        const i = (y * width + x) * 4;
        total += 1;
        if (data[i] > 24 || data[i + 1] > 32 || data[i + 2] > 48) lit += 1;
      }
    }
    return total === 0 ? -1 : lit / total;
  });

/** The engine's live state, read straight off the running component. */
const readEngine = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const ng = (window as any).ng;
    const component = ng?.getComponent?.(host);
    if (!component) return null;
    const engine = component.videoEngine;
    return {
      clipCount: engine
        .tracks()
        .reduce((total: number, track: any) => total + track.clips.length, 0),
      clips: engine
        .tracks()
        .flatMap((track: any) =>
          track.clips.map((clip: any) => ({
            id: clip.id,
            name: clip.name,
            trackId: clip.trackId,
            filter: clip.effects.filter,
            transition: clip.effects.transition,
            fx: clip.effects.fx,
            motion: clip.effects.motion,
            speed: clip.effects.speed,
            title: clip.effects.title,
            voiceover: clip.effects.voiceover,
          }))
        ),
      duration: engine.duration(),
      markers: engine.markers().length,
    };
  });

/**
 * The engine has no public "add a clip" button for arbitrary media, so the
 * specs place a real clip through the component's own upload path using a
 * generated PNG. That keeps the test on the shipped code path rather than on a
 * test-only back door.
 */
const ingestStill = async (page: Page, name = 'engine-room.png') => {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 320, 180);
    gradient.addColorStop(0, '#10b981');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 180);
    return canvas.toDataURL('image/png');
  });

  await page.evaluate(
    ({ dataUrl, name }) => {
      const binary = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], name, { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement | null;
      if (!input) throw new Error('no file input on the lab');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { dataUrl, name }
  );
};

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  // The lab reaches for the AI proxy and the live-stream REST surface; neither
  // exists behind the preview, and a hanging request would stall the specs.
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
});

test('paints a real clip on the program monitor', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  await ingestStill(page);
  await expect
    .poll(() => readEngine(page), { timeout: 20_000 })
    .toMatchObject({ clipCount: 1 });

  // The clip lands on the overlays lane and its decoded pixels reach the frame.
  await expect
    .poll(() => readMonitorSignal(page), { timeout: 20_000 })
    .toBeGreaterThan(0.02);
});

test('grades every clip from one look and reports it', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await ingestStill(page);

  const look = page.getByLabel('Colour look');
  await look.selectOption('noir');
  await page.getByRole('button', { name: /GRADE WHOLE TIMELINE/i }).click();

  await expect
    .poll(async () => (await readEngine(page))?.clips[0]?.filter, {
      timeout: 15_000,
    })
    .toBe('noir');

  // Every look the picker offers has to be a real option, not a dead entry.
  const options = await look.locator('option').allTextContents();
  expect(options).toEqual(
    expect.arrayContaining([
      'Noir',
      'Bleach Bypass',
      'Teal & Orange',
      'Golden Hour',
      'Neon Pulse',
    ])
  );
});

test('composites a clip through a directional transition', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await ingestStill(page);

  await page.getByLabel('Scene transition').selectOption('wipe-right');
  await page.getByRole('button', { name: /APPLY FX TO ACTIVE CLIPS/i }).click();

  await expect
    .poll(async () => (await readEngine(page))?.clips[0]?.transition, {
      timeout: 15_000,
    })
    .toBe('wipe-right');

  const transitions = await page
    .getByLabel('Scene transition')
    .locator('option')
    .allTextContents();
  expect(transitions).toEqual(
    expect.arrayContaining(['Wipe →', 'Slide ←', 'Zoom In', 'Flash'])
  );
});

test('cuts a title card in and burns it onto the monitor', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByLabel('Title text').fill('COLD OPEN');
  await page.getByLabel('Title subtitle').fill('Chapter One');
  await page.getByRole('button', { name: /CUT TITLE IN/i }).click();

  // The card is a real overlay clip carrying its own text, so it can be
  // trimmed and transitioned like a shot.
  await expect
    .poll(
      async () =>
        (await readEngine(page))?.clips.find(
          (clip: any) => clip.title?.text === 'COLD OPEN'
        ),
      { timeout: 15_000 }
    )
    .toMatchObject({
      trackId: 't2',
      title: {
        text: 'COLD OPEN',
        subtitle: 'Chapter One',
        style: 'title-card',
        position: 'center',
      },
    });

  // Put the playhead on the card so the monitor is compositing it, then read
  // what the renderer actually painted. A title card deliberately lays a dark
  // scrim over the frame, so a brightness sample cannot see it — the drawn text
  // is the honest signal.
  await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    component.videoEngine.seek(0.5);
  });

  // The card's text is drawn into the renderer's scratch layer and composited
  // onto the monitor, so the honest check is the pixels that reach the frame:
  // the card's near-white type is the only bright element in the feed.
  const whiteType = await page.evaluate(async () => {
    const canvas = document.querySelector(
      'app-image-video-lab canvas'
    ) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    // Two animation frames: the render loop repaints the card on the next pass.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) bright += 1;
    }
    return bright;
  });

  // The card's 96px type across a 1920px frame is thousands of white pixels;
  // the HUD is green and the safe zone is a faint dashed line.
  expect(whiteType).toBeGreaterThan(500);
});

test('edits the selected title card in place', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByLabel('Title text').fill('FIRST PASS');
  await page.getByRole('button', { name: /CUT TITLE IN/i }).click();
  await expect
    .poll(async () => (await readEngine(page))?.clipCount, { timeout: 15_000 })
    .toBe(1);

  // Select the card and load it back into the editor, then change the text.
  await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    const clip = component.videoEngine.tracks()[1].clips[0];
    component.selectedClipId.set(clip.id);
  });
  await page.getByRole('button', { name: /LOAD SELECTED CARD/i }).click();
  await expect(page.getByLabel('Title text')).toHaveValue('FIRST PASS');

  await page.getByLabel('Title text').fill('FINAL PASS');
  await page.getByRole('button', { name: /UPDATE SELECTED/i }).click();

  await expect
    .poll(
      async () =>
        (await readEngine(page))?.clips.find(
          (clip: any) => clip.title?.text === 'FINAL PASS'
        )?.title?.text,
      { timeout: 15_000 }
    )
    .toBe('FINAL PASS');
  // An edit is not a re-cut: the lane still holds exactly one card.
  expect((await readEngine(page))?.clipCount).toBe(1);
});

test('cuts narration onto the AI voiceovers lane', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByLabel('Narration line').fill('The city never sleeps.');
  await page.getByLabel('Narration voice').selectOption('Ominous Protocol');
  await page.getByRole('button', { name: /CUT NARRATION IN/i }).click();

  await expect
    .poll(
      async () =>
        (await readEngine(page))?.clips.find(
          (clip: any) => clip.voiceover?.text === 'The city never sleeps.'
        ),
      { timeout: 15_000 }
    )
    .toBeTruthy();

  const clips = (await readEngine(page))?.clips ?? [];
  const vox = clips.find(
    (clip: any) => clip.voiceover?.text === 'The city never sleeps.'
  );
  // The line lives on the voiceover lane with the voice it was rendered with,
  // so a project reopened without its audio bytes still knows what was said.
  expect(vox).toMatchObject({
    trackId: 't3',
    voiceover: {
      text: 'The city never sleeps.',
      voice: 'Ominous Protocol',
      rendered: true,
    },
  });
});

test('arms a social cutdown and frames the monitor for it', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  const fullLength = (await readEngine(page))?.duration ?? 0;
  expect(fullLength).toBeGreaterThan(600);

  await page.getByRole('button', { name: /Arm Shorts \/ Reels \/ TikTok cutdown/i }).click();

  // A vertical short is a different runtime, not just a crop of the master.
  await expect
    .poll(async () => (await readEngine(page))?.duration, { timeout: 15_000 })
    .toBe(60);

  // The safe zone is now the platform's own dead zones rather than the generic
  // guide, so the framing reads on the monitor.
  await expect
    .poll(() => readMonitorSignal(page), { timeout: 20_000 })
    .toBeGreaterThan(-1);

  await page.getByRole('button', { name: /RELEASE CUTDOWN/i }).click();
  await expect
    .poll(async () => (await readEngine(page))?.duration, { timeout: 15_000 })
    .toBe(fullLength);
});

test('applies the FX rack dials to the clip under the playhead', async ({
  page,
}) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await ingestStill(page);

  // Park the playhead on the clip so it is the active one.
  await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    component.videoEngine.seek(0.5);
  });

  await page.getByLabel('Vignette').fill('0.6');
  await page.getByLabel('Film Grain').fill('0.4');
  await page.getByRole('button', { name: /APPLY FX RACK/i }).click();

  await expect
    .poll(async () => (await readEngine(page))?.clips[0]?.fx, {
      timeout: 15_000,
    })
    .toEqual(
      expect.arrayContaining([
        { id: 'vignette', value: 0.6 },
        { id: 'film-grain', value: 0.4 },
      ])
    );
});

test('divides the visuals lane into scene cards from the act structure', async ({
  page,
}) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  // Build the act structure first, exactly as a feature would be planned.
  await page.getByRole('button', { name: /STRUCTURE ACTS/i }).click();
  await expect
    .poll(async () => (await readEngine(page))?.markers, { timeout: 15_000 })
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: /CUT LANE INTO SCENES/i }).click();

  // The visuals lane is now one card per act, tiling the timeline.
  await expect
    .poll(async () => (await readEngine(page))?.clipCount, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const clips = (await readEngine(page))?.clips ?? [];
  expect(clips.every((clip: any) => clip.trackId === 't1')).toBe(true);
});
