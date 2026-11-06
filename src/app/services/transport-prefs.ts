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
  /**
   * Click habits. All optional: sets stored before the click panel existed
   * simply fall back to the engine defaults instead of failing to restore.
   */
  clickSubdivision?: ClickSubdivision;
  clickSound?: ClickSound;
  /** Count-in click level, 0-1, independent of the click volume. */
  countInLevel?: number;
  /** Where the click is monitored: through the master chain, or direct. */
  clickOutput?: ClickOutput;
}

/** How many clicks the metronome puts inside one notated beat. */
export const CLICK_SUBDIVISIONS = [
  "none",
  "eighths",
  "triplets",
  "sixteenths",
] as const;
export type ClickSubdivision = (typeof CLICK_SUBDIVISIONS)[number];

/** Clicks per notated beat for each subdivision setting. */
export const CLICK_DIVISIONS_PER_BEAT: Record<ClickSubdivision, number> = {
  none: 1,
  eighths: 2,
  triplets: 3,
  sixteenths: 4,
};

/** Human labels. Short enough for a phone chip row. */
export const CLICK_SUBDIVISION_LABELS: Record<ClickSubdivision, string> = {
  none: "Off",
  eighths: "1/8",
  triplets: "1/8T",
  sixteenths: "1/16",
};

/** The timbre of the click itself. */
export const CLICK_SOUNDS = ["beep", "wood", "tick"] as const;
export type ClickSound = (typeof CLICK_SOUNDS)[number];

export const CLICK_SOUND_LABELS: Record<ClickSound, string> = {
  beep: "Beep",
  wood: "Wood",
  tick: "Tick",
};

/**
 * `mix` follows the master fader, limiter and mono fold-down. `direct` keeps
 * the click on its own bus so pulling the master down or checking the mix in
 * mono does not change the click. A truly separate headphone cue needs a second
 * output device, which the browser does not expose.
 */
export const CLICK_OUTPUTS = ["mix", "direct"] as const;
export type ClickOutput = (typeof CLICK_OUTPUTS)[number];

export const CLICK_OUTPUT_LABELS: Record<ClickOutput, string> = {
  mix: "Mix",
  direct: "Direct",
};

export const TRANSPORT_PREFS_KEY = "smuve_studio_transport_prefs";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isStep = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isLevel = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T => typeof value === "string" && allowed.includes(value as T);

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

  if (isOneOf(record["clickSubdivision"], CLICK_SUBDIVISIONS)) {
    prefs.clickSubdivision = record["clickSubdivision"];
  }
  if (isOneOf(record["clickSound"], CLICK_SOUNDS)) {
    prefs.clickSound = record["clickSound"];
  }
  if (isLevel(record["countInLevel"])) prefs.countInLevel = record["countInLevel"];
  if (isOneOf(record["clickOutput"], CLICK_OUTPUTS)) {
    prefs.clickOutput = record["clickOutput"];
  }

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
    clickSubdivision: prefs.clickSubdivision,
    clickSound: prefs.clickSound,
    countInLevel: prefs.countInLevel,
    clickOutput: prefs.clickOutput,
  });
}
