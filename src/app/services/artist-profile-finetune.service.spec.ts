import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistProfileFinetuneService } from './artist-profile-finetune.service';
import { UserProfileService } from './user-profile.service';
import type { UserProfile } from './user-profile.service';

const strongProfile = {
  artistName: 'North Star',
  primaryGenre: 'Ambient',
  brandVoices: ['intimate', 'cinematic'],
  strategicGoals: ['sync placements'],
  profileSetupCompleted: true,
  proName: 'ASCAP',
  proIpi: '0011223344',
  skills: ['Producer'],
  equipment: ['Portable recorder', 'Condenser mic'],
  daw: ['Reaper'],
  services: ['Bandcamp', 'Stem delivery'],
  expertise: { production: 7, songwriting: 6, business: 3, legal: 2, performance: 4, marketing: 5 },
  pressGallery: ['press-01.png'],
  performancesPerYear: '18',
  careerGoals: ['score a feature film'],
  // A calibrated artist has an organised release record, not just uploads.
  catalog: [
    {
      id: 'w1',
      title: 'Window Light',
      isrc: 'US-AAA-25-00001',
      releaseDate: '2025-02-01',
      releaseType: 'Single',
      distributor: 'DistroKid',
      platforms: ['Spotify', 'Apple Music'],
      credits: 'Written, performed, and mixed by North Star',
      splitSheetRef: 'SPLIT-2025-01',
    },
    {
      id: 'w2',
      title: 'Train Platform',
      isrc: 'US-AAA-25-00002',
      releaseDate: '2025-05-01',
      releaseType: 'Single',
      distributor: 'DistroKid',
      platforms: ['Spotify'],
      credits: 'Written and performed by North Star',
      splitSheetRef: 'SPLIT-2025-02',
    },
    {
      id: 'w3',
      title: 'Room Tone',
      upc: '012345678905',
      releaseDate: '2025-08-01',
      releaseType: 'EP',
      distributor: 'DistroKid',
      platforms: ['Spotify', 'Bandcamp'],
      credits: 'Written and performed by North Star',
      splitSheetRef: 'SPLIT-2025-03',
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
      id: 'bmi',
      destinationId: 'bmi',
      url: 'https://www.bmi.com/northstar',
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
      verified: false,
    },
  ],
  marketingCampaigns: [{ id: 'campaign-1' }],
  team: [{ name: 'Rae', role: 'Mixer' }],
  financials: {
    accounts: [{ id: 'acc-1' }],
    monthlyBudget: 300,
    totalRevenue: 1200,
    pendingPayouts: 0,
    splitSheets: [],
    revenueHistory: [{ month: '2025-01', amount: 120 }],
  },
  artistIdentity: {
    linkedAccounts: [{ platform: 'Spotify' }],
    works: [{ title: 'Window Light' }],
    resolution: { confidenceScore: 0.82 },
    fingerprint: { genre: 'Ambient' },
  },
  genreSpecificData: { tempo: 72, key: 'D minor' },
  syncDetails: {
    isSyncReady: 'Actively Pitching',
    hasCleanVersions: true,
    hasInstrumentals: true,
    hasStems: 'Full Multitrack',
    oneStopClearance: true,
    catalogSize: 6,
    preferredKeywords: ['quiet focus', 'documentary'],
  },
  legalInfrastructure: {
    hasRegisteredWorks: true,
    proAffiliation: 'ASCAP',
    hasStandardSplitSheet: 'In Use',
    isIncorporated: true,
    trademarkStatus: 'Filed',
  },
  touringDetails: {
    travelPreference: 'Van',
    regions: ['Midwest'],
    isTourReady: 'Tour Ready',
    hasBackline: 'Yes',
  },
  musicalJourney: {
    artistNameMeaning: 'A promise to keep moving',
    originStory: 'Recorded field sounds while caring for family.',
    firstSong: 'Window Light',
    breakthroughMoment: 'A live audience sang the texture back.',
    subgenres: ['drone'],
    musicalInfluences: ['minimalism'],
    signatureSound: 'Tape hiss, bowed metal, close-mic breath',
    productionPhilosophy: 'Leave room for human imperfection',
    songwritingProcess: 'Collect a sound, then find its emotional center',
    preferredBpmRange: '60-80',
    signatureGear: ['portable recorder'],
    incomeStreams: ['sync', 'bandcamp'],
    releaseVelocity: 'quarterly',
    primarySuccessMetric: 'repeat listeners',
    currentFocus: 'finish the next EP',
    collaborationGoals: ['film composers'],
    biggestChallenge: 'over-polishing',
    visualAesthetic: ['monochrome'],
    contentStrategy: 'studio field notes',
    marketPosition: 'Artistic',
    educationalBackground: 'Conservatory dropout',
    roles: ['vocalist', 'producer'],
    musicBlueprint: {
      signatureTension: 'stillness versus motion',
      livedWorldDetails: 'kitchen light and train platforms',
      vocalDelivery: 'whispered',
      rhythmicFeel: 'breathing pulse',
      harmonicLanguage: 'open fifths',
      arrangementApproach: 'slow reveal',
      sonicNonNegotiables: 'keep the room tone',
      recordingPriorities: ['natural dynamics'],
      mixingPriorities: ['depth'],
      lyricalThemes: ['distance', 'care'],
      audienceProfile: 'listeners who need quiet focus',
      artisticIntent: 'make space for reflection',
      recognitionCue: 'the room tone before the first note',
    },
  },
} as unknown as UserProfile;

/**
 * The same artist once every pathway area is genuinely complete: a website, a
 * consistent handle across three accounts, and all the rest of the evidence.
 */
const officialProfile = {
  ...strongProfile,
  website: 'https://northstar.example',
  artistIdentity: {
    ...(strongProfile as any).artistIdentity,
    linkedAccounts: [
      { platform: 'Instagram' },
      { platform: 'TikTok' },
      { platform: 'YouTube' },
    ],
  },
} as unknown as UserProfile;

describe('ArtistProfileFinetuneService', () => {
  let service: ArtistProfileFinetuneService;
  let profileSignal: ReturnType<typeof signal<UserProfile>>;

  beforeEach(() => {
    profileSignal = signal<UserProfile>({ primaryGenre: 'Hip Hop' } as UserProfile);
    TestBed.configureTestingModule({
      providers: [
        ArtistProfileFinetuneService,
        {
          provide: UserProfileService,
          useValue: { profile: profileSignal },
        },
      ],
    });
    service = TestBed.inject(ArtistProfileFinetuneService);
  });

  it('reports foundational state with actionable missing signals when the profile is empty', () => {
    const knowledge = service.knowledge();

    expect(knowledge.state).toBe('foundational');
    expect(knowledge.completeness).toBeLessThan(60);
    expect(knowledge.missing).toContain('signature tension');
    expect(service.promptBlock()).toContain('incomplete');
    expect(service.directiveFor('producer').directive).toContain('foundational');
  });

  it('compiles a calibrated profile into role-specific adaptation', () => {
    profileSignal.set(strongProfile);
    const knowledge = service.knowledge();

    expect(knowledge.state).toBe('calibrated');
    expect(knowledge.completeness).toBe(100);
    expect(knowledge.differentiators).toContain('stillness versus motion');

    expect(service.directiveFor('producer').directive).toContain('keep the room tone');
    expect(service.directiveFor('songwriter').directive).toContain('kitchen light and train platforms');
    expect(service.directiveFor('promotion').directive).toContain('the room tone before the first note');
    expect(service.directiveFor('marketing').directive).toContain('sync, bandcamp');
    expect(service.directiveFor('legal').directive).toContain('sync, bandcamp');
    expect(service.directiveFor('ar').directive).toContain('Tape hiss, bowed metal, close-mic breath');
  });

  it('keeps every role inside the artist guardrails and away from imitation', () => {
    profileSignal.set(strongProfile);
    const legal = service.directiveFor('legal');
    const voice = service.voiceSpec();

    expect(legal.guardrails.join(' ')).toContain('licensed attorney');
    expect(legal.guardrails.join(' ')).toContain('Never invent biography');
    expect(voice.avoid.join(' ')).toContain('Impersonating');
    expect(voice.imagery.join(' ')).toContain('stillness versus motion');
  });

  it('surfaces profile-derived tips and prompt context', () => {
    profileSignal.set(strongProfile);
    const tips = service.tips();
    const block = service.promptBlock();

    expect(tips.length).toBeGreaterThan(0);
    expect(tips.join(' ')).toContain('keep the room tone');
    expect(block).toContain('ARTIST PROFILE FINE-TUNE');
    expect(block).toContain('LEGAL:');
    expect(block).toContain('SONGWRITER:');
  });

  describe('online presence awareness', () => {
    it('knows an established artist’s verified official footprint', () => {
      profileSignal.set(strongProfile);
      const knowledge = service.knowledge();
      const presence = knowledge.presence;

      expect(presence.hasFingerprint).toBe(true);
      expect(presence.coverage).toBeGreaterThan(0);
      expect(presence.verified).toContain('Spotify for Artists');
      expect(presence.verified).toContain('BMI');
      expect(presence.verified).toContain('Chartmetric');
      expect(presence.unverified).toContain('DistroKid');
      expect(presence.hasForArtists).toBe(true);
      expect(presence.hasPro).toBe(true);
      expect(presence.hasAnalytics).toBe(true);
      expect(presence.hasDelivery).toBe(true);
      expect(presence.catalogAverageCompleteness).toBe(100);
      expect(presence.undatedWorks).toBe(0);
      expect(presence.historyIssues).toEqual([]);
      expect(service.promptBlock()).toContain('ONLINE PRESENCE');
    });

    it('never tells a beginner to optimise dashboards they do not have', () => {
      profileSignal.set({
        artistName: 'First Take',
        primaryGenre: 'Hip Hop',
        catalog: [],
        officialArtistProfiles: [],
        artistIdentity: { linkedAccounts: [] },
      } as unknown as UserProfile);

      const knowledge = service.knowledge();
      const tips = service.tips();
      const block = service.promptBlock();

      expect(knowledge.presence.hasFingerprint).toBe(false);
      expect(knowledge.presence.track).toBe('emerging');
      expect(knowledge.presence.hasForArtists).toBe(false);
      expect(knowledge.presence.coverage).toBe(0);
      expect(knowledge.state).not.toBe('calibrated');
      expect(knowledge.missing).toContain(
        'official artist profiles (For Artists, PRO, analytics)'
      );
      expect(block).toContain('none yet');
      expect(tips.join(' ')).toMatch(/no official online fingerprint yet/i);
      expect(tips.join(' ')).not.toMatch(/claim the platform dashboards/i);
    });

    it('routes a beginner toward the plan instead of dashboards or analytics', () => {
      profileSignal.set({ artistName: 'First Take', primaryGenre: 'Hip Hop' } as UserProfile);

      const promotion = service.directiveFor('promotion');
      expect(promotion.tips.join(' ')).toContain(
        'Without a claimed For Artists dashboard there is no editorial pitch route'
      );

      const marketing = service.directiveFor('marketing');
      expect(marketing.tips.join(' ')).toContain('No analytics source is connected');

      const manager = service.directiveFor('manager');
      expect(manager.tips.join(' ')).toContain('No official footprint exists');
    });

    it('flags an unverified or undocumented presence for an artist already online', () => {
      profileSignal.set({
        artistName: 'Half Set Up',
        primaryGenre: 'Pop',
        catalog: [{ id: 'x', title: 'Untitled' }],
        officialArtistProfiles: [
          {
            id: 'spotify-for-artists',
            destinationId: 'spotify-for-artists',
            url: 'https://artists.spotify.com/x',
          },
        ],
      } as unknown as UserProfile);

      const knowledge = service.knowledge();
      const tips = service.tips().join(' ');

      expect(knowledge.presence.hasFingerprint).toBe(true);
      expect(knowledge.presence.verified).toEqual([]);
      expect(knowledge.presence.unverified).toContain('Spotify for Artists');
      expect(knowledge.presence.catalogAverageCompleteness).toBeLessThan(60);
      expect(knowledge.presence.undatedWorks).toBe(1);
      expect(tips).toMatch(/claim and verify/i);
      expect(tips).toMatch(/documented/i);
      expect(tips).toMatch(/no release date/i);
    });

    it('survives an empty or hostile profile without throwing', () => {
      expect(() => service.compileProfile(null)).not.toThrow();
      expect(() => service.compileProfile(undefined)).not.toThrow();
      expect(() =>
        service.compileProfile({ officialArtistProfiles: 'bad', catalog: 7 } as any)
      ).not.toThrow();
    });
  });

  describe('official pathway awareness', () => {
    it('tells S.M.U.V.E. the single next step and why it matters', () => {
      profileSignal.set({ primaryGenre: 'Hip Hop' } as UserProfile);

      const knowledge = service.knowledge();
      const pathway = knowledge.pathway;

      expect(pathway.stage).toBe('getting-started');
      expect(pathway.overall).toBe(0);
      expect(pathway.nextStep).toBe('Lock the official artist name');
      expect(pathway.nextStepWhy.length).toBeGreaterThan(0);
      expect(pathway.nextStepAction.length).toBeGreaterThan(0);
      expect(pathway.nextStepEvidence.length).toBeGreaterThan(0);
      expect(pathway.unofficialAreas.length).toBe(8);
      expect(pathway.officialAreas).toEqual([]);

      expect(service.promptBlock()).toContain('OFFICIAL PATHWAY');
      expect(service.promptBlock()).toContain('Lock the official artist name');
    });

    it('names real areas the artist is not yet official in', () => {
      profileSignal.set({ primaryGenre: 'Hip Hop' } as UserProfile);
      const pathway = service.knowledge().pathway;

      expect(pathway.unofficialAreas).toContain('Official Presence');
      expect(pathway.unofficialAreas).toContain('Rights & Ownership');
      expect(pathway.unofficialAreas).toContain('Money & Royalties');
    });

    it('advances the next step as the artist completes work', () => {
      profileSignal.set({ artistName: 'Nova' } as UserProfile);
      expect(service.knowledge().pathway.nextStep).not.toBe(
        'Lock the official artist name'
      );

      // Pull one link out of an otherwise official profile: the pathway should
      // surface that exact gap as the next step, with a real destination.
      profileSignal.set({
        ...strongProfile,
        website: 'https://northstar.example',
        artistIdentity: {
          ...(strongProfile as any).artistIdentity,
          linkedAccounts: [{}, {}, {}],
        },
        officialArtistProfiles: (strongProfile as any).officialArtistProfiles.filter(
          (link: any) => link.destinationId !== 'distrokid'
        ),
      } as unknown as UserProfile);
      const withGap = service.knowledge().pathway;
      expect(withGap.nextStep).toBe('Open the distributor dashboard');
      expect(withGap.nextStepDestination).toBe('DistroKid');
    });

    it('marks a fully official artist as complete with no next step', () => {
      profileSignal.set(officialProfile);
      const knowledge = service.knowledge();

      expect(knowledge.pathway.stage).toBe('official');
      expect(knowledge.pathway.overall).toBe(100);
      expect(knowledge.pathway.nextStep).toBe('');
      expect(knowledge.pathway.officialAreas.length).toBe(8);
      expect(knowledge.pathway.unofficialAreas).toEqual([]);
      expect(knowledge.pathway.parallel).toEqual([]);
      expect(service.promptBlock()).toContain('every area is official');
    });

    it('leads the tip queue with the pathway step instead of a competing priority', () => {
      profileSignal.set({ primaryGenre: 'Hip Hop' } as UserProfile);
      const next = service.knowledge().pathway.nextStep;
      const tips = service.tips();

      expect(next).toBe('Lock the official artist name');
      expect(tips[0]).toContain(next);
      expect(tips[0]).toContain('0% complete');

      // A complete pathway stops competing with itself for priority.
      profileSignal.set(officialProfile);
      expect(service.tips().join(' ')).not.toContain('next step:');
    });

    it('forbids roles from proposing priorities that conflict with the pathway', () => {
      profileSignal.set({ primaryGenre: 'Hip Hop' } as UserProfile);
      const manager = service.directiveFor('manager');
      expect(manager.guardrails.join(' ')).toContain('Lock the official artist name');

      profileSignal.set(officialProfile);
      const complete = service.directiveFor('manager');
      expect(complete.guardrails.join(' ')).toContain('pathway is complete');
    });
  });
});
