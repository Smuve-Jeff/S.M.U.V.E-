/**
 * Convolution reverb with the controls the rack actually shows.
 *
 * The insert reverb used to expose a single wet/dry `mix` while the panel
 * offered Wet, Dry, Decay, Size, Pre-Delay and Damping — turning Decay changed
 * a number and nothing else. Each knob now has a real target:
 *
 *  - Wet / Dry are independent output trims (percent), so a slot can sit at
 *    "60 wet / 40 dry" exactly as the panel reads.
 *  - Decay is the length of the tail, Size stretches that tail (a bigger room
 *    rings longer and decays more gradually), Pre-Delay adds silence before
 *    the room answers, and Damping rolls off the high end of the response.
 *
 * The noise is seeded (xorshift32) rather than `Math.random`, so the live graph
 * and an `OfflineAudioContext` bounce share one room instead of two subtly
 * different ones — the same reason the original impulse was seeded.
 */
export class Reverb {
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly _input: GainNode;
  readonly output: GainNode;

  /** Tracked intent (0..1 wet/dry) — gains are ramped, so read these back. */
  private _wet = 0.6;
  private _dry = 0.4;

  /** Tracked room shape, in the units the panel shows. */
  private _decaySeconds = 2.5;
  private _size = 50;
  private _preDelayMs = 20;
  private _damping = 30;

  constructor(private readonly audioContext: AudioContext) {
    this.convolver = this.audioContext.createConvolver();
    this.wetGain = this.audioContext.createGain();
    this.dryGain = this.audioContext.createGain();
    this._input = this.audioContext.createGain();
    this.output = this.audioContext.createGain();

    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = this._dry;

    this._input.connect(this.dryGain);
    this._input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);

    this.renderImpulseResponse();
  }

  connect(node: AudioNode): void {
    this.output.connect(node);
  }

  disconnect(): void {
    try {
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  get input(): AudioNode {
    return this._input;
  }

  /** Wet mix, 0..1. */
  get mix(): number {
    return this._wet;
  }

  /** Back-compat: a single balance control sets both trims. */
  setMix(value: number) {
    this.setWet(value * 100);
    this.setDry((1 - value) * 100);
  }

  /** Wet output trim, 0..100 %. */
  setWet(percent: number): void {
    this._wet = Math.max(0, Math.min(1, Reverb.percent(percent)));
    this.wetGain.gain.setTargetAtTime(
      this._wet,
      this.audioContext.currentTime,
      0.02,
    );
  }

  /** Dry output trim, 0..100 %. */
  setDry(percent: number): void {
    this._dry = Math.max(0, Math.min(1, Reverb.percent(percent)));
    this.dryGain.gain.setTargetAtTime(
      this._dry,
      this.audioContext.currentTime,
      0.02,
    );
  }

  get wet(): number {
    return this._wet;
  }

  get dry(): number {
    return this._dry;
  }

  /** Tail length in seconds (0.1..10). */
  setDecay(seconds: number): void {
    this._decaySeconds = Math.max(
      0.1,
      Math.min(10, Number.isFinite(seconds) ? seconds : 2.5),
    );
    this.renderImpulseResponse();
  }

  get decaySeconds(): number {
    return this._decaySeconds;
  }

  /** Room size, 0..100 % — stretches the tail. */
  setSize(percent: number): void {
    this._size = Math.max(0, Math.min(100, Reverb.number(percent, 50)));
    this.renderImpulseResponse();
  }

  get size(): number {
    return this._size;
  }

  /** Gap before the room answers, 0..200 ms. */
  setPreDelay(ms: number): void {
    this._preDelayMs = Math.max(0, Math.min(200, Reverb.number(ms, 20)));
    this.renderImpulseResponse();
  }

  get preDelayMs(): number {
    return this._preDelayMs;
  }

  /** High-frequency damping, 0..100 %. */
  setDamping(percent: number): void {
    this._damping = Math.max(0, Math.min(100, Reverb.number(percent, 30)));
    this.renderImpulseResponse();
  }

  get damping(): number {
    return this._damping;
  }

  private static number(value: unknown, fallback: number): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private static percent(value: unknown): number {
    return Reverb.number(value, 0) / 100;
  }

  /**
   * (Re)build the stereo impulse from the current room controls. Deterministic:
   * a given decay/size/pre-delay/damping always produces the same response, so
   * a bounce cannot drift from what the artist auditioned.
   */
  private renderImpulseResponse(): void {
    const sampleRate = this.audioContext.sampleRate;
    const preDelayFrames = Math.floor((this._preDelayMs / 1000) * sampleRate);
    // Size stretches the audible tail from half to one-and-a-half times the
    // decay time; the envelope below gets correspondingly shallower.
    const stretch = 0.5 + (this._size / 100);
    const tailFrames = Math.max(
      1,
      Math.floor(this._decaySeconds * stretch * sampleRate),
    );
    const length = Math.max(1, preDelayFrames + tailFrames);
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const channels = [impulse.getChannelData(0), impulse.getChannelData(1)];

    let seed = 0x9e3779b9;
    const nextNoise = () => {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0xffffffff;
    };

    // One-pole low-pass per channel: 0 % damping keeps the noise open, 100 %
    // leaves a dark, distant room.
    const dampingCoefficient = 1 - 0.9 * (this._damping / 100);
    const exponent = 2 + 2 * (1 - this._size / 100);
    const filtered = [0, 0];

    for (let channel = 0; channel < 2; channel += 1) {
      const data = channels[channel];
      for (let i = 0; i < tailFrames; i += 1) {
        const noise = nextNoise() * 2 - 1;
        filtered[channel] += dampingCoefficient * (noise - filtered[channel]);
        const decay = Math.pow(1 - i / tailFrames, exponent);
        data[preDelayFrames + i] = filtered[channel] * decay;
      }
    }

    this.convolver.buffer = impulse;
  }
}
