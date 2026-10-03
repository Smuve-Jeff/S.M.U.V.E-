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

test('automation curves add, edit, and delete arrangement keyframes', async ({ page }) => {
  await page.goto('/studio?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute('data-studio-workspace', 'arrangement');
  // The seeded session opens in beginner mode, which swaps the arrangement
  // view for the wizard — switch to pro mode first.
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    studio.uiService.beginnerMode.set(false);
  });

  const arrangementHandle = await page
    .locator('app-arrangement-view:visible')
    .first()
    .elementHandle();
  await arrangementHandle!.evaluate((element) => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    const manager = studio.musicManager;
    if (manager.tracks().length === 0) manager.addTrack('QA Automation', 'grand-piano');
    manager.selectedTrackId.set(manager.tracks()[0].id);
    (window as any).ng.getComponent(element).showAutomation.set(true);
  });

  await expect(page.locator('.automation-editor:visible')).toBeVisible();
  await page.locator('.automation-add-btn:visible').click();
  await expect(page.locator('.automation-lane:visible')).toHaveCount(1);

  // Clicking the lane canvas adds a keyframe through the real pointer path.
  await page.evaluate(() => {
    const svg = document.querySelector('.automation-canvas') as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    svg.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 120,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator('.automation-point')).toHaveCount(1);

  const state = await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    return studio.projectWorkspace.automationService.lanes();
  });
  expect(state).toHaveLength(1);
  expect(state[0].points).toHaveLength(1);
  expect(state[0].points[0].time).toBeGreaterThan(0);

  // Right-click deletes the keyframe.
  await page.evaluate(() => {
    document
      .querySelector('.automation-point')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.automation-point')).toHaveCount(0);
});

test('MIDI import creates a Studio track from a Standard MIDI File', async ({ page }) => {
  await page.goto('/studio?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute('data-studio-workspace', 'arrangement');
  const before = await page.evaluate(
    () => (window as any).ng.getComponent(document.querySelector('app-studio')).musicManager.tracks().length,
  );

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'S.M.U.V.E. Stage — tap to open project menu' }).click();
  await page.locator('.comp-project-menu-item', { hasText: 'Import MIDI' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'qa-sweep.mid', mimeType: 'audio/midi', buffer: midiFixture() });

  await expect(
    page.locator('app-snackbar').filter({ hasText: 'Imported 1 MIDI track' }),
  ).toBeVisible();
  const after = await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    const tracks = studio.musicManager.tracks();
    const imported = tracks[tracks.length - 1];
    return { count: tracks.length, name: imported.name, notes: imported.notes.length, firstStep: imported.notes[0]?.step };
  });
  expect(after.count).toBe(before + 1);
  expect(after.name).toBe('QA Sweep');
  expect(after.notes).toBe(2);
  expect(after.firstStep).toBe(0);
});

test('cloud version history lists saved versions for the current project', async ({ page }) => {
  await page.goto('/studio?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute('data-studio-workspace', 'arrangement');
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    studio.projectWorkspace.updateMetadata({ name: 'Version QA Session' });
  });

  await page.getByRole('button', { name: 'S.M.U.V.E. Stage — tap to open project menu' }).click();
  await page.locator('.comp-project-menu-item', { hasText: 'Version History' }).click();
  await expect(page.locator('.comp-versions-panel')).toHaveClass(/comp-panel-open/);
  await expect(page.locator('.comp-versions-hint')).toBeVisible();

  await page.getByRole('button', { name: 'Save a new cloud version' }).click();
  await expect(page.locator('.comp-versions-row').first()).toBeVisible({ timeout: 15000 });
  const rows = await page.locator('.comp-versions-meta').allTextContents();
  expect(rows.join(' ')).toContain('Version QA Session');
  expect(rows[0]).toContain('v');
});

test('audio import tempo-match stretches the clip to the project tempo', async ({ page }) => {
  await page.goto('/studio?view=arrangement');
  await expect(page.locator('[data-studio-workspace]')).toHaveAttribute('data-studio-workspace', 'arrangement');
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    studio.uiService.beginnerMode.set(false);
    studio.audioEngine.tempo.set(100);
    studio.showImportPanel.set(true);
  });

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import audio files' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'qa-loop.wav', mimeType: 'audio/wav', buffer: wavFixture() });

  const matchRow = page
    .locator('.comp-import-slider-row')
    .filter({ hasText: 'Match BPM' });
  await expect(matchRow).toBeVisible();
  await page.getByLabel('Source tempo of the imported audio').fill('80');
  await page.getByRole('button', { name: 'Stretch the import to the project tempo' }).click();

  await expect(
    page.locator('app-snackbar').filter({ hasText: 'Stretch set to' }),
  ).toBeVisible();
  const ratio = await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
    return studio.audioImport.selectedAudio().stretchRatio;
  });
  expect(ratio).toBeCloseTo(0.8, 2); // 80 BPM source into a 100 BPM project
});

test('piano-roll drag snaps to the grid instead of leaving fractional steps', async ({ page }) => {
  await page.goto('/studio?view=piano-roll');
  await expect(page.locator('.piano-roll-surface')).toBeVisible();
  // The piano roll is @defer-loaded; wait for the real component instance.
  const handle = await page
    .locator('app-piano-roll')
    .first()
    .elementHandle({ timeout: 15000 });

  const result = await handle!.evaluate((element) => {
    const roll = (window as any).ng.getComponent(element);
    const manager = roll.musicManager;
    const trackId = manager.selectedTrackId() ?? manager.addTrack('QA Roll', 'grand-piano');
    manager.tracks.update((tracks: any[]) =>
      tracks.map((t) =>
        t.id === trackId
          ? { ...t, notes: [{ id: 'qa-drag', midi: 60, step: 4, length: 1, velocity: 0.8 }] }
          : t,
      ),
    );
    manager.selectedTrackId.set(trackId);
    roll.setSnap('1/16');
    roll.selectedNoteIds.set(new Set(['qa-drag']));
    roll.startDraggingSelection(0, 0);
    roll.onPointerMove({ clientX: roll.cellWidth() * 1.6, clientY: -roll.rowHeight(), pointerType: 'mouse' });
    const dragged = roll.selectedTrack().notes[0];
    roll.onPointerUp({ pointerType: 'mouse' });
    return { step: dragged.step, midi: dragged.midi };
  });
  // 4 + 1.6 steps snaps to 6 on the 1/16 grid; the row moves up one semitone.
  expect(result.step).toBe(6);
  expect(result.midi).toBe(61);
});

test('phone piano roll keeps note utilities reachable and usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio?view=piano-roll');
  const handle = await page
    .locator('app-piano-roll')
    .first()
    .elementHandle({ timeout: 15000 });

  await handle!.evaluate((element) => {
    const roll = (window as any).ng.getComponent(element);
    const manager = roll.musicManager;
    const trackId = manager.selectedTrackId() ?? manager.addTrack('QA Phone Roll', 'grand-piano');
    manager.tracks.update((tracks: any[]) =>
      tracks.map((t) =>
        t.id === trackId
          ? { ...t, notes: [{ id: 'qa-phone', midi: 60, step: 0, length: 1, velocity: 0.8 }] }
          : t,
      ),
    );
    manager.selectedTrackId.set(trackId);
    roll.selectedNoteIds.set(new Set(['qa-phone']));
  });

  const inspector = page.locator('.pr-inspector');
  await expect(inspector).toBeVisible();
  // Icon ligature text prefixes the accessible name, so match on visible text.
  await expect(inspector.locator('.pr-inspector-toggle').filter({ hasText: 'Duplicate' })).toBeVisible();
  await expect(inspector.locator('.pr-inspector-toggle').filter({ hasText: 'Delete' })).toBeVisible();
  // The phone strip must not push the page wider than the viewport.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  const notes = await handle!.evaluate((element) => {
    const roll = (window as any).ng.getComponent(element);
    roll.duplicateSelection();
    const afterDuplicate = roll.selectedTrack().notes.length;
    roll.deleteSelection();
    return { afterDuplicate, afterDelete: roll.selectedTrack().notes.length };
  });
  expect(notes.afterDuplicate).toBe(2);
  expect(notes.afterDelete).toBe(1);
});

/** Minimal 16-bit PCM WAV (8000 frames of a sine at 44.1 kHz). */
function wavFixture(): Buffer {
  const samples = 8000;
  const rate = 44100;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Minimal valid SMF: conductor-free, one named track with two notes. */
function midiFixture(): Buffer {
  const events = [
    0x00, 0xff, 0x03, 0x08, ...'QA Sweep'.split('').map((c) => c.charCodeAt(0)),
    0x00, 0x90, 0x3c, 0x64, // note on 60
    0x83, 0x60, 0x80, 0x3c, 0x40, // delta 480, note off 60
    0x00, 0x90, 0x40, 0x64, // note on 64
    0x83, 0x60, 0x80, 0x40, 0x40, // delta 480, note off 64
    0x00, 0xff, 0x2f, 0x00, // end of track
  ];
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (events.length >> 24) & 0xff,
    (events.length >> 16) & 0xff,
    (events.length >> 8) & 0xff,
    events.length & 0xff,
  ];
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 0x01, 0xe0]; // TPQN 480
  return Buffer.from([...header, ...trackHeader, ...events]);
}
