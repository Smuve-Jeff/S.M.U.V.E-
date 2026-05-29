import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerformerComponent } from './performer.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { HapticService } from '../../services/haptic.service';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';

describe('PerformerComponent', () => {
  let component: PerformerComponent;
  let fixture: ComponentFixture<PerformerComponent>;
  let mockLiveEngine: any;

  beforeEach(async () => {
    mockLiveEngine = {
      activeInstrument: signal('grand-piano-v2'),
      smartChords: signal(false),
      initialize: jest.fn().mockResolvedValue(true),
      setInstrument: jest.fn().mockResolvedValue(true),
      triggerNoteStart: jest.fn(),
      triggerNoteEnd: jest.fn(),
      setPitchBend: jest.fn(),
      setModulation: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PerformerComponent, FormsModule],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            recordLiveNote: jest.fn(),
            setActivePatternSlot: jest.fn(),
            tracks: signal([]),
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
          provide: LiveEngineService,
          useValue: mockLiveEngine,
        },
        {
          provide: HapticService,
          useValue: { light: jest.fn(), impact: jest.fn() },
        },
        InstrumentsService,
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
});
