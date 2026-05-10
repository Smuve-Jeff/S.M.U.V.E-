import { TestBed } from '@angular/core/testing';
import { NeuralOrchestratorService, UpgradeRecommendation } from '../ai.service';
import { UserProfileService } from '../user-profile.service';
import { UserContextService } from '../user-context.service';
import { AnalyticsService } from '../analytics.service';
import { LoggingService } from '../logging.service';
import { signal } from '@angular/core';

describe('NeuralOrchestratorService', () => {
  let service: NeuralOrchestratorService;
  let userProfileServiceMock: Partial<UserProfileService>;
  let userContextServiceMock: Partial<UserContextService>;
  let analyticsServiceMock: Partial<AnalyticsService>;
  let loggingServiceMock: Partial<LoggingService>;

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
        tasks: [],
        skills: [],
        expertiseLevels: { production: 5, marketing: 5, mastering: 5, audioEngineering: 5 },
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
        NeuralOrchestratorService,
        { provide: UserProfileService, useValue: userProfileServiceMock },
        { provide: UserContextService, useValue: userContextServiceMock },
        { provide: AnalyticsService, useValue: analyticsServiceMock },
        { provide: LoggingService, useValue: loggingServiceMock },
      ],
    });

    service = TestBed.inject(NeuralOrchestratorService);
    jest.spyOn(service as any, 'getRankedUpgrades').mockReturnValue([mockUpgrade]);
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
    expect(loggingServiceMock.info).toHaveBeenCalledWith('Upgrade test-upgrade is already unlocked.');
  });
  
  it('should get an AI response using the AIAgent', async () => {
    const response = await service.getAIResponse('Provide a detailed analysis of the Test Upgrade upgrade.');
    expect(service.isProcessing()).toBe(false);
    expect(response).toContain('The **Test Upgrade** is a **High**-impact upgrade');
  });

  it('should handle getAIResponse when no upgrades are available', async () => {
    jest.spyOn(service as any, 'getRankedUpgrades').mockReturnValue([]);
    const response = await service.getAIResponse('Analyze this');
    expect(response).toBe('No upgrades available to analyze.');
  });
});
