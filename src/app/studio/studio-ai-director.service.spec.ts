import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { StudioAiDirectorService } from './studio-ai-director.service';
import { STUDIO_SURFACES } from './studio-surfaces';
import { AiService } from '../services/ai.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiBeatGeneratorService } from '../services/ai-beat-generator.service';
import { AiProduceService } from '../services/ai-produce.service';
import { ScaleDetectionService } from '../services/scale-detection.service';
import { VocalAiService } from '../services/vocal-ai.service';
import { LoggingService } from '../services/logging.service';
import { NeuralMixerService } from '../services/neural-mixer.service';
import { TakeManagerService } from '../services/take-manager.service';
import { AiMixAssistantService } from './effects/ai-mix-assistant.service';
import { SmartSoundService } from './smart-sound.service';
import { SmartProductionFoundationsService } from './smart-production-foundations.service';
import { StudioTelemetryService } from './studio-telemetry.service';
import { ProjectWorkspaceService } from './project-workspace.service';
import { AudioRecorderService } from './audio-recorder.service';
import { AiCopilotService } from './ai-copilot.service';
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
    addNoteToTrack: jest.fn((trackId: string, note: unknown) => {
      tracks.update((current) =>
        current.map((t) => (t.id === trackId ? { ...t, notes: [...t.notes, note] } : t)),
      );
    }),
    humanizeTrack: jest.fn(),
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
    ...overrides.music,
  };
  const engine = {
    tempo: signal(120),
    masterGainValue: signal(0.8),
    metronomeEnabled: signal(false),
    isPlaying: signal(false),
    setDeckGain: jest.fn(),
    setDeckRate: jest.fn(),
    setDeckLoop: jest.fn(),
    setCrossfader: jest.fn(),
    ...overrides.engine,
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
    metadata: signal(null),
    updateMetadata: jest.fn(),
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
      { provide: LoggingService, useValue: logger },
      { provide: NeuralMixerService, useValue: neural },
      { provide: TakeManagerService, useValue: takeManager },
      { provide: AiMixAssistantService, useValue: mix },
      { provide: SmartSoundService, useValue: sounds },
      { provide: SmartProductionFoundationsService, useValue: foundations },
      { provide: StudioTelemetryService, useValue: telemetry },
      { provide: ProjectWorkspaceService, useValue: workspace },
      { provide: AudioRecorderService, useValue: audioRecorder },
      { provide: AiCopilotService, useValue: copilot },
      { provide: OfflineBounceService, useValue: offlineBounce },
    ],
  });
  return { service: TestBed.inject(StudioAiDirectorService), music, engine, ai, beat, mix, sounds, workspace, telemetry, takeManager, audioRecorder, copilot, offlineBounce, scale, produce };
}

describe('StudioAiDirectorService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
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

  it('counts MIDI takes from the Take Manager', async () => {
    const { service, takeManager } = makeDirector();
    takeManager.getTakes.mockReturnValue(signal([{ id: 'take-1' }]));
    const plan = service.buildPlan({ surfaceId: 'performer' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('1 MIDI take');
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

  it('reports recorder pass readiness without overwriting existing takes', async () => {
    const { service, audioRecorder } = makeDirector();
    audioRecorder.getOfflineRecordings.mockResolvedValue([{ id: 'rec-1' }]);
    const plan = service.buildPlan({ surfaceId: 'audio-recorder' });
    const result = await service.runStep(plan.steps[1]);
    expect(result.message).toContain('1 saved recorder take');
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

  it('counts saved recorder takes', async () => {
    const { service, audioRecorder } = makeDirector();
    audioRecorder.getOfflineRecordings.mockResolvedValue([{ id: 'rec-1' }, { id: 'rec-2' }]);
    const plan = service.buildPlan({ surfaceId: 'audio-recorder' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 saved recording takes');
  });
});
