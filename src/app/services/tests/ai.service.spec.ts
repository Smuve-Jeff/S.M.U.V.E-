import { TestBed } from '@angular/core/testing';
import { AiService, UpgradeRecommendation } from '../ai.service';
import { ArtistProfileFinetuneService } from '../artist-profile-finetune.service';
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
          security: { shareProfileAnswersWithAi: true },
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

  it('reflects persisted recommendation decisions in the available cards', () => {
    const profile = userProfileServiceMock.profile!();
    userProfileServiceMock.profile!.set({
      ...profile,
      recommendationPreferences: {
        'upg-ovr-mastering': { state: 'acquired', updatedAt: 1 },
        'upg-legal-executioner': { state: 'not-relevant', updatedAt: 2 },
      },
    });
    expect(service.availableUpgrades().find((rec) => rec.id === 'upg-ovr-mastering')?.state).toBe('acquired');
    expect(service.availableUpgrades().find((rec) => rec.id === 'upg-legal-executioner')?.state).toBe('not-relevant');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('exposes a stable system-status signal for status consumers', () => {
    expect(service.systemStatus()).toEqual(
      expect.objectContaining({
        cpuLoad: expect.any(Number),
        neuralSync: expect.any(Number),
        memoryUsage: expect.any(Number),
        latency: expect.any(Number),
      }),
    );
  });

  it('maps upgrade cards to uniquely keyed strategic operations', () => {
    const recommendations = service.getStrategicRecommendations();

    expect(recommendations).toEqual([
      expect.objectContaining({
        id: 'operation-test-upgrade',
        action: 'Test Upgrade',
        impact: 'High',
        toolId: 'test-tool',
      }),
    ]);
    expect(new Set(recommendations.map(({ id }) => id)).size).toBe(
      recommendations.length,
    );
  });

  it('stores bounded, uniquely identified industry research results', async () => {
    jest
      .spyOn(service, 'getAIResponse')
      .mockResolvedValue('Concise verified industry brief.');

    await service.industryDeepSearch('  streaming discovery trends  ');

    expect(service.industryIntelligence()).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^industry-/),
        query: 'streaming discovery trends',
        intel: 'Concise verified industry brief.',
        timestamp: expect.any(Number),
      }),
    ]);
    expect(service.systemStatus().activeProcesses).toBe(0);
  });

  it('rejects the severed-link sentinel instead of caching it as research intel', async () => {
    jest
      .spyOn(service, 'getAIResponse')
      .mockResolvedValue(
        'Strategic Link Severed. Offline processing active. FIX YOUR ******* CONNECTION.',
      );

    await expect(
      service.industryDeepSearch('playlist pitching strategy'),
    ).rejects.toThrow(/offline/i);

    expect(service.industryIntelligence()).toEqual([]);
    expect(service.systemStatus().activeProcesses).toBe(0);
  });

  it('rejects an empty research brief', async () => {
    jest.spyOn(service, 'getAIResponse').mockResolvedValue('   ');

    await expect(service.industryDeepSearch('label economics')).rejects.toThrow(
      /empty/i,
    );
    expect(service.industryIntelligence()).toEqual([]);
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
      settings: { security: { shareProfileAnswersWithAi: true } },
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

  it('does not call a completed-but-sparse profile calibrated', () => {
    const sparse = {
      ...calibratedProfile,
      profileSetupCompleted: true,
      musicalJourney: {
        ...calibratedProfile.musicalJourney,
        signatureSound: '',
        musicBlueprint: {},
      },
      primaryGenre: '',
      strategicGoals: [],
      catalog: [],
      officialArtistProfiles: [],
    } as any;
    (userProfileServiceMock.profile as any).set(sparse);

    const brief = service.getArtistOperatingBrief();

    expect(brief.profileState).toBe('incomplete');
    expect(brief.completeness).toBeLessThan(100);
    expect(brief.missingSignals.length).toBeGreaterThan(0);
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
    (userProfileServiceMock.profile as any).set({ ...calibratedProfile, settings: { security: { shareProfileAnswersWithAi: true, hideSensitiveProfileDetails: false } } });
    const prompt = service.personaSystemPrompt;
    expect(prompt).toContain('ARTIST PROFILE FINE-TUNE');
    expect(prompt).toContain('SONGWRITER:');
    expect(prompt).toContain('LEGAL:');
  });

  it('keeps the ominous persona contract while gating profile answers', () => {
    (userProfileServiceMock.profile as any).set(calibratedProfile);
    const prompt = service.personaSystemPrompt;

    expect(prompt).toContain('ARTIST-SPECIFIC INTEL');
    expect(prompt).toContain('Artist name: Nova Vale');
    expect(prompt).toContain('COMPLETE ARTIST CONTEXT — CALIBRATED');
    // The character contract is untouched by the privacy gate.
    expect(prompt).toContain('Current Persona:');
    expect(prompt).toContain("GOD's signature");
  });

  it('withholds profile answers from the persona prompt when the artist opted out', () => {
    const profile = (userProfileServiceMock.profile as any)();
    (userProfileServiceMock.profile as any).set({
      ...profile,
      settings: {
        ...profile.settings,
        security: { shareProfileAnswersWithAi: false },
      },
    });

    const prompt = service.personaSystemPrompt;

    expect(prompt).toContain('ARTIST PROFILE CONTEXT — PRIVATE');
    expect(prompt).toContain(
      'Artist profile answers are private (artist setting)'
    );
    expect(prompt).toContain('withheld — the artist has not shared profile answers with AI');
    // The answers themselves must not reach the model while they are promised
    // to be withheld 30 lines below.
    expect(prompt).not.toContain('Artist name: Test Artist');
    expect(prompt).not.toContain('Artist DNA: Test Artist, Genre');
    expect(prompt).not.toContain('Content strategy:');
    // …and the fine-tune block still states the privacy rule to the model.
    expect(prompt).toContain('opted out of sharing profile answers');
    // Persona contract survives untouched.
    expect(prompt).toContain('Current Persona:');
    expect(prompt).toContain('CAPABILITIES');
  });

  it('does not include private operating-brief or synthesis answers in the persona prompt', () => {
    (userProfileServiceMock.profile as any).set({
      ...calibratedProfile,
      settings: { security: { shareProfileAnswersWithAi: false } },
      musicalJourney: {
        ...calibratedProfile.musicalJourney,
        personaSynthesis: { archetype: 'PRIVATE ARCHETYPE', sonicSignature: 'PRIVATE SIGNATURE' },
      },
    });

    const prompt = service.personaSystemPrompt;
    for (const secret of ['Nova Vale', 'warped tape bass', 'finish the night-drive EP', 'PRIVATE ARCHETYPE', 'PRIVATE SIGNATURE']) {
      expect(prompt).not.toContain(secret);
    }
    expect(prompt).toContain('ARTIST PROFILE CONTEXT — PRIVATE');
  });

  it('withholds sensitive profile data from the model when sharing is enabled but details are hidden', () => {
    (userProfileServiceMock.profile as any).set({
      ...calibratedProfile,
      settings: { security: { shareProfileAnswersWithAi: true, hideSensitiveProfileDetails: true } },
      musicalJourney: {
        ...calibratedProfile.musicalJourney,
        personaSynthesis: { archetype: 'PRIVATE ARCHETYPE', sonicSignature: 'PRIVATE SIGNATURE' },
      },
    });

    const prompt = service.personaSystemPrompt;
    for (const secret of ['finish the night-drive EP', 'bus windows and gas-station coffee', 'never lose the tape hiss', 'PRIVATE ARCHETYPE', 'PRIVATE SIGNATURE']) {
      expect(prompt).not.toContain(secret);
    }
    expect(prompt).toContain('ARTIST LIFECYCLE — withheld');
  });

  it('should get an AI response using the AIAgent', async () => {
    const requestPromise = service.getAIResponse(
      'Provide a detailed analysis of the Test Upgrade upgrade.'
    );

    const req = httpMock.expectOne('http://localhost:4000/api/ai/analyze');
    expect(req.request.body.prompt).toContain('PERSONA — S.M.U.V.E. Prime');
    expect(req.request.body.prompt).toContain('EGO MANDATES');
    expect(req.request.body.prompt).toContain(
      'Provide a detailed analysis of the Test Upgrade upgrade.'
    );
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
      'Strategic Link Severed. Offline processing active. FIX YOUR ******* CONNECTION.'
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

  describe('persona directives', () => {
    const setAi = (ai: Record<string, unknown>) => {
      const current = (userProfileServiceMock.profile as any)();
      (userProfileServiceMock.profile as any).set({
        ...current,
        settings: {
          ...current.settings,
          ai: { ...current.settings.ai, ...ai },
        },
      });
    };

    it('defaults to the S.M.U.V.E. Prime character when nothing is configured', () => {
      const directives = service.personaDirectives();

      expect(directives).toContain('PERSONA — S.M.U.V.E. Prime');
      expect(directives).toContain('DEFAULT');
      expect(directives).toContain('EGO MANDATES');
      expect(directives).toContain('SADISTIC EDGE');
      expect(service.isOminousPersonaActive()).toBe(true);
    });

    it('treats the pre-rename and unknown persona ids as the default rather than a generic assistant', () => {
      setAi({ commanderPersona: 'Ominous Dominator' });
      expect(service.personaDirectives()).toContain('EGO MANDATES');

      // Profiles saved while the character was called 'Ominous Musical GOD'
      // must keep resolving to the signature persona.
      setAi({ commanderPersona: 'Ominous Musical GOD' });
      expect(service.personaDirectives()).toContain(
        'PERSONA — S.M.U.V.E. Prime'
      );

      setAi({ commanderPersona: 'Something Nobody Configured' });
      expect(service.personaDirectives()).toContain('S.M.U.V.E. Prime');
      expect(service.personaDirectives()).toContain('EGO MANDATES');
    });

    it('honors an explicit artist persona choice and drops the default mandates', () => {
      setAi({ commanderPersona: 'Encouraging Mentor' });

      const directives = service.personaDirectives();

      expect(directives).toContain('PERSONA — Supportive');
      expect(directives).toContain('artist-selected');
      expect(directives).not.toContain('EGO MANDATES');
      expect(service.isOminousPersonaActive()).toBe(false);
    });

    it('applies an explicit persona to generic AI requests without replacing it', async () => {
      setAi({ commanderPersona: 'Supportive' });
      const requestPromise = service.getAIResponse('Explain this arrangement.');
      const req = httpMock.expectOne('http://localhost:4000/api/ai/analyze');

      expect(req.request.body.prompt).toContain('PERSONA — Supportive');
      expect(req.request.body.prompt).toContain('Explain this arrangement.');
      expect(req.request.body.prompt).not.toContain('EGO MANDATES');
      req.flush({ text: 'Start with the chorus.' });

      await expect(requestPromise).resolves.toBe('Start with the chorus.');
    });

    it('does not duplicate the persona contract when a surface already supplied it', async () => {
      const directives = service.personaDirectives();
      const requestPromise = service.getAIResponse(
        `${directives}\n\nAnalyze the mix.`
      );
      const req = httpMock.expectOne('http://localhost:4000/api/ai/analyze');

      expect(req.request.body.prompt.match(/PERSONA — /g)).toHaveLength(1);
      req.flush({ text: 'Cut the low-mid buildup.' });

      await expect(requestPromise).resolves.toBe('Cut the low-mid buildup.');
    });

    it('unlocks profanity only when the artist enables explicit language', () => {
      setAi({ aiProfanityEnabled: true });
      expect(service.personaDirectives()).toContain('LANGUAGE — UNLOCKED');

      setAi({ aiProfanityEnabled: false });
      const locked = service.personaDirectives();
      expect(locked).toContain('LANGUAGE — LOCKED');
      // The character survives the language preference.
      expect(locked).toContain('SADISTIC EDGE');
      // An explicit artist choice is the ONLY thing that censors anything.
      expect(service.sanitizePersonaText('Shut the fuck up.')).not.toContain(
        'fuck'
      );
    });

    it('keeps explicit language when the profile never answered the question', () => {
      // An imported or pre-existing profile can arrive without the key. The
      // default is unlocked, so the character must NOT come back sanitized —
      // deciding this with `=== true` did exactly that, in the reply text, the
      // roast lines and the prompt itself.
      const current = userProfileServiceMock.profile();
      const ai = { ...current.settings.ai } as Record<string, unknown>;
      delete ai['aiProfanityEnabled'];
      userProfileServiceMock.profile.set({
        ...current,
        settings: { ...current.settings, ai: ai as any },
      });

      expect(service.personaDirectives()).toContain('LANGUAGE — UNLOCKED');
      expect(service.sanitizePersonaText('This mix is shit.')).toBe(
        'This mix is shit.'
      );
    });

    it('leaves the offline roast lines uncensored when the language is unlocked', async () => {
      setAi({ aiProfanityEnabled: true });

      const roast = await service.processCommand('open the mixer');

      expect(roast).not.toContain('*');
    });

    it('reports maximum intensity only when the artist enables it', () => {
      setAi({ aiPersonaIntensityEnabled: true });
      expect(service.personaDirectives()).toContain('INTENSITY — MAXIMUM');

      setAi({ aiPersonaIntensityEnabled: false });
      expect(service.personaDirectives()).not.toContain('INTENSITY — MAXIMUM');
    });

    it('grants command authority only when the artist enables full control', () => {
      setAi({ aiTotalControlEnabled: true });
      const granted = service.personaDirectives();
      expect(granted).toContain('FULL CONTROL GRANTED');
      expect(granted).toContain('confirm before anything irreversible');

      setAi({ aiTotalControlEnabled: false });
      expect(service.personaDirectives()).toContain('ADVISORY');
    });

    it('embeds the character contract in the model prompt', () => {
      setAi({ aiProfanityEnabled: true });

      const prompt = service.personaSystemPrompt;

      expect(prompt).toContain('SADISTIC EDGE');
      expect(prompt).toContain('Current Persona: S.M.U.V.E. Prime');
      expect(prompt).toContain('LANGUAGE — UNLOCKED');
    });

    it('answers offline commands in the selected mode instead of the signature roasts', async () => {
      setAi({ commanderPersona: 'Supportive' });

      const response = await service.processCommand('bounce my hook');

      expect(response).toContain('bounce my hook');
      // No unsubstituted persona placeholders, and none of the arrogance that
      // belongs to the signature character.
      expect(response).not.toMatch(/\{request\}|\{artist\}|\{subject\}/);
      expect(response).not.toMatch(/pathetic|contempt|mediocrity/i);
    });

    it('keeps every offline reply free of unsubstituted persona placeholders', async () => {
      for (const persona of ['S.M.U.V.E. Prime', 'Elite', 'Balanced', 'Supportive']) {
        setAi({ commanderPersona: persona });

        expect(await service.processCommand('status')).not.toMatch(/\{/);
        expect(service.getMasteringRoast()).not.toMatch(/\{/);
      }
    });

    it('reports mastering in the selected mode', () => {
      setAi({ commanderPersona: 'Balanced' });
      expect(service.getMasteringRoast()).toContain('The mastering chain');

      setAi({ commanderPersona: 'Supportive' });
      expect(service.getMasteringRoast()).toContain('The mastering chain');
    });

    it('announces a severed link in the selected mode', async () => {
      setAi({ commanderPersona: 'Elite' });
      const eliteRequest = service.getAIResponse('status report');
      httpMock
        .expectOne('http://localhost:4000/api/ai/analyze')
        .error(new ErrorEvent('Network error'));
      await expect(eliteRequest).resolves.toBe(
        'Strategic link severed. Offline analysis continues on cached evidence.'
      );

      setAi({ commanderPersona: 'S.M.U.V.E. Prime' });
      const signatureRequest = service.getAIResponse('status report');
      httpMock
        .expectOne('http://localhost:4000/api/ai/analyze')
        .error(new ErrorEvent('Network error'));
      await expect(signatureRequest).resolves.toContain(
        'Strategic Link Severed'
      );
    });
  });

  describe('strategic intelligence briefs', () => {
    it('populates the brief signal that three panels render', () => {
      // The signal shipped permanently empty: consumers existed, writers did not.
      expect(service.intelligenceBriefs()).toEqual([]);

      const briefs = service.refreshIntelligenceBriefs();

      expect(briefs.length).toBeGreaterThan(0);
      expect(service.intelligenceBriefs()).toEqual(briefs);
      for (const brief of briefs) {
        expect(typeof brief.title).toBe('string');
        expect(brief.title.length).toBeGreaterThan(0);
        expect(typeof brief.content).toBe('string');
        // Fields rendered by the Strategy Hub and Command Center consumers.
        expect(typeof brief.category).toBe('string');
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(brief.impact);
      }
    });

    it('names the strongest and weakest vectors from the audit', () => {
      const report = service.performExecutiveAudit();
      const briefs = service.intelligenceBriefs();
      // The briefs rank all four vectors the audit reports.
      const dimensions = [
        { key: 'Sonic Cohesion', score: report.sonicCohesion },
        { key: 'Arrangement Depth', score: report.arrangementDepth },
        { key: 'Market Viability', score: report.marketViability },
        { key: 'Technical Authority', score: report.technicalAuthority! },
      ];
      const maxScore = Math.max(...dimensions.map((d) => d.score));
      const minScore = Math.min(...dimensions.map((d) => d.score));
      // Ties are legitimate, so match any dimension holding the extreme score.
      const keysAt = (score: number) =>
        dimensions.filter((d) => d.score === score).map((d) => d.key);

      const strengthTitle = briefs.find((b) => b.id === 'brief-strength').title;
      const gapTitle = briefs.find((b) => b.id === 'brief-gap').title;

      expect(keysAt(maxScore).some((k) => strengthTitle.includes(k))).toBe(true);
      expect(keysAt(minScore).some((k) => gapTitle.includes(k))).toBe(true);
      expect(strengthTitle).toContain(`${maxScore}%`);
      expect(gapTitle).toContain(`${minScore}%`);
    });

    it('reports an empty catalogue as the highest-priority deficit', () => {
      const report = service.performExecutiveAudit();
      expect(report.criticalDeficits).toContain(
        'The catalogue is empty — no release history to analyse.'
      );
      const deficitBrief = service
        .intelligenceBriefs()
        .find((b) => b.id === 'brief-next-action');
      expect(deficitBrief.content).toBe(report.criticalDeficits[0]);
      expect(deficitBrief.impact).toBe('HIGH');
    });
  });
  it('keeps concurrent processing active until all requests complete', async () => {
    const first = service.getAIResponse('first');
    const second = service.getAIResponse('second');
    const requests = httpMock.match('http://localhost:4000/api/ai/analyze');
    requests[0].flush({ text: 'First result' });
    await first;
    expect(service.isProcessing()).toBe(true);
    requests[1].flush({ text: 'Second result' });
    await second;
    expect(service.isProcessing()).toBe(false);
    expect(service.connectionState()).toBe('live');
  });

  it('times out a stalled request and reports the offline state', async () => {
    jest.useFakeTimers();
    try {
      const pending = service.getAIResponse('stalled request');
      const request = httpMock.expectOne('http://localhost:4000/api/ai/analyze');
      await jest.advanceTimersByTimeAsync(30_001);
      expect(await pending).toContain('Strategic Link Severed');
      expect(request.cancelled).toBe(true);
      expect(service.connectionState()).toBe('offline');
      expect(service.isProcessing()).toBe(false);
    } finally { jest.useRealTimers(); }
  });

  it('fits profile/history context into the server limit while retaining the latest request', async () => {
    const pending = service.getAIResponse(`${'context '.repeat(3000)}ARTIST REQUEST: Keep MY room tone.`);
    const request = httpMock.expectOne('http://localhost:4000/api/ai/analyze');
    expect(request.request.body.prompt.length).toBeLessThanOrEqual(8000);
    expect(request.request.body.prompt).toContain('Keep MY room tone.');
    expect(request.request.body.prompt).toContain('MUSIC MANAGER OPERATING STANDARD');
    expect(request.request.body.prompt).toContain('ARTIST DATA');
    request.flush({ text: 'Answer' });
    await pending;
  });

  it('keeps the whole artist fine-tune block even on the longest request', async () => {
    // The prefix budget used to be handed to the shared operating standards
    // first, so the longest requests (which need the most adaptation) kept the
    // smallest slice of the artist's own calibration.
    const finetune = TestBed.inject(ArtistProfileFinetuneService);
    const tail = 'TIP QUEUE: the first move for this artist.';
    jest
      .spyOn(finetune, 'promptBlock')
      .mockReturnValue(
        `ARTIST PROFILE FINE-TUNE (calibrated, 100% evidence) — adapt every answer to this artist: ${'calibration detail '.repeat(90)} ${tail}`
      );

    const pending = service.getAIResponse(
      `ARTIST REQUEST: ${'detail '.repeat(400)}`
    );
    const request = httpMock.expectOne('http://localhost:4000/api/ai/analyze');
    const prompt: string = request.request.body.prompt;
    expect(prompt.length).toBeLessThanOrEqual(8000);
    // Every character of the adaptation survives, not just its opening line.
    expect(prompt).toContain(tail);
    expect(prompt).toContain('ARTIST DATA (self-reported):');
    request.flush({ text: 'Answer' });
    await pending;
  });

  it('rejects oversize artist requests before spending provider quota', async () => {
    await expect(service.getAIResponse('x'.repeat(3001))).rejects.toThrow('3000');
    httpMock.expectNone('http://localhost:4000/api/ai/analyze');
    expect(service.isProcessing()).toBe(false);
  });

  it('rejects an offline sentinel regardless of persona casing', async () => {
    jest.spyOn(service, 'getAIResponse').mockResolvedValue('Strategic link severed. Offline analysis.');
    await expect(service.industryDeepSearch('publishing')).rejects.toThrow('offline');
    expect(service.industryIntelligence()).toHaveLength(0);
  });

  /**
   * The advisor is only useful if its advice is traceable. These check that the
   * queue is derived from the lifecycle snapshot rather than invented, and that
   * the model prompt does not receive the derived state unless the artist has
   * opted into sharing profile answers.
   */
  describe('lifecycle-linked advisor', () => {
    it('leads with the pathway next step and carries its evidence', () => {
      const snapshot = service.lifecycleSnapshot();
      const advice = service.refreshAdvisorAdvice();

      expect(snapshot.nextBestMove).not.toBeNull();
      expect(advice.length).toBeGreaterThan(0);
      expect(advice[0].sourceStepId).toBe(snapshot.nextBestMove!.id);
      expect(advice[0].priority).toBe('high');
      expect(advice[0].evidence?.length).toBeGreaterThan(0);
      expect(advice[0].phase).toBeTruthy();
      expect(service.advisorAdvice()).toEqual(advice);
    });

    it('keeps a dismissed item out of later refreshes', () => {
      const first = service.refreshAdvisorAdvice()[0];

      service.dismissAdvisorAdvice(first.id);
      expect(service.advisorAdvice().map((item) => item.id)).not.toContain(first.id);

      const refreshed = service.refreshAdvisorAdvice();
      expect(refreshed.map((item) => item.id)).not.toContain(first.id);
    });

    it('withholds the lifecycle brief until profile answers are shared', () => {
      userProfileServiceMock.profile!.update((profile: any) => ({
        ...profile,
        settings: { ...profile.settings, security: { ...profile.settings.security, hideSensitiveProfileDetails: false } },
      }));
      const shared = service.lifecycleAdvisorBrief();
      expect(shared).toContain('ARTIST LIFECYCLE');
      expect(shared).toContain('evidence-derived');
      expect(shared).not.toContain('withheld');

      userProfileServiceMock.profile!.update((profile: any) => ({
        ...profile,
        settings: {
          ...profile.settings,
          security: { ...profile.settings.security, shareProfileAnswersWithAi: false },
        },
      }));

      expect(service.lifecycleAdvisorBrief()).toContain('withheld');
      expect(service.personaSystemPrompt).toContain('ARTIST LIFECYCLE');
    });

    it('never claims a sampled platform signal in its advice', () => {
      service.refreshAdvisorAdvice().forEach((item) => {
        expect(item.provenance).not.toBe('sampled');
      });
    });

    it('raises an undocumented collaborator share as a release consequence', () => {
      userProfileServiceMock.profile!.update((profile: any) => ({
        ...profile,
        knowledgeBase: {
          currentRelease: {
            id: 'rel-advisor',
            name: 'Window Light',
            type: 'Single',
            description: 'One quiet single about leaving.',
            status: 'Admin',
            tracks: [],
            credits: { artistName: 'Test Artist', collaborators: ['Blue Nine'] },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }));

      const advice = service.refreshAdvisorAdvice();
      const creative = advice.find((item) =>
        item.id.startsWith('lifecycle:creative:rights')
      );

      expect(creative).toBeDefined();
      expect(creative!.title).toContain('Rights');
      expect(creative!.evidence?.join(' ')).toContain('collaborators = 1');
      expect(creative!.action).toEqual({
        type: 'navigate',
        payload: '/release-pipeline',
      });
    });

    it('reads an adopted catalogue split into the advisor snapshot', () => {
      userProfileServiceMock.profile!.update((profile: any) => ({
        ...profile,
        catalog: [
          { id: 'w1', title: 'Window Light', splitSheetRef: 'splits/window.pdf' },
        ],
        knowledgeBase: {
          currentRelease: {
            id: 'rel-parity',
            name: 'Window Light',
            type: 'Single',
            description: 'One quiet single about leaving.',
            status: 'Admin',
            tracks: [],
            credits: { artistName: 'Test Artist', collaborators: ['Blue Nine'] },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }));

      // The stored release records no split, so this only matches the release
      // workspace if the bridge resolves the catalogue reference the same way.
      const rights = service
        .lifecycleSnapshot()
        .creativeBridge.consequences.find(
          (entry) => entry.dimension === 'rights'
        )!;

      expect(rights.evidence.join(' ')).toContain('splits/window.pdf');
      expect(rights.observation).toContain('nothing records which collaborators');
    });

    it('tells the model what shipping the release commits the artist to', () => {
      userProfileServiceMock.profile!.update((profile: any) => ({
        ...profile,
        settings: { ...profile.settings, security: { ...profile.settings.security, hideSensitiveProfileDetails: false } },
      }));
      expect(service.lifecycleAdvisorBrief()).toContain(
        'No release is in the pipeline'
      );

      userProfileServiceMock.profile!.update((profile: any) => ({
        ...profile,
        knowledgeBase: {
          currentRelease: {
            id: 'rel-brief',
            name: 'Window Light',
            type: 'Single',
            description: 'One quiet single about leaving.',
            status: 'Admin',
            tracks: [],
            credits: { artistName: 'Test Artist', collaborators: [] },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }));

      const brief = service.lifecycleAdvisorBrief();
      expect(brief).toContain('Creative → business for "Window Light"');
      expect(brief).toContain('never as legal, financial, or platform certainty');
    });
  });

});
