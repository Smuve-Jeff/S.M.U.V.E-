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
}

/** Bounds a free-text answer so a read-back can never flood the chat. */
const cap = (value: unknown, max = 140): string => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

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
 * It proves the artist's own answers were absorbed, cites the pathway's next
 * move when the caller has it, and keeps the arrogant voice intact: the read is
 * used to raise the standard, never to hand out credit.
 */
export function profileReadBack(
  profile: UserProfile | null | undefined,
  extras: { nextMove?: string; tip?: string } = {}
): string {
  if (!hasProfileRead(profile)) return '';
  const read = readArtistProfile(profile);

  const lines: string[] = [];
  if (read.archetype) lines.push(`ARCHETYPE: ${read.archetype}`);
  if (read.genre) lines.push(`GENRE: ${read.genre}`);
  if (read.sonicCore) lines.push(`SONIC CORE: ${read.sonicCore}`);
  if (read.mission) lines.push(`CURRENT MISSION: ${read.mission}`);
  if (read.differentiator) lines.push(`PROOF YOU EXIST: ${read.differentiator}`);
  if (read.successMetric) lines.push(`THE ONLY SCORE THAT COUNTS: ${read.successMetric}`);
  const nextMove = cap(extras.nextMove || extras.tip || '', 200);
  if (nextMove) lines.push(`NEXT MOVE: ${nextMove}`);

  return [
    '📡 PROFILE READING — I read every answer you gave. Do not make me read them twice.',
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
 */
export function questionnaireReadLine(
  field: string,
  answer: unknown,
  profile: UserProfile | null | undefined
): string {
  const value = typeof answer === 'string' ? answer.trim() : '';
  const journey: any = profile?.musicalJourney || {};

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
      return value && value.length < 40
        ? 'READ: thin. Generic origin stories produce generic artists; add the concrete detail.'
        : '';
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
