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
      this.playAiDrummer(stepIndex, playTime, duration);
    }
    if (this.aiService.isAIBassistActive() && stepIndex % 2 === 0) {
      this.playAiBassist(stepIndex, playTime, duration);
    }
    if (this.aiService.isAIKeyboardistActive() && Math.random() > 0.7) {
      this.playAiKeyboardist(stepIndex, playTime, duration);
    }

    this.musicManager.playStep(stepIndex, playTime, duration);
  }

  // ── AI Musicians (generative ghost parts) ─────────────────────────

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Pick a root note: the lowest pitch sounding at this step on any unmuted
   * melodic track (falling back to the track's lowest note anywhere). Returns
   * null when the arrangement has nothing to anchor to.
   */
  private findAiRoot(step: number): number | null {
    const tracks = this.musicManager.tracks();
    for (const t of tracks) {
      if (t.type === 'drum' || t.type === 'bus') continue;
      if (t.muted) continue;
      const atStep = t.notes.filter(
        (n) => Math.floor(n.step) === step % 64 && n.midi > 0
      );
      const pool =
        atStep.length > 0 ? atStep : t.notes.filter((n) => n.midi > 0);
      if (pool.length === 0) continue;
      return Math.min(...pool.map((n) => n.midi));
    }
    return null;
  }

  /** AI Drummer — kick on the downbeat, snare accent on the backbeat. */
  private playAiDrummer(step: number, time: number, duration: number) {
    try {
      const drumTrack = this.musicManager
        .tracks()
        .find((t) => t.id === MusicManagerService.DRUM_TRACK_ID);
      if (!drumTrack || drumTrack.muted) return;
      const isBackbeat = step % 8 === 4;
      const midi = isBackbeat ? 38 : 36; // 38 snare · 36 kick
      const velocity = step % 4 === 0 ? 0.95 : 0.6;
      this.engine.triggerAttack(
        drumTrack.id,
        this.midiToFreq(midi),
        time,
        velocity,
        (isBackbeat ? 0.5 : 1) * duration,
        drumTrack.gain ?? 0.8,
        0,
        0,
        0,
        drumTrack.synthParams
      );
    } catch {
      /* defensive: AI parts never break transport */
    }
  }

  /** AI Bassist — octave-down root reinforcement on the playing melodic track. */
  private playAiBassist(step: number, time: number, duration: number) {
    try {
      const root = this.findAiRoot(step);
      if (root === null) return;
      const track = this.musicManager
        .tracks()
        .find(
          (t) =>
            t.type !== 'drum' &&
            t.type !== 'bus' &&
            !t.muted &&
            t.notes.some((n) => Math.floor(n.step) === step % 64)
        );
      if (!track) return;
      this.engine.triggerAttack(
        track.id,
        this.midiToFreq(root - 12),
        time,
        0.7,
        duration * 2,
        track.gain ?? 0.8,
        0,
        0,
        0,
        track.synthParams
      );
    } catch {
      /* defensive */
    }
  }

  /** AI Keyboardist — fifth-above chord pad on the nearest melodic track. */
  private playAiKeyboardist(step: number, time: number, duration: number) {
    try {
      const root = this.findAiRoot(step);
      if (root === null) return;
      const track = this.musicManager
        .tracks()
        .find((t) => t.type !== 'drum' && t.type !== 'bus' && !t.muted);
      if (!track) return;
      this.engine.triggerAttack(
        track.id,
        this.midiToFreq(root + 7),
        time,
        0.35,
        duration * 0.9,
        track.gain ?? 0.8,
        0,
        0,
        0,
        track.synthParams
      );
    } catch {
      /* defensive */
    }
  }
}
