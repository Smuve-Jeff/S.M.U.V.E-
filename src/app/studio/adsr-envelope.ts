export class AdsrEnvelope {
  constructor(
    private context: BaseAudioContext,
    public attack: number = 0.01,
    public decay: number = 0.1,
    public sustain: number = 0.5,
    public release: number = 0.5,
    private exponential: boolean = true
  ) {}

  apply(gainNode: GainNode, velocity: number) {
    const now = this.context.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(velocity, now + this.attack);
    if (this.exponential) {
       gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.sustain * velocity), now + this.attack + this.decay);
    } else {
       gainNode.gain.linearRampToValueAtTime(this.sustain * velocity, now + this.attack + this.decay);
    }
  }

  applyToParam(param: AudioParam, velocity: number, min: number, max: number) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(min, now);
    param.linearRampToValueAtTime(max * velocity, now + this.attack);
    param.exponentialRampToValueAtTime(Math.max(0.0001, min + (max - min) * this.sustain), now + this.attack + this.decay);
  }

  releaseEnvelope(gainNode: GainNode) {
    const now = this.context.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + this.release);
  }

  releaseParam(param: AudioParam, min: number) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.exponentialRampToValueAtTime(Math.max(0.0001, min), now + this.release);
  }
}

export { AdsrEnvelope as ADSREnvelope };
