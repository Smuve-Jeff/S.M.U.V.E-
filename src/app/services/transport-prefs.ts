/**
 * The transport toggles that outlive a reload.
 *
 * Metronome and Loop are per-artist habits, not per-project settings: you set
 * the click once and expect it to still be there after the tab reloads. They
 * were plain signals, so every reload silently reset both.
 *
 * Kept out of the engine as a pure record/parse pair so the storage format can
 * be pinned without constructing an AudioContext, and so a hand-edited or
 * older record degrades to the defaults instead of throwing inside a
 * constructor.
 */
export interface TransportPrefs {
  loop: boolean;
  metronome: boolean;
  /** Loop region in sixteenth-note steps; null when no region was ever set. */
  loopStart: number | null;
  loopEnd: number | null;
  /**
   * Mono-sum monitor. A monitoring habit, like the click: the mixer should
   * still be in mono after a reload, not silently back in stereo.
   */
  mono: boolean;
}

export const TRANSPORT_PREFS_KEY = "smuve_studio_transport_prefs";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isStep = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Read a stored record. Returns only the fields that survived validation —
 * an unknown or corrupt record yields `{}`, which leaves every default in
 * place rather than half-applying it.
 *
 * The region is all-or-nothing: a start without an end is not a region, and
 * keeping one half would leave the transport looping something nobody asked
 * for.
 */
export function parseTransportPrefs(
  raw: string | null | undefined,
): Partial<TransportPrefs> {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object") return {};
  const record = parsed as Record<string, unknown>;
  const prefs: Partial<TransportPrefs> = {};

  if (isBoolean(record["loop"])) prefs.loop = record["loop"];
  if (isBoolean(record["metronome"])) prefs.metronome = record["metronome"];
  if (isBoolean(record["mono"])) prefs.mono = record["mono"];

  const start = record["loopStart"];
  const end = record["loopEnd"];
  if (isStep(start) && isStep(end) && end > start) {
    prefs.loopStart = Math.floor(start);
    prefs.loopEnd = Math.floor(end);
  }

  return prefs;
}

/** Serialise the current transport state. `v` is the format version. */
export function serializeTransportPrefs(prefs: TransportPrefs): string {
  return JSON.stringify({
    v: 1,
    loop: prefs.loop,
    metronome: prefs.metronome,
    loopStart: prefs.loopStart,
    loopEnd: prefs.loopEnd,
    mono: prefs.mono,
  });
}
