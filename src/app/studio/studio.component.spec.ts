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
    addTrack: jest.fn(() => 'track-1'),
    replaceTrackNotes: jest.fn(),
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

  const mockHistory = {
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: signal(false),
    canRedo: signal(false),
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

  const mockUserProfileService = {
    profile: signal({
      settings: { studio: { stageFxEnabled: true } },
    }),
    // Faithful to the real service: merging the patch into the profile
    // signal lets the Studio's live-sync effect observe the change.
    updateProfile: jest.fn((patch: any) => {
      const current = mockUserProfileService.profile();
      mockUserProfileService.profile.set({
        ...current,
        ...patch,
      });
      return Promise.resolve(undefined);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    localStorage.clear();
    // Reset the profile signal: updateProfile() mutates it during tests,
    // and without a reset the live-sync effect leaks FX state across tests.
    mockUserProfileService.profile.set({
      settings: { studio: { stageFxEnabled: true } },
    });
    document.body.classList.remove('stage-fx-off');
    mockAudioEngine.performanceTier.set('ultra');
    mockTemplateService.templates = [];
    mockProjectWorkspace.restoreLatestProjectState.mockResolvedValue(false);
    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: AiService, useValue: {} },
        {
          provide: UIService,
          useValue: { isCompactMobile: () => false, showMobileNav: () => false },
        },
        { provide: NotificationService, useValue: {} },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: UserProfileService, useValue: mockUserProfileService },
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
        {
          provide: LoggingService,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            system: jest.fn(),
          },
        },
        { provide: HistoryService, useValue: mockHistory },
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
      {
        id: 'trap-elite',
        name: 'Trap Elite',
        bpm: 140,
        genre: 'trap',
        tracks: [],
      },
    ];

    component.applyTemplate('trap-elite');

    expect(mockTemplateService.applyTemplate).toHaveBeenCalledWith(
      'trap-elite'
    );
    expect(mockProjectWorkspace.startFreshProject).toHaveBeenCalledWith({
      name: 'Trap Elite',
      bpm: 140,
      genre: 'trap',
    });
  });

  it('syncs studio subview changes into the orchestration layer', () => {
    mockOrchestration.setActiveStudioView.mockClear();
    component.setActiveView('mixer');
    TestBed.flushEffects();
    expect(mockOrchestration.setActiveStudioView).toHaveBeenCalledWith('mixer');
  });

  it('exposes Stage FX ambience enabled by default', () => {
    expect(component.stageFxEnabled()).toBe(true);
  });

  it('toggles Stage FX and persists the choice to localStorage', () => {
    component.toggleStageFx();
    expect(component.stageFxEnabled()).toBe(false);
    expect(localStorage.getItem('smuve_stage_fx')).toBe('off');
    component.toggleStageFx();
    expect(component.stageFxEnabled()).toBe(true);
    expect(localStorage.getItem('smuve_stage_fx')).toBe('on');
  });

  it('syncs the stage-fx-off body class when FX is disabled', () => {
    expect(document.body.classList.contains('stage-fx-off')).toBe(false);
    component.toggleStageFx();
    TestBed.flushEffects();
    expect(document.body.classList.contains('stage-fx-off')).toBe(true);
  });

  it('auto-disables FX on the low-end tier until the user makes a choice', () => {
    // Untouched user + low-end tier → guard fires and disables ambience.
    expect(component.stageFxUserTouched).toBe(false);
    mockAudioEngine.performanceTier.set('performance');
    TestBed.flushEffects();
    expect(component.stageFxEnabled()).toBe(false);
    expect(component.stageFxUserTouched).toBe(true);
  });

  it('lets a manual toggle win — the tier guard never overrides an explicit choice', () => {
    component.toggleStageFx();
    expect(component.stageFxUserTouched).toBe(true);
    // Low-end tier arrives after the manual choice — must stay OFF the
    // way the user set it.
    mockAudioEngine.performanceTier.set('performance');
    TestBed.flushEffects();
    expect(component.stageFxEnabled()).toBe(false);
    // Then the user flips FX back ON — the guard must not re-disable.
    component.toggleStageFx();
    TestBed.flushEffects();
    expect(component.stageFxEnabled()).toBe(true);
  });

  // ── Keyboard shortcuts (Studio-side: Shift+F + help popover) ──

  it('toggles the keyboard-shortcuts help popover', () => {
    expect(component.showShortcuts()).toBe(false);
    component.toggleShortcuts();
    expect(component.showShortcuts()).toBe(true);
    component.toggleShortcuts();
    expect(component.showShortcuts()).toBe(false);
  });

  it('toggles Stage FX with Shift+F from anywhere in the studio', () => {
    const before = component.stageFxEnabled();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', shiftKey: true })
    );
    expect(component.stageFxEnabled()).toBe(!before);
  });

  it('ignores Shift+F while typing in a text input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const before = component.stageFxEnabled();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', shiftKey: true, bubbles: true })
    );
    expect(component.stageFxEnabled()).toBe(before);
    document.body.removeChild(input);
  });

  it('ignores a plain F key without the Shift modifier', () => {
    const before = component.stageFxEnabled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    expect(component.stageFxEnabled()).toBe(before);
  });

  it('owns Ctrl+Z undo at the shell level and prevents the default', () => {
    const event = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      key: 'z',
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    expect(component.handleKeyboardShortcut(event)).toBe(true);
    expect(mockHistory.undo).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('owns Ctrl+Shift+Z redo at the shell level and prevents the default', () => {
    const event = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      key: 'z',
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    expect(component.handleKeyboardShortcut(event)).toBe(true);
    expect(mockHistory.redo).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('leaves Ctrl+Y for the transport bar (returns false, no default action)', () => {
    const event = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      key: 'y',
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    expect(component.handleKeyboardShortcut(event)).toBe(false);
    expect(mockHistory.redo).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('yields Ctrl+Z to native text editing while typing in an input', () => {
    mockHistory.undo.mockClear();
    const event = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      key: 'z',
      preventDefault: jest.fn(),
      target: { tagName: 'INPUT', isContentEditable: false },
    } as unknown as KeyboardEvent;

    component.onShellKeydown(event);

    expect(mockHistory.undo).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('delegates Ctrl+Z outside inputs to the shell shortcut handler', () => {
    mockHistory.undo.mockClear();
    const event = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      key: 'z',
      preventDefault: jest.fn(),
      target: { tagName: 'DIV', isContentEditable: false },
    } as unknown as KeyboardEvent;

    component.onShellKeydown(event);

    expect(mockHistory.undo).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('stamps an applied chord into a fresh keys track on the piano roll', () => {
    mockMusicManager.selectedTrackId.set(null);
    mockMusicManager.tracks.set([]);

    component.applyChordToPianoRoll('Imaj7', 0);

    expect(mockMusicManager.addTrack).toHaveBeenCalledWith(
      'Chords',
      'grand-piano'
    );
    expect(mockMusicManager.replaceTrackNotes).toHaveBeenCalledTimes(1);
    const [trackIdArg, notesArg] =
      mockMusicManager.replaceTrackNotes.mock.calls[0];
    expect(trackIdArg).toBe('track-1');
    expect(notesArg).toHaveLength(4);
    expect(mockMusicManager.selectedTrackId()).toBe('track-1');
    expect(mockSnackbar.success).toHaveBeenCalled();
  });

  it('mirrors the Stage FX toggle into the executive preferences', () => {
    component.toggleStageFx();
    expect(mockUserProfileService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          studio: expect.objectContaining({ stageFxEnabled: false }),
        }),
      })
    );
  });

  it('live-syncs the FX button when the preference changes while the studio is open', () => {
    expect(component.stageFxEnabled()).toBe(true);
    // A preference change from outside the Studio (Settings commit, cloud
    // sync, profile restore) updates the topbar button immediately.
    mockUserProfileService.profile.set({
      settings: { studio: { stageFxEnabled: false } },
    });
    TestBed.flushEffects();
    expect(component.stageFxEnabled()).toBe(false);
    expect(document.body.classList.contains('stage-fx-off')).toBe(true);
  });

  it('persists the adaptive low-power FX auto-off to preferences', () => {
    mockAudioEngine.performanceTier.set('performance');
    TestBed.flushEffects();
    expect(component.stageFxEnabled()).toBe(false);
    // The guard's choice is written back so live-sync stays consistent and
    // the off state survives a reload.
    expect(mockUserProfileService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          studio: expect.objectContaining({ stageFxEnabled: false }),
        }),
      })
    );
    expect(localStorage.getItem('smuve_stage_fx')).toBe('off');
  });
});
