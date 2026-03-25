import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MicrophoneInterfaceComponent } from './microphone-interface.component';
import { AudioSessionService } from '../audio-session.service';
import { MicrophoneService } from '../../services/microphone.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';

describe('MicrophoneInterfaceComponent', () => {
  const createComponent = async () => {
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1 as unknown as number);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const audioSessionMock = {
      micChannels: signal([
        {
          id: 'mic-1',
          label: 'Lead Vox',
          level: 72,
          muted: false,
          pan: 0,
          armed: false,
          deviceId: 'focusrite',
        },
      ]),
      updateChannelDevice: jest.fn(),
      toggleChannelArm: jest.fn(),
      toggleChannelMute: jest.fn(),
      updateChannelPan: jest.fn(),
    };

    const microphoneServiceMock = {
      availableDevices: signal([
        {
          deviceId: 'focusrite',
          label: 'Focusrite Scarlett',
          type: 'interface',
          isDefault: true,
          capabilities: [
            'default',
            'phantom-power',
            'headphone-monitoring',
            'stereo',
            'usb-interface',
          ],
        },
      ]),
      selectedDeviceId: signal<string | null>('focusrite'),
      isInitialized: signal(false),
      isRecording: signal(false),
      isPaused: signal(false),
      initialize: jest.fn().mockResolvedValue(undefined),
      getAnalyserNode: jest.fn().mockReturnValue({ getByteTimeDomainData: jest.fn(), fftSize: 32 }),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
    };

    const masteringMock = {
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
      updateParams: jest.fn(),
      applyToSource: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MicrophoneInterfaceComponent],
      providers: [
        { provide: AudioSessionService, useValue: audioSessionMock },
        { provide: MicrophoneService, useValue: microphoneServiceMock },
        { provide: VocalMasteringService, useValue: masteringMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MicrophoneInterfaceComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return {
      component,
      audioSessionMock,
      microphoneServiceMock,
      masteringMock,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selects the first available microphone channel by default', async () => {
    const { component } = await createComponent();

    expect(component.currentChannel()?.id).toBe('mic-1');
  });

  it('initializes the selected device and links mastering', async () => {
    const {
      component,
      audioSessionMock,
      microphoneServiceMock,
      masteringMock,
    } = await createComponent();

    await component.initializeInterface();

    expect(audioSessionMock.updateChannelDevice).toHaveBeenCalledWith(
      'mic-1',
      'focusrite'
    );
    expect(microphoneServiceMock.initialize).toHaveBeenCalledWith('focusrite');
    expect(audioSessionMock.toggleChannelArm).toHaveBeenCalledWith('mic-1');
    expect(masteringMock.applyToSource).toHaveBeenCalled();
  });

  it('applies broadcast vocal cleanup settings', async () => {
    const { component, masteringMock } = await createComponent();

    component.applyVocalProfile('broadcast');

    expect(masteringMock.updateParams).toHaveBeenCalledWith(
      expect.objectContaining({
        eq: expect.objectContaining({ mid: 3, high: 4 }),
        exciter: expect.objectContaining({ amount: 0.18 }),
      })
    );
  });

  it('delegates recording actions to the microphone service', async () => {
    const { component, microphoneServiceMock } = await createComponent();

    microphoneServiceMock.isInitialized.set(true);
    component.toggleRecording();
    expect(microphoneServiceMock.startRecording).toHaveBeenCalled();

    microphoneServiceMock.isRecording.set(true);
    component.toggleRecording();
    expect(microphoneServiceMock.stopRecording).toHaveBeenCalled();
  });
});
