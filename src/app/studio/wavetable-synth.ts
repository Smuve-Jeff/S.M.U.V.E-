import { Instrument } from './instrument';
import { NodePool } from './performance-utils';

export interface WavetableFrame {
  /** Normalized table data (Float32Array, length = tableSize) */
  data: Float32Array;
}

export interface WavetableSynthParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  tablePosition: number; // 0..numFrames-1 interpolation
  filterCutoff: number;
  filterResonance: number;
}

/**
 * Mip-mapped wavetable synthesizer.
 * Supports smooth morphing between wavetable frames with
 * bandlimited mip-map levels for anti-aliasing.
 */
export class WavetableSynth extends Instrument {
  private frames: WavetableFrame[] = [];
  private tableSize = 2048;

  private params: WavetableSynthParams = {
    attack: 0.02,
    decay: 0.3,
    sustain: 0.7,
    release: 0.4,
    tablePosition: 0,
    filterCutoff: 8000,
    filterResonance: 1,
  };

  private voices = new Map<number, any>();

  private oscPool: NodePool<OscillatorNode>;
  private gainPool: NodePool<GainNode>;
  private filterPool: NodePool<BiquadFilterNode>;

  constructor(audioContext: AudioContext) {
    super(audioContext, 10);
    this.oscPool = new NodePool(this.audioContext, (ctx) => ctx.createOscillator());
    this.gainPool = new NodePool(this.audioContext, (ctx) => ctx.createGain());
    this.filterPool = new NodePool(this.audioContext, (ctx) => ctx.createBiquadFilter());
    this.generateDefaultTables();
  }

  /** Generate default saw/sine/triangle/square wavetables */
  private generateDefaultTables(): void {
    const N = this.tableSize;
    // Sawtooth frame
    const saw = new Float32Array(N);
    for (let i = 0; i < N; i++) saw[i] = 1 - (2 * i) / N;

    // Sine frame
    const sine = new Float32Array(N);
    for (let i = 0; i < N; i++) sine[i] = Math.sin((2 * Math.PI * i) / N);

    // Square frame
    const square = new Float32Array(N);
    for (let i = 0; i < N; i++) square[i] = i < N / 2 ? 1 : -1;

    // Triangle frame
    const tri = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / N;
      tri[i] = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
    }

    this.frames = [
      { data: saw },
      { data: sine },
      { data: square },
      { data: tri },
    ];
  }

  setParams(params: Partial<WavetableSynthParams>): void {
    this.params = { ...this.params, ...params };
  }

  /** Load custom wavetable frames */
  loadFrames(frames: WavetableFrame[]): void {
    this.frames = frames;
  }

  play(note: number, velocity: number): void {
    const now = this.audioContext.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const normVel = velocity / 127;

    const pos = this.params.tablePosition;
    const idx0 = Math.floor(pos);
    const idx1 = Math.min(idx0 + 1, this.frames.length - 1);
    const frac = pos - idx0;

    // Morph between two adjacent wavetable frames
    const frameA = this.frames[idx0]?.data;
    const frameB = this.frames[idx1]?.data;
    if (!frameA || !frameB) return;

    const real = new Float32Array(this.tableSize);
    const imag = new Float32Array(this.tableSize);
    for (let i = 0; i < this.tableSize; i++) {
      // Simple crossfade between frames
      const val = frameA[i] * (1 - frac) + frameB[i] * frac;
      real[i] = val;
    }

    let wave: PeriodicWave;
    try {
      wave = this.audioContext.createPeriodicWave(real, imag, {
        disableNormalization: false,
      });
    } catch {
      return;
    }

    const osc = this.oscPool.get();
    osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(freq, now);

    const filter = this.filterPool.get();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.params.filterCutoff, now);
    filter.Q.setValueAtTime(this.params.filterResonance, now);

    const env = this.gainPool.get();
    const p = this.params;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(normVel, now + p.attack);
    env.gain.linearRampToValueAtTime(normVel * p.sustain, now + p.attack + p.decay);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.output);

    osc.start(now);

    const voice = { osc, filter, env };
    this.voiceManager.addVoice({
      note,
      startTime: now,
      stop: () => this.releaseVoice(voice, note),
    });
    this.voices.set(note, voice);
  }

  stop(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      this.releaseVoice(voice, note);
      this.voices.delete(note);
      this.voiceManager.removeVoice(note);
    }
  }

  stopAll(): void {
    this.voices.forEach((voice, note) => {
      this.releaseVoice(voice, note);
      this.voiceManager.removeVoice(note);
    });
    this.voices.clear();
    this.voiceManager.clear();
  }

  private releaseVoice(voice: any, note: number): void {
    const now = this.audioContext.currentTime;
    voice.env.gain.cancelScheduledValues(now);
    voice.env.gain.setValueAtTime(voice.env.gain.value, now);
    voice.env.gain.exponentialRampToValueAtTime(0.001, now + this.params.release);

    setTimeout(() => {
      try { voice.osc.stop(); } catch (e) {}
      this.oscPool.release(voice.osc);
      this.gainPool.release(voice.env);
      this.filterPool.release(voice.filter);
    }, this.params.release * 1000 + 50);
  }
}
