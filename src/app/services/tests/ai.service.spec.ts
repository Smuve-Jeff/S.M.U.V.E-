import { MarketingService } from '../marketing.service';
import { AnalyticsService } from '../analytics.service';
import { TestBed } from '@angular/core/testing';
import { AiService, API_KEY_TOKEN } from '../ai.service';
import { UserProfileService } from '../user-profile.service';
import { UserContextService } from '../user-context.service';
import { StemSeparationService } from '../stem-separation.service';
import { AudioEngineService } from '../audio-engine.service';
import { signal } from '@angular/core';
import { ArtistIdentityService } from '../artist-identity.service';
import { AuthService } from '../auth.service';

describe('AiService', () => {
  let service: AiService;
  let userProfileService: any;
  let userContextService: any;
  let analyticsService: any;
  let artistIdentityService: any;
  let authServiceMock: any;

  beforeEach(() => {
    userProfileService = {
      profile: signal({
        catalog: [],
        equipment: [],
        daw: [],
        services: [],
        marketingCampaigns: [],
        recommendationPreferences: {},
        recommendationHistory: [],
        primaryGenre: 'Hip-Hop',
        tasks: [],
        skills: [],
        expertiseLevels: {
          production: 5,
          marketing: 5,
          mastering: 5,
          audioEngineering: 5,
        },
      }),
      updateProfile: jest.fn(),
    };
    userContextService = {
      mainViewMode: signal('hub'),
      setMainViewMode: jest.fn(),
      navigateToView: jest.fn(),
    };
    analyticsService = {
      overallGrowth: signal(2),
      engagement: signal({ trend: -1 }),
      streams: signal({ value: 1000 }),
    };
    artistIdentityService = {
      buildIdentitySnapshot: jest.fn().mockReturnValue({
        fingerprint: {
          trustScore: 68,
          riskFlags: ['One or more connectors are stale'],
        },
        sync: { queueDepth: 2 },
        resolution: { manualReviewRequired: true },
        recommendations: [
          {
            title: 'Resolve pending connector approvals',
            impactScore: 90,
            confidenceScore: 82,
            category: 'sync',
          },
        ],
      }),
    };
    authServiceMock = {
      currentUser: signal({
        id: 'test-user',
        emailVerified: true,
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        AiService,
        MarketingService,
        { provide: AnalyticsService, useValue: analyticsService },
        {
          provide: API_KEY_TOKEN,
          useValue: 'AIzaSyCVdPtw0C_5rgiHDRi5mQYL4GXZMrdiDj4',
        },
        { provide: UserProfileService, useValue: userProfileService },
        { provide: UserContextService, useValue: userContextService },
        { provide: ArtistIdentityService, useValue: artistIdentityService },
        { provide: AuthService, useValue: authServiceMock },
        { provide: StemSeparationService, useValue: {} },
        {
          provide: AudioEngineService,
          useValue: {
            resume: jest.fn(),
            ensureTrack: jest.fn(),
            updateTrack: jest.fn(),
          },
        },
      ],
    });
    service = TestBed.inject(AiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate advisor advice when state changes', () => {
    // Manually call the private update method
    (service as any).updateAdvisorAdvice('hub', userProfileService.profile());

    const advice = service.advisorAdvice();
    expect(advice.length).toBeGreaterThan(0);
    expect(advice[0].title).toBe('Visibility Surge Needed');
  });

  it('generates structured chord progression payloads', () => {
    const progression = service.generateChordProgression({
      genre: 'Hip Hop',
      mood: 'dark',
      section: 'verse',
      variation: 0.8,
      humanize: true,
    });
    expect(progression.length).toBe(4);
    expect(progression[0].midi.length).toBeGreaterThan(0);
  });

  it('generates bass and drum patterns with humanize option', () => {
    const bass = service.generateBassline({
      genre: 'Trap',
      section: 'hook',
      variation: 0.6,
      humanize: true,
    });
    const drums = service.generateDrumPattern({
      style: 'Trap',
      energy: 0.8,
      section: 'hook',
      variation: 0.5,
      humanize: true,
    });
    expect(bass.length).toBeGreaterThan(0);
    expect(drums.length).toBeGreaterThan(0);
  });

  it('regenerates section bundles for chords, bass, and drums', () => {
    const result = service.regenerateSection({
      section: 'hook',
      variation: 0.7,
      includeChords: true,
      includeBass: true,
      includeDrums: true,
    });
    expect(result.section).toBe('hook');
    expect(result.chords?.length).toBeGreaterThan(0);
    expect(result.bass?.length).toBeGreaterThan(0);
    expect(result.drums?.length).toBeGreaterThan(0);
  });

  it('handles new generate bass/drums slash commands', async () => {
    const bassResponse = await service.processCommand('/generate_bass');
    const drumResponse = await service.processCommand('/generate_drums');
    expect(bassResponse.toLowerCase()).toContain('generated');
    expect(drumResponse.toLowerCase()).toContain('generated');
  });

  it('personalizes upgrade recommendations around missing campaigns and shallow catalog depth', () => {
    userProfileService.profile.set({
      ...userProfileService.profile(),
      catalog: [{ id: 'track-1', title: 'Single A' }],
      marketingCampaigns: [],
      services: [],
      recommendationPreferences: {},
    });
    userContextService.mainViewMode.set('strategy');

    const recommendations = service.getUpgradeRecommendations();
    expect(recommendations[0].id).toBe('upg-dsp-promotion');
    expect(recommendations[0].priority).toBe('Critical');
    expect(recommendations[0].toolId).toBe('strategy');
    expect(recommendations[0].whyNow).toContain('campaign');
    expect(recommendations[0].progressSignals?.[0]?.label).toBe(
      'Campaign reach'
    );
  });

  it('filters recommendations marked as not relevant', () => {
    userProfileService.profile.set({
      ...userProfileService.profile(),
      recommendationPreferences: {
        'upg-dsp-promotion': {
          state: 'not-relevant',
          updatedAt: Date.now(),
        },
      },
    });

    const recommendations = service.getUpgradeRecommendations();
    expect(
      recommendations.find(
        (recommendation) => recommendation.id === 'upg-dsp-promotion'
      )
    ).toBeUndefined();
  });

  it('marks acquired recommendations from the correct profile bucket', () => {
    userProfileService.profile.set({
      ...userProfileService.profile(),
      services: ['DSP Promotion'],
    });

    const promotionRecommendation = service
      .getUpgradeRecommendations()
      .find((recommendation) => recommendation.id === 'upg-dsp-promotion');

    expect(promotionRecommendation?.state).toBe('acquired');
  });

  it('keeps completed recommendations distinct from acquired ones', () => {
    userProfileService.profile.set({
      ...userProfileService.profile(),
      services: ['DSP Promotion'],
      recommendationPreferences: {
        'upg-dsp-promotion': {
          state: 'completed',
          updatedAt: Date.now(),
          actionCount: 2,
        },
      },
    });

    const promotionRecommendation = service
      .getUpgradeRecommendations()
      .find((recommendation) => recommendation.id === 'upg-dsp-promotion');

    expect(promotionRecommendation?.state).toBe('completed');
    expect(promotionRecommendation?.historySummary).toContain('completed');
  });

  it('adds identity-backed checklist items and recommendations', async () => {
    const recommendations = await service.getStrategicRecommendations();
    const checklist = service.getDynamicChecklist();

    expect(
      recommendations.some((item) =>
        item.action.toLowerCase().includes('catalog')
      )
    ).toBe(true);
    expect(checklist.some((item) => item.category === 'Identity')).toBe(true);
  });
});
