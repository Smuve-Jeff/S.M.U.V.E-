export class Reverb {
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly _input: GainNode;
  readonly output: GainNode;

  /**
   * Tracked mix (0..1). The wet/dry gains are ramped through
   * `setTargetAtTime`, so reading `gainNode.gain.value` back immediately
   * returns the *previous* level — and in a bounce it never settles at all.
   * The plugin layer (and the worklet sync / project snapshot) needs the value
   * the artist actually dialled in, so keep the intent here.
   */
  private _mix = 0.5;

  constructor(private readonly audioContext: AudioContext) {
    this.convolver = this.audioContext.createConvolver();
    this.wetGain = this.audioContext.createGain();
    this.dryGain = this.audioContext.createGain();
    this._input = this.audioContext.createGain();
    this.output = this.audioContext.createGain();

    this.wetGain.gain.value = this._mix;
    this.dryGain.gain.value = 1 - this._mix;

    this._input.connect(this.dryGain);
    this._input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);

    this.generateImpulseResponse();
  }

  connect(node: AudioNode): void {
    this.output.connect(node);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  get input(): AudioNode {
    return this._input;
  }

  /** Current wet/dry mix (0 = fully dry, 1 = fully wet). */
  get mix(): number {
    return this._mix;
  }

  setMix(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    this._mix = clamped;
    this.wetGain.gain.value = clamped;
    this.dryGain.gain.value = 1 - clamped;
  }

  /**
   * Procedural stereo impulse response for the insert reverb. The noise comes
   * from a seeded xorshift32 rather than `Math.random` so the live graph and an
   * `OfflineAudioContext` bounce share one room instead of two subtly
   * different ones.
   */
  private generateImpulseResponse() {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * 2));
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);

    let seed = 0x9e3779b9;
    const nextNoise = () => {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0xffffffff;
    };

    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 3);
      impulseL[i] = (nextNoise() * 2 - 1) * decay;
      impulseR[i] = (nextNoise() * 2 - 1) * decay;
    }

    this.convolver.buffer = impulse;
  }
}
