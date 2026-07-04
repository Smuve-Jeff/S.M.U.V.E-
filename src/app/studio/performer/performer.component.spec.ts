import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerformerComponent } from './performer.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { HapticService } from '../../services/haptic.service';
import { FormsModule } from '@angular/forms';
import { signal, Component } from '@angular/core';

@Component({
  selector: 'app-performance-grid',
  standalone: true,
  template: '<div></div>',
})
class StubPerformanceGridComponent {}

describe('PerformerComponent', () => {
  let component: PerformerComponent;
  let fixture: ComponentFixture<PerformerComponent>;
  let mockLiveEngine: any;

  beforeEach(async () => {
    mockLiveEngine = {
      activeInstrument: signal('grand-piano-v2'),
      smartChords: signal(false),
      arpeggiatorEnabled: signal(false),
      scaleLock: signal(false),
      scaleMode: signal('major'),
      initialize: jest.fn().mockResolvedValue(true),
      setInstrument: jest.fn().mockResolvedValue(true),
      triggerNoteStart: jest.fn(),
      triggerNoteEnd: jest.fn(),
      stopAllNotes: jest.fn(),
      setPitchBend: jest.fn(),
      setModulation: jest.fn(),
      setModWheel: jest.fn(),
      setScale: jest.fn(),
      midiToNote: jest.fn().mockReturnValue('C4'),
    };

    await TestBed.configureTestingModule({
      imports: [PerformerComponent, FormsModule, StubPerformanceGridComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            recordLiveNote: jest.fn(),
            setActivePatternSlot: jest.fn(),
            tracks: signal([]),
            selectedTrackId: signal(null),
            engine: { masterAnalyser: { frequencyBinCount: 1024, getByteFrequencyData: jest.fn() } },
            performerScenes: signal([]),
            activeSceneId: signal(null)
          },
        },
        {
          provide: AudioSessionService,
          useValue: {
            isPlaying: signal(false),
            isRecording: signal(false),
            togglePlay: jest.fn(),
            toggleRecord: jest.fn(),
          },
        },
        {
          provide: AudioEngineService,
          useValue: { ctx: { currentTime: 0 } }
        },
        {
          provide: LiveEngineService,
          useValue: mockLiveEngine,
        },
        {
          provide: HapticService,
          useValue: { light: jest.fn(), impact: jest.fn(), heavy: jest.fn() },
        },
        {
          provide: InstrumentsService,
          useValue: { getPresets: () => [] }
        }
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerformerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set instrument', async () => {
    await component.setInstrument('analog-warmth');
    expect(mockLiveEngine.setInstrument).toHaveBeenCalledWith('analog-warmth');
  });

  it('should toggle smart chords', () => {
    component.toggleSmartChords();
    expect(component.smartChords()).toBe(true);
    expect(mockLiveEngine.smartChords()).toBe(true);
  });

  it('should stop all notes when panic is triggered', () => {
    component.stopPerformance();
    expect(mockLiveEngine.stopAllNotes).toHaveBeenCalled();
    expect(component.activeKeys().size).toBe(0);
  });
});
