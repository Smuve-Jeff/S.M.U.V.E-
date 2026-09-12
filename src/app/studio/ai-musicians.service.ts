import { Injectable, effect, inject, signal } from '@angular/core';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService } from '../services/ai.service';

export type MusicianId = 'drummer' | 'bassist' | 'keyboardist';

/** The anchor a generated part is built from: a real track and its root pitch. */
interface Anchor {
  track: any;
  root: number;
}

/**
 * Autonomous session musicians.
 *
 * The S.M.U.V.E AI roster improvises *over* the arrangement on every sequencer
 * step. It renders through `MusicManagerService.onStep()` — it never claims
 * `engine.onScheduleStep`, because whoever owns that hook owns all playback and
 * a second claimant silently kills the transport. Observers run after the human
 * parts, so a generated note can never mute or displace what the artist wrote.
 */
@Injectable({ providedIn: 'root' })
export class AiMusiciansService {
  private musicManager = inject(MusicManagerService);
  private engine = inject(AudioEngineService);
  private ai = inject(AiService);

  /** Steps that produced at least one generated note. */
  stepsRendered = signal(0);
  /** Last step that actually sounded, for the UI read-out. */
  lastRendered = signal<{ step: number; musicians: MusicianId[] } | null>(null);

  private detach: (() => void) | null = null;

  constructor() {
    // Attach exactly while at least one player is engaged. Reading the roster
    // here is what makes the AI-service toggles audible.
    effect(() => {
      const engaged =
        this.ai.aiDrummerActive() ||
        this.ai.aiBassistActive() ||
        this.ai.aiKeyboardistActive();
      if (engaged) this.attach();
      else this.detachNow();
    });
  }

  /** True while the layer is subscribed to the transport. */
  isAttached(): boolean {
    return this.detach !== null;
  }

  private attach(): void {
    if (this.detach) return;
    if (typeof this.musicManager.onStep !== 'function') return;
    this.detach = this.musicManager.onStep((step, time, duration) =>
      this.renderStep(step, time, duration)
    );
  }

  private detachNow(): void {
    // Nothing is playing any more — drop the stale step read-out so the strip
    // returns to STANDING BY instead of advertising a bar it is no longer on.
    // Cleared before the early return: a roster that never subscribed (no step
    // hook, or a render driven directly) must still be reported as idle.
    this.lastRendered.set(null);
    if (!this.detach) return;
    this.detach();
    this.detach = null;
  }

  /**
   * Render every engaged player for one step. Returns the players that actually
   * sounded, so callers (and specs) can assert on the layer directly.
   */
  renderStep(step: number, time: number, duration: number): MusicianId[] {
    const played: MusicianId[] = [];
    if (this.ai.isAIDrummerActive() && step % 4 === 0) {
      if (this.playDrummer(step, time, duration)) played.push('drummer');
    }
    if (this.ai.isAIBassistActive() && step % 2 === 0) {
      if (this.playBassist(step, time, duration)) played.push('bassist');
    }
    // Off-beat chord stabs (steps 2, 6, 10 …): a fixed, reproducible rhythm, so
    // a jam lands the same way twice instead of flickering with Math.random().
    if (this.ai.isAIKeyboardistActive() && step % 4 === 2) {
      if (this.playKeyboardist(step, time, duration)) played.push('keyboardist');
    }
    if (played.length > 0) {
      this.stepsRendered.update((n) => n + 1);
      this.lastRendered.set({ step, musicians: played });
    }
    return played;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Pick the anchor for a step: the lowest pitch sounding right now on the
   * first unmuted melodic track (falling back to that track's lowest note
   * anywhere, so a pad or bass still has something to follow between onsets).
   * Returns null when the arrangement has nothing to anchor to.
   */
  private resolveAnchor(step: number): Anchor | null {
    for (const t of this.musicManager.tracks()) {
      if (t.type === 'drum' || t.type === 'bus') continue;
      if (t.muted) continue;
      const notes = (t.notes || []).filter((n) => n.midi > 0);
      const atStep = notes.filter((n) => Math.floor(n.step) === step % 64);
      const pool = atStep.length > 0 ? atStep : notes;
      if (pool.length === 0) continue;
      return { track: t, root: Math.min(...pool.map((n) => n.midi)) };
    }
    return null;
  }

  /**
   * Kick on the downbeat, snare on the backbeat. Returns whether a note
   * sounded, so the transport layer can report the band honestly.
   */
  private playDrummer(step: number, time: number, duration: number): boolean {
    try {
      const drumTrack = this.musicManager
        .tracks()
        .find((t) => t.id === MusicManagerService.DRUM_TRACK_ID);
      if (!drumTrack || drumTrack.muted) return false;
      const isBackbeat = step % 8 === 4;
      const midi = isBackbeat ? 38 : 36; // 38 snare · 36 kick
      // The drummer only fires on `step % 4 === 0`, so a velocity test on that
      // same modulus was always true and the snare landed as hard as the kick.
      // Accent off the backbeat instead.
      const velocity = isBackbeat ? 0.72 : 0.95;
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
      return true;
    } catch {
      /* defensive: AI parts never break transport */
      return false;
    }
  }

  /** Octave-down root reinforcement on the anchor track. */
  private playBassist(step: number, time: number, duration: number): boolean {
    try {
      const anchor = this.resolveAnchor(step);
      if (!anchor) return false;
      this.engine.triggerAttack(
        anchor.track.id,
        this.midiToFreq(anchor.root - 12),
        time,
        0.7,
        duration * 2,
        anchor.track.gain ?? 0.8,
        0,
        0,
        0,
        anchor.track.synthParams
      );
      return true;
    } catch {
      /* defensive */
      return false;
    }
  }

  /** Fifth-above chord stab on the anchor track. */
  private playKeyboardist(
    step: number,
    time: number,
    duration: number
  ): boolean {
    try {
      const anchor = this.resolveAnchor(step);
      if (!anchor) return false;
      this.engine.triggerAttack(
        anchor.track.id,
        this.midiToFreq(anchor.root + 7),
        time,
        0.35,
        duration * 0.9,
        anchor.track.gain ?? 0.8,
        0,
        0,
        0,
        anchor.track.synthParams
      );
      return true;
    } catch {
      /* defensive */
      return false;
    }
  }
}
