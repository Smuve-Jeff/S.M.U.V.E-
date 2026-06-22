import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { SubtractiveSynth } from './subtractive-synth';
import { AdvancedSynth } from './advanced-synth';
import { DrumMachine } from './drum-machine';
import { SamplerEngine } from './sampler-engine';
import { FileLoaderService } from '../services/file-loader.service';
import { MusicManagerService } from '../services/music-manager.service';

@Injectable({ providedIn: 'root' })
export class InstrumentRegistryService {
  private engine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private samplerEngine = new SamplerEngine(this.engine.ctx, this.fileLoader);

  private instruments = new Map<string, any>();

  getInstrument(trackId: string, type: string = 'midi'): any {
    if (this.instruments.has(trackId)) {
      return this.instruments.get(trackId);
    }

    let inst: any;
    if (trackId === MusicManagerService.DRUM_TRACK_ID || type === 'drum') {
      inst = new DrumMachine(this.engine.ctx);
    } else if (type === 'advanced') {
      inst = new AdvancedSynth(this.engine.ctx, this.samplerEngine);
    } else {
      inst = new SubtractiveSynth(this.engine.ctx, this.samplerEngine);
    }

    inst.connect(this.engine.getTrackOutput(trackId));
    this.instruments.set(trackId, inst);
    return inst;
  }
}
