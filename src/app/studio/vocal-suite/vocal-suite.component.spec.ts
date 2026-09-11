import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { VocalSuiteComponent } from './vocal-suite.component';
import { UIService } from '../../services/ui.service';
import { MicrophoneService } from '../../services/microphone.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';
import { VocalAiService } from '../../services/vocal-ai.service';
import { AiService } from '../../services/ai.service';
import { AudioSessionService } from '../audio-session.service';
import { StudioRecordingEngineService } from '../studio-recording-engine.service';
import { PitchCorrectionService } from '../pitch-correction.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineLatencyService } from '../../services/audio-engine-latency.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { LoggingService } from '../../services/logging.service';
import { SnackbarService } from '../../services/snackbar.service';

describe('VocalSuiteComponent', () => {
  let component: VocalSuiteComponent;
  let fixture: ComponentFixture<VocalSuiteComponent>;
  let microphoneServiceMock: any;
  let masteringMock: any;
  let musicManagerMock: any;
  let audioEngineMock: any;
  const masteringOutput = { id: 'mastering-output' };

  beforeEach(async () => {
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1 as unknown as number);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    microphoneServiceMock = {
      isInitialized: signal(false),
      isRecording: signal(false),
      isPaused: signal(false),
      recordingTime: signal(0),
      recordedBlob: signal<Blob | null>(null),
      availableDevices: signal([
        {
          deviceId: 'default',
          label: 'Default Interface',
          type: 'interface',
          isDefault: true,
          capabilities: ['default', 'phantom-power', 'stereo', 'usb-interface'],
        },
      ]),
      selectedDeviceId: signal<string | null>(null),
      initialize: jest.fn().mockResolvedValue(true),
      getAnalyserNode: jest.fn().mockReturnValue({}),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      attachProcessedCapture: jest.fn().mockReturnValue(true),
    };

    masteringMock = {
      params: signal({
        deesser: { threshold: -24, frequency: 6500, bypass: false },
        multiband: {
          low: { threshold: -20, ratio: 4, bypass: false },
          mid: { threshold: -18, ratio: 2.5, bypass: false },
          high: { threshold: -16, ratio: 2, bypass: false },
        },
        exciter: { amount: 0.1, frequency: 8000, bypass: false },
        eq: { low: 0, mid: 0, high: 0, bypass: false },
        limiter: { ceiling: -0.1, release: 0.1, bypass: false },
      }),
      updateNodes: jest.fn(),
      updateParams: jest.fn(),
      applyToSource: jest.fn(),
      getOutputNode: jest.fn().mockReturnValue(masteringOutput),
    };

    const recordingEngineMock = {
      isInitialized: signal(false),
      isRecording: signal(false),
      isPaused: signal(false),
      recordingTime: signal(0),
      inputLevel: signal(0),
      recordedBlob: signal<Blob | null>(null),
      pendingMidi: [],
      initialize: jest.fn().mockResolvedValue(true),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      getAnalyserNode: jest.fn().mockReturnValue({}),
    };

    musicManagerMock = { addAudioTrack: jest.fn() };
    audioEngineMock = {
      ctx: Object.assign(new (window as any).AudioContext(), {
        // The shared mock returns fixed-length channel data; take editing needs
        // buffers sized to the request.
        createBuffer: (channels: number, length: number, sampleRate: number) =>
          new (globalThis as any).AudioBuffer({
            length,
            sampleRate,
            numberOfChannels: channels,
          }),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [VocalSuiteComponent],
      providers: [
        { provide: MusicManagerService, useValue: musicManagerMock },
        {
          provide: AudioEngineLatencyService,
          useValue: {
            trimAudioBuffer: jest.fn((buffer: AudioBuffer) => buffer),
          },
        },
        { provide: AudioEngineService, useValue: audioEngineMock },
        {
          provide: LoggingService,
          useValue: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
        },
        {
          provide: SnackbarService,
          useValue: {
            success: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            warning: jest.fn(),
          },
        },
        {
          provide: UIService,
          useValue: {
            activeTheme: signal({ name: 'test', primary: 'purple' }),
            navigateToView: jest.fn(),
          },
        },
        { provide: MicrophoneService, useValue: microphoneServiceMock },
        { provide: VocalMasteringService, useValue: masteringMock },
        {
          provide: PitchCorrectionService,
          useValue: {
            // Real-time worklet chain unavailable in tests — the vocal suite
            // falls back to the raw mic node, which the mastering assertion
            // below still expects.
            insertIntoChain: jest.fn().mockResolvedValue(null),
            enabled: signal(false),
            amount: signal(0.5),
            retuneSpeed: signal(0.1),
            scale: signal('C Major'),
          },
        },
        {
          provide: StudioRecordingEngineService,
          useValue: recordingEngineMock,
        },
        {
          provide: VocalAiService,
          useValue: {
            toggleFeedbackMode: jest.fn(),
            isPassiveMode: signal(true),
            vocalIntel: signal([]),
          },
        },
        {
          provide: AiService,
          useValue: {
            strategicDecrees: signal(['READY']),
          },
        },
        {
          provide: AudioSessionService,
          useValue: {
            micChannels: signal([
              {
                id: 'mic-1',
                label: 'Lead Vox',
                level: 60,
                muted: false,
                pan: 0,
                armed: true,
                deviceId: 'mic-1',
              },
            ]),
            updateChannelDevice: jest.fn(),
            toggleChannelArm: jest.fn(),
            toggleChannelMute: jest.fn(),
            updateChannelPan: jest.fn(),
          },
        },
      ],
    })
      .overrideComponent(VocalSuiteComponent, {
        set: { template: '<div></div>' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(VocalSuiteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates the vocal suite', () => {
    expect(component).toBeTruthy();
  });

  it('initializes the microphone when entering the record step', async () => {
    component.setStep('record');
    await Promise.resolve();

    expect(microphoneServiceMock.initialize).toHaveBeenCalled();
  });

  it('connects the microphone analyser to the vocal mastering chain', async () => {
    await component.initializeMic();

    expect(masteringMock.applyToSource).toHaveBeenCalledWith(
      microphoneServiceMock.getAnalyserNode()
    );
  });

  it('records the mastered chain instead of the dry mic feed', async () => {
    await component.initializeMic();

    expect(microphoneServiceMock.attachProcessedCapture).toHaveBeenCalledWith(
      masteringOutput
    );
  });

  it('auto-routes a finished take into the arrangement', async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 2048,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    take.getChannelData(0).fill(0.25);
    microphoneServiceMock.recordedBlob.set(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
    );
    microphoneServiceMock.stopRecording.mockResolvedValue(
      microphoneServiceMock.recordedBlob()
    );
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    microphoneServiceMock.isRecording.set(true);

    await component.toggleRecording();

    expect(musicManagerMock.addAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vocal Take 1' })
    );
    expect(component.takeNumber()).toBe(1);
  });

  it('skips auto-routing when the toggle is off', async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 512,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    microphoneServiceMock.stopRecording.mockResolvedValue(
      microphoneServiceMock.recordedBlob()
    );
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    microphoneServiceMock.isRecording.set(true);
    component.toggleAutoRoute();

    await component.toggleRecording();

    expect(component.autoRouteTakes()).toBe(false);
    expect(musicManagerMock.addAudioTrack).not.toHaveBeenCalled();
  });

  it('normalizes and trims the take before routing it', async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 4800,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    const data = take.getChannelData(0);
    data.fill(1e-5);
    for (let i = 960; i <= 1920; i++) data[i] = 0.2;
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);

    const normalized = await component.normalizeTake();
    expect(normalized).toContain('Normalized');
    expect(Math.abs(take.getChannelData(0)[1200])).toBeCloseTo(
      Math.pow(10, -1 / 20),
      3
    );

    const trimmed = await component.trimTakeSilence();
    expect(trimmed).toContain('Trimmed');
    expect(component.takeEnvelope().length).toBeGreaterThan(0);

    await component.routeTakeToArrangement();
    expect(musicManagerMock.addAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vocal Take 1' })
    );
  });

  it('does not arm a take when the input cannot be opened', async () => {
    microphoneServiceMock.initialize.mockResolvedValue(false);

    await component.initializeMic();
    await component.toggleRecording();

    expect(microphoneServiceMock.startRecording).not.toHaveBeenCalled();
  });

  it('starts and stops recording through the microphone service', async () => {
    microphoneServiceMock.isInitialized.set(true);
    await component.toggleRecording();
    expect(microphoneServiceMock.startRecording).toHaveBeenCalled();

    microphoneServiceMock.isRecording.set(true);
    await component.toggleRecording();
    expect(microphoneServiceMock.stopRecording).toHaveBeenCalled();
  });
});
