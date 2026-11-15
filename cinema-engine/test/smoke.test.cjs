/**
 * Smoke tests for the built package.
 * They run against dist/, so they verify what shipping consumers receive.
 *
 * The package is intentionally media-analysis only now (see cinemaEngine.ts):
 * rendering lives in the app's canvas renderer.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const cinema = require('../dist');

test('entry point exposes the analysis API', () => {
  assert.equal(typeof cinema.CinemaEngine, 'function');
  assert.equal(typeof cinema.VideoUploader, 'function');
  assert.equal(typeof cinema.VideoAnalyzer, 'function');
  assert.equal(cinema.DEFAULT_UPLOAD_ENDPOINT, '/api/videos/upload');
  assert.ok(Array.isArray(cinema.DEFAULT_ACCEPTED_TYPES));
  assert.equal(cinema.MASTER_CAPTURE_WINDOW_SECONDS, 120);
  assert.equal(typeof cinema.assessSource, 'function');
  assert.equal(typeof cinema.findSpriteFrame, 'function');
  assert.equal(typeof cinema.spriteBackgroundStyle, 'function');
  assert.equal(typeof cinema.toSpriteSheetMeta, 'function');
});

test('engine exposes metadata and thumbnail analysis without descriptor modules', () => {
  const engine = new cinema.CinemaEngine();
  assert.equal(typeof engine.extractVideoMetadata, 'function');
  assert.equal(typeof engine.assessVideo, 'function');
  assert.equal(typeof engine.captureThumbnail, 'function');
  assert.equal(typeof engine.createSpriteSheet, 'function');
  assert.equal(typeof engine.uploadVideo, 'function');
  // The removed descriptor surface must stay gone.
  assert.equal(engine.applyEffect, undefined);
  assert.equal(engine.applyFilter, undefined);
  assert.equal(engine.enhanceForMusicVideo, undefined);
});

test('sprite helpers map a playback position onto its tile', () => {
  const frames = Array.from({ length: 16 }, (_, index) => ({
    index,
    time: (10 * (index + 0.5)) / 16,
    x: (index % 4) * 160,
    y: Math.floor(index / 4) * 90,
    width: 160,
    height: 90,
  }));
  const sheet = { duration: 10, frames };

  assert.equal(cinema.findSpriteFrame(sheet, 0).index, 0);
  assert.equal(cinema.findSpriteFrame(sheet, 5).index, 8);
  assert.equal(cinema.findSpriteFrame(sheet, 10).index, 15);
  assert.equal(cinema.findSpriteFrame(sheet, -1).index, 0);
  assert.equal(cinema.findSpriteFrame({ duration: 0, frames: [] }, 1), undefined);

  const style = cinema.spriteBackgroundStyle({ url: 'blob:sheet', width: 640, height: 360 }, frames[5]);
  assert.equal(style.backgroundImage, 'url("blob:sheet")');
  assert.equal(style.backgroundPosition, '-160px -90px');
  assert.equal(style.backgroundSize, '640px 360px');
  assert.equal(style.width, '160px');
  assert.equal(style.height, '90px');
});

test('sprite meta drops image data and keeps the tile map', () => {
  const frames = [{ index: 0, time: 1, x: 0, y: 0, width: 160, height: 90 }];
  const meta = cinema.toSpriteSheetMeta({
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    url: 'blob:sheet',
    width: 160,
    height: 90,
    columns: 1,
    rows: 1,
    frameWidth: 160,
    frameHeight: 90,
    frames,
    duration: 10,
    type: 'image/jpeg',
  });
  assert.deepEqual(Object.keys(meta).sort(), [
    'columns', 'duration', 'frameHeight', 'frameWidth', 'frames', 'height', 'rows', 'width',
  ]);
  assert.equal(meta.frames, frames);
});

test('assessment treats a two-hour 4K source as a feature, not a single capture', () => {
  const assessment = cinema.assessSource({
    duration: 7200,
    width: 3840,
    height: 2160,
    aspectRatio: 1.7778,
    type: 'video/mp4',
    size: 8 * 1024 ** 3,
    filename: 'feature.mp4',
  });

  assert.equal(assessment.tier, 'uhd');
  assert.equal(assessment.runtimeClass, 'feature');
  assert.equal(assessment.longForm, true);
  assert.equal(assessment.exceedsCaptureWindow, true);
  assert.equal(assessment.upscaleTo4k, 1);
  assert.ok(assessment.warnings.some((warning) => /section by section/.test(warning)));
  assert.deepEqual(assessment.recommendedMaster, {
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateMbps: 29.9,
  });
});

test('assessment warns before an HD source is upscaled and compressed into a 4K master', () => {
  const assessment = cinema.assessSource({
    duration: 45,
    width: 1280,
    height: 720,
    aspectRatio: 1.7778,
    type: 'video/mp4',
    size: 20 * 1024 ** 2,
    filename: 'phone-take.mp4',
  });

  assert.equal(assessment.tier, 'hd');
  assert.equal(assessment.orientation, 'landscape');
  assert.equal(assessment.runtimeClass, 'spot');
  assert.equal(assessment.upscaleTo4k, 3);
  assert.ok(assessment.warnings.some((warning) => /upscale/.test(warning)));
  assert.ok(assessment.warnings.some((warning) => /bitrate/.test(warning)));
  assert.deepEqual(assessment.recommendedMaster, {
    width: 1280,
    height: 720,
    fps: 30,
    bitrateMbps: 6,
  });
});

test('assessment names unusable metadata instead of guessing a shape', () => {
  const assessment = cinema.assessSource({
    duration: 0,
    width: 0,
    height: 0,
    aspectRatio: 0,
    type: '',
    size: 0,
    filename: 'broken.mp4',
  });

  assert.equal(assessment.orientation, 'unknown');
  assert.equal(assessment.tier, 'sd');
  assert.equal(assessment.estimatedBitrateMbps, null);
  assert.ok(assessment.warnings.some((warning) => /frame dimensions/.test(warning)));
  assert.ok(assessment.warnings.some((warning) => /Duration is unknown/.test(warning)));
  assert.deepEqual(assessment.recommendedMaster, {
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateMbps: 7.5,
  });
});

test('uploader rejects an oversized file before any request', async () => {
  const uploader = new cinema.VideoUploader();
  const file = new File(['x'.repeat(64)], 'clip.mp4', { type: 'video/mp4' });
  const result = await uploader.upload(file, {
    maxSize: 10,
    endpoint: 'http://127.0.0.1:1/never-reached',
  });
  assert.match(result.error, /File too large/);
  assert.equal(result.video.url, '');
});

test('analyzer reports that extraction needs a browser', () => {
  const analyzer = new cinema.VideoAnalyzer();
  assert.equal(analyzer.isSupported(), false);
});
