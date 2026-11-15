/**
 * Count-in timing for a standalone capture surface.
 *
 * The transport has its own count-in (AudioEngineService); the Live Capture
 * recorder records outside the transport, so it needs the same arithmetic to
 * give the artist a bar to breathe before the take and the guide track start.
 */

export const BEATS_PER_BAR = 4;

/** Whole beats in a count-in of `bars` bars (at least one bar, at most four). */
export function countInBeats(bars: number): number {
  const safeBars = Number.isFinite(bars) ? Math.max(1, Math.min(4, Math.round(bars))) : 1;
  return safeBars * BEATS_PER_BAR;
}

/** Seconds between two count-in beats at `tempo` (falls back to 120 BPM). */
export function countInBeatSeconds(tempo: number): number {
  const safeTempo = Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
  return 60 / safeTempo;
}

/** Total count-in length in seconds. */
export function countInDurationSeconds(bars: number, tempo: number): number {
  return countInBeats(bars) * countInBeatSeconds(tempo);
}

export interface CountInClickOptions {
  beats: number;
  beatSeconds: number;
  /** AudioContext time of the first beat. */
  startAt: number;
  onError?: (error: unknown) => void;
}

/**
 * Schedule the count-in clicks.
 *
 * Every capture surface clicks the same way, so the envelope lives here instead
 * of being copied per view: a short sine burst that cuts through a room without
 * hurting headphones, accented on the downbeat.
 */
export function scheduleCountInClicks(
  ctx: BaseAudioContext,
  options: CountInClickOptions,
): void {
  const beats = Math.max(1, Math.round(options.beats) || 1);
  const beatSeconds =
    Number.isFinite(options.beatSeconds) && options.beatSeconds > 0
      ? options.beatSeconds
      : 0.5;
  for (let beat = 0; beat < beats; beat++) {
    const at = options.startAt + beat * beatSeconds;
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(beat === 0 ? 1600 : 1200, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.35, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.06);
    } catch (error) {
      options.onError?.(error);
    }
  }
}
