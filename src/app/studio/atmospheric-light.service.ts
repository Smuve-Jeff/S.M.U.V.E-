import { Injectable, signal } from "@angular/core";

/**
 * One frame of the master spectrum reduced to what a lighting surface needs.
 * Every value is normalized to 0..1 and already smoothed for a visual — not a
 * metering — purpose.
 */
export interface AtmosphereFrame {
  /** Overall energy of the audible bands (RMS-ish, weighted). */
  level: number;
  /** 20–200 Hz — kick, sub, bass. Drives the "floor" of the aurora. */
  low: number;
  /** 200 Hz–2 kHz — the body of the mix. Drives the main aurora body. */
  mid: number;
  /** 2–12 kHz — hats, air, consonants. Drives the sparkle / specular layer. */
  high: number;
  /** Spectral centroid, 0 = dark, 1 = bright. Drives the hue rotation. */
  brightness: number;
}

const SILENT_FRAME: AtmosphereFrame = {
  level: 0,
  low: 0,
  mid: 0,
  high: 0,
  brightness: 0.5,
};

/** Log-spaced band edges in Hz — the split a mastering engineer would use. */
const LOW_BAND = { from: 20, to: 200 };
const MID_BAND = { from: 200, to: 2000 };
const HIGH_BAND = { from: 2000, to: 12000 };

/** Assume 48 kHz when a context cannot report its rate (test doubles, some WebViews). */
const FALLBACK_SAMPLE_RATE = 48_000;

/**
 * Asymmetric envelope: jump toward a louder frame quickly (a transient must be
 * visible on the very next frame) but fall back slowly, so the aurora breathes
 * with the music instead of strobing at the step rate.
 */
const ATTACK = 0.55;
const RELEASE = 0.085;

/** CSS custom properties this service owns. Nothing else may write them. */
export const ATMOSPHERE_VARS = {
  level: "--atmo-level",
  low: "--atmo-low",
  mid: "--atmo-mid",
  high: "--atmo-high",
  brightness: "--atmo-brightness",
  active: "--atmo-active",
} as const;

/**
 * Bridges the AudioEngineService master analyser to the Studio's decorative
 * lighting (the Stage 2.0 aurora field, the brand accent).
 *
 * Design constraints, in order of importance:
 *
 *  1. **Never cost audio.** The read is one `getByteFrequencyData` into a
 *     pre-allocated buffer, on a `requestAnimationFrame` that only runs while
 *     the transport is rolling. No allocation inside the loop.
 *  2. **Never cost frames.** Values are published at most ~30 fps, and the CSS
 *     variables are only written when they move by more than a perceptual step,
 *     so a quiet bar of music produces no style invalidation at all.
 *  3. **Never fight the user.** `prefers-reduced-motion` and a hidden document
 *     both stop the loop outright (the aurora keeps its static authored look),
 *     and the Studio's existing Stage FX switch gates the whole thing from the
 *     shell side.
 */
@Injectable({ providedIn: "root" })
export class AtmosphericLightService {
  readonly level = signal(0);
  readonly low = signal(0);
  readonly mid = signal(0);
  readonly high = signal(0);
  readonly brightness = signal(0.5);
  /** True while the reactive loop is actually running. */
  readonly reacting = signal(false);

  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private bandRanges: {
    low: [number, number];
    mid: [number, number];
    high: [number, number];
  } | null = null;
  private smoothed: AtmosphereFrame = { ...SILENT_FRAME };
  /** Optional sink: the shell registers the element that carries the variables. */
  private target: HTMLElement | null = null;

  private rafId = 0;
  private lastSampleAt = 0;
  private lastPaintAt = 0;
  private lastPainted: Record<string, number> = {};

  /**
   * Bind the master analyser tap. Pass `null` to detach (stops the loop).
   * Bin indices are derived once, so the per-frame work stays a couple of adds.
   */
  bind(analyser: AnalyserNode | null): void {
    if (analyser === this.analyser) return;
    if (!analyser) {
      this.analyser = null;
      this.bins = null;
      this.bandRanges = null;
      this.smoothed = { ...SILENT_FRAME };
      this.publish(this.smoothed);
      return;
    }

    this.analyser = analyser;
    try {
      this.bins = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // Some emulated contexts report no frequencyBinCount; fail closed rather
      // than throwing into the audio bootstrap path.
      this.bins = new Uint8Array(1024);
    }
    this.bandRanges = this.buildBandRanges(analyser);
  }

  /**
   * Start or stop the reactive loop. The shell drives this from its transport
   * state; calling it with the current value is a no-op.
   *
   * @param active  transport is rolling AND Stage FX is on AND the surface is
   *                visible.
   * @param reducedMotion  the user asked for reduced motion — the loop never
   *                starts; values settle to the authored defaults instead.
   */
  setActive(
    active: boolean,
    reducedMotion = this.prefersReducedMotion(),
  ): void {
    const wanted = active && !reducedMotion && !!this.analyser;

    if (!wanted) {
      this.stop();
      this.settle();
      return;
    }
    if (this.rafId) return;

    if (typeof requestAnimationFrame !== "function") return;
    this.reacting.set(true);
    const loop = (now: number) => {
      // A hidden tab still fires rAF at a throttled cadence in some WebViews;
      // skip the work but keep the loop alive so it resumes instantly.
      if (!this.isHidden()) {
        this.sample(now);
        if (this.target) this.paint(this.target);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Stop the loop and release the analyser. */
  stop(): void {
    if (this.rafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = 0;
    this.reacting.set(false);
    this.lastSampleAt = 0;
  }

  setStyleTarget(target: HTMLElement | null): void {
    this.target = target;
    if (target) {
      target.style.setProperty(ATMOSPHERE_VARS.active, "0");
      for (const key of ["level", "low", "mid", "high"] as const) {
        target.style.setProperty(ATMOSPHERE_VARS[key], "0");
      }
    }
  }

  /**
   * Read one frame from the analyser and return the smoothed bands.
   * Public so tests (and any future non-rAF consumer) can step it
   * deterministically.
   */
  sample(now = 0): AtmosphereFrame {
    const analyser = this.analyser;
    const bins = this.bins;
    if (!analyser || !bins) return this.smoothed;

    try {
      analyser.getByteFrequencyData(bins);
    } catch {
      return this.smoothed;
    }

    const ranges = this.bandRanges;
    const raw: AtmosphereFrame = ranges
      ? {
          low: this.bandEnergy(bins, ranges.low),
          mid: this.bandEnergy(bins, ranges.mid),
          high: this.bandEnergy(bins, ranges.high),
          level: 0,
          brightness: this.centroid(bins),
        }
      : { ...SILENT_FRAME };
    // Weighted so a kick and a vocal at the same amplitude read differently: the
    // mix's body carries the room, the extremes add the accent.
    raw.level = Math.min(1, raw.low * 0.35 + raw.mid * 0.45 + raw.high * 0.2);

    this.smoothed = {
      level: this.envelope(this.smoothed.level, raw.level),
      low: this.envelope(this.smoothed.low, raw.low),
      mid: this.envelope(this.smoothed.mid, raw.mid),
      high: this.envelope(this.smoothed.high, raw.high),
      brightness: this.envelope(this.smoothed.brightness, raw.brightness, 0.12),
    };
    this.lastSampleAt = now;
    this.publish(this.smoothed);
    return this.smoothed;
  }

  /** Write the current frame onto the style target, throttled and de-noised. */
  paint(target: HTMLElement, now = 0): void {
    // ~30 fps is more than a blurred 72px backdrop can resolve, and it halves
    // the style recalculation cost on low-end Android.
    if (now && this.lastPaintAt && now - this.lastPaintAt < 32) return;
    if (now) this.lastPaintAt = now;

    const frame = this.smoothed;
    const style = target.style;
    // A 2.5% step is about the smallest change a 72px-blurred blob can show;
    // skipping smaller deltas keeps a sustained chord from invalidating styles
    // sixty times a second for no visible gain.
    for (const key of ["level", "low", "mid", "high"] as const) {
      const value = frame[key];
      const previous = this.lastPainted[key] ?? -1;
      if (Math.abs(value - previous) < 0.025 && previous >= 0) continue;
      this.lastPainted[key] = value;
      style.setProperty(ATMOSPHERE_VARS[key], value.toFixed(3));
    }
    const previousBrightness = this.lastPainted["brightness"] ?? -1;
    if (Math.abs(frame.brightness - previousBrightness) >= 0.02) {
      this.lastPainted["brightness"] = frame.brightness;
      style.setProperty(
        ATMOSPHERE_VARS.brightness,
        frame.brightness.toFixed(3),
      );
    }
    style.setProperty(ATMOSPHERE_VARS.active, "1");
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private buildBandRanges(analyser: AnalyserNode): {
    low: [number, number];
    mid: [number, number];
    high: [number, number];
  } {
    const sampleRate =
      Number(analyser.context?.sampleRate) > 0
        ? analyser.context.sampleRate
        : FALLBACK_SAMPLE_RATE;
    const binCount = Math.max(1, analyser.frequencyBinCount || 1024);
    const hzPerBin = sampleRate / 2 / binCount;
    const toBin = (hz: number) =>
      Math.min(binCount - 1, Math.max(0, Math.round(hz / hzPerBin)));
    return {
      low: [
        toBin(LOW_BAND.from),
        Math.max(toBin(LOW_BAND.to), toBin(LOW_BAND.from) + 1),
      ],
      mid: [
        toBin(MID_BAND.from),
        Math.max(toBin(MID_BAND.to), toBin(MID_BAND.from) + 1),
      ],
      high: [
        toBin(HIGH_BAND.from),
        Math.max(toBin(HIGH_BAND.to), toBin(HIGH_BAND.from) + 1),
      ],
    };
  }

  private bandEnergy(
    bins: Uint8Array<ArrayBuffer>,
    [from, to]: [number, number],
  ): number {
    const end = Math.min(to, bins.length);
    if (end <= from) return 0;
    let sum = 0;
    for (let i = from; i < end; i += 1) sum += bins[i];
    return Math.min(1, sum / (end - from) / 255);
  }

  private centroid(bins: Uint8Array<ArrayBuffer>): number {
    let weighted = 0;
    let total = 0;
    for (let i = 0; i < bins.length; i += 1) {
      weighted += i * bins[i];
      total += bins[i];
    }
    if (!total) return this.smoothed.brightness;
    return Math.min(1, weighted / total / Math.max(1, bins.length - 1));
  }

  private envelope(current: number, next: number, release = RELEASE): number {
    const k = next > current ? ATTACK : release;
    return current + (next - current) * k;
  }

  private publish(frame: AtmosphereFrame): void {
    this.level.set(frame.level);
    this.low.set(frame.low);
    this.mid.set(frame.mid);
    this.high.set(frame.high);
    this.brightness.set(frame.brightness);
  }

  /** Fall back to the authored, non-reactive look when the loop must not run. */
  private settle(): void {
    this.smoothed = { ...SILENT_FRAME };
    this.publish(this.smoothed);
    this.lastPainted = {};
    if (this.target) {
      this.paint(this.target);
      this.target.style.setProperty(ATMOSPHERE_VARS.active, "0");
    }
  }

  private isHidden(): boolean {
    return (
      typeof document !== "undefined" && document.visibilityState === "hidden"
    );
  }

  private prefersReducedMotion(): boolean {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return false;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }
}
