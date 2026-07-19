import { Injectable, signal } from '@angular/core';

export type HapticPreset =
  | 'snap'
  | 'detent'
  | 'tick'
  | 'faderUnity'
  | 'faderZero'
  | 'noteOn'
  | 'noteOff'
  | 'knobLimit'
  | 'recordArm'
  | 'loopMarker'
  | 'grooveShuffle'
  | 'beatAccent'
  | 'beatGhost'
  | 'undo'
  | 'redo'
  | 'soloFlash'
  | 'muteFlash'
  | 'pitchBend'
  | 'velocityHit';

@Injectable({
  providedIn: 'root',
})
export class HapticService {
  enabled = signal(true);

  /** Current tempo — used by tempo-synced haptics */
  tempo = signal(120);

  /** Global intensity multiplier (0..1) */
  intensity = signal(1.0);

  private ctx: AudioContext | null = null;

  // ── Core vibrate ──────────────────────────────────────

  vibrate(pattern: number | number[]) {
    if (!this.enabled()) return;
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      const scaled = Array.isArray(pattern)
        ? pattern.map((v, i) => i % 2 === 0 ? Math.round(v * this.intensity()) : v)
        : Math.round(pattern * this.intensity());
      navigator.vibrate(scaled);
    } catch { /* silent */ }
  }

  // ── Basic impacts ─────────────────────────────────────

  impact(style: 'light' | 'medium' | 'heavy') {
    switch (style) {
      case 'light':  return this.light();
      case 'medium': return this.medium();
      case 'heavy':  return this.heavy();
    }
  }

  light()  { this.vibrate(8); }
  medium() { this.vibrate(18); }
  heavy()  { this.vibrate(35); }

  // ── Status feedback ───────────────────────────────────

  success() { this.vibrate([8, 25, 8]); }
  warning() { this.vibrate([18, 40, 18]); }
  error()   { this.vibrate([40, 80, 40, 80, 40]); }

  // ── Musical presets ───────────────────────────────────

  preset(name: HapticPreset) {
    switch (name) {
      case 'snap':         this.vibrate(4); break;
      case 'detent':       this.vibrate([3, 8, 3]); break;
      case 'tick':         this.vibrate(2); break;
      case 'faderUnity':   this.vibrate([6, 12, 6]); break;
      case 'faderZero':    this.vibrate([4, 10, 4, 10, 4]); break;
      case 'noteOn':       this.vibrate(6); break;
      case 'noteOff':      this.vibrate(3); break;
      case 'knobLimit':    this.vibrate([2, 6, 2, 6, 2]); break;
      case 'recordArm':    this.vibrate([15, 30, 15, 30, 30]); break;
      case 'loopMarker':   this.vibrate([8, 15, 12]); break;
      case 'grooveShuffle':this.vibrate([3, 30, 6]); break;
      case 'beatAccent':   this.vibrate(10); break;
      case 'beatGhost':    this.vibrate(2); break;
      case 'undo':         this.vibrate([5, 20, 10]); break;
      case 'redo':         this.vibrate([10, 20, 5]); break;
      case 'soloFlash':    this.vibrate([8, 15, 8]); break;
      case 'muteFlash':    this.vibrate([12, 8]); break;
      case 'pitchBend':    this.vibrate(3); break;
      case 'velocityHit':  this.vibrate([4, 6, 8]); break;
    }
  }

  // ── Tempo-synced beat haptic ──────────────────────────

  beat() {
    this.vibrate(4);
  }

  /** Strong accent haptic (downbeat) */
  accent() {
    this.vibrate(8);
  }

  /** Subtle ghost-note haptic */
  ghost() {
    this.vibrate(1);
  }

  /** Swing/shuffle feel — dotted pattern */
  shuffle() {
    const msPerBeat = 60000 / this.tempo();
    const sixteenth = msPerBeat / 4;
    this.vibrate([3, Math.round(sixteenth * 0.66), 5]);
  }

  /** Trigger beat haptics in sync with the visual step */
  onStep(step: number, stepsPerBeat = 4) {
    const posInBeat = step % stepsPerBeat;
    if (posInBeat === 0) {
      this.accent();
    } else if (posInBeat === Math.round(stepsPerBeat / 2)) {
      this.beat();
    } else {
      this.ghost();
    }
  }

  // ── Velocity-sensitive haptic ─────────────────────────

  /** Map a velocity value (0..1) to a proportional vibration */
  velocity(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    const ms = Math.round(2 + clamped * 16);
    this.vibrate(ms);
  }

  /** Drum-pad strike with velocity */
  drumHit(velocity: number) {
    const clamped = Math.max(0, Math.min(1, velocity));
    const strike = Math.round(4 + clamped * 20);
    const decay = Math.round(5 + clamped * 15);
    this.vibrate([strike, decay, Math.round(strike * 0.3)]);
  }

  // ── Spatial audio feedback ────────────────────────────

  /** Stereo pan haptic — left/right vibration emphasis */
  panPosition(normalizedPan: number) {
    // -1 = left, 0 = center, 1 = right
    const abs = Math.abs(normalizedPan);
    const ms = Math.round(2 + abs * 8);
    this.vibrate(ms);
  }

  // ── AudioContext click (non-vibration fallback) ───────

  /** Play a short click via AudioContext for devices without vibrate */
  audioClick(frequency = 1000, durationMs = 5) {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = frequency;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.08 * this.intensity(), this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + durationMs / 1000
      );
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + durationMs / 1000 + 0.01);
    } catch { /* silent */ }
  }
}
