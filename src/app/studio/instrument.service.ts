import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';

export interface Clip {
  id: string;
  name: string;
  synthParams?: any;
}

@Injectable({
  providedIn: 'root',
})
export class InstrumentService {
  private engine = inject(AudioEngineService);

  public get compressor() {
    return this.engine.compressor;
  }

  getCompressor() {
    return this.engine.compressor;
  }

  connect(dest: AudioNode) {
    if (this.engine.masterGain) {
      this.engine.masterGain.connect(dest);
    }
  }

  play(trackId: string, midi: number, velocity: number) {
    const freq = this.midiToFreq(midi);
    this.engine.triggerAttack(
      trackId,
      freq,
      this.engine.ctx.currentTime,
      velocity,
      0.5,
      0.8,
      0,
      0,
      0,
      { type: 'sine' }
    );
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setMasterVolume(val: number) {
    this.engine.setMasterOutputLevel(val / 100);
  }

  setReverbMix(_val: number) {}
}
