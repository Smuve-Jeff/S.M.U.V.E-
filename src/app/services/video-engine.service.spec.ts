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

    it('does not count intentional storyboard overlays as missing media', () => {
      const engine = createEngine();
      const snapshot = engine.snapshot();
      snapshot.tracks[0].clips.push({
        ...clip({ url: '', type: 'overlay', note: 'AI staged shot' }),
        id: 'storyboard',
        trackId: 't1',
      });

      const report = engine.restore(snapshot);

      expect(report.clipsMissingMedia).toBe(0);
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

    it('sanitizes malformed clip placement instead of leaking it past the timeline', () => {
      const engine = createEngine();
      const snapshot = engine.snapshot();
      snapshot.tracks[0].clips.push({
        ...clip({ url: 'data:image/jpeg;base64,AAAA', startTime: -20, duration: 9999 }),
        id: 'malformed',
        trackId: 't1',
      });

      engine.restore(snapshot);

      const restored = engine.findClip('malformed')!;
      expect(restored.startTime).toBe(0);
      expect(restored.duration).toBe(engine.duration());
    });

    it('finds markers with a non-negative tolerance only', () => {
      const engine = createEngine();
      engine.addMarker('Scene', 10);

      expect(engine.markerNear(10.1, -1)).toBeNull();
      expect(engine.markerNear(10.1, 0.2)?.label).toBe('Scene');
    });

    it('splits trimmed clips at the active picture boundary', () => {
      const engine = createEngine();
      const id = engine.addClip(
        't1',
        clip({ startTime: 0, duration: 10, offset: 4, effects: { ...clip().effects, trimStart: 2 } })
      );

      const rightIds = engine.splitClipsAt(6);
      const left = engine.findClip(id)!;
      const right = engine.findClip(rightIds[0])!;

      expect(rightIds).toHaveLength(1);
      expect(left.duration).toBe(6);
      expect(right.startTime).toBe(6);
      // Source time at the cut: offset 4 + head trim 2 + 4s of picture elapsed.
      expect(right.offset).toBe(10);
    });

    it('upgrades a v1 snapshot instead of refusing it', () => {
      const engine = createEngine();
      engine.addClip('t1', clip({ url: 'data:image/jpeg;base64,AAAA' }));
      const snapshot = engine.snapshot();
      // Rewrite the record as the previous release wrote it: no motion, no
      // speed and no FX rack anywhere on the clip.
      (snapshot as { version: number }).version = 1;
      delete (snapshot.tracks[0].clips[0].effects as Record<string, unknown>)
        .motion;
      delete (snapshot.tracks[0].clips[0].effects as Record<string, unknown>)
        .speed;
      delete (snapshot.tracks[0].clips[0].effects as Record<string, unknown>).fx;

      const report = engine.restore(snapshot);
      const restored = engine.tracks()[0].clips[0];

      expect(report.clips).toBe(1);
      expect(restored.effects.motion).toBe('none');
      expect(restored.effects.speed).toBe(1);
      expect(restored.effects.fx).toEqual([]);
    });

    it('drops FX entries a record could not have meant', () => {
      const engine = createEngine();
      const snapshot = engine.snapshot();
      snapshot.tracks[0].clips.push({
        ...clip({ url: 'data:image/jpeg;base64,AAAA' }),
        id: 'graded',
        trackId: 't1',
        effects: {
          ...clip().effects,
          speed: 900,
          fx: [
            { id: 'vignette', value: 0.5 },
            { id: 'not-an-effect', value: 0.5 },
            { id: 'film-grain', value: Number.NaN },
            { id: 'glow', value: 0 },
          ] as never,
        },
      });

      engine.restore(snapshot);
      const restored = engine.findClip('graded')!;

      expect(restored.effects.fx).toEqual([{ id: 'vignette', value: 0.5 }]);
      expect(restored.effects.speed).toBe(4);
    });
  });

  describe('edit operations', () => {
    it('ripple-deletes a clip and closes the gap on its own lane only', () => {
      const engine = createEngine();
      const first = engine.addClip(
        't1',
        clip({ url: 'data:image/jpeg;base64,AAAA', startTime: 0, duration: 4 })
      );
      engine.addClip(
        't1',
        clip({ url: 'data:image/jpeg;base64,AAAA', startTime: 4, duration: 4 })
      );
      const cue = engine.addClip(
        't4',
        clip({ url: 'data:image/jpeg;base64,AAAA', startTime: 4, duration: 4 })
      );

      const shifted = engine.rippleDeleteClip(first);

      expect(shifted).toBe(1);
      expect(engine.findClip(first)).toBeNull();
      expect(engine.findClip(cue)!.startTime).toBe(4);
      expect(engine.tracks()[0].clips[0].startTime).toBe(0);
    });

    it('refuses to ripple a locked lane', () => {
      const engine = createEngine();
      const id = engine.addClip(
        't1',
        clip({ url: 'data:image/jpeg;base64,AAAA', startTime: 0, duration: 4 })
      );
      engine.tracks.update((tracks) =>
        tracks.map((track) =>
          track.id === 't1' ? { ...track, locked: true } : track
        )
      );

      expect(engine.rippleDeleteClip(id)).toBe(-1);
      expect(engine.findClip(id)).not.toBeNull();
    });

    it('cuts a lane into one scene card per marker', () => {
      const engine = createEngine();
      engine.applyDeliveryPreset('movie-festival-master');
      engine.addMarker('Act I', 0, 'act');
      engine.addMarker('Act II', 30, 'act');
      engine.addMarker('Act III', 60, 'act');

      const created = engine.cutLaneIntoScenes('t1', 'act');
      const cards = engine.tracks()[0].clips;

      expect(created).toBe(3);
      expect(cards.map((card) => card.name)).toEqual([
        'Act I',
        'Act II',
        'Act III',
      ]);
      // Cards tile the timeline without a gap, so nothing is left uncovered.
      expect(cards[0].startTime).toBe(0);
      expect(cards[1].startTime).toBe(cards[0].startTime + cards[0].duration);
    });

    it('does not cut a lane into scenes with no markers to cut on', () => {
      const engine = createEngine();

      expect(engine.cutLaneIntoScenes('t1', 'act')).toBe(0);
      expect(engine.tracks()[0].clips).toHaveLength(0);
    });

    it('grades every clip on the timeline in one pass', () => {
      const engine = createEngine();
      engine.addClip('t1', clip({ url: 'data:image/jpeg;base64,AAAA' }));
      engine.addClip('t2', clip({ url: 'data:image/jpeg;base64,AAAA' }));

      expect(engine.gradeAllClips('noir')).toBe(2);
      expect(
        engine
          .tracks()
          .flatMap((track) => track.clips)
          .every((entry) => entry.effects.filter === 'noir')
      ).toBe(true);
    });

    it('sets an FX dial everywhere and clears it at zero', () => {
      const engine = createEngine();
      engine.addClip('t1', clip({ url: 'data:image/jpeg;base64,AAAA' }));

      expect(engine.applyEffectToAllClips('vignette', 0.4)).toBe(1);
      expect(engine.tracks()[0].clips[0].effects.fx).toEqual([
        { id: 'vignette', value: 0.4 },
      ]);

      expect(engine.applyEffectToAllClips('vignette', 0)).toBe(1);
      expect(engine.tracks()[0].clips[0].effects.fx).toEqual([]);
    });
  });

  describe('source-time mapping', () => {
    it('skips the trimmed head, scales by speed and never goes negative', () => {
      const engine = createEngine();
      const id = engine.addClip(
        't1',
        clip({
          url: 'data:image/jpeg;base64,AAAA',
          offset: 10,
          duration: 20,
          effects: { ...clip().effects, trimStart: 2, speed: 2 },
        })
      );
      const entry = engine.findClip(id)!;

      // 3s into the picture: offset 10 + trim 2 + (3s × 2×) = 18.
      expect(engine.resolveSourceTime(entry, 3)).toBe(18);
      // Behind the picture the mapping runs back through the head trim, so it
      // lands on 2 — a real source time, not the clamp.
      expect(engine.resolveSourceTime(entry, -5)).toBe(2);
      // Far enough back to go negative, it floors at 0 rather than seeking to a
      // negative source time the decoder would reject.
      expect(engine.resolveSourceTime(entry, -20)).toBe(0);
    });

    it('clamps a speed a record could not have rendered', () => {
      const engine = createEngine();

      expect(engine.clampSpeed(0.01)).toBe(0.25);
      expect(engine.clampSpeed(100)).toBe(4);
      expect(engine.clampSpeed(undefined)).toBe(1);
    });

    it('preserves the trimmed source span when a video speed changes', () => {
      const engine = createEngine();
      const id = engine.addClip(
        't1',
        clip({
          url: 'data:video/webm;base64,AAAA',
          startTime: 10,
          duration: 12,
          offset: 5,
          effects: { ...clip().effects, trimStart: 2, trimEnd: 2, speed: 1 },
        })
      );

      engine.updateClip(id, {
        effects: { ...engine.findClip(id)!.effects, speed: 2 },
      });

      const fast = engine.findClip(id)!;
      expect(fast.duration).toBe(8);
      expect(fast.startTime).toBe(10);
      expect(fast.effects.trimStart).toBe(2);
      expect(fast.effects.trimEnd).toBe(2);
      // The active 4s portion now spans the same 8s of source media.
      expect(engine.resolveSourceTime(fast, fast.duration - 4)).toBe(15);
    });

    it('does not resize a still when its speed metadata changes', () => {
      const engine = createEngine();
      const id = engine.addClip(
        't2',
        clip({ type: 'image', duration: 6, effects: { ...clip().effects, speed: 1 } })
      );

      engine.updateClip(id, {
        effects: { ...engine.findClip(id)!.effects, speed: 2 },
      });

      expect(engine.findClip(id)!.duration).toBe(6);
    });

  });
});

/**
 * The transport is started from several places — the play button, a cue
 * countdown, the export window, the post-capture handoff — so `play()` has to
 * survive being called on an already-running timeline. Two loops advancing the
 * same clock run the edit at double speed until one of them is cancelled, and
 * the second loop leaks past every `pause()`.
 */
describe('VideoEngineService transport', () => {
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

  /** Deterministic animation frames — the loop only runs when asked to. */
  const countFrames = () => {
    const globals = globalThis as any;
    const original = {
      raf: globals.requestAnimationFrame,
      caf: globals.cancelAnimationFrame,
    };
    const raf = jest.fn().mockReturnValue(1);
    globals.requestAnimationFrame = raf;
    globals.cancelAnimationFrame = jest.fn();
    return {
      raf,
      restore: () => {
        globals.requestAnimationFrame = original.raf;
        globals.cancelAnimationFrame = original.caf;
      },
    };
  };

  it('does not start a second animation loop when play is called again', () => {
    const frames = countFrames();
    try {
      const engine = createEngine();

      engine.play();
      engine.play();

      expect(engine.isPlaying()).toBe(true);
      expect(frames.raf).toHaveBeenCalledTimes(1);
    } finally {
      frames.restore();
    }
  });

  it('still plays after a pause', () => {
    const frames = countFrames();
    try {
      const engine = createEngine();

      engine.play();
      engine.pause();
      engine.play();

      expect(engine.isPlaying()).toBe(true);
      expect(frames.raf).toHaveBeenCalledTimes(2);
    } finally {
      frames.restore();
    }
  });

  it('stops on the exact timeline end instead of wrapping to zero', () => {
    const globals = globalThis as any;
    const original = {
      raf: globals.requestAnimationFrame,
      caf: globals.cancelAnimationFrame,
    };
    let callback: FrameRequestCallback | undefined;
    globals.requestAnimationFrame = jest.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    });
    globals.cancelAnimationFrame = jest.fn();
    const now = jest.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      const engine = createEngine();
      engine.duration.set(1);
      engine.seek(0.9);
      engine.play();

      callback?.(1200);

      expect(engine.currentTime()).toBe(1);
      expect(engine.isPlaying()).toBe(false);
    } finally {
      now.mockRestore();
      globals.requestAnimationFrame = original.raf;
      globals.cancelAnimationFrame = original.caf;
    }
  });
});
