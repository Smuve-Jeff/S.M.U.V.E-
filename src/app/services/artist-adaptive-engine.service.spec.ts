import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistAdaptiveEngineService } from './artist-adaptive-engine.service';
import { ArtistAiCoachService } from './artist-ai-coach.service';
import { ArtistCareerExpansionService } from './artist-career-expansion.service';
import { UserProfileService, initialProfile, UserProfile } from './user-profile.service';

describe('Profile-adaptive music manager', () => {
  let service: ArtistAdaptiveEngineService;
  let profile: ReturnType<typeof signal<UserProfile>>;
  beforeEach(() => {
    profile = signal(JSON.parse(JSON.stringify(initialProfile)));
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
  it('lets declared priorities and boundaries override a known genre template', () => {
    profile.update((p) => ({ ...p, primaryGenre: 'Hip Hop', daw: ['Existing Setup'], musicalJourney: { ...p.musicalJourney, preferredBpmRange: '60-80', signatureSound: 'Bowed strings and silence', musicBlueprint: { ...p.musicalJourney.musicBlueprint, mixingPriorities: ['Natural dynamics'], sonicNonNegotiables: 'No quantization', arrangementApproach: 'Through-composed' } } }));
    const state = service.adaptationState();
    expect(state.genreProfile.productionDefaults.mixPriorities).toEqual(['Natural dynamics']);
    expect(state.genreProfile.productionDefaults.typicalBpmRange).toEqual([60, 80]);
    expect(state.productionDirective).toContain('No quantization');
    expect(state.genreProfile.songwritingRules.typicalStructures).toEqual(['Through-composed']);
  });
  it('does not mistake string No for prepared assets or crash with incomplete settings', () => {
    const p = { ...profile(), settings: undefined, syncDetails: { hasCleanVersions: 'No', hasInstrumentals: 'No', hasStems: 'No', oneStopClearance: 'No' } } as any;
    const state = service.buildAdaptationState(p);
    expect(state.syncReadiness.score).toBe(0);
    expect(state.syncReadiness.missingAssets).toHaveLength(4);
  });
  it('does not invent a scheduled release or infer elite status from a label relationship', () => {
    profile.update((p) => ({ ...p, team: [{ id: 'label', name: 'Distributor', role: 'Label', share: 0, joinedAt: '' }] }));
    const coach = TestBed.inject(ArtistAiCoachService).coachState();
    expect(coach.personalized.releaseStrategy.nextRelease.targetDate).toContain('Not scheduled');
    const career = TestBed.inject(ArtistCareerExpansionService).expandedAdaptationState();
    expect(career.careerStage.id).not.toBe('elite');
    expect(career.careerStage.typicalGigRate).toContain('Unquoted');
  });
});
