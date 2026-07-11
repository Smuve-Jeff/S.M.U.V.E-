import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PianoRollComponent } from './piano-roll.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { signal, computed, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { HapticService } from '../../services/haptic.service';

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
    tracks: signal([
      {
        id: '1',
        name: 'Lead',
        instrumentId: 'synth',
        notes: [],
        clips: [],
        fxSlots: [],
        gain: 1,
        pan: 0,
        sendA: 0,
        sendB: 0,
        mute: false,
        solo: false,
        steps: [],
      },
    ]),
    selectedTrackId: signal('1'),
    currentStep: signal(0),
    updateNote: jest.fn(),
    addNoteToTrack: jest.fn(),
    removeNotes: jest.fn(),
    quantizeTrack: jest.fn(),
    duplicateNotes: jest.fn(),
    strumTrack: jest.fn(),
    humanizeTrack: jest.fn(),
    arpeggiateTrack: jest.fn(),
    selectedTrack: signal({ id: '1', name: 'Lead', notes: [], color: '#fff' }),
    engine: { scaleMode: signal('major'), scaleLock: signal(false) },
  };

  const mockAudioEngine = {
    tempo: signal(120),
    visualStep: signal(0),
  };

  const mockEnhancedTouchGestures = {
    zoomLevel: signal(1),
    verticalZoomLevel: signal(1),
    handlePinch: jest.fn(),
    adjustZoom: jest.fn(),
    resetZoom: jest.fn(),
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PianoRollComponent,
        CommonModule,
        FormsModule,
        StubChannelRackComponent,
      ],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        {
          provide: EnhancedTouchGestureService,
          useValue: mockEnhancedTouchGestures,
        },
        { provide: HapticService, useValue: mockHaptic },
      ],
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
