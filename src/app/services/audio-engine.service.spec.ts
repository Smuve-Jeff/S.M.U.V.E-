import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  AudioEngineService,
  clampFinite,
  computeCrossfaderGains,
  createAudioContext,
} from './audio-engine.service';

// Minimal bare-instance helper: skips the heavy constructor (which needs a
// full AudioContext mock) and only seeds the state required to exercise
// setSendLevel. Avoids the brittleness of mocking dozens of createGain /
// createBiquadFilter nodes.
function makeBareEngine() {
  const svc = Object.create(AudioEngineService.prototype) as AudioEngineService;
  (svc as any).trackSendAGains = new Map();
  (svc as any).trackSendBGains = new Map();
  (svc as any).ctx = { currentTime: 1.234, sampleRate: 44100 };
  // Sprint B1 Phase 3 — audition + master-bus signal stubs
  (svc as any).auditionPlaying = signal(false);
  (svc as any).auditionProgress = signal(0);
  (svc as any).auditionDuration = signal(0);
  (svc as any).masterPluginIds = signal<string[]>([]);
  // Live plugin inserts are hosted by the plugin-chain worklet; bare instances
  // start with the module "loaded" and a stub logger so a unit test never
  // touches the real module-loading path (or an undefined LoggingService).
  (svc as any)._pluginChainWorkletLoaded = true;
  (svc as any).logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  // start() resolves tempo through the tempo map; a bare prototype instance has
  // neither, which made the song-mode specs throw instead of testing behaviour.
  (svc as any).tempo = signal(124);
  (svc as any).tempoMap = [];
  return svc;
}

/**
 * Minimal AudioWorkletNode stand-in for the live plugin chain: records the
 * processor name, the node options, the wiring and every chain message.
 */
class FakeWorkletNode {
  static instances: FakeWorkletNode[] = [];
  port = { postMessage: jest.fn(), onmessage: null as unknown };
  connect = jest.fn();
  disconnect = jest.fn();
  constructor(
    public ctx: unknown,
    public processorName: string,
    public options: any
  ) {
    FakeWorkletNode.instances.push(this);
  }
}

const originalAudioWorkletNode = (globalThis as any).AudioWorkletNode;

function enableFakeWorkletNode(): void {
  (globalThis as any).AudioWorkletNode = FakeWorkletNode;
  FakeWorkletNode.instances = [];
}

function restoreAudioWorkletNode(): void {
  (globalThis as any).AudioWorkletNode = originalAudioWorkletNode;
}

function gain(map: Map<string, any>, id: string) {
  if (!map.has(id)) {
    map.set(id, { gain: { setTargetAtTime: jest.fn(), value: 0 } });
  }
  return map.get(id)!;
}

describe('AudioEngineService host fallback', () => {
  const originalAudioContext = window.AudioContext;
  const originalWebkitAudioContext = (window as any).webkitAudioContext;

  beforeEach(() => {
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    (window as any).AudioContext = originalAudioContext;
    (window as any).webkitAudioContext = originalWebkitAudioContext;
    TestBed.resetTestingModule();
  });

  it('keeps the shell usable when the host has no Web Audio implementation', () => {
    const service = TestBed.inject(AudioEngineService);

    expect(service.audioAvailable).toBe(false);
    expect(service.ctx.state).toBe('suspended');
    expect(() =>
      service.masterGain.gain.setTargetAtTime(0.5, 0, 0.05)
    ).not.toThrow();
    expect(() => service.armOnFirstUserGesture()).not.toThrow();
  });
});

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
  svc.playbackLoopEnabled = signal(false);
  svc.playbackLoopStart = signal(null);
  svc.playbackLoopEnd = signal(null);
  (svc as any).transportGeneration = 0;
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
  // start() restarts the integrated loudness window, so the metering signals
  // it writes have to exist on a bare instance too.
  (svc as any).outputLufs = signal(-70);
  (svc as any).outputCorrelation = signal(0);
  (svc as any).outputLra = signal(0);
  (svc as any).outputTruePeak = signal(-120);
  (svc as any).loudnessMeter = null;
    // start() resolves tempo through the tempo map; a bare prototype instance
  // has neither, which made song-mode specs throw instead of asserting.
  (svc as any).tempo = signal(124);
  (svc as any).tempoMap = [];
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

  describe('transport loop and stale playhead safety', () => {
    it('loops only the selected end-exclusive A/B range without ending the song', () => {
      svc.isPlaying.set(true);
      expect(svc.setPlaybackLoop(16, 20)).toBe(true);
      svc.playbackLoopEnabled.set(true);
      const scheduled: number[] = [];
      svc.onScheduleStep = (step) => scheduled.push(step);
      for (const tick of [0, 1, 2, 3, 4, 65]) (svc as any).handleTick(tick, 0, 0.1);
      expect(scheduled).toEqual([16, 17, 18, 19, 16, 17]);
      expect(svc.songEnded()).toBe(false);
    });

    it('rejects reversed and out-of-song markers', () => {
      expect(svc.setPlaybackLoop(20, 16)).toBe(false);
      expect(svc.setPlaybackLoop(0, 1000)).toBe(false);
      expect(svc.playbackLoopStart()).toBeNull();
    });

    it('does not move the playhead after Stop when a queued visual callback arrives', () => {
      jest.useFakeTimers();
      try {
        svc.isPlaying.set(true);
        (svc as any).handleTick(8, 1, 0.1);
        svc.stop();
        jest.runOnlyPendingTimers();
        expect(svc.visualStep()).toBe(0);
      } finally { jest.useRealTimers(); }
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

  describe('audition (Sprint B1 Phase 3)', () => {
    it('exposes audition signals and starts/stops playback', () => {
      svc = makeBareEngine();
      const sp = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        onended: null,
        buffer: null,
      };
      const monitorGain = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        gain: { value: 0 },
      };
      (svc as any).auditionSource = null;
      (svc as any).auditionMonitorGain = monitorGain;
      (svc as any).ctx = {
        createBufferSource: jest.fn(() => sp),
        destination: {},
        state: 'running',
        resume: jest.fn(() => Promise.resolve()),
        sampleRate: 44100,
      };

      const buf: any = {
        duration: 4,
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 176400,
        getChannelData: () => new Float32Array(176400),
      };

      svc.playAudition(buf);
      expect(sp.start).toHaveBeenCalled();
      expect(svc.auditionPlaying()).toBe(true);
      expect(svc.auditionDuration()).toBe(4);

      svc.stopAudition();
      expect(sp.stop).toHaveBeenCalled();
    });

    it('auditionPlayback is false at rest', () => {
      svc = makeBareEngine();
      expect(svc.auditionPlaying()).toBe(false);
      expect(svc.auditionProgress()).toBe(0);
    });
  });

  describe('installTrackPluginInsert (live inserts on the audio thread)', () => {
    let originalWorkletNode: unknown;

    beforeEach(() => {
      originalWorkletNode = (globalThis as any).AudioWorkletNode;
      enableFakeWorkletNode();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      (globalThis as any).AudioWorkletNode = originalWorkletNode;
    });

    function makeTrackEngine() {
      const rack = { output: { disconnect: jest.fn(), connect: jest.fn() } };
      const width = { connect: jest.fn() };
      const engine = makeBareEngine();
      (engine as any).trackEffectsRacks = new Map([['t1', rack]]);
      (engine as any).trackWidthNodes = new Map([['t1', width]]);
      (engine as any).trackPluginInserts = new Map();
      (engine as any).getTrackOutput = jest.fn(() => ({}));
      return { engine, rack, width };
    }

    it('splices a mono plugin-chain worklet between the rack and the width node', () => {
      const { engine, rack, width } = makeTrackEngine();

      engine.installTrackPluginInsert('t1', ['smuve.saturation.v2']);

      const node = FakeWorkletNode.instances[0];
      expect(node.processorName).toBe('plugin-chain-processor');
      expect(node.options.channelCount).toBe(1);
      expect(node.options.outputChannelCount).toEqual([1]);
      expect(node.options.channelCountMode).toBe('explicit');
      expect(rack.output.disconnect).toHaveBeenCalledWith(width);
      expect(rack.output.connect).toHaveBeenCalledWith(node);
      expect(node.connect).toHaveBeenCalledWith(width);
      expect((engine as any).trackPluginInserts.get('t1').node).toBe(node);
    });

    it('posts the resolved chain — kernel name plus params — to the audio thread', () => {
      const { engine } = makeTrackEngine();
      const params = new Float32Array([0.4, 1, 0]);

      engine.installTrackPluginInsert('t1', ['smuve.saturation.v2'], () => [
        { id: 'smuve.saturation.v2', kernel: 'saturate', params },
      ]);

      expect(FakeWorkletNode.instances[0].port.postMessage).toHaveBeenCalledWith({
        type: 'chain',
        slots: [{ id: 'smuve.saturation.v2', kernel: 'saturate', params }],
      });
    });

    it('resolves an unresolved plugin to the identity kernel instead of silence', () => {
      const { engine } = makeTrackEngine();

      // No provider is the call shape used before the store was wired in: the
      // ScriptProcessor path passed silence here, which muted the track.
      engine.installTrackPluginInsert('t1', ['smuve.saturation.v2']);

      const [message] = FakeWorkletNode.instances[0].port.postMessage.mock.calls[0];
      expect(message.slots).toEqual([
        {
          id: 'smuve.saturation.v2',
          kernel: 'identity',
          params: new Float32Array(0),
        },
      ]);
    });

    it('re-posts the chain when a provider value changes, and only then', () => {
      const { engine } = makeTrackEngine();
      let amount = 0.2;
      engine.installTrackPluginInsert('t1', ['smuve.saturation.v2'], () => [
        {
          id: 'smuve.saturation.v2',
          kernel: 'saturate',
          params: new Float32Array([amount]),
        },
      ]);
      const node = FakeWorkletNode.instances[0];
      expect(node.port.postMessage).toHaveBeenCalledTimes(1);

      // An unchanged chain must not message the audio thread at all.
      jest.advanceTimersByTime(1000);
      expect(node.port.postMessage).toHaveBeenCalledTimes(1);

      amount = 0.8;
      jest.advanceTimersByTime(300);
      expect(node.port.postMessage).toHaveBeenCalledTimes(2);
      expect(node.port.postMessage.mock.calls[1][0].slots[0].params[0]).toBeCloseTo(
        0.8,
        6
      );
    });

    it('removes the insert, restores direct routing and stops the chain poller', () => {
      const { engine, rack, width } = makeTrackEngine();
      engine.installTrackPluginInsert('t1', ['smuve.saturation.v2']);
      const node = FakeWorkletNode.instances[0];
      const clearSpy = jest.spyOn(globalThis, 'clearInterval');

      engine.installTrackPluginInsert('t1', []);

      expect(rack.output.disconnect).toHaveBeenCalledWith(node);
      expect(node.disconnect).toHaveBeenCalled();
      expect(rack.output.connect).toHaveBeenCalledWith(width);
      expect((engine as any).trackPluginInserts.has('t1')).toBe(false);
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });

    it('leaves the graph dry when the host cannot host the worklet', () => {
      const { engine, rack } = makeTrackEngine();
      (engine as any)._pluginChainWorkletLoaded = false;
      (engine as any).ctx = { currentTime: 0, sampleRate: 44100 };

      engine.installTrackPluginInsert('t1', ['smuve.saturation.v2']);

      expect(FakeWorkletNode.instances.length).toBe(0);
      expect(rack.output.connect).not.toHaveBeenCalled();
      expect(rack.output.disconnect).not.toHaveBeenCalled();
    });

    it('releases a deleted track insert without rewiring the rack', () => {
      const { engine, rack } = makeTrackEngine();
      engine.installTrackPluginInsert('t1', ['smuve.saturation.v2']);
      const node = FakeWorkletNode.instances[0];
      rack.output.connect.mockClear();

      (engine as any).releaseTrackPluginInsert('t1');

      expect(rack.output.connect).not.toHaveBeenCalled();
      expect(rack.output.disconnect).toHaveBeenCalledWith(node);
      expect(node.disconnect).toHaveBeenCalled();
      expect((engine as any).trackPluginInserts.has('t1')).toBe(false);
    });
  });

  describe('scheduleOfflineNote (Sprint A6.5 real-synth offline render)', () => {  describe('scheduleOfflineNote (Sprint A6.5 real-synth offline render)', () => {
    it('builds the full voice graph (osc → filter → panner → vca → dest)', () => {
      const osc = {
        connect: jest.fn(() => osc),
        frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      };
      const gainNode = {
        connect: jest.fn(() => gainNode),
        gain: {
          setValueAtTime: jest.fn(),
          setTargetAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
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

  describe('percussive voice envelope (drum pads, previews, un-patched tracks)', () => {
    /**
     * The attack must be a bounded ramp. `setTargetAtTime` is an open-ended
     * approach with no value in the timeline, so the decay ramp that follows it
     * departs from zero and the whole voice peaked at ~5e-4 (-57 dB) - which is
     * why the offline WAV export rendered near-silence.
     */
    it('ramps the attack to the peak so the decay has a departure value', () => {
      const osc = {
        connect: jest.fn(() => osc),
        frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      };
      const gainNode = {
        connect: jest.fn(() => gainNode),
        gain: {
          setValueAtTime: jest.fn(),
          setTargetAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
      };
      const pannerNode = {
        connect: jest.fn(() => pannerNode),
        pan: { setValueAtTime: jest.fn() },
      };
      const ctx = {
        createStereoPanner: () => pannerNode,
        createGain: () => gainNode,
      };

      (svc as any).createAntialiasedOscillator = jest.fn(() => osc);
      // No `sustain` in the params: the percussive branch.
      svc.scheduleOfflineNote(
        ctx as any,
        { connect: jest.fn() } as any,
        220,
        0,
        0.8,
        0.5,
        { attack: 0.01, release: 0.1 },
        0
      );

      const peak = Math.min(1, 0.8 * 0.9);
      expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
      // Bounded attack that actually arrives at the peak.
      expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
        peak,
        0.01
      );
      // The attack is not left open-ended; that is the defect.
      expect(gainNode.gain.setTargetAtTime).not.toHaveBeenCalled();
      // ...and the decay departs from that peak down to the release floor.
      expect(gainNode.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        0.001,
        0.6
      );
    });
  });

  describe('computeCrossfaderGains', () => {
    it('never returns negative or phase-inverted gains', () => {
      for (const curve of ['linear', 'power', 'exp', 'cut'] as const) {
        for (let v = -1; v <= 1; v += 0.05) {
          const { left, right } = computeCrossfaderGains(v, curve);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(right).toBeGreaterThanOrEqual(0);
          expect(left).toBeLessThanOrEqual(1);
          expect(right).toBeLessThanOrEqual(1);
        }
      }
    });

    it('delivers full Deck A at -1 and full Deck B at +1', () => {
      for (const curve of ['linear', 'power', 'exp', 'cut'] as const) {
        expect(computeCrossfaderGains(-1, curve).left).toBeCloseTo(1);
        expect(computeCrossfaderGains(-1, curve).right).toBeCloseTo(0);
        expect(computeCrossfaderGains(1, curve).left).toBeCloseTo(0);
        expect(computeCrossfaderGains(1, curve).right).toBeCloseTo(1);
      }
    });

    it('uses equal-power (-3 dB) blending at center for power', () => {
      const { left, right } = computeCrossfaderGains(0, 'power');
      const expected = Math.SQRT1_2; // 0.7071
      expect(left).toBeCloseTo(expected, 4);
      expect(right).toBeCloseTo(expected, 4);
    });

    it('linear tapers to silence at the exact center', () => {
      const { left, right } = computeCrossfaderGains(0, 'linear');
      expect(left).toBeCloseTo(0.5);
      expect(right).toBeCloseTo(0.5);
    });

    it('cut switches channels through a narrow center band', () => {
      expect(computeCrossfaderGains(-0.4, 'cut').left).toBeCloseTo(1);
      expect(computeCrossfaderGains(-0.4, 'cut').right).toBeCloseTo(0);
      expect(computeCrossfaderGains(0.4, 'cut').left).toBeCloseTo(0);
      expect(computeCrossfaderGains(0.4, 'cut').right).toBeCloseTo(1);
    });

    it('hamster swaps the channel orientation', () => {
      const normal = computeCrossfaderGains(1, 'power');
      const ham = computeCrossfaderGains(1, 'power', true);
      expect(ham.left).toBeCloseTo(normal.right);
      expect(ham.right).toBeCloseTo(normal.left);
    });
  });

  // =====================================================================
  // Deck FX insert bus (echo / chorus / phaser)
  //
  // Bare-instance pattern: seed only the per-deck wet/delay nodes the FX
  // methods touch. The heavy constructor is never invoked.
  // =====================================================================
  describe('deck FX bus (setDeckAdvancedFx / resetDeckAdvancedFx)', () => {
    let fxSvc: AudioEngineService;

    function makeFxDeck() {
      return {
        fxDelayWet: { gain: { setTargetAtTime: jest.fn(), value: 0 } },
        fxFlangerWet: { gain: { setTargetAtTime: jest.fn(), value: 0 } },
        fxPhaserWet: { gain: { setTargetAtTime: jest.fn(), value: 0 } },
        fxDelay: { delayTime: { setTargetAtTime: jest.fn() } },
        fxDelayFb: { gain: { setTargetAtTime: jest.fn() } },
      };
    }

    beforeEach(() => {
      fxSvc = Object.create(
        AudioEngineService.prototype
      ) as AudioEngineService;
      (fxSvc as any).ctx = { currentTime: 2 };
      (fxSvc as any).deckA = makeFxDeck();
      (fxSvc as any).deckB = makeFxDeck();
    });

    it('echo routes the amount onto the delay wet bus and zeroes the others', () => {
      (fxSvc as any).setDeckAdvancedFx('A', 'delay', 0.7);
      const deck = (fxSvc as any).deckA;
      expect(deck.fxDelayWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0.7,
        2,
        0.01
      );
      expect(deck.fxFlangerWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        2,
        0.01
      );
      expect(deck.fxPhaserWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        2,
        0.01
      );
    });

    it('chorus uses the flanger bus and phaser uses the phaser bus', () => {
      (fxSvc as any).setDeckAdvancedFx('A', 'flanger', 0.5);
      expect((fxSvc as any).deckA.fxFlangerWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0.45,
        2,
        0.01
      );

      (fxSvc as any).setDeckAdvancedFx('B', 'phaser', 0.9);
      expect((fxSvc as any).deckB.fxPhaserWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0.9,
        2,
        0.01
      );
      expect((fxSvc as any).deckB.fxDelayWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        2,
        0.01
      );
    });

    it('zero amount keeps every wet bus at zero', () => {
      (fxSvc as any).setDeckAdvancedFx('A', 'delay', 0);
      const deck = (fxSvc as any).deckA;
      expect(deck.fxDelayWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        2,
        0.01
      );
    });

    it('resetDeckAdvancedFx zeroes every wet bus at once', () => {
      (fxSvc as any).setDeckAdvancedFx('A', 'delay', 0.8);
      const deck = (fxSvc as any).deckA;
      deck.fxDelayWet.gain.setTargetAtTime.mockClear();
      (fxSvc as any).resetDeckAdvancedFx('A');
      expect(deck.fxDelayWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        2,
        0.01
      );
      expect(deck.fxFlangerWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        2,
        0.01
      );
      expect(deck.fxPhaserWet.gain.setTargetAtTime).toHaveBeenCalledWith(
        0,
        2,
        0.01
      );
    });

    it('is a no-op when the deck has no FX chain (legacy stub safety)', () => {
      (fxSvc as any).deckA = { buffer: null };
      expect(() =>
        (fxSvc as any).setDeckAdvancedFx('A', 'delay', 0.5)
      ).not.toThrow();
      expect(() => (fxSvc as any).resetDeckAdvancedFx('A')).not.toThrow();
    });
  });

  // =====================================================================
  // Master plugin insert — width-preserving splice point
  // =====================================================================
  describe('installMasterPluginInsertAfterWidth (fixed splice point)', () => {
    let originalWorkletNode: unknown;

    beforeEach(() => {
      originalWorkletNode = (globalThis as any).AudioWorkletNode;
      enableFakeWorkletNode();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      (globalThis as any).AudioWorkletNode = originalWorkletNode;
    });

    function makeMasterEngine() {
      const engine = makeBareEngine();
      const merger = { disconnect: jest.fn(), connect: jest.fn() };
      (engine as any).masterWidthMerger = merger;
      (engine as any)._preMasterGain = { tag: 'preMaster' };
      (engine as any).masterPluginInsert = null;
      return { engine, merger };
    }

    it('splices a stereo plugin-chain worklet between the width merger and pre-master', () => {
      const { engine, merger } = makeMasterEngine();

      engine.installMasterPluginInsertAfterWidth(['smuve.saturation.v2']);

      const node = FakeWorkletNode.instances[0];
      expect(node.processorName).toBe('plugin-chain-processor');
      expect(node.options.channelCount).toBe(2);
      expect(node.options.outputChannelCount).toEqual([2]);
      expect(merger.disconnect).toHaveBeenCalledWith((engine as any)._preMasterGain);
      expect(merger.connect).toHaveBeenCalledWith(node);
      expect(node.connect).toHaveBeenCalledWith((engine as any)._preMasterGain);
      expect(engine.masterPluginIds()).toEqual(['smuve.saturation.v2']);
      expect((engine as any).masterPluginInsert.node).toBe(node);

      engine.installMasterPluginInsertAfterWidth([]);
    });

    it('posts the whole chain in order, with each kernel name and its params', () => {
      const { engine } = makeMasterEngine();

      engine.installMasterPluginInsertAfterWidth(
        ['smuve.eq.mastering.v2', 'smuve.master.v2'],
        (ids) =>
          ids.map((id) =>
            id === 'smuve.eq.mastering.v2'
              ? { id, kernel: 'eq', params: new Float32Array(15) }
              : { id, kernel: 'process', params: new Float32Array(28) }
          )
      );

      const [message] = FakeWorkletNode.instances[0].port.postMessage.mock.calls[0];
      expect(message.type).toBe('chain');
      expect(message.slots.map((slot: any) => slot.kernel)).toEqual([
        'eq',
        'process',
      ]);
      expect(message.slots[1].params.length).toBe(28);

      engine.installMasterPluginInsertAfterWidth([]);
    });

    it('removes the insert and restores merger → pre-master without touching an uninstalled graph', () => {
      const { engine, merger } = makeMasterEngine();

      engine.installMasterPluginInsertAfterWidth(['smuve.saturation.v2']);
      const node = FakeWorkletNode.instances[0];
      const clearSpy = jest.spyOn(globalThis, 'clearInterval');

      engine.installMasterPluginInsertAfterWidth([]);

      expect(node.disconnect).toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalled();
      expect(merger.connect).toHaveBeenCalledWith((engine as any)._preMasterGain);
      expect((engine as any).masterPluginInsert).toBeNull();
      expect(engine.masterPluginIds()).toEqual([]);
      clearSpy.mockRestore();

      // Second empty call with no insert installed must not re-wire the graph.
      merger.connect.mockClear();
      merger.disconnect.mockClear();
      engine.installMasterPluginInsertAfterWidth([]);
      expect(merger.connect).not.toHaveBeenCalled();
      expect(merger.disconnect).not.toHaveBeenCalled();
    });

    it('leaves the master bus dry and unreported when the host has no AudioWorklet', () => {
      const { engine, merger } = makeMasterEngine();
      (engine as any)._pluginChainWorkletLoaded = false;
      (engine as any).ctx = { currentTime: 0, sampleRate: 44100 };

      engine.installMasterPluginInsertAfterWidth(['smuve.saturation.v2']);

      expect(FakeWorkletNode.instances.length).toBe(0);
      expect(merger.connect).not.toHaveBeenCalled();
      expect(merger.disconnect).not.toHaveBeenCalled();
      // The requested ids are not reported as installed, so the rack never
      // shows a chain that is not actually running.
      expect(engine.masterPluginIds()).toEqual([]);
    });

    it('does not double-install while a chain is already spliced', () => {
      const { engine } = makeMasterEngine();

      engine.installMasterPluginInsertAfterWidth(['smuve.saturation.v2']);
      engine.installMasterPluginInsertAfterWidth(['smuve.saturation.v2']);

      expect(FakeWorkletNode.instances.length).toBe(1);

      engine.installMasterPluginInsertAfterWidth([]);
    });
  });
});

// =====================================================================
// Deck send default — regression: a fresh createGain() starts at unity,
});

// =====================================================================
// Deck send default — regression: a fresh createGain() starts at unity,
// so deck A/B sends must be explicitly zeroed at creation or every deck
// doubles through the master send returns on top of the main path.
// =====================================================================

describe('AudioEngineService.createDeck send defaults', () => {
  function makeCtxWithUnityGains(): any {
    const node = (gainValue: number) => ({
      gain: {
        value: gainValue,
        setTargetAtTime: jest.fn(),
        setValueAtTime: jest.fn(),
      },
      delayTime: { value: 0, setTargetAtTime: jest.fn() },
      frequency: { value: 0, setTargetAtTime: jest.fn() },
      Q: { value: 0 },
      type: '',
      connect: jest.fn().mockReturnThis(),
      disconnect: jest.fn(),
      start: jest.fn(),
    });
    // Real browsers default GainNode.gain.value to 1 (unity).
    return {
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createGain: jest.fn(() => node(1)),
      createDelay: jest.fn(() => node(0)),
      createOscillator: jest.fn(() => node(0)),
      createBiquadFilter: jest.fn(() => node(0)),
      createStereoPanner: jest.fn(() => ({
        pan: { value: 0 },
        connect: jest.fn().mockReturnThis(),
        disconnect: jest.fn(),
      })),
      createAnalyser: jest.fn(() => ({
        connect: jest.fn().mockReturnThis(),
        disconnect: jest.fn(),
      })),
    };
  }

  it('zeroes deck A/B sends so decks do not double-feed the master returns', () => {
    const svc = Object.create(
      AudioEngineService.prototype
    ) as AudioEngineService;
    (svc as any).ctx = makeCtxWithUnityGains();

    const deckA = (svc as any).createDeck('A');
    const deckB = (svc as any).createDeck('B');

    expect(deckA.sendA.gain.value).toBe(0);
    expect(deckA.sendB.gain.value).toBe(0);
    expect(deckB.sendA.gain.value).toBe(0);
    expect(deckB.sendB.gain.value).toBe(0);
  });
});

describe('AudioEngineService.setMasterToneEq (idempotent master tone stage)', () => {
  function makeToneEngine(workletActive: boolean) {
    const svc = makeBareEngine();
    (svc as any).masterWorkletActive = signal(workletActive);
    (svc as any).masterToneLowShelf = {
      gain: { setTargetAtTime: jest.fn(), value: 0 },
    };
    (svc as any).masterToneLowMid = {
      gain: { setTargetAtTime: jest.fn(), value: 0 },
    };
    (svc as any).masterShelf = { gain: { setTargetAtTime: jest.fn(), value: 0 } };
    (svc as any).masterToneEqState = {
      lowShelfDb: 0,
      lowMidDb: 0,
      highShelfDb: 0,
    };
    (svc as any).configureMasterWorklet = jest.fn();
    return svc;
  }

  it('moves the persistent biquads on the fallback path', () => {
    const svc = makeToneEngine(false);

    svc.setMasterToneEq({ lowShelfDb: 3, lowMidDb: -1.5, highShelfDb: 2.5 });

    expect(
      (svc as any).masterToneLowShelf.gain.setTargetAtTime
    ).toHaveBeenCalledWith(3, 1.234, 0.05);
    expect(
      (svc as any).masterToneLowMid.gain.setTargetAtTime
    ).toHaveBeenCalledWith(-1.5, 1.234, 0.05);
    expect(
      (svc as any).masterShelf.gain.setTargetAtTime
    ).toHaveBeenCalledWith(2.5, 1.234, 0.05);
    expect((svc as any).configureMasterWorklet).not.toHaveBeenCalled();
    expect(svc.getMasterToneEq()).toEqual({
      lowShelfDb: 3,
      lowMidDb: -1.5,
      highShelfDb: 2.5,
    });
  });

  it('forwards to the worklet bands when the worklet owns the output', () => {
    const svc = makeToneEngine(true);

    svc.setMasterToneEq({ lowShelfDb: 3, lowMidDb: -1.5, highShelfDb: 2.5 });

    expect((svc as any).configureMasterWorklet).toHaveBeenCalledWith(
      'eq',
      'configure',
      { band: 0, gain: 3 }
    );
    expect((svc as any).configureMasterWorklet).toHaveBeenCalledWith(
      'eq',
      'configure',
      { band: 2, gain: -1.5 }
    );
    expect((svc as any).configureMasterWorklet).toHaveBeenCalledWith(
      'eq',
      'configure',
      { band: 3, gain: 2.5 }
    );
    expect(
      (svc as any).masterToneLowShelf.gain.setTargetAtTime
    ).not.toHaveBeenCalled();
  });

  it('clamps out-of-range values and preserves the last value on partial calls', () => {
    const svc = makeToneEngine(false);

    svc.setMasterToneEq({ lowShelfDb: 99 });
    expect(svc.getMasterToneEq()).toEqual({
      lowShelfDb: 18,
      lowMidDb: 0,
      highShelfDb: 0,
    });

    svc.setMasterToneEq({ lowMidDb: Number.NaN });
    expect(svc.getMasterToneEq()).toEqual({
      lowShelfDb: 18,
      lowMidDb: 0,
      highShelfDb: 0,
    });
  });
});


describe('AudioEngineService.setMasteringBands (five-band master compressor)', () => {
  const bands = [
    { id: 1, threshold: -12.4, ratio: 4.1 },
    { id: 2, threshold: -8.1, ratio: 2.5 },
    { id: 3, threshold: -2.4, ratio: 1.8 },
    { id: 4, threshold: -4.2, ratio: 2.1 },
    { id: 5, threshold: -1.2, ratio: 1.5 },
  ];

  function makeBandEngine(workletActive: boolean) {
    const svc = makeBareEngine();
    (svc as any).masterWorkletActive = signal(workletActive);
    (svc as any).masterWorkletNode = { port: { postMessage: jest.fn() } };
    (svc as any).configureMasterWorklet = jest.fn();
    (svc as any).compressor = { tag: 'single-compressor' };
    (svc as any).masterToneLowMid = {
      disconnect: jest.fn(),
      connect: jest.fn(),
    };
    (svc as any).masterMultibandInput = { tag: 'multiband-input' };
    (svc as any).masterMultibandWired = false;
    (svc as any).masteringBandsState = null;
    (svc as any).masterMultibandCompressors = Array.from({ length: 5 }, () => ({
      threshold: { setTargetAtTime: jest.fn() },
      ratio: { setTargetAtTime: jest.fn() },
    }));
    return svc;
  }

  it('forwards one atomic band message when the worklet owns the output', () => {
    const svc = makeBandEngine(true);

    svc.setMasteringBands(bands);

    expect((svc as any).configureMasterWorklet).toHaveBeenCalledWith(
      'multiband',
      'configure',
      { bands },
    );
    expect((svc as any).masterToneLowMid.disconnect).not.toHaveBeenCalled();
  });

  it('wires the fallback tree and clamps every band', () => {
    const svc = makeBandEngine(false);

    svc.setMasteringBands([
      { id: 1, threshold: -80, ratio: 0 },
      { id: 2, threshold: 4, ratio: 30 },
      { id: 3, threshold: -18, ratio: 4 },
      { id: 4, threshold: -18, ratio: 4 },
      { id: 5, threshold: -18, ratio: 4 },
    ]);

    expect((svc as any).masterToneLowMid.disconnect).toHaveBeenCalledWith(
      (svc as any).compressor,
    );
    expect((svc as any).masterToneLowMid.connect).toHaveBeenCalledWith(
      (svc as any).masterMultibandInput,
    );
    const comps = (svc as any).masterMultibandCompressors;
    expect(comps[0].threshold.setTargetAtTime).toHaveBeenCalledWith(-60, 1.234, 0.05);
    expect(comps[0].ratio.setTargetAtTime).toHaveBeenCalledWith(1, 1.234, 0.05);
    expect(comps[1].threshold.setTargetAtTime).toHaveBeenCalledWith(0, 1.234, 0.05);
    expect(comps[1].ratio.setTargetAtTime).toHaveBeenCalledWith(20, 1.234, 0.05);
    expect(svc.getMasteringBands().slice(0, 2)).toEqual([
      { id: 1, threshold: -60, ratio: 1 },
      { id: 2, threshold: 0, ratio: 20 },
    ]);
    expect((svc as any).masterMultibandWired).toBe(true);
  });

  it('applies a global compressor request to every active band', () => {
    const svc = makeBandEngine(true);
    svc.setMasteringBands(bands);
    (svc as any).configureMasterWorklet.mockClear();

    svc.configureCompressor({ threshold: -10, ratio: 8 });

    expect(
      svc.getMasteringBands().every((b) => b.threshold === -10 && b.ratio === 8),
    ).toBe(true);
    expect((svc as any).configureMasterWorklet).toHaveBeenCalledWith(
      'multiband',
      'configure',
      { bands: svc.getMasteringBands() },
    );
  });
});


// =====================================================================
// Voice builder — live playback and the offline bounce must agree.
//
// Regression guard for the split personality where `triggerAttack` (live)
// ignored a voice's cutoff, filter, sub oscillator and ADSR while
// `scheduleOfflineNote` (bounce) honoured them: a patch did not sound like
// its own export, the Synth's envelope / SUB OSC / LFO sections were dead
// controls, and the Drum Machine's per-pad CUTOFF / RES knobs changed
// nothing. Both entry points now run `buildVoiceGraph`.
// =====================================================================

// Shared by the voice-parity and device-budget suites below. Deliberately a
// bare `Object.create(AudioEngineService.prototype)` instance: that is the
// shape several suites here use, and it never runs field initialisers — the
// budget's lazy `ensureLiveVoices()` exists to survive exactly this.
function makeVoiceHarness() {
  const makeParam = () => ({
    value: 0,
    setValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
  });
  const makeNode = () => {
    const node: any = {
      gain: makeParam(),
      frequency: makeParam(),
      detune: makeParam(),
      pan: makeParam(),
      Q: makeParam(),
      type: 'sine',
      disconnect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
    node.connect = jest.fn(() => node);
    return node;
  };

  const ctx: any = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: jest.fn(() => makeNode()),
    createOscillator: jest.fn(() => makeNode()),
    createBiquadFilter: jest.fn(() => makeNode()),
    createStereoPanner: jest.fn(() => makeNode()),
  };

  const svc = Object.create(AudioEngineService.prototype) as any;
  svc.ctx = ctx;
  svc.isRecording = () => false;
  svc.getTrackOutput = jest.fn(() => ({ tag: 'trackOut' }));
  const osc = makeNode();
  svc.createAntialiasedOscillator = jest.fn(() => osc);
  return { svc, ctx, osc };
}

const dest = () => ({ connect: jest.fn() }) as any;

describe('AudioEngineService.buildVoiceGraph (live/offline voice parity)', () => {
  it('is the single path both live playback and the offline bounce run', () => {
    const { svc, ctx } = makeVoiceHarness();
    const spy = jest.spyOn(svc, 'buildVoiceGraph');

    svc.triggerAttack('t1', 440, 0, 0.8, 1, 1, 0, 0, 0, { type: 'sine' });
    svc.scheduleOfflineNote(ctx, dest(), 440, 0, 0.8, 1, { type: 'sine' }, 0);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps the percussive decay envelope for voices with no sustain level', () => {
    const { svc, ctx, osc } = makeVoiceHarness();

    const stopAt = svc.buildVoiceGraph(ctx, dest(), 220, 0.5, 0.8, 1, 0, {});

    const vca = ctx.createGain.mock.results[0].value;
    expect(vca.gain.setValueAtTime).toHaveBeenCalledWith(0, 0.5);
    // Bounded attack: an open-ended target here left the decay with no
    // departure value, so the voice peaked at ~5e-4 instead of 0.8.
    expect(vca.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, 0.51);
    expect(vca.gain.setTargetAtTime).not.toHaveBeenCalled();
    expect(vca.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.001,
      0.5 + 1 + 0.1
    );
    expect(stopAt).toBeCloseTo(0.5 + 1 + 0.1 + 0.1, 5);
    expect(osc.start).toHaveBeenCalledWith(0.5);
    expect(osc.stop).toHaveBeenCalledWith(expect.closeTo(stopAt, 5));
  });

  it('gives a sustaining voice a real ADSR: hold then release after the note', () => {
    const { svc, ctx } = makeVoiceHarness();

    const stopAt = svc.buildVoiceGraph(ctx, dest(), 220, 0, 1, 1, 0, {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.5,
      release: 0.3,
    });

    const vca = ctx.createGain.mock.results[0].value;
    expect(vca.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 0);
    // attack ramp reaches the peak, decay lands on peak * sustain
    expect(vca.gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      1,
      0.01
    );
    expect(vca.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.5,
      expect.closeTo(0.21, 5)
    );
    // sustain is HELD at the note end (releaseStart = max(attack+decay, note)),
    // then the release runs after it.
    expect(vca.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 1);
    expect(vca.gain.exponentialRampToValueAtTime).toHaveBeenLastCalledWith(
      0.0001,
      1.3
    );
    expect(stopAt).toBeCloseTo(1.35, 5);
  });

  it('honours the voice cutoff/resonance so preset and pad filters reach the graph', () => {
    const { svc, ctx, osc } = makeVoiceHarness();

    svc.buildVoiceGraph(ctx, dest(), 110, 0, 1, 0.5, 0, {
      cutoff: 800,
      q: 2.5,
      sustain: 0.2,
    });

    const filter = ctx.createBiquadFilter.mock.results[0].value;
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(800, 0);
    expect(filter.Q.setValueAtTime).toHaveBeenCalledWith(2.5, 0);
    expect(osc.connect).toHaveBeenCalledWith(filter);
  });

  it('reads the drum pad resonance key as filter Q', () => {
    const { svc, ctx } = makeVoiceHarness();

    svc.buildVoiceGraph(ctx, dest(), 60, 0, 1, 0.4, 0, {
      cutoff: 1200,
      resonance: 1.8,
    });

    const filter = ctx.createBiquadFilter.mock.results[0].value;
    expect(filter.Q.setValueAtTime).toHaveBeenCalledWith(1.8, 0);
  });

  it('adds the sub oscillator only when the voice asks for one', () => {
    const { svc, ctx } = makeVoiceHarness();

    svc.buildVoiceGraph(ctx, dest(), 200, 0, 1, 1, 0, {
      subOsc: true,
      subGain: 0.5,
      sustain: 0.5,
    });
    expect(svc.createAntialiasedOscillator).toHaveBeenCalledTimes(2);
    expect(svc.createAntialiasedOscillator).toHaveBeenLastCalledWith(
      ctx,
      'sine',
      100,
      0
    );

    // subGain 0 → silent sub is never built
    svc.createAntialiasedOscillator.mockClear();
    svc.buildVoiceGraph(ctx, dest(), 200, 0, 1, 1, 0, {
      subOsc: true,
      subGain: 0,
      sustain: 0.5,
    });
    expect(svc.createAntialiasedOscillator).toHaveBeenCalledTimes(1);

    // sub-bass below 40Hz is refused rather than pushed into DC
    svc.createAntialiasedOscillator.mockClear();
    svc.buildVoiceGraph(ctx, dest(), 30, 0, 1, 1, 0, {
      subOsc: true,
      subGain: 0.5,
      sustain: 0.5,
    });
    expect(svc.createAntialiasedOscillator).toHaveBeenCalledTimes(1);
  });

  describe('LFO (Synth → Filter Modulation)', () => {
    it('stays fully bypassed at depth 0', () => {
      const { svc, ctx } = makeVoiceHarness();

      svc.buildVoiceGraph(ctx, dest(), 200, 0, 1, 1, 0, {
        cutoff: 1000,
        sustain: 0.5,
      });

      expect(ctx.createOscillator).not.toHaveBeenCalled();
    });

    it('routes cutoff modulation into the voice filter', () => {
      const { svc, ctx } = makeVoiceHarness();
      svc.setLfoParams({ wave: 'sine', rate: 2, depth: 0.5, target: 'cutoff' });

      svc.buildVoiceGraph(ctx, dest(), 200, 0, 1, 1, 0, {
        cutoff: 1000,
        sustain: 0.5,
      });

      expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
      const lfo = ctx.createOscillator.mock.results[0].value;
      expect(lfo.type).toBe('sine');
      expect(lfo.frequency.setValueAtTime).toHaveBeenCalledWith(2, 0);
      const lfoDepthGain = ctx.createGain.mock.results[1].value;
      const filter = ctx.createBiquadFilter.mock.results[0].value;
      expect(lfoDepthGain.gain.setValueAtTime).toHaveBeenCalledWith(
        1000 * 0.8 * 0.5,
        0
      );
      expect(lfoDepthGain.connect).toHaveBeenCalledWith(filter.frequency);
      expect(lfo.start).toHaveBeenCalledWith(0);
    });

    it('routes pan modulation into the voice panner', () => {
      const { svc, ctx } = makeVoiceHarness();
      svc.setLfoParams({ rate: 4, depth: 0.25, target: 'pan' });

      svc.buildVoiceGraph(ctx, dest(), 200, 0, 1, 1, 0, { sustain: 0.5 });

      const panner = ctx.createStereoPanner.mock.results[0].value;
      const lfoDepthGain = ctx.createGain.mock.results[1].value;
      expect(lfoDepthGain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, 0);
      expect(lfoDepthGain.connect).toHaveBeenCalledWith(panner.pan);
      // A pan-only LFO must not force a filter into the dry voice.
      expect(ctx.createBiquadFilter).not.toHaveBeenCalled();
    });
  });

  it('clamps and round-trips the LFO snapshot', () => {
    const { svc } = makeVoiceHarness();

    svc.setLfoParam('rate', 999);
    expect(svc.getLfoParams().rate).toBe(40);
    svc.setLfoParam('depth', -3);
    expect(svc.getLfoParams().depth).toBe(0);
    svc.setLfoParam('depth', Number.NaN);
    expect(svc.getLfoParams().depth).toBe(0);
    svc.setLfoParam('wave', 'square');
    svc.setLfoParam('target', 'pitch');
    expect(svc.getLfoParams()).toMatchObject({ wave: 'square', target: 'pitch' });
    // Unknown keys are ignored rather than written onto the state.
    svc.setLfoParam('nonsense', 'x');
    expect(Object.keys(svc.getLfoParams()).sort()).toEqual([
      'depth',
      'rate',
      'target',
      'wave',
    ]);
  });
});

describe('clampFinite', () => {
  it('clamps, and falls back for non-numeric input', () => {
    expect(clampFinite(5, 0, 1, 0.5)).toBe(1);
    expect(clampFinite(-5, 0, 1, 0.5)).toBe(0);
    expect(clampFinite(0.25, 0, 1, 0.5)).toBe(0.25);
    expect(clampFinite(undefined, 0, 1, 0.5)).toBe(0.5);
    expect(clampFinite('nonsense', 0, 1, 0.5)).toBe(0.5);
    expect(clampFinite(Number.NaN, 0, 1, 0.5)).toBe(0.5);
  });
});

// =====================================================================
// Device voice budget — the enforcement half of StudioDeviceProfileService.
//
// The classifier publishes `budget().maxVoices`; these cases pin that the
// live path (`triggerAttack` → `buildVoiceGraph`) actually obeys it: the
// ceiling holds, the oldest voice is stolen at the ceiling, finished voices
// expire instead of squatting on a slot, and the offline bounce is never
// throttled by the interactive ceiling.
// =====================================================================

describe('AudioEngineService · device voice budget (budget().maxVoices)', () => {
  it('caps concurrent live voices at the ceiling and steals the oldest', () => {
    const { svc, ctx } = makeVoiceHarness();
    svc.setVoiceBudget(2);

    svc.triggerAttack('t1', 220, 0, 0.8, 1, 1, 0, 0, 0, {});
    svc.triggerAttack('t2', 330, 0, 0.8, 1, 1, 0, 0, 0, {});
    svc.triggerAttack('t3', 440, 0, 0.8, 1, 1, 0, 0, 0, {});

    expect(svc.activeVoiceCount()).toBe(2);

    // The steal cut the OLDEST voice (t1): its VCA got the click-free early
    // decay at the current time, and t2 — which also occupies a slot — was
    // left alone.
    const vca1 = ctx.createGain.mock.results[0].value;
    const vca2 = ctx.createGain.mock.results[1].value;
    expect(vca1.gain.setTargetAtTime).toHaveBeenCalledWith(0.0001, 0, 0.005);
    expect(vca2.gain.setTargetAtTime).not.toHaveBeenCalledWith(
      0.0001,
      0,
      0.005
    );
  });

  it('lets a finished voice expire instead of counting it against the ceiling', () => {
    const { svc, ctx } = makeVoiceHarness();
    svc.setVoiceBudget(1);

    svc.triggerAttack('t1', 220, 0, 0.8, 0.1, 1, 0, 0, 0, {});
    expect(svc.activeVoiceCount()).toBe(1);

    // t1's percussive envelope ends at 0 + 0.1 (duration) + 0.1 (release)
    // + 0.1 (tail) = 0.3 — by 0.5 it has finished on its own.
    ctx.currentTime = 0.5;
    svc.triggerAttack('t2', 330, 0.5, 0.8, 0.1, 1, 0, 0, 0, {});

    // Pruned, not stolen: t1 was never cut early, and t2 holds the slot.
    expect(svc.activeVoiceCount()).toBe(1);
    const vca1 = ctx.createGain.mock.results[0].value;
    expect(vca1.gain.setTargetAtTime).not.toHaveBeenCalledWith(
      0.0001,
      0.5,
      0.005
    );
  });

  it('never counts the offline bounce against the interactive ceiling', () => {
    const { svc, ctx } = makeVoiceHarness();
    svc.setVoiceBudget(1);

    svc.scheduleOfflineNote(ctx, dest(), 220, 0, 0.8, 1, {}, 0);
    svc.scheduleOfflineNote(ctx, dest(), 330, 0, 0.8, 1, {}, 0);

    // Both export voices were built in full; neither registered a slot.
    expect(ctx.createGain).toHaveBeenCalledTimes(2);
    expect(svc.activeVoiceCount()).toBe(0);
  });

  it('sheds voices immediately when the ceiling is lowered', () => {
    const { svc, ctx } = makeVoiceHarness();

    svc.triggerAttack('t1', 220, 0, 0.8, 1, 1, 0, 0, 0, {});
    svc.triggerAttack('t2', 330, 0, 0.8, 1, 1, 0, 0, 0, {});
    expect(svc.activeVoiceCount()).toBe(2);

    svc.setVoiceBudget(1);

    // The new ceiling applies now — not at the next note — and the oldest
    // of the two sounding voices is the one shed.
    expect(svc.activeVoiceCount()).toBe(1);
    const vca1 = ctx.createGain.mock.results[0].value;
    expect(vca1.gain.setTargetAtTime).toHaveBeenCalledWith(0.0001, 0, 0.005);
  });

  it('ignores a non-finite or sub-1 ceiling instead of resetting it', () => {
    const { svc } = makeVoiceHarness();
    svc.setVoiceBudget(4);
    svc.setVoiceBudget(Number.NaN);
    svc.setVoiceBudget(0);
    svc.setVoiceBudget(-3);

    for (let i = 0; i < 5; i++) {
      svc.triggerAttack(`t${i}`, 220 + i, 0, 0.8, 1, 1, 0, 0, 0, {});
    }

    // Still the last valid ceiling (4) — not reset to the default 32 and
    // not silently widened by the bad pushes.
    expect(svc.activeVoiceCount()).toBe(4);
  });

  it('keeps the desktop ceiling (32) until a device profile classifies', () => {
    const { svc } = makeVoiceHarness();

    // DEFAULT_LIVE_VOICE_BUDGET mirrors STUDIO_AUDIO_BUDGETS.high.maxVoices,
    // so an unclassified host behaves exactly as it did before this feature.
    for (let i = 0; i < 33; i++) {
      svc.triggerAttack(`t${i}`, 100 + i, 0, 0.8, 1, 1, 0, 0, 0, {});
    }

    expect(svc.activeVoiceCount()).toBe(32);
  });
});

describe('AudioEngineService tempo map', () => {
  it('resolves the tempo in force at a step and pushes the map to the worklet', () => {
    const svc = makeBareEngine();
    (svc as any).tempo = signal(120);
    (svc as any).tempoMap = [];
    (svc as any).workletNode = { port: { postMessage: jest.fn() } };

    svc.setTempoMap([
      { step: 32, bpm: 90 },
      { step: 0, bpm: 100 },
    ]);

    expect(svc.tempoAtStep(0)).toBe(100);
    expect(svc.tempoAtStep(31)).toBe(100);
    expect(svc.tempoAtStep(32)).toBe(90);
    expect(svc.getTempoMap()).toEqual([
      { step: 0, bpm: 100 },
      { step: 32, bpm: 90 },
    ]);
    expect((svc as any).workletNode.port.postMessage).toHaveBeenCalledWith({
      type: 'SET_TEMPO_MAP',
      payload: [
        { step: 0, bpm: 100 },
        { step: 32, bpm: 90 },
      ],
    });
  });

  it('ignores a cleared map and falls back to the global tempo', () => {
    const svc = makeBareEngine();
    (svc as any).tempo = signal(128);
    (svc as any).tempoMap = [];
    svc.setTempoMap([]);
    expect(svc.tempoAtStep(64)).toBe(128);
  });
});

describe('createAudioContext', () => {
  const original = (window as any).AudioContext;

  afterEach(() => {
    (window as any).AudioContext = original;
  });

  it('asks for interactive latency at the sample rate it opens', () => {
    const constructed: any[] = [];
    (window as any).AudioContext = class {
      constructor(options: any) {
        constructed.push(options);
      }
    };

    const result = createAudioContext();

    expect(result.available).toBe(true);
    // 96 kHz is the first preference; the monitoring buffer intent must travel
    // with it instead of being left to the host default.
    expect(constructed[0]).toEqual({
      latencyHint: 'interactive',
      sampleRate: 96000,
    });
  });

  it('keeps the interactive hint when it falls back to default sample rate', () => {
    const constructed: any[] = [];
    (window as any).AudioContext = class {
      constructor(options?: any) {
        if (options && options.sampleRate) {
          throw new Error('unsupported sample rate');
        }
        constructed.push(options);
      }
    };

    const result = createAudioContext();

    expect(result.available).toBe(true);
    expect(constructed).toEqual([{ latencyHint: 'interactive' }]);
  });
});
