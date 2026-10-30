import type { UserProfile } from './user-profile.service';

/**
 * S.M.U.V.E.'s reading of an artist profile.
 *
 * One module owns how S.M.U.V.E. *reads* the completed questionnaire: the
 * chatbot open, the live questionnaire monitor, and any surface that claims
 * "I read your answers" all come through here, so the character can never
 * disagree with itself about who the artist is. It is pure (no DI, no network)
 * so it also powers offline mode and is trivially testable.
 */

/** The release record, read as evidence of a body of work rather than a list. */
export interface ArtistCatalogueRead {
  works: number;
  /** Works carrying a release date. */
  dated: number;
  latestTitle: string;
  latestDate: string;
  releaseTypes: string[];
  /** Percentage of works carrying at least one identifier, credit or split ref. */
  documented: number;
}

/**
 * The artist's musical body: what the records are, how they move, and what
 * they are about. Every field is taken from the profile as written; nothing is
 * inferred from genre alone. A missing field stays empty so S.M.U.V.E. can say
 * "not declared" instead of inventing a sound.
 */
export interface ArtistMusicalBody {
  genre: string;
  subgenres: string[];
  influences: string[];
  signatureSound: string;
  delivery: string;
  groove: string;
  harmony: string;
  arrangement: string;
  nonNegotiables: string;
  themes: string[];
  references: string[];
  vocalRange: string;
  tempoZone: string;
  audience: string;
  intent: string;
  recognitionCue: string;
  catalogue: ArtistCatalogueRead;
  /** One evidence-only sentence naming the artist's distinct musical body. */
  statement: string;
  /** True when at least the sonic or catalogue core is on record. */
  hasBody: boolean;
}

export interface ArtistProfileRead {
  /** Short archetype label, e.g. "The Architect" (text after the dash dropped). */
  archetype: string;
  /** The artist's declared uniqueness core or sonic signature. */
  sonicCore: string;
  /** What the artist said they are building right now, or their barrier. */
  mission: string;
  /** The first differentiator/evidence line, used as proof the profile was read. */
  differentiator: string;
  genre: string;
  releaseVelocity: string;
  successMetric: string;
  /** True only when the questionnaire was actually committed as complete. */
  profileComplete: boolean;
  /** The full musical body — genre, blueprint, writing and catalogue evidence. */
  body: ArtistMusicalBody;
}

/** Bounds a free-text answer so a read-back can never flood the chat. */
const cap = (value: unknown, max = 140): string => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

/**
 * Reads an array answer, or a free-text answer that holds several items
 * (reference tracks often arrive newline- or semicolon-separated).
 */
const list = (value: unknown, max = 8): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => cap(item, 120))
      .filter(Boolean)
      .slice(0, max);
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return [];
  return text
    .split(/\r?\n|;/)
    .map((item) => cap(item, 120))
    .filter(Boolean)
    .slice(0, max);
};

/** Millisecond value for ordering a catalogue, tolerant of free-text dates. */
const releaseTime = (item: any): number => {
  for (const candidate of [item?.releaseDate, item?.createdAt, item?.updatedAt]) {
    const parsed = Date.parse(String(candidate || ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const readCatalogue = (profile: UserProfile | null | undefined): ArtistCatalogueRead => {
  const raw = Array.isArray(profile?.catalog) ? profile!.catalog : [];
  const works = raw.filter((item: any) => item && typeof item === 'object');
  const dated = works.filter((item: any) => cap(item.releaseDate, 40)).length;
  const latest = [...works].sort((a: any, b: any) => releaseTime(b) - releaseTime(a))[0];
  const types = new Set<string>();
  for (const item of works as any[]) {
    const type = cap(item?.releaseType, 30);
    if (type) types.add(type);
  }
  const documented = works.filter((item: any) =>
    Boolean(
      cap(item?.isrc, 40) ||
        cap(item?.iswc, 40) ||
        cap(item?.upc, 40) ||
        cap(item?.credits, 200) ||
        cap(item?.splitSheetRef, 80)
    )
  ).length;

  return {
    works: works.length,
    dated,
    latestTitle: cap(latest?.title, 90),
    latestDate: cap(latest?.releaseDate, 40),
    releaseTypes: [...types].slice(0, 4),
    documented: works.length ? Math.round((documented / works.length) * 100) : 0,
  };
};

/**
 * A single sentence that names the body from evidence, not from a genre
 * template. It never says "artist" until the profile supports it: an empty
 * profile produces an empty statement.
 */
const describeMusicalBody = (body: Omit<ArtistMusicalBody, 'statement' | 'hasBody'>): string => {
  const identity = body.genre || body.subgenres.join(', ');
  const motion = [
    body.delivery ? `delivery is ${body.delivery}` : '',
    body.groove ? `groove is ${body.groove}` : '',
    body.harmony ? `harmony is ${body.harmony}` : '',
    body.arrangement ? `arrangement is ${body.arrangement}` : '',
  ].filter(Boolean);

  const clauses: string[] = [];
  if (body.signatureSound) {
    clauses.push(`signature sound: “${body.signatureSound}”`);
  }
  if (motion.length) clauses.push(motion.join('; '));
  if (body.themes.length) clauses.push(`writing lives in ${body.themes.join(', ')}`);
  if (body.nonNegotiables) clauses.push(`non-negotiable: ${body.nonNegotiables}`);
  if (body.catalogue.works) {
    clauses.push(
      `${body.catalogue.works} work${body.catalogue.works === 1 ? '' : 's'} on record`
    );
  }

  if (!clauses.length) return '';
  const article = identity && /^[aeiou]/i.test(identity) ? 'An' : 'A';
  const subject = identity ? `${article} ${identity} artist` : 'This artist';
  return cap(`${subject}; ${clauses.join('; ')}.`, 360);
};

/** Reads the artist's musical body from the profile, with no inference. */
export function readMusicalBody(
  profile: UserProfile | null | undefined
): ArtistMusicalBody {
  const journey: any = profile?.musicalJourney || {};
  const blueprint: any = journey.musicBlueprint || {};
  const declaredTempo = cap(journey.preferredBpmRange, 40);
  // A brand-new profile ships with the placeholder name "New Artist" and a
  // default genre. Neither is an answer the artist gave, so S.M.U.V.E. must not
  // describe them as the artist's body before the interview is committed.
  const untouched =
    profile?.profileSetupCompleted !== true &&
    (!profile?.artistName || profile.artistName === 'New Artist');
  const body = {
    genre: untouched ? '' : cap(profile?.primaryGenre, 60),
    subgenres: list(journey.subgenres, 4),
    influences: list(journey.musicalInfluences, 6),
    signatureSound: cap(journey.signatureSound, 140),
    delivery: cap(blueprint.vocalDelivery, 120),
    groove: cap(blueprint.rhythmicFeel, 120),
    harmony: cap(blueprint.harmonicLanguage, 120),
    arrangement: cap(blueprint.arrangementApproach, 120),
    nonNegotiables: cap(blueprint.sonicNonNegotiables, 140),
    themes: list(blueprint.lyricalThemes, 6),
    references: list(blueprint.referenceTracks, 6),
    vocalRange: cap(journey.vocalRange, 60),
    tempoZone: declaredTempo
      ? /bpm/i.test(declaredTempo)
        ? declaredTempo
        : `${declaredTempo} BPM`
      : '',
    audience: cap(blueprint.audienceProfile, 140),
    intent: cap(blueprint.artisticIntent, 140),
    recognitionCue: cap(blueprint.recognitionCue, 140),
    catalogue: readCatalogue(profile),
  };

  const statement = describeMusicalBody(body);
  const hasBody = Boolean(
    body.genre ||
      body.signatureSound ||
      body.delivery ||
      body.groove ||
      body.harmony ||
      body.arrangement ||
      body.themes.length ||
      body.catalogue.works
  );

  return { ...body, statement, hasBody };
}

/**
 * Prompt- and read-back-ready lines. Only what exists is printed, so the
 * absence of a reference track is never filled with a guessed influence.
 */
export function musicalBodyLines(body: ArtistMusicalBody): string[] {
  const lines: string[] = [];
  const genre = [body.genre, body.subgenres.join(', ')].filter(Boolean).join(' / ');
  if (genre) lines.push(`GENRE: ${genre}`);
  if (body.influences.length) lines.push(`INFLUENCES: ${body.influences.join(', ')}`);
  if (body.signatureSound) lines.push(`SIGNATURE SOUND: ${body.signatureSound}`);
  const motion = [
    body.delivery ? `delivery=${body.delivery}` : '',
    body.groove ? `groove=${body.groove}` : '',
    body.harmony ? `harmony=${body.harmony}` : '',
    body.arrangement ? `arrangement=${body.arrangement}` : '',
  ].filter(Boolean);
  if (motion.length) lines.push(`MOTION: ${motion.join('; ')}`);
  const instrument = [body.vocalRange, body.tempoZone].filter(Boolean).join(' / ');
  if (instrument) lines.push(`VOICE AND TEMPO: ${instrument}`);
  if (body.themes.length) lines.push(`WRITING: ${body.themes.join(', ')}`);
  const direction = [
    body.intent ? `intent=${body.intent}` : '',
    body.audience ? `audience=${body.audience}` : '',
    body.recognitionCue ? `cue=${body.recognitionCue}` : '',
  ].filter(Boolean);
  if (direction.length) lines.push(`DIRECTION: ${direction.join('; ')}`);
  if (body.nonNegotiables) lines.push(`NON-NEGOTIABLES: ${body.nonNegotiables}`);
  if (body.references.length) lines.push(`REFERENCES: ${body.references.join(', ')}`);
  if (body.catalogue.works) {
    const latest = body.catalogue.latestTitle
      ? `, latest “${body.catalogue.latestTitle}”${
          body.catalogue.latestDate ? ` (${body.catalogue.latestDate})` : ''
        }`
      : '';
    const types = body.catalogue.releaseTypes.length
      ? `, formats ${body.catalogue.releaseTypes.join('/')}`
      : '';
    lines.push(
      `CATALOGUE: ${body.catalogue.works} work${
        body.catalogue.works === 1 ? '' : 's'
      }, ${body.catalogue.dated} dated, ${body.catalogue.documented}% documented${types}${latest}`
    );
  }
  return lines;
}

/** Reads the profile into the facts S.M.U.V.E. keeps in front of it. */
export function readArtistProfile(
  profile: UserProfile | null | undefined
): ArtistProfileRead {
  const journey: any = profile?.musicalJourney || {};
  const blueprint: any = journey.musicBlueprint || {};
  const synthesis: any = journey.personaSynthesis || {};

  return {
    archetype: cap(String(synthesis.archetype || '').split('—')[0], 80),
    sonicCore: cap(
      journey.signatureSound || synthesis.sonicSignature || blueprint.vocalDelivery,
      140
    ),
    mission: cap(journey.currentFocus || journey.biggestChallenge || '', 140),
    differentiator: cap(blueprint.signatureTension || blueprint.recognitionCue || '', 140),
    genre: cap(profile?.primaryGenre || '', 60),
    releaseVelocity: cap(journey.releaseVelocity || '', 60),
    successMetric: cap(journey.primarySuccessMetric || '', 60),
    profileComplete: profile?.profileSetupCompleted === true,
    body: readMusicalBody(profile),
  };
}

/**
 * True when the profile carries enough reading for S.M.U.V.E. to talk like the
 * interview actually happened — a synthesis, a sonic core, or a stated mission.
 */
export function hasProfileRead(
  profile: UserProfile | null | undefined
): boolean {
  const read = readArtistProfile(profile);
  return Boolean(read.archetype || read.sonicCore || read.mission);
}

/**
 * The read-back S.M.U.V.E. opens a session with once the profile is committed.
 *
 * It proves the artist's own answers were absorbed, describes the musical body
 * in the artist's own terms, cites the pathway's next move when the caller has
 * it, and keeps the arrogant voice intact: the read is used to raise the
 * standard, never to hand out credit.
 */
export function profileReadBack(
  profile: UserProfile | null | undefined,
  extras: { nextMove?: string; tip?: string } = {}
): string {
  if (!hasProfileRead(profile)) return '';
  const read = readArtistProfile(profile);
  const body = read.body;

  const lines: string[] = [];
  if (read.archetype) lines.push(`ARCHETYPE: ${read.archetype}`);
  if (read.genre) lines.push(`GENRE: ${read.genre}`);
  if (read.sonicCore) lines.push(`SONIC CORE: ${read.sonicCore}`);
  if (body.influences.length) {
    lines.push(`INFLUENCES (learning references, never imitations): ${body.influences.join(', ')}`);
  }
  if (body.statement) lines.push(`MUSICAL BODY: ${body.statement}`);
  if (read.mission) lines.push(`CURRENT MISSION: ${read.mission}`);
  if (read.differentiator) lines.push(`PROOF YOU EXIST: ${read.differentiator}`);
  if (body.nonNegotiables) lines.push(`WILL NOT COMPROMISE: ${body.nonNegotiables}`);
  if (body.references.length) {
    lines.push(`REFERENCES ON FILE: ${body.references.join(', ')}`);
  }
  if (body.catalogue.works) {
    const latest = body.catalogue.latestTitle
      ? `; latest “${body.catalogue.latestTitle}”${
          body.catalogue.latestDate ? ` (${body.catalogue.latestDate})` : ''
        }`
      : '';
    lines.push(
      `CATALOGUE: ${body.catalogue.works} work${
        body.catalogue.works === 1 ? '' : 's'
      }, ${body.catalogue.dated} dated${latest}`
    );
  }
  if (read.successMetric) lines.push(`THE ONLY SCORE THAT COUNTS: ${read.successMetric}`);
  const nextMove = cap(extras.nextMove || extras.tip || '', 200);
  if (nextMove) lines.push(`NEXT MOVE: ${nextMove}`);

  const header = read.profileComplete
    ? '📡 PROFILE READING — your completed profile, read back. Do not make me read it twice.'
    : '📡 PROFILE READING — what you have actually given me so far. Do not make me read it twice.';

  return [
    header,
    ...lines.map((line) => `  • ${line}`),
    'Now bring me work worthy of it.',
  ].join('\n');
}

/**
 * The chatbot welcome text: roast first, then the reading — so the character
 * lands before the receipts do.
 */
export function welcomeWithReadBack(
  roast: string,
  profile: UserProfile | null | undefined,
  extras: { nextMove?: string; tip?: string } = {}
): string {
  const reading = profileReadBack(profile, extras);
  return reading ? `${roast}\n\n${reading}` : roast;
}

/**
 * One in-character read of a live questionnaire answer.
 *
 * Deterministic and derived only from what the artist already saved, so the
 * monitor reacts to real evidence instead of printing a template. Aimed at the
 * work — never at the person — to match S.M.U.V.E.'s character contract.
 *
 * `questionType` gates the "too thin" callout: a select/chip answer is one of
 * the questionnaire's own options and cannot be thin, so it falls through to
 * the profile read instead of being scolded for brevity.
 */
export function questionnaireReadLine(
  field: string,
  answer: unknown,
  profile: UserProfile | null | undefined,
  questionType?: string
): string {
  const value = typeof answer === 'string' ? answer.trim() : '';
  const journey: any = profile?.musicalJourney || {};
  const freeText = questionType === 'text' || questionType === 'textarea';

  switch (field) {
    case 'primaryGenre':
      return value
        ? `READ: ${value} is the judging frame from here; every later answer is measured against it.`
        : '';
    case 'artistName':
      return value
        ? `READ: ${value} is on record. A name is a brand; misspell it and I will notice.`
        : '';
    case 'artistNameMeaning':
      return value
        ? 'READ: a name with a reason behind it. Most artists stop at the name.'
        : '';
    case 'musicalJourney.signatureSound':
      return value
        ? 'READ: uniqueness core registered. I will hold every future release to this sentence.'
        : '';
    case 'musicalJourney.originStory':
      // Only a *free-text* origin story can be thin. A chosen option falls
      // through to the profile read below instead of returning empty, so the
      // artist always gets a reaction to the answer they just gave.
      if (freeText && value && value.length < 40) {
        return 'READ: thin. Generic origin stories produce generic artists; add the concrete detail.';
      }
      break;
    case 'musicalJourney.biggestChallenge':
      return value
        ? `READ: barrier logged (${cap(value, 90)}). Coaching routes there first.`
        : '';
    case 'musicalJourney.musicBlueprint.sonicNonNegotiables':
      return value
        ? 'READ: that line is now protected. I will reject work that trades it away.'
        : '';
    case 'musicalJourney.currentFocus':
      return value
        ? `READ: mission locked (${cap(value, 90)}). Everything else gets subordinated.`
        : '';
  }

  if (journey.signatureSound) {
    return `READ: weighed against your signature sound: "${cap(journey.signatureSound, 70)}".`;
  }
  if (profile?.primaryGenre) {
    return `READ: catalogued under ${profile.primaryGenre}. Genre is context, not an excuse.`;
  }
  if (profile?.artistName) {
    return `READ: filed against ${profile.artistName}. S.M.U.V.E. keeps the receipts.`;
  }
  return '';
}
