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
    if (gainNode.gain.cancelScheduledValues)
      gainNode.gain.cancelScheduledValues(now);
    if (gainNode.gain.setValueAtTime) gainNode.gain.setValueAtTime(0, now);
    if (gainNode.gain.linearRampToValueAtTime)
      gainNode.gain.linearRampToValueAtTime(velocity, now + this.attack);

    if (this.exponential) {
      if (gainNode.gain.exponentialRampToValueAtTime) {
        gainNode.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, this.sustain * velocity),
          now + this.attack + this.decay
        );
      }
    } else {
      if (gainNode.gain.linearRampToValueAtTime) {
        gainNode.gain.linearRampToValueAtTime(
          this.sustain * velocity,
          now + this.attack + this.decay
        );
      }
    }
  }

  applyToParam(param: AudioParam, velocity: number, min: number, max: number) {
    const now = this.context.currentTime;
    if (param.cancelScheduledValues) param.cancelScheduledValues(now);
    if (param.setValueAtTime) param.setValueAtTime(min, now);
    if (param.linearRampToValueAtTime)
      param.linearRampToValueAtTime(max * velocity, now + this.attack);
    if (param.exponentialRampToValueAtTime) {
      param.exponentialRampToValueAtTime(
        Math.max(0.0001, min + (max - min) * this.sustain),
        now + this.attack + this.decay
      );
    }
  }

  releaseEnvelope(gainNode: GainNode) {
    const now = this.context.currentTime;
    if (gainNode.gain.cancelScheduledValues)
      gainNode.gain.cancelScheduledValues(now);
    if (gainNode.gain.setValueAtTime)
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    if (gainNode.gain.exponentialRampToValueAtTime) {
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + this.release);
    }
  }

  releaseParam(param: AudioParam, min: number) {
    const now = this.context.currentTime;
    if (param.cancelScheduledValues) param.cancelScheduledValues(now);
    if (param.setValueAtTime) param.setValueAtTime(param.value, now);
    if (param.exponentialRampToValueAtTime) {
      param.exponentialRampToValueAtTime(
        Math.max(0.0001, min),
        now + this.release
      );
    }
  }
}

export { AdsrEnvelope as ADSREnvelope };
