import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  EnhancedArtistQuestionnaireEngine,
  ALL_GENRES,
  GENRE_OPTIONS,
  getGenreDeepDive,
} from './enhanced-artist-questionnaire-engine';
import { UserProfileService } from './user-profile.service';
import { AiService } from './ai.service';
import { initialProfile } from '../types/profile.types';

function profileWith(overrides: Record<string, any>): any {
  const base = JSON.parse(JSON.stringify(initialProfile)) as any;
  const apply = (obj: any, path: string, value: any) => {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object')
        cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  };
  for (const [k, v] of Object.entries(overrides)) apply(base, k, v);
  return base;
}

describe('EnhancedArtistQuestionnaireEngine', () => {
  let engine: EnhancedArtistQuestionnaireEngine;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EnhancedArtistQuestionnaireEngine,
        { provide: UserProfileService, useValue: { profile: signal(initialProfile) } },
        {
          provide: AiService,
          useValue: { getQuestionnaireInsights: jest.fn().mockReturnValue([]) },
        },
      ],
    });
    engine = TestBed.inject(EnhancedArtistQuestionnaireEngine);
  });

  it('keeps every question id unique', () => {
    const ids = engine.allQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all eight phases with 54+ questions', () => {
    const phases = new Set(engine.allQuestions.map((q) => q.phase));
    expect(phases.size).toBe(8);
    expect(engine.allQuestions.length).toBeGreaterThanOrEqual(54);
  });

  it('resolves every question field safely against the initial profile', () => {
    for (const q of engine.allQuestions) {
      // Must not throw for any dot-path — including the nested settings.* fields.
      expect(() => (engine as any).getDeepField(initialProfile, q.field)).not.toThrow();
    }
  });

  it('offers every catalog genre with a populated deep dive', () => {
    for (const genre of ALL_GENRES) {
      const dive = getGenreDeepDive(genre);
      expect(dive.subgenres.length).toBeGreaterThan(0);
      expect(dive.productionEssentials.length).toBeGreaterThan(0);
      expect(dive.audienceExpectations.length).toBeGreaterThan(0);
      expect(dive.recommendedBpmRange[1]).toBeGreaterThanOrEqual(
        dive.recommendedBpmRange[0]
      );
    }
  });

  it('ships a genre catalog of 40+ entries (all music genres)', () => {
    expect(GENRE_OPTIONS.length).toBeGreaterThanOrEqual(40);
    expect(ALL_GENRES).toContain('K-Pop');
    expect(ALL_GENRES).toContain('Amapiano');
    expect(ALL_GENRES).toContain('Film Score');
    expect(ALL_GENRES).toContain('Hyperpop');
  });

  it('builds dynamic subgenre options from the genre deep dive', () => {
    const opts = engine.getSubgenreOptions('Hip Hop');
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].label).toBeTruthy();
    expect(opts[0].value).toBeTruthy();
  });

  it('filters questions by phase and conditions', () => {
    const identity = engine.questionsForPhase('identity', initialProfile);
    expect(identity.length).toBeGreaterThan(0);
    expect(identity.every((q) => q.phase === 'identity')).toBe(true);
  });

  it('detects archetype from expertise.roles (where the questionnaire stores roles)', async () => {
    const producer = profileWith({
      'expertise.roles': ['producer', 'engineer'],
    });
    const persona = await engine.synthesizePersona(producer);
    expect(persona.archetype).toContain('Producer-Engineer');
  });

  it('embeds the artist signature sound into the persona synthesis', async () => {
    const p = profileWith({
      'musicalJourney.signatureSound': 'warped tape 808s with angelic choir pads',
    });
    const persona = await engine.synthesizePersona(p);
    expect(persona.sonicSignature).toContain('warped tape 808s');
  });

  it('weaves journey anchors (first song + breakthrough) into the AI persona profile', async () => {
    const p = profileWith({
      'musicalJourney.firstSong': 'Ode to My City',
      'musicalJourney.breakthroughMoment': 'Sold out the local arena',
    });
    const persona = await engine.synthesizePersona(p);
    expect(persona.aiPersonaProfile).toContain('Ode to My City');
    expect(persona.aiPersonaProfile).toContain('local arena');
  });

  it('keeps strength scores bounded 0–100', () => {
    const s = engine.calculateStrength(initialProfile);
    expect(s.overall).toBeGreaterThanOrEqual(0);
    expect(s.overall).toBeLessThanOrEqual(100);
    for (const key of [
      'identityClarity',
      'musicalDepth',
      'technicalAbility',
      'businessReadiness',
      'brandDefinition',
      'aiIntegration',
    ] as const) {
      expect(s[key]).toBeGreaterThanOrEqual(0);
      expect(s[key]).toBeLessThanOrEqual(100);
    }
  });

  it('recommends claiming a signature sound when it is missing', async () => {
    const result = await engine.generateAIAnalysis(initialProfile);
    expect(
      result.recommendations.some((r: any) =>
        r.title.includes('Signature Sound')
      )
    ).toBe(true);
  });

  it('recommends income diversification for thin revenue engines', async () => {
    const p = profileWith({
      'musicalJourney.incomeStreams': ['Streaming'],
    });
    const result = await engine.generateAIAnalysis(p);
    expect(
      result.recommendations.some((r: any) =>
        r.title.includes('Diversify Income Streams')
      )
    ).toBe(true);
  });

  it('generates genre-aware sync + competitive intelligence insights', async () => {
    const p = profileWith({ primaryGenre: 'Hip Hop' });
    const result = await engine.generateAIAnalysis(p);
    const titles = result.recommendations.map((r: any) => r.title);
    expect(titles.some((t: string) => t.includes('Sync Potential'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Competitive Angle'))).toBe(
      true
    );
  });

  it('flags tempo drift against the genre BPM pocket', async () => {
    const aligned = profileWith({
      primaryGenre: 'Hip Hop',
      'musicalJourney.preferredBpmRange': '70-100',
    });
    const drifting = profileWith({
      primaryGenre: 'Hip Hop',
      'musicalJourney.preferredBpmRange': '180-200',
    });
    const a = await engine.generateAIAnalysis(aligned);
    const d = await engine.generateAIAnalysis(drifting);
    const aTempo = a.recommendations.find((r: any) =>
      r.title.includes('Tempo Zone')
    );
    const dTempo = d.recommendations.find((r: any) =>
      r.title.includes('Tempo Zone')
    );
    expect(aTempo).toBeDefined();
    expect(dTempo).toBeDefined();
    expect(aTempo.impact).toBe('High');
    expect(dTempo.impact).toBe('Critical');
  });

  it('weaves the journey-wizard fields into persona synthesis', async () => {
    const p = profileWith({
      'musicalJourney.experienceLevel': 'Professional',
      'musicalJourney.preferredBpmRange': '90-120',
      'musicalJourney.biggestChallenge': 'No budget for music videos',
    });
    const persona = await engine.synthesizePersona(p);
    expect(persona.aiPersonaProfile).toContain('Professional');
    expect(persona.aiPersonaProfile).toContain('90-120');
    expect(persona.recommendedStrategy).toContain('No budget for music videos');
  });

  it('prioritizes the named biggest challenge in recommendations', async () => {
    const p = profileWith({
      'musicalJourney.biggestChallenge': 'Never enough time in the studio',
    });
    const result = await engine.generateAIAnalysis(p);
    expect(
      result.recommendations.some((r: any) =>
        r.title.includes('Biggest Barrier')
      )
    ).toBe(true);
  });

  it('treats the website question as a text URL field, not a boolean toggle', () => {
    const q = engine.allQuestions.find((x) => x.id === 'q31');
    expect(q?.type).toBe('text');
    expect(q?.field).toBe('website');
  });

  it('normalizes toggle question fields to booleans in the initial profile', () => {
    const toggles = engine.allQuestions.filter((q) => q.type === 'toggle');
    expect(toggles.length).toBeGreaterThan(0);
    for (const t of toggles) {
      const value = (engine as any).getDeepField(initialProfile, t.field);
      // Answered toggles must be real booleans; unanswered ones may be absent.
      expect(typeof value === 'boolean' || value === undefined).toBe(true);
    }
  });
});
