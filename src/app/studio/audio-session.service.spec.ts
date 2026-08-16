import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AudioSessionService } from './audio-session.service';
import { LoggingService } from '../services/logging.service';
import { InstrumentService } from './instrument.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { MicrophoneService } from '../services/microphone.service';
import { StudioRecordingEngineService } from './studio-recording-engine.service';
import { MusicManagerService } from '../services/music-manager.service';
import { RecordingStatusService } from './recording-status.service';

describe('AudioSessionService', () => {
  let service: AudioSessionService;

  const engineMock = {
    isPlaying: jest.fn(() => false),
    start: jest.fn(),
    stop: jest.fn(),
    setMasterOutputLevel: jest.fn(),
  };

  const recordingEngineMock = {
    initialize: jest.fn(() => Promise.resolve()),
    isInitialized: jest.fn(() => false),
    isRecording: jest.fn(() => false),
  };

  const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: InstrumentService, useValue: { play: jest.fn() } },
        { provide: AudioEngineService, useValue: engineMock },
        { provide: MicrophoneService, useValue: { availableDevices: signal([]) } },
        { provide: StudioRecordingEngineService, useValue: recordingEngineMock },
        {
          provide: MusicManagerService,
          useValue: {
            selectedTrackId: jest.fn(() => ''),
            startRecording: jest.fn(),
            stopRecording: jest.fn(),
            tracks: jest.fn(() => []),
          },
        },
        {
          provide: RecordingStatusService,
          useValue: { clearRecordingSource: jest.fn(), setRecordingSource: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(AudioSessionService);
    engineMock.stop.mockClear();
  });

  it('stops playback when the tab/app is hidden mid-transport', () => {
    service.playbackState.set('playing');

    setVisibility('hidden');

    expect(engineMock.stop).toHaveBeenCalled();
    expect(service.playbackState()).toBe('stopped');
  });

  it('does not stop the transport when the tab stays visible', () => {
    service.playbackState.set('playing');

    setVisibility('visible');

    expect(engineMock.stop).not.toHaveBeenCalled();
    expect(service.playbackState()).toBe('playing');
  });

  it('does not stop the transport for a hidden tab when already stopped', () => {
    service.playbackState.set('stopped');

    setVisibility('hidden');

    expect(engineMock.stop).not.toHaveBeenCalled();
  });
});
