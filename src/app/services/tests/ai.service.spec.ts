import { TestBed } from '@angular/core/testing';
import { AiService, UpgradeRecommendation } from '../ai.service';
import { UserProfileService } from '../user-profile.service';
import { UserContextService } from '../user-context.service';
import { AnalyticsService } from '../analytics.service';
import { LoggingService } from '../logging.service';
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
      ],
    });

    service = TestBed.inject(AiService);
    httpMock = TestBed.inject(HttpTestingController);
    jest
      .spyOn(service as any, 'getRankedUpgrades')
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

  it('should get an AI response using the AIAgent', async () => {
    const requestPromise = service.getAIResponse(
      'Provide a detailed analysis of the Test Upgrade upgrade.'
    );

    const req = httpMock.expectOne('/api/ai/analyze');
    req.flush({ text: 'The **Test Upgrade** is a **High**-impact upgrade' });

    const response = await requestPromise;
    expect(service.isProcessing()).toBe(false);
    expect(response).toContain(
      'The **Test Upgrade** is a **High**-impact upgrade'
    );
  });

  it('should handle getAIResponse when backend fails', async () => {
    const requestPromise = service.getAIResponse('Analyze this');
    const req = httpMock.expectOne('/api/ai/analyze');
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
    expect(response).toContain('ELITE_PROTOCOL_ACTIVE');
  });
});
