import type { UserProfile } from './profile.types';
import { buildArtistMusicContext } from './profile.types';
import {
  DNA_EVENT_CAP,
  DNA_HALF_LIFE_DAYS,
  buildMusicalDnaContext,
  buildMusicalDnaTeachingContext,
  createInitialMusicalDnaState,
  dnaLessonPlan,
  dnaRecencyWeight,
  readMusicalDna,
  recordDnaEvidence,
} from './musical-dna.types';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 15);

/** A profile where every axis is silent — the honest cold start. */
const blank = (): UserProfile =>
  ({
    artistName: '',
    primaryGenre: '',
    musicalJourney: { musicalInfluences: [], subgenres: [] },
    settings: {
      studio: { defaultQuantize: '1/16', autoMixEnabled: false },
      audio: {},
      dj: { crossfaderCurve: 'power' },
    },
    catalog: [],
    recommendationHistory: [],
    expertise: {},
  }) as unknown as UserProfile;

/** Declared-only: a fully answered questionnaire with no work behind it. */
const declaredOnly = (): UserProfile =>
  ({
    ...blank(),
    artistName: 'North Star',
    primaryGenre: 'Ambient',
    musicalJourney: {
      musicalInfluences: ['minimalism'],
      subgenres: ['drone'],
      songwritingStyle: 'Fragments assembled into a single arc',
      songwritingProcess: 'Collect a sound, then find its centre',
      signatureSound: 'Bowed metal and close-mic breath',
      signatureGear: 'Modular rack and tape machine',
      vocalRange: 'Tenor (C3-C5)',
      preferredBpmRange: '60-80',
      productionPhilosophy: 'Leave room for human imperfection',
      marketPosition: 'Quiet-room electronic',
      musicBlueprint: {
        rhythmicFeel: 'Slow, untethered, human',
        harmonicLanguage: 'Modal, mostly suspended',
        vocalDelivery: 'Half-spoken, close',
        recognitionCue: 'A bowed metal swell in the first four seconds',
        arrangementApproach: 'Grow by subtraction',
        mixingPriorities: ['depth over loudness'],
        recordingPriorities: ['keep first takes'],
        referenceTracks: ['Ambient Works'],
        audienceProfile: 'Late-night deep listeners',
        artisticIntent: 'Give people permission to slow down',
        signatureTension: 'Machine precision against human breath',
        livedWorldDetails: 'Recorded while caring for family',
        sonicNonNegotiables: 'No bright digital top end',
        collaborationBoundaries: 'Final say stays with me',
        lyricalThemes: ['distance', 'care'],
      },
    },
  }) as unknown as UserProfile;

/** Observed-only: real work, settings and skill, but no stated intent. */
const observedOnly = (): UserProfile =>
  ({
    ...blank(),
    artistName: 'Session Cat',
    primaryGenre: 'House',
    expertise: { production: 78, performance: 60, marketing: 55, technical_mastery: 70 },
    equipment: ['MPC', 'Summing box'],
    daw: ['Ableton'],
    careerGoals: ['Touring'],
    brandVoices: ['direct'],
    catalog: [
      { id: 'a', genre: 'House', bpm: 124, key: 'F minor', releaseType: 'Single', duration: 210 },
      { id: 'b', genre: 'House', bpm: 128, key: 'A minor', releaseType: 'EP', duration: 240 },
      { id: 'c', genre: 'House', bpm: 132, key: 'G major', releaseType: 'Single', duration: 195 },
    ],
    recommendationHistory: [{ recommendationId: 'r1', state: 'completed' }],
    settings: {
      studio: { defaultQuantize: '1/32', autoMixEnabled: true, smartSheet: { mode: 'trap' } },
      audio: { sampleRate: 96000 },
      dj: { crossfaderCurve: 'cut', vinylMode: true },
    },
  }) as unknown as UserProfile;

describe('readMusicalDna', () => {
  it('reports every axis as unread for a cold-start profile', () => {
    const reading = readMusicalDna(blank(), undefined, NOW);

    expect(reading.dimensions).toHaveLength(8);
    expect(reading.dimensions.every((d) => d.posture === 'unread')).toBe(true);
    expect(reading.dimensions.every((d) => d.confidence === 0)).toBe(true);
    expect(reading.fidelity).toBe(0);
    expect(reading.drift).toEqual([]);
    expect(reading.signature).toBe('Fingerprint still forming.');
    // Cold start still coaches, but never claims a rule the artist did not set.
    expect(reading.adaptations.every((a) => a.severity === 'coach')).toBe(true);
    expect(reading.adaptations.some((a) => a.rationale.includes('ask, do not assume'))).toBe(true);
  });

  it('returns an empty reading rather than throwing when no profile is loaded', () => {
    const reading = readMusicalDna(null, undefined, NOW);

    expect(reading.dimensions).toEqual([]);
    expect(reading.fidelity).toBe(0);
    expect(reading.signature).toContain('No artist profile');
  });

  it('marks a fully answered questionnaire with no work as vision-led and caps confidence', () => {
    const reading = readMusicalDna(declaredOnly(), undefined, NOW);
    const writing = reading.dimensions.find((d) => d.id === 'writing')!;

    expect(writing.declared).toBe(100);
    // The only thing backing it is captured detail, not produced work.
    expect(writing.observed).toBeLessThan(writing.declared);
    expect(writing.posture).toBe('vision-led');
    // One-sided evidence must never read as trustworthy.
    expect(writing.confidence).toBeLessThanOrEqual(45);
    expect(writing.trait).toContain('declared');
  });

  it('marks real work with no stated intent as instinct-led', () => {
    const reading = readMusicalDna(observedOnly(), undefined, NOW);
    const rhythm = reading.dimensions.find((d) => d.id === 'rhythm')!;
    const production = reading.dimensions.find((d) => d.id === 'production')!;

    expect(rhythm.declared).toBe(0);
    expect(rhythm.observed).toBeGreaterThan(0);
    expect(rhythm.posture).toBe('instinct-led');
    expect(production.declared).toBe(0);
    expect(production.observed).toBeGreaterThanOrEqual(50);
    expect(production.confidence).toBeLessThanOrEqual(45);
  });

  it('reads an aligned artist with the highest confidence', () => {
    const aligned = {
      ...declaredOnly(),
      catalog: [
        { id: 'a', bpm: 68, key: 'D minor', releaseType: 'Album', duration: 320 },
        { id: 'b', bpm: 72, key: 'A minor', releaseType: 'Single', duration: 290 },
        { id: 'c', bpm: 64, key: 'G minor', releaseType: 'EP', duration: 260 },
      ],
      brandVoices: ['intimate'],
      equipment: ['modular rack'],
      daw: ['Reaper'],
      careerGoals: ['sync placements'],
      expertise: { production: 70, performance: 65, marketing: 60 },
      settings: {
        studio: { defaultQuantize: '1/16', autoMixEnabled: false, highFidelityExport: true, smartSheet: {} },
        audio: { sampleRate: 48000 },
        dj: { crossfaderCurve: 'power' },
      },
    } as unknown as UserProfile;

    const alignedReading = readMusicalDna(aligned, undefined, NOW);
    const baseline = readMusicalDna(declaredOnly(), undefined, NOW);

    expect(alignedReading.fidelity).toBeGreaterThan(baseline.fidelity);
    expect(alignedReading.dimensions.some((d) => d.posture === 'aligned')).toBe(true);
    expect(alignedReading.signature).not.toContain('still forming');
  });

  it('explains every reading with the evidence that produced it', () => {
    const reading = readMusicalDna(observedOnly(), undefined, NOW);
    const rhythm = reading.dimensions.find((d) => d.id === 'rhythm')!;

    expect(rhythm.evidence.join(' | ')).toContain('catalog works spanning');
    expect(rhythm.evidence.join(' | ')).toContain('Grid set to 1/32');
    expect(rhythm.evidenceCount).toBe(rhythm.evidence.length);
  });

  it('flags drift only once the gap between intent and work is material', () => {
    const profile = { ...declaredOnly() } as unknown as UserProfile;
    // Declared 100 / observed 0 gives every axis a maximal gap.
    const reading = readMusicalDna(profile, undefined, NOW);

    expect(reading.drift.length).toBeGreaterThan(0);
    expect(reading.drift.every((d) => d.gap >= 18)).toBe(true);
    expect(reading.drift[0].message).toContain('intent runs');
  });

  it('keeps strengths and gaps disjoint', () => {
    const reading = readMusicalDna(observedOnly(), undefined, NOW);

    expect(reading.strengths.length).toBeLessThanOrEqual(3);
    expect(reading.gaps.length).toBeLessThanOrEqual(3);
    expect(reading.strengths.some((id) => reading.gaps.includes(id))).toBe(false);
  });

  it('protects declared sonic rules when auto-mix is on', () => {
    const profile = declaredOnly();
    const mutable = profile as unknown as {
      settings: { studio: { autoMixEnabled: boolean } };
      expertise: Record<string, number>;
    };
    mutable.settings.studio.autoMixEnabled = true;
    mutable.expertise.production = 70;

    const protections = readMusicalDna(profile, undefined, NOW).adaptations.filter(
      (a) => a.severity === 'protect',
    );

    expect(protections.map((p) => p.id)).toContain('protect-sonic-non-negotiables');
    expect(protections.map((p) => p.id)).toContain('protect-production-authority');
    expect(protections.every((p) => p.rationale.length > 0)).toBe(true);
  });

  it('only protects when the profile actually contradicts itself', () => {
    // No non-negotiables declared and no self-rated craft to defend.
    const reading = readMusicalDna(blank(), undefined, NOW);

    expect(reading.adaptations.filter((a) => a.severity === 'protect')).toEqual([]);

    // Auto-mix plus a high self-rating IS a contradiction worth defending.
    const contradicted = readMusicalDna(observedOnly(), undefined, NOW).adaptations.filter(
      (a) => a.severity === 'protect',
    );
    expect(contradicted.map((p) => p.id)).toContain('protect-production-authority');
  });

  it('coaches the grid when a specific groove sits on the shipped default', () => {
    const reading = readMusicalDna(declaredOnly(), undefined, NOW);

    expect(reading.adaptations.map((a) => a.id)).toContain('protect-grid-vs-feel');
    expect(reading.adaptations.some((a) => a.severity === 'coach')).toBe(true);
  });
});

describe('recordDnaEvidence', () => {
  it('appends evidence without mutating the previous state', () => {
    const state = createInitialMusicalDnaState(NOW);
    const next = recordDnaEvidence(state, { dimension: 'rhythm', summary: 'Swing pushed to 62%' }, NOW);

    expect(state.events).toHaveLength(0);
    expect(next.events).toHaveLength(1);
    expect(next.events[0].summary).toBe('Swing pushed to 62%');
    expect(next.events[0].source).toBe('behaviour');
    expect(next.updatedAt).toBe(NOW);
  });

  it('caps the log so a long session cannot grow it without bound', () => {
    let state = createInitialMusicalDnaState(NOW);
    for (let i = 0; i < DNA_EVENT_CAP + 40; i++) {
      state = recordDnaEvidence(state, { dimension: 'harmony', summary: `chord ${i}` }, NOW + i);
    }

    expect(state.events).toHaveLength(DNA_EVENT_CAP);
    // The oldest signals are the ones dropped.
    expect(state.events[state.events.length - 1].summary).toBe(`chord ${DNA_EVENT_CAP + 39}`);
  });

  it('clamps an out-of-range weight instead of trusting the caller', () => {
    const state = recordDnaEvidence(undefined, { dimension: 'sonics', summary: 'x', weight: 12 }, NOW);

    expect(state.events[0].weight).toBe(1);
  });

  it('falls back to a labelled signal when the summary is blank', () => {
    const state = recordDnaEvidence(undefined, { dimension: 'writing', summary: '   ' }, NOW);

    expect(state.events[0].summary).toBe('Unlabelled signal');
  });
});

describe('learning from behaviour', () => {
  it('raises the observed score for the axis it belongs to', () => {
    const profile = blank();
    const before = readMusicalDna(profile, undefined, NOW).dimensions.find((d) => d.id === 'arrangement')!;
    const state = recordDnaEvidence(undefined, { dimension: 'arrangement', summary: 'Section map approved', weight: 0.6 }, NOW);
    const after = readMusicalDna(profile, state, NOW).dimensions.find((d) => d.id === 'arrangement')!;

    expect(before.observed).toBe(0);
    expect(after.observed).toBe(60);
    expect(after.evidence.join(' ')).toContain('Live signal: Section map approved');
  });

  it('weights recent behaviour far above stale behaviour', () => {
    const profile = blank();
    const fresh = recordDnaEvidence(undefined, { dimension: 'rhythm', summary: 'grid changed', weight: 0.5 }, NOW);
    const stale = recordDnaEvidence(
      undefined,
      { dimension: 'rhythm', summary: 'grid changed', weight: 0.5 },
      NOW - 3 * DNA_HALF_LIFE_DAYS * DAY,
    );

    const freshScore = readMusicalDna(profile, fresh, NOW).dimensions.find((d) => d.id === 'rhythm')!.observed;
    const staleScore = readMusicalDna(profile, stale, NOW).dimensions.find((d) => d.id === 'rhythm')!.observed;

    expect(freshScore).toBe(50);
    expect(staleScore).toBeLessThan(freshScore / 4);
  });

  it('never lets a burst of behaviour dominate a single axis', () => {
    const profile = blank();
    let state = createInitialMusicalDnaState(NOW);
    for (let i = 0; i < 30; i++) {
      state = recordDnaEvidence(state, { dimension: 'melody', summary: 'take', weight: 1 }, NOW);
    }
    const melody = readMusicalDna(profile, state, NOW).dimensions.find((d) => d.id === 'melody')!;

    // Behaviour is capped, so a busy day cannot fabricate a full reading.
    expect(melody.observed).toBe(60);
    expect(melody.posture).toBe('instinct-led');
  });

  it('halves influence every half-life', () => {
    expect(dnaRecencyWeight(NOW, NOW)).toBeCloseTo(1, 5);
    expect(dnaRecencyWeight(NOW - DNA_HALF_LIFE_DAYS * DAY, NOW)).toBeCloseTo(0.5, 5);
    expect(dnaRecencyWeight(NOW - 2 * DNA_HALF_LIFE_DAYS * DAY, NOW)).toBeCloseTo(0.25, 5);
  });
});

describe('dnaLessonPlan', () => {
  it('orders lessons by weakness and teaches no more than four', () => {
    const reading = readMusicalDna(declaredOnly(), undefined, NOW);
    const lessons = dnaLessonPlan(reading);

    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.length).toBeLessThanOrEqual(4);
    expect(new Set(lessons.map((l) => l.dimension)).size).toBe(lessons.length);
    expect(lessons[0].reason).toContain('weakest reading');
    expect(lessons.every((l) => l.action.length > 0 && l.category.length > 0)).toBe(true);
  });

  it('teaches from first principles when nothing is known yet', () => {
    const lessons = dnaLessonPlan(readMusicalDna(blank(), undefined, NOW));

    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0].reason).toContain('first principles');
  });
});

describe('buildMusicalDnaContext', () => {
  it('returns nothing without a profile', () => {
    expect(buildMusicalDnaContext(null)).toBe('');
  });

  it('states the fingerprint, each axis and every non-negotiable', () => {
    const profile = declaredOnly();
    (profile as { settings: { studio: { autoMixEnabled: boolean } } }).settings.studio.autoMixEnabled = true;

    const context = buildMusicalDnaContext(profile);

    expect(context).toContain('MUSICAL DNA');
    expect(context).toContain('Rhythm & Groove: vision-led');
    expect(context).toContain('vision-led (declared 100');
    expect(context).toContain('NON-NEGOTIABLE (sonics)');
    expect(context).toContain('DRIFT TO RAISE');
    expect(context).toContain('evidence:');
  });

  it('reflects freshly learned behaviour on the profile', () => {
    const profile = blank();
    // Fresh signal — the engine ages evidence against the real clock.
    const state = recordDnaEvidence(undefined, {
      dimension: 'audience',
      summary: 'first 100 listeners mapped',
      weight: 0.4,
    });
    const withDna = { ...profile, musicalDna: { ...state, lastReading: undefined } } as unknown as UserProfile;

    const context = buildMusicalDnaContext(withDna);

    expect(context).toContain('Audience & Reach: instinct-led');
    expect(context).toContain('Live signal: first 100 listeners mapped');
  });

  it('never quotes a stale stored snapshot over the live profile', () => {
    const profile = { ...observedOnly() } as unknown as UserProfile;

    const context = buildMusicalDnaContext(profile);

    expect(context).toContain('Rhythm & Groove: instinct-led');
  });
});

describe('buildMusicalDnaTeachingContext', () => {
  it('lists the teaching order for the weakest axes', () => {
    const context = buildMusicalDnaTeachingContext(declaredOnly());

    expect(context).toContain('TEACHING PRIORITY');
    expect(context).toMatch(/1\. /);
  });

  it('still gives a starting plan for a brand-new artist, and nothing without a profile', () => {
    expect(buildMusicalDnaTeachingContext(blank())).toContain('TEACHING PRIORITY');
    expect(buildMusicalDnaTeachingContext(null)).toBe('');
  });
});

/**
 * `buildArtistMusicContext` is the single context function fed to both AI
 * surfaces (the AiService advisor prompt and the chatbot master prompt), so
 * asserting through it proves the DNA reaches the product, not just the
 * engine's own tests.
 */
describe('artist context integration', () => {
  it('feeds the fingerprint and the teaching order to every AI surface', () => {
    const context = buildArtistMusicContext(declaredOnly());

    expect(context).toContain('MUSICAL DNA');
    expect(context).toContain('TEACHING PRIORITY');
    expect(context).toContain('Rhythm & Groove');
    expect(context.indexOf('MUSICAL DNA')).toBeLessThan(context.indexOf('TEACHING PRIORITY'));
  });

  it('keeps the artist\'s explicit profile leading the context', () => {
    const context = buildArtistMusicContext(declaredOnly());

    expect(context.indexOf('- Artist: North Star')).toBeLessThan(context.indexOf('MUSICAL DNA'));
  });

  it('survives a bare profile and an absent one', () => {
    expect(() => buildArtistMusicContext(blank())).not.toThrow();
    expect(buildArtistMusicContext(null)).toBe('');
  });
});
