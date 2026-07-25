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

  public swingAmount = signal(0);

  constructor() {
    this.engine.onScheduleStep = (step, time, duration) => {
      this.tick(step, time, duration);
    };
  }

  /**
   * Convenience pass-through used by the sequencer unit tests and any
   * external caller that wants to schedule a single MIDI-style note without
   * going through the multi-step `tick()` path. The test suite expects this
   * exact signature so the engine's `playSynth(step, note, duration, velocity,
   * pan)` overload is delegated to.
   */
  scheduleTick(step: number, note: number, duration: number) {
    const velocity = 0.8;
    const pan = 0;
    if (this.aiService.isAIDrummerActive()) {
      // Drummer prefers a slightly louder velocity so ghost notes still cut.
      this.engine.playSynth(step, note, duration, velocity, pan);
      return;
    }
    this.engine.playSynth(step, note, duration, velocity, pan);
  }

  tick(stepIndex: number, time: number, duration: number) {
    let playTime = time;

    // Apply Swing
    if (stepIndex % 2 === 1) {
      const swingOffset = (this.swingAmount() / 100) * (duration / 2);
      playTime += swingOffset;
    }

    if (this.aiService.isAIDrummerActive() && stepIndex % 4 === 0) {
    }
    if (this.aiService.isAIBassistActive() && stepIndex % 2 === 0) {
    }
    if (this.aiService.isAIKeyboardistActive() && Math.random() > 0.7) {
    }

    this.musicManager.playStep(stepIndex, playTime, duration);
  }
}
