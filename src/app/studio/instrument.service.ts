import { Injectable, OnDestroy } from '@angular/core';
import { Instrument } from './instrument';
import { SubtractiveSynth, OscillatorType } from './subtractive-synth';

@Injectable({
  providedIn: 'root',
})
export class InstrumentService implements OnDestroy {
  private readonly audioContext = new AudioContext();
  private readonly instruments: Instrument[] = [];

  constructor() {
    // For now, we'll create a single instance of the SubtractiveSynth
    this.instruments.push(new SubtractiveSynth(this.audioContext));
  }

  getAudioContext(): AudioContext {
    return this.audioContext;
  }

  connect(destination: AudioNode) {
    for (const instrument of this.instruments) {
      instrument.connect(destination);
    }
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
