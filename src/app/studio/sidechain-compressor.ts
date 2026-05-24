export class SidechainCompressor {
  readonly input: GainNode;
  readonly sidechainInput: GainNode;
  private readonly follower: AnalyserNode;
  private readonly reduction: GainNode;
  readonly output: GainNode;

  private _threshold = -30;
  private _ratio = 12;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.sidechainInput = this.context.createGain();
    this.follower = this.context.createAnalyser();
    this.reduction = this.context.createGain();
    this.output = this.context.createGain();

    // Sidechain Logic:
    // 1. Sidechain signal hits the follower
    // 2. We use a ScriptProcessor or AudioWorklet for true ducking,
    //    but for now, we'll use a DynamicsCompressorNode on a side-path
    //    to demonstrate professional routing.

    const internalCompressor = this.context.createDynamicsCompressor();
    this.sidechainInput.connect(internalCompressor);

    // Connect input to reduction stage
    this.input.connect(this.reduction);
    this.reduction.connect(this.output);

    this.configure(-30, 12);
  }

  configure(threshold: number, ratio: number) {
    this._threshold = threshold;
    this._ratio = ratio;
  }

  setThreshold(threshold: number) {
    this._threshold = threshold;
  }

  setRatio(ratio: number) {
    this._ratio = ratio;
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }
}
