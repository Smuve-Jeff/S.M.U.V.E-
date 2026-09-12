export class Equalizer {
  private readonly filters: BiquadFilterNode[] = [];

  /**
   * Tracked band gains in dB. `setGain` ramps through `setTargetAtTime`, so
   * `filter.gain.value` reads the *previous* value (and never settles during an
   * offline bounce). The plugin layer, the worklet sync and the snapshot all
   * need the dialled value, so keep it here.
   */
  private readonly _gains: number[] = [];

  readonly input: GainNode;
  readonly output: GainNode;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.output = this.context.createGain();

    const frequencies = [60, 170, 350, 1000, 3500, 10000, 16000];
    let lastNode: AudioNode = this.input;

    frequencies.forEach((freq, i) => {
      const filter = this.context.createBiquadFilter();
      if (i === 0) {
        filter.type = 'lowshelf';
      } else if (i === frequencies.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
      }
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
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
        0.01
      );
    }
  }

  /** Current gain (dB) of a band, or null when the index is out of range. */
  getGain(bandIndex: number): number | null {
    return this._gains[bandIndex] ?? null;
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
