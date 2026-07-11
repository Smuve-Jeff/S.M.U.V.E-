import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MixerComponent } from './mixer.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KnobComponent } from '../shared/knob/knob.component';

describe('MixerComponent', () => {
  let component: MixerComponent;
  let fixture: ComponentFixture<MixerComponent>;

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
      getTrackOutput: () => ({ connect: () => {} }),
    },
  };

  const mockMusicManager = {
    tracks: signal([
      { id: 1, name: 'Track 1', gain: 1, pan: 0, mute: false, solo: false },
    ]),
    selectedTrackId: signal(1),
    engine: { updateTrack: jest.fn(), applyProductionParameter: jest.fn() },
    toggleMute: jest.fn(),
    toggleSolo: jest.fn(),
    removeTrack: jest.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MixerComponent, CommonModule, FormsModule, KnobComponent],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
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
    component.updateTrackVolume(1, 120);
    expect(mockMusicManager.engine.updateTrack).toHaveBeenCalledWith(1, {
      gain: 1.2,
    });
  });

  it('removes track', () => {
    window.confirm = jest.fn().mockReturnValue(true);
    component.removeTrack(1, new MouseEvent('click') as any);
    expect(mockMusicManager.removeTrack).toHaveBeenCalledWith(1);
  });
});
