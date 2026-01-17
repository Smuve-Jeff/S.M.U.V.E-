import { Injectable, OnDestroy } from '@angular/core';
import { Instrument } from './instrument';
import { SubtractiveSynth, OscillatorType } from './subtractive-synth';
import { Compressor } from './compressor';
import { Reverb } from './reverb';

@Injectable({
  providedIn: 'root',
})
export class InstrumentService implements OnDestroy {
  private readonly audioContext = new AudioContext();
  private readonly instruments: Instrument[] = [];
  private readonly masterVCA: GainNode;
  private readonly compressor: Compressor;
  private readonly reverb: Reverb;

  constructor() {
    this.masterVCA = this.audioContext.createGain();
    this.compressor = new Compressor(this.audioContext);
    this.reverb = new Reverb(this.audioContext);

    // For now, we'll create a single instance of the SubtractiveSynth
    const synth = new SubtractiveSynth(this.audioContext);
    this.instruments.push(synth);

    // Connect the synth to the effects chain
    synth.connect(this.compressor.input);
    this.compressor.connect(this.reverb.input);
    this.reverb.connect(this.masterVCA);
  }

  getAudioContext(): AudioContext {
    return this.audioContext;
  }

  getCompressor(): DynamicsCompressorNode {
    return this.compressor.compressor;
  }

  setReverbMix(mix: number): void {
    this.reverb.setMix(mix);
  }

  setMasterVolume(volume: number): void {
    this.masterVCA.gain.setTargetAtTime(
      volume / 100,
      this.audioContext.currentTime,
      0.01
    );
  }

  connect(destination: AudioNode) {
    this.masterVCA.connect(destination);
  }

  play(instrumentIndex: number, note: number, velocity: number): void {
    if (this.instruments[instrumentIndex]) {
      this.instruments[instrumentIndex].play(note, velocity);
    }
  }

  stop(instrumentIndex: number, note: number): void {
    if (this.instruments[instrumentIndex]) {
      this.instruments[instrumentIndex].stop(note);
    }
  }

  setFilterCutoff(instrumentIndex: number, cutoff: number): void {
    const instrument = this.instruments[instrumentIndex];
    if (instrument instanceof SubtractiveSynth) {
      instrument.setFilterCutoff(cutoff);
    }
  }

  setOscillatorType(instrumentIndex: number, type: OscillatorType): void {
    const instrument = this.instruments[instrumentIndex];
    if (instrument instanceof SubtractiveSynth) {
      instrument.setOscillatorType(type);
    }
  }

  ngOnDestroy(): void {
    this.audioContext.close();
  }
}
