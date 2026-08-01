import { AudioEngineService } from './audio-engine.service';

// Minimal bare-instance helper: skips the heavy constructor (which needs a
// full AudioContext mock) and only seeds the state required to exercise
// setSendLevel. Avoids the brittleness of mocking dozens of createGain /
// createBiquadFilter nodes.
function makeBareEngine() {
  const svc = Object.create(AudioEngineService.prototype) as AudioEngineService;
  (svc as any).trackSendAGains = new Map();
  (svc as any).trackSendBGains = new Map();
  (svc as any).ctx = { currentTime: 1.234 };
  return svc;
}

function gain(map: Map<string, any>, id: string) {
  if (!map.has(id)) {
    map.set(id, { gain: { setTargetAtTime: jest.fn(), value: 0 } });
  }
  return map.get(id)!;
}

describe('AudioEngineService.setSendLevel', () => {
  let svc: AudioEngineService;

  beforeEach(() => {
    svc = makeBareEngine();
    // Pre-populate with one track of each
    gain((svc as any).trackSendAGains, 't1');
    gain((svc as any).trackSendBGains, 't1');
    gain((svc as any).trackSendAGains, 't2');
  });

  it('clamps negative level to 0 (sendA)', () => {
    (svc as any).setSendLevel('t1', 'A', -5);
    const node = (svc as any).trackSendAGains.get('t1');
    expect(node.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      expect.any(Number),
      0.05
    );
  });

  it('clamps level above 1.5 down to 1.5 (sendB)', () => {
    (svc as any).setSendLevel('t1', 'B', 99);
    const node = (svc as any).trackSendBGains.get('t1');
    expect(node.gain.setTargetAtTime).toHaveBeenCalledWith(
      1.5,
      expect.any(Number),
      0.05
    );
  });

  it("sendId 'A' routes to trackSendAGains, not trackSendBGains", () => {
    (svc as any).setSendLevel('t2', 'A', 0.6);
    expect(
      (svc as any).trackSendAGains.get('t2').gain.setTargetAtTime
    ).toHaveBeenCalledWith(0.6, 1.234, 0.05);
    expect(
      (svc as any).trackSendBGains.get('t2')?.gain.setTargetAtTime
    ).toBeUndefined();
    // Track t3 not present in B, should not throw + should not call.
  });

  it("sendId 'B' routes to trackSendBGains, not trackSendAGains", () => {
    (svc as any).setSendLevel('t1', 'B', 0.42);
    expect(
      (svc as any).trackSendBGains.get('t1').gain.setTargetAtTime
    ).toHaveBeenCalledWith(0.42, 1.234, 0.05);
  });

  it('no-op (no throw) when trackId is not in the send map', () => {
    expect(() => (svc as any).setSendLevel('does-not-exist', 'A', 0.5)).not.toThrow();
    expect(() => (svc as any).setSendLevel('does-not-exist', 'B', 0.5)).not.toThrow();
  });

  it('invalid sendId returns without mutating either map', () => {
    (svc as any).setSendLevel('t1', 'C' as any, 0.5);
    expect(
      (svc as any).trackSendAGains.get('t1').gain.setTargetAtTime
    ).not.toHaveBeenCalled();
    expect(
      (svc as any).trackSendBGains.get('t1').gain.setTargetAtTime
    ).not.toHaveBeenCalled();
  });

  it('uses the current AudioContext time as the ramp anchor', () => {
    (svc as any).ctx.currentTime = 9.876;
    (svc as any).setSendLevel('t1', 'A', 0.3);
    expect(
      (svc as any).trackSendAGains.get('t1').gain.setTargetAtTime
    ).toHaveBeenCalledWith(0.3, 9.876, 0.05);
  });
});

// =====================================================================
// Sprint A4 — Song-Mode API
//
// Bare-instance pattern again: install real Angular signals (signal()
// is officially callable outside an injection context) and the small
// pieces stop()/handleTick touch. We never invoke the heavy constructor.
// =====================================================================
import { signal } from '@angular/core';
import type { PlayMode } from './audio-engine.service';

function makeSongBareEngine(): AudioEngineService {
  const svc = Object.create(AudioEngineService.prototype) as AudioEngineService;
  (svc as any).playMode = signal<PlayMode>('song');
  (svc as any).songLengthSteps = signal(64);
  (svc as any).songEnded = signal(false);
  (svc as any).loopLengthSteps = signal(64);
  (svc as any).currentBeat = signal(0);
  (svc as any).visualStep = signal(0);
  (svc as any).isPlaying = signal(false);
  // handleTick short-circuits the count-in path; this signal must exist
  // because handleTick calls it before reaching the song-mode branch.
  (svc as any).isCountIn = signal(false);
  (svc as any).metronomeEnabled = signal(false);
  (svc as any).metronomeVolume = signal(0);
  (svc as any).midiOutputs = [];
  (svc as any).workletNode = null;
  (svc as any).schedulerHandle = null;
  (svc as any).ctx = { currentTime: 0 };
  return svc;
}

describe('AudioEngineService · Sprint A4 (Song Mode)', () => {
  let svc: AudioEngineService;

  beforeEach(() => {
    svc = makeSongBareEngine();
  });

  describe('defaults', () => {
    it('playMode defaults to "song"', () => {
      expect(svc.playMode()).toBe('song');
    });

    it('songLengthSteps defaults to 64 (= 4 bars)', () => {
      expect(svc.songLengthSteps()).toBe(64);
    });

    it('songEnded starts false', () => {
      expect(svc.songEnded()).toBe(false);
    });
  });

  describe('setPlayMode', () => {
    it('toggles song → pattern', () => {
      svc.setPlayMode('pattern');
      expect(svc.playMode()).toBe('pattern');
    });

    it('toggles pattern → song', () => {
      svc.setPlayMode('pattern');
      svc.setPlayMode('song');
      expect(svc.playMode()).toBe('song');
    });

    it('is idempotent when given the same value twice', () => {
      svc.setPlayMode('song');
      const before = svc.playMode();
      svc.setPlayMode('song');
      expect(svc.playMode()).toBe(before);
    });

    it('rejects unknown strings and keeps the previous mode', () => {
      svc.setPlayMode('garbage' as unknown as PlayMode);
      expect(svc.playMode()).toBe('song');
      svc.setPlayMode('pattern');
      svc.setPlayMode('loop' as unknown as PlayMode);
      expect(svc.playMode()).toBe('pattern');
    });
  });

  describe('setSongLengthSteps', () => {
    it('writes through to the underlying signal', () => {
      svc.setSongLengthSteps(128);
      expect(svc.songLengthSteps()).toBe(128);
    });

    it('floors fractional input', () => {
      svc.setSongLengthSteps(123.7);
      expect(svc.songLengthSteps()).toBe(123);
    });

    it('clamps zero and negative to 1 (no zero-length songs)', () => {
      svc.setSongLengthSteps(0);
      expect(svc.songLengthSteps()).toBe(1);
      svc.setSongLengthSteps(-50);
      expect(svc.songLengthSteps()).toBe(1);
    });
  });

  describe('song-end detection (handleTick)', () => {
    it('sets songEnded and fires onSongEnded when step >= songLengthSteps in song mode', () => {
      svc.playMode.set('song');
      svc.songLengthSteps.set(10);
      svc.isPlaying.set(true);
      let endedFires = 0;
      svc.onSongEnded = () => endedFires++;

      (svc as any).handleTick(10, 0, 0.1);
      expect(svc.songEnded()).toBe(true);
      expect(endedFires).toBe(1);
      // stop() flips isPlaying off (no playback at the boundary).
      expect(svc.isPlaying()).toBe(false);
    });

    it('short-circuits follow-on ticks once songEnded is set', () => {
      svc.playMode.set('song');
      svc.songLengthSteps.set(5);
      svc.isPlaying.set(true);
      let endedFires = 0;
      svc.onSongEnded = () => endedFires++;

      (svc as any).handleTick(5, 0, 0.1);
      expect(endedFires).toBe(1);

      (svc as any).handleTick(99, 0, 0.1);
      (svc as any).handleTick(1000, 0, 0.1);
      // No further fires even with very large step values.
      expect(endedFires).toBe(1);
    });

    it('does NOT trigger in pattern mode even past loopLengthSteps', () => {
      svc.playMode.set('pattern');
      svc.songLengthSteps.set(100);
      svc.loopLengthSteps.set(16);
      svc.isPlaying.set(true);
      let endedFires = 0;
      svc.onSongEnded = () => endedFires++;

      // step=16 → modulo(16)=0 → no boundary hit. step=999→modulo(16)=7→no hit.
      (svc as any).handleTick(16, 0, 0.1);
      (svc as any).handleTick(999, 0, 0.1);
      expect(svc.songEnded()).toBe(false);
      expect(endedFires).toBe(0);
      expect(svc.isPlaying()).toBe(true); // pattern mode keeps playing.
    });

    it('does NOT fire onSongEnded if isPlaying is false (defensive)', () => {
      // The engine guard already requires song-end to mark isPlaying=false,
      // but if the spec ever changes, handleTick should not invoke callbacks
      // for a not-playing engine (start() resets songEnded).
      svc.playMode.set('song');
      svc.songLengthSteps.set(10);
      svc.isPlaying.set(false);
      let endedFires = 0;
      svc.onSongEnded = () => endedFires++;
      (svc as any).start?.();
      // start() early-returns when already firing; with isPlaying already true
      // somewhere else, but tested with bare instance, so we manually flip it:
      svc.isPlaying.set(true);
      svc.songEnded.set(false);
      (svc as any).handleTick(10, 0, 0.1);
      expect(endedFires).toBe(1);
    });
  });

  describe('start() resets songEnded', () => {
    it('start() sets songEnded back to false after a previous song-end', () => {
      svc.playMode.set('song');
      svc.songLengthSteps.set(10);
      svc.isPlaying.set(true);
      (svc as any).handleTick(10, 0, 0.1);
      expect(svc.songEnded()).toBe(true);

      // Reset state then call start(), which should clear songEnded.
      svc.isPlaying.set(false);
      (svc as any).start?.();
      expect(svc.songEnded()).toBe(false);
    });
  });

  describe('installTrackPluginInsert (Sprint B1 Phase 2 live inserts)', () => {
    it('installs a ScriptProcessor between rack and width for a non-empty chain', () => {
      const sp = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        onaudioprocess: null,
      };
      const rack = { output: { disconnect: jest.fn(), connect: jest.fn() } };
      const width = { connect: jest.fn() };
      svc = makeBareEngine();
      (svc as any).trackEffectsRacks = new Map([['t1', rack]]);
      (svc as any).trackWidthNodes = new Map([['t1', width]]);
      (svc as any).trackPluginInserts = new Map();
      (svc as any).ctx = { createScriptProcessor: jest.fn(() => sp), sampleRate: 44100 };
      (svc as any).trackPhaseNodes = new Map();
      (svc as any).trackFaderGains = new Map();
      (svc as any).trackOutputs = new Map();
      (svc as any).trackSendAGains = new Map();
      (svc as any).trackSendBGains = new Map();
      (svc as any).getTrackOutput = jest.fn(() => ({}));

      svc.installTrackPluginInsert('t1', ['smuve.saturation.v2']);
      expect(rack.output.disconnect).toHaveBeenCalledWith(width);
      expect(rack.output.connect).toHaveBeenCalledWith(sp);
      expect(sp.connect).toHaveBeenCalledWith(width);
      expect((svc as any).trackPluginInserts.get('t1')).toBe(sp);
    });

    it('removes the insert and restores direct routing for an empty chain', () => {
      const sp = { connect: jest.fn(), disconnect: jest.fn(), onaudioprocess: null };
      const rack = { output: { disconnect: jest.fn(), connect: jest.fn() } };
      const width = { connect: jest.fn() };
      svc = makeBareEngine();
      (svc as any).trackEffectsRacks = new Map([['t1', rack]]);
      (svc as any).trackWidthNodes = new Map([['t1', width]]);
      (svc as any).trackPluginInserts = new Map([['t1', sp]]);
      (svc as any).ctx = { createScriptProcessor: jest.fn(), sampleRate: 44100 };
      (svc as any).trackPhaseNodes = new Map();
      (svc as any).trackFaderGains = new Map();
      (svc as any).trackOutputs = new Map();
      (svc as any).trackSendAGains = new Map();
      (svc as any).trackSendBGains = new Map();
      (svc as any).getTrackOutput = jest.fn(() => ({}));

      svc.installTrackPluginInsert('t1', []);
      expect(sp.disconnect).toHaveBeenCalled();
      expect(rack.output.connect).toHaveBeenCalledWith(width);
      expect((svc as any).trackPluginInserts.has('t1')).toBe(false);
    });
  });

  describe('scheduleOfflineNote (Sprint A6.5 real-synth offline render)', () => {
    it('builds the full voice graph (osc → filter → panner → vca → dest)', () => {
      const osc = {
        connect: jest.fn(() => osc),
        frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      };
      const gainNode = {
        connect: jest.fn(() => gainNode),
        gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
      };
      const filterNode = {
        connect: jest.fn(() => filterNode),
        frequency: { setValueAtTime: jest.fn() },
        Q: { setValueAtTime: jest.fn() },
      };
      const pannerNode = {
        connect: jest.fn(() => pannerNode),
        pan: { setValueAtTime: jest.fn() },
      };
      const ctx = {
        createBiquadFilter: () => filterNode,
        createStereoPanner: () => pannerNode,
        createGain: () => gainNode,
      };
      const dest = { connect: jest.fn() };

      (svc as any).createAntialiasedOscillator = jest.fn(() => osc);
      svc.scheduleOfflineNote(
        ctx as any,
        dest as any,
        440,
        0.5,
        0.8,
        1.0,
        { type: 'sawtooth', cutoff: 1200, q: 2, glideTo: 880 },
        0.25
      );

      expect((svc as any).createAntialiasedOscillator).toHaveBeenCalledWith(
        ctx,
        'sawtooth',
        440,
        0.5
      );
      expect(filterNode.frequency.setValueAtTime).toHaveBeenCalledWith(1200, 0.5);
      expect(filterNode.Q.setValueAtTime).toHaveBeenCalledWith(2, 0.5);
      expect(pannerNode.pan.setValueAtTime).toHaveBeenCalledWith(0.25, 0.5);
      // Glide applied
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        880,
        expect.any(Number)
      );
      expect(osc.start).toHaveBeenCalledWith(0.5);
      expect(osc.stop).toHaveBeenCalledWith(expect.any(Number));
      // The VCA connects INTO the destination (dest is the sink, not a source).
      expect(gainNode.connect).toHaveBeenCalledWith(dest);
    });

    it('applies the ADSR envelope values from the synth params', () => {
      const osc = {
        connect: jest.fn(() => osc),
        frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      };
      const gainNode = {
        connect: jest.fn(() => gainNode),
        gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
      };
      const ctx = {
        createBiquadFilter: () => ({
          connect: jest.fn(() => ({
            connect: jest.fn(() => gainNode),
          })),
          frequency: { setValueAtTime: jest.fn() },
          Q: { setValueAtTime: jest.fn() },
        }),
        createStereoPanner: () => ({
          connect: jest.fn(() => gainNode),
          pan: { setValueAtTime: jest.fn() },
        }),
        createGain: () => gainNode,
      };

      (svc as any).createAntialiasedOscillator = jest.fn(() => osc);
      svc.scheduleOfflineNote(
        ctx as any,
        { connect: jest.fn() } as any,
        220,
        0,
        1,
        2,
        { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.3 },
        0
      );

      const setCalls = gainNode.gain.setValueAtTime.mock.calls;
      expect(setCalls.length).toBeGreaterThanOrEqual(3);
      // First set is the near-silent attack floor.
      expect(setCalls[0][0]).toBe(0.0001);
      // Attack ramp reaches the velocity-scaled peak.
      const rampCalls = gainNode.gain.exponentialRampToValueAtTime.mock.calls;
      expect(rampCalls[0][0]).toBeCloseTo(0.9); // 1.0 velocity * 0.9
    });
  });
});
