import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';

export interface Clip {
  id: string;
  name: string;
  start: number;
  length: number;
  color: string;
  synthParams?: any;
}

@Injectable({ providedIn: 'root' })
export class InstrumentService {
  private engine = inject(AudioEngineService);

  getCompressor(): DynamicsCompressorNode {
    return this.engine.compressor;
  }

  setMasterVolume(volume: number) {
    this.engine.setMasterOutputLevel(volume / 100);
  }

  setReverbMix(mix: number) {
    const reverbWet = this.engine.reverbWet;
    if (reverbWet && (reverbWet as any).gain) {
      (reverbWet as any).gain.setTargetAtTime(
        mix,
        this.engine.getContext().currentTime,
        0.01
      );
    }
  }

  play(time: number, midi: number, velocity: number) {
    this.engine.playSynth(time, this.midiToFreq(midi), 1, velocity);
  }

  private midiToFreq(m: number) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  connect(dest: any) {}
}
