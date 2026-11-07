import { ComponentFixture, TestBed } from "@angular/core/testing";
import { computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { TransportBarComponent } from "./transport-bar.component";
import { AudioSessionService } from "../audio-session.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { ExportService } from "../../services/export.service";
import { RecordingStatusService } from "../recording-status.service";
import { IdeasGeneratorService } from "../../services/ideas-generator.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { TakeManagerService } from "../../services/take-manager.service";
import { SnackbarService } from "../../services/snackbar.service";
import { ProjectService } from "../../services/project.service";
import { HapticService } from "../../services/haptic.service";
import { HistoryService } from "../../services/history.service";
import { StudioMidiLearnService } from "../studio-midi-learn.service";
import { createMockHapticService } from "../../testing/mocks/hardware.mock";

describe("TransportBarComponent", () => {
  let component: TransportBarComponent;
  let fixture: ComponentFixture<TransportBarComponent>;

  const playbackState = signal<"stopped" | "playing" | "recording">("stopped");
  const meter = signal({ beats: 4, unit: 4 });
  const mockAudioSession = {
    playbackState,
    isPlaying: computed(() => playbackState() === "playing"),
    isRecording: computed(() => playbackState() === "recording"),
    isStopped: computed(() => playbackState() === "stopped"),
    masterVolume: signal(80),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
    stop: jest.fn(),
    updateMasterVolume: jest.fn(),
    recordDestinations: signal([] as { trackId: string; trackName: string }[]),
    recordTargetLabel: signal("No record target — arm a track"),
    recordTargetDetail: signal("Arm a track in the mixer"),
  };

  const mockAudioEngine = {
    visualStep: signal(0),
    playbackLoopEnabled: signal(false),
    playbackLoopStart: signal<number | null>(null),
    playbackLoopEnd: signal<number | null>(null),
    setPlaybackLoop: jest.fn((start: number | null, end: number | null) => {
      mockAudioEngine.playbackLoopStart.set(start);
      mockAudioEngine.playbackLoopEnd.set(end);
      if (start === null || end === null) mockAudioEngine.playbackLoopEnabled.set(false);
      return end !== null && start !== null && end > start;
    }),
    // The component flips the loop through the engine now, so the mock has to
    // behave like it: flip the signal and report the new state.
    togglePlaybackLoop: jest.fn((enabled?: boolean) => {
      const next = enabled ?? !mockAudioEngine.playbackLoopEnabled();
      mockAudioEngine.playbackLoopEnabled.set(next);
      return next;
    }),
    tempo: signal(120),
    tempoAtStep: jest.fn(() => 120),
    secondsBetweenSteps: jest.fn(
      (from: number, to: number) => (to - from) * 0.125,
    ),
    getTempoMap: jest.fn(
      () => [] as { step: number; bpm: number; curve?: "step" | "ramp" }[],
    ),
    timeSignature: meter,
    stepsPerBar: () => meter().beats * (16 / meter().unit),
    stepsPerNotatedBeat: () => 16 / meter().unit,
    setTimeSignature: jest.fn((beats: number, unit: number) => {
      meter.set({ beats, unit });
      return { beats, unit };
    }),
    metronomeEnabled: signal(false),
    metronomeVolume: signal(0.5),
    clickSubdivision: signal<'none' | 'eighths' | 'triplets' | 'sixteenths'>(
      "none",
    ),
    clickSound: signal<'beep' | 'wood' | 'tick'>("beep"),
    countInLevel: signal(0.8),
    clickOutput: signal<'mix' | 'direct'>("mix"),
    isPlaying: jest.fn(() => true),
    isCountIn: jest.fn(() => false),
    // Mirrors the engine's clamp + tenth-of-a-BPM precision.
    setTempo: jest.fn((bpm: number) => {
      const clamped = Math.min(300, Math.max(20, Math.round(bpm * 10) / 10));
      mockAudioEngine.tempo.set(clamped);
      return clamped;
    }),
    outputPeak: signal(0),
    outputRms: signal(0),
    outputLevelDb: () => -60,
    outputProfileLabel: signal("FLAT"),
    monitorBlend: signal(0.5),
    monoMonitoring: signal(false),
    toggleMonoMonitoring: jest.fn(() => true),
    playMode: () => "pattern",
    externalOutputActive: () => false,
    outputDeviceName: () => "Default",
    supportsSinkId: () => false,
    outputDevices: () => [] as { deviceId: string; label: string }[],
    selectedOutputDeviceId: () => "",
    setOutputDevice: jest.fn(async () => true),
    resume: jest.fn(),
    startCountIn: jest.fn(),
    toggleMetronome: jest.fn(),
    auditionMetronome: jest.fn(),
    setMetronomeVolume: jest.fn(),
    setClickSubdivision: jest.fn(),
    setClickSound: jest.fn(),
    setCountInLevel: jest.fn(),
    setClickOutput: jest.fn(),
    getContext: jest.fn(() => null),
    masterGain: {},
  };

  const mockRecordingStatus = {
    masterLevelLinear: signal(0),
    masterPeakHoldLinear: signal(0),
    recordingLabel: signal(""),
    recordingDetail: signal(""),
    recordingCount: signal(0),
    recordDestinations: signal([] as { trackId: string; trackName: string }[]),
  };

  const mockIdeas = {
    recipes: [] as unknown[],
    applyGeneratedRecipe: jest.fn(),
  };

  const mockMusicManager = {
    selectedTrackId: () => null,
    selectedTrack: () => null,
    applyGeneratedRecipe: jest.fn(),
    projectName: "Test Project",
    lastScheduledNote: signal(null),
    tracks: () => [] as unknown[],
    snapshotProject: jest.fn(() => ({})),
    stopScenePlayback: jest.fn(),
    backToArrangement: jest.fn(),
    launchSceneColumn: jest.fn(),
    nextSceneColumn: jest.fn(() => 2),
    previousSceneColumn: jest.fn(() => 0),
  };

  const mockTakeManager = {
    isPunchIn: (_id: string) => signal(false),
    getTakes: (_id: string) => signal([] as unknown[]),
    setPunchIn: jest.fn(),
    stampTake: jest.fn(() => ({ startStep: 0, endStep: 15 })),
  };

  const mockSnackbar = {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    show: jest.fn(),
  };

  const mockHistory = {
    canUndo: signal(false),
    canRedo: signal(false),
    undoCount: signal(0),
    redoCount: signal(0),
    lastActionName: signal(""),
    undoLabels: signal<string[]>([]),
    redoLabels: signal<string[]>([]),
    undo: jest.fn(),
    redo: jest.fn(),
    undoToDepth: jest.fn(),
    execute: jest.fn(),
    coalesce: jest.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransportBarComponent, CommonModule, FormsModule],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        {
          provide: ExportService,
          useValue: {
            exportProjectWav: jest.fn(),
            exportStems: jest.fn(),
            exportProjectMidi: jest.fn(),
            downloadBlob: jest.fn(),
            exportAndShare: jest.fn(),
            shareMidi: jest.fn(),
          },
        },
        { provide: RecordingStatusService, useValue: mockRecordingStatus },
        { provide: IdeasGeneratorService, useValue: mockIdeas },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: TakeManagerService, useValue: mockTakeManager },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: ProjectService, useValue: { currentProject: () => null } },
        { provide: HapticService, useValue: createMockHapticService() },
        { provide: HistoryService, useValue: mockHistory },
        // The transport instantiates the learn service so persisted bindings
        // stay live; the panel itself is closed here, so a stub is enough.
        {
          provide: StudioMidiLearnService,
          useValue: {
            bindings: signal([]),
            learning: signal(null),
            groups: signal([]),
            bindingFor: () => undefined,
          },
        },
      ],
    }).compileComponents();

    // Reset module-level mock signals so tests stay isolated (the pulse test
    // flips playbackState to 'playing' and must not leak into later tests).
    playbackState.set("stopped");
    mockAudioEngine.tempo.set(120);
    mockAudioEngine.visualStep.set(0);
    mockRecordingStatus.recordingLabel.set("");
    mockRecordingStatus.recordingDetail.set("");
    mockRecordingStatus.recordingCount.set(0);
    mockAudioSession.recordDestinations.set([]);
    jest.clearAllMocks();

    fixture = TestBed.createComponent(TransportBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("opens the PPQ timing diagnostics and closes them from the panel", () => {
    expect(
      fixture.nativeElement.querySelector("app-timing-diagnostics"),
    ).toBeNull();

    const toggle = fixture.nativeElement.querySelector(
      ".ctb-timing-diag-btn",
    ) as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    toggle.click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector(
      "app-timing-diagnostics",
    );
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("PPQ Timing");
    expect(panel.textContent).toContain("960 PPQ");

    (panel.querySelector(".td-close") as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector("app-timing-diagnostics"),
    ).toBeNull();
  });

  it("shows the exact target and input behind the REC chip", () => {
    mockRecordingStatus.recordingLabel.set("Rec: Drum Machine");
    mockRecordingStatus.recordingDetail.set(
      "Target: New arrangement track · Studio master output",
    );
    mockRecordingStatus.recordingCount.set(2);
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector(
      ".ctb-rec-source",
    ) as HTMLElement;
    expect(chip.textContent).toContain("Rec: Drum Machine");
    expect(chip.textContent).toContain(
      "Target: New arrangement track · Studio master output",
    );
    expect(chip.getAttribute("title")).toContain("Studio master output");
    expect(chip.querySelector(".ctb-rec-count")?.textContent).toContain("2");
  });

  it("names the record destination before REC is pressed", () => {
    mockAudioSession.recordTargetLabel.set("Rec target: Bass");
    mockAudioSession.recordTargetDetail.set(
      "Armed in the mixer · Microphone input",
    );
    fixture.detectChanges();

    const target = fixture.nativeElement.querySelector(
      ".ctb-rec-target",
    ) as HTMLElement;
    expect(target.textContent).toContain("Rec target: Bass");
    expect(target.getAttribute("title")).toContain("Armed in the mixer");
  });

  it("arms punch-in on the record destinations, not just the selection", () => {
    mockAudioSession.recordDestinations.set([
      { trackId: "track-2", trackName: "Bass" },
    ]);

    component.togglePunchIn();

    expect(mockTakeManager.setPunchIn).toHaveBeenCalledWith("track-2", true);
  });

  it("maps a game controller onto transport and scenes", () => {
    // A — play / stop
    (component as any).onGamepadButton(0);
    expect(mockAudioSession.togglePlay).toHaveBeenCalled();

    // B — stop: also leaves the launched scene.
    playbackState.set("playing");
    (component as any).onGamepadButton(1);
    expect(mockMusicManager.stopScenePlayback).toHaveBeenCalled();
    expect(mockAudioSession.stop).toHaveBeenCalled();

    // RB / LB — next and previous scene
    (component as any).onGamepadButton(5);
    expect(mockMusicManager.launchSceneColumn).toHaveBeenCalledWith(2);
    (component as any).onGamepadButton(4);
    expect(mockMusicManager.launchSceneColumn).toHaveBeenCalledWith(0);

    // Y — back to the arrangement
    (component as any).onGamepadButton(3);
    expect(mockMusicManager.backToArrangement).toHaveBeenCalled();
  });

  it("lists the named history stack and restores the clicked point", () => {
    mockHistory.undoCount.set(3);
    mockHistory.undoLabels.set(["Set volume", "Move clip", "Add note"]);

    component.toggleHistoryPanel();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector("#ctb-history-panel")).not.toBeNull();
    expect(host.querySelectorAll(".ctb-history-row")).toHaveLength(3);

    // Clicking the middle step restores the state before it: two older steps
    // stay on the undo stack.
    component.jumpToHistoryStep(1);
    expect(mockHistory.undoToDepth).toHaveBeenCalledWith(1);

    component.toggleHistoryPanel();
    fixture.detectChanges();
    expect(host.querySelector("#ctb-history-panel")).toBeNull();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("primary and secondary control hierarchy", () => {
    it("keeps only playback, tempo and position controls in the primary row", () => {
      const primary = fixture.nativeElement.querySelector(
        ".ctb-primary-row",
      ) as HTMLElement;
      expect(primary.querySelector(".ctb-play")).toBeTruthy();
      expect(primary.querySelector(".ctb-stop")).toBeTruthy();
      expect(primary.querySelector(".ctb-rec")).toBeTruthy();
      expect(primary.querySelector(".ctb-tempo")).toBeTruthy();
      expect(primary.querySelector(".ctb-position")).toBeTruthy();
      expect(primary.querySelector(".ctb-tap")).toBeNull();
      expect(primary.querySelector(".ctb-countin")).toBeNull();
      expect(primary.querySelector(".ctb-loop-ab")).toBeNull();
    });

    it("opens a compact secondary-controls panel for advanced actions", () => {
      const details = fixture.nativeElement.querySelector(
        ".ctb-secondary",
      ) as HTMLDetailsElement;
      expect(details.open).toBe(false);
      details
        .querySelector("summary")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      fixture.detectChanges();
      expect(details.open).toBe(true);
      expect(details.querySelector(".ctb-click-settings")).toBeTruthy();
      expect(details.querySelector(".ctb-countin")).toBeTruthy();
      expect(details.querySelector(".ctb-click-volume-slider")).toBeTruthy();
      expect(details.querySelector(".ctb-click-test")).toBeTruthy();
      expect(details.querySelector(".ctb-loop-ab")).toBeTruthy();
      expect(details.querySelector(".ctb-undo")).toBeTruthy();
      expect(details.querySelector(".ctb-test-sound")).toBeTruthy();
      expect(details.querySelector(".ctb-volume-slider")).toBeTruthy();
      expect(details.querySelector(".ctb-output-group")).toBeTruthy();
      expect(details.querySelector(".ctb-ideas")).toBeTruthy();
    });

    it("labels the click toggle and exposes its level, test and count-in", () => {
      const toggle = fixture.nativeElement.querySelector(
        ".ctb-click-toggle",
      ) as HTMLButtonElement;
      expect(toggle.querySelector(".ctb-click-label")?.textContent?.trim()).toBe(
        "Click",
      );
      expect(toggle.getAttribute("aria-label")).toContain("volume 50%");

      const input = fixture.nativeElement.querySelector(
        ".ctb-click-volume-slider",
      ) as HTMLInputElement;
      input.value = "75";
      input.dispatchEvent(new Event("input"));
      fixture.detectChanges();
      expect(mockAudioEngine.setMetronomeVolume).toHaveBeenCalledWith(0.75);

      component.testMetronome();
      expect(mockAudioEngine.resume).toHaveBeenCalled();
      expect(mockAudioEngine.auditionMetronome).toHaveBeenCalled();
    });

    it("offers subdivision, sound, count-in level and click output", () => {
      const details = fixture.nativeElement.querySelector(
        ".ctb-secondary",
      ) as HTMLDetailsElement;
      if (!details.open) {
        details
          .querySelector("summary")
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        fixture.detectChanges();
      }

      const chip = (label: string) =>
        details.querySelector(
          `.ctb-click-chip[aria-label="${label}"]`,
        ) as HTMLButtonElement;

      expect(details.querySelectorAll(".ctb-click-chip").length).toBe(9);

      chip("Click subdivision 1/8").click();
      expect(mockAudioEngine.setClickSubdivision).toHaveBeenCalledWith(
        "eighths",
      );

      chip("Click sound Wood").click();
      expect(mockAudioEngine.setClickSound).toHaveBeenCalledWith("wood");
      expect(mockAudioEngine.auditionMetronome).toHaveBeenCalled();

      chip("Click output Direct").click();
      expect(mockAudioEngine.setClickOutput).toHaveBeenCalledWith("direct");

      const slider = details.querySelector(
        ".ctb-countin-level-slider",
      ) as HTMLInputElement;
      slider.value = "60";
      slider.dispatchEvent(new Event("input"));
      expect(mockAudioEngine.setCountInLevel).toHaveBeenCalledWith(0.6);
    });
  });

  it('wires A/B markers and loop enabled state to the audio engine', () => {
    mockAudioEngine.visualStep.set(16);
    component.setLoopMarker('start');
    expect(mockAudioEngine.setPlaybackLoop).toHaveBeenCalledWith(16, null);
    mockAudioEngine.visualStep.set(32);
    component.setLoopMarker('end');
    expect(mockAudioEngine.setPlaybackLoop).toHaveBeenCalledWith(16, 32);
    component.toggleLoop();
    expect(mockAudioEngine.playbackLoopEnabled()).toBe(true);
    component.clearLoopRegion();
    expect(mockAudioEngine.playbackLoopEnabled()).toBe(false);
  });

  it('exports at the chosen delivery rate and tags the label', async () => {
    expect(component.exportRateLabel()).toBe('44.1 kHz');
    component.toggleExportSampleRate();
    expect(component.exportSampleRate()).toBe(48000);
    expect(component.exportRateLabel()).toBe('48 kHz');

    const exportWav = jest
      .spyOn(TestBed.inject(ExportService), 'exportProjectWav')
      .mockResolvedValueOnce(new Blob(['wav'], { type: 'audio/wav' }));
    await component.exportWav();
    expect(exportWav).toHaveBeenCalledWith(
      16,
      48000,
      expect.any(Function),
      expect.any(AbortSignal),
    );

    // The rate is not a WAV-only setting: stems carry it too.
    const exportStems = jest
      .spyOn(TestBed.inject(ExportService), 'exportStems')
      .mockResolvedValueOnce(new Blob(['zip'], { type: 'application/zip' }));
    await component.exportStems();
    expect(exportStems).toHaveBeenCalledWith(
      expect.objectContaining({
        bitDepth: 24,
        sampleRate: 48000,
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });

  it('shows real render progress while a WAV export is running', async () => {
    let report: ((percent: number) => void) | undefined;
    let resolve!: (blob: Blob) => void;
    jest
      .spyOn(TestBed.inject(ExportService), 'exportProjectWav')
      .mockImplementation(
        (
          _bitDepth: 16 | 24,
          _sampleRate: number,
          onProgress?: (percent: number) => void,
        ) => {
          report = onProgress;
          return new Promise<Blob>((done) => {
            resolve = done;
          });
        },
      );

    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const pending = component.exportWav();
    expect(component.isExporting()).toBe(true);
    expect(report).toBeDefined();
    now.mockReturnValue(4_000);
    report!(42);

    expect(component.exportProgress()).toBe(42);
    expect(component.exportProgressLabel()).toBe('Rendering… 42%');
    expect(component.exportEta()).toBe('<5s');

    resolve(new Blob(['wav'], { type: 'audio/wav' }));
    await pending;
    expect(component.exportProgress()).toBeNull();
    expect(component.exportEta()).toBeNull();
    expect(component.isExporting()).toBe(false);
    now.mockRestore();
  });

  it('surfaces render failures and clears the exporting busy state', async () => {
    jest.spyOn(TestBed.inject(ExportService), 'exportProjectWav').mockRejectedValueOnce(new Error('Render failed'));
    await component.exportWav();
    expect(mockSnackbar.error).toHaveBeenCalledWith('WAV export failed · Render failed');
    expect(component.isExporting()).toBe(false);
  });

  describe("core transport smoke test", () => {
    it("keeps Play/Pause, Stop, Record and tempo controls functional", () => {
      const root: HTMLElement = fixture.nativeElement;
      root.querySelector<HTMLButtonElement>(".ctb-play")!.click();
      expect(mockAudioEngine.resume).toHaveBeenCalled();
      expect(mockAudioSession.togglePlay).toHaveBeenCalled();

      root.querySelector<HTMLButtonElement>(".ctb-stop")!.click();
      expect(mockAudioSession.stop).toHaveBeenCalled();

      root.querySelector<HTMLButtonElement>(".ctb-rec")!.click();
      expect(mockAudioSession.toggleRecord).toHaveBeenCalled();

      root.querySelectorAll<HTMLButtonElement>(".ctb-nudge")[1].click();
      expect(mockAudioEngine.tempo()).toBe(121);
    });
  });

  describe("Stage 2.0 position readout", () => {
    beforeEach(() => {
      meter.set({ beats: 4, unit: 4 });
      mockAudioEngine.setTimeSignature.mockClear();
    });

    it("maps the engine step to Bar : Beat : Sixteenth in 4/4", () => {
      // Step 25 → bar 2 (16 steps/bar), beat 3, sixteenth 2.
      mockAudioEngine.visualStep.set(25);
      expect(component.positionReadout()).toEqual({
        bar: 2,
        beat: 3,
        sixteenth: 2,
      });
    });

    it("starts at bar 1, beat 1, sixteenth 1", () => {
      mockAudioEngine.visualStep.set(0);
      expect(component.positionReadout()).toEqual({
        bar: 1,
        beat: 1,
        sixteenth: 1,
      });
    });

    it("clamps negative playhead values to the start of the bar", () => {
      mockAudioEngine.visualStep.set(-4);
      expect(component.positionReadout()).toEqual({
        bar: 1,
        beat: 1,
        sixteenth: 1,
      });
    });

    it("exposes the 4/4 time signature chip", () => {
      expect(component.timeSignature).toBe("4/4");
    });

    it("maps the position through a 3/4 meter", () => {
      component.setTimeSignature({ target: { value: "3/4" } } as any);
      expect(mockAudioEngine.setTimeSignature).toHaveBeenCalledWith(3, 4);
      expect(component.timeSignature).toBe("3/4");
      // 3 beats × 4 steps = 12 steps per bar; step 15 is bar 2, beat 1.
      mockAudioEngine.visualStep.set(15);
      expect(component.positionReadout()).toEqual({
        bar: 2,
        beat: 1,
        sixteenth: 4,
      });
    });

    it("counts eighth-note beats in 6/8", () => {
      component.setTimeSignature({ target: { value: "6/8" } } as any);
      // 6 beats × 2 steps = 12 steps per bar; step 9 is beat 5, eighth 2.
      mockAudioEngine.visualStep.set(9);
      expect(component.positionReadout()).toEqual({
        bar: 1,
        beat: 5,
        sixteenth: 2,
      });
    });
  });

  describe("pulse state", () => {
    it("adds the is-playing class to the shell while transport rolls", () => {
      const shell: HTMLElement =
        fixture.nativeElement.querySelector(".ctb-shell");
      expect(shell.classList.contains("is-playing")).toBe(false);

      playbackState.set("playing");
      fixture.detectChanges();

      expect(shell.classList.contains("is-playing")).toBe(true);
    });
  });

  describe("tap tempo", () => {
    it("sets the tempo from measured tap intervals", () => {
      const nowSpy = jest.spyOn(performance, "now");
      nowSpy.mockReturnValueOnce(1_000);
      component.tapTempo();
      nowSpy.mockReturnValueOnce(1_500); // 500 ms → 120 BPM
      component.tapTempo();

      expect(mockAudioEngine.tempo()).toBe(120);
      nowSpy.mockRestore();
    });

    it("clamps wild guesses to 40–240 BPM", () => {
      const nowSpy = jest.spyOn(performance, "now");
      nowSpy.mockReturnValueOnce(1_000);
      component.tapTempo();
      nowSpy.mockReturnValueOnce(1_010); // 10 ms → 6000 BPM → clamped to 240
      component.tapTempo();

      expect(mockAudioEngine.tempo()).toBe(240);
      nowSpy.mockRestore();
    });
  });

  describe("count-in", () => {
    it("starts an audible count-in instead of instant play when armed", () => {
      component.countInBars.set(1);
      component.togglePlay();

      expect(mockAudioEngine.resume).toHaveBeenCalled();
      expect(mockAudioEngine.startCountIn).toHaveBeenCalledWith(1);
      expect(playbackState()).toBe("playing");
    });

    it("applies the same count-in before arming REC", () => {
      component.countInBars.set(2);

      component.toggleRecord();

      expect(mockAudioSession.toggleRecord).toHaveBeenCalledWith(2);
    });

    it("does not leave Play latched when the count-in never starts", () => {
      mockAudioEngine.isPlaying.mockReturnValueOnce(false);
      component.countInBars.set(1);

      component.togglePlay();

      expect(playbackState()).toBe("stopped");
    });
  });

  describe("precise tempo editing", () => {
    const tempoEvent = (value: string) => {
      const input = document.createElement("input");
      input.value = value;
      return { target: input } as unknown as Event;
    };

    it("accepts tenths of a BPM and shows them", () => {
      component.onTempoInput(tempoEvent("124.5"));

      expect(mockAudioEngine.tempo()).toBe(124.5);
      expect(component.tempoLabel()).toBe("124.5");
    });

    it("clamps out-of-range input and echoes the committed value", () => {
      const event = tempoEvent("400");
      component.onTempoInput(event);

      expect(mockAudioEngine.tempo()).toBe(300);
      expect((event.target as HTMLInputElement).value).toBe("300");
    });

    it("restores the field when the entry is not a number", () => {
      const event = tempoEvent("");
      component.onTempoInput(event);

      expect(mockAudioEngine.tempo()).toBe(120);
      expect((event.target as HTMLInputElement).value).toBe("120");
    });

    it("records typed tempo as one coalesced undo step", () => {
      component.onTempoInput(tempoEvent("124.5"));

      expect(mockHistory.coalesce).toHaveBeenCalledTimes(1);
      const command = mockHistory.coalesce.mock.calls[0][0];
      expect(command).toMatchObject({ name: "Set tempo", mergeKey: "tempo:entry" });

      // Undo returns the transport to the BPM the artist started typing from.
      command.undo();
      expect(mockAudioEngine.tempo()).toBe(120);
      // Redo puts the committed tempo back.
      command.execute();
      expect(mockAudioEngine.tempo()).toBe(124.5);
    });

    it("records nudges and presets as discrete undo steps", () => {
      component.nudgeTempo(1);

      expect(mockHistory.execute).toHaveBeenCalledTimes(1);
      const command = mockHistory.execute.mock.calls[0][0];
      expect(command.name).toBe("Set tempo · 121 BPM");
      expect(command.mergeKey).toBeUndefined();

      command.undo();
      expect(mockAudioEngine.tempo()).toBe(120);
    });
  });

  describe("dB readouts", () => {
    it("formats negative infinity, unity and over-zero levels", () => {
      expect(component.formatDb(-Infinity)).toBe("−∞");
      expect(component.formatDb(0)).toBe("0.0");
      expect(component.formatDb(1.5)).toBe("+1.5");
    });
  });

  // ── Sprint A3 loop-recording: auto-stamped takes ──
  describe("punch-in take stamping", () => {
    const track = {
      id: "track-1",
      name: "Lead",
      notes: [{ id: "n1", midi: 60, step: 0, length: 1, velocity: 0.8 }],
    };
    const original = {
      selectedTrack: mockMusicManager.selectedTrack,
      selectedTrackId: mockMusicManager.selectedTrackId,
      tracks: mockMusicManager.tracks,
      isPunchIn: mockTakeManager.isPunchIn,
      getTakes: mockTakeManager.getTakes,
    };

    beforeEach(() => {
      mockMusicManager.selectedTrack = () => track as any;
      mockMusicManager.selectedTrackId = () => track.id;
      mockMusicManager.tracks = () => [track] as any;
      mockAudioSession.recordDestinations.set([
        { trackId: track.id, trackName: track.name },
      ]);
      mockTakeManager.isPunchIn = () => signal(true);
      mockTakeManager.getTakes = () => signal([] as unknown[]);
    });

    afterEach(() => {
      mockMusicManager.selectedTrack = original.selectedTrack;
      mockMusicManager.selectedTrackId = original.selectedTrackId;
      mockMusicManager.tracks = original.tracks;
      mockTakeManager.isPunchIn = original.isPunchIn;
      mockTakeManager.getTakes = original.getTakes;
    });

    /** Run the transport-bar effects for the current signal state. */
    const tick = () => {
      TestBed.flushEffects();
      fixture.detectChanges();
    };

    it("stamps a take on each loop wrap, then the final pass on stop", () => {
      playbackState.set("recording");
      mockAudioEngine.visualStep.set(0);
      tick();
      expect(mockTakeManager.stampTake).not.toHaveBeenCalled();

      mockAudioEngine.visualStep.set(16);
      tick();
      expect(mockTakeManager.stampTake).not.toHaveBeenCalled();

      // Playhead wrapped backwards → a loop pass completed while recording.
      mockAudioEngine.visualStep.set(4);
      tick();
      expect(mockTakeManager.stampTake).toHaveBeenCalledTimes(1);
      expect(mockTakeManager.stampTake).toHaveBeenCalledWith(
        "track-1",
        "Take 1",
        track.notes,
        4,
      );

      playbackState.set("stopped");
      tick();
      expect(mockTakeManager.stampTake).toHaveBeenCalledTimes(2);
    });

    it("stamps every armed destination track, not only the selected one", () => {
      const bass = { id: "track-2", name: "Bass", notes: [] };
      mockMusicManager.tracks = () => [track, bass] as any;
      mockAudioSession.recordDestinations.set([
        { trackId: "track-1", trackName: "Lead" },
        { trackId: "track-2", trackName: "Bass" },
      ]);

      playbackState.set("recording");
      tick();
      playbackState.set("stopped");
      tick();

      expect(mockTakeManager.stampTake).toHaveBeenCalledWith(
        "track-1",
        "Take 1",
        track.notes,
        expect.any(Number),
      );
      expect(mockTakeManager.stampTake).toHaveBeenCalledWith(
        "track-2",
        "Take 1",
        [],
        expect.any(Number),
      );
    });

    it("does not stamp when punch-in was not armed for the pass", () => {
      mockTakeManager.isPunchIn = () => signal(false);

      playbackState.set("recording");
      mockAudioEngine.visualStep.set(8);
      tick();
      mockAudioEngine.visualStep.set(2);
      tick();
      playbackState.set("stopped");
      tick();

      expect(mockTakeManager.stampTake).not.toHaveBeenCalled();
    });
  });
});
