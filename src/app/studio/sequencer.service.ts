import { Injectable, inject, signal } from '@angular/core';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService } from '../services/ai.service';

@Injectable({
  providedIn: 'root',
})
export class SequencerService {
  private musicManager = inject(MusicManagerService);
  private engine = inject(AudioEngineService);
  private aiService = inject(AiService);

  constructor() {
    this.engine.onScheduleStep = (step, time, duration) => {
      this.tick(step, time, duration);
    };
  }

  tick(stepIndex: number, time: number, duration: number) {
    if (this.aiService.isAIDrummerActive() && stepIndex % 4 === 0) {
    }
    if (this.aiService.isAIBassistActive() && stepIndex % 2 === 0) {
    }
    if (this.aiService.isAIKeyboardistActive() && Math.random() > 0.7) {
    }

    this.musicManager.playStep(stepIndex, time, duration);
  }
}
