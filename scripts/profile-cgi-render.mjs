#!/usr/bin/env node
/**
 * CGI render-cost profile for the frame-locked export.
 *
 * Runs the shipped Three.js renderer against the default CGI scene, forces the
 * GPU queue to finish with `gl.finish()`, and reports the per-frame cost at the
 * export rasters. The variant pass turns shadows/reflections off one at a time
 * so the report says what the time is being spent on, not just that it is slow.
 *
 * Headless Chromium uses SwiftShader here, so these are software-rasterizer
 * numbers: useful as an upper bound and for relative cost, not a GPU promise.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4200';
const AUTH_SALT = process.env.AUTH_SALT || 'SMUVE_SALT_V4_SECURE_HASH';
const FRAMES = Number(process.env.FRAMES || 8);
const USER = {
  id: 'user_cgi_profile',
  email: 'cgi-profile@smuve.test',
  artistName: 'CGI Profile',
  role: 'Artist',
  permissions: ['STANDARD'],
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLogin: '2026-01-01T00:00:00.000Z',
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString(
  'base64',
);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
await context.addInitScript(
  ({ session }) => {
    sessionStorage.setItem('smuve_auth_session', session);
    localStorage.setItem('smuve_music_map_seen', '1');
    localStorage.setItem('smuve_onboarding_complete', '1');
  },
  { session: SESSION },
);
const page = await context.newPage();
await page.goto(`${BASE}/image-video-lab`, {
  waitUntil: 'domcontentloaded',
  timeout: 90_000,
});
await page.locator('app-image-video-lab .cinema-shell').waitFor({
  timeout: 90_000,
});

const report = await page.evaluate(
  async ({ frames }) => {
    const host = document.querySelector('app-image-video-lab');
    const component = window.ng?.getComponent?.(host);
    if (!component) throw new Error('The Lab component is not reachable.');
    component.addCgiLayer();
    const renderer = component.cgiRenderer;
    const clip = component.selectedClip();
    const baseScene = clip?.effects?.cgiScene;
    if (!renderer || !baseScene?.enabled) {
      throw new Error('The CGI scene did not attach to the renderer.');
    }

    const percentile = (values, fraction) => {
      if (!values.length) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
    };

    const bench = (scene, width, height, count) => {
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const ctx = output.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2D canvas unavailable');

      let cgi = null;
      const renderTimes = [];
      const compositeTimes = [];
      for (let index = 0; index < count + 2; index += 1) {
        const t = index / 30;
        const renderStart = performance.now();
        cgi = renderer.render(scene, width, height, t, 8);
        if (!cgi) throw new Error('CGI renderer returned no canvas');
        const gl = cgi.getContext('webgl2') || cgi.getContext('webgl');
        gl?.finish?.();
        renderTimes.push(performance.now() - renderStart);

        const compositeStart = performance.now();
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(cgi, 0, 0);
        // Force the composite copy to complete instead of timing command issue.
        ctx.getImageData(0, 0, 1, 1);
        compositeTimes.push(performance.now() - compositeStart);
      }
      renderTimes.splice(0, 2);
      compositeTimes.splice(0, 2);
      const medianRender = percentile(renderTimes, 0.5);
      const medianComposite = percentile(compositeTimes, 0.5);
      return {
        width,
        height,
        frames: count,
        renderMedianMs: +medianRender.toFixed(2),
        renderP95Ms: +percentile(renderTimes, 0.95).toFixed(2),
        compositeMedianMs: +medianComposite.toFixed(2),
        frameMedianMs: +(medianRender + medianComposite).toFixed(2),
        framesPerSecond: +(1000 / (medianRender + medianComposite)).toFixed(2),
        secondsFor8sAt30fps: +(
          ((medianRender + medianComposite) * 240) /
          1000
        ).toFixed(1),
      };
    };

    const benchPaint = (scene, width, height, count) => {
      component.updateSelectedCgiScene(scene);
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const ctx = output.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2D canvas unavailable');

      const times = [];
      for (let index = 0; index < count + 2; index += 1) {
        component.videoEngine.seek(index / 30);
        const start = performance.now();
        component.paintFrame(output, ctx, true);
        const gl = component.cgiRenderer?.renderer?.getContext?.('webgl2');
        gl?.finish?.();
        // The real export also copies the finished master into a VideoFrame;
        // this readback keeps the composite from being timed as queued only.
        ctx.getImageData(0, 0, 1, 1);
        times.push(performance.now() - start);
      }
      times.splice(0, 2);
      const median = percentile(times, 0.5);
      return {
        width,
        height,
        frames: count,
        paintMedianMs: +median.toFixed(2),
        paintP95Ms: +percentile(times, 0.95).toFixed(2),
        framesPerSecond: +(1000 / median).toFixed(2),
        secondsFor8sAt30fps: +((median * 240) / 1000).toFixed(1),
      };
    };

    const defaultScene = JSON.parse(JSON.stringify(baseScene));
    const noShadows = { ...defaultScene, shadows: false };
    const noReflections = { ...defaultScene, reflections: false };
    const lean = { ...defaultScene, shadows: false, reflections: false };

    return {
      devicePixelRatio: window.devicePixelRatio,
      webgl: (() => {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        return info
          ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : gl
            ? 'WebGL available'
            : 'WebGL unavailable';
      })(),
      defaultScene: {
        objects: defaultScene.objects.length,
        shadows: defaultScene.shadows,
        reflections: defaultScene.reflections,
      },
      variantsAt1080p: [
        {
          name: 'default',
          ...bench(defaultScene, 1920, 1080, frames),
          paint: benchPaint(defaultScene, 1920, 1080, frames),
        },
        {
          name: 'no shadows',
          ...bench(noShadows, 1920, 1080, frames),
          paint: benchPaint(noShadows, 1920, 1080, frames),
        },
        {
          name: 'no reflections',
          ...bench(noReflections, 1920, 1080, frames),
          paint: benchPaint(noReflections, 1920, 1080, frames),
        },
        {
          name: 'no shadows + no reflections',
          ...bench(lean, 1920, 1080, frames),
          paint: benchPaint(lean, 1920, 1080, frames),
        },
      ],
      rasters: [
        {
          name: '1080p preset',
          ...bench(defaultScene, 1920, 804, frames),
          paint: benchPaint(defaultScene, 1920, 804, frames),
        },
        {
          name: '1440p',
          ...bench(defaultScene, 2560, 1072, frames),
          paint: benchPaint(defaultScene, 2560, 1072, frames),
        },
        {
          name: '4K preset',
          ...bench(defaultScene, 3840, 1606, Math.max(3, Math.min(frames, 4))),
          paint: benchPaint(
            defaultScene,
            3840,
            1606,
            Math.max(3, Math.min(frames, 4))
          ),
        },
      ],
    };
  },
  { frames: FRAMES },
);

console.log(JSON.stringify(report, null, 2));
await browser.close();
