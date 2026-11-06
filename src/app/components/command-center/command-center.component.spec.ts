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

  const auditReport = {
    overallScore: 82,
    sonicCohesion: 78,
    arrangementDepth: 74,
    marketViability: 66,
    technicalAuthority: 71,
    criticalDeficits: ['Two-factor authentication is disabled.'],
    technicalRecommendations: ['Re-balance track gains.'],
    catalogAnalysis: { bpmVariance: 12, keyConsistency: 80, genreAlignment: 60 },
  };

  const loggedText = () =>
    component
      .terminalLogs()
      .map((entry) => entry.message)
      .join('\n');

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
      connectionState: signal('idle'),
      aiStatusLabel: () => 'Local knowledge',
      aiAccess: () => true,
      getUpgradeRecommendations: jest.fn().mockReturnValue([recommendation]),
      getStrategicRecommendations: jest.fn().mockReturnValue([]),
      getAIResponse: jest.fn().mockResolvedValue('ok'),
      refreshIntelligenceBriefs: jest.fn().mockReturnValue([]),
      performExecutiveAudit: jest.fn().mockReturnValue(auditReport),
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

  it('maps specialized blueprint ids onto real workspaces', () => {
    component.focusRecommendation({
      ...recommendation,
      toolId: 'quantum-master',
    } as any);
    expect(mockUiService.navigateToView).toHaveBeenCalledWith('mastering');

    component.focusRecommendation({
      ...recommendation,
      toolId: 'legal-executioner',
    } as any);
    expect(mockUiService.navigateToView).toHaveBeenCalledWith('business-suite');
  });

  it('reports a directive with no destination instead of navigating nowhere', () => {
    component.focusRecommendation({
      ...recommendation,
      toolId: 'unknown-tool',
      preferredViews: undefined,
    } as any);

    expect(mockUiService.navigateToView).not.toHaveBeenCalled();
    expect(loggedText()).toContain('NO DESTINATION MAPPED');
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

  it('clears the power-up overlay and reports a failed acquisition', async () => {
    mockProfileService.acquireUpgrade.mockRejectedValueOnce(
      new Error('profile write failed')
    );

    await component.acquireUpgrade(recommendation as any);

    expect(component.isPoweringUp()).toBe(false);
    expect(component.actionError()).toContain('profile write failed');
    expect(loggedText()).toContain('profile write failed');
  });

  it('does not submit a second directive decision while one is in flight', async () => {
    let release: (() => void) | undefined;
    mockProfileService.setRecommendationState.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );

    const first = component.saveRecommendation(recommendation as any);
    const second = component.saveRecommendation(recommendation as any);

    expect(mockProfileService.setRecommendationState).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
  });

  it('opens an upgrade target without handing it the app opener', async () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);

    await component.acquireUpgrade({
      ...recommendation,
      url: 'https://example.test/upgrade',
    } as any);

    jest.advanceTimersByTime(1200);

    // Without `noopener` the opened third-party page can reach back through
    // `window.opener` and navigate the app underneath the user.
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.test/upgrade',
      '_blank',
      expect.stringContaining('noopener')
    );
    openSpy.mockRestore();
  });

  it('runs a staged audit and logs the real verdict', async () => {
    const running = component.runAudit();
    expect(component.auditRunning()).toBe(true);
    expect(component.auditStep()).toContain('STEP 1/');

    await jest.advanceTimersByTimeAsync(1000);
    await running;

    expect(mockAiService.performExecutiveAudit).toHaveBeenCalledTimes(1);
    expect(component.auditRunning()).toBe(false);
    expect(loggedText()).toContain('AUDIT PASSED — 82/100');
    expect(loggedText()).toContain('PRIMARY DEFICIT');
  });

  it('answers status from live service state without a model call', async () => {
    await component.handleCommand('status');

    expect(mockAiService.getAIResponse).not.toHaveBeenCalled();
    expect(loggedText()).toContain('LINK: Local knowledge');
    expect(loggedText()).toContain('AUDIT: not run');
  });

  it('lists supported terminal commands with help', async () => {
    await component.handleCommand('/help');

    expect(mockAiService.getAIResponse).not.toHaveBeenCalled();
    expect(loggedText()).toContain('TERMINAL COMMANDS');
    expect(loggedText()).toContain('audit');
  });

  it('generates intel briefs instead of coming back empty', async () => {
    mockAiService.refreshIntelligenceBriefs.mockReturnValueOnce([
      {
        id: 'brief-1',
        title: 'Protect the release window',
        content: 'Hold the announced date.',
        category: 'STRATEGY',
        impact: 'HIGH',
      },
    ]);

    await component.handleCommand('/intel');

    expect(mockAiService.getAIResponse).not.toHaveBeenCalled();
    expect(loggedText()).toContain('Protect the release window');
    expect(loggedText()).toContain('Hold the announced date.');
  });

  it('routes freeform directives to the live AI link', async () => {
    await component.handleCommand('reference modulation');

    expect(mockAiService.getAIResponse).toHaveBeenCalledWith(
      'reference modulation'
    );
    expect(loggedText()).toContain('ok');
  });

  it('logs every executed command into a recappable history', async () => {
    await component.handleCommand('status');
    await component.handleCommand('/intel');
    await component.handleCommand('status');

    expect(component.commandHistory()[0]).toBe('/intel');
    expect(component.commandHistory()).toContain('status');
  });

  it('recalls executed commands with the arrow keys', async () => {
    const run = async (
      key: string,
      value: string
    ): Promise<[string, HTMLInputElement]> => {
      const input = document.createElement('input') as HTMLInputElement;
      input.value = value;
      component.recallHistory({ key, target: input, preventDefault: () => {} } as any);
      return [key, input];
    };

    await component.handleCommand('protect the release window');
    await component.handleCommand('status');

    await run('ArrowUp', '');
    expect(component.commandHistory()[0]).toBe('status');

    await run('ArrowUp', 'status');
    expect(component.commandHistory()[1]).toBe('protect the release window');

    await run('ArrowDown', 'protect the release window');
    expect(component.commandHistory()[0]).toBe('status');
  });

  it('clears the terminal buffer without losing the neural link', () => {
    component.clearTerminal();

    expect(component.terminalLogs().length).toBe(1);
    expect(component.terminalLogs()[0].message).toContain('CLEARED');
    expect(component.terminalLogs()[0].type).toBe('system');
    expect(component.commandHistory().length).toBe(0);
  });

  it('marks unmeasured telemetry as unavailable instead of zero', () => {
    // A metric the service leaves at zero (it cannot be measured in a browser).
    expect(component.formatMetric('activeProcesses')).toBe('n/a');
    expect(component.formatMetric('cpuLoad')).toMatch(/%$/);
    expect(component.formatMetric('latency')).toMatch(/ms$/);
  });

  it('reports the real AI link state instead of a hardcoded sync claim', () => {
    (mockAiService as any).connectionState = signal('offline');
    (mockAiService as any).aiStatusLabel = () => 'Local knowledge';
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Local knowledge');
    expect(text).not.toContain('Neural Link: Synchronized');
  });
});
