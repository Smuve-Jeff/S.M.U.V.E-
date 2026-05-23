import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerformerComponent } from './performer.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';

describe('PerformerComponent', () => {
  let component: PerformerComponent;
  let fixture: ComponentFixture<PerformerComponent>;
  let mockLiveEngine: any;

  beforeEach(async () => {
    mockLiveEngine = {
      activeInstrument: signal('cyber-lead'),
      smartChords: signal(false),
      setInstrument: jest.fn().mockResolvedValue(true),
      triggerAttack: jest.fn(),
      triggerRelease: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PerformerComponent, FormsModule],
      providers: [
        {
          provide: MusicManagerService,
          useValue: { recordLiveNote: jest.fn() },
        },
        {
          provide: AudioEngineService,
          useValue: {},
        },
        {
          provide: LiveEngineService,
          useValue: mockLiveEngine,
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
    await component.setInstrument('hard-808');
    expect(mockLiveEngine.setInstrument).toHaveBeenCalledWith('hard-808');
  });

  it('should toggle smart chords', () => {
    component.toggleSmartChords();
    expect(component.smartChords()).toBe(true);
    expect(mockLiveEngine.smartChords()).toBe(true);
  });
});
