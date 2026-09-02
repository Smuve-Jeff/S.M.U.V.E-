import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MixerComponent } from './mixer.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { RecordingStatusService } from '../recording-status.service';
import { signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KnobComponent } from '../shared/knob/knob.component';

describe('MixerComponent', () => {
  let component: MixerComponent;
  let fixture: ComponentFixture<MixerComponent>;

  const connectSidechain = jest.fn();
  const disconnectSidechain = jest.fn();

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    masterVolume: signal(100),
    togglePlay: jest.fn(),
    updateMasterVolume: jest.fn(),
    engine: {
      ctx: {
        createAnalyser: () => ({
          fftSize: 0,
          connect: () => {},
          frequencyBinCount: 0,
          getByteFrequencyData: () => {},
        }),
      },
      outputLufs: signal(-14),
      getTrackOutput: () => ({ connect: () => {} }),
      connectSidechain,
      disconnectSidechain,
    },
  };

  const mockMusicManager = {
    tracks: signal([
      { id: '1', name: 'Track 1', gain: 1, pan: 0, mute: false, solo: false },
      { id: '2', name: 'Track 2', gain: 1, pan: 0, mute: false, solo: false },
    ]),
    selectedTrackId: signal('1'),
    engine: {
      updateTrack: jest.fn(),
      applyProductionParameter: jest.fn(),
      setVcaMultiplier: jest.fn(),
      connectSidechain,
      disconnectSidechain,
    },
    updateVolume: jest.fn(),
    toggleMute: jest.fn(),
    toggleSolo: jest.fn(),
    removeTrack: jest.fn(),
  };

  const recordingStatusMock = {
    armedTrackIds: signal(new Set<string>()),
    armTrack: jest.fn(),
    disarmTrack: jest.fn(),
    toggleArmTrack: jest.fn(),
    isTrackArmed: jest.fn((id: string) =>
      (recordingStatusMock.armedTrackIds() as Set<string>).has(id)
    ),
    setRecordingSource: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [MixerComponent, CommonModule, FormsModule, KnobComponent],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: RecordingStatusService, useValue: recordingStatusMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MixerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('updates track volume', () => {
    component.updateTrackVolume('1', 120);
    expect(mockMusicManager.engine.updateTrack).toHaveBeenCalledWith('1', {
      gain: 1.2,
    });
  });

  it('removes track', () => {
    window.confirm = jest.fn().mockReturnValue(true);
    component.removeTrack('1', new MouseEvent('click') as any);
    expect(mockMusicManager.removeTrack).toHaveBeenCalledWith('1');
  });

  it('arms a track through RecordingStatusService (single source of truth)', () => {
    component.toggleArmTrack('1');
    expect(recordingStatusMock.armTrack).toHaveBeenCalledWith('1');
    // Toggling must NOT reach for a parallel per-track flag: the track list
    // itself stays untouched (the old code rewrote the whole array here).
    expect(mockMusicManager.tracks()).toHaveLength(2);

    recordingStatusMock.armedTrackIds.set(new Set(['1']));
    fixture.detectChanges();
    expect(component.isArmed('1')).toBe(true);
    expect(component.isArmed('2')).toBe(false);

    component.toggleArmTrack('1');
    expect(recordingStatusMock.disarmTrack).toHaveBeenCalledWith('1');
  });

  it('wires the sidechain chip into the engine routing (not just UI)', () => {
    component.toggleSidechain('1', '2');
    expect(connectSidechain).toHaveBeenCalledWith('2', '1');
    expect(component.hasSidechain('1')).toBe(true);
    expect(component.sidechainSourceNameFor('1')).toBe('Track 2');

    // Selecting the same source again clears it.
    component.toggleSidechain('1', '2');
    expect(disconnectSidechain).toHaveBeenCalledWith('2', '1');
    expect(component.hasSidechain('1')).toBe(false);

    // Switching sources tears down the old pair and connects the new one.
    component.toggleSidechain('1', '2');
    component.toggleSidechain('1', null);
    expect(disconnectSidechain).toHaveBeenLastCalledWith('2', '1');
  });

  it('reports sidechain candidates excluding the target track itself', () => {
    const candidates = component.sidechainCandidates('2');
    expect(candidates.map((t) => t.id)).toEqual(['1']);
  });
});
