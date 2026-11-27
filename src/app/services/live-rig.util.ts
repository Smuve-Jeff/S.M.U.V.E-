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
] as const;
export type LiveChordType = (typeof LIVE_CHORD_TYPES)[number];

export function isLiveArpRate(value: unknown): value is LiveArpRate {
  return (LIVE_ARP_RATES as readonly unknown[]).includes(value);
}

export function isLiveChordType(value: unknown): value is LiveChordType {
  return (LIVE_CHORD_TYPES as readonly unknown[]).includes(value);
}
