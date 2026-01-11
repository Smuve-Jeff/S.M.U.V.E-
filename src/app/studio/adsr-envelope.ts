export class ADSREnvelope {
  constructor(
    private readonly audioContext: AudioContext,
    private readonly attack: number,
    private readonly decay: number,
    private readonly sustain: number,
    private readonly release: number
  ) {}

  apply(gainNode: GainNode, velocity: number): void {
    const now = this.audioContext.currentTime;
    const maxGain = velocity / 127;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(maxGain, now + this.attack);
    gainNode.gain.linearRampToValueAtTime(
      this.sustain * maxGain,
      now + this.attack + this.decay
    );
  }

  releaseEnvelope(gainNode: GainNode): void {
    const now = this.audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + this.release);
  }
}
