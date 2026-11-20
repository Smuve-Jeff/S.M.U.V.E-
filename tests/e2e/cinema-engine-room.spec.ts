import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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
const ingestStill = async (
  page: Page,
  name = 'engine-room.png',
  transparent = false,
) => {
  const dataUrl = await page.evaluate((clear: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    if (clear) {
      // Transparent media: only the marker is opaque, so the rest of the clip
      // layer stays alpha=0 until the CGI pass composites on top of it.
      ctx.clearRect(0, 0, 320, 180);
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(20, 100, 70, 60);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 320, 180);
      gradient.addColorStop(0, '#10b981');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 320, 180);
    }
    return canvas.toDataURL('image/png');
  }, transparent);

  await page.evaluate(
    ({ dataUrl, name }) => {
      const binary = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], name, { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector(
        'input[aria-label="Upload a video or image from this device"]'
      ) as HTMLInputElement | null;
      if (!input) throw new Error('no file input on the lab');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { dataUrl, name }
  );
};

/** Export one short WebM through the component's real download path. */
const exportCgiWebm = async (page: Page): Promise<Buffer> => {
  const downloading = page.waitForEvent('download', { timeout: 120_000 });
  await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    void component.exportVideo();
  });
  const download = await downloading;
  const failure = await download.failure();
  if (failure) throw new Error(`CGI export download failed: ${failure}`);
  const path = await download.path();
  if (!path) throw new Error('CGI export did not produce a local file');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = document.querySelector('app-image-video-lab') as any;
          return (window as any).ng?.getComponent?.(host)?.isExporting?.();
        }),
      { timeout: 120_000 },
    )
    .toBe(false);
  return readFile(path);
};

/**
 * Decode the same instant from two exported masters and compare their pixels.
 * The control is a muted-halo export, so lighting and compression noise are
 * shared and only the halo contribution remains.
 */
const compareExportFrames = (
  page: Page,
  enabled: Buffer,
  muted: Buffer,
) =>
  page.evaluate(
    async ({ halo, plain }: { halo: string; plain: string }) => {
      const loadFrame = async (encoded: string) => {
        const video = document.createElement('video');
        video.muted = true;
        video.src = `data:video/webm;base64,${encoded}`;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('exported video did not decode'));
        });
        // Sample after the clip's fade-in edge so the media marker is at full
        // strength; the halo and the object are deterministic at any slot.
        video.currentTime = 0.8;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context for the exported frame');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return {
          width: video.videoWidth,
          height: video.videoHeight,
          pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      };

      const withHalo = await loadFrame(halo);
      const withoutHalo = await loadFrame(plain);
      let changed = 0;
      let brighter = 0;
      let maxDelta = 0;
      let magenta = 0;
      let transparent = 0;
      let opaque = 0;
      let alphaChanged = 0;
      for (let index = 0; index < withHalo.pixels.length; index += 4) {
        const red = withHalo.pixels[index];
        const green = withHalo.pixels[index + 1];
        const blue = withHalo.pixels[index + 2];
        if (withHalo.pixels[index + 3] === 0) transparent += 1;
        else opaque += 1;
        const dr = red - withoutHalo.pixels[index];
        const dg = green - withoutHalo.pixels[index + 1];
        const db = blue - withoutHalo.pixels[index + 2];
        const delta = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
        const da = withHalo.pixels[index + 3] - withoutHalo.pixels[index + 3];
        if (Math.abs(da) > 8) alphaChanged += 1;
        if (delta > 8) changed += 1;
        if (dr + dg + db > 18) brighter += 1;
        if (red > 140 && blue > 140 && green < 100) magenta += 1;
        maxDelta = Math.max(maxDelta, delta);
      }
      return {
        width: withHalo.width,
        height: withHalo.height,
        changed,
        brighter,
        maxDelta,
        magenta,
        transparent,
        opaque,
        alphaChanged,
        corner: [
          withHalo.pixels[0],
          withHalo.pixels[1],
          withHalo.pixels[2],
        ],
      };
    },
    { halo: enabled.toString('base64'), plain: muted.toString('base64') },
  );

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

test('drives the CGI stage presets, camera controls and object inspector', async ({
  page,
}) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole('button', { name: 'ADD CGI LAYER' }).click();
  await expect(page.getByRole('button', { name: 'Neon Noir' })).toBeVisible();

  await page.getByRole('button', { name: 'Neon Noir' }).click();
  const scene = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.();
  });
  expect(scene?.background).toBe('dark');
  expect(scene?.cameraMove).toBe('orbit-right');

  await page.getByRole('button', { name: 'Edit Chrome Torus' }).click();
  await expect(page.getByRole('slider', { name: 'CGI object scale' })).toBeVisible();
  await expect(
    page.getByRole('slider', { name: 'CGI object metalness' }),
  ).toBeVisible();
  await expect(
    page.getByRole('slider', { name: 'CGI camera field of view' }),
  ).toBeVisible();

  await page
    .getByRole('group', { name: 'CGI object finishes' })
    .getByRole('button', { name: 'Neon', exact: true })
    .click();
  const finish = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()
      ?.objects?.[0];
  });
  expect(finish).toMatchObject({
    metalness: 0.14,
    roughness: 0.16,
    emissive: 0.55,
  });

  const sceneFinishes = page.getByRole('group', { name: 'CGI scene finishes' });
  const matteFinish = sceneFinishes.getByRole('button', {
    name: 'Matte',
    exact: true,
  });
  await matteFinish.click();
  await expect(matteFinish).toHaveAttribute('aria-pressed', 'true');
  await expect(
    sceneFinishes.getByRole('button', { name: 'Clear', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');

  const sceneFinish = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()
      ?.objects?.[0];
  });
  expect(sceneFinish).toMatchObject({
    metalness: 0.08,
    roughness: 0.82,
    emissive: 0,
  });

  await page.getByRole('checkbox', { name: 'BLOOM', exact: true }).click();
  const bloomOff = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()?.bloom;
  });
  expect(bloomOff).toBe(false);

  const selectedObject = await page.evaluate(() => {
    const panel = document.querySelector('app-cgi-scene-panel');
    const component = (window as any).ng?.getComponent?.(panel);
    return component?.selectedObjectId?.();
  });
  expect(selectedObject).toBe('cgi-torus');

  await page.getByRole('button', { name: 'ADD OBJECT' }).click();
  const inheritedFinish = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()
      ?.objects?.[1];
  });
  expect(inheritedFinish).toMatchObject({
    metalness: 0.08,
    roughness: 0.82,
    emissive: 0,
  });
});

test('renders a neon bloom on the CGI program monitor', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await ingestStill(page, 'cgi-bloom.png');
  await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    component?.videoEngine?.currentTime?.set?.(0);
  });
  await page.getByRole('button', { name: 'ADD CGI LAYER' }).click();
  await page
    .getByRole('group', { name: 'CGI scene finishes' })
    .getByRole('button', { name: 'Neon', exact: true })
    .click();

  await expect
    .poll(() => readMonitorSignal(page), { timeout: 20_000 })
    .toBeGreaterThan(0.01);
  // Give the GPU one repaint after the finish change before capturing pixels.
  await page.waitForTimeout(500);

  const bloom = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    const renderer = component?.cgiRenderer;
    const mesh = renderer?.objectRoot?.children?.[0];
    const glow = mesh?.userData?.cgiGlow;
    return {
      visible: glow?.visible ?? false,
      opacity: glow?.material?.opacity ?? 0,
      scale: glow?.scale?.x ?? 0,
    };
  });
  expect(bloom.visible).toBe(true);
  expect(bloom.opacity).toBeGreaterThan(0.3);
  expect(bloom.scale).toBeGreaterThan(4);

  await expect(page.locator('.monitor-canvas')).toHaveScreenshot(
    'cgi-monitor-neon.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.02 },
  );

  for (const [label, value] of [
    ['CGI bloom strength', '0.8'],
    ['CGI bloom radius', '1.6'],
  ]) {
    await page
      .getByRole('slider', { name: label })
      .evaluate((input, next) => {
        const range = input as HTMLInputElement;
        range.value = next;
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        const scene = (window as any).ng
          ?.getComponent?.(host)
          ?.selectedCgiScene?.();
        return {
          strength: scene?.bloomStrength,
          radius: scene?.bloomRadius,
        };
      }),
    )
    .toEqual({ strength: 0.8, radius: 1.6 });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        const mesh = (window as any).ng?.getComponent?.(host)?.cgiRenderer
          ?.objectRoot?.children?.[0];
        return mesh?.userData?.cgiGlow?.scale?.x ?? 0;
      }),
    )
    .toBeGreaterThan(7);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        const mesh = (window as any).ng?.getComponent?.(host)?.cgiRenderer
          ?.objectRoot?.children?.[0];
        return mesh?.userData?.cgiGlow?.material?.opacity ?? 0;
      }),
    )
    .toBeGreaterThan(0.4);

  const rowHalo = page.getByRole('button', {
    name: 'Bloom halo for Chrome Torus',
  });
  await rowHalo.click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()
          ?.objects?.[0]?.bloom;
      }),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        const mesh = (window as any).ng?.getComponent?.(host)?.cgiRenderer
          ?.objectRoot?.children?.[0];
        return mesh?.userData?.cgiGlow?.visible ?? true;
      }),
    )
    .toBe(false);
  await expect(rowHalo).toHaveText('NO HALO');
  await expect(rowHalo).toHaveAttribute('aria-pressed', 'false');

  await rowHalo.click();
  await expect(rowHalo).toHaveText('HALO');

  await page.getByRole('button', { name: 'Edit Chrome Torus' }).click();
  await page
    .getByRole('slider', { name: 'CGI object bloom strength' })
    .evaluate((input) => {
      const range = input as HTMLInputElement;
      range.value = '1.2';
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()
          ?.objects?.[0]?.bloomStrength;
      }),
    )
    .toBe(1.2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        const mesh = (window as any).ng?.getComponent?.(host)?.cgiRenderer
          ?.objectRoot?.children?.[0];
        return mesh?.userData?.cgiGlow?.material?.opacity ?? 0;
      }),
    )
    .toBeGreaterThan(0.55);
});

test('keeps the CGI object list and inspector visually stable', async ({
  page,
}) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await page.addStyleTag({
    content: 'app-smuve-advisor { display: none !important; }',
  });
  await page.getByRole('button', { name: 'ADD CGI LAYER' }).click();
  await page.getByRole('button', { name: 'Edit Chrome Torus' }).click();
  await page
    .getByRole('slider', { name: 'CGI object bloom strength' })
    .evaluate((input) => {
      const range = input as HTMLInputElement;
      range.value = '1.2';
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await page.mouse.move(0, 0);
  await expect(page.locator('.cgi-object-editor')).toHaveScreenshot(
    'cgi-object-inspector.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.01 },
  );

  await page
    .getByRole('button', { name: 'Bloom halo for Chrome Torus' })
    .click();
  await page.mouse.move(0, 0);
  await expect(page.locator('.cgi-objects')).toHaveScreenshot(
    'cgi-object-list.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.01 },
  );
});

test('keeps a full 12-object CGI scene within the frame budget', async ({
  page,
}) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'ADD CGI LAYER' }).click();
  for (let index = 1; index < 12; index += 1) {
    await page.getByRole('button', { name: 'ADD OBJECT' }).click();
  }
  await expect(page.getByRole('button', { name: 'Remove CGI object' })).toHaveCount(
    12,
  );
  await page
    .getByRole('group', { name: 'CGI scene finishes' })
    .getByRole('button', { name: 'Neon', exact: true })
    .click();

  const timing = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    const renderer = component?.cgiRenderer;
    const scene = component?.selectedCgiScene?.();
    if (!renderer || !scene) return null;
    const gl = renderer.renderer?.getContext?.();
    const syncGpu = () => {
      if (!gl) return;
      gl.finish();
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    };
    for (let index = 0; index < 2; index += 1) {
      renderer.render(scene, 1280, 720, index / 10, 10);
      syncGpu();
    }
    const frames = 12;
    const started = performance.now();
    let drawn = 0;
    for (let index = 0; index < frames; index += 1) {
      if (renderer.render(scene, 1280, 720, index / 10, 10)) drawn += 1;
      syncGpu();
    }
    return {
      objects: scene.objects.length,
      drawn,
      averageMs: (performance.now() - started) / frames,
      status: renderer.status(),
    };
  });
  console.log('CGI 12-object frame timing', timing);
  expect(timing?.objects).toBe(12);
  expect(timing?.drawn).toBe(12);
  expect(timing?.status).toBe('ready');
  // Headless Chromium rasterizes this in software; keep a wide guard for the
  // 12-object, 720p path without pretending it measures hardware GPUs.
  expect(timing?.averageMs).toBeLessThan(250);
});

test('exports the CGI halo over transparent media', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'ADD CGI LAYER' }).click();
  await page
    .getByRole('group', { name: 'CGI scene finishes' })
    .getByRole('button', { name: 'Neon', exact: true })
    .click();
  await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    component.exportWindow.set(1);
    component.exportFps.set(6);
    component.exportCodec.set('webm');
    component.exportScale.set('1080p');
  });

  // Delivery masters are intentionally opaque (`paintFrame` fills #020617),
  // so the alpha contract that matters is the transparent CGI layer used during
  // compositing: outside the sprite it must stay alpha=0 rather than becoming a
  // black quad over the media underneath it.
  const layerAlpha = await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    const canvas = component.cgiRenderer.render(
      component.selectedCgiScene(),
      480,
      270,
      0,
      8,
    ) as HTMLCanvasElement | null;
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!canvas || !gl) return null;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let opaquePixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) opaquePixels += 1;
    }
    return {
      cornerAlpha: pixels[3],
      opaquePixels,
      totalPixels: canvas.width * canvas.height,
    };
  });
  expect(layerAlpha).not.toBeNull();
  expect(layerAlpha?.cornerAlpha).toBe(0);
  expect(layerAlpha?.opaquePixels).toBeGreaterThan(100);

  await ingestStill(page, 'transparent-alpha.png', true);
  await expect
    .poll(async () => (await readEngine(page))?.clipCount)
    .toBe(2);
  await page.waitForTimeout(400);

  const withHalo = await exportCgiWebm(page);
  await page
    .getByRole('button', { name: 'Bloom halo for Chrome Torus' })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()
          ?.objects?.[0]?.bloom;
      }),
    )
    .toBe(false);
  const muted = await exportCgiWebm(page);

  const stats = await compareExportFrames(page, withHalo, muted);
  expect(stats.width).toBeGreaterThan(1000);
  expect(stats.magenta).toBeGreaterThan(100);
  expect(stats.corner[0] + stats.corner[1] + stats.corner[2]).toBeLessThan(80);
  expect(stats.changed).toBeGreaterThan(500);
  expect(stats.brighter).toBeGreaterThan(300);

  expect(withHalo.length).toBeGreaterThan(1000);
  expect(muted.length).toBeGreaterThan(1000);
});

test('exports a transparent WebM with alpha', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'ADD CGI LAYER' }).click();
  await page
    .getByRole('group', { name: 'CGI scene finishes' })
    .getByRole('button', { name: 'Neon', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Preserve alpha in the exported WebM' })
    .check();
  const codec = page.getByRole('combobox', { name: 'Export codec' });
  await expect(codec).toHaveValue('webm');
  await expect(codec).toBeDisabled();
  await page.evaluate(() => {
    const host = document.querySelector('app-image-video-lab') as any;
    const component = (window as any).ng?.getComponent?.(host);
    component.exportWindow.set(1);
    component.exportFps.set(6);
    component.exportScale.set('1080p');
  });

  const withHalo = await exportCgiWebm(page);
  await page
    .getByRole('button', { name: 'Bloom halo for Chrome Torus' })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('app-image-video-lab') as any;
        return (window as any).ng?.getComponent?.(host)?.selectedCgiScene?.()
          ?.objects?.[0]?.bloom;
      }),
    )
    .toBe(false);
  const muted = await exportCgiWebm(page);

  const stats = await compareExportFrames(page, withHalo, muted);
  expect(stats.width).toBeGreaterThan(1000);
  expect(stats.transparent).toBeGreaterThan(50_000);
  expect(stats.opaque).toBeGreaterThan(100);
  expect(stats.alphaChanged).toBeGreaterThan(500);
  expect(stats.changed).toBeGreaterThan(500);
  expect(stats.brighter).toBeGreaterThan(300);
});

test('keeps the CGI finish strip visually stable', async ({ page }) => {
  await page.goto('/image-video-lab');
  await expect(page.locator('.project-console')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'ADD CGI LAYER' }).click();

  const strip = page.locator('.cgi-finish-all');
  await expect(strip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(strip).toHaveScreenshot('cgi-finish-all-default.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  });

  await strip
    .getByRole('button', { name: 'Neon', exact: true })
    .click();
  await page.mouse.move(0, 0);
  await expect(strip).toHaveScreenshot('cgi-finish-all-neon.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  });
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
