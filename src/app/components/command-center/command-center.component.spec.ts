import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CommandCenterComponent } from './command-center.component';
import { AiService } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';

describe('CommandCenterComponent', () => {
  let component: CommandCenterComponent;
  let fixture: ComponentFixture<CommandCenterComponent>;
  let mockAiService: any;
  let mockProfileService: any;
  let mockUiService: any;

  const recommendation = {
    id: 'upg-room-calibration',
    title: 'Room Calibration',
    type: 'Software',
    description: 'Dial in playback.',
    cost: '$0-$99',
    url: '',
    impact: 'High',
    rationale: 'Improve translation.',
    targetArea: 'Production',
    priority: 'Critical',
    prerequisites: ['Reference your last bounce'],
    actionLabel: 'Open Studio',
    toolId: 'studio',
    state: 'suggested',
    outcomeMetric: {
      label: 'Expected gain',
      value: 'Cleaner low-end translation',
    },
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    mockAiService = {
      strategicDecrees: signal(['Protect the release window']),
      intelligenceBriefs: signal([]),
      marketAlerts: signal([]),
      systemStatus: signal({
        latency: 12,
        cpuLoad: 14,
        memoryUsage: 33,
        neuralSync: 98,
      }),
      executiveAudit: signal(null),
      isScanning: signal(false),
      currentProcessStep: signal(''),
      scanningProgress: signal(0),
      getUpgradeRecommendations: jest.fn().mockReturnValue([recommendation]),
      getStrategicRecommendations: jest.fn().mockReturnValue([]),
      processCommand: jest.fn().mockResolvedValue('ok'),
      performExecutiveAudit: jest.fn(),
    };

    mockProfileService = {
      profile: signal({
        recommendationHistory: [
          {
            recommendationId: 'upg-room-calibration',
            title: 'Room Calibration',
            type: 'Software',
            state: 'saved',
            updatedAt: Date.now(),
          },
        ],
      }),
      acquireUpgrade: jest.fn().mockResolvedValue(undefined),
      setRecommendationState: jest.fn().mockResolvedValue(undefined),
      completeUpgrade: jest.fn().mockResolvedValue(undefined),
    };

    mockUiService = {
      navigateToView: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CommandCenterComponent],
      providers: [
        { provide: AiService, useValue: mockAiService },
        { provide: UserProfileService, useValue: mockProfileService },
        { provide: UIService, useValue: mockUiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommandCenterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('creates and exposes actionable recommendations', () => {
    expect(component).toBeTruthy();
    expect(component.recommendations().length).toBe(1);
  });

  it('routes recommendation focus actions through the UI service', () => {
    component.focusRecommendation(recommendation as any);
    expect(mockUiService.navigateToView).toHaveBeenCalledWith('studio');
  });

  it('persists saved recommendation feedback', async () => {
    await component.saveRecommendation(recommendation as any);
    expect(mockProfileService.setRecommendationState).toHaveBeenCalledWith(
      'upg-room-calibration',
      'saved',
      recommendation
    );
  });

  it('marks upgrades as acquired with their recommendation id', async () => {
    await component.acquireUpgrade(recommendation as any);
    expect(mockProfileService.acquireUpgrade).toHaveBeenCalledWith({
      title: 'Room Calibration',
      type: 'Software',
      recommendationId: 'upg-room-calibration',
    });
  });

  it('marks acquired directives as completed', async () => {
    await component.completeRecommendation({
      ...recommendation,
      state: 'acquired',
    } as any);
    expect(mockProfileService.completeUpgrade).toHaveBeenCalledWith({
      title: 'Room Calibration',
      type: 'Software',
      recommendationId: 'upg-room-calibration',
    });
  });
});
