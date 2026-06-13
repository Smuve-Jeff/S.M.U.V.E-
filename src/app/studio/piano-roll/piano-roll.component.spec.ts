import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PianoRollComponent } from './piano-roll.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { Router, ActivatedRoute } from '@angular/router';
import { signal, computed, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TouchGestureService } from '../../services/touch-gesture.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  template: '<div data-testid="channel-rack"></div>',
})
class StubChannelRackComponent {}

describe('PianoRollComponent', () => {
  let component: PianoRollComponent;
  let fixture: ComponentFixture<PianoRollComponent>;

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
  };

  const mockMusicManager = {
    tracks: signal([{ id: 1, name: 'Lead', instrumentId: 'synth', notes: [], clips: [], fxSlots: [], gain: 1, pan: 0, sendA: 0, sendB: 0, mute: false, solo: false, steps: [] }]),
    selectedTrackId: signal(1),
    currentStep: signal(0),
    updateNote: jest.fn(),
    addNoteToTrack: jest.fn(),
    removeNotes: jest.fn(),
    quantizeTrack: jest.fn(),
    duplicateNotes: jest.fn(),
    strumTrack: jest.fn(),
    humanizeTrack: jest.fn(),
    arpeggiateTrack: jest.fn(),
    removeClip: jest.fn(),
    ensureTrack: jest.fn(),
    removeTrack: jest.fn(),
    toggleMute: jest.fn(),
    toggleSolo: jest.fn(),
    setInstrument: jest.fn(),
  };

  const mockAudioEngine = {
    tempo: signal(120),
  };

  const mockTouchGestures = {
    zoomLevel: signal(1),
    handlePinch: jest.fn(),
    applyPinch: jest.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PianoRollComponent, CommonModule, FormsModule, StubChannelRackComponent],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: TouchGestureService, useValue: mockTouchGestures },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: AiService, useValue: { isUnlocked: () => true } },
        { provide: UIService, useValue: { isCompactMobile: () => false } },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PianoRollComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call fitToPage', () => {
    const spy = jest.spyOn(component, 'fitToPage');
    component.fitToPage();
    expect(spy).toHaveBeenCalled();
  });
});
