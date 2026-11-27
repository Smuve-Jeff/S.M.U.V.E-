import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { PerformerComponent } from "./performer.component";
import { AudioSessionService } from "../audio-session.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { LiveEngineService } from "../../services/live-engine.service";
import { InstrumentsService } from "../../services/instruments.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { HapticService } from "../../services/haptic.service";
import { DjMidiService } from "../../services/dj-midi.service";
import { PerformanceRecordingService } from "../performance-recording.service";
import { RecordingStatusService } from "../recording-status.service";
import { FxMacrosService } from "../../services/fx-macros.service";
import { StudioRecordingEngineService } from "../studio-recording-engine.service";
import { RecordingLimiterService } from "../recording-limiter.service";
import { Subject } from "rxjs";
import { FormsModule } from "@angular/forms";
import { signal, Component } from "@angular/core";

@Component({
  selector: "app-performance-grid",
  standalone: true,
  template: "<div></div>",
})
class StubPerformanceGridComponent {}

describe("PerformerComponent", () => {
  let component: PerformerComponent;
  let fixture: ComponentFixture<PerformerComponent>;
  let mockLiveEngine: any;

  beforeEach(async () => {
    mockLiveEngine = {
      activeInstrument: signal("grand-piano-v2"),
      smartChords: signal(false),
      arpeggiatorEnabled: signal(false),
      scaleLock: signal(false),
      scaleMode: signal("major"),
      scaleRoot: signal(0),
      setScaleRoot: jest.fn(),
      cutoff: signal(20000),
      resonance: signal(1),
      attack: signal(0.01),
      release: signal(0.5),
      setArpeggiatorEnabled: jest.fn(),
      setScaleLock: jest.fn(),
      initialize: jest.fn().mockResolvedValue(true),
      resumeContext: jest.fn(),
      setInstrument: jest.fn().mockResolvedValue(true),
      triggerNoteStart: jest.fn(),
      triggerNoteEnd: jest.fn(),
      noteEvents$: new Subject<any>(),
      setPitchBend: jest.fn(),
      setModulation: jest.fn(),
      setModWheel: jest.fn(),
      setScale: jest.fn(),
      updateParameter: jest.fn(),
      previewPatchReadout: jest.fn(),
      midiToNote: jest.fn().mockReturnValue("C4"),
      setOutputTarget: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PerformerComponent, FormsModule, StubPerformanceGridComponent],
      providers: [
        // Query params drive this surface, so the standalone component needs a
        // router to resolve ActivatedRoute during creation.
        provideRouter([]),
        {
          provide: MusicManagerService,
          useValue: {
            recordLiveNote: jest.fn(),
            tracks: signal([]),
            selectedTrackId: signal(null),
            updateVolume: jest.fn(),
            updateTrackPan: jest.fn(),
            engine: {
              updateTrack: jest.fn(),
              getTrackOutput: jest.fn(() => ({ id: "channel" })),
              masterAnalyser: {
                frequencyBinCount: 1024,
                getByteFrequencyData: jest.fn(),
              },
            },
            performerScenes: signal([]),
            livePerformance: signal({ octave: 0, chordType: "minor" }),
            setLivePerformance: jest.fn(),
            activeSceneId: signal(null),
            launchScene: jest.fn(),
            ensureTrack: jest.fn(),
            setInstrument: jest.fn(),
          },
        },
        {
          provide: AudioSessionService,
          useValue: {
            isPlaying: signal(false),
            isRecording: signal(false),
            micChannels: signal([]),
          },
        },
        { provide: AudioEngineService, useValue: { ctx: { currentTime: 0 } } },
        {
          provide: StudioRecordingEngineService,
          useValue: {
            isRecording: signal(false),
            recordingTime: signal(0),
            getAnalyserNode: () => null,
          },
        },
        {
          provide: RecordingLimiterService,
          useValue: {
            headroomPercent: signal(0),
            peakInputDb: signal(-60),
            isLimitingActive: signal(false),
            enabled: signal(true),
            setEnabled: jest.fn(),
          },
        },
        { provide: LiveEngineService, useValue: mockLiveEngine },
        {
          provide: HapticService,
          useValue: { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() },
        },
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
            midiLog: signal([]),
            slaveSyncEnabled: signal(false),
            slaveBpm: signal(120),
            slaveTransportRunning: signal(false),
            clearMidiLog: jest.fn(),
            toggleSlaveSync: jest.fn(),
            isDeviceEnabled: jest.fn(() => false),
            toggleDevice: jest.fn(),
            savePerformerCCMappings: jest.fn(),
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
        {
          provide: RecordingStatusService,
          useValue: {
            clearRecordingSource: jest.fn(),
            setRecordingSource: jest.fn(),
            beginRecording: jest.fn(),
            endRecording: jest.fn(),
          },
        },
        {
          provide: FxMacrosService,
          useValue: {
            presets: [],
            activeMacroId: signal(null),
            activeMacro: () => ({
              name: "Test",
              glyph: "🎛",
              description: "",
              xTarget: { label: "X" },
              yTarget: { label: "Y" },
            }),
            engage: jest.fn(),
            release: jest.fn(),
            setXY: jest.fn(),
            setMacro: jest.fn(),
            reset: jest.fn(),
            engaged: signal(false),
            xyPos: signal({ x: 0.5, y: 0.5 }),
            currentValues: signal({ xLabel: "0", yLabel: "0" }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerformerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("adopts the octave a restored project brings in while it is open", () => {
    const manager = TestBed.inject(MusicManagerService) as any;

    // The component stays mounted across a project load, so the constructor
    // seed alone would keep showing the previous set's transposition.
    manager.livePerformance.set({ octave: 1, chordType: "minor" });
    fixture.detectChanges();

    expect(component.octave()).toBe(1);
  });

  it("keeps a restored octave inside the range the nudge buttons reach", () => {
    const manager = TestBed.inject(MusicManagerService) as any;

    manager.livePerformance.set({ octave: 7, chordType: "minor" });
    fixture.detectChanges();
    expect(component.octave()).toBe(2);
    // The stored rig is normalized too, so the next save cannot write 7 back.
    expect(manager.setLivePerformance).toHaveBeenCalledWith({ octave: 2 });

    manager.setLivePerformance.mockClear();
    manager.livePerformance.set({ octave: -9, chordType: "minor" });
    fixture.detectChanges();
    expect(component.octave()).toBe(-2);
    expect(manager.setLivePerformance).toHaveBeenCalledWith({ octave: -2 });
  });

  it("clamps the octave seeded on mount as well", () => {
    const manager = TestBed.inject(MusicManagerService) as any;
    manager.livePerformance.set({ octave: 6, chordType: "minor" });

    const restored = TestBed.createComponent(PerformerComponent);
    restored.detectChanges();
    try {
      expect(restored.componentInstance.octave()).toBe(2);
      expect(manager.setLivePerformance).toHaveBeenCalledWith({ octave: 2 });
    } finally {
      restored.destroy();
    }
  });

  it("records every chord tone the engine publishes, not just the key press", () => {
    const engine = TestBed.inject(LiveEngineService) as any;
    const manager = TestBed.inject(MusicManagerService) as any;
    const session = TestBed.inject(AudioSessionService) as any;
    const takes = TestBed.inject(PerformanceRecordingService) as any;
    session.isRecording.set(true);

    for (const [midi, note, source] of [
      [60, "C4", "key"],
      [64, "E4", "chord"],
      [67, "G4", "chord"],
    ] as const) {
      engine.noteEvents$.next({
        type: "on",
        midi,
        note,
        velocity: 0.8,
        channel: 0,
        atMs: 0,
        source,
      });
    }

    expect(manager.recordLiveNote.mock.calls.map((call: any[]) => call[0])).toEqual([
      60, 64, 67,
    ]);
    expect(takes.recordMidi.mock.calls.map((call: any[]) => call[0])).toEqual([
      60, 64, 67,
    ]);
  });

  it("records every note repeat the engine publishes", () => {
    const engine = TestBed.inject(LiveEngineService) as any;
    const takes = TestBed.inject(PerformanceRecordingService) as any;

    for (let i = 0; i < 3; i += 1) {
      engine.noteEvents$.next({
        type: "on",
        midi: 60,
        note: "C4",
        velocity: 0.7,
        channel: 0,
        atMs: i * 250,
        source: "repeat",
        durationMs: 225,
      });
    }

    expect(takes.recordMidi).toHaveBeenCalledTimes(3);
  });

  it("leaves recording to the engine's note stream when a key is pressed", async () => {
    const manager = TestBed.inject(MusicManagerService) as any;
    const session = TestBed.inject(AudioSessionService) as any;
    session.isRecording.set(true);

    await component.onKeyDown(60);

    // A mocked engine sounds nothing, so the performer must not invent a note.
    expect(manager.recordLiveNote).not.toHaveBeenCalled();
  });

  it("should set instrument", async () => {
    await component.setInstrument("analog-warmth");
    expect(mockLiveEngine.setInstrument).toHaveBeenCalledWith("analog-warmth");
  });

  it("routes channel trims through the manager so undo and automation agree", () => {
    const manager = TestBed.inject(MusicManagerService) as any;
    manager.selectedTrackId.set("track-1");

    component.updateTrackVolume(62);
    expect(manager.updateVolume).toHaveBeenCalledWith("track-1", 0.62);

    component.updateTrackPan(-40);
    expect(manager.updateTrackPan).toHaveBeenCalledWith("track-1", -40);
  });

  it("routes the live instrument into the selected channel", () => {
    const manager = TestBed.inject(MusicManagerService) as any;
    manager.selectedTrackId.set("track-1");
    fixture.detectChanges();

    expect(manager.engine.getTrackOutput).toHaveBeenCalledWith("track-1");
    expect(mockLiveEngine.setOutputTarget).toHaveBeenCalledWith({
      id: "channel",
    });
  });

  it("applies the chosen instrument to the selected channel", async () => {
    const manager = TestBed.inject(MusicManagerService) as any;
    manager.selectedTrackId.set("track-1");

    await component.setInstrument("analog-warmth");

    expect(mockLiveEngine.setInstrument).toHaveBeenCalledWith("analog-warmth");
    expect(manager.setInstrument).toHaveBeenCalledWith(
      "track-1",
      "analog-warmth",
    );
  });

  it("should toggle smart chords", () => {
    component.toggleSmartChords();
    expect(component.smartChords()).toBe(true);
    expect(mockLiveEngine.smartChords()).toBe(true);
  });

  it("XY pad lifecycle engages on down and releases (reset) on up", () => {
    const fx = (TestBed as any).inject
      ? (TestBed as any).inject(FxMacrosService)
      : null;
    const fxMacros = (fx ?? component.fxMacros) as any;
    const pad = document.createElement("div");
    Object.defineProperty(pad, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    });
    const makeEvent = (id: number, x: number, y: number) =>
      ({
        pointerId: id,
        clientX: x,
        clientY: y,
        preventDefault: jest.fn(),
      }) as any;

    component.onPadDown(makeEvent(1, 25, 25), pad);
    expect(fxMacros.engage).toHaveBeenCalled();
    expect(fxMacros.setXY).toHaveBeenCalledWith(0.25, 0.75); // Y inverted on pad

    component.onPadUp(makeEvent(1, 25, 25), pad);
    expect(fxMacros.release).toHaveBeenCalled(); // release ⇒ reset parity path
  });

  it("device toggling delegates to DjMidiService (gating, not cosmetic)", () => {
    const midi = component.midiService as any;
    midi.isDeviceEnabled = jest.fn(() => false);
    component.toggleDevice("Controller X");
    expect(midi.toggleDevice).toHaveBeenCalledWith("Controller X");
    expect(component.isDeviceEnabled("Controller X")).toBe(false);
  });
  it('renders a MIDI send the device refused as a failure row', () => {
    component.midiLogOpen.set(true);
    (component as any).midiService.midiLog.set([
      {
        id: 1,
        type: 'send-failed',
        channel: 0,
        number: 176,
        value: 0,
        timestamp: 1,
      },
    ]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.midi-log-row');
    // A dropped send must not read like ordinary traffic in the log.
    expect(row?.classList).toContain('midi-log-failed');
    expect(row?.textContent).toContain('SEND-FAILED');
    expect(component.logTypeIcon('send-failed')).toBe('⚠');
  });

});
