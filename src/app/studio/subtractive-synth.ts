import { Instrument } from './instrument';
import { ADSREnvelope } from './adsr-envelope';

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export class SubtractiveSynth extends Instrument {
  private readonly envelope = new ADSREnvelope(
    this.audioContext,
    0.01,
    0.2,
    0.8,
    0.5
  );
  private voices: Map<number, Voice> = new Map();
  private filter: BiquadFilterNode;
  private oscillatorType: OscillatorType = 'sawtooth';

  constructor(audioContext: AudioContext) {
    super(audioContext);
    this.filter = this.audioContext.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.connect(this.output);
  }

  play(note: number, velocity: number): void {
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = this.oscillatorType;
    oscillator.frequency.value = 440 * Math.pow(2, (note - 69) / 12);

    const gain = this.audioContext.createGain();
    this.envelope.apply(gain, velocity);

    oscillator.connect(gain);
    gain.connect(this.filter);

    oscillator.start();
    this.voices.set(note, { oscillator, gain });
  }

  stop(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      this.envelope.releaseEnvelope(voice.gain);
      voice.oscillator.stop(this.audioContext.currentTime + 0.5);
      this.voices.delete(note);
    }
  }

  setFilterCutoff(cutoff: number): void {
    this.filter.frequency.value = cutoff;
  }

  setOscillatorType(type: OscillatorType): void {
    this.oscillatorType = type;
  }
}
