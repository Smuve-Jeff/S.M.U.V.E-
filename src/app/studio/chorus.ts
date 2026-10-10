/**
 * S.M.U.V.E — Stereo Chorus & Modulation
 *
 * Web Audio port of the `ChorusEffect` engine in `smuve_modulation.py`, which was
 * a fully-tested Python engine with no consumer anywhere in the app. The signal
 * maths is identical — a sinusoidal LFO scales the depth around a fixed base
 * delay, and the modulated delay is blended with the dry signal by `mix`:
 *
 *     out = (1 - mix) * dry + mix * delayed(base + depth * lfo(t))
 *
 * Checked against the engine itself: at 44.1 kHz / 5 ms depth the Python LFO
 * sweeps 0.113379 ms .. 5.102041 ms and this port sweeps 0.113379 ms ..
 * 5.113379 ms — the same window, less the 0.011 ms Python loses by truncating
 * its depth to whole samples (`int(0.005 * 44100)` = 220, not 220.5).
 *
 * Two deviations, both forced by the graph this feeds:
 *  - The Python line was mono. A chorus only widens when the channels drift
 *    apart, so the input is split into one delay line per channel and re-merged;
 *    the right LFO starts a quarter period after the left.
 *  - The Python ring buffer was 100 ms long and clamped its reads when a depth
 *    ran past it. Here the delay nodes are sized from `base + max depth`, so no
 *    depth the class accepts can starve the line.
 *
 * Because the LFOs modulate `delayTime` (an AudioParam) at audio rate, the
 * modulation runs on the audio thread — this class schedules nodes once and
 * never touches the buffer per sample.
 */
export class Chorus {
  /**
   * Fixed offset the LFO sweeps around: the Python engine's `+ 5.0` sample base,
   * which puts the shortest delay at about 0.11 ms at 44.1 kHz.
   */
  private static readonly BASE_DELAY_SAMPLES = 5;

  /** Ceiling for the modulated swing. Python's own default depth is 5 ms. */
  static readonly MAX_DEPTH_MS = 20;

  /**
   * Headroom on top of base + full swing so the LFO's peaks land inside the line
   * instead of being clamped at exactly `maxDelayTime`, which would flatten the
   * top of every cycle.
   */
  private static readonly HEADROOM_SECONDS = 0.001;

  static readonly MIN_RATE_HZ = 0.05;
  static readonly MAX_RATE_HZ = 10;

  readonly input: GainNode;
  readonly output: GainNode;

  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly splitter: ChannelSplitterNode;
  private readonly merger: ChannelMergerNode;
  private readonly delayLeft: DelayNode;
  private readonly delayRight: DelayNode;
  private readonly depthLeft: GainNode;
  private readonly depthRight: GainNode;
  private readonly lfoLeft: OscillatorNode;
  private readonly lfoRight: OscillatorNode;

  /**
   * Tracked intent for rate (Hz), depth (ms) and mix (0..1). The values reach
   * the graph through `setTargetAtTime`, so reading the AudioParams back returns
   * the *previous* value — callers need the requested one.
   */
  private _rate = 1.2;
  private _depthMs = 5;
  private _mix = 0.4;

  /** Base delay in seconds — a sample count, so it follows the context rate. */
  private readonly baseDelaySeconds: number;

  constructor(private readonly ctx: AudioContext) {
    this.baseDelaySeconds = Chorus.BASE_DELAY_SAMPLES / ctx.sampleRate;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    const maxDelaySeconds =
      this.baseDelaySeconds +
      Chorus.MAX_DEPTH_MS / 1000 +
      Chorus.HEADROOM_SECONDS;
    this.delayLeft = ctx.createDelay(maxDelaySeconds);
    this.delayRight = ctx.createDelay(maxDelaySeconds);
    this.depthLeft = ctx.createGain();
    this.depthRight = ctx.createGain();
    this.lfoLeft = ctx.createOscillator();
    this.lfoRight = ctx.createOscillator();

    // Dry path — always present, scaled by (1 - mix).
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path — one modulated delay line per channel, re-merged to stereo.
    this.input.connect(this.splitter);
    this.splitter.connect(this.delayLeft, 0);
    this.splitter.connect(this.delayRight, 1);
    this.delayLeft.connect(this.merger, 0, 0);
    this.delayRight.connect(this.merger, 0, 1);
    this.merger.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.lfoLeft.type = "sine";
    this.lfoRight.type = "sine";
    this.lfoLeft.connect(this.depthLeft);
    this.lfoRight.connect(this.depthRight);
    this.depthLeft.connect(this.delayLeft.delayTime);
    this.depthRight.connect(this.delayRight.delayTime);

    this.setRate(this._rate);
    this.setDepthMs(this._depthMs);
    this.setMix(this._mix);

    this.lfoLeft.start();
    // Quarter period late => the channels are 90 degrees out of phase, which is
    // what turns a comb filter into width. Offset from the initial rate; later
    // rate changes move both LFOs together and keep the relationship.
    this.lfoRight.start(this.ctx.currentTime + 1 / (4 * this._rate));
  }

  /** LFO speed in Hz. */
  get rate(): number {
    return this._rate;
  }

  /** Peak-to-peak swing of the delay time in ms. */
  get depthMs(): number {
    return this._depthMs;
  }

  /** Wet amount, 0 = dry only, 1 = delayed only. */
  get mix(): number {
    return this._mix;
  }

  setRate(hz: number): void {
    this._rate = Chorus.clamp(hz, Chorus.MIN_RATE_HZ, Chorus.MAX_RATE_HZ);
    const now = this.ctx.currentTime;
    this.lfoLeft.frequency.setTargetAtTime(this._rate, now, 0.01);
    this.lfoRight.frequency.setTargetAtTime(this._rate, now, 0.01);
  }

  setDepthMs(ms: number): void {
    this._depthMs = Chorus.clamp(ms, 0, Chorus.MAX_DEPTH_MS);
    // The Python engine's LFO is unipolar, so its sweep is base..base+depth.
    // A bipolar sine reproduces that by centring the delay on the midpoint and
    // swinging +/- half the depth — centring on the base instead would drive
    // `delayTime` negative for the bottom half of every cycle, where Web Audio
    // clamps it to 0 and flattens the sweep into a hold.
    const halfDepthSeconds = this._depthMs / 1000 / 2;
    const centre = this.baseDelaySeconds + halfDepthSeconds;
    const now = this.ctx.currentTime;
    this.depthLeft.gain.setTargetAtTime(halfDepthSeconds, now, 0.01);
    this.depthRight.gain.setTargetAtTime(halfDepthSeconds, now, 0.01);
    this.delayLeft.delayTime.setTargetAtTime(centre, now, 0.01);
    this.delayRight.delayTime.setTargetAtTime(centre, now, 0.01);
  }

  setMix(mix: number): void {
    this._mix = Chorus.clamp(mix, 0, 1);
    const now = this.ctx.currentTime;
    this.dryGain.gain.setTargetAtTime(1 - this._mix, now, 0.01);
    this.wetGain.gain.setTargetAtTime(this._mix, now, 0.01);
  }

  disconnect(): void {
    for (const lfo of [this.lfoLeft, this.lfoRight]) {
      try {
        lfo.stop();
      } catch {
        // Already stopped, or never started — nothing to unwind.
      }
      lfo.disconnect();
    }
    this.output.disconnect();
  }

  private static clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }
}
