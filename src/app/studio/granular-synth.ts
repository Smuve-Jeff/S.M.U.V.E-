import { Instrument } from './instrument';

export interface GranularParams {
  grainSize: number;       // ms per grain
  grainDensity: number;    // grains per second
  positionSpread: number;  // random variation in grain start position (0..1)
  pitchSpread: number;     // random pitch variation in semitones
  panSpread: number;       // random pan spread (0..1)
  attack: number;
  release: number;
  reverse: boolean;
}

interface Grain {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
  scheduledAt: number;
}

/**
 * Granular synthesizer: creates a cloud of overlapping micro-sound grains
 * from a source AudioBuffer. Randomized position, pitch, and pan create
 * evolving, atmospheric textures.
 */
export class GranularSynth extends Instrument {
  private sourceBuffer: AudioBuffer | null = null;
  private activeGrains: Grain[] = [];

  private params: GranularParams = {
    grainSize: 80,
    grainDensity: 15,
    positionSpread: 0.5,
    pitchSpread: 3,
    panSpread: 0.6,
    attack: 0.01,
    release: 0.05,
    reverse: false,
  };

  private grainInterval: ReturnType<typeof setInterval> | null = null;
  private isActive = false;

  constructor(audioContext: AudioContext) {
    super(audioContext, 64);
  }

  setParams(params: Partial<GranularParams>): void {
    this.params = { ...this.params, ...params };
  }

  /** Load the audio buffer to grain from */
  loadBuffer(buffer: AudioBuffer): void {
    this.sourceBuffer = buffer;
  }

  play(_note: number, velocity: number): void {
    if (!this.sourceBuffer) return;
    this.isActive = true;
    const normVel = velocity / 127;
    const intervalMs = 1000 / Math.max(1, this.params.grainDensity);

    if (this.grainInterval) clearInterval(this.grainInterval);

    this.grainInterval = setInterval(() => {
      if (!this.isActive || !this.sourceBuffer) {
        if (this.grainInterval) clearInterval(this.grainInterval);
        return;
      }
      this.spawnGrain(normVel);
      this.cleanupGrains();
    }, intervalMs);
  }

  private spawnGrain(velocity: number): void {
    if (!this.sourceBuffer) return;

    const now = this.audioContext.currentTime;
    const buf = this.sourceBuffer;
    const bufDuration = buf.duration;

    // Random start position
    const centerPos = 0.3; // default to first third
    const spread = this.params.positionSpread * bufDuration;
    const pos = Math.max(0, Math.min(bufDuration - 0.01,
      centerPos * bufDuration + (Math.random() - 0.5) * spread * 2));

    const grainLenSec = this.params.grainSize / 1000;
    const adjustedLen = Math.min(grainLenSec, bufDuration - pos);

    const source = this.audioContext.createBufferSource();
    source.buffer = this.sourceBuffer;

    // Pitch variation
    const pitchOffset = (Math.random() - 0.5) * 2 * this.params.pitchSpread;
    const playbackRate = Math.pow(2, pitchOffset / 12);
    source.playbackRate.setValueAtTime(playbackRate, now);

    // Reverse
    if (this.params.reverse) {
      source.playbackRate.setValueAtTime(-playbackRate, now);
    }

    // Pan randomization
    const pan = (Math.random() - 0.5) * 2 * this.params.panSpread;
    const panner = this.audioContext.createStereoPanner();
    panner.pan.setValueAtTime(pan, now);

    // Envelope
    const env = this.audioContext.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(velocity * 0.3, now + this.params.attack);
    env.gain.setValueAtTime(velocity * 0.3, now + adjustedLen - this.params.release);
    env.gain.exponentialRampToValueAtTime(0.001, now + adjustedLen);

    source.connect(panner);
    panner.connect(env);
    env.connect(this.output);

    source.start(now, pos, adjustedLen);
    source.stop(now + adjustedLen + 0.05);

    this.activeGrains.push({ source, gain: env, panner, scheduledAt: now });
  }

  private cleanupGrains(): void {
    const now = this.audioContext.currentTime;
    this.activeGrains = this.activeGrains.filter((g) => {
      if (g.scheduledAt + 2 < now) {
        try { g.source.stop(); } catch (e) {}
        g.source.disconnect();
        g.gain.disconnect();
        g.panner.disconnect();
        return false;
      }
      return true;
    });
  }

  stop(_note: number): void {
    this.isActive = false;
    if (this.grainInterval) {
      clearInterval(this.grainInterval);
      this.grainInterval = null;
    }
  }

  stopAll(): void {
    this.isActive = false;
    if (this.grainInterval) {
      clearInterval(this.grainInterval);
      this.grainInterval = null;
    }
    const now = this.audioContext.currentTime;
    for (const grain of this.activeGrains) {
      grain.gain.gain.cancelScheduledValues(now);
      grain.gain.gain.setValueAtTime(grain.gain.gain.value, now);
      grain.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      setTimeout(() => {
        try { grain.source.stop(); } catch (e) {}
        grain.source.disconnect();
        grain.gain.disconnect();
        grain.panner.disconnect();
      }, 60);
    }
    this.activeGrains = [];
  }
}
