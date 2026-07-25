import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerformerComponent } from './performer.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { HapticService } from '../../services/haptic.service';
import { DjMidiService } from '../../services/dj-midi.service';
import { PerformanceRecordingService } from '../performance-recording.service';
import { RecordingStatusService } from '../recording-status.service';
import { FxMacrosService } from '../../services/fx-macros.service';
import { Subject } from 'rxjs';
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
      setPitchBend: jest.fn(),
      setModulation: jest.fn(),
      setModWheel: jest.fn(),
      setScale: jest.fn(),
      updateParameter: jest.fn(),
      midiToNote: jest.fn().mockReturnValue('C4'),
    };

    await TestBed.configureTestingModule({
      imports: [PerformerComponent, FormsModule, StubPerformanceGridComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            recordLiveNote: jest.fn(),
            tracks: signal([]),
            selectedTrackId: signal(null),
            engine: {
              updateTrack: jest.fn(),
              masterAnalyser: {
                frequencyBinCount: 1024,
                getByteFrequencyData: jest.fn(),
              },
            },
            performerScenes: signal([]),
            activeSceneId: signal(null),
            launchScene: jest.fn(),
            ensureTrack: jest.fn(),
            setInstrument: jest.fn(),
          },
        },
        { provide: AudioSessionService, useValue: { isPlaying: signal(false), isRecording: signal(false), micChannels: signal([]) } },
        { provide: AudioEngineService, useValue: { ctx: { currentTime: 0 } } },
        { provide: LiveEngineService, useValue: mockLiveEngine },
        { provide: HapticService, useValue: { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        {
          provide: DjMidiService,
          useValue: {
            autoInit: jest.fn(),
            connectedDevices: signal([]),
            performerNoteOn: new Subject(),
            performerNoteOff: new Subject(),
            performerCC: new Subject(),
            performerLearnActive: signal(false),
            performerLearnTarget: signal(null),
            performerCCMap: signal([]),
            midiActivityPulse: signal(false),
            startPerformerLearn: jest.fn(),
            cancelPerformerLearn: jest.fn(),
            clockEnabled: signal(false),
            clockBpm: signal(140),
            midiOutputs: signal([]),
            startClock: jest.fn(),
            stopClock: jest.fn(),
            setClockBpm: jest.fn(),
            setClockOutput: jest.fn(),
          },
        },
        {
          provide: PerformanceRecordingService,
          useValue: {
            isArmed: () => false,
            isRecording: () => false,
            armedTakeNumber: () => 1,
            recordMidi: jest.fn(),
            finishTake: jest.fn().mockResolvedValue(undefined),
            arm: jest.fn(),
            disarm: jest.fn(),
            startRecording: jest.fn(),
            takes: signal([]),
            takeCount: signal(0),
            selectedTakeId: signal(null),
            monitorEnabled: signal(false),
            phantomPowerEnabled: signal(false),
            toggleMonitor: jest.fn(),
            togglePhantom: jest.fn(),
            setComping: jest.fn(),
            exportTake: jest.fn(),
            deleteTake: jest.fn(),
            liveInputDbL: signal(-60),
            liveInputDbR: signal(-60),
            liveOutputDbL: signal(-60),
            liveOutputDbR: signal(-60),
          },
        },
        { provide: RecordingStatusService, useValue: { clearRecordingSource: jest.fn(), setRecordingSource: jest.fn() } },
        {
          provide: FxMacrosService,
          useValue: {
            presets: [],
            activeMacroId: signal(null),
            activeMacro: () => ({ name: 'Test', glyph: '🎛', description: '', xTarget: { label: 'X' }, yTarget: { label: 'Y' } }),
            engage: jest.fn(),
            release: jest.fn(),
            setXY: jest.fn(),
            setMacro: jest.fn(),
            reset: jest.fn(),
            engaged: signal(false),
            xyPos: signal({ x: 0.5, y: 0.5 }),
            currentValues: signal({ xLabel: '0', yLabel: '0' }),
          },
        },
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
