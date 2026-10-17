/**
 * Smoke tests for the built package.
 * They run against dist/, so they verify what shipping consumers receive.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const cinema = require('../dist');

test('entry point exposes the public API', () => {
  assert.equal(typeof cinema.CinemaEngine, 'function');
  assert.equal(typeof cinema.SpecialEffects, 'function');
  assert.equal(typeof cinema.Transitions, 'function');
  assert.equal(typeof cinema.VoiceOver, 'function');
  assert.equal(typeof cinema.Filters, 'function');
  assert.equal(typeof cinema.Crop, 'function');
  assert.equal(typeof cinema.TextEditor, 'function');
  assert.equal(typeof cinema.VideoUploader, 'function');
  assert.equal(typeof cinema.VideoAnalyzer, 'function');
  assert.equal(cinema.DEFAULT_UPLOAD_ENDPOINT, '/api/videos/upload');
  assert.ok(Array.isArray(cinema.DEFAULT_ACCEPTED_TYPES));
  assert.equal(typeof cinema.findSpriteFrame, 'function');
  assert.equal(typeof cinema.spriteBackgroundStyle, 'function');
  assert.equal(typeof cinema.toSpriteSheetMeta, 'function');
});

test('engine applies effects and rejects unknown ones', () => {
  const engine = new cinema.CinemaEngine();
  const applied = engine.applyEffect('cinematic', { intensity: 0.7 });
  assert.equal(applied.effect, 'cinematic');
  assert.equal(applied.intensity, 0.7);
  assert.throws(() => engine.applyEffect('not-an-effect', {}), /Unknown effect/);
});

test('engine enhancement reports metrics', () => {
  const engine = new cinema.CinemaEngine();
  const { result, metrics } = engine.enhanceForMusicVideo({ width: 1920, height: 1080 }, {});
  assert.ok(result);
  assert.equal(typeof metrics.durationMs, 'number');
  assert.equal(metrics.usedAI, false);
  assert.equal(metrics.integration, 'none');
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
