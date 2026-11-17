#!/usr/bin/env node
/**
 * Real-browser frame-cadence check for the frame-locked export.
 *
 * This is deliberately not a unit test: it drives the shipped export button,
 * saves the actual download, and reads the WebM SimpleBlock timestamps. A
 * transcode that merely names the file 30fps cannot pass this check; the
 * encoded blocks themselves have to sit on the requested grid.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4200';
const OUT = process.env.OUT || 'artifacts/frame-locked-cadence.webm';
const AUTH_SALT = process.env.AUTH_SALT || 'SMUVE_SALT_V4_SECURE_HASH';
const FPS = Number(process.env.FPS || 30);
const SECONDS = Number(process.env.SECONDS || 2);
const USER = {
  id: 'user_frame_lock_verify',
  email: 'frame-lock@smuve.test',
  artistName: 'Frame Lock Verify',
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
  acceptDownloads: true,
});
await context.addInitScript(
  ({ session }) => {
    sessionStorage.setItem('smuve_auth_session', session);
    localStorage.setItem('smuve_music_map_seen', '1');
    localStorage.setItem('smuve_onboarding_complete', '1');
  },
  { session: SESSION },
);
// Leave /api requests to the dev server. Fulfilling them with a synthetic
// payload breaks profile restore and logs the seeded session out.
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error') {
    errors.push(text);
    console.log('[browser:error]', text.slice(0, 500));
  } else if (/ffmpeg|frame|mux|error/i.test(text)) {
    console.log('[browser]', message.type(), text.slice(0, 500));
  }
});
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));

await page.goto(`${BASE}/image-video-lab`, {
  waitUntil: 'domcontentloaded',
  timeout: 90_000,
});
await page.locator('app-image-video-lab .cinema-shell').waitFor({
  timeout: 90_000,
});

const setup = await page.evaluate(
  ({ fps, seconds }) => {
    const host = document.querySelector('app-image-video-lab');
    const component = window.ng?.getComponent?.(host);
    if (!component) throw new Error('The Lab component is not reachable.');
    component.addCgiLayer();
    component.exportWindow.set(seconds);
    component.exportFps.set(fps);
    component.exportCodec.set('webm');
    component.exportScale.set('1080p');
    component.exportStart.set(0);
    const clip = component.selectedClip();
    return {
      clip: clip?.name,
      scene: !!clip?.effects?.cgiScene?.enabled,
      duration: component.videoEngine.duration(),
      frames: component.exportPlan().seconds * fps,
      dimensions: component.exportDimensions(),
    };
  },
  { fps: FPS, seconds: SECONDS },
);
if (!setup.scene) throw new Error('The CGI scene did not attach to a clip.');

await page.locator('app-image-video-lab .cinema-shell').evaluate(() => {
  window.scrollTo(0, 0);
});
let download = null;
page.on('download', (event) => {
  download = event;
});
await page.getByRole('button', { name: /EXPORT VIDEO/i }).first().click();
for (let tick = 0; tick < 60 && !download; tick += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const state = await page
    .evaluate(() => {
      const host = document.querySelector('app-image-video-lab');
      const component = window.ng?.getComponent?.(host);
      return {
        feedback: component?.aiFeedback?.(),
        progress: component?.exportProgress?.(),
        exporting: component?.isExporting?.(),
      };
    })
    .catch((error) => ({ error: error.message }));
  console.log('[export]', JSON.stringify(state));
}
if (!download) throw new Error('The frame-locked export never downloaded.');
const downloadPath = path.resolve(OUT);
await download.saveAs(downloadPath);

const feedback = await page.evaluate(() => {
  const host = document.querySelector('app-image-video-lab');
  const component = window.ng?.getComponent?.(host);
  return {
    feedback: component?.aiFeedback?.(),
    progress: component?.exportProgress?.(),
    exporting: component?.isExporting?.(),
  };
});

await browser.close();

// ── Minimal EBML reader: enough to find the video track and its blocks. ──
const bytes = readFileSync(downloadPath);
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const view = new DataView(buffer);

function readVint(offset, isId = false) {
  if (offset >= view.byteLength) throw new Error('EBML read past end');
  const first = view.getUint8(offset);
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8) throw new Error('Invalid EBML vint');
  let value = isId ? first : first & (mask - 1);
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + view.getUint8(offset + i);
  }
  return { value, length };
}

function element(offset) {
  const id = readVint(offset, true);
  const size = readVint(offset + id.length);
  const dataStart = offset + id.length + size.length;
  const dataEnd = dataStart + size.value;
  if (dataEnd > view.byteLength) throw new Error('EBML element overruns file');
  return { id: id.value, start: offset, dataStart, dataEnd };
}

function children(start, end) {
  const out = [];
  let offset = start;
  while (offset < end) {
    const next = element(offset);
    out.push(next);
    offset = next.dataEnd;
  }
  return out;
}

function uintAt(item) {
  let value = 0;
  for (let i = item.dataStart; i < item.dataEnd; i += 1) {
    value = value * 256 + view.getUint8(i);
  }
  return value;
}

const ID = {
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  defaultDuration: 0x23e383,
  cluster: 0x1f43b675,
  clusterTimecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
};

const root = children(0, view.byteLength);
const segment = root.find((item) => item.id === ID.segment);
if (!segment) throw new Error('No WebM Segment in the download.');

const segmentChildren = children(segment.dataStart, segment.dataEnd);
let timecodeScale = 1_000_000;
let videoTrack = -1;
let audioTrack = -1;
let defaultDurationNs = 0;
for (const item of segmentChildren) {
  if (item.id === ID.info) {
    const scale = children(item.dataStart, item.dataEnd).find(
      (child) => child.id === ID.timecodeScale,
    );
    if (scale) timecodeScale = uintAt(scale);
  }
  if (item.id === ID.tracks) {
    for (const entry of children(item.dataStart, item.dataEnd)) {
      if (entry.id !== ID.trackEntry) continue;
      const fields = children(entry.dataStart, entry.dataEnd);
      const number = fields.find((child) => child.id === ID.trackNumber);
      const type = fields.find((child) => child.id === ID.trackType);
      const duration = fields.find(
        (child) => child.id === ID.defaultDuration,
      );
      if (number && type && uintAt(type) === 1) {
        videoTrack = uintAt(number);
        if (duration) defaultDurationNs = uintAt(duration);
      } else if (number && type && uintAt(type) === 2) {
        audioTrack = uintAt(number);
      }
    }
  }
}
if (videoTrack < 0) throw new Error('No video track in the WebM download.');

const samples = [];
let audioPackets = 0;
const audioTimes = [];
for (const cluster of segmentChildren) {
  if (cluster.id !== ID.cluster) continue;
  const clusterChildren = children(cluster.dataStart, cluster.dataEnd);
  const clusterTimecode = clusterChildren.find(
    (child) => child.id === ID.clusterTimecode,
  );
  const clusterMs = clusterTimecode ? uintAt(clusterTimecode) : 0;
  for (const child of clusterChildren) {
    const block =
      child.id === ID.simpleBlock
        ? child
        : child.id === ID.blockGroup
          ? children(child.dataStart, child.dataEnd).find(
              (nested) => nested.id === ID.block,
            )
          : null;
    if (!block) continue;
    const track = readVint(block.dataStart);
    if (track.value === audioTrack) {
      const relative = view.getInt16(block.dataStart + track.length);
      audioTimes.push(((clusterMs + relative) * timecodeScale) / 1_000_000);
      audioPackets += 1;
      continue;
    }
    if (track.value !== videoTrack) continue;
    const relative = view.getInt16(block.dataStart + track.length);
    samples.push({
      ms: ((clusterMs + relative) * timecodeScale) / 1_000_000,
      keyframe:
        child.id === ID.simpleBlock
          ? (view.getUint8(block.dataStart + track.length + 2) & 0x80) !== 0
          : true,
    });
  }
}

samples.sort((a, b) => a.ms - b.ms);
const deltas = samples.slice(1).map((sample, index) => sample.ms - samples[index].ms);
const sortedDeltas = [...deltas].sort((a, b) => a - b);
const medianDelta = sortedDeltas.length
  ? sortedDeltas[Math.floor(sortedDeltas.length / 2)]
  : 0;
const expectedDelta = 1000 / FPS;
const expectedFrames = Math.round(SECONDS * FPS);
const maxCadenceError = deltas.length
  ? Math.max(...deltas.map((delta) => Math.abs(delta - expectedDelta)))
  : 0;
const durationMs = samples.length
  ? samples[samples.length - 1].ms +
    (defaultDurationNs ? defaultDurationNs / 1_000_000 : expectedDelta)
  : 0;

const report = {
  file: downloadPath,
  bytes: bytes.length,
  setup,
  feedback,
  errors,
  videoTrack,
  audioTrack,
  audioPackets,
  audioFirstMs: audioTimes[0] ?? null,
  audioLastMs: audioTimes[audioTimes.length - 1] ?? null,
  frameCount: samples.length,
  expectedFrames,
  firstMs: samples[0]?.ms ?? null,
  lastMs: samples[samples.length - 1]?.ms ?? null,
  durationMs,
  expectedDurationMs: SECONDS * 1000,
  medianDeltaMs: medianDelta,
  expectedDeltaMs: expectedDelta,
  minDeltaMs: sortedDeltas[0] ?? null,
  maxDeltaMs: sortedDeltas[sortedDeltas.length - 1] ?? null,
  maxCadenceErrorMs: maxCadenceError,
  uniqueDeltas: [...new Set(deltas.map((delta) => delta.toFixed(3)))].slice(
    0,
    12,
  ),
};
console.log(JSON.stringify(report, null, 2));

const cadenceOk =
  samples.length === expectedFrames &&
  maxCadenceError <= 1.01 &&
  Math.abs(durationMs - SECONDS * 1000) <= 1000 / FPS;
if (!cadenceOk) process.exitCode = 1;
