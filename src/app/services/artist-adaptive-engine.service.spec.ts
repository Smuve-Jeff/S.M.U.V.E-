import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ArtistAdaptiveEngineService,
  GENRE_PROFILES,
} from './artist-adaptive-engine.service';
import { ArtistAiCoachService } from './artist-ai-coach.service';
import { ArtistCareerExpansionService } from './artist-career-expansion.service';
import { UserProfileService, initialProfile, UserProfile } from './user-profile.service';

describe('Profile-adaptive music manager', () => {
  let service: ArtistAdaptiveEngineService;
  let profile: ReturnType<typeof signal<UserProfile>>;

  /** What the artist interview or uplink leaves behind once it is accepted. */
  const commit = (p: UserProfile): UserProfile => ({
    ...p,
    artistName: 'Test Artist',
    profileSetupCompleted: true,
  });
  beforeEach(() => {
    profile = signal({
      ...JSON.parse(JSON.stringify(initialProfile)),
      settings: {
        ...JSON.parse(JSON.stringify(initialProfile.settings)),
        security: {
          ...JSON.parse(JSON.stringify(initialProfile.settings.security)),
          shareProfileAnswersWithAi: true,
        },
      },
    });
    TestBed.configureTestingModule({ providers: [{ provide: UserProfileService, useValue: { profile } }] });
    service = TestBed.inject(ArtistAdaptiveEngineService);
  });
  it('does not turn unknown or hybrid genres into Hip Hop', () => {
    profile.update((p) => ({ ...p, primaryGenre: 'Microtonal chamber drone', musicalJourney: { ...p.musicalJourney, marketPosition: '' } }));
    const state = service.adaptationState();
    expect(state.genreProfile.id).toBe('artist-defined');
    expect(state.genreProfile.label).toBe('Microtonal chamber drone');
    expect(state.genreProfile.businessPlaybook.marketPosition).toBe('Not declared');
    expect(state.productionDirective).not.toContain('808');
  });
  it('uses general advice when AI sharing is unset in a legacy profile', () => {
    const legacy = {
      ...profile(),
      settings: {
        ...profile().settings,
        security: { ...profile().settings.security, shareProfileAnswersWithAi: undefined },
      },
    } as any;

    const state = service.buildAdaptationState(legacy);

    expect(state.profile.artistName).toBe('Private artist');
    expect(state.musicalDnaContext).toBe('');
    expect(state.productionDirective).toContain('general production advice only');
    expect(state.knowledge.identity.name).not.toBe(legacy.artistName);
  });

  it('lets declared priorities and boundaries override a known genre template', () => {
    profile.update((p) => ({ ...commit(p), primaryGenre: 'Hip Hop', daw: ['Existing Setup'], musicalJourney: { ...p.musicalJourney, preferredBpmRange: '60-80', signatureSound: 'Bowed strings and silence', musicBlueprint: { ...p.musicalJourney.musicBlueprint, mixingPriorities: ['Natural dynamics'], sonicNonNegotiables: 'No quantization', arrangementApproach: 'Through-composed' } } }));
    const state = service.adaptationState();
    expect(state.genreProfile.productionDefaults.mixPriorities).toEqual(['Natural dynamics']);
    expect(state.genreProfile.productionDefaults.typicalBpmRange).toEqual([60, 80]);
    expect(state.productionDirective).toContain('No quantization');
    expect(state.productionDirective).toContain('Working DAW: Existing Setup');
    expect(state.productionDirective).toContain('Tempo zone: 60-80 BPM');
    expect(state.genreProfile.songwritingRules.typicalStructures).toEqual(['Through-composed']);
  });

  it('labels a suggested DAW and tempo range as not declared', () => {
    const state = service.adaptationState();

    expect(state.productionDirective).toContain('Suggested DAW:');
    expect(state.productionDirective).toContain('not declared yet');
    expect(state.productionDirective).not.toContain('Working DAW:');

    // Journey defaults are not the artist's business answers yet.
    expect(state.businessStrategy).toContain(
      'Release velocity: Artist-selected sustainable cadence'
    );
    expect(state.businessStrategy).not.toContain('Occasional');
    expect(state.businessStrategy).toContain('Success metric: Not declared');
    expect(state.businessStrategy).not.toContain('Creative Satisfaction');
  });
  it('does not mistake string No for prepared assets or crash with incomplete settings', () => {
    const p = {
      ...profile(),
      settings: {
        ...profile().settings,
        security: { ...profile().settings.security, shareProfileAnswersWithAi: true },
      },
      syncDetails: { hasCleanVersions: 'No', hasInstrumentals: 'No', hasStems: 'No', oneStopClearance: 'No' },
    } as any;
    const state = service.buildAdaptationState(p);
    expect(state.syncReadiness.score).toBe(0);
    expect(state.syncReadiness.missingAssets).toHaveLength(4);
  });
  it('scores the questionnaire sync tiers and tour readiness vocabulary', () => {
    const assessSync = (isSyncReady: string) => service.buildAdaptationState({
      ...profile(),
      settings: { ...profile().settings, security: { ...profile().settings.security, shareProfileAnswersWithAi: true } },
      syncDetails: { isSyncReady, hasCleanVersions: true, hasInstrumentals: true, hasStems: 'Full Multitrack', oneStopClearance: true },
    } as any).syncReadiness.score;
    expect(assessSync('Basics Ready')).toBe(85);
    expect(assessSync('Full Stem Mastery')).toBe(93);
    expect(assessSync('One-Stop Qualified')).toBe(100);

    const live = (isTourReady: string) => service.buildAdaptationState({
      ...profile(),
      settings: { ...profile().settings, security: { ...profile().settings.security, shareProfileAnswersWithAi: true } },
      touringDetails: { isTourReady, hasBackline: 'Partial', regions: ['Midwest'] },
      catalog: [{ id: '1' }, { id: '2' }, { id: '3' }],
    } as any).liveReadiness.score;
    expect(live('Local Gigs')).toBe(80);
    expect(live('Regional Ready')).toBe(90);
    expect(live('Global Ready')).toBe(100);
  });

  it('does not invent a scheduled release or infer elite status from a label relationship', () => {
    profile.update((p) => ({ ...p, team: [{ id: 'label', name: 'Distributor', role: 'Label', share: 0, joinedAt: '' }] }));
    const coach = TestBed.inject(ArtistAiCoachService).coachState();
    expect(coach.personalized.releaseStrategy.nextRelease.targetDate).toContain('Not scheduled');
    const career = TestBed.inject(ArtistCareerExpansionService).expandedAdaptationState();
    expect(career.careerStage.id).not.toBe('elite');
    expect(career.careerStage.typicalGigRate).toContain('Unquoted');
  });

  it('describes sync gaps without promising multiplied revenue', () => {
    profile.update((p) => ({
      ...p,
      team: [],
      services: [],
      settings: {
        ...p.settings,
        security: {
          ...p.settings.security,
          shareProfileAnswersWithAi: true,
          hideSensitiveProfileDetails: false,
        },
      },
      syncDetails: {
        isSyncReady: 'Not Started',
        hasCleanVersions: 'No',
        hasInstrumentals: 'No',
        hasStems: 'No',
        oneStopClearance: 'No',
      },
    } as any));

    const missed = TestBed.inject(ArtistAiCoachService).coachState().personalized.missedOpportunities.join(' ');

    expect(missed).toContain('Sync assets are');
    expect(missed).toContain('before a pitch is credible');
    expect(missed).not.toMatch(/multiply revenue/i);
  });

  it('gives Country and Blues real production defaults instead of artist-defined', () => {
    profile.update((p) => ({ ...commit(p), primaryGenre: 'Country' }));
    let state = service.adaptationState();
    expect(state.genreProfile.id).toBe('country');
    expect(state.genreProfile.label).toBe('Country');
    expect(state.genreProfile.songwritingRules.typicalStructures[0]).toContain(
      'Country Verse'
    );
    expect(state.genreProfile.productionDefaults.mixPriorities.length).toBeGreaterThan(0);
    expect(state.genreAdviceHeld).toBe(false);

    profile.update((p) => ({ ...commit(p), primaryGenre: 'Blues' }));
    state = service.adaptationState();
    expect(state.genreProfile.id).toBe('blues');
    expect(state.genreProfile.songwritingRules.typicalStructures[0]).toContain(
      '12-Bar Blues'
    );
  });

  it('resolves Rap through the shared catalog and keeps the artist’s label', () => {
    profile.update((p) => ({ ...commit(p), primaryGenre: 'Rap' }));

    const state = service.adaptationState();

    expect(state.genreProfile.id).toBe('hip-hop');
    expect(state.genreProfile.label).toBe('Rap');
    expect(state.genreProfile.songwritingRules.typicalStructures[0]).toContain(
      'Hook-First Rap'
    );
  });

  it('carries the second half of a hybrid into the directive', () => {
    profile.update((p) => ({ ...commit(p), primaryGenre: 'Country Trap' }));

    const state = service.adaptationState();

    expect(state.genreProfile.id).toBe('country');
    expect(state.genreProfile.hybrid?.secondaryLabels).toEqual(['Hip Hop']);
    expect(
      state.genreProfile.songwritingRules.typicalStructures.join(' | ')
    ).toContain('Hook-First Rap');
    expect(
      state.genreProfile.songwritingRules.arrangementPatterns.join(' | ')
    ).toContain('Blend:');
    expect(state.productionDirective).toContain('Hybrid read: Hip Hop');
    expect(state.productionDirective).toContain('Hip Hop half');
    expect(state.productionDirective).toContain('Alternate form: Hook-First Rap');
  });

  it.each([
    ['Rap', 'hip-hop'],
    ['Electronic', 'electronic-edm'],
    ['Singer-Songwriter', 'singer-songwriter'],
  ])(
    'keeps the curated %s profile ahead of the catalog',
    (genre, curatedId) => {
      profile.update((p) => ({ ...commit(p), primaryGenre: genre }));

      const state = service.adaptationState();
      const curated = GENRE_PROFILES.find((entry) => entry.id === curatedId);
      if (!curated) throw new Error(`missing curated profile ${curatedId}`);

      // The catalog now resolves the genre; the curated profile must still win
      // the business/live detail instead of being replaced by the synthetic
      // one, or removing the substring probe would have silently downgraded
      // the four families that had real playbooks.
      expect(state.genreProfile.label).toBe(genre);
      expect(state.genreProfile.businessPlaybook.releaseStrategy).toBe(
        curated.businessPlaybook.releaseStrategy
      );
      expect(
        state.genreProfile.livePerformance.tourReadinessRequirements
      ).toEqual(curated.livePerformance.tourReadinessRequirements);
      expect(state.genreProfile.businessPlaybook.releaseStrategy).not.toBe(
        'Readiness-led release plan within capacity and budget'
      );
    }
  );

  it('holds genre recommendations until the profile is committed', () => {
    // A fresh profile still carries the untouched default genre, so there is no
    // accepted interview to attach a tempo or form to.
    const state = service.adaptationState();

    expect(state.genreAdviceHeld).toBe(true);

    expect(state.genreProfile.id).toBe('artist-defined');
    expect(state.genreProfile.label).toBe('Artist-defined');
    expect(state.genreProfile.songwritingRules.typicalStructures).toEqual([
      'Artist-selected structure',
    ]);
    expect(state.productionDirective).toContain('ARTIST-DEFINED');
    expect(state.productionDirective).not.toContain('Hip Hop');
  });

  it('still holds default Hip Hop advice for a named but uncommitted profile', () => {
    // The gap: typing a name is not committing the interview. The default genre
    // is still untouched, so Hip Hop must not become the plan.
    profile.update((p) => ({ ...p, artistName: 'Named Artist' }));

    const state = service.adaptationState();

    expect(state.genreAdviceHeld).toBe(true);
    expect(state.genreProfile.id).toBe('artist-defined');
    expect(state.productionDirective).not.toContain('Hip Hop');
    expect(
      state.warningsAndProtections.join(' ')
    ).toContain('held until the artist interview');
  });

  it('never profiles a missing genre as Hip Hop', () => {
    // The old substring probe ran on an empty query, where `includes('')` is
    // true, so an artist with no genre was silently given the Hip Hop playbook.
    profile.update((p) => ({ ...p, primaryGenre: '' }));

    expect(service.adaptationState().genreProfile.id).toBe('artist-defined');
  });
});
