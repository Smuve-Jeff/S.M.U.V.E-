import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudioComponent } from './studio.component';
import { AudioSessionService } from './audio-session.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { NotificationService } from '../services/notification.service';
import { MusicManagerService } from '../services/music-manager.service';
import { UserProfileService } from '../services/user-profile.service';
import { AiCopilotService } from './ai-copilot.service';
import { HapticService } from '../services/haptic.service';
import { TouchGestureService } from '../services/touch-gesture.service';
import { SequencerService } from './sequencer.service';
import { InteractionDialogService } from '../services/interaction-dialog.service';
import { ProjectTemplateService } from '../services/project-template.service';
import { IdeasGeneratorService } from '../services/ideas-generator.service';
import { SnackbarService } from '../services/snackbar.service';
import { ActivatedRoute, Router } from '@angular/router';
import { signal, Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { ProjectWorkspaceService } from './project-workspace.service';
import { AudioEngineLatencyService } from '../services/audio-engine-latency.service';
import { CollaborationService } from '../services/collaboration.service';
import { AiMixAssistantService } from './effects/ai-mix-assistant.service';
import { StudioOrchestrationService } from '../services/studio-orchestration.service';
import { ProjectService } from '../services/project.service';
import { AuthService } from '../services/auth.service';
import { StudioTelemetryService } from './studio-telemetry.service';
import { SmartRecordingService } from './smart-recording.service';
import { SmartSoundService } from './smart-sound.service';
import { AudioImportService } from './audio-import.service';
import { ComponentRecordingService } from './component-recording.service';
import { LoggingService } from '../services/logging.service';
import { HistoryService } from '../services/history.service';

describe('StudioComponent', () => {
  let component: StudioComponent;
  let fixture: ComponentFixture<StudioComponent>;

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    stop: jest.fn(),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
  };

  const mockMusicManager = {
    currentStep: signal(0),
    tracks: signal([]),
    selectedTrackId: signal<string | null>(null),
    applyGeneratedRecipe: jest.fn(),
    newProject: jest.fn(),
    crossLinkRequest: signal(null),
    snapshotProject: jest.fn().mockReturnValue({ id: 'proj-1', tracks: [] }),
  };

  const mockIdeasGenerator = {
    recipes: [],
  };

  const mockProjectWorkspace = {
    restoreLatestProjectState: jest.fn().mockResolvedValue(false),
    startFreshProject: jest.fn(),
    updateMetadata: jest.fn(),
    isDirty: signal(false),
    metadata: signal(null),
    lastAutoSave: signal(0),
    lastPersistedAt: signal(0),
    lastRecoveredAt: signal(null),
    lastRecoveredSource: signal(null),
    autoSaveEnabled: signal(true),
    genres: [],
    moods: [],
    keys: [],
  };

  const mockTemplateService = {
    templates: [],
    applyTemplate: jest.fn(),
  };

  const mockSnackbar = {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  };

  const mockEngineLatency = {
    readSnapshot: jest.fn().mockReturnValue({
      totalLatencyMs: 24,
      masterWorkletActive: true,
      sampleRateHz: 48000,
      contextState: 'running',
    }),
    runOfflineBenchmark: jest.fn(),
    profileSummary: () => ({
      snapshot: {
        performanceTier: 'ultra',
        totalLatencyMs: 24,
        sampleRateHz: 48000,
        contextState: 'running',
      },
      recentBenchmarks: [],
      recommendations: [],
    }),
  };

  const mockAudioEngine = {
    tempo: signal(124),
    performanceTier: signal('ultra'),
    visualStep: signal(0),
    resume: jest.fn(),
    armOnFirstUserGesture: jest.fn(),
    setSaturation: jest.fn(),
  };

  const mockCollaboration = {
    currentSession: signal<any>(null),
    pendingConflicts: signal<any[]>([]),
    peerCursors: signal({}),
    voicePeers: signal({}),
    publishCursor: jest.fn(),
    joinSession: jest.fn(),
    leaveSession: jest.fn(),
    startSession: jest.fn().mockResolvedValue('sess-1'),
    can: jest.fn().mockReturnValue(true),
  };

  const mockAiMixAssistant = {
    analyses: signal<any[]>([]),
    suggestions: signal<any[]>([]),
    analyzeAll: jest.fn(),
  };

  const mockOrchestration = {
    setActiveStudioView: jest.fn(),
  };

  const mockProjectService = {
    currentProject: signal({ id: 'proj-1', name: 'Project 1' }),
  };

  const mockAuthService = {
    currentUser: signal({ id: 'user-1', artistName: 'Tester' }),
  };

  const mockStudioTelemetry = {
    weeklyDashboard: signal({}),
    beginSession: jest.fn(),
    endSession: jest.fn(),
    trackEvent: jest.fn(),
  };

  const mockSmartRecording = {
    onBarTick: jest.fn(),
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTemplateService.templates = [];
    mockProjectWorkspace.restoreLatestProjectState.mockResolvedValue(false);
    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: AiService, useValue: {} },
        { provide: UIService, useValue: { isCompactMobile: () => false } },
        { provide: NotificationService, useValue: {} },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: UserProfileService, useValue: { profile: signal({}) } },
        { provide: AiCopilotService, useValue: {} },
        { provide: HapticService, useValue: mockHaptic },
        { provide: TouchGestureService, useValue: {} },
        { provide: SequencerService, useValue: {} },
        { provide: InteractionDialogService, useValue: {} },
        { provide: ProjectTemplateService, useValue: mockTemplateService },
        { provide: ProjectWorkspaceService, useValue: mockProjectWorkspace },
        { provide: AudioEngineLatencyService, useValue: mockEngineLatency },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: IdeasGeneratorService, useValue: mockIdeasGenerator },
        { provide: CollaborationService, useValue: mockCollaboration },
        { provide: AiMixAssistantService, useValue: mockAiMixAssistant },
        { provide: StudioOrchestrationService, useValue: mockOrchestration },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: StudioTelemetryService, useValue: mockStudioTelemetry },
        { provide: SmartRecordingService, useValue: mockSmartRecording },
        { provide: SmartSoundService, useValue: {} },
        { provide: AudioImportService, useValue: {} },
        { provide: ComponentRecordingService, useValue: {} },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), system: jest.fn() } },
        { provide: HistoryService, useValue: {} },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of({ get: () => 'arrangement' }),
            snapshot: { queryParamMap: { get: () => 'arrangement' } },
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(StudioComponent, {
        set: { imports: [], template: '<div></div>' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(StudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exposes an active view signal initialised by the queryParamMap mock', () => {
    expect(component.activeView()).toBe('arrangement');
    expect(mockOrchestration.setActiveStudioView).toHaveBeenCalledWith(
      'arrangement'
    );
  });

  it('exposes an empty mobile panel by default', () => {
    expect(component.mobilePanel()).toBeNull();
  });

  it('exposes a templates collection backed by the ProjectTemplateService mock', () => {
    expect(component.templateService.templates).toEqual([]);
  });

  it('starts a fresh workspace when applying a template', () => {
    mockTemplateService.templates = [
      { id: 'trap-elite', name: 'Trap Elite', bpm: 140, genre: 'trap', tracks: [] },
    ];

    component.applyTemplate('trap-elite');

    expect(mockTemplateService.applyTemplate).toHaveBeenCalledWith('trap-elite');
    expect(mockProjectWorkspace.startFreshProject).toHaveBeenCalledWith({
      name: 'Trap Elite',
      bpm: 140,
      genre: 'trap',
    });
  });

  it('syncs studio subview changes into the orchestration layer', () => {
    component.setActiveView('mixer');
    expect(mockOrchestration.setActiveStudioView).toHaveBeenLastCalledWith(
      'mixer'
    );
  });
});
