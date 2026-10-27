export class Equalizer {
  private readonly filters: BiquadFilterNode[] = [];

  /**
   * Band centers, matching the rack's knob labels (Sub 40, Low 120, Mid 800,
   * High 4k, Air 12k). The two shelving ends are named by frequency; the five
   * middle bands are peaking, so a slot's `sub/low/mid/high/air` knobs move the
   * frequency the artist reads rather than a nearby approximation.
   */
  static readonly FREQUENCIES = [40, 120, 350, 800, 3500, 4000, 12000] as const;

  /**
   * Tracked band gains in dB. `setGain` ramps through `setTargetAtTime`, so
   * `filter.gain.value` reads the *previous* value (and never settles during an
   * offline bounce). The plugin layer, the worklet sync and the snapshot all
   * need the dialled value, so keep it here.
   */
  private readonly _gains: number[] = [];

  /** Tracked Q for the peaking bands (the shelves keep a gentle 0.7). */
  private _q = 1;

  readonly input: GainNode;
  readonly output: GainNode;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.output = this.context.createGain();

    const frequencies = Equalizer.FREQUENCIES;
    let lastNode: AudioNode = this.input;

    frequencies.forEach((freq, i) => {
      const filter = this.context.createBiquadFilter();
      const isFirst = i === 0;
      const isLast = i === frequencies.length - 1;
      if (isFirst) {
        filter.type = "lowshelf";
      } else if (isLast) {
        filter.type = "highshelf";
      } else {
        filter.type = "peaking";
      }
      filter.frequency.value = freq;
      filter.Q.value = isFirst || isLast ? 0.7 : this._q;
      filter.gain.value = 0;

      lastNode.connect(filter);
      lastNode = filter;
      this.filters.push(filter);
      this._gains.push(0);
    });

    lastNode.connect(this.output);
  }

  setGain(bandIndex: number, gain: number) {
    if (this.filters[bandIndex]) {
      this._gains[bandIndex] = gain;
      this.filters[bandIndex].gain.setTargetAtTime(
        gain,
        this.context.currentTime,
        0.01,
      );
    }
  }

  /** Current gain (dB) of a band, or null when the index is out of range. */
  getGain(bandIndex: number): number | null {
    return this._gains[bandIndex] ?? null;
  }

  /**
   * Q of the peaking bands. The shelves keep their gentle slope — widening a
   * low shelf that way turns it into a second mid band, which is not what the
   * rack's Q knob means.
   */
  setQ(q: number): void {
    const clamped = Math.max(0.2, Math.min(8, Number.isFinite(q) ? q : 1));
    this._q = clamped;
    this.filters.forEach((filter, index) => {
      if (index === 0 || index === this.filters.length - 1) return;
      filter.Q.setTargetAtTime(clamped, this.context.currentTime, 0.01);
    });
  }

  getQ(): number {
    return this._q;
  }

  getBands() {
    return this.filters.map((f, i) => ({
      frequency: f.frequency.value,
      gain: this._gains[i] ?? 0,
      type: f.type,
    }));
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }
}
