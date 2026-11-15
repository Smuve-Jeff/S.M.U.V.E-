/**
 * Remembered audition settings.
 *
 * The toggles beside Audition describe how the artist listens to their own
 * vocal, not what the project contains — losing them on reload meant re-picking
 * "in the mix", "loop" and the lead-in bars every session. They are stored per
 * device in `localStorage`, like the transport preferences.
 */

export interface AuditionPrefs {
  /** Play the song under the take instead of only the guide. */
  inMix: boolean;
  /** Repeat the preview over the take. */
  loop: boolean;
  /** Bars of song-only lead-in before the take enters (0 = off). */
  preRollBars: number;
}

export const AUDITION_PREFS_KEY = "smuve.vocal.audition";

export const DEFAULT_AUDITION_PREFS: AuditionPrefs = {
  inMix: true,
  loop: false,
  preRollBars: 1,
};

/** Bars of lead-in, clamped to the range the UI offers (off/one/two). */
export function clampPreRollBars(value: unknown): number {
  const bars = Math.round(Number(value));
  return Number.isFinite(bars)
    ? Math.max(0, Math.min(2, bars))
    : DEFAULT_AUDITION_PREFS.preRollBars;
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Storage can throw outright when the browser blocks it.
    return null;
  }
}

export function loadAuditionPrefs(storage?: Storage | null): AuditionPrefs {
  const target = resolveStorage(storage);
  if (!target) return { ...DEFAULT_AUDITION_PREFS };
  try {
    const raw = target.getItem(AUDITION_PREFS_KEY);
    if (!raw) return { ...DEFAULT_AUDITION_PREFS };
    const parsed = JSON.parse(raw) as Partial<AuditionPrefs> | null;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_AUDITION_PREFS };
    }
    return {
      inMix:
        typeof parsed.inMix === "boolean"
          ? parsed.inMix
          : DEFAULT_AUDITION_PREFS.inMix,
      loop:
        typeof parsed.loop === "boolean"
          ? parsed.loop
          : DEFAULT_AUDITION_PREFS.loop,
      preRollBars: clampPreRollBars(parsed.preRollBars),
    };
  } catch {
    // A corrupted value must not break the Vocal Suite's construction.
    return { ...DEFAULT_AUDITION_PREFS };
  }
}

export function saveAuditionPrefs(
  prefs: AuditionPrefs,
  storage?: Storage | null,
): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.setItem(
      AUDITION_PREFS_KEY,
      JSON.stringify({
        inMix: prefs.inMix,
        loop: prefs.loop,
        preRollBars: clampPreRollBars(prefs.preRollBars),
      }),
    );
  } catch {
    // Private mode or a full quota: the settings are a convenience only.
  }
}
