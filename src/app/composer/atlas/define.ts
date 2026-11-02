import type {
  GenreFamily,
  GenrePalette,
  GenreProfile,
  MelodyTraits,
  MoodId,
} from '../composer.types';
import { FAMILY_BASE } from './foundation';

export interface GenreSpec extends Partial<Omit<GenreProfile, 'palette'>> {
  id: string;
  label: string;
  tagline: string;
  bpm: [number, number];
  moods: MoodId[];
  /** Palette slots replace the family palette slot-for-slot. */
  palette?: Partial<GenrePalette>;
  melody?: MelodyTraits;
}

const DEFAULT_KEYS = ['A', 'C', 'D', 'E', 'F', 'G', 'B', 'F#', 'Bb', 'C#'];

/**
 * Builds a complete genre profile from the family vocabulary plus the
 * genre's own decisions. Every genre is a real, playable rule set — not a
 * label attached to one hard-coded loop.
 */
export function defineGenre(family: GenreFamily, spec: GenreSpec): GenreProfile {
  const base = FAMILY_BASE[family];
  // Palette slots merge individually: a genre that overrides the lead must not
  // silently lose the family's pad, percussion or counter slots.
  const { palette, melody, ...rest } = spec;
  return {
    family,
    aliases: [],
    swing: 0,
    keys: DEFAULT_KEYS,
    modes: base.modes,
    progressionIds: base.progressionIds,
    grooveIds: base.grooveIds,
    bassStyleIds: base.bassStyleIds,
    melody: melody ?? base.melody,
    arrangementId: base.arrangementId,
    mixNotes: [],
    productionTricks: [],
    study: [],
    market: {
      lane: '',
      listener: '',
      hookDevice: '',
      syncLane: '',
      trendRead: '',
    },
    vocalDirection: '',
    componentAdvice: {},
    tags: [],
    ...rest,
    palette: { ...base.palette, ...(palette ?? {}) },
  } as GenreProfile;
}
