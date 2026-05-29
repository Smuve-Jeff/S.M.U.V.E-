import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { MusicManagerService } from '../services/music-manager.service';

export interface Clip {
  id: string;
  name: string;
  synthParams?: any;
}

@Injectable({
  providedIn: 'root'
})
export class InstrumentService {
  private engine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);

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

  play(trackId: number, midi: number, velocity: number) {
     const freq = this.musicManager.midiToFreq(midi);
     this.engine.triggerAttack(trackId, freq, this.engine.ctx.currentTime, velocity, 0.5, 0.8, 0, 0, 0, { type: 'sine' });
  }

  setMasterVolume(val: number) { this.engine.setMasterOutputLevel(val / 100); }
  setReverbMix(val: number) {}
}
