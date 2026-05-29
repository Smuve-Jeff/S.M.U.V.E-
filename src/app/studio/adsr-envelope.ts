import * as Tone from 'tone';

export class AdsrEnvelope {
  constructor(private context: BaseAudioContext) {}

  applyToParam(param: AudioParam, time: number, attack: number, decay: number, sustain: number, release: number, velocity: number) {
    param.cancelScheduledValues(time);
    param.setValueAtTime(0, time);
    // Attack
    param.linearRampToValueAtTime(velocity, time + attack);
    // Decay to Sustain
    param.exponentialRampToValueAtTime(Math.max(0.0001, sustain * velocity), time + attack + decay);
  }

  triggerRelease(param: AudioParam, time: number, release: number) {
    const val = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(val, time);
    param.exponentialRampToValueAtTime(0.0001, time + release);
  }
}
