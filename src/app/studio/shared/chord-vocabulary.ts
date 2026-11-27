import { LIVE_CHORD_TYPES, type LiveChordType } from '../../services/live-rig.util';

/** One chord a control can pick: the stored value plus how it is shown/stamped. */
export interface ChordChoice {
  value: LiveChordType;
  label: string;
  intervals: number[];
}

/**
 * Label and stamped intervals keyed by the live rig's allowlist. A `Record`
 * over the allowlist turns adding or dropping a type there into a compile error
 * here, so no surface can offer a chord the saved rig cannot hold.
 */
const CHORD_DETAILS: Record<
  LiveChordType,
  { label: string; intervals: number[] }
> = {
  major: { label: 'Maj', intervals: [0, 4, 7] },
  minor: { label: 'Min', intervals: [0, 3, 7] },
  min7: { label: 'm7', intervals: [0, 3, 7, 10] },
  maj7: { label: 'M7', intervals: [0, 4, 7, 11] },
  dom7: { label: '7', intervals: [0, 4, 7, 10] },
  sus4: { label: 'sus4', intervals: [0, 5, 7] },
  dim: { label: 'dim', intervals: [0, 3, 6] },
  aug: { label: 'aug', intervals: [0, 4, 8] },
};

/**
 * The one chord vocabulary, in the allowlist's display order. The Piano Roll's
 * chord stamp and the Chord Editor's picker both read this, so a chord the
 * editor can build is always one the roll can stamp and the rig can save.
 */
export const CHORD_CHOICES: readonly ChordChoice[] = LIVE_CHORD_TYPES.map(
  (value) => ({ value, ...CHORD_DETAILS[value] }),
);
