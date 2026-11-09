import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { StudioAiDirectorService } from './studio-ai-director.service';
import { STUDIO_SURFACES } from './studio-surfaces';
import { AiService } from '../services/ai.service';
import { MusicManagerService } from '../services/music-manager.service';
import { HistoryService } from '../services/history.service';
import { SessionHistoryService } from '../services/session-history.service';
import { SamplerStateService } from './sampler-state.service';
import { ExportService } from '../services/export.service';
import { IdeasGeneratorService } from '../services/ideas-generator.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiBeatGeneratorService } from '../services/ai-beat-generator.service';
import { AiProduceService } from '../services/ai-produce.service';
import { ScaleDetectionService } from '../services/scale-detection.service';
import { VocalAiService } from '../services/vocal-ai.service';
import { AutomationService } from './automation.service';
import { VocalMasteringService } from '../services/vocal-mastering.service';
import { PerformanceRecordingService } from './performance-recording.service';
import { AudioImportService } from './audio-import.service';
import { LoggingService } from '../services/logging.service';
import { NeuralMixerService } from '../services/neural-mixer.service';
import { TakeManagerService } from '../services/take-manager.service';
import { AiMixAssistantService } from './effects/ai-mix-assistant.service';
import { SmartSoundService } from './smart-sound.service';
import { SmartProductionFoundationsService } from './smart-production-foundations.service';
import { StudioTelemetryService } from './studio-telemetry.service';
import { ProjectWorkspaceService } from './project-workspace.service';
import { TunerLiveService } from './tuner/tuner-live.service';
import { VcaBusService } from './vca-bus.service';
import { AudioRecorderService } from './audio-recorder.service';
import { AiCopilotService } from './ai-copilot.service';
import { RecordingStatusService } from './recording-status.service';
import { OfflineBounceService } from './offline-bounce.service';

function makeDirector(overrides: Record<string, unknown> = {}) {
  const tracks = signal([
    {
      id: 'track-1',
      name: 'Director Lead',
      type: 'midi',
      gain: 0.8,
      muted: false,
      solo: false,
      notes: [{ id: 'n1', midi: 60, step: 0, length: 2, velocity: 0.8 }],
      clips: [],
    },
  ]);
  const selectedTrackId = signal<string | null>('track-1');
  const music = {
    tracks,
    selectedTrackId,
    selectedTrack: () => tracks().find((t) => t.id === selectedTrackId()) ?? null,
    addTrack: jest.fn((name: string, _instrumentId: string, type: string) => {
      const id = `track-${tracks().length + 1}`;
      tracks.update((current) => [...current, { id, name, type, gain: 0.8, muted: false, solo: false, notes: [], clips: [] }]);
      selectedTrackId.set(id);
      return id;
    }),
    projectName: 'Test Project',
    stemAudioCache: new Map<string, AudioBuffer>(),
    addClipToTrack: jest.fn(),
    addNoteToTrack: jest.fn((trackId: string, note: unknown) => {
      tracks.update((current) =>
        current.map((t) => (t.id === trackId ? { ...t, notes: [...t.notes, note] } : t)),
      );
    }),
    humanizeTrack: jest.fn(),
    applyGeneratedRecipe: jest.fn(),
    structure: signal([
      { id: 'intro', name: 'Intro', start: 0, length: 4 },
      { id: 'verse', name: 'Verse', start: 4, length: 8 },
      { id: 'chorus', name: 'Chorus', start: 8, length: 8 },
      { id: 'outro', name: 'Outro', start: 16, length: 4 },
    ]),
    sceneColumnCount: jest.fn(() => 0),
    sceneColumnHasContent: jest.fn(() => false),
    launchSceneColumn: jest.fn(() => 0),
    toggleAllInsertsBypass: jest.fn(),
    replaceTrackNotes: jest.fn(),
    removeTrack: jest.fn(),
    ...overrides.music,
  };
  const engine = {
    ctx: {
      createBuffer: jest.fn((channels: number, length: number, sampleRate: number) => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      })),
      destination: {},
    },
    tempo: signal(120),
    masterGainValue: signal(0.8),
    masterMuted: signal(false),
    metronomeEnabled: signal(false),
    isPlaying: signal(false),
    outputCorrelation: signal(0.91),
    outputLufs: signal(-9.5),
    getTrackLevel: jest.fn(() => 0.42),
    getTrackMomentaryLevelDb: jest.fn(() => -12.4),
    getTrackCorrelation: jest.fn(() => 0.91),
    getTrackBus: jest.fn(() => undefined),
    setDeckGain: jest.fn(),
    setDeckRate: jest.fn(),
    setDeckLoop: jest.fn(),
    setCrossfader: jest.fn(),
    ...overrides.engine,
  };
  const vcaBuses = {
    buses: signal([
      { id: 'vca-1', name: 'VCA 1', faderValue: 0.9, muted: false },
    ]),
    assignments: signal<Record<string, string | null>>({ 'track-1': 'vca-1' }),
    trackIdsForBus: jest.fn((busId: string) => ['track-1'].filter(() => busId === 'vca-1')),
    effectiveMultiplier: jest.fn(() => 0.9),
    ...overrides.vcaBuses,
  };
  const ai = {
    getAIResponse: jest.fn().mockResolvedValue('Live Director brief.'),
    ...overrides.ai,
  };
  const beat = {
    generateBeat: jest.fn().mockReturnValue({
      title: 'Test Beat',
      genre: 'pop',
      bpm: 120,
      key: 'C',
      drums: {
        name: 'Test Kit',
        kick: [{ position: 0, velocity: 1, probability: 1 }],
        snare: [{ position: 4, velocity: 0.9, probability: 1 }],
        hihat: [{ position: 2, velocity: 0.7, probability: 0.9 }],
        clap: [],
        percussion: [],
      },
      bass: { notes: [{ pitch: 'C', octave: 1, position: 0, duration: 4, velocity: 1 }] },
      melody: [{ notes: [{ pitch: 'C', octave: 4, position: 0, duration: 2, velocity: 0.8 }] }],
      chords: [{ chord: 'I' }],
    }),
    ...overrides.beat,
  };
  const produce = {
    currentBeat: signal(null),
    error: signal(null),
    run: jest.fn().mockResolvedValue({ idea: { title: 'Idea' }, beat: { title: 'Beat' }, lyrics: {}, mixReport: [], cancelled: false }),
    applyToProject: jest.fn().mockReturnValue(['track-a']),
    releaseHandoff: signal({
      title: 'Test Release',
      stages: [
        { name: 'Master', status: 'completed' },
        { name: 'Artwork', status: 'pending' },
      ],
      pending: ['Artwork'],
      nextStep: 'Finish artwork and metadata.',
    }),
    ...overrides.produce,
  };
  const scale = {
    detectKeyAndScale: jest.fn().mockReturnValue({ key: 'C', scale: 'major', confidence: 0.9 }),
    isInScale: jest.fn().mockReturnValue(true),
    ...overrides.scale,
  };
  const mix = {
    suggestions: signal([]),
    analyzeAll: jest.fn(),
    detectGenre: jest.fn().mockReturnValue('pop'),
    autoMaster: jest.fn().mockReturnValue(['auto-mastered']),
    applySuggestion: jest.fn().mockReturnValue({ id: 's1' }),
    ...overrides.mix,
  };
  const sounds = {
    sounds: signal([]),
    favoriteIds: signal(new Set<string>()),
    smartSearch: jest.fn().mockReturnValue([{ id: 'sound-1', name: 'Test Sound' }]),
    isFavorite: jest.fn().mockReturnValue(false),
    toggleFavorite: jest.fn(),
    recordUsage: jest.fn(),
    findSimilar: jest.fn().mockReturnValue([{ id: 'sound-2', name: 'Neighbour Sound' }]),
    availablePacks: signal([
      { id: 'pack-1', name: 'One Pack', description: 'Test description', genre: 'pop', mood: 'dark' },
    ]),
    installPack: jest.fn().mockResolvedValue(undefined),
    ...overrides.sounds,
  };
  const workspace = {
    isDirty: signal(false),
    metadata: signal(null),
    updateMetadata: jest.fn(),
    createSnapshot: jest.fn(() => ({ metadata: { id: 'project-1', name: 'Test Project' }, tracks: [] })),
    restoreFromSnapshot: jest.fn(),
    downloadProjectBundle: jest.fn(),
    importProjectBundle: jest.fn().mockResolvedValue(true),
    persistenceError: signal(''),
    ...overrides.workspace,
  };
  const telemetry = {
    trackEvent: jest.fn(),
    ...overrides.telemetry,
  };
  const logger = {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    ...overrides.logger,
  };
  const foundations = {
    capabilities: signal([]),
    ...overrides.foundations,
  };
  const neural = { applyNeuralMix: jest.fn(), ...overrides.neural };
  const takeManager = {
    getTakes: jest.fn().mockReturnValue(signal([])),
    compStack: jest.fn().mockReturnValue(signal([])),
    toggleCompTake: jest.fn(),
    applyComp: jest.fn().mockReturnValue([]),
    setActiveTake: jest.fn(),
    ...overrides.takeManager,
  };
  const audioRecorder = { getOfflineRecordings: jest.fn().mockResolvedValue([]), ...overrides.audioRecorder };
  const vocal = { currentAdvice: signal(''), ...overrides.vocal };
  const vocalMastering = {
    params: signal({
      deesser: { threshold: -24, frequency: 6500, bypass: false },
      multiband: {
        low: { threshold: -20, ratio: 4, bypass: false, frequency: 320 },
        mid: { threshold: -18, ratio: 2.5, bypass: false },
        high: { threshold: -16, ratio: 2, bypass: false, frequency: 2500 },
      },
      exciter: { amount: 0.1, frequency: 8000, bypass: false },
      eq: { low: 0, mid: 0, high: 0, bypass: false },
      limiter: { ceiling: -0.1, release: 0.1, bypass: false },
    }),
    updateParams: jest.fn(),
    ...overrides.vocalMastering,
  };
  const performanceRecording = {
    takes: signal([]),
    selectedTakeId: signal<string | null>(null),
    isRecording: signal(false),
    arm: jest.fn(),
    ...overrides.performanceRecording,
  };
  const audioImport = {
    selectedAudio: signal(null),
    importedAudio: signal([]),
    ...overrides.audioImport,
  };
  const recordingStatus = {
    armedTrackIds: signal(new Set<string>()),
    armTrack: jest.fn(),
    isTrackArmed: jest.fn(() => true),
    ...overrides.recordingStatus,
  };
  const copilot = { suggestStructure: jest.fn(), ...overrides.copilot };
  const offlineBounce = {
    bounce: jest.fn().mockResolvedValue({
      durationSeconds: 12.5,
      sampleRate: 96000,
      format: 'wav-32-float',
      peakDb: -1.2,
      rmsDb: -14.5,
    }),
    ...overrides.offlineBounce,
  };
  const sessionHistory = {
    activeBranch: jest.fn(() => 'branch-1'),
    checkpoints: jest.fn(() => []),
    materializeSnapshot: jest.fn(() => null),
    rewind: jest.fn().mockResolvedValue(null),
    ...overrides.sessionHistory,
  };
  const samplerState = {
    padVersion: signal(0),
    loadSlices: jest.fn().mockResolvedValue([60, 61, 62]),
    getLoadedPitches: jest.fn(() => []),
    ...overrides.samplerState,
  };
  const automation = {
    lanes: signal([
      {
        id: 'lane-1',
        target: { trackId: 'track-1', parameter: 'volume' },
        points: [{ time: 0, value: 0.5 }, { time: 4, value: 0.8 }],
        enabled: true,
        interpolation: 'linear',
        modulationDepth: 0,
      },
      {
        id: 'lane-2',
        target: { trackId: 'track-1', parameter: 'cc_modulation' },
        points: [],
        enabled: false,
        interpolation: 'smooth',
        modulationDepth: 0,
      },
    ]),
    modulationSources: signal([
      { id: 'mod-1', type: 'lfo', enabled: true, amount: 0.2, mappedLaneIds: ['lane-1'] },
    ]),
    macros: signal([{ id: 'macro-1', name: 'Energy', value: 0.3, mappings: [] }]),
    writeMode: signal('touch'),
    ...overrides.automation,
  };
  const tunerLive = {
    listening: signal(false),
    starting: signal(false),
    reading: signal(null),
    level: signal(0),
    error: signal<string | null>(null),
    deviceLabel: signal('USB Interface'),
    needle: signal(50),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    toggle: jest.fn(),
    verifyDevice: jest.fn().mockResolvedValue({
      supported: true,
      audioInputCount: 1,
      audioInputLabels: ['USB Interface'],
      permissionState: 'granted',
      listening: false,
      trackState: 'idle',
      deviceLabel: 'USB Interface',
      level: 0,
      reading: null,
      error: null,
    }),
    ...overrides.tunerLive,
  };
  const history = {
    canUndo: jest.fn(() => true),
    canRedo: jest.fn(() => false),
    execute: jest.fn((command: { execute: () => void }) => command.execute()),
    undo: jest.fn(),
    redo: jest.fn(),
    lastActionName: jest.fn(() => 'Remove Track · Test Track'),
    ...overrides.history,
  };
  const audioBuffer = { duration: 12.5 } as AudioBuffer;
  const exportService = {
    renderProjectOffline: jest.fn().mockResolvedValue(audioBuffer),
    masterRetainedMix: jest.fn().mockResolvedValue(audioBuffer),
    applySmuvePolish: jest.fn().mockResolvedValue(audioBuffer),
    analyzeBuffer: jest.fn().mockReturnValue({
      durationSec: 12.5,
      peakDb: -1.2,
      truePeakDb: -0.8,
      rmsDb: -14.5,
      lufs: -9,
      lra: 6,
      correlation: 0.95,
      sampleCount: 120000,
    }),
    exportToFormat: jest.fn().mockResolvedValue(new Blob(['audio'])),
    exportStems: jest.fn().mockResolvedValue(new Blob(['stems'])),
    exportProjectMidi: jest.fn().mockReturnValue(new Blob(['midi'])),
    exportDawproject: jest.fn().mockResolvedValue(new Blob(['dawproject'])),
    exportLoopWav: jest.fn().mockResolvedValue({
      blob: new Blob(['loop']),
      filename: 'Test_Project_Director_Loop_1-16_wav24_123.wav',
      format: 'wav24',
      extension: 'wav',
      bitrate: 0,
      startStep: 0,
      endStep: 16,
      durationSec: 2,
      sampleRate: 44100,
      metadata: { startStep: 0, endStep: 16, startBar: 1, endBar: 1, bpm: 120, format: 'wav24' },
    }),
    downloadBlob: jest.fn(),
    ...overrides.exportService,
  };
  const ideas = {
    recommend: jest.fn().mockReturnValue({ name: 'Neo Soul', bpm: 92, vibe: 'warm' }),
    ...overrides.ideas,
  };

  TestBed.configureTestingModule({
    providers: [
      StudioAiDirectorService,
      { provide: AiService, useValue: ai },
      { provide: MusicManagerService, useValue: music },
      { provide: AudioEngineService, useValue: engine },
      { provide: AiBeatGeneratorService, useValue: beat },
      { provide: AiProduceService, useValue: produce },
      { provide: ScaleDetectionService, useValue: scale },
      { provide: VocalAiService, useValue: vocal },
      { provide: VocalMasteringService, useValue: vocalMastering },
      { provide: PerformanceRecordingService, useValue: performanceRecording },
      { provide: AudioImportService, useValue: audioImport },
      { provide: LoggingService, useValue: logger },
      { provide: NeuralMixerService, useValue: neural },
      { provide: TakeManagerService, useValue: takeManager },
      { provide: AiMixAssistantService, useValue: mix },
      { provide: SmartSoundService, useValue: sounds },
      { provide: SmartProductionFoundationsService, useValue: foundations },
      { provide: StudioTelemetryService, useValue: telemetry },
      { provide: ProjectWorkspaceService, useValue: workspace },
      { provide: RecordingStatusService, useValue: recordingStatus },
      { provide: AudioRecorderService, useValue: audioRecorder },
      { provide: AiCopilotService, useValue: copilot },
      { provide: OfflineBounceService, useValue: offlineBounce },
      { provide: HistoryService, useValue: history },
      { provide: SessionHistoryService, useValue: sessionHistory },
      { provide: SamplerStateService, useValue: samplerState },
      { provide: TunerLiveService, useValue: tunerLive },
      { provide: AutomationService, useValue: automation },
      { provide: VcaBusService, useValue: vcaBuses },
      { provide: ExportService, useValue: exportService },
      { provide: IdeasGeneratorService, useValue: ideas },
    ],
  });
  return { service: TestBed.inject(StudioAiDirectorService), music, engine, ai, beat, mix, sounds, workspace, telemetry, takeManager, audioRecorder, copilot, offlineBounce, scale, produce, history, sessionHistory, samplerState, tunerLive, vcaBuses, exportService, ideas, vocal, vocalMastering, performanceRecording, audioImport, tracks, automation, recordingStatus };
}

describe('StudioAiDirectorService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
  });

  it('normalizes unknown surfaces to arrangement', () => {
    const { service } = makeDirector();
    expect(service.normalizeSurfaceId('not-real')).toBe('arrangement');
  });

  it('builds directive plans for all 25 Studio surfaces', () => {
    const { service } = makeDirector();
    expect(STUDIO_SURFACES).toHaveLength(25);
    for (const surface of STUDIO_SURFACES) {
      const plan = service.buildPlan({ surfaceId: surface.id });
      expect(plan.surfaceId).toBe(surface.id);
      expect(plan.title).toContain('Director Plan');
      expect(plan.mission.length).toBeGreaterThan(0);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.evidence.length).toBeGreaterThan(0);
    }
  });

  it('applies detected key from session notes', async () => {
    const { service, workspace } = makeDirector();
    workspace.metadata.set({ key: 'C' });
    const plan = service.buildPlan({ surfaceId: 'piano-roll' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('C major');
    expect(workspace.updateMetadata).toHaveBeenCalledWith({ key: 'C' });
  });

  it('executes an arrangement plan end-to-end', async () => {
    const { service } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'arrangement' });
    const run = await service.runPlan(plan);
    expect(run.completed).toBe(plan.steps.length);
    expect(run.report.join('\n')).toContain('Done');
  });

  it('records Director runs into evidence and exports a Markdown run report', async () => {
    const { service, workspace, exportService } = makeDirector();
    workspace.metadata.set({ id: 'project-1', name: 'Test Project', key: 'C' });
    const plan = service.buildPlan({ surfaceId: 'arrangement' });
    const run = await service.runPlan(plan);

    expect(service.lastDirectorRun()).toBe(run);
    expect(service.listDirectorRuns()).toEqual([run]);
    const evidence = service.sessionEvidence({ surfaceId: 'arrangement' }).join('\n');
    expect(evidence).toContain('Transport loop:');
    expect(evidence).toContain(`Last Director run: arrangement ${run.completed}/${run.results.length} completed`);

    const report = service.formatRunReport();
    expect(report).toContain('# Arrangement Director run');
    expect(report).toContain('## Results');
    expect(report).toContain('[done]');

    const message = service.exportRunReport();
    expect(exportService.downloadBlob).toHaveBeenCalledWith(expect.objectContaining({ type: 'text/markdown' }), expect.stringMatching(/Test_Project_Director_Run_arrangement_\d+\.md$/));
    expect(message).toContain('Test_Project_Director_Run_arrangement_');

    const persisted = JSON.parse(window.localStorage.getItem('smuve.studio.director.run-history.v1')!);
    expect(persisted[0]).toMatchObject({ surfaceId: 'arrangement', completed: run.completed, failed: run.failed });

    TestBed.resetTestingModule();
    const restored = makeDirector().service;
    expect(restored.lastDirectorRun()).toMatchObject({ surfaceId: 'arrangement', completed: run.completed, failed: run.failed });
    expect(restored.sessionEvidence({ surfaceId: 'arrangement' }).join('\n')).toContain('Last Director run: arrangement');

    restored.clearDirectorRuns();
    expect(restored.lastDirectorRun()).toBeNull();
    expect(restored.listDirectorRuns()).toEqual([]);
    expect(window.localStorage.getItem('smuve.studio.director.run-history.v1')).toBeNull();
    expect(restored.sessionEvidence({ surfaceId: 'arrangement' }).join('\n')).not.toContain('Last Director run:');
  });

  it('round-trips Director briefs and runs through the project bundle bridge', async () => {
    const { service, workspace } = makeDirector();
    workspace.metadata.set({ id: 'project-1', name: 'Test Project', key: 'C' });
    const plan = service.buildPlan({ surfaceId: 'arrangement' });
    const brief = await service.createStudioBrief(plan, { surfaceId: 'arrangement' });
    const run = await service.runPlan(plan);

    const state = service.snapshotDirectorState();
    expect(state.briefs?.[0]).toMatchObject({ surfaceId: 'arrangement', brief });
    expect(state.runs[0]).toMatchObject({ surfaceId: 'arrangement', completed: run.completed });

    service.clearDirectorRuns();
    service.restoreDirectorState(state);
    expect(service.lastDirectorRun()).toMatchObject({ surfaceId: 'arrangement', completed: run.completed });
    expect(service.listDirectorBriefs()[0]).toMatchObject({ surfaceId: 'arrangement', brief });
    expect(service.sessionEvidence({ surfaceId: 'arrangement' }).join('\n')).toContain('Latest Director brief (arrangement):');

    expect(workspace.directorStateProvider).toBeTruthy();
    expect(workspace.directorStateConsumer).toBeTruthy();
  });

  it('filters run history and surfaces repeated failures in evidence', async () => {
    const { service } = makeDirector();
    const failedRun = (startedAt: number) => ({
      surfaceId: 'export',
      startedAt,
      finishedAt: startedAt + 1,
      completed: 0,
      failed: 1,
      report: ['Check — Export the transport loop as WAV: render failed'],
      results: [{
        ok: false,
        message: 'render failed',
        durationMs: 1,
        step: { id: 'export-9', surfaceId: 'export', label: 'Export the transport loop as WAV', detail: 'throw', executable: true },
      }],
    });
    service.restoreDirectorState({
      runs: [
        failedRun(2),
        failedRun(1),
        {
          surfaceId: 'arrangement',
          startedAt: 3,
          finishedAt: 4,
          completed: 1,
          failed: 0,
          report: ['Done — ok: ok'],
          results: [{
            ok: true,
            message: 'ok',
            durationMs: 1,
            step: { id: 'arrangement-1', surfaceId: 'arrangement', label: 'ok', detail: '', executable: true },
          }],
        },
      ],
      briefs: [],
    } as any);

    expect(service.listDirectorRunsFiltered({ outcome: 'completed' }).map((run) => run.surfaceId)).toEqual(['arrangement']);
    expect(service.listDirectorRunsFiltered({ surfaceId: 'export', outcome: 'failed' }).length).toBe(2);
    expect(service.mostCommonFailure()).toEqual({ label: 'Export the transport loop as WAV', count: 2, latestMessage: 'render failed' });
  });

  it('returns an error result when a step throws', async () => {
    const { service } = makeDirector();
    const step = {
      id: 'broken',
      surfaceId: 'arrangement' as const,
      label: 'Broken step',
      detail: 'throw',
      executable: true,
      run: () => {
        throw new Error('Nope.');
      },
    };
    const result = await service.runStep(step);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Nope.');
  });

  it('uses live LLM only for the brief and falls back offline', async () => {
    const { service, ai } = makeDirector();
    ai.getAIResponse.mockResolvedValueOnce('Strategic link severed. Offline analysis continues.');
    const plan = service.buildPlan({ surfaceId: 'mixer' });
    const brief = await service.createStudioBrief(plan, { surfaceId: 'mixer', focusPrompt: 'Clean the low end.' });
    expect(brief).toContain('Focus on: Clean the low end.');
    expect(ai.getAIResponse).toHaveBeenCalledTimes(1);
  });

  it('writes generated drum, bass and melody notes for drum-machine', async () => {
    const { service, music } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'drum-machine' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(music.addTrack.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(music.addNoteToTrack).toHaveBeenCalled();
  });

  it('reports MIDI takes and selects the strongest performance take', async () => {
    const { service, takeManager, performanceRecording } = makeDirector();
    takeManager.getTakes.mockReturnValue(signal([{ id: 'take-1' }]));
    performanceRecording.takes.set([
      { id: 'perf-1', name: 'Take 1', notes: [{ midi: 60, velocity: 0.8, atMs: 0 }], peakDbL: -6, peakDbR: -6 },
      { id: 'perf-2', name: 'Take 2', notes: [{ midi: 60, velocity: 0.8, atMs: 0 }, { midi: 64, velocity: 0.9, atMs: 100 }], peakDbL: -9, peakDbR: -9 },
    ] as never);
    const plan = service.buildPlan({ surfaceId: 'performer' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('1 MIDI take');
    expect(result.message).toContain('Take 2');
    expect(performanceRecording.selectedTakeId()).toBe('perf-2');
  });

  it('syncs the engine tempo to the project tempo for Quick Session', async () => {
    const { service, workspace, engine } = makeDirector();
    workspace.metadata.set({ id: 'project-1', name: 'Test Project', bpm: 96, key: 'A' });
    expect(engine.tempo()).toBe(120);
    const plan = service.buildPlan({ surfaceId: 'quick-session' });
    const result = await service.runStep(plan.steps[1]);
    expect(result.ok).toBe(true);
    expect(engine.tempo()).toBe(96);
    expect(result.message).toContain('96 BPM');
    expect(result.message).toContain('Synced the engine tempo');
  });

  it('applies a stock song structure through the AI Copilot', async () => {
    const { service, copilot } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'arrangement' });
    const step = plan.steps.find((s) => s.id === 'arrangement-3');
    const result = await service.runStep(step!);
    expect(result.ok).toBe(true);
    expect(copilot.suggestStructure).toHaveBeenCalled();
    expect(result.message).toContain('Intro → Verse → Chorus → Outro');
  });

  it('executes a scene launch only when the scene column has content', async () => {
    const { service, music } = makeDirector({
      music: { sceneColumnCount: jest.fn(() => 2), sceneColumnHasContent: jest.fn(() => false) },
    });
    const plan = service.buildPlan({ surfaceId: 'session' });
    const result = await service.runStep(plan.steps[2]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('No scene column has pattern content');
    expect(music.launchSceneColumn).not.toHaveBeenCalled();

    music.sceneColumnHasContent.mockReturnValue(true);
    music.launchSceneColumn.mockReturnValue(3);
    const live = await service.runStep(plan.steps[2]);
    expect(live.message).toContain('Launched scene 1');
  });

  it('toggles the selected track insert chain with the bypass command', async () => {
    const { service, music } = makeDirector();
    music.selectedTrack = () => ({ id: 'track-1', name: 'Director Lead', fxSlots: [{ id: 'fx-1' }] });
    const plan = service.buildPlan({ surfaceId: 'effects-rack' });
    const result = await service.runStep(plan.steps[2]);
    expect(result.ok).toBe(true);
    expect(music.toggleAllInsertsBypass).toHaveBeenCalledWith('track-1');
  });

  it('prepares DJ key-lock and loop in one action', async () => {
    const { service, engine } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'dj' });
    const result = await service.runStep(plan.steps[1]);
    expect(result.ok).toBe(true);
    expect(engine.setDeckRate).toHaveBeenCalledWith('B', 1, true);
    expect(engine.setDeckLoop).toHaveBeenCalledWith('B', true);
  });

  it('surfaces nearest sounds and installs the closest pack when relevant', async () => {
    const { service, sounds } = makeDirector();
    const browserPlan = service.buildPlan({ surfaceId: 'sound-browser' });
    const neighbour = await service.runStep(browserPlan.steps[2]);
    expect(neighbour.message).toContain('Neighbour Sound');

    const libraryPlan = service.buildPlan({ surfaceId: 'sample-library', genre: 'pop' });
    const install = await service.runStep(libraryPlan.steps[2]);
    expect(install.message).toContain('One Pack');
    expect(sounds.installPack).toHaveBeenCalledWith('pack-1');
  });

  it('promotes the best-scoring MIDI take', async () => {
    const { service, takeManager } = makeDirector();
    takeManager.getTakes.mockReturnValue(
      signal([
        { id: 'take-a', label: 'Take A', noteCount: 12 },
        { id: 'take-b', label: 'Take B', noteCount: 24 },
      ]),
    );
    const plan = service.buildPlan({ surfaceId: 'performance' });
    const result = await service.runStep(plan.steps[2]);
    expect(result.message).toContain('Take B');
    expect(takeManager.setActiveTake).toHaveBeenCalledWith('track-1', 'take-b');
  });

  it('applies a take comp through the undoable note replacement', async () => {
    const { service, takeManager, music } = makeDirector();
    takeManager.getTakes.mockReturnValue(signal([{ id: 'take-a', noteCount: 3 }, { id: 'take-b', noteCount: 5 }]));
    takeManager.applyComp.mockReturnValue([{ id: 'n1' }, { id: 'n2' }]);
    const plan = service.buildPlan({ surfaceId: 'performer' });
    const result = await service.runStep(plan.steps[2]);
    expect(result.message).toContain('Merged 2 takes');
    expect(music.replaceTrackNotes).toHaveBeenCalledWith('track-1', [{ id: 'n1' }, { id: 'n2' }], 'Director Take Comp');
  });

  it('audits mixer mute/solo and centres the DJ crossfader', async () => {
    const { service, engine } = makeDirector();
    const mixer = service.buildPlan({ surfaceId: 'mixer' });
    const audit = await service.runStep(mixer.steps[1]);
    expect(audit.message).toContain('Mute/solo audit');

    const dj = service.buildPlan({ surfaceId: 'dj' });
    const crossfade = await service.runStep(dj.steps[2]);
    expect(crossfade.message).toContain('Crossfader centred');
    expect(engine.setCrossfader).toHaveBeenCalledWith(0.5);
  });

  it('reports Quick Session tempo/key and next move from live state', async () => {
    const { service } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'quick-session' });
    const readiness = await service.runStep(plan.steps[1]);
    expect(readiness.message).toContain('120 BPM');
    const recommendation = await service.runStep(plan.steps[2]);
    expect(recommendation.message).toContain('Recommended next move');
    expect(recommendation.message).toContain('Selected Director Lead');
  });

  it('reads the release handoff and checks chord/bass registers', async () => {
    const { service, produce } = makeDirector();
    expect(produce.releaseHandoff).toBeDefined();
    const aiPlan = service.buildPlan({ surfaceId: 'ai-produce' });
    const handoff = await service.runStep(aiPlan.steps[2]);
    expect(handoff.message).toContain('Test Release release handoff');
    expect(handoff.message).toContain('Next step:');

    const chordPlan = service.buildPlan({ surfaceId: 'chord-editor' });
    const voicing = await service.runStep(chordPlan.steps[1]);
    expect(voicing.message).toContain('Bass register');
    expect(voicing.message).toContain('chord register');
  });

  it('arms the selected track for the next recorder pass without overwriting takes', async () => {
    const { service, audioRecorder, recordingStatus } = makeDirector();
    audioRecorder.getOfflineRecordings.mockResolvedValue([{ id: 'rec-1' }]);
    const plan = service.buildPlan({ surfaceId: 'audio-recorder' });
    const result = await service.runStep(plan.steps[1]);
    expect(recordingStatus.armTrack).toHaveBeenCalledWith('track-1');
    expect(result.message).toContain('1 saved recorder take');
    expect(result.message).toContain('armed Director Lead');
    expect(result.message).toContain('without overwriting');
  });

  it('runs a mastering review bounce and reports true peak and RMS', async () => {
    const { service, offlineBounce } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'mastering' });
    const result = await service.runStep(plan.steps[1]);
    expect(result.message).toContain('Offline review bounce');
    expect(result.message).toContain('peak -1.2 dBFS');
    expect(offlineBounce.bounce).toHaveBeenCalledWith('wav-32-float');
  });

  it('audits saved recorder takes with newest duration and level', async () => {
    const { service, audioRecorder } = makeDirector();
    audioRecorder.getOfflineRecordings.mockResolvedValue([
      { id: 'rec-1', name: 'First', timestamp: 1000, settings: { durationSec: 12, level: 'ok' } },
      { id: 'rec-2', name: 'Second', timestamp: 2000, settings: { durationSec: 9, level: 'low' } },
    ]);
    const plan = service.buildPlan({ surfaceId: 'audio-recorder' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 saved recording takes');
    expect(result.message).toContain('Newest: Second (9s, level low)');
  });

  it('applies the closest Quick Session starter from the live BPM and preserves a dirty sketch', async () => {
    const { service, ideas, music, workspace } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'quick-session' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(ideas.recommend).toHaveBeenCalledWith(120);
    expect(music.applyGeneratedRecipe).toHaveBeenCalledWith(expect.objectContaining({ name: 'Neo Soul' }));
    expect(result.message).toContain('Applied the closest Quick Session starter');
    expect(result.message).toContain('Neo Soul');

    // A dirty sketch must never be replaced: the step reports instead.
    music.applyGeneratedRecipe.mockClear();
    workspace.isDirty.set(true);
    const preserved = await service.runStep(plan.steps[0]);
    expect(preserved.ok).toBe(true);
    expect(music.applyGeneratedRecipe).not.toHaveBeenCalled();
    expect(preserved.message).toContain('preserved and nothing was replaced');
  });

  it('runs a real EVOLVE-style mutation on a drum track', async () => {
    const { service, music } = makeDirector({
      music: {
        tracks: signal([
          {
            id: 'drums',
            name: 'Kit',
            type: 'drum',
            gain: 0.8,
            muted: false,
            solo: false,
            notes: [{ id: 'n1', midi: 36, step: 0, length: 1, velocity: 0.9 }],
            clips: [],
          },
        ]),
      },
    });
    music.selectedTrack = () => music.tracks().find((t: any) => t.id === 'drums') ?? null;
    const plan = service.buildPlan({ surfaceId: 'drum-machine' });
    const result = await service.runStep(plan.steps[2]);
    expect(result.ok).toBe(true);
    expect(music.replaceTrackNotes).toHaveBeenCalled();
    expect(result.message).toContain('Evolved Kit');
  });

  it('audits duplicate channel roles without silently reassigning sounds', async () => {
    const { service } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'channel-rack' });
    const result = await service.runStep(plan.steps[2]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('channel roles audited');
  });

  it('reads vocal guidance and checks the synth register', async () => {
    const { service, vocal } = makeDirector();
    vocal.currentAdvice.set('Peak is safe; try a lighter breath before the chorus.');
    const vocalPlan = service.buildPlan({ surfaceId: 'vocal-suite' });
    const vocalResult = await service.runStep(vocalPlan.steps[0]);
    expect(vocalResult.ok).toBe(true);
    expect(vocalResult.message).toContain('Latest Vocal AI guidance');

    const synthPlan = service.buildPlan({ surfaceId: 'synthesizer' });
    const synthResult = await service.runStep(synthPlan.steps[1]);
    expect(synthResult.ok).toBe(true);
    expect(synthResult.message).toContain('Synth register');
  });

  it('completes rendering, mastering, polish, measurement, encode and download for Export', async () => {
    const { service, exportService } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'export' });
    const mastering = await service.runStep(plan.steps[0]);
    expect(mastering.ok).toBe(true);
    const result = await service.runStep(plan.steps[1]);
    expect(result.ok).toBe(true);
    expect(exportService.renderProjectOffline).toHaveBeenCalledWith({ sampleRate: 44100, preMaster: true });
    expect(exportService.masterRetainedMix).toHaveBeenCalled();
    expect(exportService.applySmuvePolish).toHaveBeenCalled();
    expect(exportService.analyzeBuffer).toHaveBeenCalled();
    expect(exportService.exportToFormat).toHaveBeenCalledWith(expect.anything(), 'wav24');
    expect(exportService.downloadBlob).toHaveBeenCalled();
    expect(result.message).toContain('Complete delivery export downloaded');
  });

  it('applies vocal polish only after real vocal guidance exists', async () => {
    const { service, vocal, vocalMastering } = makeDirector();
    const blocked = await service.runStep(service.buildPlan({ surfaceId: 'vocal-suite' }).steps[2]);
    expect(blocked.ok).toBe(false);
    expect(vocalMastering.updateParams).not.toHaveBeenCalled();

    vocal.currentAdvice.set('The take is clean; polish the vocal chain now.');
    const result = await service.runStep(service.buildPlan({ surfaceId: 'vocal-suite' }).steps[2]);
    expect(result.ok).toBe(true);
    expect(vocalMastering.updateParams).toHaveBeenCalledWith(expect.objectContaining({
      deesser: expect.objectContaining({ bypass: false, frequency: 6500 }),
      limiter: expect.objectContaining({ ceiling: -0.5, bypass: false }),
    }));
    expect(result.message).toContain('conservative vocal polish');
  });

  it('reports the tuner reference from the pitch utilities', async () => {
    const { service } = makeDirector();
    const result = await service.runStep(service.buildPlan({ surfaceId: 'tuner' }).steps[0]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('A4 440 Hz');
    expect(result.message).toContain('±5 cents');
    expect(result.message).toContain('C4 around 261.6 Hz');
  });

  it('arms the next performance take and performer slot', async () => {
    const { service, performanceRecording } = makeDirector();
    performanceRecording.takes.set([{ id: 'take-1' }]);
    const performance = await service.runStep(service.buildPlan({ surfaceId: 'performance' }).steps[1]);
    expect(performance.ok).toBe(true);
    expect(performanceRecording.arm).toHaveBeenCalledWith(2);
    const performer = await service.runStep(service.buildPlan({ surfaceId: 'performer' }).steps[1]);
    expect(performer.ok).toBe(true);
    expect(performer.message).toContain('Armed take 2');
  });

  it('writes chord pad, bass and top-line parts from the generator framework', async () => {
    const { service, music } = makeDirector();
    const result = await service.runStep(service.buildPlan({ surfaceId: 'chord-editor' }).steps[2]);
    expect(result.ok).toBe(true);
    expect(music.replaceTrackNotes).toHaveBeenCalledTimes(3);
    expect(music.replaceTrackNotes.mock.calls.map((call) => call[2])).toEqual([
      'Director Chord Parts',
      'Director Chord Parts',
      'Director Chord Parts',
    ]);
    expect(result.message).toContain('top-line notes');
  });

  it('slices a selected imported sample on measured transients', async () => {
    const sampleRate = 48000;
    const data = new Float32Array(sampleRate);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = (t >= 0.4 && t < 0.6) || (t >= 0.8 && t < 0.95) ? 0.8 : 0;
    }
    const fakeBuffer = {
      numberOfChannels: 1,
      length: sampleRate,
      sampleRate,
      duration: 1,
      getChannelData: () => data,
    };
    const { service, music, audioImport, samplerState } = makeDirector();
    audioImport.selectedAudio.set({ name: 'break', buffer: fakeBuffer });
    const result = await service.runStep(service.buildPlan({ surfaceId: 'sampler' }).steps[1]);
    expect(result.ok).toBe(true);
    expect(music.addClipToTrack).toHaveBeenCalled();
    expect(samplerState.loadSlices).toHaveBeenCalled();
    expect(music.stemAudioCache.size).toBeGreaterThan(1);
    expect(result.message).toContain('shared Sampler pads');
  });

  it('exports stems, MIDI, DAWproject and bundle delivery formats from the Export plan', async () => {
    const { service, exportService, workspace } = makeDirector();
    workspace.metadata.set({ id: 'project-1', name: 'Test Project', key: 'C' });
    const plan = service.buildPlan({ surfaceId: 'export' });
    expect(plan.steps.map((step) => step.label)).toContain('Export stems');
    expect(plan.steps.map((step) => step.label)).toContain('Export MIDI');
    expect(plan.steps.map((step) => step.label)).toContain('Export DAWproject');
    expect(plan.steps.map((step) => step.label)).toContain('Export project bundle');
    expect(plan.steps.map((step) => step.label)).toContain('Export the transport loop as WAV');
    expect(plan.steps.map((step) => step.label)).toContain('Export the transport loop as MP3');
    expect(plan.steps.map((step) => step.label)).toContain('Check stems readiness before exporting stems');
    expect(plan.steps.map((step) => step.label)).toContain('Check automation coverage for export');

    // Stems readiness runs before the stem render and renders nothing.
    const readiness = await service.runStep(plan.steps[2]);
    expect(readiness.ok).toBe(true);
    expect(readiness.message).toContain('Stems readiness');
    expect(exportService.exportStems).not.toHaveBeenCalled();

    // Automation coverage runs before any render and renders nothing.
    const automationStep = await service.runStep(plan.steps[3]);
    expect(automationStep.ok).toBe(true);
    expect(automationStep.message).toContain('Automation:');
    expect(automationStep.message).toContain('Director Lead volume: 2 points');
    expect(automationStep.message).toContain('project bundle carries the full automation snapshot');
    expect(automationStep.message).toContain('MIDI and DAWproject interchange drop automation curves');
    expect(exportService.exportStems).not.toHaveBeenCalled();

    const stems = await service.runStep(plan.steps[4]);
    expect(stems.ok).toBe(true);
    expect(exportService.exportStems).toHaveBeenCalled();
    expect(stems.message).toContain('stems ZIP');

    const midi = await service.runStep(plan.steps[5]);
    expect(midi.ok).toBe(true);
    expect(exportService.exportProjectMidi).toHaveBeenCalled();
    expect(exportService.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringContaining('_Director_MIDI_'));

    const dawproject = await service.runStep(plan.steps[6]);
    expect(dawproject.ok).toBe(true);
    expect(exportService.exportDawproject).toHaveBeenCalled();
    expect(exportService.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringContaining('_Director_DAWproject_'));

    const bundle = await service.runStep(plan.steps[7]);
    expect(bundle.ok).toBe(true);
    expect(workspace.downloadProjectBundle).toHaveBeenCalled();
    expect(bundle.message).toContain('Test Project');

    exportService.exportLoopWav.mockResolvedValueOnce({
      blob: new Blob(['loop']),
      filename: 'Test_Project_Director_Loop_1-16_wav24_123.wav',
      format: 'wav24',
      extension: 'wav',
      bitrate: 0,
      startStep: 0,
      endStep: 16,
      durationSec: 2,
      sampleRate: 44100,
      metadata: { startStep: 0, endStep: 16, startBar: 1, endBar: 1, bpm: 120, format: 'wav24' },
    }).mockResolvedValueOnce({
      blob: new Blob(['loop'], { type: 'audio/mpeg' }),
      filename: 'Test_Project_Director_Loop_1-16_mp3_456.mp3',
      format: 'mp3',
      extension: 'mp3',
      bitrate: 192_000,
      startStep: 0,
      endStep: 16,
      durationSec: 2,
      sampleRate: 44100,
      metadata: { startStep: 0, endStep: 16, startBar: 1, endBar: 1, bpm: 120, format: 'mp3' },
    });

    const loop = await service.runStep(plan.steps[8]);
    expect(loop.ok).toBe(true);
    expect(exportService.exportLoopWav).toHaveBeenCalledWith({ format: 'wav24' });
    expect(loop.message).toContain('Test_Project_Director_Loop_1-16_wav24_123.wav');
    expect(loop.message).toContain('(wav24)');
    expect(loop.message).toContain('steps 1-16');
    expect(loop.message).toContain('2.00s');

    const loopMp3 = await service.runStep(plan.steps.find((step) => step.label === 'Export the transport loop as MP3')!);
    expect(loopMp3.ok).toBe(true);
    expect(exportService.exportLoopWav).toHaveBeenCalledWith({ format: 'mp3' });
    expect(loopMp3.message).toContain('Test_Project_Director_Loop_1-16_mp3_456.mp3');
    expect(loopMp3.message).toContain('(mp3)');
  });

  it('exports the score as MusicXML and opens the print/PDF dialog from the Score plan', async () => {
    const { service, exportService } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'score' });
    expect(plan.steps.map((step) => step.label)).toContain('Export the score as MusicXML');
    expect(plan.steps.map((step) => step.label)).toContain('Open the score print/PDF dialog');

    const musicXml = await service.runStep(plan.steps.find((step) => step.label === 'Export the score as MusicXML')!);
    expect(musicXml.ok).toBe(true);
    expect(exportService.downloadBlob).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/vnd.recordare.musicxml+xml' }), 'test-project.musicxml');
    expect(musicXml.message).toContain('1 parts, 1 notes');

    const print = jest.fn();
    Object.defineProperty(window, 'print', { value: print, configurable: true });
    const printStep = await service.runStep(plan.steps.find((step) => step.label === 'Open the score print/PDF dialog')!);
    expect(printStep.ok).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
    expect(printStep.message).toContain('Save as PDF');
  });

  it('measures tuner reads from the selected recorded clip', async () => {
    const sampleRate = 48000;
    const data = new Float32Array(sampleRate);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 0.5;
    const buffer = {
      numberOfChannels: 1,
      length: sampleRate,
      sampleRate,
      duration: 1,
      getChannelData: () => data,
    };
    const { service, music } = makeDirector();
    music.selectedTrack = () => ({
      id: 'track-1',
      name: 'Director Lead',
      type: 'audio',
      clips: [{ id: 'clip-1', name: 'Recorded A', type: 'audio', audioData: buffer }],
    });
    const step = service.buildPlan({ surfaceId: 'tuner' }).steps.find((s) => s.label === 'Measure tuner reads from a recorded clip')!;
    const result = await service.runStep(step);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Tuner read on Director Lead');
    expect(result.message).toContain('A4');
  });

  it('restores a persisted checkpoint as an undoable edit', async () => {
    const checkpoint = { id: 'cp-1', label: 'Before drums' };
    const bundle = { metadata: { id: 'project-1', key: 'C' }, tracks: [] };
    const before = { metadata: { id: 'project-1', key: 'C' }, tracks: [{ id: 'live' }] };
    const { service, workspace, history, sessionHistory } = makeDirector();
    workspace.metadata.set({ id: 'project-1', key: 'C' });
    workspace.createSnapshot.mockReturnValue(before);
    sessionHistory.checkpoints.mockReturnValue([checkpoint]);
    sessionHistory.materializeSnapshot.mockReturnValue(bundle);

    const message = await service.restoreCheckpoint();
    expect(message).toContain('Restored checkpoint Before drums');
    expect(history.execute).toHaveBeenCalledWith(expect.objectContaining({ name: 'Restore checkpoint Before drums' }));
    expect(workspace.restoreFromSnapshot).toHaveBeenCalledWith(bundle);
  });

  it('lists checkpoints newest-first and exports a full-bundle checkpoint as .smuve', async () => {
    const older = { id: 'cp-1', label: 'Start', at: 1000, isFullSnapshot: true };
    const newer = { id: 'cp-2', label: 'Before drums', at: 2000, isFullSnapshot: false };
    const bundle = {
      metadata: { id: 'project-1', name: 'Test Project', key: 'C' },
      tracks: [{ id: 'track-1' }],
      audioAssets: [],
      automation: {},
      mixState: {},
      notes: '',
      exportedAt: 2000,
    };
    const { service, workspace, sessionHistory, exportService } = makeDirector();
    workspace.metadata.set({ id: 'project-1', name: 'Test Project', key: 'C' });
    sessionHistory.checkpoints.mockReturnValue([older, newer]);
    sessionHistory.materializeSnapshot.mockReturnValue(bundle);

    const listed = service.listCheckpoints();
    expect(listed.map((entry) => entry.id)).toEqual(['cp-2', 'cp-1']);
    expect(listed[0]).toMatchObject({ label: 'Before drums', hasBundle: true });
    expect(listed[0].detail).toContain('1 track');

    const message = service.exportCheckpointBundle('cp-2');
    expect(exportService.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringContaining('_Director_Checkpoint_Before_drums_'));
    expect(message).toContain('Exported checkpoint Before drums');
  });

  it('exports the open project bundle and imports a bundle as an undoable edit', async () => {
    const { service, workspace, history } = makeDirector();
    workspace.metadata.set({ id: 'project-1', name: 'Test Project', key: 'C' });

    const exported = service.exportProjectBundle();
    expect(workspace.downloadProjectBundle).toHaveBeenCalled();
    expect(exported).toContain('Test Project');

    const bundle = { metadata: { id: 'project-2', name: 'Imported Set' }, tracks: [] } as never;
    const before = { metadata: { id: 'project-1', name: 'Test Project' }, tracks: [] };
    workspace.createSnapshot.mockReturnValue(before);
    const message = await service.importProjectBundle(bundle);
    expect(workspace.importProjectBundle).toHaveBeenCalledWith(bundle);
    expect(history.execute).toHaveBeenCalledWith(expect.objectContaining({ name: 'Import project bundle Imported Set' }));
    expect(message).toContain('Imported project bundle Imported Set');
  });

  it('opens, reads and stops the shared live tuner input', async () => {
    const { service, tunerLive } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'tuner' });
    const open = plan.steps.find((step) => step.label === 'Open the live tuner input')!;
    const read = plan.steps.find((step) => step.label === 'Read the live tuner input')!;
    const stop = plan.steps.find((step) => step.label === 'Stop the live tuner input')!;

    tunerLive.start.mockImplementation(async () => {
      tunerLive.listening.set(true);
    });
    const opened = await service.runStep(open);
    expect(opened.ok).toBe(true);
    expect(tunerLive.start).toHaveBeenCalled();
    expect(opened.message).toContain('USB Interface');

    tunerLive.reading.set({ note: 'A', octave: 4, cents: 2, frequency: 440.5, midi: 69, inTune: true });
    const readResult = await service.runStep(read);
    expect(readResult.ok).toBe(true);
    expect(readResult.message).toContain('A4');
    expect(readResult.message).toContain('in tune');

    const stopped = await service.runStep(stop);
    expect(stopped.ok).toBe(true);
    expect(tunerLive.stop).toHaveBeenCalled();
    expect(stopped.message).toContain('stopped');
  });

  it('reads channel meters, snapshots bus/VCA state and checks stems readiness on the Mixer plan', async () => {
    const { service, engine, vcaBuses } = makeDirector();
    const plan = service.buildPlan({ surfaceId: 'mixer' });
    expect(plan.steps.map((step) => step.label)).toContain('Read the channel meters');
    expect(plan.steps.map((step) => step.label)).toContain('Snapshot the bus routing and VCA state');
    expect(plan.steps.map((step) => step.label)).toContain('Check stems readiness for delivery');

    const meters = await service.runStep(plan.steps.find((step) => step.label === 'Read the channel meters')!);
    expect(meters.ok).toBe(true);
    expect(engine.getTrackLevel).toHaveBeenCalledWith('track-1');
    expect(meters.message).toContain('Director Lead peak 0.42');
    expect(meters.message).toContain('momentary -12.4 dBFS');
    expect(meters.message).toContain('transport stopped');
    expect(meters.message).toContain('No channel is clipping');

    engine.isPlaying.set(true);
    const liveMeters = await service.runStep(plan.steps.find((step) => step.label === 'Read the channel meters')!);
    expect(liveMeters.message).toContain('transport playing');

    const snapshot = await service.runStep(plan.steps.find((step) => step.label === 'Snapshot the bus routing and VCA state')!);
    expect(snapshot.ok).toBe(true);
    expect(vcaBuses.trackIdsForBus).toHaveBeenCalledWith('vca-1');
    expect(snapshot.message).toContain('Bus snapshot');
    expect(snapshot.message).toContain('VCA 1 at 90%');
    expect(snapshot.message).toContain('Master fader 80%');

    const stems = await service.runStep(plan.steps.find((step) => step.label === 'Check stems readiness for delivery')!);
    expect(stems.ok).toBe(true);
    expect(stems.message).toContain('1 of 1 tracks will be rendered');
  });

  it('reports muted tracks as skipped by stems readiness', async () => {
    const { service, music } = makeDirector();
    music.tracks.set([
      { id: 'track-1', name: 'Director Lead', type: 'midi', muted: false, soloed: false, notes: [], clips: [] },
      { id: 'track-2', name: 'Quiet Pad', type: 'midi', muted: true, soloed: false, notes: [], clips: [] },
      { id: 'bus-1', name: 'Group 1', type: 'bus', muted: false, soloed: false, notes: [], clips: [] },
    ]);
    const plan = service.buildPlan({ surfaceId: 'mixer' });
    const stems = await service.runStep(plan.steps.find((step) => step.label === 'Check stems readiness for delivery')!);
    expect(stems.ok).toBe(true);
    expect(stems.message).toContain('1 of 3 tracks will be rendered');
    expect(stems.message).toContain('Muted tracks skipped: Quiet Pad');
    expect(stems.message).toContain('Bus tracks are not stems: Group 1');
  });

  it('verifies the live microphone on this device without opening it', async () => {
    const { service, tunerLive } = makeDirector();
    const step = service.buildPlan({ surfaceId: 'tuner' }).steps.find((s) => s.label === 'Verify the live microphone on this device')!;
    expect(step.executable).toBe(true);
    const result = await service.runStep(step);
    expect(result.ok).toBe(true);
    expect(tunerLive.verifyDevice).toHaveBeenCalled();
    expect(tunerLive.start).not.toHaveBeenCalled();
    expect(result.message).toContain('capture supported');
    expect(result.message).toContain('1 audio input exposed');
    expect(result.message).toContain('permission granted');
    expect(result.message).toContain('tuner stream idle');
  });

  it('checks the same tuning reference across recorded takes', async () => {
    const sampleRate = 48000;
    const sine = (frequency: number) => {
      const data = new Float32Array(sampleRate);
      for (let i = 0; i < data.length; i++) data[i] = Math.sin(2 * Math.PI * frequency * (i / sampleRate)) * 0.5;
      return { numberOfChannels: 1, length: sampleRate, sampleRate, duration: 1, getChannelData: () => data };
    };
    const { service, music } = makeDirector();
    music.tracks.set([
      { id: 'vo1', name: 'Vocal Take 1', type: 'audio', muted: false, soloed: false, notes: [], clips: [{ id: 'c1', name: 'Vocal 1', type: 'audio', audioData: sine(440) }] },
      { id: 'vo2', name: 'Vocal Take 2', type: 'audio', muted: false, soloed: false, notes: [], clips: [{ id: 'c2', name: 'Vocal 2', type: 'audio', audioData: sine(440) }] },
    ]);
    const step = service.buildPlan({ surfaceId: 'tuner' }).steps.find((s) => s.label === 'Check the same tuning reference across takes')!;
    expect(step.executable).toBe(true);
    const result = await service.runStep(step);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Same reference across takes');
    expect(result.message).toContain('Vocal Take 1');
    expect(result.message).toContain('Vocal Take 2');
    expect(result.message).toContain('every checked take agrees');
  });

  it('reads automation lanes on the Arrangement plan and automation coverage on Export', async () => {
    const { service } = makeDirector();
    const arrangementStep = service.buildPlan({ surfaceId: 'arrangement' }).steps.find((s) => s.label === 'Read the automation lanes')!;
    expect(arrangementStep.executable).toBe(true);
    const arrangementResult = await service.runStep(arrangementStep);
    expect(arrangementResult.ok).toBe(true);
    expect(arrangementResult.message).toContain('1 of 2 lanes enabled');
    expect(arrangementResult.message).toContain('Director Lead volume: 2 points, linear');
    expect(arrangementResult.message).toContain('1 disabled, 1 empty');
    expect(arrangementResult.message).toContain('1 of 1 modulation sources enabled');
    expect(arrangementResult.message).toContain('1 performance macros');
    expect(arrangementResult.message).toContain('write mode touch');
    expect(arrangementResult.message).toContain('offline mixdowns and stems bake enabled lanes');
  });

  it('measures the selected vocal take from its recorded clip', async () => {
    const sampleRate = 48000;
    const data = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate; i++) data[i] = Math.sin(2 * Math.PI * 220 * (i / sampleRate)) * 0.5;
    const buffer = { numberOfChannels: 1, length: sampleRate, sampleRate, duration: 1, getChannelData: () => data };
    const { service, music } = makeDirector();
    music.selectedTrack = () => ({
      id: 'track-1',
      name: 'Director Lead',
      type: 'vocal',
      clips: [{ id: 'clip-1', name: 'Vocal Pass', type: 'audio', audioData: buffer }],
    });
    const step = service.buildPlan({ surfaceId: 'vocal-suite' }).steps.find((s) => s.label === 'Measure the selected vocal take')!;
    expect(step.executable).toBe(true);
    const result = await service.runStep(step);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Measured vocal take on Director Lead');
    expect(result.message).toContain('peak');
    expect(result.message).toContain('RMS');
    expect(result.message).toContain('crest');
  });

  it('falls back to the latest vocal guidance when the selected track has no recorded clip', async () => {
    const { service, vocal } = makeDirector();
    vocal.currentAdvice.set('HIGH-PASS AT 80HZ.');
    const step = service.buildPlan({ surfaceId: 'vocal-suite' }).steps.find((s) => s.label === 'Measure the selected vocal take')!;
    const result = await service.runStep(step);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Latest Vocal AI guidance: HIGH-PASS AT 80HZ.');
  });

  it('deletes the selected track through the undoable command and restores it through history', async () => {
    const { service, music, history } = makeDirector();
    const deleted = service.deleteSelectedTrack();
    expect(music.removeTrack).toHaveBeenCalledWith('track-1');
    expect(deleted).toContain('Undo to restore');

    const undone = service.restoreLastDeletedState();
    expect(history.undo).toHaveBeenCalled();
    expect(undone).toContain('Remove Track · Test Track');
  });
});
