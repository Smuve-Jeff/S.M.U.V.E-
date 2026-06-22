import { Instrument } from './instrument';
import { NodePool } from './performance-utils';
import { SamplerEngine } from './sampler-engine';
import { SampleMap } from '../services/file-loader.service';

type SupportedFilterType =
  | 'allpass'
  | 'bandpass'
  | 'highpass'
  | 'highshelf'
  | 'lowpass'
  | 'lowshelf'
  | 'notch'
  | 'peaking';

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'sample';

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

  filterType: SupportedFilterType;
  filterCutoff: number;
  filterResonance: number;

  attack: number;
  decay: number;
  sustain: number;
  release: number;

  sampleMap?: SampleMap;
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
  private samplerEngine?: SamplerEngine;

  private oscPool: NodePool<OscillatorNode>;
  private gainPool: NodePool<GainNode>;
  private filterPool: NodePool<BiquadFilterNode>;

  constructor(audioContext: AudioContext, samplerEngine?: SamplerEngine) {
    super(audioContext, 8); // Slightly lower polyphony for advanced synth on mobile
    this.samplerEngine = samplerEngine;
    this.oscPool = new NodePool(this.audioContext, (ctx) => ctx.createOscillator());
    this.gainPool = new NodePool(this.audioContext, (ctx) => ctx.createGain());
    this.filterPool = new NodePool(this.audioContext, (ctx) => ctx.createBiquadFilter());
  }

  setParams(params: Partial<SynthParams>) {
    this.params = { ...this.params, ...params };
  }

  play(note: number, velocity: number): void {
    const now = this.audioContext.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);

    // Filter
    const filter = this.filterPool.get();
    filter.type = this.params.filterType;
    filter.frequency.setValueAtTime(this.params.filterCutoff, now);
    filter.Q.setValueAtTime(this.params.filterResonance, now);

    // LFO
    const lfo = this.oscPool.get();
    lfo.type = this.params.lfoType as OscillatorType !== 'sample' ? this.params.lfoType as any : 'sine';
    lfo.frequency.setValueAtTime(this.params.lfoRate, now);

    const lfoGain = this.gainPool.get();
    lfoGain.gain.setValueAtTime(this.params.lfoAmount, now);

    lfo.connect(lfoGain);

    if (this.params.lfoTarget === 'cutoff') {
      lfoGain.connect(filter.frequency);
    }

    // Envelope
    const ampGain = this.gainPool.get();
    ampGain.gain.setValueAtTime(0, now);
    ampGain.gain.linearRampToValueAtTime(1, now + this.params.attack);
    ampGain.gain.linearRampToValueAtTime(
      this.params.sustain,
      now + this.params.attack + this.params.decay
    );

    const osc1Gain = this.gainPool.get();
    osc1Gain.gain.setValueAtTime(this.params.osc1Mix * (velocity / 127), now);

    const osc2Gain = this.gainPool.get();
    osc2Gain.gain.setValueAtTime(this.params.osc2Mix * (velocity / 127), now);

    let sampleStop1: (() => void) | undefined;
    let sampleStop2: (() => void) | undefined;

    // Osc 1
    if (this.params.osc1Type === 'sample' && this.samplerEngine && this.params.sampleMap) {
      sampleStop1 = this.samplerEngine.playNote(this.params.sampleMap, note, velocity, osc1Gain);
    } else if (this.params.osc1Type !== 'sample') {
      const osc1 = this.oscPool.get();
      osc1.type = this.params.osc1Type as any;
      osc1.frequency.setValueAtTime(freq * Math.pow(2, this.params.osc1Octave), now);
      osc1.detune.setValueAtTime(this.params.osc1Detune, now);
      osc1.connect(osc1Gain);
      osc1.start();
      sampleStop1 = () => { try { osc1.stop(); } catch(e) {} this.oscPool.release(osc1); };
    }

    // Osc 2
    if (this.params.osc2Type === 'sample' && this.samplerEngine && this.params.sampleMap) {
      sampleStop2 = this.samplerEngine.playNote(this.params.sampleMap, note, velocity, osc2Gain);
    } else if (this.params.osc2Type !== 'sample') {
      const osc2 = this.oscPool.get();
      osc2.type = this.params.osc2Type as any;
      osc2.frequency.setValueAtTime(freq * Math.pow(2, this.params.osc2Octave), now);
      osc2.detune.setValueAtTime(this.params.osc2Detune, now);
      osc2.connect(osc2Gain);
      osc2.start();
      sampleStop2 = () => { try { osc2.stop(); } catch(e) {} this.oscPool.release(osc2); };
    }

    if (this.params.lfoTarget === 'volume') {
      const lfoAmpGain = this.gainPool.get();
      lfoAmpGain.gain.setValueAtTime(0, now);
      lfoGain.connect(lfoAmpGain.gain);
      ampGain.connect(lfoAmpGain).connect(filter);
    } else {
      ampGain.connect(filter);
    }

    osc1Gain.connect(ampGain);
    osc2Gain.connect(ampGain);
    filter.connect(this.output);

    lfo.start();

    const voice = { lfo, ampGain, filter, lfoGain, osc1Gain, osc2Gain, sampleStop1, sampleStop2 };
    this.voiceManager.addVoice({
      note,
      startTime: now,
      stop: () => this.executeStop(voice)
    });

    this.voices.set(note, voice);
  }

  stop(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      const now = this.audioContext.currentTime;
      voice.ampGain.gain.cancelScheduledValues(now);
      voice.ampGain.gain.setValueAtTime(voice.ampGain.gain.value, now);
      voice.ampGain.gain.exponentialRampToValueAtTime(0.001, now + this.params.release);

      setTimeout(() => {
        this.executeStop(voice);
        this.voices.delete(note);
        this.voiceManager.removeVoice(note);
      }, this.params.release * 1000 + 100);
    }
  }

  private executeStop(voice: any) {
    if (voice.sampleStop1) voice.sampleStop1();
    if (voice.sampleStop2) voice.sampleStop2();
    try { voice.lfo.stop(); } catch(e) {}
    this.oscPool.release(voice.lfo);
    this.gainPool.release(voice.ampGain);
    this.filterPool.release(voice.filter);
    this.gainPool.release(voice.lfoGain);
    this.gainPool.release(voice.osc1Gain);
    this.gainPool.release(voice.osc2Gain);
  }
}
