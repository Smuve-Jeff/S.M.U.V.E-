/**
 * Insert compressor with the controls the rack shows.
 *
 * Only threshold and ratio used to be settable, so the panel's Attack, Release
 * and Makeup knobs had nowhere to go. All five move the node (or the output
 * trim) now, and each setter keeps the dialled value so `getParam` reads back
 * the artist's intent rather than a default.
 */
export class Compressor {
  readonly input: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly output: GainNode;

  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;

  private _threshold = -24;
  private _ratio = 4;
  private _attackMs = 10;
  private _releaseMs = 120;
  private _makeupDb = 0;
  private _mix = 1;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.output = this.context.createGain();

    this.compressor.threshold.value = this._threshold;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = this._ratio;
    this.compressor.attack.value = this._attackMs / 1000;
    this.compressor.release.value = this._releaseMs / 1000;

    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();
    this.wetGain.gain.value = this._mix;
    this.dryGain.gain.value = 1 - this._mix;

    // Parallel compression: Mix at 100 % is the classic in-line insert, and
    // rolling it back blends the uncompressed signal — the knob the panel
    // shows and the DSP now agree on.
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.input.connect(this.compressor);
    this.compressor.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    try {
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  get threshold(): number {
    return this._threshold;
  }

  get ratio(): number {
    return this._ratio;
  }

  get attackMs(): number {
    return this._attackMs;
  }

  get releaseMs(): number {
    return this._releaseMs;
  }

  get makeupDb(): number {
    return this._makeupDb;
  }

  get mix(): number {
    return this._mix;
  }

  setThreshold(value: number): void {
    this._threshold = Math.max(-60, Math.min(0, Compressor.number(value, this._threshold)));
    this.compressor.threshold.setTargetAtTime(
      this._threshold,
      this.context.currentTime,
      0.01,
    );
  }

  setRatio(value: number): void {
    this._ratio = Math.max(1, Math.min(20, Compressor.number(value, this._ratio)));
    this.compressor.ratio.setTargetAtTime(
      this._ratio,
      this.context.currentTime,
      0.01,
    );
  }

  /** Attack in milliseconds (1..200). */
  setAttack(value: number): void {
    this._attackMs = Math.max(1, Math.min(200, Compressor.number(value, this._attackMs)));
    this.compressor.attack.setTargetAtTime(
      this._attackMs / 1000,
      this.context.currentTime,
      0.01,
    );
  }

  /** Release in milliseconds (20..1000). */
  setRelease(value: number): void {
    this._releaseMs = Math.max(
      20,
      Math.min(1000, Compressor.number(value, this._releaseMs)),
    );
    this.compressor.release.setTargetAtTime(
      this._releaseMs / 1000,
      this.context.currentTime,
      0.01,
    );
  }

  /** Makeup gain in dB (0..24) applied on the output trim. */
  setMakeup(value: number): void {
    this._makeupDb = Math.max(0, Math.min(24, Compressor.number(value, this._makeupDb)));
    this.output.gain.setTargetAtTime(
      Math.pow(10, this._makeupDb / 20),
      this.context.currentTime,
      0.02,
    );
  }

  /** Parallel blend, 0..100 % wet. */
  setMix(percent: number): void {
    this._mix = Math.max(
      0,
      Math.min(1, Compressor.number(percent, 100) / 100),
    );
    this.wetGain.gain.setTargetAtTime(this._mix, this.context.currentTime, 0.02);
    this.dryGain.gain.setTargetAtTime(
      1 - this._mix,
      this.context.currentTime,
      0.02,
    );
  }

  private static number(value: unknown, fallback: number): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
}
