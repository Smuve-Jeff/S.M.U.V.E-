import { LoggingService } from '../services/logging.service';
import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';

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
}

@Injectable({
  providedIn: 'root',
})
export class InstrumentService {
  private logger = inject(LoggingService);
  private engine = inject(AudioEngineService);

  constructor() {}

  getAudioContext(): AudioContext {
    return this.engine.getContext();
  }

  getCompressor(): DynamicsCompressorNode {
    return this.engine.compressor;
  }

  setMasterVolume(volume: number) {
    this.engine.setMasterOutputLevel(volume / 100);
  }

  setReverbMix(mix: number) {
    const reverbWet = this.engine.reverbWet;
    if (reverbWet) {
      reverbWet.gain.setTargetAtTime(
        mix,
        this.engine.getContext().currentTime,
        0.01
      );
    }
  }

  play(time: number, midi: number, velocity: number) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    this.engine.playSynth(
      this.engine.getContext().currentTime + time,
      freq,
      0.5,
      velocity
    );
  }

  connect(destination: AudioNode) {
    // Compatibility method
    this.logger.info('InstrumentService: connect requested');
  }
}
