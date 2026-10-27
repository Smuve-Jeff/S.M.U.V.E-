/**
 * Insert saturation with the controls the rack shows.
 *
 * The plugin exposed only `amount` while the panel offered Drive, Tone, Mix and
 * Output. Drive is the shaper curve, Tone is a post-shaper low-pass, Mix sets
 * the wet/dry balance and Output is the makeup trim — so all four knobs in the
 * panel move something audible.
 */
export class Saturation {
  readonly input: GainNode;
  readonly waveShaper: WaveShaperNode;
  readonly output: GainNode;

  private readonly toneFilter: BiquadFilterNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;

  /** Tracked drive amount (0..1). A curve cannot be read back as a scalar. */
  private _amount = 0.2;
  private _tone = 50;
  private _mix = 1;
  private _outputDb = 0;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.waveShaper = this.context.createWaveShaper();
    this.output = this.context.createGain();
    this.toneFilter = this.context.createBiquadFilter();
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();

    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = Saturation.toneHz(this._tone);
    this.wetGain.gain.value = this._mix;
    this.dryGain.gain.value = 1 - this._mix;

    // Dry path stays clean; the wet path is drive → tone → trim.
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.input.connect(this.waveShaper);
    this.waveShaper.connect(this.toneFilter);
    this.toneFilter.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.setAmount(this._amount);
  }

  /** Current drive amount (0..1). */
  get amount(): number {
    return this._amount;
  }

  get tone(): number {
    return this._tone;
  }

  get mix(): number {
    return this._mix;
  }

  get outputDb(): number {
    return this._outputDb;
  }

  setAmount(amount: number) {
    this._amount = Math.max(
      0,
      Math.min(1, Saturation.number(amount, this._amount)),
    );
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const k = this._amount * 10;
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.waveShaper.curve = curve;
  }

  /** Post-shaper low-pass, 0..100 % (300 Hz … 18 kHz). */
  setTone(percent: number) {
    this._tone = Math.max(0, Math.min(100, Saturation.number(percent, 50)));
    this.toneFilter.frequency.setTargetAtTime(
      Saturation.toneHz(this._tone),
      this.context.currentTime,
      0.02,
    );
  }

  /** Wet/dry balance, 0..100 % wet. */
  setMix(percent: number) {
    this._mix = Math.max(0, Math.min(1, Saturation.number(percent, 100) / 100));
    this.wetGain.gain.setTargetAtTime(this._mix, this.context.currentTime, 0.02);
    this.dryGain.gain.setTargetAtTime(
      1 - this._mix,
      this.context.currentTime,
      0.02,
    );
  }

  /** Output makeup trim in dB (-12..12). */
  setOutputDb(db: number) {
    this._outputDb = Math.max(
      -12,
      Math.min(12, Saturation.number(db, 0)),
    );
    this.output.gain.setTargetAtTime(
      Math.pow(10, this._outputDb / 20),
      this.context.currentTime,
      0.02,
    );
  }

  private static toneHz(percent: number): number {
    return 300 * Math.pow(18000 / 300, Math.max(0, Math.min(1, percent / 100)));
  }

  private static number(value: unknown, fallback: number): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    try {
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
