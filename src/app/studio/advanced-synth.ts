import { Instrument } from './instrument';

export interface SynthParams {
  osc1Type: OscillatorType;
  osc1Octave: number;
  osc1Detune: number;
  osc1Mix: number;

  osc2Type: OscillatorType;
  osc2Octave: number;
  osc2Detune: number;
  osc2Mix: number;

  lfoType: OscillatorType;
  lfoRate: number;
  lfoAmount: number;
  lfoTarget: 'cutoff' | 'pitch' | 'volume';

  filterType: BiquadFilterType;
  filterCutoff: number;
  filterResonance: number;

  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export class AdvancedSynth extends Instrument {
  private params: SynthParams = {
    osc1Type: 'sawtooth',
    osc1Octave: 0,
    osc1Detune: 0,
    osc1Mix: 0.5,
    osc2Type: 'square',
    osc2Octave: -1,
    osc2Detune: 5,
    osc2Mix: 0.3,
    lfoType: 'sine',
    lfoRate: 5,
    lfoAmount: 500,
    lfoTarget: 'cutoff',
    filterType: 'lowpass',
    filterCutoff: 2000,
    filterResonance: 1,
    attack: 0.1,
    decay: 0.2,
    sustain: 0.6,
    release: 0.5,
  };

  private voices: Map<number, any> = new Map();

  constructor(audioContext: AudioContext) {
    super(audioContext);
  }

  setParams(params: Partial<SynthParams>) {
    this.params = { ...this.params, ...params };
  }

  play(note: number, velocity: number): void {
    const now = this.audioContext.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);

    // Filter
    const filter = this.audioContext.createBiquadFilter();
    filter.type = this.params.filterType;
    filter.frequency.setValueAtTime(this.params.filterCutoff, now);
    filter.Q.setValueAtTime(this.params.filterResonance, now);

    // LFO
    const lfo = this.audioContext.createOscillator();
    lfo.type = this.params.lfoType;
    lfo.frequency.setValueAtTime(this.params.lfoRate, now);

    const lfoGain = this.audioContext.createGain();
    lfoGain.gain.setValueAtTime(this.params.lfoAmount, now);

    lfo.connect(lfoGain);

    if (this.params.lfoTarget === 'cutoff') {
      lfoGain.connect(filter.frequency);
    }

    // Oscillators
    const osc1 = this.audioContext.createOscillator();
    osc1.type = this.params.osc1Type;
    osc1.frequency.setValueAtTime(
      freq * Math.pow(2, this.params.osc1Octave),
      now
    );
    osc1.detune.setValueAtTime(this.params.osc1Detune, now);

    const osc1Gain = this.audioContext.createGain();
    osc1Gain.gain.setValueAtTime(this.params.osc1Mix * (velocity / 127), now);

    const osc2 = this.audioContext.createOscillator();
    osc2.type = this.params.osc2Type;
    osc2.frequency.setValueAtTime(
      freq * Math.pow(2, this.params.osc2Octave),
      now
    );
    osc2.detune.setValueAtTime(this.params.osc2Detune, now);

    const osc2Gain = this.audioContext.createGain();
    osc2Gain.gain.setValueAtTime(this.params.osc2Mix * (velocity / 127), now);

    // Envelope
    const ampGain = this.audioContext.createGain();
    ampGain.gain.setValueAtTime(0, now);
    ampGain.gain.linearRampToValueAtTime(1, now + this.params.attack);
    ampGain.gain.linearRampToValueAtTime(
      this.params.sustain,
      now + this.params.attack + this.params.decay
    );

    if (this.params.lfoTarget === 'volume') {
      const lfoAmpGain = this.audioContext.createGain();
      lfoAmpGain.gain.setValueAtTime(0, now);
      lfoGain.connect(lfoAmpGain.gain);
      ampGain.connect(lfoAmpGain).connect(filter);
    } else {
      ampGain.connect(filter);
    }

    osc1.connect(osc1Gain).connect(ampGain);
    osc2.connect(osc2Gain).connect(ampGain);

    filter.connect(this.output);

    lfo.start();
    osc1.start();
    osc2.start();

    this.voices.set(note, { osc1, osc2, lfo, ampGain, filter, lfoGain });
  }

  stop(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      const now = this.audioContext.currentTime;
      voice.ampGain.gain.cancelScheduledValues(now);
      voice.ampGain.gain.setValueAtTime(voice.ampGain.gain.value, now);
      voice.ampGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + this.params.release
      );

      voice.osc1.stop(now + this.params.release + 0.1);
      voice.osc2.stop(now + this.params.release + 0.1);
      voice.lfo.stop(now + this.params.release + 0.1);

      this.voices.delete(note);
    }
  }
}
