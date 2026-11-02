import type {
  ArrangementTemplate,
  BassStyle,
  GenreFamily,
  GenreProfile,
  GrooveTemplate,
  HarmonyTemplate,
} from '../composer.types';
import {
  ARRANGEMENTS,
  BASS_STYLES,
  FAMILY_LABELS,
  GROOVES,
  MODE_LABELS,
  MODE_SCALES,
  MOOD_LABELS,
  PROGRESSIONS,
} from './foundation';
import { HIPHOP_ELECTRONIC_GENRES } from './genres-hiphop';
import { ELECTRONIC_GENRES } from './genres-electronic';
import { POP_SOUL_ROCK_GENRES } from './genres-pop-soul-rock';
import { JAZZ_GLOBAL_GENRES } from './genres-jazz-global';
import { COUNTRY_CINEMATIC_GENRES } from './genres-country-cinematic';

export {
  ARRANGEMENTS,
  BASS_STYLES,
  FAMILY_LABELS,
  GROOVES,
  MODE_LABELS,
  MODE_SCALES,
  MOOD_LABELS,
  PROGRESSIONS,
};

/** The full atlas: every genre S.M.U.V.E. can write inside. */
export const GENRE_ATLAS: GenreProfile[] = [
  ...HIPHOP_ELECTRONIC_GENRES,
  ...ELECTRONIC_GENRES,
  ...POP_SOUL_ROCK_GENRES,
  ...JAZZ_GLOBAL_GENRES,
  ...COUNTRY_CINEMATIC_GENRES,
];

export const GENRE_BY_ID: ReadonlyMap<string, GenreProfile> = new Map(
  GENRE_ATLAS.map((genre) => [genre.id, genre])
);

export const GROOVE_BY_ID: ReadonlyMap<string, GrooveTemplate> = new Map(
  GROOVES.map((groove) => [groove.id, groove])
);

export const PROGRESSION_BY_ID: ReadonlyMap<string, HarmonyTemplate> = new Map(
  PROGRESSIONS.map((progression) => [progression.id, progression])
);

export const BASS_STYLE_BY_ID: ReadonlyMap<string, BassStyle> = new Map(
  BASS_STYLES.map((style) => [style.id, style])
);

export const ARRANGEMENT_BY_ID: ReadonlyMap<string, ArrangementTemplate> = new Map(
  ARRANGEMENTS.map((arrangement) => [arrangement.id, arrangement])
);

export const FAMILY_ORDER: GenreFamily[] = [
  'hip-hop',
  'electronic',
  'pop',
  'rnb-soul',
  'rock',
  'jazz',
  'global',
  'country-folk',
  'cinematic',
];

export interface GenreSummary {
  id: string;
  label: string;
  family: GenreFamily;
  familyLabel: string;
  tagline: string;
  bpm: [number, number];
  moods: string[];
}

export const GENRE_SUMMARIES: GenreSummary[] = GENRE_ATLAS.map((genre) => ({
  id: genre.id,
  label: genre.label,
  family: genre.family,
  familyLabel: FAMILY_LABELS[genre.family],
  tagline: genre.tagline,
  bpm: genre.bpm,
  moods: genre.moods.map((mood) => MOOD_LABELS[mood]),
}));

export function genresByFamily(family: GenreFamily): GenreProfile[] {
  return GENRE_ATLAS.filter((genre) => genre.family === family);
}

const KEYWORD_GENRE_MAP: Array<[RegExp, string]> = [
  [/drum\s*(&|and|n)?\s*bass|\bdnb\b|\bd&b\b|jungle|neurofunk/i, 'drum-and-bass'],
  [/amapiano/i, 'amapiano'],
  [/afrobeats?|afro\s*fusion|afropop/i, 'afrobeats'],
  [/dancehall|bashment|riddim/i, 'dancehall'],
  [/reggaeton|perreo|dembow/i, 'reggaeton'],
  [/latin\s*trap|trap\s*latino/i, 'latin-trap'],
  [/baile|funk\s*carioca/i, 'baile-funk'],
  [/kuduro/i, 'kuduro'],
  [/highlife/i, 'highlife'],
  [/cumbia/i, 'cumbia'],
  [/salsa|timba/i, 'salsa'],
  [/reggae|rocksteady|dub\b/i, 'reggae'],
  [/drill/i, 'drill'],
  [/trap/i, 'trap'],
  [/boom\s*bap|boombap|90s\s*hip/i, 'boom-bap'],
  [/lo-?fi|chillhop/i, 'lo-fi'],
  [/cloud\s*rap/i, 'cloud-rap'],
  [/phonk/i, 'phonk'],
  [/grime/i, 'grime'],
  [/jersey|club\s*music/i, 'jersey-club'],
  [/emo|sad\s*rap/i, 'emo-rap'],
  [/plugg|rage/i, 'rage'],
  [/hi-?p\s*h?o?p|rap|hiphop/i, 'trap'],
  [/tech\s*house/i, 'tech-house'],
  [/house/i, 'house'],
  [/techno/i, 'techno'],
  [/trance/i, 'trance'],
  [/dubstep|bass\s*music/i, 'dubstep'],
  [/future\s*bass/i, 'future-bass'],
  [/synthwave|retrowave|outrun/i, 'synthwave'],
  [/ambient|drone/i, 'ambient'],
  [/garage|2-?step/i, 'uk-garage'],
  [/hardstyle|hard\s*dance/i, 'hardstyle'],
  [/idm|glitch|experimental|avant/i, 'experimental'],
  [/hyperpop/i, 'hyperpop'],
  [/k-?pop|idol/i, 'k-pop'],
  [/dance\s*pop|edm\s*pop|electropop/i, 'dance-pop'],
  [/pop\s*punk|punk\s*pop|emo\s*pop/i, 'pop-punk'],
  [/ballad/i, 'pop-ballad'],
  [/indie\s*pop|bedroom/i, 'indie-pop'],
  [/pop/i, 'pop'],
  [/neo-?soul/i, 'neo-soul'],
  [/quiet\s*storm|slow\s*jam/i, 'quiet-storm'],
  [/gospel|worship|christian/i, 'gospel'],
  [/funk/i, 'funk'],
  [/r\s*&?\s*b|rnb|rhythm\s*and\s*blues/i, 'rnb'],
  [/alt\s*rock|alternative/i, 'alt-rock'],
  [/indie\s*rock|garage\s*rock|jangle/i, 'indie-rock'],
  [/post\s*rock/i, 'post-rock'],
  [/metal|metalcore|djent/i, 'metal'],
  [/blues/i, 'blues'],
  [/rock/i, 'rock'],
  [/bossa/i, 'bossa-nova'],
  [/bebop|bop\b/i, 'bebop'],
  [/smooth\s*jazz/i, 'smooth-jazz'],
  [/fusion/i, 'jazz-fusion'],
  [/jazz/i, 'jazz'],
  [/bluegrass|newgrass|string\s*band/i, 'bluegrass'],
  [/americana|roots/i, 'americana'],
  [/country/i, 'country'],
  [/folk/i, 'folk'],
  [/singer|songwriter/i, 'singer-songwriter'],
  [/trailer/i, 'trailer'],
  [/cinematic|film|score|epic/i, 'cinematic'],
  [/classical|orchestral|neoclassical|minimal/i, 'neoclassical'],
  [/downtempo|trip\s*hop|chillout|lounge/i, 'downtempo'],
  [/desi|bollywood|punjabi|indian/i, 'desi-pop'],
];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+\s&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Resolves any genre string an artist typed into the profile — including
 * names not in the atlas — to a usable rule set. Exact ids and labels win;
 * aliases come next; family keywords carry the rest. A genre S.M.U.V.E. has
 * never seen still gets a musically correct home instead of an error.
 */
export function resolveGenre(input: string | null | undefined): GenreProfile | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const needle = normalize(raw);
  if (!needle) return null;

  const exact = GENRE_ATLAS.find(
    (genre) =>
      normalize(genre.id) === needle ||
      normalize(genre.label) === needle ||
      genre.aliases.some((alias) => normalize(alias) === needle)
  );
  if (exact) return exact;

  const contains = GENRE_ATLAS.find((genre) =>
    [genre.id, genre.label, ...genre.aliases].some((candidate) => {
      const value = normalize(candidate);
      return value.length > 2 && (needle.includes(value) || value.includes(needle));
    })
  );
  if (contains) return contains;

  for (const [pattern, id] of KEYWORD_GENRE_MAP) {
    if (pattern.test(raw)) {
      return GENRE_BY_ID.get(id) ?? null;
    }
  }

  return null;
}

/** Resolves a list of declared subgenres, de-duplicated, best-effort. */
export function resolveSubgenres(values: unknown): GenreProfile[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const resolved: GenreProfile[] = [];
  for (const value of values) {
    const genre = resolveGenre(typeof value === 'string' ? value : '');
    if (genre && !seen.has(genre.id)) {
      seen.add(genre.id);
      resolved.push(genre);
    }
  }
  return resolved;
}

export function atlasSize(): number {
  return GENRE_ATLAS.length;
}

export function grooveById(id: string): GrooveTemplate {
  return GROOVE_BY_ID.get(id) ?? GROOVES[0];
}

export function progressionById(id: string): HarmonyTemplate {
  return PROGRESSION_BY_ID.get(id) ?? PROGRESSIONS[0];
}

export function bassStyleById(id: string): BassStyle {
  return BASS_STYLE_BY_ID.get(id) ?? BASS_STYLES[0];
}

export function arrangementById(id: string): ArrangementTemplate {
  return ARRANGEMENT_BY_ID.get(id) ?? ARRANGEMENTS[0];
}
