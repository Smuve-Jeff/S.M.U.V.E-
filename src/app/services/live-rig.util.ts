/**
 * The values a live rig may legitimately name.
 *
 * A bundle is just a file, so a restore validates against these lists instead
 * of trusting what it finds. They live in their own module so the manager can
 * validate the rig it stores without importing the engine at runtime (the
 * engine is lazy; the manager is not).
 */

/** Note-repeat rates the arpeggiator clock has an interval for. */
export const LIVE_ARP_RATES = ['4n', '8n', '8t', '16n'] as const;
export type LiveArpRate = (typeof LIVE_ARP_RATES)[number];

/** The chord-stamp types the Piano Roll offers, in its display order. */
export const LIVE_CHORD_TYPES = [
  'major',
  'minor',
  'min7',
  'maj7',
  'dom7',
  'sus4',
  'dim',
  'aug',
] as const;
export type LiveChordType = (typeof LIVE_CHORD_TYPES)[number];

/** Scale modes Scale Lock offers; `LIVE_SCALE_INTERVALS` keys every one. */
export const LIVE_SCALE_MODES = [
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'harmonicMinor',
  'blues',
  'pentatonic',
] as const;
export type LiveScaleMode = (typeof LIVE_SCALE_MODES)[number];

/** Orders Note Repeat can walk the held chord tones in. */
export const LIVE_ARP_PATTERNS = ['up', 'down', 'upDown', 'random'] as const;
export type LiveArpPattern = (typeof LIVE_ARP_PATTERNS)[number];

export function isLiveArpRate(value: unknown): value is LiveArpRate {
  return (LIVE_ARP_RATES as readonly unknown[]).includes(value);
}

export function isLiveChordType(value: unknown): value is LiveChordType {
  return (LIVE_CHORD_TYPES as readonly unknown[]).includes(value);
}

export function isLiveScaleMode(value: unknown): value is LiveScaleMode {
  return (LIVE_SCALE_MODES as readonly unknown[]).includes(value);
}

export function isLiveArpPattern(value: unknown): value is LiveArpPattern {
  return (LIVE_ARP_PATTERNS as readonly unknown[]).includes(value);
}
