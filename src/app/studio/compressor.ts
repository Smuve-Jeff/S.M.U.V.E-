export class Compressor {
  readonly input: GainNode;
  readonly compressor: DynamicsCompressorNode;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();

    // Default compressor settings
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.input.connect(this.compressor);
  }

  connect(destination: AudioNode): void {
    this.compressor.connect(destination);
  }

  disconnect(): void {
    this.compressor.disconnect();
  }

  // Methods to adjust compressor settings (optional)
  setThreshold(value: number): void {
    this.compressor.threshold.value = value;
  }

  setRatio(value: number): void {
    this.compressor.ratio.value = value;
  }
}
