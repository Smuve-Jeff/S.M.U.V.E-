import {
  hasProfileRead,
  profileReadBack,
  questionnaireReadLine,
  readArtistProfile,
  welcomeWithReadBack,
} from './artist-profile-read';
import { initialProfile } from '../types/profile.types';

function profileWith(overrides: Record<string, any>): any {
  const base = JSON.parse(JSON.stringify(initialProfile)) as any;
  const apply = (obj: any, path: string, value: any) => {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  };
  for (const [k, v] of Object.entries(overrides)) apply(base, k, v);
  return base;
}

const COMMITTED = profileWith({
  artistName: 'Nova Vale',
  primaryGenre: 'Electronic',
  'musicalJourney.signatureSound': 'warped tape 808s with choir pads',
  'musicalJourney.currentFocus': 'first official EP',
  'musicalJourney.primarySuccessMetric': 'sync placement',
  'musicalJourney.personaSynthesis': {
    archetype: 'The Architect — precision-driven, technically focused creator',
    signatureTone: 'You communicate with calculated precision and authority.',
    sonicSignature: 'warped tape 808s with choir pads',
    aiPersonaProfile: 'S.M.U.V.E recognizes you as: The Architect.',
    recommendedStrategy: 'Priority: ship the EP.',
    suggestedGenres: ['Ambient', 'Lo-Fi'],
    productionAphorism: 'Craft separates artists from producers.',
  },
});

describe('artist-profile-read', () => {
  it('reads the four facts from the committed profile', () => {
    const read = readArtistProfile(COMMITTED);
    expect(read.archetype).toBe('The Architect');
    expect(read.sonicCore).toContain('warped tape 808s');
    expect(read.mission).toBe('first official EP');
    expect(read.genre).toBe('Electronic');
    expect(read.successMetric).toBe('sync placement');
  });

  it('reports no reading until the profile carries one', () => {
    expect(hasProfileRead(initialProfile)).toBe(false);
    expect(profileReadBack(initialProfile)).toBe('');
    expect(hasProfileRead(COMMITTED)).toBe(true);
  });

  it('opens with the artist’s own answers, never a generic greeting', () => {
    const block = profileReadBack(COMMITTED, { nextMove: 'Claim the distributor dashboards' });
    expect(block).toContain('PROFILE READING');
    expect(block).toContain('ARCHETYPE: The Architect');
    expect(block).toContain('SONIC CORE: warped tape 808s with choir pads');
    expect(block).toContain('CURRENT MISSION: first official EP');
    expect(block).toContain('NEXT MOVE: Claim the distributor dashboards');
  });

  it('keeps the roast intact when there is nothing to read back', () => {
    expect(welcomeWithReadBack('Sit down, nobody.', initialProfile)).toBe(
      'Sit down, nobody.'
    );
    const opened = welcomeWithReadBack('Sit down, Nova.', COMMITTED);
    expect(opened.startsWith('Sit down, Nova.')).toBe(true);
    expect(opened).toContain('ARCHETYPE: The Architect');
  });

  it('bounds long free-text answers in the read-back', () => {
    const verbose = profileWith({
      'musicalJourney.signatureSound': 'x'.repeat(600),
    });
    const block = profileReadBack(verbose);
    expect(block.length).toBeLessThan(400);
    expect(block).toContain('…');
  });

  it('reacts to a genre answer before any signature exists', () => {
    const line = questionnaireReadLine(
      'primaryGenre',
      'Afrobeats',
      profileWith({ 'musicalJourney.signatureSound': '' })
    );
    expect(line).toContain('Afrobeats is the judging frame');
  });

  it('compares later answers against the declared signature sound', () => {
    const line = questionnaireReadLine(
      'musicalJourney.musicBlueprint.vocalDelivery',
      'Raw and conversational',
      COMMITTED
    );
    expect(line).toContain('signature sound');
    expect(line).toContain('warped tape 808s');
  });

  it('calls out a thin origin story and logs a declared barrier', () => {
    expect(
      questionnaireReadLine('musicalJourney.originStory', 'I just started', COMMITTED)
    ).toContain('thin');
    const barrier = questionnaireReadLine(
      'musicalJourney.biggestChallenge',
      'No budget for videos',
      COMMITTED
    );
    expect(barrier).toContain('barrier logged');
    expect(barrier).toContain('No budget for videos');
  });

  it('returns nothing to say when there is no profile evidence at all', () => {
    expect(questionnaireReadLine('unknown.field', 'x', null)).toBe('');
    expect(questionnaireReadLine('unknown.field', 'x', {})).toBe('');
  });
});
