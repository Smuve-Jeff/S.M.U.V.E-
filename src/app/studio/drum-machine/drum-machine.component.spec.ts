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
    tracks: signal([]),
    currentStep: signal(0),
    addNoteToTrack: jest.fn(),
    removeNotes: jest.fn(),
  };

  const mockAudioEngine = {
    tempo: signal(124),
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
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

  it('initializes with 16 pads', () => {
    expect(component.pads().length).toBe(16);
  });

  it('selects a pad and triggers haptic', () => {
    component.selectPad('snare');
    expect(component.selectedPadId()).toBe('snare');
    expect(mockHaptic.light).toHaveBeenCalled();
  });

  it('toggles a step and calls music manager', () => {
    component.toggleStep('kick', 0);
    expect(mockMusicManager.addNoteToTrack).toHaveBeenCalled();
    expect(mockHaptic.medium).toHaveBeenCalled();

    component.toggleStep('kick', 0);
    expect(mockMusicManager.removeNotes).toHaveBeenCalled();
  });
});
