import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DrumMachineComponent } from './drum-machine.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';
import { HapticService } from '../../services/haptic.service';
import { signal } from '@angular/core';
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
    tracks: signal([
      { id: MusicManagerService.DRUM_TRACK_ID, notes: [] as any[] },
    ]),
    currentStep: signal(0),
    addNoteToTrack: jest.fn((trackId: string, note: any) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        track.notes.push(note);
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
    removeNotes: jest.fn((trackId: string, noteIds: string[]) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        track.notes = track.notes.filter((n) => !noteIds.includes(n.id));
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
    updateNote: jest.fn((trackId: string, noteId: string, patch: any) => {
      const tracks = mockMusicManager.tracks();
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        const note = track.notes.find((n) => n.id === noteId);
        if (note) Object.assign(note, patch);
        mockMusicManager.tracks.set([...tracks]);
      }
    }),
  };

  const mockAudioEngine = {
    tempo: signal(124),
    visualStep: signal(0),
    ctx: { currentTime: 0, decodeAudioData: jest.fn() },
    triggerAttack: jest.fn(),
    triggerSampler: jest.fn(),
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
      ],
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

  it('handles collapsibility correctly', () => {
    expect(component.padsCollapsed()).toBe(false);
    expect(component.inspectorCollapsed()).toBe(false);
    expect(component.highDensity()).toBe(false);

    component.padsCollapsed.set(true);
    component.inspectorCollapsed.set(true);
    expect(component.highDensity()).toBe(true);
  });

  it('clearCurrentPad removes only notes for selected pad', () => {
    const pad1 = component.pads()[0];
    const pad2 = component.pads()[1];
    component.toggleStep(pad1.id, 0);
    component.toggleStep(pad2.id, 1);

    component.selectPad(pad1.id);
    component.clearCurrentPad();

    expect(component.getPadStep(pad1.id, 0).active).toBe(false);
    expect(component.getPadStep(pad2.id, 1).active).toBe(true);
  });

  it('doublePattern copies first 32 steps to last 32', () => {
    const padId = component.pads()[0].id;
    component.toggleStep(padId, 0);
    component.doublePattern();

    expect(component.getPadStep(padId, 32).active).toBe(true);
  });

  it('generateEuclidean creates patterns', () => {
    const padId = component.pads()[0].id;
    component.generateEuclidean(4, 16);
    const steps = Array.from(
      { length: 16 },
      (_, i) => component.getPadStep(padId, i).active
    );
    const activeCount = steps.filter((s) => s).length;
    expect(activeCount).toBe(4);
  });
});
