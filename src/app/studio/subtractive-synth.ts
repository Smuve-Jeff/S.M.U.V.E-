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
    true
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
  private numOscillators: number = 2;
  private detuneValue: number = 10;
  private subOscillatorLevel: number = 0.3;
  private filterCutoff: number = 2000;
  private filterEnvelopeAmount: number = 3000;

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

    for (let i = 0; i < this.numOscillators; i++) {
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = this.oscillatorType;
      oscillator.frequency.value = frequency;
      const detuneOffset =
        this.numOscillators > 1
          ? (i - (this.numOscillators - 1) / 2) * this.detuneValue
          : 0;
      if (oscillator.detune) oscillator.detune.value = detuneOffset;
      oscillators.push(oscillator);
    }

    let subOscillator: OscillatorNode | null = null;
    if (this.subOscillatorLevel > 0) {
      subOscillator = this.audioContext.createOscillator();
      subOscillator.type = 'sine';
      subOscillator.frequency.value = frequency / 2;
    }

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

    this.envelope.apply(gain, velocity);

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

    oscillators.forEach((osc) => {
      osc.connect(gain);
      osc.start();
    });

    if (subOscillator) {
      const subGain = this.audioContext.createGain();
      subGain.gain.value = this.subOscillatorLevel;
      subOscillator.connect(subGain);
      subGain.connect(gain);
      subOscillator.start();
    }

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

      const stopTime = this.audioContext.currentTime + this.envelope.release;
      voice.oscillators.forEach((osc) => osc.stop(stopTime));
      if (voice.subOscillator) {
        voice.subOscillator.stop(stopTime);
      }
      setTimeout(() => {
        voice.oscillators.forEach(osc => osc.disconnect());
        voice.gain.disconnect();
        voice.filter.disconnect();
        this.voices.delete(note);
      }, this.envelope.release * 1000 + 100);
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
    this.detuneValue = Math.max(0, Math.min(cents, 50));
  }

  setSubOscillatorLevel(level: number): void {
    this.subOscillatorLevel = Math.max(0, Math.min(level, 1));
  }

  setNumOscillators(num: number): void {
    this.numOscillators = Math.max(1, Math.min(num, 4));
  }

  setAttack(value: number): void {
    this.envelope.attack = value;
  }

  setRelease(value: number): void {
    this.envelope.release = value;
  }

  setDecay(value: number): void {
    this.envelope.decay = value;
  }

  setSustain(value: number): void {
    this.envelope.sustain = value;
  }
}
