import { TestBed } from '@angular/core/testing';
import { AiService, UpgradeRecommendation } from '../ai.service';
import { UserProfileService } from '../user-profile.service';
import { UserContextService } from '../user-context.service';
import { AnalyticsService } from '../analytics.service';
import { LoggingService } from '../logging.service';
import { MusicManagerService } from '../music-manager.service';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

describe('AiService', () => {
  let service: AiService;
  let userProfileServiceMock: Partial<UserProfileService>;
  let userContextServiceMock: Partial<UserContextService>;
  let analyticsServiceMock: Partial<AnalyticsService>;
  let loggingServiceMock: Partial<LoggingService>;
  let httpMock: HttpTestingController;

  const mockUpgrade: UpgradeRecommendation = {
    id: 'test-upgrade',
    title: 'Test Upgrade',
    type: 'Software',
    description: 'A test upgrade',
    cost: '100',
    impact: 'High',
    rationale: 'Because of testing',
    targetArea: 'Production',
    priority: 'High',
    prerequisites: [],
    actionLabel: 'Unlock',
    toolId: 'test-tool',
    outcomeMetric: { label: 'Test Metric', value: '10%' },
    state: 'locked',
    rankScore: 100,
  };

  beforeEach(() => {
    userProfileServiceMock = {
      profile: signal({
        catalog: [],
        equipment: [],
        daw: [],
        services: [],
        marketingCampaigns: [],
        recommendationPreferences: {},
        recommendationHistory: [],
        artistName: 'Test Artist',
        primaryGenre: 'Electronic',
        profileSetupCompleted: true,
        settings: {
          ai: {
            aiConversationalTier: 'Elite',
            aiMimicEnabled: false,
            aiProfanityEnabled: false,
          },
        },
        tasks: [],
        skills: [],
        expertiseLevels: {
          production: 5,
          marketing: 5,
          mastering: 5,
          audioEngineering: 5,
        },
      }),
    };

    userContextServiceMock = {
      mainViewMode: signal('hub'),
    };

    analyticsServiceMock = {
      getActiveLoopBars: jest.fn().mockReturnValue(0),
    };

    loggingServiceMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UserProfileService, useValue: userProfileServiceMock },
        { provide: UserContextService, useValue: userContextServiceMock },
        { provide: AnalyticsService, useValue: analyticsServiceMock },
        { provide: LoggingService, useValue: loggingServiceMock },
        {
          provide: MusicManagerService,
          useValue: {
            tracks: signal([]),
            engine: { tempo: signal(120) },
          },
        },
      ],
    });

    service = TestBed.inject(AiService);
    httpMock = TestBed.inject(HttpTestingController);
    jest
      .spyOn(service as any, 'getUpgradeRecommendations')
      .mockReturnValue([mockUpgrade]);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should unlock an upgrade', (done) => {
    expect(service.isUnlocked('test-upgrade')).toBe(false);
    service.unlockUpgrade('test-upgrade');
    expect(service.isProcessing()).toBe(true);
    setTimeout(() => {
      expect(service.isUnlocked('test-upgrade')).toBe(true);
      expect(service.isProcessing()).toBe(false);
      done();
    }, 1600);
  });

  it('should not try to unlock an already unlocked upgrade', () => {
    service.unlockedUpgrades.set(['test-upgrade']);
    service.unlockUpgrade('test-upgrade');
    expect(loggingServiceMock.info).toHaveBeenCalledWith(
      'Upgrade test-upgrade is already unlocked.'
    );
  });

  const calibratedProfile = {
      artistName: 'Nova Vale',
      primaryGenre: 'Electronic',
      location: 'Atlanta',
      website: 'https://novavale.example',
      avatarImage: 'data:image/png;base64,abc',
      profileSetupCompleted: true,
      brandVoices: ['nocturnal', 'cinematic'],
      strategicGoals: ['grow sync placements'],
      careerGoals: ['score a documentary'],
      proName: 'BMI',
      proIpi: '0099887766',
      skills: ['Producer'],
      equipment: ['Analog synth', 'Condenser mic'],
      daw: ['Ableton Live'],
      services: ['DistroKid'],
      expertise: { production: 7, songwriting: 5, marketing: 4, business: 2, legal: 1, performance: 3 },
      pressGallery: ['press-01.png'],
      performancesPerYear: '24',
      catalog: [
        {
          id: 'n1',
          title: 'Night Drive',
          isrc: 'US-BBB-25-00001',
          releaseDate: '2025-03-01',
          releaseType: 'Single',
          distributor: 'DistroKid',
          platforms: ['Spotify'],
          credits: 'Written and produced by Nova Vale',
          splitSheetRef: 'SPLIT-2025-01',
        },
        {
          id: 'n2',
          title: 'Tape Stop',
          isrc: 'US-BBB-25-00002',
          releaseDate: '2025-06-01',
          releaseType: 'Single',
          distributor: 'DistroKid',
          platforms: ['Spotify'],
          credits: 'Written and produced by Nova Vale',
          splitSheetRef: 'SPLIT-2025-02',
        },
        {
          id: 'n3',
          title: 'Commuter',
          upc: '012345678912',
          releaseDate: '2025-09-01',
          releaseType: 'EP',
          distributor: 'DistroKid',
          platforms: ['Spotify'],
          credits: 'Written and produced by Nova Vale',
          splitSheetRef: 'SPLIT-2025-03',
        },
      ],
      officialArtistProfiles: [
        {
          id: 'spotify-for-artists',
          destinationId: 'spotify-for-artists',
          url: 'https://artists.spotify.com/novavale',
          verified: true,
        },
        {
          id: 'bmi',
          destinationId: 'bmi',
          url: 'https://www.bmi.com/novavale',
          verified: true,
        },
        {
          id: 'chartmetric',
          destinationId: 'chartmetric',
          url: 'https://chartmetric.com/artist/novavale',
          verified: true,
        },
      ],
      team: [{ name: 'Rae', role: 'Manager' }],
      financials: {
        accounts: [{ id: 'acc-1' }],
        monthlyBudget: 250,
        totalRevenue: 900,
        pendingPayouts: 0,
        splitSheets: [],
        revenueHistory: [{ month: '2025-01', amount: 90 }],
      },
      artistIdentity: {
        linkedAccounts: [{ platform: 'Spotify' }],
        works: [{ title: 'Night Drive' }],
        resolution: { confidenceScore: 0.9 },
        fingerprint: { genre: 'Electronic' },
      },
      genreSpecificData: { tempo: 112 },
      syncDetails: {
        isSyncReady: 'Ready',
        hasCleanVersions: true,
        hasInstrumentals: true,
        hasStems: 'Full Multitrack',
        oneStopClearance: true,
        catalogSize: 4,
        preferredKeywords: ['night drive'],
      },
      legalInfrastructure: {
        hasRegisteredWorks: true,
        proAffiliation: 'BMI',
        hasStandardSplitSheet: 'In Use',
        isIncorporated: true,
        trademarkStatus: 'Filed',
      },
      touringDetails: {
        travelPreference: 'Van',
        regions: ['Southeast'],
        isTourReady: 'Tour Ready',
        hasBackline: 'Yes',
      },
      musicalJourney: {
        originStory: 'Built the first tracks on a night-shift bus route.',
        subgenres: ['synthwave'],
        musicalInfluences: ['tape ambience'],
        signatureSound: 'warped tape bass and glassy synths',
        productionPhilosophy: 'Keep the imperfection, lose the mud',
        songwritingProcess: 'Start from a drum machine loop, then write the vocal last',
        preferredBpmRange: '104-118',
        currentFocus: 'finish the night-drive EP',
        biggestChallenge: 'inconsistent release cadence',
        primarySuccessMetric: 'repeat listeners',
        releaseVelocity: 'monthly',
        incomeStreams: ['Streaming', 'Sync Licensing'],
        visualAesthetic: ['neon monochrome'],
        contentStrategy: 'behind-the-console clips',
        marketPosition: 'Artistic',
        educationalBackground: 'Self-Taught',
        musicBlueprint: {
          artisticIntent: 'make late-night listeners feel brave',
          audienceProfile: 'commuters rebuilding after a hard day',
          mixingPriorities: ['Wide immersive space'],
          recordingPriorities: ['clean transients'],
          vocalDelivery: 'close, half-spoken',
          rhythmicFeel: 'driving sixteenths',
          harmonicLanguage: 'minor ninths',
          arrangementApproach: 'slow build into a hard drop',
          lyricalThemes: ['night shifts', 'starting over'],
          signatureTension: 'tenderness inside machine music',
          livedWorldDetails: 'bus windows and gas-station coffee',
          sonicNonNegotiables: 'never lose the tape hiss',
          recognitionCue: 'the tape-stop before the chorus',
        },
      },
  };

  it('builds role-specific operating guidance from the completed artist profile', () => {
    (userProfileServiceMock.profile as any).set(calibratedProfile);

    const brief = service.getArtistOperatingBrief();
    expect(brief.profileState).toBe('calibrated');
    expect(brief.producer).toContain('warped tape bass');
    expect(brief.manager).toContain('finish the night-drive EP');
    expect(brief.aAndR).toContain('make late-night listeners feel brave');
    expect(brief.promotion).toContain('artist’s own world');
    expect(brief.marketing).toContain('Streaming, Sync Licensing');
    expect(brief.guardrails).toContain('Never invent biography, audience data, achievements, or credits.');
  });

  it('should adapt songwriting, legal, brand, and voice to the completed profile', () => {
    (userProfileServiceMock.profile as any).set(calibratedProfile);
    const brief = service.getArtistOperatingBrief();

    expect(brief.songwriter).toContain('bus windows and gas-station coffee');
    expect(brief.legal).toContain('Streaming, Sync Licensing');
    expect(brief.legal).toContain('never lose the tape hiss');
    expect(brief.brand).toContain('neon monochrome');
    expect(brief.voice).toContain('Keep the imperfection, lose the mud');
    expect(brief.tips.join(' ')).toContain('never lose the tape hiss');
    expect(brief.completeness).toBe(100);
    expect(brief.missingSignals).toEqual([]);
  });

  it('should expose profile knowledge and per-role directives without a model call', () => {
    (userProfileServiceMock.profile as any).set(calibratedProfile);
    const knowledge = service.getArtistProfileKnowledge();
    expect(knowledge.state).toBe('calibrated');
    expect(knowledge.differentiators.length).toBeGreaterThan(0);

    const producer = service.getArtistDirective('producer');
    const marketing = service.getArtistDirective('marketing');
    const legal = service.getArtistDirective('legal');
    expect(producer.directive).toContain('warped tape bass');
    expect(marketing.directive).toContain('Streaming, Sync Licensing');
    expect(marketing.guardrails.length).toBeGreaterThan(0);
    expect(legal.tips.join(' ')).toContain('licensed attorney');
    expect(service.getProfileTips().length).toBeGreaterThan(0);
  });

  it('should embed the artist fine-tune block in the S.M.U.V.E. persona prompt', () => {
    (userProfileServiceMock.profile as any).set(calibratedProfile);
    const prompt = service.personaSystemPrompt;
    expect(prompt).toContain('ARTIST PROFILE FINE-TUNE');
    expect(prompt).toContain('SONGWRITER:');
    expect(prompt).toContain('LEGAL:');
  });

  it('should get an AI response using the AIAgent', async () => {
    const requestPromise = service.getAIResponse(
      'Provide a detailed analysis of the Test Upgrade upgrade.'
    );

    const req = httpMock.expectOne('http://localhost:4000/api/ai/analyze');
    req.flush({ text: 'The **Test Upgrade** is a **High**-impact upgrade' });

    const response = await requestPromise;
    expect(service.isProcessing()).toBe(false);
    expect(response).toContain(
      'The **Test Upgrade** is a **High**-impact upgrade'
    );
  });

  it('should request concept art through the authenticated backend proxy', async () => {
    const requestPromise = service.generateImage('night-drive performance frame');

    const req = httpMock.expectOne('http://localhost:4000/api/ai/concept-art');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ prompt: 'night-drive performance frame' });
    req.flush({ type: 'image', url: 'https://cdn.example.test/frame.png' });

    await expect(requestPromise).resolves.toBe('https://cdn.example.test/frame.png');
  });

  it('rejects concept-art responses without an image URL', async () => {
    const requestPromise = service.generateImage('empty frame');

    const req = httpMock.expectOne('http://localhost:4000/api/ai/concept-art');
    req.flush({ type: 'image' });

    await expect(requestPromise).rejects.toThrow('returned no concept frame');
  });

  it('surfaces the backend concept-art configuration message', async () => {
    const requestPromise = service.generateImage('missing provider');

    const req = httpMock.expectOne('http://localhost:4000/api/ai/concept-art');
    req.flush(
      { error: 'AI image generation is not configured. Add FAL_KEY in the environment.' },
      { status: 503, statusText: 'Service Unavailable' }
    );

    await expect(requestPromise).rejects.toThrow('Add FAL_KEY in the environment');
  });

  it('should handle getAIResponse when backend fails', async () => {
    const requestPromise = service.getAIResponse('Analyze this');
    const req = httpMock.expectOne('http://localhost:4000/api/ai/analyze');
    req.error(new ErrorEvent('Network error'));

    const response = await requestPromise;
    expect(response).toBe(
      'Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.'
    );
  });

  it('caps mimicry buffer to configured maximum size', () => {
    (service as any).updateMimicry(
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november'
    );
    expect((service as any).mimicryBuffer.length).toBeLessThanOrEqual(10);
  });

  it('resets processing state even when processCommand throws', async () => {
    jest.spyOn(service as any, 'updateMimicry').mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(service.processCommand('test command')).rejects.toThrow(
      'boom'
    );
    expect(service.isProcessing()).toBe(false);
  });

  it('handles missing nested AI settings defensively in processCommand', async () => {
    (userProfileServiceMock.profile as any).set({
      profileSetupCompleted: true,
      settings: {},
    });
    const response = await service.processCommand('analyze this command');
    expect(response).toContain('analyze this command');
  });
});
