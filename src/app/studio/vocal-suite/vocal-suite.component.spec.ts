import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { VocalSuiteComponent } from './vocal-suite.component';
import { UIService } from '../../services/ui.service';
import { MicrophoneService } from '../../services/microphone.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';
import { VocalAiService } from '../../services/vocal-ai.service';
import { AiService } from '../../services/ai.service';
import { AudioSessionService } from '../audio-session.service';

describe('VocalSuiteComponent', () => {
  let component: VocalSuiteComponent;
  let fixture: ComponentFixture<VocalSuiteComponent>;
  let microphoneServiceMock: any;
  let masteringMock: any;

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
      initialize: jest.fn().mockResolvedValue(undefined),
      getAnalyserNode: jest.fn().mockReturnValue({}),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
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
    };

    await TestBed.configureTestingModule({
      imports: [VocalSuiteComponent],
      providers: [
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

  it('starts and stops recording through the microphone service', () => {
    component.toggleRecording();
    expect(microphoneServiceMock.startRecording).toHaveBeenCalled();

    microphoneServiceMock.isRecording.set(true);
    component.toggleRecording();
    expect(microphoneServiceMock.stopRecording).toHaveBeenCalled();
  });
});
