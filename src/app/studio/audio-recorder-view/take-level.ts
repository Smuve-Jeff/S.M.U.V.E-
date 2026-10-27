/**
 * Was anything actually recorded?
 *
 * A take can finish perfectly — MediaRecorder produces real WebM, the length is
 * right, the row says "saved on device" — and still contain nothing but noise
 * floor. That happens with a muted interface, the wrong input selected, a
 * hardware gain at zero, or an OS-level mute that never reaches the browser.
 * The app used to bank it as a success, so the artist only found out after
 * leaving the studio and trying to use a silent region.
 *
 * Pure and browser-free, so the thresholds and the copy can be pinned in a unit
 * spec instead of inferred from a rendered page.
 */
export type TakeLevel = "silent" | "low" | "ok" | "unknown";

export interface TakeSignal {
  peak: number;
  rms: number;
}

/** -66 dBFS: below this nothing audible was captured at all. */
export const SILENT_PEAK = 0.0005;
/** -34 dBFS: quiet enough that the take is probably usable only after gain. */
export const LOW_PEAK = 0.02;

/**
 * Peak and RMS across every channel. Peak is the honest test for "did signal
 * arrive"; RMS alone hides a single transient and a fully clipped take alike.
 */
export function measureTakeSignal(
  channels: readonly Float32Array[],
): TakeSignal | null {
  let peak = 0;
  let energy = 0;
  let count = 0;

  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const value = channel[i];
      const magnitude = value < 0 ? -value : value;
      if (magnitude > peak) peak = magnitude;
      energy += value * value;
      count += 1;
    }
  }

  // No samples at all is not a silent take — it is *no measurement*, and must
  // not raise a warning the artist cannot act on.
  if (count === 0) return null;
  return { peak, rms: Math.sqrt(energy / count) };
}

/**
 * Read a level back from storage. Anything unrecognised returns `null` rather
 * than a default, so a half-written record can never invent a verdict.
 */
export function normalizeTakeLevel(value: unknown): TakeLevel | null {
  return value === "silent" || value === "low" || value === "ok"
    ? value
    : null;
}

export function classifyTakeLevel(signal: TakeSignal | null | undefined): TakeLevel {
  if (!signal || !Number.isFinite(signal.peak)) return "unknown";
  if (signal.peak < SILENT_PEAK) return "silent";
  if (signal.peak < LOW_PEAK) return "low";
  return "ok";
}

export interface TakeLevelNotice {
  /** Three or four characters that fit the bank row. */
  badge: string;
  /** Full sentence for the snackbar; `null` when the take is healthy. */
  message: string | null;
}

export const TAKE_LEVEL_NOTICES: Readonly<Record<TakeLevel, TakeLevelNotice>> = {
  silent: {
    badge: "SILENT",
    message:
      "That take is silent — check the input is not muted and that the right microphone is selected.",
  },
  low: {
    badge: "LOW",
    message:
      "That take is very quiet — raise the interface gain or move closer, then record again.",
  },
  ok: { badge: "", message: null },
  unknown: { badge: "", message: null },
};

/**
 * Stored takes that still need measuring: recorded before the level was saved,
 * or written by a version that only kept the blob. A take that already carries
 * a level is trusted as-is, and one with no blob cannot be measured at all.
 */
export function takesMissingLevel<
  T extends { blob?: unknown; settings?: { level?: unknown } },
>(items: readonly T[]): T[] {
  return items.filter(
    (item) =>
      normalizeTakeLevel(item.settings?.level) === null &&
      typeof item.blob === "object" &&
      item.blob !== null,
  );
}

export function takeLevelNotice(level: TakeLevel): TakeLevelNotice {
  return TAKE_LEVEL_NOTICES[level];
}
