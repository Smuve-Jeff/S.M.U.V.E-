import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MixerComponent } from './mixer.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { NeuralMixerService } from '../../services/neural-mixer.service';
import { MixerService } from '../mixer.service';

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
        clips: [],
        gain: 0.9,
        pan: 0,
        sendA: 0,
        sendB: 0,
        fxSlots: [],
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
    };

    const musicManagerMock = {
      tracks,
      selectedTrackId: signal<number | null>(null),
      toggleMute: jest.fn(),
      toggleSolo: jest.fn(),
      engine: {
        updateTrack: jest.fn(),
        tempo: signal(124),
      },
    };

    const neuralMixerMock = {
      applyNeuralMix: jest.fn(),
      suggestForTrack: jest.fn(),
    };

    const mixerServiceMock = {
      resetAllLevels: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MixerComponent],
      providers: [
        { provide: AudioSessionService, useValue: audioSessionMock },
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: NeuralMixerService, useValue: neuralMixerMock },
        { provide: MixerService, useValue: mixerServiceMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MixerComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return { component, musicManagerMock, audioSessionMock };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates and clamps track gain', async () => {
    const { component, musicManagerMock } = await createComponent();
    component.updateTrackGain(1, 110);
    expect(component.tracks()[0].gain).toBe(1);
    expect(musicManagerMock.engine.updateTrack).toHaveBeenCalledWith(1, {
      gain: 1,
    });
  });

  it('updates and clamps track pan', async () => {
    const { component, musicManagerMock } = await createComponent();
    component.updateTrackPan(1, -110);
    expect(component.tracks()[0].pan).toBe(-1);
    expect(musicManagerMock.engine.updateTrack).toHaveBeenCalledWith(1, {
      pan: -1,
    });
  });

  it('delegates transport controls to the audio session', async () => {
    const { component, audioSessionMock } = await createComponent();
    component.togglePlayback();
    component.toggleRecording();
    component.stopPlayback();
    expect(audioSessionMock.togglePlay).toHaveBeenCalled();
    expect(audioSessionMock.toggleRecord).toHaveBeenCalled();
    expect(audioSessionMock.stop).toHaveBeenCalled();
  });
});
