import type {
  SmuveTvCategoryId,
  SmuveTvChannel,
  SmuveTvProgramKind,
  SmuveTvScene,
} from './smuve-tv.service';

/**
 * S.M.U.V.E. TV — the iconic free-TV entertainment wave.
 *
 * Every station below is backed by an operator-published, free live channel
 * already listed in `SMUVE_TV_LIVE_FEEDS`. The station name is the channel's
 * own name, and the schedule describes the kind of programming that channel
 * actually carries — movies, sitcoms, comedy, classic television, crime, and
 * cartoons. Nothing here invents a paid movie link, a rental, or a music
 * station.
 *
 * Channel numbers continue the set-top-box dial from 174. The service spreads
 * this list into the main line-up, and the feed service maps each station id to
 * its verified stream.
 */

type WaveBlock = readonly [
  title: string,
  subtitle: string,
  durationMin: number,
  kind: SmuveTvProgramKind,
];

interface WaveStation {
  id: string;
  number: number;
  name: string;
  callSign: string;
  tagline: string;
  category: Exclude<SmuveTvCategoryId, 'all'>;
  accent: string;
  scene: SmuveTvScene;
  icon: string;
}

function station(
  channel: WaveStation,
  blocks: readonly WaveBlock[]
): SmuveTvChannel {
  return {
    ...channel,
    shows: blocks.map(([title, subtitle, durationMin, kind], index) => ({
      id: `${channel.id}-${index + 1}`,
      title,
      subtitle,
      durationMin,
      kind,
    })),
  };
}

export const SMUVE_TV_ENTERTAINMENT_CHANNELS: readonly SmuveTvChannel[] = [
  // ── Movies ──────────────────────────────────────────────
  station(
    {
      id: 'the-asylum',
      number: 174,
      name: 'THE ASYLUM',
      callSign: 'ASY',
      tagline: 'Mockbusters, creature features, and glorious B-movies.',
      category: 'movies',
      accent: '#DC2626',
      scene: 'storm',
      icon: 'movie',
    },
    [
      ['THE MIDNIGHT MOCKBUSTER', 'Original schlock, straight from the lot', 120, 'feature'],
      ['CREATURE FEATURE', 'When the effects budget ran out', 90, 'feature'],
      ['THE ASYLUM ARCHIVE', 'Every disaster, remastered', 60, 'documentary'],
      ['LAST REEL STANDING', 'The film that refused to end', 120, 'feature'],
    ]
  ),
  station(
    {
      id: 'dove-channel',
      number: 175,
      name: 'DOVE CHANNEL',
      callSign: 'DV',
      tagline: 'Family films with the rough edges sanded off.',
      category: 'movies',
      accent: '#38BDF8',
      scene: 'skyline',
      icon: 'family_restroom',
    },
    [
      ['THE FAMILY FEATURE', 'A film everyone can stay for', 120, 'feature'],
      ['SUNDAY MATINEE', 'Curtains open, worries closed', 90, 'feature'],
      ['SECOND CHANCES', 'Stories that choose kindness', 120, 'feature'],
      ['THE WIND-DOWN FILM', 'One last gentle story', 90, 'feature'],
    ]
  ),
  station(
    {
      id: 'outflix',
      number: 176,
      name: 'OUTFLIX',
      callSign: 'OFX',
      tagline: 'Queer cinema, front and centre.',
      category: 'movies',
      accent: '#EC4899',
      scene: 'neon-grid',
      icon: 'palette',
    },
    [
      ['THE OUTFLIX PREMIERE', 'New voices, first look', 120, 'feature'],
      ['PRIDE ARCHIVE', 'The films that opened the door', 90, 'documentary'],
      ['THE ROMANCE BLOCK', 'Love, without the apology', 90, 'feature'],
      ['AFTER HOURS', 'Bold films for the late crowd', 120, 'feature'],
    ]
  ),
  station(
    {
      id: 'allblk-gems',
      number: 177,
      name: 'ALLBLK GEMS',
      callSign: 'ABG',
      tagline: 'Black film and series, curated like a canon.',
      category: 'movies',
      accent: '#A855F7',
      scene: 'reel',
      icon: 'movie',
    },
    [
      ['THE ALLBLK FEATURE', 'A gem from the catalogue', 120, 'feature'],
      ['THE SERIES ROOM', 'Episodes that built a following', 60, 'episode'],
      ["THE DIRECTOR'S CUT", 'The story behind the story', 60, 'documentary'],
      ['THE AFTERPARTY', 'One more feature before close', 90, 'feature'],
    ]
  ),
  station(
    {
      id: 'asiancrush',
      number: 178,
      name: 'ASIANCRUSH',
      callSign: 'ACR',
      tagline: 'Asian cinema, from blockbusters to hidden gems.',
      category: 'movies',
      accent: '#F97316',
      scene: 'reel',
      icon: 'movie_filter',
    },
    [
      ['THE ASIANCRUSH FEATURE', 'One film, fully subtitled', 120, 'feature'],
      ['THE MIDNIGHT ASIA BLOCK', 'Genre cinema after dark', 120, 'feature'],
      ['THE CANON', 'Films that travelled the world', 90, 'documentary'],
      ['THE DOUBLE BILL', 'Two films, one ticket', 180, 'feature'],
    ]
  ),
  station(
    {
      id: 'cinevault-classics',
      number: 179,
      name: 'CINEVAULT CLASSICS',
      callSign: 'CVC',
      tagline: 'The classics, restored and still running.',
      category: 'movies',
      accent: '#C2884B',
      scene: 'reel',
      icon: 'history',
    },
    [
      ['THE VAULT FEATURE', 'A classic, start to finish', 120, 'feature'],
      ['THE GOLDEN AGE', 'Cinema before the algorithm', 90, 'feature'],
      ['RESTORED', 'Before and after the restoration', 60, 'documentary'],
      ['THE LATE CLASSIC', 'One more from the vault', 120, 'feature'],
    ]
  ),

  // ── Cinema ──────────────────────────────────────────────
  station(
    {
      id: 'moviesphere',
      number: 180,
      name: 'MOVIESPHERE',
      callSign: 'MSP',
      tagline: 'Lionsgate films, free and uninterrupted.',
      category: 'cinema',
      accent: '#E11D48',
      scene: 'skyline',
      icon: 'movie',
    },
    [
      ['THE MOVIESPHERE PREMIERE', 'A feature from the Lionsgate library', 120, 'feature'],
      ['THE ACTION BLOCK', 'Chases, heists, and hard choices', 120, 'feature'],
      ['THE COMEDY FEATURE', 'A film built around the punchline', 90, 'feature'],
      ['THE LATE SHOW', 'One last feature before sign-off', 120, 'feature'],
    ]
  ),
  station(
    {
      id: 'are-we-there-yet',
      number: 181,
      name: 'ARE WE THERE YET?',
      callSign: 'AWT',
      tagline: 'Family road-trip films, back to back.',
      category: 'cinema',
      accent: '#FBBF24',
      scene: 'skyline',
      icon: 'family_restroom',
    },
    [
      ['THE FAMILY ROAD TRIP', 'The journey is the plot', 90, 'feature'],
      ['THE HOLIDAY FEATURE', 'Everyone in one car', 120, 'feature'],
      ["THE KIDS' PICK", 'Chosen by the back seat', 90, 'feature'],
      ['THE LONG WAY HOME', 'One more family film', 120, 'feature'],
    ]
  ),
  station(
    {
      id: 'cine-nanar',
      number: 182,
      name: 'CINE NANAR',
      callSign: 'CNR',
      tagline: 'Arabic cinema, from classics to new voices.',
      category: 'cinema',
      accent: '#B45309',
      scene: 'skyline',
      icon: 'movie',
    },
    [
      ['THE CINE NANAR FEATURE', 'A film from the Arab world', 120, 'feature'],
      ['THE CLASSIC ARABIC REEL', 'Cinema that shaped the region', 90, 'feature'],
      ['NEW VOICES', 'First and second features', 90, 'feature'],
      ['THE LATE FEATURE', 'One more story before dawn', 120, 'feature'],
    ]
  ),

  // ── Comedy ──────────────────────────────────────────────
  station(
    {
      id: 'jfl-gags',
      number: 183,
      name: 'JUST FOR LAUGHS GAGS',
      callSign: 'JFL',
      tagline: 'Pranks, bits, and the biggest comedy festival.',
      category: 'comedy',
      accent: '#F59E0B',
      scene: 'neon-grid',
      icon: 'sentiment_satisfied',
    },
    [
      ['THE GAG REEL', 'No setup, all punchline', 30, 'episode'],
      ['FESTIVAL HIGHLIGHTS', 'The sets that broke the room', 60, 'episode'],
      ['THE STREET PRANK', 'Cameras, strangers, chaos', 30, 'episode'],
      ['THE LAUGH MARATHON', 'Gags until the credits', 90, 'episode'],
    ]
  ),
  station(
    {
      id: 'always-funny',
      number: 184,
      name: 'ALWAYS FUNNY VIDEOS',
      callSign: 'ALF',
      tagline: "The internet's funniest clips, compiled.",
      category: 'comedy',
      accent: '#22C55E',
      scene: 'pulse',
      icon: 'sentiment_satisfied',
    },
    [
      ['THE CLIP SHOW', 'Fails, pets, and perfect timing', 30, 'episode'],
      ['THE WEEKLY COUNTDOWN', 'The clips everyone shared', 45, 'episode'],
      ['THE REACTION ROOM', 'Watching the watchables', 30, 'episode'],
      ['THE ALL-NIGHTER', 'One more clip, then bed', 60, 'episode'],
    ]
  ),
  station(
    {
      id: 'rifftrax',
      number: 185,
      name: 'RIFFTRAX',
      callSign: 'RFX',
      tagline: 'Bad movies, better jokes.',
      category: 'comedy',
      accent: '#0EA5E9',
      scene: 'neon-grid',
      icon: 'movie_filter',
    },
    [
      ['THE RIFF', 'A film, heckled properly', 120, 'feature'],
      ['THE SHORT', 'Something strange, mercifully brief', 30, 'feature'],
      ['THE LIVE ROAST', 'The jokes the audience earned', 90, 'feature'],
      ['THE DOUBLE RIFF', 'Two films, no mercy', 180, 'feature'],
    ]
  ),
  station(
    {
      id: 'smosh',
      number: 186,
      name: 'SMOSH',
      callSign: 'SMO',
      tagline: 'Sketch comedy, chaos, and the occasional apology.',
      category: 'comedy',
      accent: '#EC4899',
      scene: 'pulse',
      icon: 'celebration',
    },
    [
      ['THE SKETCH BLOCK', 'New bits, no filter', 30, 'episode'],
      ['THE SMOSH SHOW', 'The cast, unleashed', 45, 'episode'],
      ['THE CHALLENGE', 'Bad ideas, enthusiastically attempted', 30, 'episode'],
      ['THE AFTER SHOW', 'Bloopers and unfinished arguments', 45, 'episode'],
    ]
  ),
  station(
    {
      id: 'afv',
      number: 187,
      name: 'AFV',
      callSign: 'AFV',
      tagline: "America's funniest home videos, still unbeaten.",
      category: 'comedy',
      accent: '#FACC15',
      scene: 'pulse',
      icon: 'videocam',
    },
    [
      ['THE FUNNIEST VIDEOS', 'The clips that never get old', 60, 'episode'],
      ['THE $100,000 MOMENT', 'The winners, replayed', 45, 'episode'],
      ['KIDS AND PETS', 'The reliable categories', 30, 'episode'],
      ['THE VIEWER VAULT', 'Submitted, screened, selected', 60, 'episode'],
    ]
  ),

  // ── Entertainment ───────────────────────────────────────
  station(
    {
      id: 'bounce-xl',
      number: 188,
      name: 'BOUNCE XL',
      callSign: 'BXL',
      tagline: 'Black comedy and sitcoms, around the clock.',
      category: 'entertainment',
      accent: '#8B5CF6',
      scene: 'skyline',
      icon: 'sentiment_satisfied',
    },
    [
      ['THE SITCOM BLOCK', 'Classic laughs, back to back', 60, 'episode'],
      ['THE BOUNCE MARATHON', 'One show, all night', 120, 'episode'],
      ['THE STAND-UP SET', 'New voices, full rooms', 60, 'episode'],
      ['THE LATE LAUGH', 'One more episode before bed', 60, 'episode'],
    ]
  ),
  station(
    {
      id: 'gsn',
      number: 189,
      name: 'GAME SHOW NETWORK',
      callSign: 'GSN',
      tagline: 'Big boards, bigger winners.',
      category: 'entertainment',
      accent: '#EAB308',
      scene: 'pulse',
      icon: 'celebration',
    },
    [
      ['THE CLASSIC ROUNDS', 'Answers, buzzers, and cash', 60, 'episode'],
      ['THE DAILY DOSE', 'One game, every weekday', 30, 'episode'],
      ['THE TOURNAMENT', 'Champions against champions', 90, 'episode'],
      ['THE LATE ROUND', 'One more before the lights go out', 60, 'episode'],
    ]
  ),
  station(
    {
      id: 'deal-or-no-deal',
      number: 190,
      name: 'DEAL OR NO DEAL',
      callSign: 'DND',
      tagline: 'Briefcases, bankers, and one impossible choice.',
      category: 'entertainment',
      accent: '#F97316',
      scene: 'pulse',
      icon: 'celebration',
    },
    [
      ['THE CASE BOARD', 'Twenty-six cases, one player', 60, 'episode'],
      ["THE BANKER'S CALL", 'The offer nobody expected', 45, 'episode'],
      ['THE MILLION-DOLLAR ROUND', 'The biggest decisions', 60, 'episode'],
      ['THE LATE DEAL', 'One more case before midnight', 45, 'episode'],
    ]
  ),
  station(
    {
      id: 'fear-factor',
      number: 191,
      name: 'FEAR FACTOR',
      callSign: 'FFR',
      tagline: 'Fear, stunts, and questionable decisions.',
      category: 'entertainment',
      accent: '#DC2626',
      scene: 'storm',
      icon: 'bolt',
    },
    [
      ['THE FEAR BLOCK', 'Contestants against their nerves', 60, 'episode'],
      ['THE STUNT HOUR', 'Heights, water, and worse', 60, 'episode'],
      ["THE WINNER'S STORY", 'What it took to finish', 30, 'documentary'],
      ['THE LATE DARE', 'One more challenge, no lifeline', 60, 'episode'],
    ]
  ),
  station(
    {
      id: 'hot-ones',
      number: 192,
      name: 'HOT ONES',
      callSign: 'HOT',
      tagline: 'Hot questions, hotter wings, no water.',
      category: 'entertainment',
      accent: '#EF4444',
      scene: 'pulse',
      icon: 'restaurant',
    },
    [
      ['THE INTERVIEW', 'One guest, ten wings', 30, 'episode'],
      ['THE LAST DAB', 'The moment it all goes wrong', 30, 'episode'],
      ['THE SAUCE RANKING', 'Heat, measured honestly', 30, 'episode'],
      ['THE AFTER SHOW', 'Milk, regrets, and answers', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'buzzfeed-unsolved',
      number: 193,
      name: 'BUZZFEED UNSOLVED',
      callSign: 'BFU',
      tagline: 'Ghosts, conspiracies, and two hosts who cannot agree.',
      category: 'entertainment',
      accent: '#14B8A6',
      scene: 'storm',
      icon: 'search',
    },
    [
      ['THE INVESTIGATION', 'One case, too many questions', 45, 'episode'],
      ['THE OVERNIGHT', 'Lights out, cameras rolling', 60, 'episode'],
      ['THE FILE ROOM', 'Evidence, explained', 30, 'documentary'],
      ['THE DEBRIEF', 'What was actually found', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'tmz',
      number: 194,
      name: 'TMZ',
      callSign: 'TMZ',
      tagline: 'Celebrity news, straight from the sidewalk.',
      category: 'entertainment',
      accent: '#F43F5E',
      scene: 'neon-grid',
      icon: 'videocam',
    },
    [
      ['THE DAILY FEED', 'The stories everyone will repeat', 30, 'news'],
      ['THE PAPARAZZI DESK', 'Caught on camera', 30, 'news'],
      ['THE LEGAL BRIEF', 'Hollywood, in court', 30, 'news'],
      ['THE LATE FEED', 'One more headline before bed', 30, 'news'],
    ]
  ),
  station(
    {
      id: 'dhar-mann-tv',
      number: 195,
      name: 'DHAR MANN TV',
      callSign: 'DMT',
      tagline: 'Short stories with a point.',
      category: 'entertainment',
      accent: '#0EA5E9',
      scene: 'skyline',
      icon: 'drama',
    },
    [
      ['THE DRAMA SHORT', 'A lesson in fifteen minutes', 30, 'episode'],
      ['THE FAMILY STORY', 'Choices and consequences', 30, 'episode'],
      ['THE MAKING OF', 'How the short came together', 30, 'documentary'],
      ['THE LATE LESSON', 'One more story before sleep', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'aspire-tv-life',
      number: 196,
      name: 'ASPIRE TV LIFE',
      callSign: 'ASP',
      tagline: 'Black lifestyle, food, and culture.',
      category: 'entertainment',
      accent: '#A16207',
      scene: 'skyline',
      icon: 'home',
    },
    [
      ['THE LIFESTYLE BLOCK', 'Food, home, and good company', 60, 'episode'],
      ['THE KITCHEN TABLE', 'Recipes with a history', 30, 'episode'],
      ['THE MAKEOVER', 'A room, a budget, a reveal', 60, 'episode'],
      ['THE LATE TOUR', 'One more home before bed', 30, 'episode'],
    ]
  ),

  // ── Vintage & classic TV ────────────────────────────────
  station(
    {
      id: 'cw-gold',
      number: 197,
      name: 'CW GOLD',
      callSign: 'CWG',
      tagline: 'Classic television, still in syndication.',
      category: 'vintage',
      accent: '#C2884B',
      scene: 'reel',
      icon: 'history',
    },
    [
      ['THE CLASSIC SITCOM BLOCK', 'The laughs that built the network', 60, 'episode'],
      ['THE GOLD HOUR', 'Drama from the archive', 60, 'episode'],
      ['THE RETRO MARATHON', 'One show, start to finish', 120, 'episode'],
      ['THE LATE RERUN', 'The episode you missed', 60, 'episode'],
    ]
  ),
  station(
    {
      id: '21-jump-street',
      number: 198,
      name: '21 JUMP STREET',
      callSign: '21J',
      tagline: 'Undercover cops, big hair, bigger cases.',
      category: 'vintage',
      accent: '#1D4ED8',
      scene: 'neon-grid',
      icon: 'local_police',
    },
    [
      ['THE PRECINCT', 'One case per episode', 60, 'episode'],
      ['THE UNDERCOVER HOUR', 'Back to school, back on the job', 60, 'episode'],
      ['THE CASE FILE', 'How the episode was built', 30, 'documentary'],
      ['THE LATE PATROL', 'One more case before dawn', 60, 'episode'],
    ]
  ),
  station(
    {
      id: 'death-valley-days',
      number: 199,
      name: 'DEATH VALLEY DAYS',
      callSign: 'DVD',
      tagline: 'Western stories from the old frontier.',
      category: 'vintage',
      accent: '#B45309',
      scene: 'skyline',
      icon: 'history_edu',
    },
    [
      ['THE WESTERN ANTHOLOGY', 'A new story every episode', 30, 'episode'],
      ['THE FRONTIER HOUR', 'Land, luck, and survival', 60, 'episode'],
      ['THE TRUE WEST', 'The history behind the story', 30, 'documentary'],
      ['THE LATE TRAIL', 'One more ride before sundown', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'unsolved-mysteries',
      number: 200,
      name: 'UNSOLVED MYSTERIES',
      callSign: 'UNS',
      tagline: 'The cases that never closed.',
      category: 'crime',
      accent: '#991B1B',
      scene: 'storm',
      icon: 'search',
    },
    [
      ['THE COLD CASE', 'One disappearance, revisited', 60, 'documentary'],
      ['THE EVIDENCE ROOM', 'What the file still holds', 45, 'documentary'],
      ['THE UPDATE', 'New leads, old questions', 30, 'news'],
      ['THE LATE FILE', 'One more case before dawn', 60, 'documentary'],
    ]
  ),
  station(
    {
      id: 'filmrise-westerns',
      number: 201,
      name: 'FILMRISE WESTERNS',
      callSign: 'FRW',
      tagline: 'Saddle up. The frontier is always open.',
      category: 'vintage',
      accent: '#D97706',
      scene: 'skyline',
      icon: 'history',
    },
    [
      ['THE WESTERN FEATURE', 'A full film from the archive', 90, 'feature'],
      ['THE QUICK DRAW', 'Short features, fast plots', 60, 'feature'],
      ['THE TRAIL BOSS', 'The making of the western', 30, 'documentary'],
      ['THE LATE RIDE', 'One more feature before dark', 90, 'feature'],
    ]
  ),
  station(
    {
      id: 'antiques-roadshow-uk',
      number: 202,
      name: 'ANTIQUES ROADSHOW UK',
      callSign: 'ARU',
      tagline: 'Attics, auctions, and the occasional fortune.',
      category: 'vintage',
      accent: '#0D9488',
      scene: 'skyline',
      icon: 'search',
    },
    [
      ['THE ROADSHOW', 'Experts, tables, and surprises', 60, 'episode'],
      ['THE VALUATION', 'What it is, and what it is worth', 30, 'episode'],
      ['THE COLLECTOR', 'One collection, explained', 30, 'documentary'],
      ['THE LATE APPRAISAL', 'One more item before closing', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'acorn-mysteries',
      number: 203,
      name: 'ACORN TV MYSTERIES',
      callSign: 'ACM',
      tagline: 'British mysteries, one clue at a time.',
      category: 'vintage',
      accent: '#1F2937',
      scene: 'storm',
      icon: 'search',
    },
    [
      ['THE MYSTERY FEATURE', 'A case from the British Isles', 90, 'feature'],
      ['THE DETECTIVE', 'One investigator, one method', 60, 'episode'],
      ['THE VILLAGE', 'Where the secrets live', 60, 'episode'],
      ['THE LATE CASE', 'One more mystery before dawn', 90, 'feature'],
    ]
  ),

  // ── Cartoons ────────────────────────────────────────────
  station(
    {
      id: 'toon-goggles',
      number: 204,
      name: 'TOON GOGGLES',
      callSign: 'TGG',
      tagline: 'Cartoons for every kind of Saturday.',
      category: 'cartoons',
      accent: '#FF6B35',
      scene: 'neon-grid',
      icon: 'child_care',
    },
    [
      ['THE TOON BLOCK', 'Animation, back to back', 60, 'episode'],
      ['THE ADVENTURE HOUR', 'Heroes, maps, and mayhem', 60, 'episode'],
      ['THE LAUGH TOON', 'The funny side of the drawer', 30, 'episode'],
      ['THE LATE TOON', 'One more before lights out', 60, 'episode'],
    ]
  ),
  station(
    {
      id: 'toon-goggles-jr',
      number: 205,
      name: 'TOON GOGGLES JUNIOR',
      callSign: 'TGJ',
      tagline: 'First cartoons, gently paced.',
      category: 'cartoons',
      accent: '#38BDF8',
      scene: 'pulse',
      icon: 'child_care',
    },
    [
      ['THE MORNING CLUB', 'Songs, shapes, and friends', 30, 'episode'],
      ['THE LITTLE ADVENTURE', 'Small heroes, big hearts', 30, 'episode'],
      ['STORY TIME', 'A book, read slowly', 30, 'episode'],
      ['THE WIND-DOWN', 'Calm cartoons for the end of the day', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'moonbug',
      number: 206,
      name: 'MOONBUG',
      callSign: 'MBG',
      tagline: 'Learning, singing, and gentle chaos.',
      category: 'cartoons',
      accent: '#22C55E',
      scene: 'pulse',
      icon: 'child_care',
    },
    [
      ['THE LEARNING BLOCK', 'Numbers, colors, and fun', 30, 'episode'],
      ['THE SING-ALONG', 'Songs that stay in your head', 30, 'episode'],
      ['THE PLAYTIME', 'Friends, games, and lessons', 30, 'episode'],
      ['THE BEDTIME BLOCK', 'Calm stories for the night', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'mr-bean-animated',
      number: 207,
      name: 'MR. BEAN (ANIMATED)',
      callSign: 'MBN',
      tagline: "The world's quietest troublemaker, animated.",
      category: 'cartoons',
      accent: '#EAB308',
      scene: 'neon-grid',
      icon: 'animation',
    },
    [
      ['THE ANIMATED SHORTS', 'No dialogue, all trouble', 30, 'episode'],
      ['THE BEAN MARATHON', 'One mishap after another', 60, 'episode'],
      ['THE MAKING OF', 'Drawing the disaster', 30, 'documentary'],
      ['THE LATE SHORT', 'One more before bed', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'sonic',
      number: 208,
      name: 'SONIC THE HEDGEHOG',
      callSign: 'SON',
      tagline: 'Gotta go fast, all day.',
      category: 'cartoons',
      accent: '#0EA5E9',
      scene: 'neon-grid',
      icon: 'bolt',
    },
    [
      ['THE SONIC BLOCK', 'Speed, rings, and robots', 60, 'episode'],
      ['THE CHAOS HOUR', 'One adventure after another', 60, 'episode'],
      ['THE ORIGIN STORY', 'From cartridge to cartoon', 30, 'documentary'],
      ['THE LATE DASH', 'One more episode before the finish line', 30, 'episode'],
    ]
  ),
  station(
    {
      id: 'yu-gi-oh',
      number: 209,
      name: 'YU-GI-OH!',
      callSign: 'YGO',
      tagline: "It's time to duel.",
      category: 'cartoons',
      accent: '#7C3AED',
      scene: 'neon-grid',
      icon: 'auto_awesome',
    },
    [
      ['THE DUEL BLOCK', 'Cards, stakes, and surprises', 60, 'episode'],
      ['THE TOURNAMENT ARC', 'One bracket, all the rivals', 90, 'episode'],
      ['THE RULES', 'How the game actually works', 30, 'documentary'],
      ['THE LATE DUEL', 'One more before the deck is sealed', 30, 'episode'],
    ]
  ),
];
