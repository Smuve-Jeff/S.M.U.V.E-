import { ArtistProfileModuleService } from './artist-profile-module.service';
import type { UserProfile } from './user-profile.service';

describe('ArtistProfileModuleService', () => {
  let service: ArtistProfileModuleService;

  beforeEach(() => {
    service = new ArtistProfileModuleService();
  });

  it('exposes every profile pane exactly once', () => {
    const ids = service.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('production-tools');
    expect(ids).toContain('sync-licensing');
    expect(ids).toContain('legal-infrastructure');
    expect(ids).toContain('mastery');
  });

  it('scores an empty profile as uncalibrated with actionable gaps', () => {
    const mastery = service.mastery({} as UserProfile);

    expect(mastery.overall).toBe(0);
    expect(mastery.calibrated).toBe(false);
    expect(mastery.sections.length).toBe(service.navigableSections.length);
    expect(mastery.weakest[0].score).toBe(0);
    expect(mastery.nextActions.length).toBeGreaterThan(0);
    expect(mastery.nextActions[0]).toMatch(/:/);
  });

  it('never throws on a hostile or partial profile', () => {
    expect(() => service.mastery(null)).not.toThrow();
    expect(() =>
      service.mastery({
        catalog: null,
        team: undefined,
        financials: {} as any,
        syncDetails: {} as any,
        legalInfrastructure: {} as any,
        musicalJourney: {} as any,
      } as unknown as UserProfile)
    ).not.toThrow();
    expect(service.coverageFor(null)).toHaveProperty('catalog');
  });

  it('raises each pane score as its real elements arrive', () => {
    const base = service.sectionCoverage({} as UserProfile, 'sync-licensing');
    const filled = service.sectionCoverage(
      {
        syncDetails: {
          isSyncReady: 'Ready',
          hasCleanVersions: true,
          hasInstrumentals: true,
          hasStems: 'Full Multitrack',
          oneStopClearance: true,
          catalogSize: 12,
          preferredKeywords: ['documentary'],
        },
      } as unknown as UserProfile,
      'sync-licensing'
    );

    expect(base.score).toBe(0);
    expect(filled.score).toBe(100);
    expect(filled.missing).toEqual([]);
  });

  it('reports calibrated only when every pane is strong', () => {
    const mastery = service.mastery({
      artistName: 'North Star',
      primaryGenre: 'Ambient',
      location: 'Chicago',
      website: 'https://northstar.example',
      avatarImage: 'data:image/png;base64,abc',
      pressGallery: ['a.png'],
      skills: ['Producer'],
      productionStyles: ['Minimal'],
      brandVoices: ['intimate'],
      strategicGoals: ['sync'],
      careerGoals: ['touring'],
      proName: 'ASCAP',
      proIpi: '123456',
      equipment: ['Condenser Mic'],
      daw: ['Ableton Live'],
      services: ['DistroKid'],
      expertise: { production: 6 },
      catalog: [
        {
          id: 'a',
          title: 'A',
          isrc: 'US123',
          releaseDate: '2025-01-01',
          releaseType: 'Single',
          distributor: 'DistroKid',
          platforms: ['Spotify'],
          credits: 'Written by North Star',
          splitSheetRef: 'SPLIT-01',
        },
        {
          id: 'b',
          title: 'B',
          isrc: 'US124',
          releaseDate: '2025-04-01',
          releaseType: 'Single',
          distributor: 'DistroKid',
          platforms: ['Spotify'],
          credits: 'Written by North Star',
          splitSheetRef: 'SPLIT-02',
        },
        {
          id: 'c',
          title: 'C',
          isrc: 'US125',
          releaseDate: '2025-07-01',
          releaseType: 'EP',
          distributor: 'DistroKid',
          platforms: ['Spotify'],
          credits: 'Written by North Star',
          splitSheetRef: 'SPLIT-03',
        },
      ],
      officialArtistProfiles: [
        {
          id: 'spotify-for-artists',
          destinationId: 'spotify-for-artists',
          url: 'https://artists.spotify.com/northstar',
          verified: true,
        },
        {
          id: 'ascap',
          destinationId: 'ascap',
          url: 'https://www.ascap.com/northstar',
          verified: true,
        },
        {
          id: 'chartmetric',
          destinationId: 'chartmetric',
          url: 'https://chartmetric.com/artist/northstar',
          verified: true,
        },
        {
          id: 'distrokid',
          destinationId: 'distrokid',
          url: 'https://distrokid.com/dashboard',
          verified: true,
        },
      ],
      marketingCampaigns: [{ id: 'c1' } as any],
      financials: { accounts: [{}], monthlyBudget: 200, totalRevenue: 100, revenueHistory: [{}] } as any,
      syncDetails: {
        isSyncReady: 'Actively Pitching',
        hasCleanVersions: true,
        hasInstrumentals: true,
        hasStems: 'Full Multitrack',
        oneStopClearance: true,
        catalogSize: 4,
        preferredKeywords: ['hopeful'],
      },
      legalInfrastructure: {
        hasRegisteredWorks: true,
        proAffiliation: 'ASCAP',
        hasStandardSplitSheet: 'In Use',
        isIncorporated: true,
        trademarkStatus: 'Registered',
      },
      touringDetails: {
        travelPreference: 'Van',
        regions: ['Midwest'],
        isTourReady: 'Tour Ready',
        hasBackline: 'Yes',
      },
      performancesPerYear: '20',
      team: [{ name: 'Sam', role: 'Manager' } as any],
      artistIdentity: {
        linkedAccounts: [{}],
        works: [{}],
        resolution: { confidenceScore: 0.8 },
        fingerprint: {},
      } as any,
      settings: {
        ai: {
          commanderPersona: 'Ominous Dominator',
          aiConversationalTier: 'Elite',
          aiPersonaIntensityEnabled: true,
          aiTotalControlEnabled: false,
          aiMimicEnabled: true,
        },
      } as any,
      genreSpecificData: { tempo: 120 },
      musicalJourney: {
        subgenres: ['drone'],
        marketPosition: 'Artistic',
        preferredBpmRange: '60-80',
        educationalBackground: 'Self-Taught',
        currentFocus: 'EP',
        primarySuccessMetric: 'repeat listeners',
        releaseVelocity: 'quarterly',
        incomeStreams: ['sync'],
        collaborationGoals: 'film composers',
      },
    } as unknown as UserProfile);

    const incomplete = mastery.sections
      .filter((section) => section.score < 100)
      .map((section) => `${section.id}: ${section.missing.join(', ')}`);
    expect(incomplete).toEqual([]);
    expect(mastery.overall).toBe(100);
    expect(mastery.calibrated).toBe(true);
    expect(mastery.nextActions).toEqual([]);
  });

  /**
   * The Identity Console pane used to be scored from
   * `artistIdentity.linkedAccounts`, which the identity service generates as one
   * candidate row per launch connector for every artist. That array is never
   * empty, so the pane awarded its heaviest element (weight 5) to an artist who
   * held no accounts anywhere.
   */
  describe('identity console ownership', () => {
    const syntheticIdentity = {
      artistIdentity: {
        linkedAccounts: [
          { platform: 'Spotify', status: 'stale' },
          { platform: 'YouTube', status: 'stale' },
          { platform: 'Instagram', status: 'needs_review' },
          { platform: 'TikTok', status: 'needs_review' },
          { platform: 'SoundCloud', status: 'stale' },
          { platform: 'Apple Music', status: 'stale' },
        ],
        works: [],
      },
    } as unknown as UserProfile;

    it('is not credited by synthesised connector rows', () => {
      const pane = service.coverageFor(syntheticIdentity)['identity-console'];

      expect(pane).toBeDefined();
      expect(pane.missing).toContain('official profile links recorded');
      expect(pane.missing).toContain('at least one link verified');
      expect(pane.score).toBeLessThan(100);
    });

    it('is credited by links the artist recorded themselves', () => {
      const withLinks = {
        ...syntheticIdentity,
        officialArtistProfiles: [
          {
            id: 'spotify-for-artists',
            destinationId: 'spotify-for-artists',
            url: 'https://artists.spotify.com/artist/nova',
            verified: true,
          },
          {
            id: 'ascap',
            destinationId: 'ascap',
            url: 'https://www.ascap.com/nova',
            verified: true,
          },
          {
            id: 'chartmetric',
            destinationId: 'chartmetric',
            url: 'https://chartmetric.com/artist/nova',
            verified: true,
          },
        ],
      } as unknown as UserProfile;

      const pane = service.coverageFor(withLinks)['identity-console'];
      expect(pane.missing).not.toContain('official profile links recorded');
      expect(pane.missing).not.toContain('at least one link verified');
      expect(pane.missing).not.toContain('three or more official links');
    });
  });
});
