export class ADSREnvelope {
  constructor(
    private readonly audioContext: AudioContext,
    private readonly attack: number,
    private readonly decay: number,
    private readonly sustain: number,
    private readonly release: number,
    private readonly useExponential: boolean = true
  ) {}

  apply(gainNode: GainNode, velocity: number): void {
    const now = this.audioContext.currentTime;
    const maxGain = velocity / 127;
    const minValue = 0.0001; // Avoid zero for exponential ramps

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(minValue, now);

    if (this.useExponential) {
      // Exponential curves sound more natural
      gainNode.gain.exponentialRampToValueAtTime(maxGain, now + this.attack);
      gainNode.gain.exponentialRampToValueAtTime(
        Math.max(this.sustain * maxGain, minValue),
        now + this.attack + this.decay
      );
    } else {
      // Linear fallback
      gainNode.gain.linearRampToValueAtTime(maxGain, now + this.attack);
      gainNode.gain.linearRampToValueAtTime(
        this.sustain * maxGain,
        now + this.attack + this.decay
      );
    }
  }

  applyToParam(
    param: AudioParam,
    velocity: number,
    min: number,
    max: number
  ): void {
    const now = this.audioContext.currentTime;
    const range = max - min;
    const targetValue = min + (range * velocity) / 127;
    const minValue = 0.0001;

    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(min, minValue), now);

    if (this.useExponential && min > 0) {
      param.exponentialRampToValueAtTime(targetValue, now + this.attack);
      param.exponentialRampToValueAtTime(
        Math.max(min + range * this.sustain, minValue),
        now + this.attack + this.decay
      );
    } else {
      param.linearRampToValueAtTime(targetValue, now + this.attack);
      param.linearRampToValueAtTime(
        min + range * this.sustain,
        now + this.attack + this.decay
      );
    }
  }

  releaseEnvelope(gainNode: GainNode): void {
    const now = this.audioContext.currentTime;
    const minValue = 0.0001;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);

    if (this.useExponential && gainNode.gain.value > minValue) {
      gainNode.gain.exponentialRampToValueAtTime(minValue, now + this.release);
    } else {
      gainNode.gain.linearRampToValueAtTime(0, now + this.release);
    }
  }

  releaseParam(param: AudioParam, targetValue: number): void {
    const now = this.audioContext.currentTime;
    const minValue = 0.0001;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);

    if (
      this.useExponential &&
      param.value > minValue &&
      targetValue > minValue
    ) {
      param.exponentialRampToValueAtTime(targetValue, now + this.release);
    } else {
      param.linearRampToValueAtTime(targetValue, now + this.release);
    }
  }
}
