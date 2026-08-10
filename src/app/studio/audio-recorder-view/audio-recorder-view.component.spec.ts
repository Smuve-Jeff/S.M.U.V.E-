import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { AudioRecorderViewComponent } from './audio-recorder-view.component';
import { AudioRecorderService } from '../audio-recorder.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';
import { LoggingService } from '../../services/logging.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';

describe('AudioRecorderViewComponent', () => {
  let component: AudioRecorderViewComponent;
  let fixture: ComponentFixture<AudioRecorderViewComponent>;

  const mockRecorder = {
    isRecording: signal(false),
    getOfflineRecordings: jest.fn().mockResolvedValue([]),
    startRecording: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn(),
    revokeRecordingUrl: jest.fn(),
  };

  const mockHaptic = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };
  const mockSnackbar = {
    success: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    system: jest.fn(),
  };
  const mockAudioEngine = {
    resume: jest.fn(),
    ctx: new (window as any).AudioContext(),
  };

  const mockDialog = {
    confirm: jest.fn().mockResolvedValue(true),
  };
  const mockMusicManager = {
    ensureTrack: jest.fn(),
    addAudioTrack: jest.fn(),
    selectedTrackId: signal<string | null>(null),
    setInstrument: jest.fn(),
    importAudio: jest.fn(),
  };

  const rec = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'rec_1',
    name: 'Take One',
    timestamp: 1000,
    durationSec: 5,
    url: 'blob:rec_1',
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AudioRecorderViewComponent],
      providers: [
        { provide: AudioRecorderService, useValue: mockRecorder },
        { provide: HapticService, useValue: mockHaptic },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: LoggingService, useValue: mockLogger },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: InteractionDialogService, useValue: mockDialog },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AudioRecorderViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('maps dBFS input levels to a 0-100 percentage', () => {
    expect(component.levelToPct(-60)).toBe(0);
    expect(component.levelToPct(-30)).toBe(50);
    expect(component.levelToPct(0)).toBe(100);
    expect(component.levelToPct(-999)).toBe(0);
    expect(component.levelToPct(NaN)).toBe(0);
  });

  it('formats elapsed seconds as mm:ss', () => {
    expect(component.formatTime(0)).toBe('00:00');
    expect(component.formatTime(65)).toBe('01:05');
    expect(component.formatTime(125)).toBe('02:05');
  });

  it('formats take ages as relative time', () => {
    expect(component.formatTakeAge(Date.now() - 30_000)).toBe('30s ago');
    expect(component.formatTakeAge(Date.now() - 120_000)).toBe('2m ago');
  });

  it('loads offline recordings from the recorder service', async () => {
    mockRecorder.getOfflineRecordings.mockResolvedValue([
      { id: 'r1', name: 'Rough', timestamp: 42, settings: {} },
    ]);
    component.ngOnInit();
    await fixture.whenStable();
    expect(component.recordings()).toHaveLength(1);
    expect(component.recordings()[0].name).toBe('Rough');
    expect(component.recordingCount()).toBe(1);
  });

  it('deletes a recording and revokes its object URL', () => {
    component.recordings.set([rec()]);
    component.deleteRecording('rec_1');
    expect(mockRecorder.revokeRecordingUrl).toHaveBeenCalledWith('blob:rec_1');
    expect(component.recordings()).toHaveLength(0);
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      'Recording removed from list'
    );
  });

  it('renames a recording in place', () => {
    component.recordings.set([rec()]);
    component.startRename(component.recordings()[0]);
    expect(component.renamingId()).toBe('rec_1');
    component.renameValue.set('Final Take');
    component.confirmRename();
    expect(component.recordings()[0].name).toBe('Final Take');
    expect(component.renamingId()).toBeNull();
  });

  it('toggles the noise gate and notifies via snackbar', () => {
    component.toggleNoiseGate();
    expect(component.noiseGateEnabled()).toBe(true);
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      'Noise gate ON (threshold: -50 dB)'
    );
    component.toggleNoiseGate();
    expect(component.noiseGateEnabled()).toBe(false);
  });

  it('clamps the noise gate threshold to the -80..-20 range', () => {
    component.setNoiseGateThreshold(-90);
    expect(component.noiseGateThreshold()).toBe(-80);
    component.setNoiseGateThreshold(-10);
    expect(component.noiseGateThreshold()).toBe(-20);
    component.setNoiseGateThreshold(-40);
    expect(component.noiseGateThreshold()).toBe(-40);
  });

  it('promotes the most recent recording into an active take', () => {
    component.recordings.set([rec({ durationSec: 7 })]);
    component.promoteToTake();
    expect(component.takes()).toHaveLength(1);
    expect(component.takes()[0].isActive).toBe(true);
    expect(component.takes()[0].name).toBe('Take 1');
    expect(component.takes()[0].durationSec).toBe(7);
  });

  it('refuses to promote a take when nothing is recorded', () => {
    component.recordings.set([]);
    component.promoteToTake();
    expect(component.takes()).toHaveLength(0);
    expect(mockSnackbar.error).toHaveBeenCalledWith(
      'Record something first to promote a take'
    );
  });

  it('selects a single take as active for comping', () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    component.promoteToTake();
    component.selectTake(component.takes()[0].id);
    expect(component.takes()[0].isActive).toBe(true);
    expect(component.takes()[1].isActive).toBe(false);
  });

  it('toggles per-take mute state', () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    const takeId = component.takes()[0].id;
    component.toggleTakeMute(takeId);
    expect(component.takeMuted()[takeId]).toBe(true);
    component.toggleTakeMute(takeId);
    expect(component.takeMuted()[takeId]).toBe(false);
  });

  it('removes a take and its mute entry', () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    const takeId = component.takes()[0].id;
    component.toggleTakeMute(takeId);
    component.removeTake(takeId);
    expect(component.takes()).toHaveLength(0);
    expect(component.takeMuted()[takeId]).toBeUndefined();
  });

  it('clears all takes after a confirmed dialog', async () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    await component.clearAllTakes();
    expect(mockDialog.confirm).toHaveBeenCalled();
    expect(component.takes()).toHaveLength(0);
    expect(mockSnackbar.info).toHaveBeenCalledWith('All takes cleared');
  });

  it('keeps takes intact when the clear dialog is cancelled', async () => {
    mockDialog.confirm.mockResolvedValueOnce(false);
    component.recordings.set([rec()]);
    component.promoteToTake();
    await component.clearAllTakes();
    expect(component.takes()).toHaveLength(1);
    expect(mockSnackbar.info).not.toHaveBeenCalledWith('All takes cleared');
  });

  it('arms recording from the idle REC state', async () => {
    const getUserMedia = jest.fn().mockResolvedValue({
      getAudioTracks: () => [],
      getTracks: () => [],
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    await component.toggleRecord();
    expect(getUserMedia).toHaveBeenCalled();
    expect(mockRecorder.startRecording).toHaveBeenCalled();
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      'Recording armed — capture live input'
    );
    component.ngOnDestroy(); // clear intervals / contexts
  });

  it('stops recording when already armed', () => {
    mockRecorder.isRecording.set(true);
    component.toggleRecord();
    expect(mockRecorder.stopRecording).toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith('Recording stopped');
    component.ngOnDestroy();
  });

  it('rejects exporting a recording that has no audio data', () => {
    component.recordings.set([rec({ url: '' })]);
    component.exportToArrangement(component.recordings()[0]);
    expect(mockSnackbar.error).toHaveBeenCalledWith(
      'Recording has no audio data to export'
    );
    expect(mockMusicManager.addAudioTrack).not.toHaveBeenCalled();
  });
});
