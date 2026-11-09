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
    ...overrides.music,
  };
  const engine = {
    tempo: signal(120),
    masterGainValue: signal(0.8),
    metronomeEnabled: signal(false),
    isPlaying: signal(false),
    setDeckGain: jest.fn(),
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
    ...overrides.produce,
  };
  const scale = {
    detectKeyAndScale: jest.fn().mockReturnValue({ key: 'C', scale: 'major', confidence: 0.9 }),
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
  const takeManager = { getTakes: jest.fn().mockReturnValue(signal([])), ...overrides.takeManager };
  const audioRecorder = { getOfflineRecordings: jest.fn().mockResolvedValue([]), ...overrides.audioRecorder };
  const vocal = { currentAdvice: signal(''), ...overrides.vocal };

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
    ],
  });
  return { service: TestBed.inject(StudioAiDirectorService), music, engine, ai, beat, mix, sounds, workspace, telemetry, takeManager, audioRecorder };
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

  it('counts saved recorder takes', async () => {
    const { service, audioRecorder } = makeDirector();
    audioRecorder.getOfflineRecordings.mockResolvedValue([{ id: 'rec-1' }, { id: 'rec-2' }]);
    const plan = service.buildPlan({ surfaceId: 'audio-recorder' });
    const result = await service.runStep(plan.steps[0]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 saved recording takes');
  });
});
