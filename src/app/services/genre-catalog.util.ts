/**
 * One canonical genre catalog for production, songwriting and the studio.
 *
 * The app had three separate genre tables — the adaptive engine's four curated
 * profiles, the songwriting structure library, and the produce service's BPM
 * and bar maps — and they disagreed. "Rap" resolved to Hip Hop in one, fell
 * through to the Pop structure in another, and landed on the generic 120 BPM
 * fallback in the third; Country, Blues, Rock, Gospel and Latin had no curated
 * profile at all, so those artists were told their genre was "artist-defined".
 *
 * This module is the single resolver. It understands aliases ("rnb", "boom
 * bap", "alt country", "drum and bass"), punctuation and casing, and hybrids
 * ("country trap", "jazz rap"), and it ships a real section-by-section song
 * structure for every family with the production note that makes each section
 * actionable in the Studio.
 *
 * Honesty rule: this table describes how a genre is typically built. It never
 * claims a commercial outcome, and an unresolvable genre returns null so the
 * caller can say "artist-defined" instead of inventing one.
 */

export type GenreFamilyId =
  | 'pop'
  | 'hip-hop'
  | 'rnb-soul'
  | 'country'
  | 'blues'
  | 'rock'
  | 'electronic'
  | 'folk'
  | 'jazz'
  | 'gospel'
  | 'latin'
  | 'afrobeats';

export interface GenreStructureSection {
  type: string;
  bars: number;
  /** What to do in this section, specific to the family. */
  description: string;
}

export interface GenreSongStructure {
  name: string;
  genre: string;
  totalBars: number;
  sections: GenreStructureSection[];
}

export interface GenreFamily {
  id: GenreFamilyId;
  label: string;
  aliases: string[];
  bpmRange: [number, number];
  /** 0–1 working energy a produced idea should start from. */
  energy: number;
  recommendedDaw: string[];
  mixPriorities: string[];
  recordingFocus: string[];
  sonicSignatures: string[];
  harmony: string[];
  vocalDelivery: string[];
  lyricalThemes: string[];
  arrangementPatterns: string[];
  structures: GenreSongStructure[];
}

const structure = (
  name: string,
  genre: string,
  sections: Array<[string, number, string]>
): GenreSongStructure => {
  const mapped = sections.map(([type, bars, description]) => ({
    type,
    bars,
    description,
  }));
  return {
    name,
    genre,
    sections: mapped,
    totalBars: mapped.reduce((total, section) => total + section.bars, 0),
  };
};

export const GENRE_FAMILIES: GenreFamily[] = [
  {
    id: 'pop',
    label: 'Pop',
    aliases: [
      'Pop',
      'Dance Pop',
      'Synth Pop',
      'Dream Pop',
      'Indie Pop',
      'K-Pop',
      'Electropop',
      'Chamber Pop',
    ],
    bpmRange: [100, 124],
    energy: 0.78,
    recommendedDaw: ['Logic Pro', 'Ableton Live', 'FL Studio', 'Pro Tools'],
    mixPriorities: [
      'Vocal intelligibility',
      'Hook lift in the chorus',
      'Tight low-end without mud',
      'Width on synths, mono bass',
    ],
    recordingFocus: [
      'Doubled or stacked lead vocal',
      'Comped verses for the best line, not the best take',
      'Punch-ins on the hook',
    ],
    sonicSignatures: [
      'Big stacked chorus vocal',
      'Simple four-chord loop',
      'Bright top end',
      'Sidechained pads',
    ],
    harmony: ['I–V–vi–IV', 'vi–IV–I–V', 'Major-key with a borrowed minor iv'],
    vocalDelivery: ['Clear lead with stacked harmony', 'Intimate verse, open chorus'],
    lyricalThemes: ['Direct emotional statement', 'One image repeated as the hook'],
    arrangementPatterns: ['Verse lift into pre-chorus', 'Chorus adds one new layer every time'],
    structures: [
      structure('Modern Pop Standard', 'pop', [
        ['intro', 8, 'Instrumental hook; state the title melody before any vocal'],
        ['verse', 16, 'Keep it sparse; one vocal, one rhythmic bed'],
        ['pre-chorus', 8, 'Remove the low end and raise the vocal'],
        ['chorus', 16, 'Stack the lead, open the top end, full drums'],
        ['verse', 16, 'Second verse adds a counter-line, not new elements'],
        ['pre-chorus', 8, 'Same lift, tighter automation'],
        ['chorus', 16, 'Bigger than the first: doubled hook, brighter mix'],
        ['bridge', 8, 'New chord, drop the drums, hold the vocal'],
        ['chorus', 16, 'Final chorus with ad-libs and the widest image'],
        ['outro', 8, 'Restate the hook and cold-stop or fade'],
      ]),
    ],
  },
  {
    id: 'hip-hop',
    label: 'Hip Hop',
    aliases: [
      'Hip Hop',
      'Hip-Hop',
      'Rap',
      'Trap',
      'Drill',
      'Boom Bap',
      'Cloud Rap',
      'Emo Rap',
      'Melodic Rap',
      'Phonk',
      'Grime',
      'Jazz Rap',
    ],
    bpmRange: [84, 100],
    energy: 0.72,
    recommendedDaw: ['FL Studio', 'Ableton Live', 'Logic Pro', 'Pro Tools'],
    mixPriorities: [
      'Kick clarity',
      '808 definition and mono weight',
      'Vocal presence over the beat',
      'Bass-mid separation',
    ],
    recordingFocus: [
      'Vocal takes by section, not the whole song',
      'Ad-libs on a separate track',
      'Punch for flow, not for perfection',
    ],
    sonicSignatures: [
      'Sub-bass weight',
      'Crisp hi-hat rolls',
      'Layered kicks',
      'Vocal processing that sits forward',
    ],
    harmony: ['One- or two-chord loop', 'Minor loop with a sampled tail'],
    vocalDelivery: ['Pocketed flow', 'Melodic rap hook', 'Sung chorus'],
    lyricalThemes: ['Lived detail and place', 'Specific claims over vague flexing'],
    arrangementPatterns: ['Hook first', 'Drop the drums for the last bar of a verse'],
    structures: [
      structure('Hook-First Rap', 'hip-hop', [
        ['intro', 8, 'Tag or sample flip; establish the loop with drums low'],
        ['hook', 8, 'Full beat, vocal hook front and centre'],
        ['verse', 16, 'Drop one element for the verse; keep the 808 moving'],
        ['hook', 8, 'Same hook, add ad-libs'],
        ['verse', 16, 'Switch flow; introduce the counter-melody'],
        ['hook', 8, 'Hook with doubled lead'],
        ['bridge', 8, 'Half-time or drum break, one bar of silence before the return'],
        ['hook', 8, 'Final hook, widest beat'],
        ['outro', 8, 'Loop out or cold stop'],
      ]),
      structure('Trap / Drill Run', 'hip-hop', [
        ['intro', 8, 'Hat pattern and 808 slide only'],
        ['hook', 8, 'Full drums, vocal hook with the slide answering'],
        ['verse', 16, 'Sparse percussion, vocal carries the pocket'],
        ['hook', 8, 'Hook returns unchanged'],
        ['verse', 16, 'Second verse, switch the hat pattern'],
        ['hook', 8, 'Final hook with ad-libs'],
        ['outro', 8, 'Strip to the 808 and stop'],
      ]),
    ],
  },
  {
    id: 'rnb-soul',
    label: 'R&B / Soul',
    aliases: [
      'R&B',
      'RnB',
      "R'n'B",
      'Rhythm and Blues',
      'Contemporary R&B',
      'Alternative R&B',
      'Neo Soul',
      'Neo-Soul',
      'Soul',
      'Motown',
      'Funk',
      'Quiet Storm',
    ],
    bpmRange: [68, 96],
    energy: 0.55,
    recommendedDaw: ['Logic Pro', 'Pro Tools', 'Ableton Live', 'FL Studio'],
    mixPriorities: [
      'Vocal warmth and air',
      'Mid-range clarity on keys',
      'Round low end, no boom',
      'Wide background vocal stack',
    ],
    recordingFocus: [
      'Lead vocal close and quiet',
      'Stacked harmonies, tuned to the chord',
      'Keep the breath and the room',
    ],
    sonicSignatures: [
      'Extended 7th and 9th chords',
      'Rhodes or warm keys',
      'Loose, behind-the-beat drums',
      'Layered background vocals',
    ],
    harmony: ['ii7–V7–Imaj7', 'i7–IV7–bVII–bIII', 'Slash chords under a moving bass'],
    vocalDelivery: ['Runs and melisma used sparingly', 'Breathy verse, open belt on the hook'],
    lyricalThemes: ['Intimacy and consequence', 'One concrete scene instead of a mood'],
    arrangementPatterns: ['Keys carry the verse', 'Bridge drops to vocals and one chord'],
    structures: [
      structure('R&B Slow Jam', 'rnb-soul', [
        ['intro', 8, 'Keys and a vocal ad-lib; no drums yet'],
        ['verse', 16, 'Drums enter on beat 1 of bar 5; keep the vocal low'],
        ['pre-chorus', 4, 'Lift with harmony, hold the drums back'],
        ['chorus', 16, 'Full stack, bass forward, vocal doubled'],
        ['verse', 16, 'Second verse adds a counter-melody'],
        ['chorus', 16, 'Same hook, wider stack'],
        ['bridge', 8, 'Drop to keys and lead; one chord change'],
        ['chorus', 16, 'Final chorus with runs and ad-libs'],
        ['outro', 8, 'Vamp the last two bars and fade'],
      ]),
    ],
  },
  {
    id: 'country',
    label: 'Country',
    aliases: [
      'Country',
      'Country Pop',
      'Outlaw Country',
      'Alt Country',
      'Country Rock',
      'Bluegrass',
      'Americana',
      'Red Dirt',
    ],
    bpmRange: [76, 118],
    energy: 0.6,
    recommendedDaw: ['Pro Tools', 'Logic Pro', 'Studio One'],
    mixPriorities: [
      'Lead vocal front, no competition',
      'Acoustic guitar body, not brightness',
      'Pedal steel and fiddle sitting behind the voice',
      'Natural drum room',
    ],
    recordingFocus: [
      'One great lead vocal, comped line by line',
      'Acoustic and electric doubled in different positions',
      'Keep the room in the drums',
    ],
    sonicSignatures: [
      'Acoustic strum driving the song',
      'Pedal steel answers',
      'Fiddle fills between lines',
      'Plain-spoken vocal',
    ],
    harmony: ['I–IV–V', 'I–V–vi–IV with a walk-up bass', 'Verse in a major key, chorus lifts a fourth'],
    vocalDelivery: ['Conversational and forward', 'Southern or regional accent kept, never imitated'],
    lyricalThemes: ['Place, work and consequence', 'Specific names and objects'],
    arrangementPatterns: ['Steel or fiddle fills in the vocal gaps', 'Chorus adds harmony, not more instruments'],
    structures: [
      structure('Country Verse–Chorus', 'country', [
        ['intro', 8, 'Acoustic and steel state the turn-around'],
        ['verse', 16, 'Story first; drums enter at bar 5'],
        ['chorus', 16, 'Harmony vocal, full band, steel under the voice'],
        ['verse', 16, 'Second verse raises the stakes of the story'],
        ['chorus', 16, 'Same hook, add the high harmony'],
        ['solo', 8, 'Steel or fiddle solo, then a two-bar drum break'],
        ['chorus', 16, 'Final chorus, tag the last line'],
        ['outro', 8, 'Turn-around and out'],
      ]),
    ],
  },
  {
    id: 'blues',
    label: 'Blues',
    aliases: [
      'Blues',
      'Delta Blues',
      'Chicago Blues',
      'Electric Blues',
      'Blues Rock',
      'Jump Blues',
      'Piedmont Blues',
    ],
    bpmRange: [60, 120],
    energy: 0.5,
    recommendedDaw: ['Pro Tools', 'Logic Pro'],
    mixPriorities: [
      'Guitar and vocal trade the front seat',
      'Midrange warmth on the amp',
      'Bass and kick locked, no sub boom',
      'Room sound on everything',
    ],
    recordingFocus: [
      'One take with the band if the pocket is there',
      'Amp in the room, not a plugin',
      'Keep the count-in if it earns the intro',
    ],
    sonicSignatures: [
      'Dominant 7th chords',
      'Shuffle or slow 12/8 feel',
      'Call-and-response guitar',
      'Bent notes, not perfect ones',
    ],
    harmony: ['12-bar I–IV–V with quick change', '8-bar minor blues', '9th chords on the turn-around'],
    vocalDelivery: ['Declarative, behind the beat', 'Call a line, answer it on guitar'],
    lyricalThemes: ['Trouble stated plainly', 'Repetition as structure, with a turn in the last line'],
    arrangementPatterns: ['Guitar answers every vocal line', 'Solo over the same form, no new section'],
    structures: [
      structure('12-Bar Blues Form', 'blues', [
        ['intro', 4, 'Band count-in or a solo guitar turn-around'],
        ['verse', 12, 'Two repeated lines, then the turn-around line'],
        ['verse', 12, 'Same form; guitar fills the gaps'],
        ['solo', 12, 'Guitar or harp solo over the form'],
        ['solo', 12, 'Second solo chorus, build the intensity'],
        ['verse', 12, 'Final verse, band drops on the last line'],
        ['outro', 4, 'Turn-around and stop'],
      ]),
    ],
  },
  {
    id: 'rock',
    label: 'Rock',
    aliases: [
      'Rock',
      'Alternative Rock',
      'Indie Rock',
      'Hard Rock',
      'Classic Rock',
      'Punk',
      'Pop Punk',
      'Grunge',
      'Post-Rock',
      'Metal',
    ],
    bpmRange: [100, 160],
    energy: 0.85,
    recommendedDaw: ['Pro Tools', 'Logic Pro', 'Ableton Live'],
    mixPriorities: [
      'Drum kit as one instrument',
      'Guitar layers panned apart',
      'Vocal cuts through the wall',
      'Bass fills the gap under the guitars',
    ],
    recordingFocus: [
      'Rhythm guitars double-tracked, tight',
      'Real amp or a committed amp sim',
      'Drum room mics for the chorus',
    ],
    sonicSignatures: [
      'Double-tracked rhythm guitars',
      'Loud/quiet dynamics',
      'Crash-heavy chorus',
      'Bass locked to the kick',
    ],
    harmony: ['Power-chord I–bVII–IV', 'i–VI–III–VII', 'Verse in the relative minor'],
    vocalDelivery: ['Restrained verse, pushed chorus', 'Shouted doubles on the hook'],
    lyricalThemes: ['Tension between what is said and what is felt', 'Concrete images, no abstractions'],
    arrangementPatterns: ['Quiet verse, loud chorus', 'Final chorus double-time or key lift'],
    structures: [
      structure('Rock Verse–Chorus', 'rock', [
        ['intro', 8, 'Guitar hook alone, drums enter at bar 5'],
        ['verse', 16, 'Tight and quiet; hats only under the vocal'],
        ['chorus', 16, 'Full kit, doubled guitars, crash on the downbeat'],
        ['verse', 16, 'Second verse adds a guitar texture'],
        ['chorus', 16, 'Same hook, wider guitars'],
        ['solo', 16, 'Guitar solo over the chorus form'],
        ['chorus', 16, 'Final chorus, double-time ending'],
        ['outro', 8, 'Feedback or a hard stop'],
      ]),
    ],
  },
  {
    id: 'electronic',
    label: 'Electronic',
    aliases: [
      'Electronic',
      'EDM',
      'House',
      'Techno',
      'Trance',
      'Dubstep',
      'Drum & Bass',
      'Drum and Bass',
      'Synthwave',
      'Ambient',
      'Lo-Fi',
      'Lofi',
      'Future Bass',
      'Garage',
    ],
    bpmRange: [120, 140],
    energy: 0.8,
    recommendedDaw: ['Ableton Live', 'FL Studio', 'Logic Pro', 'Bitwig Studio'],
    mixPriorities: [
      'Kick and sub locked, mono',
      'Sidechain space for the drop',
      'Synth clarity across the spectrum',
      'Reverb and delay as depth, not wash',
    ],
    recordingFocus: [
      'Sound design before arrangement',
      'One signature patch per track',
      'Automate filters, not just levels',
    ],
    sonicSignatures: [
      'Layered synth lead',
      'Punchy transient-designed drums',
      'Filtered build into a full drop',
      'Reverb tail on the break',
    ],
    harmony: ['Two-chord minor stab', 'Suspended pad over a moving bass'],
    vocalDelivery: ['Chopped and processed', 'Ethereal top line'],
    lyricalThemes: ['Movement and atmosphere', 'One phrase used as texture'],
    arrangementPatterns: ['Build–drop–break–build', 'Introduce elements every 8 bars'],
    structures: [
      structure('Club Build–Drop', 'electronic', [
        ['intro', 16, 'Drums and hats only; establish the pulse'],
        ['build', 8, 'Filter up, add the vocal chop'],
        ['drop', 16, 'Full low end and lead; no new ideas'],
        ['break', 16, 'Remove the kick, expose the pad'],
        ['build', 8, 'Second build with a new top line'],
        ['drop', 16, 'Drop returns with the variant lead'],
        ['outro', 16, 'Strip elements every 4 bars'],
      ]),
    ],
  },
  {
    id: 'folk',
    label: 'Folk / Acoustic',
    aliases: [
      'Folk',
      'Acoustic',
      'Singer-Songwriter',
      'Indie Folk',
      'Fingerstyle',
      'Contemporary Folk',
    ],
    bpmRange: [62, 104],
    energy: 0.4,
    recommendedDaw: ['Logic Pro', 'Pro Tools', 'GarageBand'],
    mixPriorities: [
      'Vocal and guitar in the same room',
      'Guitar body over pick brightness',
      'Natural dynamics, no brickwall',
      'Minimal processing',
    ],
    recordingFocus: [
      'One mic, one performance, no comping unless needed',
      'Finger noise kept',
      'Room tone continuous across edits',
    ],
    sonicSignatures: [
      'Fingerpicked guitar',
      'Intimate close vocal',
      'Sparse arrangement',
      'Dynamic range preserved',
    ],
    harmony: ['Open chords with a capo', 'I–iii–IV–I', 'Modal tuning drones'],
    vocalDelivery: ['Conversational and unforced', 'Harmony only in the last chorus'],
    lyricalThemes: ['Specific memory and place', 'One turn that reframes the story'],
    arrangementPatterns: ['Add one instrument per verse', 'Bridge drops to voice and guitar'],
    structures: [
      structure('Folk Story', 'folk', [
        ['intro', 4, 'Guitar figure alone'],
        ['verse', 16, 'Voice and guitar; no drums'],
        ['chorus', 12, 'Add bass and a second guitar'],
        ['verse', 16, 'Second verse keeps the arrangement still'],
        ['chorus', 12, 'Add harmony vocal'],
        ['bridge', 8, 'Voice and guitar only, new chord'],
        ['chorus', 12, 'Full arrangement, one final line'],
        ['outro', 8, 'Guitar figure returns'],
      ]),
    ],
  },
  {
    id: 'jazz',
    label: 'Jazz',
    aliases: [
      'Jazz',
      'Bebop',
      'Swing',
      'Fusion',
      'Smooth Jazz',
      'Modal Jazz',
      'Nu Jazz',
    ],
    bpmRange: [88, 200],
    energy: 0.55,
    recommendedDaw: ['Pro Tools', 'Logic Pro', 'Ableton Live'],
    mixPriorities: [
      'Drums and bass as the time feel',
      'Horn or keys front, no hype',
      'Room and bleed kept',
      'Minimal compression',
    ],
    recordingFocus: [
      'Live band, minimal overdubs',
      'Keep the count-in and the conversation',
      'Solo takes complete, not comped',
    ],
    sonicSignatures: [
      'Extended harmony',
      'Ride cymbal defining the time',
      'Upright bass tone',
      'Trading fours',
    ],
    harmony: ['ii–V–I with substitutions', 'Rhythm changes', 'Modal vamp'],
    vocalDelivery: ['Behind the beat', 'Scat or straight delivery, never both at once'],
    lyricalThemes: ['Standard form used as a frame', 'Plain language over dense harmony'],
    arrangementPatterns: ['Head–solos–head', 'Trading fours with the drummer'],
    structures: [
      structure('32-Bar Standard', 'jazz', [
        ['intro', 8, 'Piano or bass states the form'],
        ['head', 32, 'Melody in, band comps'],
        ['solo', 32, 'First solo over the full form'],
        ['solo', 32, 'Second solo, trade fours for the last 8'],
        ['head', 32, 'Melody out, thinner arrangement'],
        ['outro', 8, 'Tag the last two bars'],
      ]),
    ],
  },
  {
    id: 'gospel',
    label: 'Gospel',
    aliases: [
      'Gospel',
      'Worship',
      'Contemporary Christian',
      'Christian',
      'Spiritual',
      'Praise and Worship',
    ],
    bpmRange: [68, 128],
    energy: 0.7,
    recommendedDaw: ['Logic Pro', 'Pro Tools', 'Ableton Live'],
    mixPriorities: [
      'Choir stack wide, lead in front',
      'Organ and keys as the bed',
      'Drums with a real pocket',
      'Bass with movement, not just roots',
    ],
    recordingFocus: [
      'Live choir if possible, in sections',
      'Organ and piano separate for control',
      'Keep the room and the claps',
    ],
    sonicSignatures: [
      'Hammond organ bed',
      'Choir vamp',
      'Shouted lead ad-libs',
      'Walking bass under the vamp',
    ],
    harmony: ['I–IV–I with a passing ii', 'Minor-to-major turn on the vamp', 'Modulation up for the last chorus'],
    vocalDelivery: ['Runs and shouts earned by the build', 'Choir answers the lead'],
    lyricalThemes: ['Testimony stated plainly', 'One line repeated until it lands'],
    arrangementPatterns: ['Verse builds into a vamp', 'Key lift on the final chorus'],
    structures: [
      structure('Gospel Build + Vamp', 'gospel', [
        ['intro', 8, 'Organ pad and a piano figure'],
        ['verse', 16, 'Lead with keys; drums enter at bar 9'],
        ['chorus', 16, 'Choir enters, full band'],
        ['verse', 16, 'Second verse, hold the choir back'],
        ['chorus', 16, 'Choir doubled, bass walks'],
        ['vamp', 32, 'Two-chord vamp; lead ad-libs over the choir'],
        ['outro', 8, 'Key lift and stop'],
      ]),
    ],
  },
  {
    id: 'latin',
    label: 'Latin',
    aliases: [
      'Latin',
      'Reggaeton',
      'Salsa',
      'Bachata',
      'Cumbia',
      'Merengue',
      'Regional Mexican',
      'Corrido',
      'Latin Pop',
      'Dembow',
    ],
    bpmRange: [88, 100],
    energy: 0.75,
    recommendedDaw: ['FL Studio', 'Ableton Live', 'Logic Pro', 'Pro Tools'],
    mixPriorities: [
      'Dembow or clave pattern forward',
      'Bass and kick locked',
      'Vocal cutting through percussion',
      'Bright but not harsh top end',
    ],
    recordingFocus: [
      'Percussion recorded as a section',
      'Vocal doubles on the hook',
      'Guitar or tres as the answering voice',
    ],
    sonicSignatures: [
      'Dembow or clave rhythm',
      'Syncopated bass',
      'Percussion layers',
      'Sung hook over a rap verse',
    ],
    harmony: ['i–VI–III–VII', 'I–V–vi–IV with a syncopated bass', 'Two-chord montuno'],
    vocalDelivery: ['Sung hook and rhythmic verse', 'Call-and-response with the chorus'],
    lyricalThemes: ['Movement, place and desire', 'One recurring phrase as the hook'],
    arrangementPatterns: ['Percussion break before the last chorus', 'Hook first, verse after'],
    structures: [
      structure('Reggaeton / Latin Pop', 'latin', [
        ['intro', 8, 'Dembow and bass only'],
        ['hook', 8, 'Sung hook with the full percussion'],
        ['verse', 16, 'Rhythmic verse, keep the dembow'],
        ['hook', 8, 'Same hook, add the chorus answer'],
        ['verse', 16, 'Second verse, switch the percussion'],
        ['hook', 8, 'Hook returns'],
        ['bridge', 8, 'Percussion break, one vocal line'],
        ['hook', 16, 'Final hook doubled'],
        ['outro', 8, 'Strip to percussion and stop'],
      ]),
    ],
  },
  {
    id: 'afrobeats',
    label: 'Afrobeats',
    aliases: [
      'Afrobeats',
      'Afrobeat',
      'Afrofusion',
      'Afropop',
      'Amapiano',
      'Dancehall',
      'Afro Swing',
    ],
    bpmRange: [96, 116],
    energy: 0.72,
    recommendedDaw: ['FL Studio', 'Ableton Live', 'Logic Pro'],
    mixPriorities: [
      'Kick and log-drum pocket',
      'Percussion spread wide',
      'Vocal light and forward',
      'Sub supporting, never swamping',
    ],
    recordingFocus: [
      'Percussion layers played, not programmed flat',
      'Vocal doubles on the hook',
      'Keep the shaker continuous',
    ],
    sonicSignatures: [
      'Log drum or plucked bass',
      'Shaker and conga layers',
      'Sung hook with a rhythmic verse',
      'Sparse chord stabs',
    ],
    harmony: ['Two-chord plucked loop', 'Major key with a minor turn on the hook'],
    vocalDelivery: ['Melodic and light', 'Call-and-response hook'],
    lyricalThemes: ['Joy, movement and specific place', 'One phrase the crowd can answer'],
    arrangementPatterns: ['Percussion drop before the hook', 'Hook first, verse second'],
    structures: [
      structure('Afrobeats Hook Cycle', 'afrobeats', [
        ['intro', 8, 'Shaker and log drum establish the pocket'],
        ['hook', 8, 'Sung hook, full percussion'],
        ['verse', 16, 'Vocal light, drop the chord stabs'],
        ['hook', 8, 'Hook with the group answer'],
        ['verse', 16, 'Second verse, add a guitar pluck'],
        ['hook', 8, 'Hook returns'],
        ['bridge', 8, 'Percussion break, one vocal line'],
        ['hook', 8, 'Final hook, everything in'],
        ['outro', 8, 'Percussion out'],
      ]),
    ],
  },
];

/** Compact word-level form so "R&B", "rnb" and "R and B" all resolve. */
const canonical = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\brnb\b/g, 'r and b')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ALIAS_INDEX: Array<{ alias: string; family: GenreFamily }> =
  GENRE_FAMILIES.flatMap((family) =>
    family.aliases.map((alias) => ({ alias: canonical(alias), family }))
  ).sort((a, b) => b.alias.length - a.alias.length);

export interface GenreResolution {
  family: GenreFamily;
  /** The label the artist typed, trimmed; falls back to the family label. */
  label: string;
  /** Other families named in a hybrid ("Country Trap" → hip-hop). */
  secondary: GenreFamily[];
  hybrid: boolean;
}

/**
 * Resolve free-text genre input to a family, or null when nothing matches.
 *
 * Exact matches win first; then the longest alias that appears as whole words,
 * so "Chicago Blues" is blues rather than rock, and "Country Trap" resolves
 * country as primary with hip-hop recorded as the hybrid half rather than
 * silently picking one.
 */
export function resolveGenre(input?: string | null): GenreResolution | null {
  const text = canonical(input ?? '');
  if (!text) return null;

  const exact = ALIAS_INDEX.find((entry) => entry.alias === text);
  if (exact) {
    return {
      family: exact.family,
      label: (input ?? '').trim() || exact.family.label,
      secondary: [],
      hybrid: false,
    };
  }

  // Every alias that appears as whole words, ordered by where it appears, so a
  // hybrid reads the way the artist wrote it: "Country Trap" is country first
  // with hip-hop as the second half, not whichever alias happens to be longer.
  const matched = ALIAS_INDEX.map((entry) => ({
    family: entry.family,
    index: text.search(new RegExp(`(^| )${entry.alias}( |$)`)),
    length: entry.alias.length,
  }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index || b.length - a.length);
  if (!matched.length) return null;

  const primary = matched[0].family;
  const secondary: GenreFamily[] = [];
  for (const entry of matched) {
    if (entry.family.id !== primary.id && !secondary.some((f) => f.id === entry.family.id)) {
      secondary.push(entry.family);
    }
  }

  return {
    family: primary,
    label: (input ?? '').trim() || primary.label,
    secondary,
    hybrid: secondary.length > 0,
  };
}

/** The family's primary song structure, or null for an unknown genre. */
export function structureForGenre(
  input?: string | null
): GenreSongStructure | null {
  return resolveGenre(input)?.family.structures[0] ?? null;
}

/** Working BPM range for a genre, or null when it cannot be resolved. */
export function bpmRangeForGenre(
  input?: string | null
): [number, number] | null {
  return resolveGenre(input)?.family.bpmRange ?? null;
}

/** Starting energy for a produced idea, or null for an unknown genre. */
export function energyForGenre(input?: string | null): number | null {
  return resolveGenre(input)?.family.energy ?? null;
}
