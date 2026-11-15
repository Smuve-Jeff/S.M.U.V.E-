import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { readFileSync } from "fs";
import { join } from "path";
import { VocalSuiteComponent } from "./vocal-suite.component";
import { UIService } from "../../services/ui.service";
import { MicrophoneService } from "../../services/microphone.service";
import { VocalMasteringService } from "../../services/vocal-mastering.service";
import { VocalAiService } from "../../services/vocal-ai.service";
import { AiService } from "../../services/ai.service";
import { AudioSessionService } from "../audio-session.service";
import { StudioRecordingEngineService } from "../studio-recording-engine.service";
import { PitchCorrectionService } from "../pitch-correction.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioEngineLatencyService } from "../../services/audio-engine-latency.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { LoggingService } from "../../services/logging.service";
import { SnackbarService } from "../../services/snackbar.service";
import { SmartRecordingService } from "../smart-recording.service";
import { VocalBackingTrackService } from "../backing-track.service";
import { AUDITION_PREFS_KEY } from "./audition-settings.util";

describe("VocalSuiteComponent", () => {
  let component: VocalSuiteComponent;
  let fixture: ComponentFixture<VocalSuiteComponent>;
  let microphoneServiceMock: any;
  let masteringMock: any;
  let musicManagerMock: any;
  let audioEngineMock: any;
  let backingMock: any;
  let recordingEngineMock: any;
  /** Providers built per test, reused by the mounted-template check. */
  let testProviders: any[] = [];
  const masteringOutput = { id: "mastering-output" };
  const mockSmartRecording = {
    addTakeFromRecording: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    // Audition choices are remembered per device; tests must not inherit them.
    localStorage.removeItem(AUDITION_PREFS_KEY);
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 1 as unknown as number);
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    microphoneServiceMock = {
      isInitialized: signal(false),
      isRecording: signal(false),
      isPaused: signal(false),
      recordingTime: signal(0),
      recordedBlob: signal<Blob | null>(null),
      availableDevices: signal([
        {
          deviceId: "default",
          label: "Default Interface",
          type: "interface",
          isDefault: true,
          capabilities: ["default", "phantom-power", "stereo", "usb-interface"],
        },
      ]),
      selectedDeviceId: signal<string | null>(null),
      // Read by the real mic interface child component, which the mounted
      // template check instantiates.
      inputLevel: signal(0),
      lastError: signal<string | null>(null),
      capturePathLabel: signal("Recorder"),
      canSwitchDevice: signal(false),
      permissionState: signal("granted"),
      refreshDevices: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(true),
      getAnalyserNode: jest.fn().mockReturnValue({}),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      attachProcessedCapture: jest.fn().mockReturnValue(true),
      // The recorder path stays the default here: it is the fallback on hosts
      // where the capture worklet cannot run. Lossless cases opt in explicitly.
      getCaptureStream: jest.fn(() => ({ id: "capture-stream" })),
    };

    masteringMock = {
      params: signal({
        deesser: { threshold: -24, frequency: 6500, bypass: false },
        multiband: {
          low: { threshold: -20, ratio: 4, bypass: false },
          mid: { threshold: -18, ratio: 2.5, bypass: false },
          high: { threshold: -16, ratio: 2, bypass: false },
        },
        exciter: { amount: 0.1, frequency: 8000, bypass: false },
        eq: { low: 0, mid: 0, high: 0, bypass: false },
        limiter: { ceiling: -0.1, release: 0.1, bypass: false },
      }),
      updateNodes: jest.fn(),
      updateParams: jest.fn(),
      applyToSource: jest.fn(),
      getOutputNode: jest.fn().mockReturnValue(masteringOutput),
    };

    recordingEngineMock = {
      isInitialized: signal(false),
      isRecording: signal(false),
      isPaused: signal(false),
      recordingTime: signal(0),
      inputLevel: signal(0),
      recordedBlob: signal<Blob | null>(null),
      pendingMidi: [],
      initialize: jest.fn().mockResolvedValue(true),
      prepareCaptureWorklet: jest.fn().mockResolvedValue(false),
      startRecording: jest.fn(),
      stopRecording: jest.fn().mockResolvedValue(undefined),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      getAnalyserNode: jest.fn().mockReturnValue({}),
    };

    musicManagerMock = {
      addAudioTrack: jest.fn(),
      tracks: signal<any[]>([]),
      stemAudioCache: new Map<string, AudioBuffer>(),
    };
    backingMock = {
      track: signal<any>(null),
      isPlaying: signal(false),
      loop: signal(false),
      levelPercent: signal(80),
      positionSeconds: signal(0),
      positionLabel: signal("0:00"),
      durationLabel: signal("0:00"),
      lastError: signal<string | null>(null),
      loadFile: jest.fn().mockResolvedValue(true),
      play: jest.fn().mockReturnValue(true),
      restart: jest.fn().mockReturnValue(true),
      stop: jest.fn(),
      clear: jest.fn(),
      setLevel: jest.fn(),
      toggleLoop: jest.fn(),
    };
    backingMock.hasTrack = jest.fn(() => backingMock.track() !== null);
    backingMock.useBuffer = jest.fn(() => true);
    audioEngineMock = {
      tempo: signal(120),
      isPlaying: signal(false),
      seekToStep: jest.fn(() => 0),
      stepsPerBar: jest.fn(() => 16),
      start: jest.fn(),
      stop: jest.fn(),
      transportStartTime: jest.fn(() => 0),
      setPlaybackLoop: jest.fn(() => true),
      togglePlaybackLoop: jest.fn((enabled?: boolean) => enabled ?? true),
      playbackLoopEnabled: signal(false),
      playbackLoopStart: signal<number | null>(null),
      playbackLoopEnd: signal<number | null>(null),
      ctx: Object.assign(new (window as any).AudioContext(), {
        // The shared mock returns fixed-length channel data; take editing needs
        // buffers sized to the request.
        createBuffer: (channels: number, length: number, sampleRate: number) =>
          new (globalThis as any).AudioBuffer({
            length,
            sampleRate,
            numberOfChannels: channels,
          }),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [VocalSuiteComponent],
      providers: (testProviders = [
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: VocalBackingTrackService, useValue: backingMock },
        {
          provide: AudioEngineLatencyService,
          useValue: {
            trimAudioBuffer: jest.fn((buffer: AudioBuffer) => buffer),
          },
        },
        { provide: AudioEngineService, useValue: audioEngineMock },
        {
          provide: LoggingService,
          useValue: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
        },
        {
          provide: SnackbarService,
          useValue: {
            success: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            warning: jest.fn(),
          },
        },
        {
          provide: UIService,
          useValue: {
            activeTheme: signal({ name: "test", primary: "purple" }),
            navigateToView: jest.fn(),
          },
        },
        { provide: MicrophoneService, useValue: microphoneServiceMock },
        { provide: SmartRecordingService, useValue: mockSmartRecording },
        { provide: VocalMasteringService, useValue: masteringMock },
        {
          provide: PitchCorrectionService,
          useValue: {
            // Real-time worklet chain unavailable in tests — the vocal suite
            // falls back to the raw mic node, which the mastering assertion
            // below still expects.
            insertIntoChain: jest.fn().mockResolvedValue(null),
            enabled: signal(false),
            amount: signal(0.5),
            retuneSpeed: signal(0.1),
            scale: signal("C Major"),
          },
        },
        {
          provide: StudioRecordingEngineService,
          useValue: recordingEngineMock,
        },
        {
          provide: VocalAiService,
          useValue: {
            toggleFeedbackMode: jest.fn(),
            isPassiveMode: signal(true),
            vocalIntel: signal([]),
          },
        },
        {
          provide: AiService,
          useValue: {
            strategicDecrees: signal(["READY"]),
          },
        },
        {
          provide: AudioSessionService,
          useValue: {
            micChannels: signal([
              {
                id: "mic-1",
                label: "Lead Vox",
                level: 60,
                muted: false,
                pan: 0,
                armed: true,
                deviceId: "mic-1",
              },
            ]),
            updateChannelDevice: jest.fn(),
            toggleChannelArm: jest.fn(),
            toggleChannelMute: jest.fn(),
            updateChannelPan: jest.fn(),
          },
        },
      ]),
    })
      .overrideComponent(VocalSuiteComponent, {
        // The logic cases below drive the component directly; the mounted
        // template is covered separately by the render check at the end.
        set: { template: "<div></div>" },
      })
      .compileComponents();

    fixture = TestBed.createComponent(VocalSuiteComponent);
    component = fixture.componentInstance;
    // Count-in cases opt in; the rest would otherwise wait a bar of clicks.
    component.countInEnabled.set(false);
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates the vocal suite", () => {
    expect(component).toBeTruthy();
  });

  it("initializes the microphone when entering the record step", async () => {
    component.setStep("record");
    await Promise.resolve();

    expect(microphoneServiceMock.initialize).toHaveBeenCalled();
  });

  it("connects the microphone analyser to the vocal mastering chain", async () => {
    await component.initializeMic();

    expect(masteringMock.applyToSource).toHaveBeenCalledWith(
      microphoneServiceMock.getAnalyserNode(),
    );
  });

  it("records the mastered chain instead of the dry mic feed", async () => {
    await component.initializeMic();

    expect(microphoneServiceMock.attachProcessedCapture).toHaveBeenCalledWith(
      masteringOutput,
    );
  });

  it("offers the song's audio tracks as the backing", () => {
    const buffer = new (globalThis as any).AudioBuffer({
      length: 256,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    musicManagerMock.stemAudioCache.set("clip_1", buffer);
    musicManagerMock.tracks.set([
      {
        id: "audio_1",
        name: "Beat",
        type: "audio",
        clips: [{ id: "clip_1", audioRefId: "clip_1" }],
      },
      { id: "synth_1", name: "Keys", type: "synth", clips: [] },
    ]);

    expect(component.arrangementTracks().map((track) => track.name)).toEqual([
      "Beat",
    ]);
    expect(component.arrangementTracks()[0].clipCount).toBe(1);

    component.useArrangementTrack({ target: { value: "audio_1" } } as any);

    expect(backingMock.useBuffer).toHaveBeenCalledWith(
      buffer,
      "Beat",
      "audio_1",
      1,
    );
  });

  it("builds one aligned guide from every clip of a track", () => {
    const first = new (globalThis as any).AudioBuffer({
      length: 44100,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    const second = new (globalThis as any).AudioBuffer({
      length: 22050,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    musicManagerMock.stemAudioCache.set("clip_a", first);
    musicManagerMock.stemAudioCache.set("clip_b", second);
    musicManagerMock.tracks.set([
      {
        id: "audio_2",
        name: "Drums",
        type: "audio",
        clips: [
          { id: "clip_a", audioRefId: "clip_a", start: 0 },
          { id: "clip_b", audioRefId: "clip_b", start: 2 },
        ],
      },
    ]);

    const guide = component.arrangementTracks()[0];

    // 120 BPM: bar 2 starts at 4 s, and the second clip lasts 0.5 s.
    expect(guide.clipCount).toBe(2);
    expect(guide.buffer.duration).toBeCloseTo(4.5, 2);
  });

  it("clicks a bar before arming when the count-in is on", async () => {
    jest.useFakeTimers();
    try {
      microphoneServiceMock.isInitialized.set(true);
      component.countInEnabled.set(true);

      const promise = component.toggleRecording();
      expect(component.countingTake()).toBe(true);

      jest.advanceTimersByTime(2100);
      await promise;

      expect(component.countingTake()).toBe(false);
      expect(microphoneServiceMock.startRecording).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("cancels a running count-in instead of arming over it", async () => {
    jest.useFakeTimers();
    try {
      microphoneServiceMock.isInitialized.set(true);
      component.countInEnabled.set(true);

      const promise = component.toggleRecording();
      expect(component.countingTake()).toBe(true);

      await component.toggleRecording();
      expect(component.countingTake()).toBe(false);

      jest.advanceTimersByTime(2100);
      await promise;

      expect(microphoneServiceMock.startRecording).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("explains an empty picker when the song's audio has nothing cached", () => {
    musicManagerMock.tracks.set([
      { id: "audio_1", name: "Beat", type: "audio", clips: [] },
    ]);

    expect(component.arrangementTracks()).toEqual([]);
    expect(component.guideHint()).toContain("no cached audio");
  });

  it("auditions a take over the song's transport", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 2048,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);

    await component.auditionTake();

    expect(audioEngineMock.seekToStep).toHaveBeenCalled();
    expect(audioEngineMock.start).toHaveBeenCalled();

    component.stopAudition();
    expect(audioEngineMock.stop).toHaveBeenCalled();
  });

  it("loops the in-mix audition over the take's region", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 44100, // 1 s at 44.1 kHz
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    component.loopAudition.set(true);

    await component.auditionTake();

    // 120 BPM 4/4: a step is 0.125 s, so a 1 s take covers 8 steps from bar 1.
    expect(audioEngineMock.setPlaybackLoop).toHaveBeenCalledWith(0, 8);
    expect(audioEngineMock.togglePlaybackLoop).toHaveBeenCalledWith(true);

    component.stopAudition();

    // The session's own loop comes back untouched.
    expect(audioEngineMock.setPlaybackLoop).toHaveBeenLastCalledWith(null, null);
    expect(audioEngineMock.togglePlaybackLoop).toHaveBeenLastCalledWith(false);
  });

  it("starts a bar early so the singer hears the song before the take", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 44100, // 1 s
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    // The take was sung starting one bar in (120 BPM → 2 s per bar).
    component.headTrimSeconds.set(2);

    await component.auditionTake();

    // Bar 2 is step 16; the pre-roll starts the song at step 0 instead.
    expect(audioEngineMock.seekToStep).toHaveBeenCalledWith(0);
  });

  it("switches the audition between solo and the mix in one tap", () => {
    expect(component.auditionInMix()).toBe(true);

    component.toggleAuditionAB();

    expect(component.auditionInMix()).toBe(false);
    expect(JSON.parse(localStorage.getItem(AUDITION_PREFS_KEY)!).inMix).toBe(
      false,
    );
  });

  it("remembers the audition choices for the next session", () => {
    component.toggleLoopAudition();
    component.toggleAuditionInMix();
    component.setAuditionPreRoll(2);

    expect(JSON.parse(localStorage.getItem(AUDITION_PREFS_KEY)!)).toEqual({
      inMix: false,
      loop: true,
      preRollBars: 2,
    });
  });

  it("counts the lead-in beats down in the header", async () => {
    jest.useFakeTimers();
    try {
      const take = new (globalThis as any).AudioBuffer({
        length: 44100,
        sampleRate: 44100,
        numberOfChannels: 1,
      });
      microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
      audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
      component.headTrimSeconds.set(2); // one bar of lead-in available

      await component.auditionTake();

      expect(component.auditionPreRollRemaining()).toBe(4);
      jest.advanceTimersByTime(500 * 4);
      expect(component.auditionPreRollRemaining()).toBeNull();
      component.stopAudition();
    } finally {
      jest.useRealTimers();
    }
  });

  it("can turn the pre-roll off for an immediate entry", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 44100,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    component.headTrimSeconds.set(2);
    component.auditionPreRollBars.set(0);

    await component.auditionTake();

    // No lead-in: the song starts exactly on the take's bar (step 16).
    expect(audioEngineMock.seekToStep).toHaveBeenCalledWith(16);
  });

  it("uses two bars of pre-roll when asked and the song allows it", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 44100,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    // Take starts at bar 3 (4 s at 120 BPM), leaving room for two bars.
    component.headTrimSeconds.set(4);
    component.auditionPreRollBars.set(2);

    await component.auditionTake();

    expect(audioEngineMock.seekToStep).toHaveBeenCalledWith(0);
  });

  it("keeps the pre-roll inside a looped audition", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 44100, // 1 s
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    component.headTrimSeconds.set(2);
    component.loopAudition.set(true);

    await component.auditionTake();

    // 16 pre-roll steps plus the take's 8, so each pass counts in again.
    expect(audioEngineMock.setPlaybackLoop).toHaveBeenCalledWith(0, 24);
  });

  it("loops an uploaded guide with the take so the pre-roll repeats", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 44100, // 1 s
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    backingMock.track.set({ name: "Bed", buffer: take });
    component.headTrimSeconds.set(2);
    component.loopAudition.set(true);

    await component.auditionTake();

    // Start one bar earlier and loop it, so each pass counts in again.
    expect(backingMock.play).toHaveBeenCalledWith(0, expect.any(Number));
    expect(backingMock.toggleLoop).toHaveBeenCalled();
  });

  it("leaves the guide alone in the mix when it is already part of the song", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 2048,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    backingMock.track.set({
      name: "Beat",
      buffer: take,
      sourceTrackId: "audio_1",
    });

    await component.auditionTake();

    // The transport plays that track with the song; playing the guide too
    // would double it.
    expect(backingMock.play).not.toHaveBeenCalled();
    expect(audioEngineMock.start).toHaveBeenCalled();
  });

  it("routes only the kept region of a trimmed take", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 88200, // 2 s at 44.1 kHz
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    take.getChannelData(0).fill(0.3);
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    component.takeTrim.set({ start: 25, end: 75 });

    await component.routeTakeToArrangement();

    const calls = musicManagerMock.addAudioTrack.mock.calls;
    const added = calls[calls.length - 1][0];
    expect(added.buffer.length).toBeCloseTo(44100, -2);
    // 0.5 s of head removed at 120 BPM 4/4 (2 s per bar) = 0.25 bar.
    expect(added.offset).toBeCloseTo(0.25, 3);
  });

  it("keeps the trim handles from crossing or inverting", () => {
    component.setTakeTrimEdge("start", 120);
    expect(component.takeTrim()).toEqual({ start: 98, end: 100 });

    component.setTakeTrimEdge("start", 10);
    component.setTakeTrimEdge("end", 0);
    expect(component.takeTrim()).toEqual({ start: 10, end: 12 });

    component.resetTakeTrim();
    expect(component.takeTrim()).toEqual({ start: 0, end: 100 });
  });

  it("auto-routes a finished take into the arrangement", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 2048,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    take.getChannelData(0).fill(0.25);
    microphoneServiceMock.recordedBlob.set(
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
    );
    microphoneServiceMock.stopRecording.mockResolvedValue(
      microphoneServiceMock.recordedBlob(),
    );
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    microphoneServiceMock.isRecording.set(true);

    await component.toggleRecording();

    expect(musicManagerMock.addAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Vocal Take 1" }),
    );
    expect(component.takeNumber()).toBe(1);
  });

  it("skips auto-routing when the toggle is off", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 512,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    microphoneServiceMock.stopRecording.mockResolvedValue(
      microphoneServiceMock.recordedBlob(),
    );
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    microphoneServiceMock.isRecording.set(true);
    component.toggleAutoRoute();

    await component.toggleRecording();

    expect(component.autoRouteTakes()).toBe(false);
    expect(musicManagerMock.addAudioTrack).not.toHaveBeenCalled();
  });

  it("feeds a finished pass into the active comp group", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    microphoneServiceMock.recordedBlob.set(blob);
    microphoneServiceMock.stopRecording.mockResolvedValue(blob);
    microphoneServiceMock.recordingTime.set(7.5);
    microphoneServiceMock.isRecording.set(true);

    await component.toggleRecording();

    expect(mockSmartRecording.addTakeFromRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        blob,
        durationMs: 7500,
        trackName: "Vocal Track",
      }),
    );
  });

  it("drops the decoded take when a new pass replaces it", async () => {
    const first = new (globalThis as any).AudioBuffer({
      length: 1024,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    const second = new (globalThis as any).AudioBuffer({
      length: 2048,
      sampleRate: 44100,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(first);

    expect(await (component as any).resolveTakeBuffer()).toBe(first);

    // A new pass while auto-route is off: the cache must not survive, or the
    // next edit/route would silently reuse the previous take.
    component.toggleAutoRoute();
    microphoneServiceMock.isRecording.set(true);
    microphoneServiceMock.stopRecording.mockResolvedValue(
      microphoneServiceMock.recordedBlob(),
    );
    await component.toggleRecording();

    expect((component as any).editedTake).toBeNull();
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(second);
    expect(await (component as any).resolveTakeBuffer()).toBe(second);
  });

  it("normalizes and trims the take before routing it", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 4800,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    const data = take.getChannelData(0);
    data.fill(1e-5);
    for (let i = 960; i <= 1920; i++) data[i] = 0.2;
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);

    const normalized = await component.normalizeTake();
    expect(normalized).toContain("Normalized");
    expect(Math.abs(take.getChannelData(0)[1200])).toBeCloseTo(
      Math.pow(10, -1 / 20),
      3,
    );

    const trimmed = await component.trimTakeSilence();
    expect(trimmed).toContain("Trimmed");
    expect(component.takeEnvelope().length).toBeGreaterThan(0);

    await component.routeTakeToArrangement();
    expect(musicManagerMock.addAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Vocal Take 1" }),
    );
  });

  it("does not arm a take when the input cannot be opened", async () => {
    microphoneServiceMock.initialize.mockResolvedValue(false);

    await component.initializeMic();
    await component.toggleRecording();

    expect(microphoneServiceMock.startRecording).not.toHaveBeenCalled();
  });

  it("starts and stops recording through the microphone service", async () => {
    microphoneServiceMock.isInitialized.set(true);
    await component.toggleRecording();
    expect(microphoneServiceMock.startRecording).toHaveBeenCalled();

    microphoneServiceMock.isRecording.set(true);
    await component.toggleRecording();
    expect(microphoneServiceMock.stopRecording).toHaveBeenCalled();
  });

  it("captures the processed chain as a lossless WAV when the worklet runs", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 512,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    recordingEngineMock.prepareCaptureWorklet.mockResolvedValue(true);
    recordingEngineMock.startRecording.mockImplementation(() =>
      recordingEngineMock.isRecording.set(true),
    );
    microphoneServiceMock.isInitialized.set(true);

    await component.toggleRecording();

    expect(recordingEngineMock.startRecording).toHaveBeenCalledWith({
      id: "capture-stream",
    });
    expect(component.losslessCapture()).toBe(true);
    expect(microphoneServiceMock.startRecording).not.toHaveBeenCalled();

    // Finish the pass: the engine hands back the WAV and it routes like any take.
    const wav = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    recordingEngineMock.recordedBlob.set(wav);
    recordingEngineMock.stopRecording.mockImplementation(async () => {
      recordingEngineMock.isRecording.set(false);
    });
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);

    await component.toggleRecording();

    expect(component.takeBlob()).toBe(wav);
    expect(musicManagerMock.addAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Vocal Take 1" }),
    );
  });

  it("says so when lossless capture is unavailable and falls back to the recorder", async () => {
    microphoneServiceMock.isInitialized.set(true);

    await component.toggleRecording();

    expect(microphoneServiceMock.startRecording).toHaveBeenCalled();
    expect(component.losslessCapture()).toBe(false);
    expect(TestBed.inject(SnackbarService).info).toHaveBeenCalledWith(
      expect.stringContaining("compressed audio"),
    );
  });

  it("arms the backing track from the top with the take and stops it at the end", async () => {
    backingMock.track.set({ name: "Beat", buffer: { duration: 30 } });
    microphoneServiceMock.isInitialized.set(true);

    await component.toggleRecording();

    // A take must start on the backing track's downbeat, not wherever the
    // preview happened to be paused.
    expect(backingMock.restart).toHaveBeenCalled();

    microphoneServiceMock.isRecording.set(true);
    microphoneServiceMock.stopRecording.mockResolvedValue(null);
    await component.toggleRecording();

    expect(backingMock.stop).toHaveBeenCalled();
  });

  it("pauses and resumes the guide track with the take", () => {
    backingMock.track.set({ name: "Beat", buffer: { duration: 30 } });
    backingMock.positionSeconds.set(80);
    microphoneServiceMock.isInitialized.set(true);
    microphoneServiceMock.isRecording.set(true);

    component.togglePauseRecording();

    expect(microphoneServiceMock.pauseRecording).toHaveBeenCalled();
    expect(backingMock.stop).toHaveBeenCalled();

    microphoneServiceMock.isPaused.set(true);
    component.togglePauseRecording();

    expect(microphoneServiceMock.resumeRecording).toHaveBeenCalled();
    // Resumes from where it stopped, not from the top of the track.
    expect(backingMock.play).toHaveBeenCalledWith(80);
  });

  it("keeps the guide track silent when capture never starts", async () => {
    backingMock.track.set({ name: "Beat", buffer: { duration: 30 } });
    microphoneServiceMock.isInitialized.set(true);
    // `startRecording` leaves the recording signal false: nothing was captured.
    await component.toggleRecording();

    expect(backingMock.restart).toHaveBeenCalled();
    expect(backingMock.stop).toHaveBeenCalled();
  });

  it("places a silence-trimmed take at the bar its first kept sample was sung on", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 4800,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    const data = take.getChannelData(0);
    data.fill(1e-5);
    for (let i = 2400; i <= 3600; i++) data[i] = 0.3;
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);

    expect(await component.trimTakeSilence()).toContain("Trimmed");
    // 20 ms of room tone is kept: 2400 - 960 = 1440 frames at 48 kHz.
    expect(component.headTrimSeconds()).toBeCloseTo(0.03, 4);
    // Bar 1 is the start; the label moves with the trim instead of claiming 1.00.
    expect(component.takeStartBarLabel()).toMatch(/bar 1\.0[12]/);
    expect(component.takeStartBarLabel()).toContain("backing track");

    await component.routeTakeToArrangement();

    // 120 BPM: a bar is 2 s, so 30 ms of trimmed silence is 0.015 bar.
    const routed = musicManagerMock.addAudioTrack.mock.calls[0][0];
    expect(routed.offset).toBeCloseTo(0.015, 5);
  });

  it("auditions the take in sync with the backing from the trimmed position", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 480,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    backingMock.track.set({ name: "Beat", buffer: { duration: 30 } });
    component.headTrimSeconds.set(0.4);

    await component.auditionTake();

    expect(backingMock.play).toHaveBeenCalledWith(0.4, expect.any(Number));
    expect(component.isAuditioning()).toBe(true);

    await component.auditionTake();

    expect(component.isAuditioning()).toBe(false);
    expect(backingMock.stop).toHaveBeenCalled();
  });

  it("restores the recorded take when edits are reset", async () => {
    const take = new (globalThis as any).AudioBuffer({
      length: 1024,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    microphoneServiceMock.recordedBlob.set(new Blob([new Uint8Array([1])]));
    audioEngineMock.ctx.decodeAudioData = jest.fn().mockResolvedValue(take);
    component.headTrimSeconds.set(0.5);

    await component.resetTakeEdits();

    expect(component.headTrimSeconds()).toBe(0);
    expect(component.takeStatus()).toContain("reset");
    expect(component.takeEnvelope().length).toBeGreaterThan(0);
  });

  describe("mounted template", () => {
    it("renders the real Vocal Suite template", async () => {
      const html = readFileSync(
        join(__dirname, "vocal-suite.component.html"),
        "utf8",
      );
      // The mic interface draws meters on a 2D canvas; jsdom has no canvas
      // backend, so hand it a no-op context instead of logging "Not implemented".
      jest
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockImplementation(
          () =>
            new Proxy(
              {},
              {
                get: (_target, prop) => {
                  if (prop === "createLinearGradient" || prop === "createRadialGradient")
                    return () => ({ addColorStop: () => {} });
                  if (prop === "measureText") return () => ({ width: 0 });
                  if (typeof prop === "symbol") return undefined;
                  return () => {};
                },
              },
            ) as unknown as CanvasRenderingContext2D,
        );

      // The logic cases above run against a stub; this one mounts the file the
      // app actually ships, so the template's bindings are exercised too.
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [VocalSuiteComponent],
        providers: testProviders,
      })
        .overrideComponent(VocalSuiteComponent, {
          // Keep the component's own imports so the mic interface and uplink
          // console are the real components, not tolerated unknown elements.
          set: {
            template: html,
            templateUrl: undefined,
            styleUrls: [],
          },
        })
        .compileComponents();

      const mounted = TestBed.createComponent(VocalSuiteComponent);
      mounted.detectChanges();

      const host: HTMLElement = mounted.nativeElement;
      expect(host.querySelector(".vs-hud-header")).not.toBeNull();
      expect(host.textContent).toContain("VOCAL SUITE");

      // The audition controls this work added really reach the record step.
      mounted.componentInstance.setStep("record");
      mounted.detectChanges();
      expect(
        host.querySelectorAll('[aria-label="Audition pre-roll length"]')
          .length,
      ).toBeGreaterThan(0);

      // The edit step's Mix/Solo switch is a real button bound to the signal.
      mounted.componentInstance.setStep("edit");
      mounted.detectChanges();

      const mixSolo = () =>
        host.querySelector<HTMLButtonElement>(
          'button[aria-label="Switch the audition between the take alone and the full mix"]',
        );
      expect(mixSolo()?.textContent?.trim()).toBe("Mix");
      expect(mixSolo()?.getAttribute("aria-pressed")).toBe("true");

      mixSolo()!.click();
      mounted.detectChanges();

      expect(mounted.componentInstance.auditionInMix()).toBe(false);
      expect(mixSolo()?.textContent?.trim()).toBe("Solo");
      expect(mixSolo()?.getAttribute("aria-pressed")).toBe("false");

      mounted.destroy();
    });
  });
});
