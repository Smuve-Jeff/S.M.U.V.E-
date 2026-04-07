import { Instrument } from './instrument';
import { ADSREnvelope } from './adsr-envelope';

interface Voice {
  oscillators: OscillatorNode[];
  subOscillator: OscillatorNode | null;
  gain: GainNode;
  filter: BiquadFilterNode;
  filterGain: GainNode;
}

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export class SubtractiveSynth extends Instrument {
  private readonly envelope = new ADSREnvelope(
    this.audioContext,
    0.01,
    0.2,
    0.8,
    0.5,
    true // Use exponential curves
  );
  private readonly filterEnvelope = new ADSREnvelope(
    this.audioContext,
    0.05,
    0.3,
    0.5,
    0.3,
    true
  );
  private voices: Map<number, Voice> = new Map();
  private masterFilter: BiquadFilterNode;
  private oscillatorType: OscillatorType = 'sawtooth';
  private numOscillators: number = 2; // Unison voices
  private detune: number = 10; // Detune amount in cents
  private subOscillatorLevel: number = 0.3; // Sub oscillator mix
  private filterCutoff: number = 2000;
  private filterEnvelopeAmount: number = 3000; // How much envelope affects filter

  constructor(audioContext: AudioContext) {
    super(audioContext);
    this.masterFilter = this.audioContext.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = this.filterCutoff;
    this.masterFilter.Q.value = 1.0;
    this.masterFilter.connect(this.output);
  }

  play(note: number, velocity: number): void {
    const frequency = 440 * Math.pow(2, (note - 69) / 12);
    const oscillators: OscillatorNode[] = [];

    // Create multiple detuned oscillators for richer sound
    for (let i = 0; i < this.numOscillators; i++) {
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = this.oscillatorType;
      oscillator.frequency.value = frequency;

      // Spread detune symmetrically around center
      const detuneOffset =
        this.numOscillators > 1
          ? (i - (this.numOscillators - 1) / 2) * this.detune
          : 0;
      oscillator.detune.value = detuneOffset;

      oscillators.push(oscillator);
    }

    // Create sub-oscillator (one octave below)
    let subOscillator: OscillatorNode | null = null;
    if (this.subOscillatorLevel > 0) {
      subOscillator = this.audioContext.createOscillator();
      subOscillator.type = 'sine'; // Sub is always sine for warmth
      subOscillator.frequency.value = frequency / 2;
    }

    // Create per-voice filter for envelope modulation
    const voiceFilter = this.audioContext.createBiquadFilter();
    voiceFilter.type = 'lowpass';
    voiceFilter.frequency.value = this.filterCutoff;
    voiceFilter.Q.value = 1.0;

    const filterGain = this.audioContext.createGain();
    filterGain.gain.value = 1.0;

    const gain = this.audioContext.createGain();
    gain.gain.value =
      1.0 /
      (this.numOscillators + (subOscillator ? this.subOscillatorLevel : 0));

    // Apply amplitude envelope
    this.envelope.apply(gain, velocity);

    // Apply filter envelope
    const filterMin = this.filterCutoff;
    const filterMax = Math.min(
      this.filterCutoff + this.filterEnvelopeAmount,
      20000
    );
    this.filterEnvelope.applyToParam(
      voiceFilter.frequency,
      velocity,
      filterMin,
      filterMax
    );

    // Connect oscillators
    oscillators.forEach((osc) => {
      osc.connect(gain);
      osc.start();
    });

    // Connect sub-oscillator with level control
    if (subOscillator) {
      const subGain = this.audioContext.createGain();
      subGain.gain.value = this.subOscillatorLevel;
      subOscillator.connect(subGain);
      subGain.connect(gain);
      subOscillator.start();
    }

    // Signal chain: gain -> voice filter -> filter gain -> master filter
    gain.connect(voiceFilter);
    voiceFilter.connect(filterGain);
    filterGain.connect(this.masterFilter);

    this.voices.set(note, {
      oscillators,
      subOscillator,
      gain,
      filter: voiceFilter,
      filterGain,
    });
  }

  stop(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      this.envelope.releaseEnvelope(voice.gain);
      this.filterEnvelope.releaseParam(
        voice.filter.frequency,
        this.filterCutoff
      );

      const stopTime = this.audioContext.currentTime + 0.5;
      voice.oscillators.forEach((osc) => osc.stop(stopTime));
      if (voice.subOscillator) {
        voice.subOscillator.stop(stopTime);
      }
      this.voices.delete(note);
    }
  }

  setFilterCutoff(cutoff: number): void {
    this.filterCutoff = Math.max(20, Math.min(cutoff, 20000));
    this.masterFilter.frequency.value = this.filterCutoff;
  }

  setFilterResonance(q: number): void {
    this.masterFilter.Q.value = Math.max(0.1, Math.min(q, 30));
  }

  setFilterEnvelopeAmount(amount: number): void {
    this.filterEnvelopeAmount = Math.max(0, Math.min(amount, 10000));
  }

  setOscillatorType(type: OscillatorType): void {
    this.oscillatorType = type;
  }

  setDetune(cents: number): void {
    this.detune = Math.max(0, Math.min(cents, 50));
  }

  setSubOscillatorLevel(level: number): void {
    this.subOscillatorLevel = Math.max(0, Math.min(level, 1));
  }

  setNumOscillators(num: number): void {
    this.numOscillators = Math.max(1, Math.min(num, 4));
  }
}
