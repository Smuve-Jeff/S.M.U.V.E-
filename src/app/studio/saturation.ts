export class Saturation {
  readonly input: GainNode;
  readonly waveShaper: WaveShaperNode;
  readonly output: GainNode;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.waveShaper = this.context.createWaveShaper();
    this.output = this.context.createGain();

    this.input.connect(this.waveShaper);
    this.waveShaper.connect(this.output);

    this.setAmount(0.5);
  }

  setAmount(amount: number) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const k = amount * 10;
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.waveShaper.curve = curve;
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }
}
