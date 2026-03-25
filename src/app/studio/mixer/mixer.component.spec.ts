import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MixerComponent } from './mixer.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { MicrophoneService } from '../../services/microphone.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';

describe('MixerComponent', () => {
  const createComponent = async () => {
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1 as unknown as number);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const tracks = signal([
      {
        id: 1,
        name: 'Lead',
        instrumentId: 'synth',
        notes: [],
        gain: 0.9,
        pan: 0,
        sendA: 0,
        sendB: 0,
        mute: false,
        solo: false,
        steps: [],
      },
    ]);

    const audioSessionMock = {
      playbackState: signal<'stopped' | 'playing' | 'recording'>('stopped'),
      isPlaying: signal(false),
      isRecording: signal(false),
      micChannels: signal([]),
      masterVolume: signal(80),
      updateMasterVolume: jest.fn(),
      togglePlay: jest.fn(),
      toggleRecord: jest.fn(),
      stop: jest.fn(),
      updateChannelDevice: jest.fn(),
      toggleChannelArm: jest.fn(),
      toggleChannelMute: jest.fn(),
      updateChannelPan: jest.fn(),
    };

    const musicManagerMock = {
      tracks,
      selectedTrackId: signal<number | null>(null),
      toggleMute: jest.fn(),
      toggleSolo: jest.fn(),
      engine: {
        updateTrack: jest.fn(),
      },
    };

    const microphoneServiceMock = {
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
      isInitialized: signal(false),
      isRecording: signal(false),
      isPaused: signal(false),
      initialize: jest.fn().mockResolvedValue(undefined),
      getAnalyserNode: jest.fn(),
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
      imports: [MixerComponent],
      providers: [
        { provide: AudioSessionService, useValue: audioSessionMock },
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: MicrophoneService, useValue: microphoneServiceMock },
        { provide: VocalMasteringService, useValue: masteringMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MixerComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

      return { component, musicManagerMock };
    };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates and clamps track gain', async () => {
    const { component, musicManagerMock } = await createComponent();

    component.updateTrackGain(1, 180);

    expect(component.tracks()[0].gain).toBe(1);
    expect(musicManagerMock.engine.updateTrack).toHaveBeenCalledWith(1, {
      gain: 1,
    });
  });

  it('updates and clamps track pan', async () => {
    const { component, musicManagerMock } = await createComponent();

    component.updateTrackPan(1, -180);

    expect(component.tracks()[0].pan).toBe(-1);
    expect(musicManagerMock.engine.updateTrack).toHaveBeenCalledWith(1, {
      pan: -1,
    });
  });

  it('updates and clamps track sends', async () => {
    const { component, musicManagerMock } = await createComponent();

    component.updateTrackSend(1, 'sendA', 160);
    component.updateTrackSend(1, 'sendB', -10);

    expect(component.tracks()[0].sendA).toBe(1);
    expect(component.tracks()[0].sendB).toBe(0);
    expect(musicManagerMock.engine.updateTrack).toHaveBeenNthCalledWith(1, 1, {
      sendA: 1,
    });
    expect(musicManagerMock.engine.updateTrack).toHaveBeenNthCalledWith(2, 1, {
      sendB: 0,
    });
  });

  it('selects a track for focused routing details', async () => {
    const { component, musicManagerMock } = await createComponent();

    component.selectTrack(1);

    expect(musicManagerMock.selectedTrackId()).toBe(1);
    expect(component.selectedTrack()?.id).toBe(1);
  });

  it('delegates transport controls to the audio session', async () => {
    const { component } = await createComponent();
    const audioSession = TestBed.inject(AudioSessionService) as {
      togglePlay: jest.Mock;
      toggleRecord: jest.Mock;
      stop: jest.Mock;
    };

    component.togglePlayback();
    component.toggleRecording();
    component.stopPlayback();

    expect(audioSession.togglePlay).toHaveBeenCalled();
    expect(audioSession.toggleRecord).toHaveBeenCalled();
    expect(audioSession.stop).toHaveBeenCalled();
  });
});
