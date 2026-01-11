export class Reverb {
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly _input: GainNode;

  constructor(private readonly audioContext: AudioContext) {
    this.convolver = this.audioContext.createConvolver();
    this.wetGain = this.audioContext.createGain();
    this.dryGain = this.audioContext.createGain();
    this._input = this.audioContext.createGain();

    this.wetGain.gain.value = 0.5;
    this.dryGain.gain.value = 0.5;

    this._input.connect(this.dryGain);
    this._input.connect(this.convolver);
    this.convolver.connect(this.wetGain);

    this.generateImpulseResponse();
  }

  connect(node: AudioNode): void {
    this.wetGain.connect(node);
    this.dryGain.connect(node);
  }

  get input(): AudioNode {
    return this._input;
  }

  setMix(value: number) {
    this.wetGain.gain.value = value;
    this.dryGain.gain.value = 1 - value;
  }

  private generateImpulseResponse() {
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * 2;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }

    this.convolver.buffer = impulse;
  }
}
