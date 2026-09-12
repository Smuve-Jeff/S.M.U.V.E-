import { Injectable, inject, signal } from '@angular/core';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';

@Injectable({
  providedIn: 'root',
})
export class SequencerService {
  private musicManager = inject(MusicManagerService);
  private engine = inject(AudioEngineService);

  public swingAmount = signal(0);

  constructor() {
    // NOTE — deliberately NO hook here. MusicManagerService owns the engine's
    // `onScheduleStep` scheduler (it registers in ITS constructor and drives
    // playStep/currentStep). If this service auto-registered too, instantiation
    // order would decide who wins and ALL playback could silently break.
    // The hook is opt-in via activate() below so the swing band logic only runs
    // when a real consumer asks for it. The AI session musicians do NOT come
    // through here — they observe MusicManagerService.onStep(), so they work
    // whether or not this legacy scheduler is activated.
  }

  private active = false;

  /**
   * Opt in to engine step scheduling. Replaces the engine hook, so callers
   * (a real sequencer UI, once wired) must stop the previous scheduler or
   * accept that this service becomes the step driver (it calls
   * musicManager.playStep itself, mirroring the music-manager scheduler).
   * Guarded so double-activation never double-registers.
   */
  activate(): void {
    if (this.active) return;
    this.active = true;
    this.engine.onScheduleStep = (step, time, duration) => {
      this.tick(step, time, duration);
    };
  }

  /** Whether activate() has been called (for the existing unit specs). */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Convenience pass-through used by the sequencer unit tests and any
   * external caller that wants to schedule a single MIDI-style note without
   * going through the multi-step `tick()` path. The test suite expects this
   * exact signature so the engine's `playSynth(step, note, duration, velocity,
   * pan)` overload is delegated to.
   */
  scheduleTick(step: number, note: number, duration: number) {
    this.engine.playSynth(step, note, duration, 0.8, 0);
  }

  /**
   * One transport step. Swing is applied here, then MusicManager renders the
   * arrangement — which in turn notifies its step observers, so the AI session
   * musicians play on the swung grid without ever being rendered twice.
   */
  tick(stepIndex: number, time: number, duration: number) {
    let playTime = time;

    // Apply Swing
    if (stepIndex % 2 === 1) {
      const swingOffset = (this.swingAmount() / 100) * (duration / 2);
      playTime += swingOffset;
    }

    this.musicManager.playStep(stepIndex, playTime, duration);
  }
}
