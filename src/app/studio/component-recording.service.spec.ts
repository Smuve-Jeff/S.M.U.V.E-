import { TestBed } from '@angular/core/testing';
import { ComponentRecordingService } from './component-recording.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { StudioRecordingEngineService } from './studio-recording-engine.service';
import { LoggingService } from '../services/logging.service';
import { SnackbarService } from '../services/snackbar.service';
import { signal } from '@angular/core';

describe('ComponentRecordingService', () => {
  let service: ComponentRecordingService;
  let audioEngineMock: any;
  let recordingEngineMock: any;

  beforeEach(async () => {
    audioEngineMock = {
      isRecording: signal(false),
    };

    recordingEngineMock = {
      initialize: jest.fn().mockResolvedValue(true),
      startRecording: jest.fn(),
      stopRecording: jest.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      providers: [
        ComponentRecordingService,
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: StudioRecordingEngineService, useValue: recordingEngineMock },
        { provide: LoggingService, useValue: { error: jest.fn(), warn: jest.fn() } },
        { provide: SnackbarService, useValue: { info: jest.fn(), warning: jest.fn(), error: jest.fn(), success: jest.fn() } },
      ],
    }).compileComponents();

    service = TestBed.inject(ComponentRecordingService);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should create with default state', () => {
    expect(service.isRecording()).toBe(false);
    expect(service.activeSource()).toBeNull();
    expect(service.recordingDuration()).toBe(0);
  });

  it('should list 7 component configs', () => {
    expect(service.componentConfigs.length).toBe(7);
  });

  it('should get config by ID', () => {
    const config = service.getConfig('drum-machine');
    expect(config).toBeDefined();
    expect(config!.label).toBe('Drum Machine');
    expect(config!.supportsMidi).toBe(true);
  });

  it('should return undefined for unknown component', () => {
    expect(service.getConfig('nonexistent' as any)).toBeUndefined();
  });

  it('should set active source', () => {
    service.setActiveSource('vocal-suite');
    expect(service.activeSource()).toBe('vocal-suite');
  });

  it('should refuse to record without a source', async () => {
    const result = await service.startRecording();
    expect(result).toBe(false);
  });

  it('should start recording when source is set', async () => {
    service.setActiveSource('drum-machine');
    await service.startRecording();

    expect(service.isRecording()).toBe(true);
    expect(recordingEngineMock.startRecording).toHaveBeenCalled();
    expect(audioEngineMock.isRecording()).toBe(true);
  });

  it('should initialize engine for input sources', async () => {
    service.setActiveSource('vocal-suite');
    await service.startRecording();

    expect(recordingEngineMock.initialize).toHaveBeenCalled();
  });

  it('should not double-start recording', async () => {
    service.setActiveSource('drum-machine');
    await service.startRecording();
    const result = await service.startRecording();
    expect(result).toBe(false);
  });

  it('should stop recording and clean up', async () => {
    service.setActiveSource('drum-machine');
    await service.startRecording();
    await service.stopRecording();

    expect(service.isRecording()).toBe(false);
    expect(recordingEngineMock.stopRecording).toHaveBeenCalled();
  });

  it('should not stop when not recording', async () => {
    await service.stopRecording();
    expect(recordingEngineMock.stopRecording).not.toHaveBeenCalled();
  });

  it('should toggle recording', async () => {
    service.setActiveSource('drum-machine');
    await service.toggleRecording();
    expect(service.isRecording()).toBe(true);

    await service.toggleRecording();
    expect(service.isRecording()).toBe(false);
  });

  it('should track recording duration', async () => {
    service.setActiveSource('drum-machine');
    await service.startRecording();

    jest.advanceTimersByTime(5000);
    expect(service.recordingDuration()).toBe(5);

    await service.stopRecording();
    jest.advanceTimersByTime(3000);
    // Duration stops incrementing after stop
    expect(service.recordingDuration()).toBe(5);
  });

  it('should find all component configs by id', () => {
    service.componentConfigs.forEach((config) => {
      expect(service.getConfig(config.componentId)).toBe(config);
    });
  });
});