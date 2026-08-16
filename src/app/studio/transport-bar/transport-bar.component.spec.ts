import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TransportBarComponent } from './transport-bar.component';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { ExportService } from '../../services/export.service';
import { RecordingStatusService } from '../recording-status.service';
import { IdeasGeneratorService } from '../../services/ideas-generator.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { TakeManagerService } from '../../services/take-manager.service';
import { SnackbarService } from '../../services/snackbar.service';
import { ProjectService } from '../../services/project.service';
import { HapticService } from '../../services/haptic.service';
import { HistoryService } from '../../services/history.service';
import { createMockHapticService } from '../../testing/mocks/hardware.mock';

describe('TransportBarComponent', () => {
  let component: TransportBarComponent;
  let fixture: ComponentFixture<TransportBarComponent>;

  const playbackState = signal<'stopped' | 'playing' | 'recording'>('stopped');
  const mockAudioSession = {
    playbackState,
    isPlaying: computed(() => playbackState() === 'playing'),
    isRecording: computed(() => playbackState() === 'recording'),
    isStopped: computed(() => playbackState() === 'stopped'),
    masterVolume: signal(80),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
    stop: jest.fn(),
    updateMasterVolume: jest.fn(),
  };

  const mockAudioEngine = {
    visualStep: signal(0),
    tempo: signal(120),
    metronomeEnabled: signal(false),
    outputPeak: signal(0),
    outputRms: signal(0),
    outputLevelDb: () => -60,
    outputProfileLabel: signal('FLAT'),
    monitorBlend: signal(0.5),
    playMode: () => 'pattern',
    externalOutputActive: () => false,
    outputDeviceName: () => 'Default',
    supportsSinkId: () => false,
    outputDevices: () => [] as { deviceId: string; label: string }[],
    selectedOutputDeviceId: () => '',
    setOutputDevice: jest.fn(async () => true),
    resume: jest.fn(),
    startCountIn: jest.fn(),
    toggleMetronome: jest.fn(),
    setMetronomeVolume: jest.fn(),
    getContext: jest.fn(() => null),
    masterGain: {},
  };

  const mockRecordingStatus = {
    masterLevelLinear: signal(0),
    masterPeakHoldLinear: signal(0),
    recordingLabel: signal(''),
  };

  const mockIdeas = {
    recipes: [] as unknown[],
    applyGeneratedRecipe: jest.fn(),
  };

  const mockMusicManager = {
    selectedTrackId: () => null,
    selectedTrack: () => null,
    applyGeneratedRecipe: jest.fn(),
    projectName: 'Test Project',
    tracks: () => [] as unknown[],
    snapshotProject: jest.fn(() => ({})),
  };

  const mockTakeManager = {
    isPunchIn: (id: string) => signal(false),
    getTakes: (id: string) => signal([] as unknown[]),
    setPunchIn: jest.fn(),
    stampTake: jest.fn(() => ({ startStep: 0, endStep: 15 })),
  };

  const mockSnackbar = {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    show: jest.fn(),
  };

  const mockHistory = {
    canUndo: signal(false),
    canRedo: signal(false),
    undoCount: signal(0),
    redoCount: signal(0),
    lastActionName: signal(''),
    undo: jest.fn(),
    redo: jest.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransportBarComponent, CommonModule, FormsModule],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: ExportService, useValue: { exportProjectWav: jest.fn(), exportProjectMidi: jest.fn(), downloadBlob: jest.fn(), exportAndShare: jest.fn(), shareMidi: jest.fn() } },
        { provide: RecordingStatusService, useValue: mockRecordingStatus },
        { provide: IdeasGeneratorService, useValue: mockIdeas },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: TakeManagerService, useValue: mockTakeManager },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: ProjectService, useValue: { currentProject: () => null } },
        { provide: HapticService, useValue: createMockHapticService() },
        { provide: HistoryService, useValue: mockHistory },
      ],
    }).compileComponents();

    // Reset module-level mock signals so tests stay isolated (the pulse test
    // flips playbackState to 'playing' and must not leak into later tests).
    playbackState.set('stopped');
    mockAudioEngine.tempo.set(120);
    mockAudioEngine.visualStep.set(0);
    jest.clearAllMocks();

    fixture = TestBed.createComponent(TransportBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Stage 2.0 position readout', () => {
    it('maps the engine step to Bar : Beat : Sixteenth in 4/4', () => {
      // Step 25 → bar 2 (16 steps/bar), beat 3, sixteenth 2.
      mockAudioEngine.visualStep.set(25);
      expect(component.positionReadout()).toEqual({
        bar: 2,
        beat: 3,
        sixteenth: 2,
      });
    });

    it('starts at bar 1, beat 1, sixteenth 1', () => {
      mockAudioEngine.visualStep.set(0);
      expect(component.positionReadout()).toEqual({
        bar: 1,
        beat: 1,
        sixteenth: 1,
      });
    });

    it('clamps negative playhead values to the start of the bar', () => {
      mockAudioEngine.visualStep.set(-4);
      expect(component.positionReadout()).toEqual({
        bar: 1,
        beat: 1,
        sixteenth: 1,
      });
    });

    it('exposes the 4/4 time signature chip', () => {
      expect(component.timeSignature).toBe('4/4');
    });
  });

  describe('pulse state', () => {
    it('adds the is-playing class to the shell while transport rolls', () => {
      const shell: HTMLElement =
        fixture.nativeElement.querySelector('.ctb-shell');
      expect(shell.classList.contains('is-playing')).toBe(false);

      playbackState.set('playing');
      fixture.detectChanges();

      expect(shell.classList.contains('is-playing')).toBe(true);
    });
  });

  describe('tap tempo', () => {
    it('sets the tempo from measured tap intervals', () => {
      const nowSpy = jest.spyOn(performance, 'now');
      nowSpy.mockReturnValueOnce(1_000);
      component.tapTempo();
      nowSpy.mockReturnValueOnce(1_500); // 500 ms → 120 BPM
      component.tapTempo();

      expect(mockAudioEngine.tempo()).toBe(120);
      nowSpy.mockRestore();
    });

    it('clamps wild guesses to 40–240 BPM', () => {
      const nowSpy = jest.spyOn(performance, 'now');
      nowSpy.mockReturnValueOnce(1_000);
      component.tapTempo();
      nowSpy.mockReturnValueOnce(1_010); // 10 ms → 6000 BPM → clamped to 240
      component.tapTempo();

      expect(mockAudioEngine.tempo()).toBe(240);
      nowSpy.mockRestore();
    });
  });

  describe('count-in', () => {
    it('starts an audible count-in instead of instant play when armed', () => {
      component.countInBars.set(1);
      component.togglePlay();

      expect(mockAudioEngine.resume).toHaveBeenCalled();
      expect(mockAudioEngine.startCountIn).toHaveBeenCalledWith(1);
      expect(playbackState()).toBe('playing');
    });
  });

  describe('dB readouts', () => {
    it('formats negative infinity, unity and over-zero levels', () => {
      expect(component.formatDb(-Infinity)).toBe('−∞');
      expect(component.formatDb(0)).toBe('0.0');
      expect(component.formatDb(1.5)).toBe('+1.5');
    });
  });
});
