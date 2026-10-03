import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

const views = [
  'arrangement', 'session', 'piano-roll', 'drum-machine', 'channel-rack', 'mixer',
  'effects-rack', 'vocal-suite', 'dj', 'performance', 'mastering', 'ai-produce',
  'sound-browser', 'sound-pad', 'synthesizer', 'chord-editor', 'sampler', 'score',
  'sample-library', 'plugins', 'audio-recorder', 'performer',
];

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

for (const view of views) {
  test(`phone Studio canvas and primary controls: ${view}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/studio?view=${view}`);
    await expect(page.locator('[data-studio-workspace]')).toHaveAttribute('data-studio-workspace', view);
    const canvas = page.locator('.studio-primary-canvas');
    await expect(canvas).toBeVisible();
    const geometry = await canvas.boundingBox();
    expect(geometry!.width).toBeGreaterThan(300);
    expect(geometry!.height).toBeGreaterThan(180);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Start playback (Space)', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop playback (returns to bar 1)', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('workspace save failures stay visible and exported bundles restore project state', async ({ page }) => {
  await page.goto('/studio?view=mixer');
  await expect(page.locator('app-mixer')).toBeVisible();
  const failure = await page.evaluate(async () => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    const workspace = studio.projectWorkspace;
    const storage = workspace.storage;
    const original = storage.saveItem.bind(storage);
    workspace.updateMetadata({ name: 'Quality Sweep Session' });
    storage.saveItem = async () => { throw new Error('QA simulated disk full'); };
    try {
      const saved = await studio.saveProject();
      return { saved, dirty: workspace.isDirty(), error: workspace.persistenceError() };
    } finally { storage.saveItem = original; }
  });
  expect(failure).toEqual({ saved: false, dirty: true, error: 'QA simulated disk full' });
  await expect(page.getByRole('alert').filter({ hasText: 'QA simulated disk full' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.studio-save-warning')).toHaveCount(0);
  await expect(page.locator('.studio-project-status')).toBeVisible();
  await expect(page.locator('.studio-project-status')).toContainText('Saved locally');

  const roundtrip = await page.evaluate(async () => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    const workspace = studio.projectWorkspace;
    const trackId = studio.musicManager.tracks()[0].id;
    const lane = workspace.automationService.addLane(trackId, 'volume');
    workspace.automationService.addPoint(lane.id, 0, 0.45);
    studio.musicManager.structure.set([{ id: 'verse', name: 'Verse', start: 0, length: 8 }]);
    workspace.projectNotes.set('QA session notes');
    const bundle = JSON.parse(JSON.stringify(workspace.createSnapshot()));
    const before = studio.musicManager.tracks();
    const invalid = await workspace.importProjectBundle({ metadata: {}, tracks: [] });
    const unchanged = studio.musicManager.tracks() === before;
    workspace.automationService.lanes.set([]);
    workspace.projectNotes.set('');
    const restored = await workspace.importProjectBundle(bundle);
    return { invalid, unchanged, restored, lanes: workspace.automationService.lanes(), structure: studio.musicManager.structure(), notes: workspace.projectNotes() };
  });
  expect(roundtrip.invalid).toBe(false);
  expect(roundtrip.unchanged).toBe(true);
  expect(roundtrip.restored).toBe(true);
  expect(roundtrip.lanes).toHaveLength(1);
  expect(roundtrip.structure).toEqual([{ id: 'verse', name: 'Verse', start: 0, length: 8 }]);
  expect(roundtrip.notes).toBe('QA session notes');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project bundle', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Quality_Sweep_Session_v\d+\.smuve$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const artifact = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(artifact.metadata.name).toBe('Quality Sweep Session');
  expect(artifact.automation.lanes).toHaveLength(1);
  expect(artifact.notes).toBe('QA session notes');
});

test('WAV export downloads RIFF PCM and honors track gain and mute in a real offline context', async ({ page }) => {
  await page.goto('/studio?view=mixer');
  await expect(page.locator('app-mixer')).toBeVisible();
  const render = await page.evaluate(async () => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    const transport = (window as any).ng.getComponent(document.querySelector('app-transport-bar'));
    const exporter = transport.exportService;
    const manager = studio.musicManager;
    const source = { ...manager.tracks()[0], type: 'midi', clips: [], muted: false, soloed: false, gain: 0,
      notes: [{ id: 'qa-note', midi: 60, step: 0, length: 4, velocity: 0.8 }], synthParams: { type: 'sine' } };
    manager.activeLoopBars.set(1);
    manager.tracks.set([source]);
    const silent = await exporter.renderProjectOffline();
    const silentPeak = Math.max(...silent.getChannelData(0).subarray(0, 44100).map(Math.abs));
    manager.tracks.set([{ ...source, gain: 0.8 }]);
    const audible = await exporter.renderProjectOffline();
    const audiblePeak = Math.max(...audible.getChannelData(0).subarray(0, 44100).map(Math.abs));
    return { silentPeak, audiblePeak };
  });
  expect(render.silentPeak).toBe(0);
  expect(render.audiblePeak).toBeGreaterThan(0.01);
  await page.getByLabel('More studio controls', { exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.wav$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString()).toBe('WAVE');
  expect(bytes.length).toBeGreaterThan(44);
});

test('engine loop schedules the selected region and meter sweep reports representative timing', async ({ page }) => {
  await page.goto('/studio?view=mixer');
  await expect(page.locator('app-mixer')).toBeVisible();
  const results = await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    const mixer = (window as any).ng.getComponent(document.querySelector('app-mixer'));
    const engine = studio.audioEngine;
    const schedule = engine.onScheduleStep;
    const steps: number[] = [];
    engine.onScheduleStep = (step: number) => steps.push(step);
    engine.setPlaybackLoop(16, 20);
    engine.playbackLoopEnabled.set(true);
    engine.songEnded.set(false);
    engine.isPlaying.set(true);
    for (let tick = 0; tick < 6; tick++) engine.handleTick(tick, engine.ctx.currentTime, 0.1);
    engine.stop();
    engine.playbackLoopEnabled.set(false);
    engine.setPlaybackLoop(null, null);
    engine.onScheduleStep = schedule;
    const original = mixer.tracks();
    mixer.tracks.set(Array.from({ length: 32 }, (_, i) => ({ ...original[0], id: `bench-${i}`, name: `Track ${i}` })));
    mixer.updateMeters();
    const buffer = mixer.analyserBuffers.get('bench-0');
    const rounds: number[] = [];
    for (let round = 0; round < 5; round++) {
      const start = performance.now();
      for (let update = 0; update < 1000; update++) mixer.updateMeters();
      rounds.push(performance.now() - start);
    }
    const reused = buffer === mixer.analyserBuffers.get('bench-0');
    const bounded = Object.values(mixer.trackLevels()).every((value: any) => value >= 0 && value <= 1);
    mixer.tracks.set(original);
    mixer.updateMeters();
    return { steps, rounds, reused, bounded, remainingMeters: mixer.analyserMap.size, tracks: original.length };
  });
  expect(results.steps).toEqual([16, 17, 18, 19, 16, 17]);
  expect(results.reused).toBe(true);
  expect(results.bounded).toBe(true);
  expect(results.remainingMeters).toBe(results.tracks);
  console.log('32-track mixer / 1,000 updates in ms:', results.rounds);
});
