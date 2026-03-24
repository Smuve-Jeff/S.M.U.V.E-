export class Equalizer {
  private readonly filters: BiquadFilterNode[] = [];
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
    });

    lastNode.connect(this.output);
  }

  setGain(bandIndex: number, gain: number) {
    if (this.filters[bandIndex]) {
      this.filters[bandIndex].gain.setTargetAtTime(
        gain,
        this.context.currentTime,
        0.01
      );
    }
  }

  getBands() {
    return this.filters.map((f) => ({
      frequency: f.frequency.value,
      gain: f.gain.value,
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
