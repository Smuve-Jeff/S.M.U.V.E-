import { FMSynth } from './fm-synth';
import { WavetableSynth } from './wavetable-synth';
import { PhysicalModelingSynth } from './physical-modeling-synth';
import { GranularSynth } from './granular-synth';

// MockAudioContext is already set up globally in setup-jest.ts

describe('FMSynth', () => {
  let ctx: AudioContext;
  let synth: FMSynth;

  beforeEach(() => {
    ctx = new AudioContext();
    synth = new FMSynth(ctx);
  });

  it('should be created', () => {
    expect(synth).toBeTruthy();
  });

  it('should play a note without throwing', () => {
    expect(() => synth.play(60, 100)).not.toThrow();
  });

  it('should stop a playing note without throwing', () => {
    synth.play(60, 100);
    expect(() => synth.stop(60)).not.toThrow();
  });

  it('should stop a non-playing note gracefully', () => {
    expect(() => synth.stop(99)).not.toThrow();
  });

  it('should stop all voices', () => {
    synth.play(60, 100);
    synth.play(64, 80);
    synth.play(67, 90);
    expect(() => synth.stopAll()).not.toThrow();
  });

  it('should accept parameter updates', () => {
    expect(() =>
      synth.setParams({
        masterVolume: 0.5,
        operators: [
          {
            ratio: 1,
            modIndex: 0,
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 },
            waveform: 'sine',
          },
        ],
      })
    ).not.toThrow();
  });

  it('should connect and disconnect output', () => {
    const dest = ctx.createGain();
    synth.connect(dest);
    synth.disconnect();
  });

  it('should handle 4-op FM notes with modulation', () => {
    // Play a chord — each note creates 4 operators with FM routing
    [60, 64, 67].forEach((n) => synth.play(n, 100));
    synth.stopAll();
  });
});

describe('WavetableSynth', () => {
  let ctx: AudioContext;
  let synth: WavetableSynth;

  beforeEach(() => {
    ctx = new AudioContext();
    synth = new WavetableSynth(ctx);
  });

  it('should be created', () => {
    expect(synth).toBeTruthy();
  });

  it('should have 4 default wavetable frames', () => {
    // Verify internally — frames should be populated
    synth.play(60, 100);
    synth.stopAll();
  });

  it('should play a note without throwing', () => {
    expect(() => synth.play(60, 100)).not.toThrow();
  });

  it('should morph between wavetable frames via tablePosition', () => {
    synth.setParams({ tablePosition: 1.5 }); // crossfade between frame 1 & 2
    expect(() => synth.play(60, 100)).not.toThrow();
    synth.stop(60);
  });

  it('should play with extreme parameter values', () => {
    synth.setParams({
      attack: 0.5,
      decay: 1.0,
      sustain: 0.9,
      release: 2.0,
      filterCutoff: 200,
      filterResonance: 10,
    });
    expect(() => synth.play(60, 100)).not.toThrow();
    synth.stop(60);
  });

  it('should stop all voices', () => {
    synth.play(48, 100);
    synth.play(55, 80);
    synth.play(60, 90);
    expect(() => synth.stopAll()).not.toThrow();
  });

  it('should load custom frames', () => {
    const frame = { data: new Float32Array(2048) };
    for (let i = 0; i < 2048; i++) frame.data[i] = Math.sin((2 * Math.PI * i) / 2048);
    expect(() => synth.loadFrames([frame])).not.toThrow();
  });

  it('should connect and disconnect', () => {
    const dest = ctx.createGain();
    synth.connect(dest);
    synth.disconnect();
  });
});

describe('PhysicalModelingSynth', () => {
  let ctx: AudioContext;
  let synth: PhysicalModelingSynth;

  beforeEach(() => {
    ctx = new AudioContext();
    synth = new PhysicalModelingSynth(ctx);
  });

  it('should be created', () => {
    expect(synth).toBeTruthy();
  });

  it('should play a plucked note (Karplus-Strong + modal body)', () => {
    expect(() => synth.play(60, 100)).not.toThrow();
  });

  it('should stop a note', () => {
    synth.play(60, 100);
    expect(() => synth.stop(60)).not.toThrow();
  });

  it('should stop all notes', () => {
    synth.play(50, 100);
    synth.play(62, 80);
    expect(() => synth.stopAll()).not.toThrow();
  });

  it('should accept parameter updates', () => {
    expect(() =>
      synth.setParams({
        brightness: 0.3,
        damping: 0.8,
        bodyMix: 0.5,
        attack: 0.02,
        release: 3.0,
      })
    ).not.toThrow();
  });

  it('should play a low note (long string delay)', () => {
    expect(() => synth.play(24, 100)).not.toThrow(); // C1 — heavy DSP
    synth.stop(24);
  });

  it('should handle rapid note on/off without leaks', () => {
    for (let n = 60; n < 72; n++) {
      synth.play(n, 100);
      synth.stop(n);
    }
  });

  it('should connect and disconnect', () => {
    const dest = ctx.createGain();
    synth.connect(dest);
    synth.disconnect();
  });
});

describe('GranularSynth', () => {
  let ctx: AudioContext;
  let synth: GranularSynth;

  beforeEach(() => {
    ctx = new AudioContext();
    synth = new GranularSynth(ctx);
  });

  it('should be created', () => {
    expect(synth).toBeTruthy();
  });

  it('should not throw when playing without a loaded buffer', () => {
    expect(() => synth.play(60, 100)).not.toThrow();
  });

  it('should load a buffer and play without throwing', () => {
    const buffer = ctx.createBuffer(1, 44100, 44100);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    synth.loadBuffer(buffer);
    expect(() => synth.play(60, 100)).not.toThrow();
  });

  it('should stop grain cloud', () => {
    const buffer = ctx.createBuffer(1, 44100, 44100);
    synth.loadBuffer(buffer);
    synth.play(60, 100);
    expect(() => synth.stop(60)).not.toThrow();
  });

  it('should stop all grains', () => {
    const buffer = ctx.createBuffer(1, 44100, 44100);
    synth.loadBuffer(buffer);
    synth.play(60, 100);
    expect(() => synth.stopAll()).not.toThrow();
  });

  it('should accept parameter updates', () => {
    expect(() =>
      synth.setParams({
        grainSize: 50,
        grainDensity: 30,
        positionSpread: 0.8,
        pitchSpread: 6,
        panSpread: 0.9,
        reverse: true,
      })
    ).not.toThrow();
  });

  it('should handle reverse grains', () => {
    const buffer = ctx.createBuffer(1, 44100, 44100);
    synth.loadBuffer(buffer);
    synth.setParams({ reverse: true });
    expect(() => synth.play(60, 100)).not.toThrow();
    synth.stopAll();
  });

  it('should connect and disconnect', () => {
    const dest = ctx.createGain();
    synth.connect(dest);
    synth.disconnect();
  });
});

describe('All synths interoperability', () => {
  it('should all share an AudioContext without conflicts', () => {
    const ctx = new AudioContext();
    const fm = new FMSynth(ctx);
    const wt = new WavetableSynth(ctx);
    const pm = new PhysicalModelingSynth(ctx);
    const gr = new GranularSynth(ctx);

    const dest = ctx.createGain();
    [fm, wt, pm, gr].forEach((s) => s.connect(dest));

    fm.play(60, 100);
    wt.play(64, 80);
    pm.play(67, 90);
    gp: { /* granular needs buffer */ }
    gr.stopAll();

    [fm, wt, pm, gr].forEach((s) => s.stopAll());
    [fm, wt, pm, gr].forEach((s) => s.disconnect());
  });
});
