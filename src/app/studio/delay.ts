/**
 * Insert delay with the controls the rack shows.
 *
 * The plugin used to expose `time`/`feedback` only, while the panel offered
 * Wet, Dry, Time, Feedback and Tone; the two knobs that had no target were
 * decorative. Wet and Dry are now independent output trims and Tone is a
 * low-pass inside the feedback path, so successive repeats darken the way a
 * tape or bucket-brigade delay does instead of layering identical brightness.
 */
export class Delay {
  readonly input: GainNode;
  readonly delayNode: DelayNode;
  readonly feedbackGain: GainNode;
  readonly output: GainNode;

  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly toneFilter: BiquadFilterNode;

  /**
   * Tracked intent. Time and feedback are applied through `setTargetAtTime`,
   * so reading the AudioParams back returns the previous value (and never
   * settles offline) — the plugin layer needs the intent.
   */
  private _time = 0.25;
  private _feedback = 0.35;
  private _wet = 0.4;
  private _dry = 0.6;
  private _tone = 50;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.delayNode = this.context.createDelay(2);
    this.feedbackGain = this.context.createGain();
    this.output = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();
    this.toneFilter = this.context.createBiquadFilter();
    this.toneFilter.type = "lowpass";

    this.delayNode.delayTime.value = this._time;
    this.feedbackGain.gain.value = this._feedback;
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = this._dry;
    this.toneFilter.frequency.value = Delay.toneHz(this._tone);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Repeats circulate through the tone filter, so each pass loses highs.
    this.delayNode.connect(this.toneFilter);
    this.toneFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
  }

  /** Current delay time in seconds. */
  get time(): number {
    return this._time;
  }

  /** Current feedback amount (0..1). */
  get feedback(): number {
    return this._feedback;
  }

  get wet(): number {
    return this._wet;
  }

  get dry(): number {
    return this._dry;
  }

  get tone(): number {
    return this._tone;
  }

  setDelayTime(time: number) {
    this._time = Math.max(0.01, Math.min(2, Delay.number(time, 0.25)));
    this.delayNode.delayTime.setTargetAtTime(
      this._time,
      this.context.currentTime,
      0.01,
    );
  }

  setFeedback(feedback: number) {
    this._feedback = Math.max(0, Math.min(0.95, Delay.number(feedback, 0.35)));
    this.feedbackGain.gain.setTargetAtTime(
      this._feedback,
      this.context.currentTime,
      0.01,
    );
  }

  /** Wet trim, 0..100 %. */
  setWet(percent: number) {
    this._wet = Math.max(0, Math.min(1, Delay.number(percent, 40) / 100));
    this.wetGain.gain.setTargetAtTime(
      this._wet,
      this.context.currentTime,
      0.02,
    );
  }

  /** Dry trim, 0..100 %. */
  setDry(percent: number) {
    this._dry = Math.max(0, Math.min(1, Delay.number(percent, 60) / 100));
    this.dryGain.gain.setTargetAtTime(
      this._dry,
      this.context.currentTime,
      0.02,
    );
  }

  /** Tone, 0..100 % — sweep the repeat low-pass from dark to open. */
  setTone(percent: number) {
    this._tone = Math.max(0, Math.min(100, Delay.number(percent, 50)));
    this.toneFilter.frequency.setTargetAtTime(
      Delay.toneHz(this._tone),
      this.context.currentTime,
      0.02,
    );
  }

  /** 0 % ⇒ 300 Hz, 100 % ⇒ 18 kHz, exponentially spaced so the knob is even. */
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
