import { Injectable } from '@angular/core';

export interface Clip {
  id: number;
  name: string;
  instrument: 'synth' | 'sampler';
  synthParams?: {
    oscillator: string;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  // Add other clip-related properties here
}

@Injectable({
  providedIn: 'root'
})
export class InstrumentService {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private reverb: ConvolverNode;
  private compressor: DynamicsCompressorNode;
  private reverbMix: GainNode;

  constructor() {
    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.8; // Default volume

    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.connect(this.masterGain);

    this.reverb = this.audioContext.createConvolver();
    // TODO: Load an impulse response for the reverb
    this.reverbMix = this.audioContext.createGain();
    this.reverbMix.gain.value = 0; // Default dry
    this.reverb.connect(this.reverbMix);
    this.reverbMix.connect(this.compressor);
  }

  getAudioContext(): AudioContext {
    return this.audioContext;
  }

  connect(destination: AudioNode) {
    this.masterGain.connect(destination);
  }

  getCompressor(): DynamicsCompressorNode {
      return this.compressor;
  }

  setMasterVolume(volume: number) {
    this.masterGain.gain.setValueAtTime(volume / 100, this.audioContext.currentTime);
  }

  setReverbMix(mix: number) {
    this.reverbMix.gain.setValueAtTime(mix, this.audioContext.currentTime);
  }

  play(time: number, midi: number, velocity: number) {
    // A simple synth for demonstration
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    gain.gain.setValueAtTime(velocity, this.audioContext.currentTime + time);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + time + 0.5);


    osc.connect(gain);
    gain.connect(this.compressor); // Connect to compressor for dry signal
    gain.connect(this.reverb); // Connect to reverb for wet signal

    osc.start(this.audioContext.currentTime + time);
    osc.stop(this.audioContext.currentTime + time + 0.5);
  }
}
