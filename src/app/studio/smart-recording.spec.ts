import { TestBed, fakeAsync, tick } from "@angular/core/testing";
import {
  SmartRecordingService,
  CompGroup,
  CompSegment,
  CompTake,
} from "./smart-recording.service";
import { WavEncoder } from "./wav-encoder.util";
import { AudioEngineService } from "../services/audio-engine.service";
import { LoggingService } from "../services/logging.service";
import { RecordingStatusService } from "./recording-status.service";
import { LocalStorageService } from "../services/local-storage.service";
import { StudioRecordingEngineService } from "./studio-recording-engine.service";

function createRecordingEngineMock() {
  const mock: any = {
    isInitialized: jest.fn().mockReturnValue(false),
    initialize: jest.fn().mockResolvedValue(true),
    isRecording: jest.fn().mockReturnValue(false),
    startRecording: jest.fn().mockImplementation(() => {
      mock.isRecording.mockReturnValue(true);
    }),
    stopRecording: jest.fn().mockImplementation(() => {
      mock.isRecording.mockReturnValue(false);
      return Promise.resolve();
    }),
    getRecordedBuffers: jest.fn().mockReturnValue({ left: [], right: [] }),
  };
  return mock;
}

function createMockAudioEngine() {
  return {
    tempo: () => 120,
    isRecording: { set: jest.fn() },
    ctx: { sampleRate: 48000 },
    masterGain: { gain: { value: 0.8 } },
  } as any;
}

describe("SmartRecordingService", () => {
  let service: SmartRecordingService;
  let recordingEngineMock: any;

  beforeEach(() => {
    recordingEngineMock = createRecordingEngineMock();
    TestBed.configureTestingModule({
      providers: [
        SmartRecordingService,
        { provide: AudioEngineService, useValue: createMockAudioEngine() },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: RecordingStatusService,
          useValue: {
            setRecordingSource: jest.fn(),
            clearRecordingSource: jest.fn(),
          },
        },
        {
          provide: LocalStorageService,
          useValue: { saveItem: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: StudioRecordingEngineService,
          useValue: recordingEngineMock,
        },
      ],
    });

    service = TestBed.inject(SmartRecordingService);
    // Recording a real post-roll costs wall-clock time; the tests that care
    // about it set their own value (or use fake timers).
    service.postRollMs.set(0);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("recording modes", () => {
    it("should default to normal mode", () => {
      expect(service.recordingMode()).toBe("normal");
    });

    it("should switch to punch mode", () => {
      service.setRecordingMode("punch");
      expect(service.recordingMode()).toBe("punch");
    });

    it("should switch to comp mode", () => {
      service.setRecordingMode("comp");
      expect(service.recordingMode()).toBe("comp");
    });

    it("keeps the section in progress when comp mode is re-entered", () => {
      service.setRecordingMode("comp");
      const first = service.activeCompGroupId();

      service.setRecordingMode("normal");
      service.setRecordingMode("comp");

      expect(service.compGroups()).toHaveLength(1);
      expect(service.activeCompGroupId()).toBe(first);
    });
  });

  describe("active comp group targeting", () => {
    it("points recording at the selected section and continues its numbering", async () => {
      service.startNewCompGroup("t1", "Track", "Verse");
      const verse = service.activeCompGroupId()!;
      service.startNewCompGroup("t1", "Track", "Chorus");
      expect(service.activeCompGroupId()).not.toBe(verse);

      // The chorus collected a take, so the verse keeps its own numbering.
      recordingEngineMock.getRecordedBuffers.mockReturnValue({
        left: [new Float32Array(4800).fill(0.4)],
        right: [new Float32Array(4800).fill(0.4)],
      });
      await service.startCompTake();
      await service.finishCompTake();

      expect(service.setActiveCompGroup(verse)).toBe(true);
      expect(service.activeCompGroupId()).toBe(verse);
      expect(service.currentTakeNumber()).toBe(1);

      await service.startCompTake();
      const take = await service.finishCompTake();
      expect(take!.takeNumber).toBe(1);
      expect(
        service.compGroups().find((g) => g.id === verse)!.takes,
      ).toHaveLength(1);
      expect(
        service.compGroups().find((g) => g.id !== verse)!.takes,
      ).toHaveLength(1);
    });

    it("rejects an unknown group and clears a stale capture error", () => {
      expect(service.setActiveCompGroup("nope")).toBe(false);

      service.startNewCompGroup("t1", "Track", "Verse");
      service.captureError.set("Input unavailable — check the microphone");
      expect(service.setActiveCompGroup(service.activeCompGroupId()!)).toBe(
        true,
      );
      expect(service.captureError()).toBeNull();
    });
  });

  describe("punch-in/out", () => {
    beforeEach(() => {
      service.setRecordingMode("punch");
    });

    it("should set punch points", () => {
      service.setPunchIn(4);
      service.setPunchOut(8);
      expect(service.punchInBar()).toBe(4);
      expect(service.punchOutBar()).toBe(8);
      expect(service.hasPunchRegion()).toBe(true);
    });

    it("should clear punch region", () => {
      service.setPunchIn(4);
      service.clearPunchRegion();
      expect(service.punchInBar()).toBeNull();
      expect(service.punchOutBar()).toBeNull();
    });

    it("should arm and disarm", () => {
      service.armPunch();
      expect(service.punchArmed()).toBe(true);
      service.disarmPunch();
      expect(service.punchArmed()).toBe(false);
    });
  });

  describe("comp groups", () => {
    it("should create a new comp group", () => {
      service.startNewCompGroup("track1", "Guitar", "Verse 1");
      expect(service.compGroups().length).toBe(1);
      expect(service.compGroups()[0].trackName).toBe("Guitar");
      expect(service.compGroups()[0].sectionLabel).toBe("Verse 1");
    });

    it("should set active comp group", () => {
      service.startNewCompGroup("t1", "Track", "Section");
      expect(service.activeCompGroupId()).toBeTruthy();
    });

    it("gives back-to-back sections distinct ids", () => {
      service.startNewCompGroup("t1", "Track", "Verse");
      service.startNewCompGroup("t1", "Track", "Chorus");

      const ids = service.compGroups().map((g) => g.id);
      expect(new Set(ids).size).toBe(2);
      expect(service.activeCompGroupId()).toBe(ids[1]);
    });

    it("should start real capture for a comp take", async () => {
      service.startNewCompGroup("t1", "Track", "Chorus");
      const started = await service.startCompTake();

      expect(started).toBe(true);
      expect(recordingEngineMock.initialize).toHaveBeenCalled();
      expect(recordingEngineMock.startRecording).toHaveBeenCalled();
      expect(service.isCompRecording()).toBe(true);
      expect(service.captureError()).toBeNull();
    });

    it("should not arm a comp take when capture is refused", async () => {
      recordingEngineMock.startRecording.mockImplementation(() => undefined);
      recordingEngineMock.isRecording.mockReturnValue(false);
      service.startNewCompGroup("t1", "Track", "Chorus");

      const started = await service.startCompTake();

      expect(started).toBe(false);
      expect(service.isCompRecording()).toBe(false);
      expect(service.captureError()).toBeTruthy();
    });

    it("should finish a comp take from the captured audio", async () => {
      recordingEngineMock.getRecordedBuffers.mockReturnValue({
        left: [new Float32Array(4800).fill(0.5)],
        right: [new Float32Array(4800).fill(0.25)],
      });
      service.startNewCompGroup("t1", "Track", "Chorus");
      await service.startCompTake();
      expect(service.isCompRecording()).toBe(true);

      const take = await service.finishCompTake();

      expect(take).toBeTruthy();
      expect(take!.takeNumber).toBe(1);
      expect(take!.blob.size).toBeGreaterThan(0);
      expect(take!.durationMs).toBe(100);
      // Peaks come from the captured samples, not a fixed placeholder.
      expect(take!.peakDbL).toBeCloseTo(-6, 0);
      expect(take!.peakDbR).toBeCloseTo(-12, 0);
      expect(service.isCompRecording()).toBe(false);
    });

    it("keeps the input open for the post-roll before saving a take", async () => {
      jest.useFakeTimers();
      try {
        recordingEngineMock.getRecordedBuffers.mockReturnValue({
          left: [new Float32Array(4800).fill(0.5)],
          right: [new Float32Array(4800).fill(0.5)],
        });
        service.postRollMs.set(150);
        service.startNewCompGroup("t1", "Track", "Chorus");
        await service.startCompTake();

        let saved: CompTake | null = null;
        const finishing = service.finishCompTake().then((take) => {
          saved = take;
          return take;
        });

        // The capture is still running: the tail has not been collected yet.
        expect(saved).toBeNull();
        expect(recordingEngineMock.stopRecording).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(150);

        expect(await finishing).toBeTruthy();
        expect(saved).not.toBeNull();
        expect(recordingEngineMock.stopRecording).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("saves a loop-pass take without holding, so the next take keeps its bar stamp", async () => {
      jest.useFakeTimers();
      try {
        recordingEngineMock.getRecordedBuffers.mockReturnValue({
          left: [new Float32Array(4800).fill(0.5)],
          right: [new Float32Array(4800).fill(0.5)],
        });
        service.postRollMs.set(5000);
        service.startNewCompGroup("t1", "Track", "Chorus");
        await service.startCompTake();

        const take = await service.finishCompTake(false);

        expect(take).toBeTruthy();
        expect(jest.getTimerCount()).toBe(0);
        expect(recordingEngineMock.stopRecording).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should discard a comp take when nothing was captured", async () => {
      service.startNewCompGroup("t1", "Track", "Chorus");
      await service.startCompTake();

      const take = await service.finishCompTake();

      expect(take).toBeNull();
      expect(service.compGroups()[0].takes).toHaveLength(0);
      expect(service.captureError()).toBeTruthy();
    });

    it("should stamp a comp take with the bars it actually covered", async () => {
      recordingEngineMock.getRecordedBuffers.mockReturnValue({
        left: [new Float32Array(48000).fill(0.3)],
        right: [new Float32Array(48000).fill(0.3)],
      });
      service.startNewCompGroup("t1", "Track", "Chorus");

      await service.onBarTick(3); // transport rolled up to bar 3
      await service.startCompTake();
      await service.onBarTick(6); // ...and three bars later
      const take = await service.finishCompTake();

      expect(take!.regionStartBar).toBe(3);
      expect(take!.regionEndBar).toBe(6);
    });

    it("should keep a comp region one bar wide when the transport never reported", async () => {
      recordingEngineMock.getRecordedBuffers.mockReturnValue({
        left: [new Float32Array(48000).fill(0.3)],
        right: [new Float32Array(48000).fill(0.3)],
      });
      service.startNewCompGroup("t1", "Track", "Chorus");
      await service.startCompTake();

      const take = await service.finishCompTake();

      expect(take!.regionStartBar).toBe(1);
      expect(take!.regionEndBar).toBe(2);
    });

    it("should split segments across the takes' own region", () => {
      service.startNewCompGroup("t1", "Track", "Chorus");
      const groupId = service.activeCompGroupId()!;
      service.compGroups.update((groups) =>
        groups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                takes: [
                  {
                    id: "take-a",
                    takeNumber: 1,
                    label: "Take 1",
                    url: "",
                    blob: null,
                    durationMs: 4000,
                    recordedAt: 0,
                    regionStartBar: 5,
                    regionEndBar: 9,
                    isMuted: false,
                    isCompSelection: true,
                    peakDbL: -6,
                    peakDbR: -6,
                  },
                ],
              }
            : g,
        ),
      );

      service.splitCompSegments(groupId, 2);
      const segments = service.compSegmentsForGroup(groupId);

      // Segments follow the recorded span instead of pinning to bar 1.
      expect(segments.map((s) => s.startBar)).toEqual([5, 7]);
      expect(segments[segments.length - 1].endBar).toBe(9);
    });

    it("should select a comp take", () => {
      service.startNewCompGroup("t1", "Track", "Verse");
      const group = service.compGroups()[0];
      // Add a fake take directly
      const takeId = "take_test_1";
      service.compGroups.update((groups) =>
        groups.map((g) => {
          if (g.id !== group.id) return g;
          return {
            ...g,
            takes: [
              {
                id: takeId,
                takeNumber: 1,
                label: "Take 1",
                url: "",
                blob: null,
                durationMs: 2000,
                recordedAt: Date.now(),
                regionStartBar: 1,
                regionEndBar: 5,
                isMuted: false,
                isCompSelection: false,
                peakDbL: -18,
                peakDbR: -18,
              },
            ],
          };
        }),
      );
      service.selectCompTake(group.id, takeId);
      const updated = service.compGroups().find((g) => g.id === group.id);
      expect(updated!.selectedTakeId).toBe(takeId);
    });

    it("adds an externally recorded take to the active comp group", async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });

      const take = await service.addTakeFromRecording({
        blob,
        label: "Chorus pass",
        durationMs: 5000,
        trackName: "Audio Recorder",
        sectionLabel: "Recorder Takes",
      });

      expect(take).toBeTruthy();
      expect(take!.label).toBe("Chorus pass");
      expect(take!.blob).toBe(blob);
      expect(take!.url).toMatch(/^blob:/);
      // A group is created on demand, so the comp view has somewhere to put it.
      expect(service.compGroups()).toHaveLength(1);
      expect(service.compGroups()[0].trackName).toBe("Audio Recorder");
      expect(service.compGroups()[0].takes).toHaveLength(1);
      expect(service.compGroups()[0].selectedTakeId).toBe(take!.id);
      // Undecodable blob → the caller's wall-clock length and a silence floor.
      expect(take!.durationMs).toBe(5000);
      expect(take!.peakDbL).toBe(-60);
      // 5 s at the session tempo (120 BPM → 2 s per bar) spans three bars.
      expect(take!.regionStartBar).toBe(1);
      expect(take!.regionEndBar).toBe(4);
    });

    it("measures a fed take from the decoded audio", async () => {
      const fakeChannel = (value: number) =>
        new Float32Array(48000).fill(value);
      (service as any).audioEngine.ctx.decodeAudioData = jest
        .fn()
        .mockResolvedValue({
          duration: 2,
          numberOfChannels: 2,
          getChannelData: (ch: number) =>
            ch === 0 ? fakeChannel(0.5) : fakeChannel(0.25),
        });

      const take = await service.addTakeFromRecording({
        blob: new Blob([new Uint8Array([1])], { type: "audio/wav" }),
      });

      expect(take!.durationMs).toBe(2000);
      expect(take!.peakDbL).toBeCloseTo(-6, 0);
      expect(take!.peakDbR).toBeCloseTo(-12, 0);
      expect(take!.label).toBe(`Take ${take!.takeNumber}`);
    });

    it("ignores an empty recording and revokes the URL of a deleted take", async () => {
      expect(
        await service.addTakeFromRecording({ blob: new Blob([]) }),
      ).toBeNull();
      expect(service.compGroups()).toHaveLength(0);

      const revoke = jest
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});
      try {
        const take = await service.addTakeFromRecording({
          blob: new Blob([new Uint8Array([1])], { type: "audio/wav" }),
        });
        service.deleteTake(service.activeCompGroupId()!, take!.id);

        expect(revoke).toHaveBeenCalledWith(take!.url);
        expect(service.compGroups()[0].takes).toHaveLength(0);
      } finally {
        revoke.mockRestore();
      }
    });

    it("should toggle take mute", () => {
      service.startNewCompGroup("t1", "Track", "Solo");
      const groupId = service.activeCompGroupId()!;
      const takeId = "take_mute_1";
      service.compGroups.update((groups) =>
        groups.map((g) => ({
          ...g,
          takes: [
            {
              id: takeId,
              takeNumber: 1,
              label: "T1",
              url: "",
              blob: null,
              durationMs: 1000,
              recordedAt: 0,
              regionStartBar: 1,
              regionEndBar: 3,
              isMuted: false,
              isCompSelection: false,
              peakDbL: -18,
              peakDbR: -18,
            },
          ],
        })),
      );
      service.toggleTakeMute(groupId, takeId);
      const take = service.compGroups()[0].takes[0];
      expect(take.isMuted).toBe(true);
    });

    it("should delete a comp group", () => {
      service.startNewCompGroup("t1", "Track", "Section");
      const groupId = service.activeCompGroupId()!;
      service.deleteCompGroup(groupId);
      expect(service.compGroups().length).toBe(0);
    });
  });

  describe("zero-crossing detection", () => {
    it("should find nearest zero crossing", () => {
      const buffer = new Float32Array([0.5, 0.1, -0.1, 0.2, -0.3, 0.0, 0.4]);
      const result = service.findZeroCrossing(buffer, 3, 48000);
      // Zero crossings exist near indices 1, 2, 3, 5; nearest to target 3
      // depends on which crossing point is closer to zero. Include all candidates.
      expect([1, 2, 3, 5]).toContain(result);
    });

    it("should return target when disabled", () => {
      service.zeroCrossingEnabled.set(false);
      const buffer = new Float32Array([1, -1, 1, -1]);
      const result = service.findZeroCrossing(buffer, 2, 48000);
      expect(result).toBe(2);
    });
  });

  describe("crossfade", () => {
    it("should apply comp crossfade", () => {
      const bufA = new Float32Array(500).fill(1);
      const bufB = new Float32Array(500).fill(-1);
      service.crossfadeMs.set(5); // 5ms = 240 samples, fits in 500-sample buffers
      service.zeroCrossingEnabled.set(false);
      const result = service.applyCompCrossfade(bufA, bufB, 250, 48000);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      // First portion should be from bufA
      expect(result[0]).toBeCloseTo(1, 3);
    });

    it("should compile multiple comp takes", () => {
      service.crossfadeMs.set(5); // short crossfade
      service.zeroCrossingEnabled.set(false);

      const group: CompGroup = {
        id: "g1",
        trackId: "t1",
        trackName: "Track",
        sectionLabel: "Verse",
        takes: [
          {
            id: "t1",
            takeNumber: 1,
            label: "T1",
            url: "",
            blob: null,
            durationMs: 500,
            recordedAt: 0,
            regionStartBar: 1,
            regionEndBar: 2,
            isMuted: false,
            isCompSelection: true,
            peakDbL: -18,
            peakDbR: -18,
          },
          {
            id: "t2",
            takeNumber: 2,
            label: "T2",
            url: "",
            blob: null,
            durationMs: 500,
            recordedAt: 0,
            regionStartBar: 2,
            regionEndBar: 3,
            isMuted: false,
            isCompSelection: false,
            peakDbL: -18,
            peakDbR: -18,
          },
        ],
        selectedTakeId: "t1",
        createdAt: Date.now(),
      };
      service.compGroups.set([group]);
      service.activeCompGroupId.set("g1");

      // Use buffers large enough for crossfade math (5ms @ 48k = 240 samples crossfade)
      const buffers = new Map<string, Float32Array>();
      buffers.set("t1", new Float32Array(1000).fill(0.5));
      buffers.set("t2", new Float32Array(1000).fill(-0.5));

      const result = service.compileComp(buffers, 48000);
      expect(result).toBeTruthy();
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  describe("comp assembly render", () => {
    /** 48 kHz / 120 BPM → 2 s per bar, i.e. 96 000 frames per bar. */
    const framesPerBar = 96000;

    /**
     * Decode mock keyed off the marker byte in each take blob. A number fills a
     * 10 s buffer, a function generates one, and a Float32Array is used as-is so
     * a take can be given an exact length (with or without post-roll).
     */
    const installDecoder = (
      values: Record<
        number,
        number | ((frame: number) => number) | Float32Array
      >,
      failMarkers: number[] = [],
    ) => {
      const decode = jest.fn((buffer: ArrayBuffer) => {
        const marker = new Uint8Array(buffer)[0];
        if (failMarkers.includes(marker)) {
          return Promise.reject(new Error("undecodable"));
        }
        const fill = values[marker] ?? 0;
        let samples: Float32Array;
        if (fill instanceof Float32Array) {
          samples = fill;
        } else {
          samples = new Float32Array(48000 * 10);
          if (typeof fill === "function") {
            for (let i = 0; i < samples.length; i++) samples[i] = fill(i);
          } else {
            samples.fill(fill);
          }
        }
        return Promise.resolve({
          duration: samples.length / 48000,
          numberOfChannels: 1,
          getChannelData: () => samples,
        });
      });
      (service as any).audioEngine.ctx.decodeAudioData = decode;
      return decode;
    };

    const makeTake = (
      id: string,
      marker: number,
      startBar: number,
      endBar: number,
      extra: Partial<CompTake> = {},
    ): CompTake => ({
      id,
      takeNumber: marker,
      label: id,
      blob: new Blob([new Uint8Array([marker])], { type: "audio/wav" }),
      url: `blob:${id}`,
      durationMs: 4000,
      recordedAt: 0,
      regionStartBar: startBar,
      regionEndBar: endBar,
      isMuted: false,
      isCompSelection: false,
      peakDbL: -6,
      peakDbR: -6,
      ...extra,
    });

    const makeGroup = (
      takes: CompTake[],
      segments?: CompSegment[],
      selectedTakeId = takes[0]?.id ?? null,
    ): CompGroup => ({
      id: "g1",
      trackId: "t1",
      trackName: "Vocal",
      sectionLabel: "Verse",
      takes,
      selectedTakeId,
      segments,
      createdAt: 0,
    });

    /** Render and hand back the encoded channels plus the delivered blob. */
    const renderChannels = async (): Promise<{
      channels: Float32Array[];
      blob: Blob;
    }> => {
      const encode = jest.spyOn(WavEncoder, "encodeMultiChannel");
      try {
        const blob = await service.renderCompAssembly("g1");
        expect(blob).not.toBeNull();
        const [channels, format, sampleRate] = encode.mock.calls[0];
        expect(format).toBe("wav-16");
        expect(sampleRate).toBe(48000);
        return { channels, blob: blob as Blob };
      } finally {
        encode.mockRestore();
      }
    };

    it("plays each assigned segment's own take and crossfades into its pre-roll", async () => {
      installDecoder({
        // Take A ends with its segment (no post-roll); take B was rolled from
        // bar 1, so segment 2 has two bars of pre-roll to fade up from.
        1: new Float32Array(2 * framesPerBar).fill(0.5),
        2: new Float32Array(6 * framesPerBar).fill(0.25),
      });
      service.compGroups.set([
        makeGroup(
          [makeTake("a", 1, 1, 3), makeTake("b", 2, 1, 5)],
          [
            { id: "s1", startBar: 1, endBar: 3, takeId: "a" },
            { id: "s2", startBar: 3, endBar: 5, takeId: "b" },
          ],
        ),
      ]);

      const { channels, blob } = await renderChannels();
      expect(channels).toHaveLength(2);
      const left = channels[0];
      // Four bars of comp at bar 1 → 384 000 frames.
      expect(left.length).toBe(4 * framesPerBar);

      // The delivered file is a 16-bit stereo WAV at 48 kHz holding every frame.
      const header = new DataView(await blob.arrayBuffer());
      const ascii = (offset: number) =>
        String.fromCharCode(...new Uint8Array(header.buffer, offset, 4));
      expect(ascii(0)).toBe("RIFF");
      expect(ascii(8)).toBe("WAVE");
      expect(header.getUint16(22, true)).toBe(2);
      expect(header.getUint32(24, true)).toBe(48000);
      expect(header.getUint16(34, true)).toBe(16);
      expect(blob.size).toBe(44 + 4 * framesPerBar * 2 * 2);

      // Bar 1–2 is take A, bar 3–4 is take B.
      expect(left[0]).toBeCloseTo(0.5, 3);
      expect(left[framesPerBar + 1000]).toBeCloseTo(0.5, 3);
      expect(left[3 * framesPerBar + 1000]).toBeCloseTo(0.25, 3);
      // The outer edges keep their level (only joins are faded).
      expect(left[left.length - 1]).toBeCloseTo(0.25, 3);

      // The join is a continuous equal-power crossfade: no silence hole and no
      // sum above the louder take.
      const join = 2 * framesPerBar;
      let lowest = Infinity;
      let highest = 0;
      for (let i = join - 480; i <= join + 480; i++) {
        lowest = Math.min(lowest, left[i]);
        highest = Math.max(highest, left[i]);
      }
      expect(lowest).toBeGreaterThan(0.15);
      expect(highest).toBeLessThan(0.6);
      expect(Math.abs(left[join] - left[join - 1])).toBeLessThan(0.05);
    });

    it("renders the selected comp take over its own region when the group is unsplit", async () => {
      installDecoder({ 1: 0.5, 2: 0.25 });
      service.compGroups.set([
        makeGroup(
          [makeTake("a", 1, 1, 3), makeTake("b", 2, 3, 5)],
          undefined,
          "b",
        ),
      ]);

      const { channels } = await renderChannels();
      // Take B covers bars 3–4, and that is the comp.
      expect(channels[0].length).toBe(2 * framesPerBar);
      expect(channels[0][0]).toBeCloseTo(0.25, 3);
      expect(channels[0][2 * framesPerBar - 1]).toBeCloseTo(0.25, 3);
    });

    it("crossfades through the outgoing take's post-roll when the incoming has none", async () => {
      installDecoder({
        // Take A keeps rolling a bar past its segment (post-roll); take B starts
        // exactly on its segment bar, so only A can carry the crossfade.
        1: new Float32Array(3 * framesPerBar).fill(0.5),
        2: new Float32Array(2 * framesPerBar).fill(0.25),
      });
      service.compGroups.set([
        makeGroup(
          [makeTake("a", 1, 1, 3), makeTake("b", 2, 3, 5)],
          [
            { id: "s1", startBar: 1, endBar: 3, takeId: "a" },
            { id: "s2", startBar: 3, endBar: 5, takeId: "b" },
          ],
        ),
      ]);

      const { channels } = await renderChannels();
      const left = channels[0];
      const join = 2 * framesPerBar;

      // A is still at full level right up to the join (nothing fades it early)
      // and its post-roll carries the boundary, so the level never dips.
      expect(left[join - 1]).toBeCloseTo(0.5, 3);
      expect(left[join]).toBeCloseTo(0.5, 3);
      let lowest = Infinity;
      let highest = 0;
      for (let i = join; i <= join + 480; i++) {
        lowest = Math.min(lowest, left[i]);
        highest = Math.max(highest, left[i]);
      }
      expect(lowest).toBeGreaterThan(0.2);
      expect(highest).toBeLessThan(0.6);
      // The incoming take lands on its own bar at full level.
      expect(left[join + 480]).toBeCloseTo(0.25, 3);
      expect(left[join + framesPerBar]).toBeCloseTo(0.25, 3);
    });

    it("fades a take with no pre-roll in place, without shifting its content", async () => {
      // Sawtooth with a 10 ms period: a shift of one crossfade (480 frames)
      // moves the value by 0.1, so this catches a drifting join. Take A stops
      // with its segment and take B begins with its own, so neither side has
      // anything to overlap with.
      installDecoder({
        1: new Float32Array(2 * framesPerBar).fill(0.5),
        2: (frame: number) => (frame / 4800) % 1,
      });
      service.compGroups.set([
        makeGroup(
          [makeTake("a", 1, 1, 3), makeTake("b", 2, 3, 5)],
          [
            { id: "s1", startBar: 1, endBar: 3, takeId: "a" },
            { id: "s2", startBar: 3, endBar: 5, takeId: "b" },
          ],
        ),
      ]);

      const { channels } = await renderChannels();
      const left = channels[0];
      const join = 2 * framesPerBar;
      // Segment 2 plays take B from its frame 0 at the join.
      expect(left[join + 2400]).toBeCloseTo(0.5, 2);
      // Both sides fade through the join, so the level never jumps.
      expect(Math.abs(left[join] - left[join - 1])).toBeLessThan(0.05);
      expect(left[join - 480]).toBeCloseTo(0.5, 2);
    });

    it("skips a segment whose take cannot be decoded and still renders the rest", async () => {
      installDecoder({ 1: 0.5 }, [2]);
      service.compGroups.set([
        makeGroup(
          [makeTake("a", 1, 1, 3), makeTake("b", 2, 3, 5)],
          [
            { id: "s1", startBar: 1, endBar: 3, takeId: "a" },
            { id: "s2", startBar: 3, endBar: 5, takeId: "b" },
          ],
        ),
      ]);

      const { channels } = await renderChannels();
      expect(channels[0][framesPerBar]).toBeCloseTo(0.5, 3);
      // The undecodable half stays silent rather than taking down the render.
      expect(channels[0][3 * framesPerBar + 1000]).toBe(0);
    });

    it("renders nothing when there is no audible take", async () => {
      service.compGroups.set([
        makeGroup(
          [makeTake("a", 1, 1, 3, { isMuted: true })],
          [{ id: "s1", startBar: 1, endBar: 3, takeId: "a" }],
        ),
      ]);

      expect(await service.renderCompAssembly("g1")).toBeNull();
      expect(await service.renderCompAssembly("missing")).toBeNull();
      expect(await service.renderCompAssembly()).toBeNull();
    });
  });

  describe("auto-split", () => {
    it("should detect silence boundaries", () => {
      service.autoSplitEnabled.set(true);
      service.autoSplitThreshold.set(-30);
      service.autoSplitMinSilenceMs.set(100);

      const samples = new Float32Array(48000 * 2);
      // Fill with audio: 0.5s signal, 0.3s silence, 0.5s signal
      // minSilenceMs = 100ms → need > 4800 samples of silence
      const sr = 48000;
      const sigEnd = Math.floor(0.5 * sr);
      const silEnd = sigEnd + Math.floor(0.3 * sr); // 0.3s silence
      const end = silEnd + Math.floor(0.5 * sr);
      for (let i = 0; i < sigEnd; i++) samples[i] = 0.8;
      for (let i = sigEnd; i < silEnd; i++) samples[i] = 0;
      for (let i = silEnd; i < end; i++) samples[i] = 0.8;

      const boundaries = service.detectSilenceBoundaries(
        samples.slice(0, end),
        sr,
      );
      expect(boundaries.length).toBeGreaterThan(0);
    });

    it("should return empty array when disabled", () => {
      service.autoSplitEnabled.set(false);
      const boundaries = service.detectSilenceBoundaries(
        new Float32Array(1000),
        48000,
      );
      expect(boundaries).toEqual([]);
    });
  });

  describe("computed signals", () => {
    it("should compute punch status label", () => {
      service.setRecordingMode("punch");
      service.setPunchIn(4);
      service.setPunchOut(8);
      service.armPunch();
      expect(service.punchStatusLabel()).toContain("PUNCH");
    });

    it("should compute current take label", () => {
      expect(service.currentTakeLabel()).toBe("Rec");
      service.setRecordingMode("comp");
      expect(service.currentTakeLabel()).toBe("Take 1");
    });
  });
});
