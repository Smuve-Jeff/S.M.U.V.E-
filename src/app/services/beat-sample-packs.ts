/**
 * Beat sample packs — the bridge between the chat beat builder and the
 * Studio's sample library.
 *
 * Every id here is a real `InstrumentsService` preset that the sample library
 * already loads ("Load" on a library card calls `ensureTrack(presetId)`), so a
 * beat asked for in the conversation arrives on the same kits, keys and basses
 * the artist can find in the Sample Library instead of four fixed synth
 * presets. `libraryPack` names the sample-library pack the presets come from,
 * which is what makes consecutive beats sound like different shelves.
 *
 * The chat engine validates each id against `InstrumentsService.presets`, so a
 * renamed or removed preset degrades to a fallback rather than silence.
 */

export interface BeatSamplePack {
  id: string;
  label: string;
  /** Sample-library pack these presets belong to. */
  libraryPack: 'Starter Kit' | 'Club Arsenal' | 'After Hours' | 'Cinematic Tools';
  /** Drum kit preset (`category: 'drum'` / `'perc'`). */
  drums: string;
  /** Low end. */
  bass: string;
  /** Harmony — keys, electric piano, organ or grand. */
  chords: string;
  /** Hook. */
  melody: string;
}

export const BEAT_SAMPLE_PACKS: readonly BeatSamplePack[] = [
  {
    id: 'starter',
    label: 'Starter Kit',
    libraryPack: 'Starter Kit',
    drums: 'trap-kit-elite',
    bass: 'sub-commander',
    chords: 'rhodes-mk2-stage',
    melody: 'supersaw-stack',
  },
  {
    id: 'trap-808',
    label: 'Trap 808 Kit',
    libraryPack: 'Club Arsenal',
    drums: 'trap-kit-elite',
    bass: 'trap-808-elite',
    chords: 'analog-warmth',
    melody: 'cyber-stab',
  },
  {
    id: 'club',
    label: 'Club Arsenal',
    libraryPack: 'Club Arsenal',
    drums: 'modern-kit-elite',
    bass: 'reese-bass-neuro',
    chords: 'wurlitzer-200a-ep',
    melody: 'pluck-marimba-hybrid',
  },
  {
    id: 'after-hours',
    label: 'After Hours',
    libraryPack: 'After Hours',
    drums: 'acoustic-kit-pro',
    bass: 'upright-bass-pro',
    chords: 'clavinet-d6',
    melody: 'minimoog-model-d-lead',
  },
  {
    id: 'live-room',
    label: 'Live Room',
    libraryPack: 'After Hours',
    drums: 'acoustic-kit-pro',
    bass: 'p-bass-elite',
    chords: 'grand-piano',
    melody: 'prophet5-rev3',
  },
  {
    id: 'cinematic',
    label: 'Cinematic Tools',
    libraryPack: 'Cinematic Tools',
    drums: 'afro-cuban-kit',
    bass: 'minimoog-model-d-bass',
    chords: 'grand-piano',
    melody: 'ob-xa-strings',
  },
  {
    id: 'lofi-dust',
    label: 'Lo-Fi Dust',
    libraryPack: 'After Hours',
    drums: 'lo-fi-kit',
    bass: 'sub-commander',
    chords: 'dx7-electric-piano',
    melody: 'solina-string-ensemble',
  },
] as const;

/** Genre → the shelves to draw from, most apt first. */
const GENRE_PACKS: readonly { pattern: RegExp; packs: readonly string[] }[] = [
  {
    pattern:
      /trap|drill|phonk|hip hop|hip-hop|rap|grime|jersey|cloud rap|emo rap|boom bap/,
    packs: ['trap-808', 'starter', 'club'],
  },
  {
    pattern:
      /house|techno|trance|electronic|disco|garage|breakbeat|drum and bass|d&b|dnb|dubstep|jungle|future bass|hyperpop|synthwave/,
    packs: ['club', 'starter', 'lofi-dust'],
  },
  {
    pattern:
      /jazz|soul|r&b|rnb|funk|gospel|blues|lofi|lo-fi|chillhop|neo soul|afro|amapiano|reggaeton|latin|dancehall|reggae|salsa|bachata|cumbia|highlife|gqom/,
    packs: ['after-hours', 'live-room', 'lofi-dust'],
  },
  {
    pattern:
      /ambient|classical|orchestral|cinematic|new age|worship|shoegaze|folk|acoustic|country|bluegrass/,
    packs: ['cinematic', 'live-room', 'starter'],
  },
  {
    pattern: /rock|metal|punk|pop/,
    packs: ['live-room', 'starter', 'club'],
  },
];

export function beatPackById(id: string): BeatSamplePack | undefined {
  return BEAT_SAMPLE_PACKS.find((pack) => pack.id === id);
}

/**
 * Pick a pack for a genre. `variation` rotates within the genre's shelves (and
 * across all of them for an unrecognized genre), so asking twice is not the
 * same kit, the same bass and the same keys.
 */
export function beatPackForGenre(
  genre: string,
  variation = 0
): BeatSamplePack {
  const style = (genre || '').toLowerCase();
  const match = GENRE_PACKS.find((entry) => entry.pattern.test(style));
  const candidates = match
    ? match.packs
        .map((id) => beatPackById(id))
        .filter((pack): pack is BeatSamplePack => !!pack)
    : [...BEAT_SAMPLE_PACKS];
  const shelf = candidates.length ? candidates : [...BEAT_SAMPLE_PACKS];
  return shelf[Math.abs(variation) % shelf.length];
}
