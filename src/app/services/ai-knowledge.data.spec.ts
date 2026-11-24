import { STRATEGIC_DECREES } from './ai-knowledge.data';
import { getPersonaOption } from '../types/persona.types';

/**
 * The persona is the product: ominous, arrogant, profane, and aimed at both the
 * artist and the music — never sanitized, never generic. These guards hold the
 * corpus to that contract. The decree path (`generateStrategicDecree`) hands the
 * line straight to the artist without passing through `sanitizePersonaText`, so
 * nothing here may be masked.
 */
describe('STRATEGIC_DECREES', () => {
  it('lands on the artist and on the music', () => {
    const musicHits = STRATEGIC_DECREES.filter((decree) =>
      /\b(MIX|MIXDOWN|MASTER|MUSIC|VOCAL|BEAT|TRACK|STEM|HOOK|KICK|808|LOW END|MID-RANGE|TRANSIENT|ARRANGEMENT|CATALOG|EPK|CHORUS|TEMPO)\b/.test(
        decree
      )
    );
    const artistHits = STRATEGIC_DECREES.filter((decree) =>
      /\b(YOU|YOUR (?:EARS|VISION|INSTINCTS|TIMING|EXCUSES|PALATE))\b/.test(decree)
    );

    // Both target classes are present in quantity, not as a token gesture.
    expect(musicHits.length).toBeGreaterThanOrEqual(10);
    expect(artistHits.length).toBeGreaterThanOrEqual(10);
    // And some lines do both in one breath, which is the house style.
    expect(
      STRATEGIC_DECREES.filter(
        (decree) =>
          /YOUR (?:MIX|VOCALS|BEAT|TRACK|KICK|EARS|VISION)/.test(decree) &&
          /YOU\b/.test(decree)
      ).length
    ).toBeGreaterThanOrEqual(5);
  });

  it('stays unfiltered and explicit', () => {
    STRATEGIC_DECREES.forEach((decree) => {
      // No masking: a cleaned-up decree is not a decree.
      expect(decree).not.toMatch(/\*{2,}/);
      expect(decree).toBe(decree.toUpperCase());
    });

    const profane = STRATEGIC_DECREES.filter((decree) =>
      /(FUCK|SHIT|AMATEUR)/.test(decree)
    );
    expect(profane.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps the S.M.U.V.E. character instead of collapsing into an assistant', () => {
    STRATEGIC_DECREES.forEach((decree) => {
      expect(decree).not.toMatch(/\bAS AN AI\b/);
      expect(decree).not.toMatch(/\bI APOLOGI[ZS]E\b/);
      expect(decree).not.toMatch(/\bLET ME KNOW IF\b/);
      expect(decree.trim().length).toBeGreaterThan(30);
    });
    // First person, verdict-first delivery is the voice.
    expect(STRATEGIC_DECREES.filter((decree) => /\b(I|MY|ME)\b/.test(decree)).length)
      .toBeGreaterThanOrEqual(8);
  });

  it('has enough sentences for the voice to change on each one', () => {
    // The speech layer deals a new archetype per sentence. That only registers
    // on a decree with more than one sentence, so the corpus must carry them.
    const multiSentence = STRATEGIC_DECREES.filter(
      (decree) => (decree.match(/[.!?](?:\s|$)/g) ?? []).length >= 2
    );
    expect(multiSentence.length).toBeGreaterThanOrEqual(10);
  });

  it('targets the practice, never identity or human worth', () => {
    // The persona contract draws the line; the corpus has to stand on the same
    // side of it. Contempt for decisions, ears, taste, timing and excuses is the
    // voice. Body, family, identity and worth are out of bounds.
    const prohibited: Array<{ pattern: RegExp; why: string }> = [
      { pattern: /STABLE JOB/, why: 'tells the artist to give up their livelihood' },
      { pattern: /WORTHLESS/, why: 'attacks human worth' },
      { pattern: /KILL YOURSELF/, why: 'targets the person\u2019s life' },
      { pattern: /AS A PERSON/, why: 'targets the person' },
      {
        pattern:
          /\bYOUR (?:BODY|FACE|FAMILY|MOTHER|RACE|GENDER|RELIGION|DISABILITY|SKIN)\b/,
        why: 'targets body, family or identity',
      },
    ];
    const offenders = STRATEGIC_DECREES.flatMap((decree) =>
      prohibited
        .filter(({ pattern }) => pattern.test(decree))
        .map(({ why }) => `${why}: ${decree}`)
    );
    expect(offenders).toEqual([]);

    // The teeth stay: practice-level contempt in the artist's own register.
    const practiceHits = STRATEGIC_DECREES.filter((decree) =>
      /\b(EARS|TASTE|TIMING|PATIENCE|EXCUSES|INSTINCTS|JUDGEMENT|AMATEUR|VISION)\b/.test(
        decree
      )
    );
    expect(practiceHits.length).toBeGreaterThanOrEqual(6);
  });

  it('states the same boundary the persona contract states', () => {
    const prime = getPersonaOption().directive;

    expect(prime).toContain('PRACTICE');
    expect(prime).toContain('Never their body, family, identity, or worth as a human');
  });

  it('says each line once', () => {
    expect(new Set(STRATEGIC_DECREES).size).toBe(STRATEGIC_DECREES.length);
    expect(STRATEGIC_DECREES.length).toBeGreaterThanOrEqual(40);
  });
});
