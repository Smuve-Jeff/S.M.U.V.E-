import type {
  ArrangementTemplate,
  BassStyle,
  GenreFamily,
  GenrePalette,
  GrooveTemplate,
  HarmonyTemplate,
  MelodyTraits,
  ModeId,
  MoodId,
} from '../composer.types';

/**
 * The atlas foundation — the vocabulary every genre draws from.
 *
 * A genre is not a hard-coded beat. It is a set of choices: which grooves are
 * in the pocket, which harmonic cycles belong to the scene, which bass
 * behaviour carries the low end, and how a record of that genre is built.
 * Keeping the vocabulary shared means S.M.U.V.E. can combine it freshly on
 * every request instead of replaying one memorised loop.
 */

export const MODE_LABELS: Record<ModeId, string> = {
  ionian: 'Major (Ionian)',
  aeolian: 'Natural minor (Aeolian)',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  'harmonic-minor': 'Harmonic minor',
  'phrygian-dominant': 'Phrygian dominant',
  'major-pentatonic': 'Major pentatonic',
  'minor-pentatonic': 'Minor pentatonic',
  blues: 'Blues',
  'whole-tone': 'Whole tone',
};

export const MODE_SCALES: Record<ModeId, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
  'phrygian-dominant': [0, 1, 4, 5, 7, 8, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  'whole-tone': [0, 2, 4, 6, 8, 10],
};

export const FAMILY_LABELS: Record<GenreFamily, string> = {
  'hip-hop': 'Hip Hop',
  electronic: 'Electronic',
  pop: 'Pop',
  'rnb-soul': 'R&B / Soul',
  rock: 'Rock',
  jazz: 'Jazz',
  global: 'Global',
  'country-folk': 'Country / Folk',
  cinematic: 'Cinematic',
};

export const MOOD_LABELS: Record<MoodId, string> = {
  dark: 'Dark',
  bright: 'Bright',
  nostalgic: 'Nostalgic',
  aggressive: 'Aggressive',
  romantic: 'Romantic',
  hypnotic: 'Hypnotic',
  triumphant: 'Triumphant',
  melancholic: 'Melancholic',
  playful: 'Playful',
  luxurious: 'Luxurious',
  spiritual: 'Spiritual',
  cinematic: 'Cinematic',
};

/* ── Grooves ────────────────────────────────────────────────────── */

export const GROOVES: GrooveTemplate[] = [
  {
    id: 'trap-roller',
    name: 'Trap 808 Roller',
    bars: 1,
    swing: 0,
    description:
      'Kick on the downbeat with the second hit late, snare on three, sixteenth hats with open accents — the modern low-end pocket.',
    lanes: {
      kick: 'X.......X.X.....',
      clap: '....X.......X...',
      hat: 'xxxxxxxxxxxxxxxx',
      openhat: '......x.......x.',
      perc: '............x...',
    },
  },
  {
    id: 'drill-slide',
    name: 'UK Drill Slide',
    bars: 1,
    swing: 0,
    description:
      'Sparse kick with a displaced second hit, rim-heavy backbeat and rolling triplet-feel hats that leave room for the 808 slide.',
    lanes: {
      kick: 'X.....X..X......',
      snare: '....X.......X...',
      hat: 'x.xxx.x.x.xxx.x.',
      openhat: '......x.......x.',
      rim: '........x.......',
    },
  },
  {
    id: 'boom-bap-classic',
    name: 'Boom Bap Classic',
    bars: 1,
    swing: 0.58,
    description:
      'Dusty swung sixteenths, kick tucked off the grid, snare cracking on two and four — sample-era pocket.',
    lanes: {
      kick: 'X......X..X.....',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      perc: '..............x.',
    },
  },
  {
    id: 'lofi-dust',
    name: 'Lo-Fi Dust Pocket',
    bars: 1,
    swing: 0.62,
    description:
      'Lazy swing, brushed snare, no crash — the drums sit behind the beat on purpose.',
    lanes: {
      kick: 'X.....X...X.....',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      shaker: '..x...x...x...x.',
    },
  },
  {
    id: 'halftime-knock',
    name: 'Half-Time Knock',
    bars: 1,
    swing: 0,
    description:
      'One deep snare in the middle of the bar, enormous space above it; everything else is texture.',
    lanes: {
      kick: 'X.......X.......',
      snare: '........X.......',
      hat: 'x...x...x...x...',
      perc: '....x.......x...',
    },
  },
  {
    id: 'phonk-cowbell',
    name: 'Phonk Cowbell Drive',
    bars: 1,
    swing: 0,
    description:
      'Four-pulse kick under a cowbell hook and saturated hats — Memphis energy, modern low end.',
    lanes: {
      kick: 'X...X...X...X...',
      snare: '....X.......X...',
      hat: 'xxxxxxxxxxxxxxxx',
      perc: '..x...x...x...x.',
    },
  },
  {
    id: 'jersey-club',
    name: 'Jersey Club Bounce',
    bars: 1,
    swing: 0,
    description:
      'Triplet-shaped kick bursts, relentless clap backbeat and a bed-squeak percussion answer.',
    lanes: {
      kick: 'X..X..X...X..X..',
      clap: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      perc: '..x..x..x..x..x.',
    },
  },
  {
    id: 'grime-esk',
    name: 'Grime Eskibeat',
    bars: 1,
    swing: 0,
    description:
      'Cold, square-wave drums: hard kick, clipped snare, hats that roll unevenly on purpose.',
    lanes: {
      kick: 'X.....X...X.....',
      snare: '....X.......X...',
      hat: 'x.xxx.x.x.xxx.x.',
      rim: '........x.......',
    },
  },
  {
    id: 'house-four',
    name: 'Four-on-the-Floor',
    bars: 1,
    swing: 0,
    description:
      'Every beat on the kick, clap on two and four, open hat on the offbeat — the club constant.',
    lanes: {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      hat: '..x...x...x...x.',
      openhat: '..x...x...x...x.',
    },
  },
  {
    id: 'tech-house-shuffle',
    name: 'Tech House Shuffle',
    bars: 1,
    swing: 0.12,
    description:
      'Four-four kick with sixteenth hats and a shaker answering late — built for a rolling groove.',
    lanes: {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      shaker: '..x...x...x...x.',
      perc: '.....x......x...',
    },
  },
  {
    id: 'techno-drive',
    name: 'Techno Drive',
    bars: 1,
    swing: 0,
    description:
      'Metronomic kick, offbeat open hat, a single rim accent — tension from repetition, not busy-ness.',
    lanes: {
      kick: 'X...X...X...X...',
      openhat: '..x...x...x...x.',
      rim: '.......x........',
      hat: 'x..x..x..x..x..x',
    },
  },
  {
    id: 'trance-pulse',
    name: 'Trance Pulse',
    bars: 1,
    swing: 0,
    description:
      'Four-four kick, rolling sixteenth bass implied by the hats, clap lift on the backbeat.',
    lanes: {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      hat: 'xxxxxxxxxxxxxxxx',
      openhat: '..x...x...x...x.',
    },
  },
  {
    id: 'dnb-break',
    name: 'Drum & Bass Break',
    bars: 2,
    swing: 0,
    description:
      'Two-bar breakbeat: kick on one, ghosted kick late, snares on the three and the turnaround.',
    lanes: {
      kick: 'X.......X.......' + 'X.........X.....',
      snare: '....X.......X...' + '....X......X..X.',
      hat: 'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
      ride: '..x...x...x...x.' + '..x...x...x...x.',
    },
  },
  {
    id: 'dubstep-halftime',
    name: 'Dubstep Half-Time',
    bars: 1,
    swing: 0,
    description:
      'Half-time snare with a wide kick spread — leaves the drop room to breathe.',
    lanes: {
      kick: 'X.......X.......',
      snare: '........X.......',
      hat: 'x...x...x...x...',
      perc: '....x.......x...',
    },
  },
  {
    id: 'garage-shuffle',
    name: 'UK Garage Shuffle',
    bars: 1,
    swing: 0.3,
    description:
      'Skippy two-step: kick on the one and the and-of-three, snare displaced, shaker filling the gaps.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      shaker: '..x...x...x...x.',
    },
  },
  {
    id: 'hardstyle-pulse',
    name: 'Hardstyle Pulse',
    bars: 1,
    swing: 0,
    description:
      'Distorted four-four kick, reverse-bass implied, clap on the backbeat and nothing polite.',
    lanes: {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      hat: '..x...x...x...x.',
      perc: '.......x........',
    },
  },
  {
    id: 'synthwave-drive',
    name: 'Synthwave Drive',
    bars: 1,
    swing: 0,
    description:
      'Gated snare on two and four, eighth hats, tom fill at the turnaround.',
    lanes: {
      kick: 'X...X...X...X...',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      tom: '..............x.',
    },
  },
  {
    id: 'pop-drive',
    name: 'Pop Drive',
    bars: 1,
    swing: 0,
    description:
      'Kick one and three, snare two and four, eighth hats — the arrangement does the drama.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      clap: '....x.......x...',
    },
  },
  {
    id: 'pop-ballad',
    name: 'Ballad Frame',
    bars: 1,
    swing: 0,
    description:
      'Half-time skeleton with a late snare; space is the instrument.',
    lanes: {
      kick: 'X...............',
      snare: '........X.......',
      hat: 'x...x...x...x...',
      shaker: '....x.......x...',
    },
  },
  {
    id: 'rock-backbeat',
    name: 'Rock Backbeat',
    bars: 1,
    swing: 0,
    description:
      'Kick on one and the and-of-two, snare cracking two and four, eighth hats with a crash on the top.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      crash: 'X...............',
    },
  },
  {
    id: 'punk-drive',
    name: 'Punk Drive',
    bars: 1,
    swing: 0,
    description:
      'Four-to-the-floor kick under a hard backbeat — speed over subtlety.',
    lanes: {
      kick: 'X...X...X...X...',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      crash: 'X...............',
    },
  },
  {
    id: 'metal-double',
    name: 'Double-Kick Wall',
    bars: 1,
    swing: 0,
    description:
      'Sixteenth kick machine under a two-and-four snare; ride carries the subdivision.',
    lanes: {
      kick: 'XxXxXxXxXxXxXxXx',
      snare: '....X.......X...',
      ride: 'x.x.x.x.x.x.x.x.',
      crash: 'X...............',
    },
  },
  {
    id: 'indie-rock-groove',
    name: 'Indie Rock Groove',
    bars: 1,
    swing: 0,
    description:
      'Kick pushed late, tambourine on the eighths, tom answer in the last beat.',
    lanes: {
      kick: 'X.....X...X.....',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      tom: '..............x.',
    },
  },
  {
    id: 'funk-pocket',
    name: 'Funk Pocket',
    bars: 1,
    swing: 0.14,
    description:
      'Syncopated kick bursts, ghosted snares and sixteenth hats — everything locked to the one.',
    lanes: {
      kick: 'X..X..x...X.x...',
      snare: '....X..x....X..x',
      hat: 'xxxxxxxxxxxxxxxx',
      clap: '....o.......o...',
    },
  },
  {
    id: 'gospel-pocket',
    name: 'Gospel Pocket',
    bars: 1,
    swing: 0.18,
    description:
      'Deep kick, snare on two and four with a ghost, tambourine lift — built for choir-sized harmony.',
    lanes: {
      kick: 'X.....X...X.....',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      clap: '....x.......x...',
      shaker: '..x...x...x...x.',
    },
  },
  {
    id: 'neo-soul-pocket',
    name: 'Neo-Soul Pocket',
    bars: 1,
    swing: 0.26,
    description:
      'Drums laid back so far they almost fall over; rim click and hat carry the time.',
    lanes: {
      kick: 'X......X..X.....',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      rim: '........x.......',
    },
  },
  {
    id: 'quiet-storm',
    name: 'Quiet Storm',
    bars: 1,
    swing: 0.22,
    description:
      'Soft kick, brushed snare, eighth hats — a ballad bed that never crowds the vocal.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....x.......x...',
      hat: 'x...x...x...x...',
      shaker: '....x.......x...',
    },
  },
  {
    id: 'blues-shuffle',
    name: 'Blues Shuffle',
    bars: 1,
    swing: 0.6,
    description:
      'Shuffled ride, kick on one and three, snare on two and four with a lazy ghost.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....X.......X...',
      ride: 'x.xxx.x.x.xxx.x.',
      hat: '..x...x...x...x.',
    },
  },
  {
    id: 'jazz-swing',
    name: 'Jazz Swing',
    bars: 1,
    swing: 0.66,
    description:
      'Ride pattern with the skip, hi-hat on two and four, kick feathering the bass drum.',
    lanes: {
      ride: 'x.xxx.x.x.xxx.x.',
      hat: '....x.......x...',
      kick: 'X.......x.......',
      snare: '....x.......x...',
    },
  },
  {
    id: 'bebop-ride',
    name: 'Bebop Ride',
    bars: 1,
    swing: 0.66,
    description:
      'Ride-driven bebop time with snare comping accents and a bass-drum drop bomb.',
    lanes: {
      ride: 'x.xxx.x.x.xxx.x.',
      hat: '....x.......x...',
      kick: 'X..x....X..x....',
      snare: '....x.......x...',
    },
  },
  {
    id: 'bossa-clave',
    name: 'Bossa Clave',
    bars: 1,
    swing: 0,
    description:
      'Partido-alto rim clave, soft kick, shaker sixteenths — gentle forward motion.',
    lanes: {
      rim: '..x..x...x..x...',
      kick: 'X.....X...X.....',
      shaker: 'x.x.x.x.x.x.x.x.',
      hat: '....x.......x...',
    },
  },
  {
    id: 'salsa-clave',
    name: 'Salsa Clave',
    bars: 2,
    swing: 0,
    description:
      'Two-three son clave with conga answer and a bass-drum push on the two side.',
    lanes: {
      rim: 'x..x..x...x.x...' + 'x..x..x...x.x...',
      kick: 'X.....X...X.....' + 'X.....X...X.....',
      perc: '..x..x..x..x..x.' + '..x..x..x..x..x.',
      shaker: 'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    id: 'reggae-one-drop',
    name: 'One Drop',
    bars: 1,
    swing: 0.24,
    description:
      'Kick and snare together on the three, hats on the offbeats — the skank does the rest.',
    lanes: {
      kick: '........X.......',
      snare: '........X.......',
      hat: '..x...x...x...x.',
      rim: '....x.......x...',
    },
  },
  {
    id: 'dancehall-riddim',
    name: 'Dancehall Riddim',
    bars: 1,
    swing: 0,
    description:
      'Kick on one and the and-of-two, snare on three, percussion answering every gap.',
    lanes: {
      kick: 'X.....X...X.....',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      perc: '..x...x...x...x.',
    },
  },
  {
    id: 'afrobeats-groove',
    name: 'Afrobeats Groove',
    bars: 1,
    swing: 0.16,
    description:
      'Light kick, syncopated clap, rolling shaker and log-drum answer — everything conversational.',
    lanes: {
      kick: 'X.....X...X.....',
      clap: '....X....x..X...',
      shaker: 'x.xxx.x.x.xxx.x.',
      perc: '..x..x....x..x..',
    },
  },
  {
    id: 'amapiano-log',
    name: 'Amapiano Log Drum',
    bars: 1,
    swing: 0.1,
    description:
      'Soft four-four kick, shaker sixteenths, log-drum syncopation carrying the hook.',
    lanes: {
      kick: 'X...X...X...X...',
      snare: '....x.......x...',
      shaker: '..x...x...x...x.',
      perc: '..x..x..x..x..x.',
    },
  },
  {
    id: 'dembow',
    name: 'Dembow',
    bars: 1,
    swing: 0,
    description:
      'The dembow clave in percussion over a four-four kick and a hard backbeat.',
    lanes: {
      kick: 'X...X...X...X...',
      snare: '....X.......X...',
      perc: '...x..x....x..x.',
      hat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    id: 'hyperpop-burst',
    name: 'Hyperpop Burst',
    bars: 1,
    swing: 0,
    description:
      'Clipped four-four kick, snare/clap stack, sixteenth hats and a pitched percussion stab.',
    lanes: {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      hat: 'xxxxxxxxxxxxxxxx',
      perc: '..x.x...x.x.x...',
      snare: '....x.......x...',
    },
  },
  {
    id: 'emo-rap-halftime',
    name: 'Emo Rap Half-Time',
    bars: 1,
    swing: 0,
    description:
      'Half-time snare with a soft kick and acoustic-feel hats — guitar-led space.',
    lanes: {
      kick: 'X.......X.......',
      snare: '........X.......',
      hat: 'x.x.x.x.x.x.x.x.',
      perc: '....x.......x...',
    },
  },
  {
    id: 'country-shuffle',
    name: 'Country Shuffle',
    bars: 1,
    swing: 0.42,
    description:
      'Swung eighth hats, snare on two and four, kick on one and three with a train-beat feel.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      rim: '..x...x...x...x.',
    },
  },
  {
    id: 'bluegrass-chop',
    name: 'Bluegrass Chop',
    bars: 1,
    swing: 0,
    description:
      'Mandolin chop on the backbeat, brushed snare, bass on one and three.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      perc: '..x...x...x...x.',
    },
  },
  {
    id: 'folk-strum',
    name: 'Folk Strum Frame',
    bars: 1,
    swing: 0,
    description:
      'Light kick and snare, shaker eighths, no cymbals until the final section.',
    lanes: {
      kick: 'X.......X.......',
      snare: '....x.......x...',
      shaker: 'x...x...x...x...',
      hat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    id: 'cinematic-pulse',
    name: 'Cinematic Pulse',
    bars: 1,
    swing: 0,
    description:
      'Low tom pulse on the quarters, sub kick on one, percussion heartbeat underneath.',
    lanes: {
      kick: 'X...............',
      tom: 'x...x...x...x...',
      perc: '....x.......x...',
    },
  },
  {
    id: 'trailer-hits',
    name: 'Trailer Hits',
    bars: 4,
    swing: 0,
    description:
      'Four-bar impact grid: hits on one, the and-of-two, three — then a hole before the drop.',
    lanes: {
      kick: 'X......X....X...' + '................' + 'X......X....X...' + 'X...............',
      tom: '....x.......x...' + '................' + '....x.......x...' + 'x...x...x...x...',
      crash: 'X...............' + '................' + '................' + 'X...............',
    },
  },
  {
    id: 'orchestral-swell',
    name: 'Orchestral Swell',
    bars: 1,
    swing: 0,
    description:
      'Timpani on the downbeat, low percussion heartbeat, no backbeat — the orchestra carries the rhythm.',
    lanes: {
      kick: 'X...............',
      tom: '............x...',
      perc: '....x.......x...',
    },
  },
];

/* ── Harmony ────────────────────────────────────────────────────── */

export const PROGRESSIONS: HarmonyTemplate[] = [
  {
    id: 'minor-epic',
    name: 'i–VI–iv–v (epic minor)',
    degrees: [0, 5, 3, 4],
    barsPerChord: 1,
    feel: 'heroic lift with a minor centre',
  },
  {
    id: 'minor-pop',
    name: 'i–III–VII–iv',
    degrees: [0, 2, 6, 3],
    barsPerChord: 1,
    feel: 'anthemic minor with two major lifts',
  },
  {
    id: 'minor-lofi',
    name: 'i–VI–III–VII',
    degrees: [0, 5, 2, 6],
    barsPerChord: 1,
    feel: 'warm loop that never resolves hard',
  },
  {
    id: 'minor-dark',
    name: 'i–bII–i–bVII (Phrygian pull)',
    degrees: [0, 1, 0, 6],
    barsPerChord: 2,
    feel: 'menace from the flat second',
  },
  {
    id: 'minor-drill',
    name: 'i–VI–VII–v',
    degrees: [0, 5, 6, 4],
    barsPerChord: 2,
    feel: 'cold, sliding, unresolved',
  },
  {
    id: 'minor-pedal',
    name: 'i–i–VI–VII (pedal loop)',
    degrees: [0, 0, 5, 6],
    barsPerChord: 1,
    feel: 'static tonic for a vocal to sit on',
  },
  {
    id: 'dorian-vamp',
    name: 'i–IV dorian vamp',
    degrees: [0, 3],
    barsPerChord: 2,
    feel: 'minor with a raised sixth — hope in the dark',
  },
  {
    id: 'phrygian-vamp',
    name: 'i–bII phrygian vamp',
    degrees: [0, 1],
    barsPerChord: 2,
    feel: 'exotic tension, one semitone of dread',
  },
  {
    id: 'andalusian',
    name: 'i–VII–VI–V (Andalusian)',
    degrees: [0, 6, 5, 4],
    barsPerChord: 1,
    feel: 'descending classical tension',
  },
  {
    id: 'harmonic-cadence',
    name: 'i–iv–V–i (harmonic minor)',
    degrees: [0, 3, 4, 0],
    barsPerChord: 1,
    feel: 'proper dominant cadence in a minor key',
  },
  {
    id: 'major-pop',
    name: 'I–V–vi–IV',
    degrees: [0, 4, 5, 3],
    barsPerChord: 1,
    feel: 'the four-chord lift everyone sings',
  },
  {
    id: 'major-anthem',
    name: 'I–vi–IV–V',
    degrees: [0, 5, 3, 4],
    barsPerChord: 1,
    feel: '50s cadence with modern stadium weight',
  },
  {
    id: 'major-lift',
    name: 'vi–IV–I–V',
    degrees: [3, 4, 0, 5],
    barsPerChord: 1,
    feel: 'starts on the emotional sixth, resolves upward',
  },
  {
    id: 'major-plain',
    name: 'I–IV–V–I',
    degrees: [0, 3, 4, 0],
    barsPerChord: 1,
    feel: 'direct, unironic major cadence',
  },
  {
    id: 'mixolydian-rock',
    name: 'I–bVII–IV–I',
    degrees: [0, 6, 3, 0],
    barsPerChord: 1,
    feel: 'rock mixolydian swagger',
  },
  {
    id: 'blues-twelve',
    name: '12-bar blues',
    degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4],
    barsPerChord: 1,
    feel: 'the oldest working agreement in popular music',
  },
  {
    id: 'jazz-251',
    name: 'ii–V–I–vi',
    degrees: [1, 4, 0, 5],
    sevenths: true,
    barsPerChord: 1,
    feel: 'functional jazz motion that keeps turning',
  },
  {
    id: 'jazz-turnaround',
    name: 'I–vi–ii–V turnaround',
    degrees: [0, 5, 1, 4],
    sevenths: true,
    barsPerChord: 1,
    feel: 'the turnaround that restarts the form',
  },
  {
    id: 'bossa-cycle',
    name: 'i–ii–V–I bossa',
    degrees: [0, 1, 4, 0],
    sevenths: true,
    barsPerChord: 2,
    feel: 'soft chromatic motion under a quiet groove',
  },
  {
    id: 'neo-soul-rich',
    name: 'ii–V–I–vi (extended)',
    degrees: [1, 4, 0, 5],
    sevenths: true,
    ninths: true,
    barsPerChord: 1,
    feel: 'lush, unresolved, vocal-friendly',
  },
  {
    id: 'gospel-run',
    name: 'I–iii–IV–V (gospel lift)',
    degrees: [0, 2, 3, 4],
    sevenths: true,
    ninths: true,
    barsPerChord: 1,
    feel: 'church harmony with a repeated lift',
  },
  {
    id: 'afro-cycle',
    name: 'i–VI–III–VII (afro cycle)',
    degrees: [0, 5, 2, 6],
    barsPerChord: 1,
    feel: 'round, communal, endlessly repeatable',
  },
  {
    id: 'amapiano-cycle',
    name: 'i–iv–i–VII (amapiano)',
    degrees: [0, 3, 0, 6],
    barsPerChord: 2,
    feel: 'two-chord patience with a log-drum answer',
  },
  {
    id: 'reggaeton-loop',
    name: 'i–VI–III–VII (dembow loop)',
    degrees: [0, 5, 2, 6],
    barsPerChord: 2,
    feel: 'dark but danceable, built to repeat',
  },
  {
    id: 'reggae-loop',
    name: 'I–IV–I–V (one drop loop)',
    degrees: [0, 3, 0, 4],
    barsPerChord: 1,
    feel: 'open, dub-friendly, leaves holes for the skank',
  },
  {
    id: 'cinematic-minor',
    name: 'i–iv–VI–V (cinematic)',
    degrees: [0, 3, 5, 4],
    barsPerChord: 2,
    feel: 'slow-burn orchestral rise',
  },
  {
    id: 'whole-tone-drift',
    name: 'augmented drift',
    degrees: [0, 2, 4, 2],
    barsPerChord: 2,
    feel: 'no stable home — pure atmosphere',
  },
  {
    id: 'modal-lydian',
    name: 'I–II (lydian)',
    degrees: [0, 1],
    barsPerChord: 2,
    feel: 'floating major with a raised fourth',
  },
  {
    id: 'pentatonic-minor-vamp',
    name: 'i pentatonic vamp',
    degrees: [0, 3],
    barsPerChord: 2,
    feel: 'riff-first harmony, almost no chord motion',
  },
];

/* ── Bass behaviours ────────────────────────────────────────────── */

export const BASS_STYLES: BassStyle[] = [
  {
    id: '808-long',
    label: 'Held 808 root',
    rhythm: [0],
    approach: 'drone',
    sustain: 14,
    description: 'One long tuned 808 per chord — the note is the rhythm.',
  },
  {
    id: '808-glide',
    label: 'Sliding 808',
    rhythm: [0, 6, 10],
    approach: 'slide',
    glide: true,
    sustain: 6,
    description: 'Long root notes with slides into the next chord tone.',
  },
  {
    id: 'sub-pulse',
    label: 'Sub pulse',
    rhythm: [0, 4, 8, 12],
    approach: 'root',
    sustain: 3,
    description: 'Four locked pulses that glue to the kick.',
  },
  {
    id: 'root-fifth',
    label: 'Root–fifth pocket',
    rhythm: [0, 6, 8, 14],
    approach: 'root-fifth',
    sustain: 2,
    description: 'Root then fifth, leaving the backbeat open.',
  },
  {
    id: 'boom-bap-walk',
    label: 'Sample-chop walk',
    rhythm: [0, 3, 8, 11],
    approach: 'walk',
    sustain: 2,
    description: 'Short walking figures that imply the sample rather than copy it.',
  },
  {
    id: 'funk-16ths',
    label: 'Funk sixteenths',
    rhythm: [0, 2, 3, 6, 8, 10, 11, 14],
    approach: 'funk',
    sustain: 1,
    description: 'Ghosted sixteenths with octave pops on the accents.',
  },
  {
    id: 'motown-walk',
    label: 'Motown walk',
    rhythm: [0, 4, 8, 12],
    approach: 'walk',
    sustain: 3,
    description: 'Four quarter notes climbing to the next chord.',
  },
  {
    id: 'drill-slide',
    label: 'Drill 808 slide',
    rhythm: [0, 7],
    approach: 'slide',
    glide: true,
    sustain: 5,
    description: 'Sparse root with a slide that answers the kick pattern.',
  },
  {
    id: 'house-octave',
    label: 'House octave pump',
    rhythm: [2, 6, 10, 14],
    approach: 'octave',
    sustain: 2,
    description: 'Offbeat octaves that push the four-four kick.',
  },
  {
    id: 'techno-roll',
    label: 'Techno rolling sixteenths',
    rhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    approach: 'root',
    sustain: 1,
    description: 'Relentless eighth/sixteenth rolling root — hypnosis by repetition.',
  },
  {
    id: 'dnb-sub',
    label: 'Sub bass with break',
    rhythm: [0, 6, 10],
    approach: 'melodic',
    sustain: 3,
    description: 'Long sub notes that dodge the snare and answer the break.',
  },
  {
    id: 'dub-root',
    label: 'Dub root and drop',
    rhythm: [0, 8],
    approach: 'root',
    sustain: 4,
    description: 'Two heavy notes with space for the delay to bloom.',
  },
  {
    id: 'afro-melodic',
    label: 'Afro melodic bass',
    rhythm: [0, 3, 6, 10, 13],
    approach: 'melodic',
    sustain: 2,
    description: 'Singing, syncopated bass that trades phrases with the percussion.',
  },
  {
    id: 'jazz-walk',
    label: 'Walking bass',
    rhythm: [0, 4, 8, 12],
    approach: 'walk',
    sustain: 3,
    description: 'Four quarter notes connecting chords by step and approach.',
  },
  {
    id: 'rock-eighths',
    label: 'Driving eighths',
    rhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    approach: 'root',
    sustain: 2,
    description: 'Straight eighths locked to the kick — the engine of the section.',
  },
  {
    id: 'country-two',
    label: 'Root–five country',
    rhythm: [0, 8],
    approach: 'root-fifth',
    sustain: 6,
    description: 'One and three with a fifth on the back half — train-beat economy.',
  },
  {
    id: 'bossa-two',
    label: 'Bossa root–fifth',
    rhythm: [0, 6],
    approach: 'root-fifth',
    sustain: 4,
    description: 'Two soft notes per bar with a chromatic approach into the next chord.',
  },
  {
    id: 'orchestral-pedal',
    label: 'Pedal drone',
    rhythm: [0],
    approach: 'drone',
    sustain: 15,
    description: 'One sustained low pedal per section — the harmony changes above it.',
  },
  {
    id: 'pop-eighths',
    label: 'Pop eighth pulse',
    rhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    approach: 'root',
    sustain: 1,
    description: 'Clean eighths that lock the kick and leave the top open.',
  },
];

/* ── Arrangements ───────────────────────────────────────────────── */

export const ARRANGEMENTS: ArrangementTemplate[] = [
  {
    id: 'hiphop-standard',
    name: 'Modern rap form',
    description: 'Short intro, two verses, two hooks, a four-bar bridge and a clean outro.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 4, energy: 0.25, layers: ['drums', 'pad', 'melody'], development: 'Filtered motif, no low end', transition: 'Drop the 808 in' },
      { role: 'verse', label: 'Verse 1', bars: 12, energy: 0.6, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Pocket established, vocal is the focus', transition: 'Half-bar fill' },
      { role: 'hook', label: 'Hook', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Full stack, hook motif doubled', transition: 'Drop hats out' },
      { role: 'verse', label: 'Verse 2', bars: 12, energy: 0.68, layers: ['drums', 'bass', 'chords', 'melody', 'counter'], development: 'Counter-melody added under the verse', transition: 'Eight-bar riser' },
      { role: 'hook', label: 'Hook 2', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'arp', 'vocal-hook'], development: 'Hook with an arp lift', transition: 'Strip to keys' },
      { role: 'bridge', label: 'Bridge', bars: 4, energy: 0.45, layers: ['chords', 'pad', 'melody'], development: 'Low end out, harmony exposed', transition: 'Reverse into the last hook' },
      { role: 'hook', label: 'Final Hook', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Everything, hook an octave up', transition: 'Cut to motif' },
      { role: 'outro', label: 'Outro', bars: 4, energy: 0.2, layers: ['pad', 'melody'], development: 'Motif alone, tape stop', transition: '' },
    ],
  },
  {
    id: 'hiphop-short',
    name: 'Single edit',
    description: 'Two-minute radio math: hook first, verse, hook, out.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 2, energy: 0.3, layers: ['drums', 'melody'], development: 'Four-bar hook teased', transition: 'Hard cut' },
      { role: 'hook', label: 'Hook', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'melody', 'vocal-hook'], development: 'Front-load the hook', transition: 'Drop to verse' },
      { role: 'verse', label: 'Verse', bars: 8, energy: 0.62, layers: ['drums', 'bass', 'chords', 'melody'], development: 'One verse, no padding', transition: 'Fill' },
      { role: 'hook', label: 'Hook 2', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Hook with counter line', transition: 'Riser' },
      { role: 'outro', label: 'Outro', bars: 4, energy: 0.25, layers: ['chords', 'melody'], development: 'Motif out', transition: '' },
    ],
  },
  {
    id: 'edm-club',
    name: 'Club arc',
    description: 'Long intro, two builds, two drops, one breakdown — built for a DJ.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 8, energy: 0.2, layers: ['percussion', 'pad'], development: 'Filtered percussion only', transition: 'Add kick' },
      { role: 'build', label: 'Build 1', bars: 8, energy: 0.55, layers: ['drums', 'bass', 'pad', 'fx'], development: 'Riser, snare roll, low end opens', transition: 'One-beat silence' },
      { role: 'drop', label: 'Drop 1', bars: 16, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'melody', 'arp'], development: 'Main hook in full', transition: 'Filter sweep' },
      { role: 'breakdown', label: 'Breakdown', bars: 8, energy: 0.3, layers: ['chords', 'pad', 'melody'], development: 'Drums out, harmony exposed', transition: 'Snare build' },
      { role: 'build', label: 'Build 2', bars: 8, energy: 0.7, layers: ['drums', 'bass', 'pad', 'fx'], development: 'Faster riser, bigger tension', transition: 'Downbeat hit' },
      { role: 'drop', label: 'Drop 2', bars: 16, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'melody', 'arp', 'fx'], development: 'Drop with the counter line added', transition: 'Cut percussion' },
      { role: 'outro', label: 'Outro', bars: 8, energy: 0.2, layers: ['percussion', 'pad'], development: 'Percussion-only tail', transition: '' },
    ],
  },
  {
    id: 'pop-standard',
    name: 'Pop form',
    description: 'Intro, verse, pre, hook, second verse, pre, hook, bridge, final hook.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 4, energy: 0.3, layers: ['chords', 'melody'], development: 'Hook melody on keys', transition: 'Count-in' },
      { role: 'verse', label: 'Verse 1', bars: 8, energy: 0.5, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Story verse, no pad', transition: 'Pre lifts' },
      { role: 'pre-chorus', label: 'Pre-Chorus', bars: 4, energy: 0.7, layers: ['drums', 'bass', 'chords', 'pad', 'melody'], development: 'Harmony rises, drums push', transition: 'One-bar drop' },
      { role: 'hook', label: 'Chorus', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Full stack, hook doubled', transition: 'Post-hook tail' },
      { role: 'verse', label: 'Verse 2', bars: 8, energy: 0.55, layers: ['drums', 'bass', 'chords', 'melody', 'counter'], development: 'Counter-melody answers the vocal', transition: 'Pre lifts' },
      { role: 'pre-chorus', label: 'Pre-Chorus 2', bars: 4, energy: 0.75, layers: ['drums', 'bass', 'chords', 'pad', 'melody'], development: 'Bigger pre, open hats', transition: 'Drop' },
      { role: 'hook', label: 'Chorus 2', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'arp', 'vocal-hook'], development: 'Chorus with arp', transition: 'Bridge' },
      { role: 'bridge', label: 'Bridge', bars: 4, energy: 0.4, layers: ['chords', 'pad', 'melody'], development: 'New harmony, drums out', transition: 'Big riser' },
      { role: 'hook', label: 'Final Chorus', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Key lift or octave hook', transition: 'Outro' },
      { role: 'outro', label: 'Outro', bars: 4, energy: 0.25, layers: ['chords', 'melody'], development: 'Hook fades', transition: '' },
    ],
  },
  {
    id: 'rnb-standard',
    name: 'R&B form',
    description: 'Atmospheric intro, two verses, hook, bridge and a vamp outro.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 4, energy: 0.25, layers: ['chords', 'pad', 'melody'], development: 'Keys and texture only', transition: 'Drums slip in' },
      { role: 'verse', label: 'Verse 1', bars: 8, energy: 0.5, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Vocal-forward verse', transition: 'Fill' },
      { role: 'hook', label: 'Hook', bars: 8, energy: 0.9, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Harmony stack on the hook', transition: 'Post-hook' },
      { role: 'verse', label: 'Verse 2', bars: 8, energy: 0.58, layers: ['drums', 'bass', 'chords', 'melody', 'counter'], development: 'Second verse adds counter line', transition: 'Pre' },
      { role: 'hook', label: 'Hook 2', bars: 8, energy: 0.95, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'arp', 'vocal-hook'], development: 'Hook with arp shimmer', transition: 'Bridge' },
      { role: 'bridge', label: 'Bridge', bars: 8, energy: 0.45, layers: ['chords', 'pad', 'melody', 'counter'], development: 'Half-time feel, vocal runs', transition: 'Vamp' },
      { role: 'outro', label: 'Vamp Outro', bars: 8, energy: 0.5, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Loop the good part', transition: '' },
    ],
  },
  {
    id: 'rock-standard',
    name: 'Rock form',
    description: 'Riff intro, two verses, choruses, a solo and a double chorus.',
    slots: [
      { role: 'intro', label: 'Intro Riff', bars: 4, energy: 0.4, layers: ['drums', 'bass', 'chords'], development: 'The riff, nothing else', transition: 'Count' },
      { role: 'verse', label: 'Verse 1', bars: 8, energy: 0.55, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Hold the riff back', transition: 'Pre' },
      { role: 'pre-chorus', label: 'Pre', bars: 4, energy: 0.75, layers: ['drums', 'bass', 'chords', 'pad', 'melody'], development: 'Tension on the four', transition: 'Crash' },
      { role: 'hook', label: 'Chorus', bars: 8, energy: 1, layers: ['drums', 'bass', 'chords', 'pad', 'melody', 'counter', 'vocal-hook'], development: 'Riff and hook together', transition: 'Down' },
      { role: 'verse', label: 'Verse 2', bars: 8, energy: 0.6, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Bigger verse, ride bell', transition: 'Pre' },
      { role: 'hook', label: 'Chorus 2', bars: 8, energy: 1, layers: ['drums', 'bass', 'chords', 'pad', 'melody', 'counter', 'vocal-hook'], development: 'Chorus with harmony guitar', transition: 'Solo' },
      { role: 'solo', label: 'Solo', bars: 8, energy: 0.85, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Lead over the verse changes', transition: 'Riser' },
      { role: 'hook', label: 'Final Chorus', bars: 8, energy: 1, layers: ['drums', 'bass', 'chords', 'pad', 'melody', 'counter', 'vocal-hook'], development: 'Double chorus, octave lead', transition: 'Stop' },
      { role: 'outro', label: 'Outro', bars: 4, energy: 0.3, layers: ['drums', 'bass', 'chords'], development: 'Riff alone, hard stop', transition: '' },
    ],
  },
  {
    id: 'jazz-head',
    name: 'Jazz head form',
    description: 'Head, solo space, head out — the live-set shape.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 4, energy: 0.35, layers: ['chords', 'bass'], development: 'Rubato piano and bass', transition: 'Count' },
      { role: 'verse', label: 'Head', bars: 8, energy: 0.6, layers: ['drums', 'bass', 'chords', 'melody'], development: 'State the melody cleanly', transition: 'Solo' },
      { role: 'solo', label: 'Solo Space', bars: 16, energy: 0.7, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Two choruses over the changes', transition: 'Head out' },
      { role: 'verse', label: 'Head Out', bars: 8, energy: 0.65, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Melody returns with embellishment', transition: 'Tag' },
      { role: 'outro', label: 'Tag', bars: 4, energy: 0.3, layers: ['chords', 'bass'], development: 'Last four bars twice, ritardando', transition: '' },
    ],
  },
  {
    id: 'global-groove',
    name: 'Global groove form',
    description: 'Percussive intro, two verses and hooks, a breakdown and a dance-out.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 4, energy: 0.35, layers: ['percussion', 'pad', 'melody'], development: 'Percussion conversation', transition: 'Low end enters' },
      { role: 'verse', label: 'Verse 1', bars: 8, energy: 0.6, layers: ['drums', 'percussion', 'bass', 'chords', 'melody'], development: 'Groove and vocal trade phrases', transition: 'Fill' },
      { role: 'hook', label: 'Hook', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Hook doubles with the percussion', transition: 'Drop' },
      { role: 'verse', label: 'Verse 2', bars: 8, energy: 0.68, layers: ['drums', 'percussion', 'bass', 'chords', 'melody', 'counter'], development: 'Counter-melody and extra percussion', transition: 'Breakdown' },
      { role: 'breakdown', label: 'Breakdown', bars: 4, energy: 0.45, layers: ['percussion', 'bass', 'chords'], development: 'Drums drop, rhythm continues', transition: 'Build' },
      { role: 'hook', label: 'Hook 2', bars: 8, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'arp', 'vocal-hook'], development: 'Full hook with arp', transition: 'Out' },
      { role: 'outro', label: 'Dance Outro', bars: 8, energy: 0.5, layers: ['percussion', 'bass', 'chords'], development: 'Groove rides out', transition: '' },
    ],
  },
  {
    id: 'cinematic-arc',
    name: 'Cinematic arc',
    description: 'Slow build, first statement, breakdown, bigger statement, resolve.',
    slots: [
      { role: 'intro', label: 'Opening', bars: 8, energy: 0.15, layers: ['pad', 'melody'], development: 'Single texture and a motif', transition: 'Low pulse' },
      { role: 'build', label: 'Approach', bars: 8, energy: 0.4, layers: ['drums', 'bass', 'pad', 'melody'], development: 'Pulse grows, harmony widens', transition: 'Impact' },
      { role: 'drop', label: 'Statement', bars: 12, energy: 0.9, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'counter'], development: 'Full orchestra and percussion', transition: 'Cut' },
      { role: 'breakdown', label: 'Breakdown', bars: 8, energy: 0.25, layers: ['pad', 'melody', 'counter'], development: 'Fragile solo texture', transition: 'Build' },
      { role: 'build', label: 'Second Approach', bars: 8, energy: 0.65, layers: ['drums', 'bass', 'pad', 'melody', 'fx'], development: 'Riser and ostinato', transition: 'Impact' },
      { role: 'drop', label: 'Final Statement', bars: 12, energy: 1, layers: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'counter', 'fx'], development: 'Everything, motif in canon', transition: 'Release' },
      { role: 'outro', label: 'Resolution', bars: 6, energy: 0.15, layers: ['pad', 'melody'], development: 'Return to the opening texture', transition: '' },
    ],
  },
  {
    id: 'songwriter-form',
    name: 'Songwriter form',
    description: 'Voice and instrument lead; the arrangement earns every addition.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 4, energy: 0.2, layers: ['chords', 'melody'], development: 'One instrument, one idea', transition: 'Verse' },
      { role: 'verse', label: 'Verse 1', bars: 8, energy: 0.4, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Story first, arrangement second', transition: 'Chorus lift' },
      { role: 'hook', label: 'Chorus', bars: 8, energy: 0.8, layers: ['drums', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'The line everyone remembers', transition: 'Pull back' },
      { role: 'verse', label: 'Verse 2', bars: 8, energy: 0.45, layers: ['drums', 'bass', 'chords', 'melody', 'counter'], development: 'Add counter line only', transition: 'Pre' },
      { role: 'hook', label: 'Chorus 2', bars: 8, energy: 0.85, layers: ['drums', 'bass', 'chords', 'pad', 'melody', 'counter', 'vocal-hook'], development: 'Chorus with harmony vocal', transition: 'Bridge' },
      { role: 'bridge', label: 'Bridge', bars: 4, energy: 0.3, layers: ['chords', 'melody'], development: 'Drop the band, keep the truth', transition: 'Final lift' },
      { role: 'hook', label: 'Final Chorus', bars: 8, energy: 0.9, layers: ['drums', 'bass', 'chords', 'pad', 'melody', 'vocal-hook'], development: 'Full band, last chorus', transition: 'Out' },
      { role: 'outro', label: 'Outro', bars: 4, energy: 0.15, layers: ['chords', 'melody'], development: 'One instrument again', transition: '' },
    ],
  },
  {
    id: 'punk-short',
    name: 'Punk blast',
    description: 'Intro, verse, chorus, verse, chorus, out — under two minutes.',
    slots: [
      { role: 'intro', label: 'Intro', bars: 2, energy: 0.6, layers: ['drums', 'bass', 'chords'], development: 'Riff and count', transition: 'Go' },
      { role: 'verse', label: 'Verse', bars: 8, energy: 0.7, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Fast and plain', transition: 'Chorus' },
      { role: 'hook', label: 'Chorus', bars: 8, energy: 1, layers: ['drums', 'bass', 'chords', 'melody', 'vocal-hook'], development: 'Shout-along hook', transition: 'Go' },
      { role: 'verse', label: 'Verse 2', bars: 8, energy: 0.75, layers: ['drums', 'bass', 'chords', 'melody'], development: 'Same energy, different lyric', transition: 'Chorus' },
      { role: 'hook', label: 'Chorus 2', bars: 8, energy: 1, layers: ['drums', 'bass', 'chords', 'melody', 'vocal-hook'], development: 'Double-time ending', transition: 'Stop' },
      { role: 'outro', label: 'Outro', bars: 2, energy: 0.5, layers: ['drums', 'bass', 'chords'], development: 'One-hit stop', transition: '' },
    ],
  },
];

/* ── Family defaults ────────────────────────────────────────────── */

interface FamilyBase {
  modes: ModeId[];
  progressionIds: string[];
  grooveIds: string[];
  bassStyleIds: string[];
  melody: MelodyTraits;
  palette: GenrePalette;
  arrangementId: string;
}

export const FAMILY_BASE: Record<GenreFamily, FamilyBase> = {
  'hip-hop': {
    modes: ['aeolian', 'dorian', 'phrygian'],
    progressionIds: ['minor-epic', 'minor-lofi', 'minor-pedal', 'minor-dark'],
    grooveIds: ['boom-bap-classic', 'halftime-knock', 'trap-roller'],
    bassStyleIds: ['808-long', 'root-fifth', 'boom-bap-walk'],
    melody: { density: 'sparse', register: 'mid', noteLength: 'short', contour: 'wave', devices: ['repetition', 'space', 'motif displacement'] },
    palette: {
      drums: { label: 'Modern kit + 808', instrumentId: 'trap-kit-elite' },
      bass: { label: 'Tuned 808', instrumentId: 'trap-808-elite' },
      chords: { label: 'Warm keys', instrumentId: 'grand-piano' },
      lead: { label: 'Bell lead', instrumentId: 'synth-lead' },
      pad: { label: 'Dark pad', instrumentId: 'neon-shimmer' },
      perc: { label: 'Percussion layer', instrumentId: 'afro-cuban-kit' },
    },
    arrangementId: 'hiphop-standard',
  },
  electronic: {
    modes: ['aeolian', 'dorian', 'phrygian', 'mixolydian'],
    progressionIds: ['minor-pedal', 'minor-lofi', 'dorian-vamp', 'whole-tone-drift'],
    grooveIds: ['house-four', 'techno-drive', 'garage-shuffle'],
    bassStyleIds: ['house-octave', 'techno-roll', 'dnb-sub'],
    melody: { density: 'mid', register: 'high', noteLength: 'short', contour: 'arch', devices: ['riff repetition', 'filter motion', 'octave jumps'] },
    palette: {
      drums: { label: 'Electronic kit', instrumentId: 'modern-kit-elite' },
      bass: { label: 'Sub + mid bass', instrumentId: 'sub-commander' },
      chords: { label: 'Chord synth', instrumentId: 'supersaw-stack' },
      lead: { label: 'Arp lead', instrumentId: 'cyber-stab' },
      pad: { label: 'Wide pad', instrumentId: 'wavetable-dream' },
      perc: { label: 'Club percussion', instrumentId: 'afro-cuban-kit' },
    },
    arrangementId: 'edm-club',
  },
  pop: {
    modes: ['ionian', 'aeolian', 'mixolydian', 'lydian'],
    progressionIds: ['major-pop', 'major-anthem', 'major-lift', 'minor-pop'],
    grooveIds: ['pop-drive', 'synthwave-drive', 'pop-ballad'],
    bassStyleIds: ['pop-eighths', 'root-fifth', 'motown-walk'],
    melody: { density: 'mid', register: 'mid', noteLength: 'mixed', contour: 'arch', devices: ['hook repetition', 'call and response', 'pre-chorus lift'] },
    palette: {
      drums: { label: 'Pop kit', instrumentId: 'modern-kit-elite' },
      bass: { label: 'Clean bass', instrumentId: 'p-bass-elite' },
      chords: { label: 'Piano + synth', instrumentId: 'grand-piano' },
      lead: { label: 'Vocal doubles / lead synth', instrumentId: 'synth-lead' },
      pad: { label: 'Airy pad', instrumentId: 'neon-shimmer' },
      perc: { label: 'Hand percussion', instrumentId: 'afro-cuban-kit' },
    },
    arrangementId: 'pop-standard',
  },
  'rnb-soul': {
    modes: ['aeolian', 'dorian', 'ionian'],
    progressionIds: ['neo-soul-rich', 'gospel-run', 'minor-lofi', 'bossa-cycle'],
    grooveIds: ['neo-soul-pocket', 'gospel-pocket', 'quiet-storm'],
    bassStyleIds: ['motown-walk', 'funk-16ths', 'root-fifth'],
    melody: { density: 'mid', register: 'mid', noteLength: 'mixed', contour: 'wave', devices: ['melisma', 'blue notes', 'layered harmony'] },
    palette: {
      drums: { label: 'Live-feel kit', instrumentId: 'acoustic-kit-pro' },
      bass: { label: 'Electric bass', instrumentId: 'p-bass-elite' },
      chords: { label: 'Electric piano', instrumentId: 'analog-warmth' },
      lead: { label: 'Lead vocal / guitar', instrumentId: 'whisper-choir' },
      pad: { label: 'Vocal pad', instrumentId: 'vocal-pad-ethereal' },
      perc: { label: 'Shaker + congas', instrumentId: 'afro-cuban-kit' },
    },
    arrangementId: 'rnb-standard',
  },
  rock: {
    modes: ['mixolydian', 'aeolian', 'ionian', 'dorian'],
    progressionIds: ['mixolydian-rock', 'major-plain', 'minor-epic', 'andalusian'],
    grooveIds: ['rock-backbeat', 'punk-drive', 'indie-rock-groove'],
    bassStyleIds: ['rock-eighths', 'root-fifth', 'motown-walk'],
    melody: { density: 'mid', register: 'mid', noteLength: 'mixed', contour: 'arch', devices: ['riff motif', 'power-chord stabs', 'anthemic chorus'] },
    palette: {
      drums: { label: 'Acoustic kit', instrumentId: 'acoustic-kit-pro' },
      bass: { label: 'Electric bass', instrumentId: 'p-bass-elite' },
      chords: { label: 'Electric guitars', instrumentId: 'strat-elite-clean' },
      lead: { label: 'Lead guitar', instrumentId: 'strat-elite-clean' },
      pad: { label: 'Strings / organ', instrumentId: 'chamber-strings-elite' },
      counter: { label: 'Harmony guitar', instrumentId: 'distortion-amp' },
    },
    arrangementId: 'rock-standard',
  },
  jazz: {
    modes: ['dorian', 'ionian', 'mixolydian', 'harmonic-minor'],
    progressionIds: ['jazz-251', 'jazz-turnaround', 'bossa-cycle'],
    grooveIds: ['jazz-swing', 'bebop-ride', 'bossa-clave'],
    bassStyleIds: ['jazz-walk', 'bossa-two'],
    melody: { density: 'mid', register: 'mid', noteLength: 'mixed', contour: 'wave', devices: ['ii–V vocabulary', 'chromatic approach', 'trading fours'] },
    palette: {
      drums: { label: 'Jazz kit', instrumentId: 'acoustic-kit-pro' },
      bass: { label: 'Upright bass', instrumentId: 'upright-bass-pro' },
      chords: { label: 'Piano', instrumentId: 'grand-piano' },
      lead: { label: 'Horn / sax', instrumentId: 'sax-alto-pro' },
      pad: { label: 'Vibes', instrumentId: 'pluck-marimba-hybrid' },
    },
    arrangementId: 'jazz-head',
  },
  global: {
    modes: ['aeolian', 'dorian', 'mixolydian', 'phrygian-dominant'],
    progressionIds: ['afro-cycle', 'dorian-vamp', 'minor-lofi', 'phrygian-vamp'],
    grooveIds: ['afrobeats-groove', 'dancehall-riddim', 'dembow'],
    bassStyleIds: ['afro-melodic', 'sub-pulse', 'dub-root'],
    melody: { density: 'mid', register: 'mid', noteLength: 'short', contour: 'wave', devices: ['call and response', 'percussive phrasing', 'communal hook'] },
    palette: {
      drums: { label: 'Afro-Caribbean kit', instrumentId: 'afro-cuban-kit' },
      bass: { label: 'Melodic bass', instrumentId: 'p-bass-elite' },
      chords: { label: 'Guitar / keys', instrumentId: 'nylon-guitar-pro' },
      lead: { label: 'Lead melody', instrumentId: 'steel-drum-island' },
      pad: { label: 'Warm pad', instrumentId: 'analog-warmth' },
      perc: { label: 'Congas / log drums', instrumentId: 'afro-cuban-kit' },
    },
    arrangementId: 'global-groove',
  },
  'country-folk': {
    modes: ['ionian', 'mixolydian', 'aeolian', 'major-pentatonic'],
    progressionIds: ['major-plain', 'major-anthem', 'mixolydian-rock', 'blues-twelve'],
    grooveIds: ['country-shuffle', 'folk-strum', 'bluegrass-chop'],
    bassStyleIds: ['country-two', 'motown-walk', 'root-fifth'],
    melody: { density: 'mid', register: 'mid', noteLength: 'mixed', contour: 'arch', devices: ['storytelling verse', 'singable chorus', 'blue notes'] },
    palette: {
      drums: { label: 'Brushed kit', instrumentId: 'acoustic-kit-pro' },
      bass: { label: 'Upright bass', instrumentId: 'upright-bass-pro' },
      chords: { label: 'Acoustic guitar', instrumentId: 'nylon-guitar-pro' },
      lead: { label: 'Fiddle / lead', instrumentId: 'solo-violin-elite' },
      pad: { label: 'Organ', instrumentId: 'hammond-b3' },
      counter: { label: 'Mandolin', instrumentId: 'pluck-marimba-hybrid' },
    },
    arrangementId: 'songwriter-form',
  },
  cinematic: {
    modes: ['aeolian', 'dorian', 'lydian', 'harmonic-minor'],
    progressionIds: ['cinematic-minor', 'minor-epic', 'modal-lydian', 'whole-tone-drift'],
    grooveIds: ['cinematic-pulse', 'orchestral-swell', 'trailer-hits'],
    bassStyleIds: ['orchestral-pedal', '808-long'],
    melody: { density: 'sparse', register: 'high', noteLength: 'long', contour: 'arch', devices: ['motif development', 'ostinato', 'dynamic swell'] },
    palette: {
      drums: { label: 'Orchestral percussion', instrumentId: 'afro-cuban-kit' },
      bass: { label: 'Low strings / sub', instrumentId: 'chamber-strings-elite' },
      chords: { label: 'String ensemble', instrumentId: 'chamber-strings-elite' },
      lead: { label: 'Solo cello / voice', instrumentId: 'solo-violin-elite' },
      pad: { label: 'Choir pad', instrumentId: 'choir-ensemble' },
      counter: { label: 'French horn', instrumentId: 'french-horn-ensemble' },
    },
    arrangementId: 'cinematic-arc',
  },
};
