import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DrumMachineComponent } from './drum-machine.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';
import { HapticService } from '../../services/haptic.service';
import { signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

describe('DrumMachineComponent', () => {
  let component: DrumMachineComponent;
  let fixture: ComponentFixture<DrumMachineComponent>;

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
  };

  const mockMusicManager = {
    tracks: signal([{ id: MusicManagerService.DRUM_TRACK_ID, notes: [] as any[] }]),
    currentStep: signal(0),
    addNoteToTrack: jest.fn((trackId: string, note: any) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find(t => t.id === trackId);
      if (track) {
        track.notes.push(note);
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
    removeNotes: jest.fn((trackId: string, noteIds: string[]) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find(t => t.id === trackId);
      if (track) {
        track.notes = track.notes.filter(n => !noteIds.includes(n.id));
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
  };

  const mockAudioEngine = {
    tempo: signal(124),
    visualStep: signal(0),
    ctx: { currentTime: 0 }
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
    impact: jest.fn(),
  };

  const mockAiService = {
    generateStrategicDecree: jest.fn(),
    roastComponent: jest.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DrumMachineComponent, CommonModule, FormsModule],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: HapticService, useValue: mockHaptic },
        { provide: AiService, useValue: mockAiService },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DrumMachineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('initializes with 8 pads', () => {
    expect(component.pads().length).toBe(8);
  });

  it('selects a pad', () => {
    component.selectPad('pad-38');
    expect(component.selectedPadId()).toBe('pad-38');
  });

  it('toggles a step', () => {
    const padId = component.pads()[0].id;
    component.toggleStep(padId, 0);
    expect(component.getPadStep(padId, 0).active).toBe(true);
  });
});
