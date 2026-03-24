import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MixerComponent } from './mixer.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';

describe('MixerComponent', () => {
  const createComponent = async () => {
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
      micChannels: signal([]),
      masterVolume: signal(80),
      updateMasterVolume: jest.fn(),
    };

    const musicManagerMock = {
      tracks,
      toggleMute: jest.fn(),
      toggleSolo: jest.fn(),
      engine: {
        updateTrack: jest.fn(),
      },
    };

    await TestBed.configureTestingModule({
      imports: [MixerComponent],
      providers: [
        { provide: AudioSessionService, useValue: audioSessionMock },
        { provide: MusicManagerService, useValue: musicManagerMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MixerComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return { component, musicManagerMock };
  };

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
});
