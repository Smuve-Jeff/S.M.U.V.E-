export class SidechainCompressor {
  readonly input: GainNode;
  readonly sidechainInput: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly output: GainNode;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.sidechainInput = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.output = this.context.createGain();

    // Simplified sidechain simulation for Web Audio API
    // Real sidechaining usually involves using a GainNode controlled by an
    // AnalyserNode or an AudioWorklet, but DynamicsCompressorNode can be
    // configured to respond to a sidechain signal by connecting the sidechain
    // to its 'reduction' or using a dedicated sidechaining circuit.
    // For now, we provide the inputs and structure.

    this.input.connect(this.compressor);
    this.compressor.connect(this.output);

    this.compressor.threshold.value = -30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
  }

  setThreshold(threshold: number) {
    this.compressor.threshold.setTargetAtTime(
      threshold,
      this.context.currentTime,
      0.01
    );
  }

  setRatio(ratio: number) {
    this.compressor.ratio.setTargetAtTime(
      ratio,
      this.context.currentTime,
      0.01
    );
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }
}
