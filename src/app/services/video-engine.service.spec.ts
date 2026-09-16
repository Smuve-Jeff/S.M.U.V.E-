import { TestBed } from '@angular/core/testing';
import { AudioEngineService } from './audio-engine.service';
import { CinemaSnapshot, VideoClip, VideoEngineService } from './video-engine.service';

/**
 * The project snapshot is the only thing keeping a film or a broadcast rundown
 * alive across sessions, so it is tested as a real round trip: build an edit,
 * capture it, then restore it onto a *fresh* engine — the closest a unit test
 * gets to closing the tab and coming back.
 */
describe('VideoEngineService project snapshot', () => {
  /** A complete clip body; `addClip` supplies the id and the lane. */
  const clip = (
    overrides: Partial<Omit<VideoClip, 'id' | 'trackId'>> = {}
  ): Omit<VideoClip, 'id' | 'trackId'> => ({
    name: 'Take 1',
    url: 'blob:take-1',
    startTime: 10,
    duration: 5,
    offset: 0,
    type: 'video',
    effects: {
      upscale: false,
      bgRemoval: false,
      noiseReduction: false,
      brightness: 1,
      contrast: 1,
      filter: 'none',
      transition: 'cut',
      transitionDuration: 0.4,
      trimStart: 0,
      trimEnd: 0,
    },
    ...overrides,
  });

  /**
   * A brand-new engine, as a reopened app would build it. Resetting the module
   * between calls is what makes "fresh session" meaningful — the service is
   * `providedIn: 'root'`, so a plain `inject` would hand back the same instance
   * and a restore that never ran would still look like it worked.
   */
  const createEngine = (): VideoEngineService => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        VideoEngineService,
        { provide: AudioEngineService, useValue: { tempo: () => 120 } },
      ],
    });
    return TestBed.inject(VideoEngineService);
  };

  it('starts every project from the same four lanes', () => {
    const engine = createEngine();

    expect(engine.tracks().map((track) => track.id)).toEqual([
      't1',
      't2',
      't3',
      't4',
    ]);
    expect(engine.tracks().every((track) => track.clips.length === 0)).toBe(true);
  });

  describe('snapshot', () => {
    it('keeps media that outlives the session and drops what cannot', () => {
      const engine = createEngine();
      engine.addClip('t1', clip({ url: 'blob:take-1', name: 'Take' }));
      engine.addClip(
        't1',
        clip({ url: 'data:image/jpeg;base64,AAAA', name: 'Still' })
      );

      const urls = engine.snapshot().tracks[0].clips.map((entry) => entry.url);

      // A `blob:` url belongs to the document that minted it; a `data:` url
      // carries its own bytes, so only one of these can be reopened.
      expect(urls).toEqual(['', 'data:image/jpeg;base64,AAAA']);
    });

    it('copies the edit so a later change cannot rewrite a saved project', () => {
      const engine = createEngine();
      const id = engine.addClip(
        't1',
        clip({ url: 'data:image/jpeg;base64,AAAA' })
      );
      const snapshot = engine.snapshot();

      engine.updateClip(id, { name: 'Renamed' });
      engine.addMarker('Act 2', 30);
      engine.setLowerThird({ title: 'Host' });

      expect(snapshot.tracks[0].clips[0].name).toBe('Take 1');
      expect(snapshot.markers).toEqual([]);
      expect(snapshot.lowerThird.title).toBe('');
    });
  });

  describe('restore', () => {
    it('round-trips a whole edit onto a fresh engine', () => {
      const first = createEngine();
      first.setProductionMode('music');
      first.safeZoneEnabled.set(false);
      first.snapToBeat.set(true);
      first.setLowerThird({ enabled: true, title: 'Host', subtitle: 'Live' });
      first.addMarker('Verse', 12, 'section');
      first.addClip(
        't2',
        clip({ url: 'data:image/jpeg;base64,AAAA', name: 'Cue' })
      );
      first.seek(4);
      const snapshot = first.snapshot();

      const second = createEngine();
      const report = second.restore(snapshot);

      expect(second.productionMode()).toBe('music');
      expect(second.deliveryPreset().id).toBe(snapshot.deliveryPresetId);
      expect(second.safeZoneEnabled()).toBe(false);
      expect(second.snapToBeat()).toBe(true);
      expect(second.lowerThird()).toEqual({
        enabled: true,
        title: 'Host',
        subtitle: 'Live',
      });
      expect(second.markers().map((marker) => marker.label)).toEqual(['Verse']);
      expect(
        second.tracks().find((track) => track.id === 't2')!.clips[0].name
      ).toBe('Cue');
      expect(second.currentTime()).toBe(4);
      expect(report).toEqual({ clips: 1, markers: 1, clipsMissingMedia: 0 });
    });

    it('reports which clips came back without media', () => {
      const first = createEngine();
      first.addClip('t1', clip({ url: 'blob:take-1' }));
      first.addClip('t1', clip({ url: 'data:image/jpeg;base64,AAAA' }));
      const snapshot = first.snapshot();

      const second = createEngine();
      const report = second.restore(snapshot);

      expect(report.clips).toBe(2);
      expect(report.clipsMissingMedia).toBe(1);
    });

    it('does not restore transport state and clamps the playhead', () => {
      const engine = createEngine();
      const snapshot: CinemaSnapshot = {
        ...engine.snapshot(),
        duration: 120,
        currentTime: 999,
      };

      engine.restore(snapshot);

      // A reopened project must not land mid-playback, and a playhead past the
      // end of a shorter record would leave the monitor showing nothing.
      expect(engine.isPlaying()).toBe(false);
      expect(engine.countdownRemaining()).toBeNull();
      expect(engine.duration()).toBe(120);
      expect(engine.currentTime()).toBe(120);
    });

    it('takes lane membership from the track a clip is stored on', () => {
      const engine = createEngine();
      const snapshot = engine.snapshot();
      snapshot.tracks[1].clips.push({
        ...clip({ url: 'data:image/jpeg;base64,AAAA' }),
        id: 'x1',
        // Deliberately wrong: the record claims a lane it is not stored on.
        trackId: 't1',
      });

      engine.restore(snapshot);

      const overlay = engine.tracks().find((track) => track.id === 't2')!;
      expect(overlay.clips).toHaveLength(1);
      expect(overlay.clips[0].trackId).toBe('t2');
      expect(
        engine.tracks().find((track) => track.id === 't1')!.clips
      ).toHaveLength(0);
    });

    it('never leaves the editor without a lane to drop a clip on', () => {
      const engine = createEngine();

      engine.restore({ ...engine.snapshot(), tracks: [] });

      expect(engine.tracks()).toHaveLength(4);
    });

    it('ignores an empty snapshot instead of clearing the open edit', () => {
      const engine = createEngine();
      engine.addMarker('Keep me', 5);

      const report = engine.restore(null);

      expect(engine.markers()).toHaveLength(1);
      expect(report).toEqual({ clips: 0, markers: 0, clipsMissingMedia: 0 });
    });
  });
});
