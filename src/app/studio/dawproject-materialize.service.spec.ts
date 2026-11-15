import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AudioEngineService } from "../services/audio-engine.service";
import { InstrumentsService } from "../services/instruments.service";
import { LoggingService } from "../services/logging.service";
import { MusicManagerService } from "../services/music-manager.service";
import {
  DawprojectMaterializeService,
  type DawprojectMaterializeSummary,
} from "./dawproject-materialize.service";
import type { DawprojectImportResult } from "./dawproject-import";
import type { DawprojectTrack } from "./dawproject-export";

function midiTrack(overrides: Partial<DawprojectTrack> = {}): DawprojectTrack {
  return {
    id: "track-1",
    name: "Keys",
    type: "midi",
    gain: 0.8,
    pan: 0,
    muted: false,
    soloed: false,
    notes: [],
    clips: [],
    ...overrides,
  };
}

function parsedResult(
  tracks: DawprojectTrack[],
  extra: Partial<DawprojectImportResult["project"]> = {},
): DawprojectImportResult {
  return {
    project: { tracks, audio: [], tempo: 120, ...extra },
    warnings: [" carried "],
  };
}

describe("DawprojectMaterializeService", () => {
  let service: DawprojectMaterializeService;
  let trackList: ReturnType<typeof signal<{ id: string; name: string }[]>>;
  let musicManager: any;
  let tempoSet: jest.Mock;
  let decodeAudioData: jest.Mock;

  function setup(): void {
    TestBed.resetTestingModule();
    trackList = signal<{ id: string; name: string }[]>([]);
    tempoSet = jest.fn();
    const tempoGet: any = jest.fn(() => 120);
    tempoGet.set = tempoSet;
    decodeAudioData = jest.fn();
    musicManager = {
      tracks: trackList,
      engine: { tempo: tempoGet },
      stemAudioCache: new Map<string, AudioBuffer>(),
      addTrack: jest.fn(
        (name: string, _instrument: string, _type: string) => {
          const id = `track_${trackList().length}`;
          trackList.update((ts) => [...ts, { id, name }]);
          return id;
        },
      ),
      replaceTrackNotes: jest.fn(),
      addClipToTrack: jest.fn(),
      applyTrackPatch: jest.fn(),
      setTrackColor: jest.fn(),
      removeTrack: jest.fn((id: string) => {
        trackList.update((ts) => ts.filter((t) => t.id !== id));
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        DawprojectMaterializeService,
        { provide: MusicManagerService, useValue: musicManager },
        {
          provide: InstrumentsService,
          useValue: {
            getPresets: () => [
              { id: "grand-piano", name: "Grand Piano" },
              { id: "polymer-stub", name: "Polymer Stub" },
            ],
          },
        },
        { provide: AudioEngineService, useValue: { ctx: { decodeAudioData } } },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(DawprojectMaterializeService);
  }

  it("materializes MIDI tracks with notes, clips, mix and tempo", async () => {
    setup();
    const result = parsedResult(
      [
        midiTrack({
          color: "#ff0000",
          instrumentName: "Polymer Stub",
          gain: 0.5,
          pan: -0.5,
          soloed: true,
          notes: [
            { step: 0, length: 4, midi: 60, velocity: 0.9 },
            { step: 4, length: 4, midi: 200, velocity: 2 },
          ],
          clips: [{ name: "Verse", start: 0, length: 8 }],
        }),
        midiTrack({
          id: "track-2",
          notes: [{ step: 0, length: 1, midi: 64, velocity: 0.5 }],
        }),
      ],
      { tempo: 174 },
    );

    const summary: DawprojectMaterializeSummary =
      await service.materialize(result);

    expect(tempoSet).toHaveBeenCalledWith(174);
    expect(summary.tempoBpm).toBe(174);
    expect(summary.trackCount).toBe(2);
    expect(summary.noteCount).toBe(3);
    expect(summary.warnings).toEqual([" carried "]);
    // Matched preset by name; duplicate name gets a suffix.
    expect(musicManager.addTrack).toHaveBeenNthCalledWith(
      1,
      "Keys",
      "polymer-stub",
      "midi",
    );
    expect(musicManager.addTrack).toHaveBeenNthCalledWith(
      2,
      "Keys 2",
      "grand-piano",
      "midi",
    );
    // Notes are sanitized (midi 200 -> 127, velocity 2 -> 1).
    const notes = musicManager.replaceTrackNotes.mock.calls[0][1];
    expect(notes).toHaveLength(2);
    expect(notes[1]).toMatchObject({ midi: 127, velocity: 1 });
    expect(musicManager.addClipToTrack).toHaveBeenCalledWith(
      "track_0",
      expect.objectContaining({
        name: "Verse",
        start: 0,
        length: 8,
        type: "midi",
      }),
    );
    expect(musicManager.applyTrackPatch).toHaveBeenCalledWith(
      "track_0",
      { gain: 0.5, pan: -0.5, muted: false, soloed: true },
      "Import DAWproject",
    );
    expect(musicManager.setTrackColor).toHaveBeenCalledWith(
      "track_0",
      "#ff0000",
    );
  });

  it("caps tracks at the MIDI import budget", async () => {
    setup();
    const tracks = Array.from({ length: 33 }, (_, i) =>
      midiTrack({
        id: `t${i}`,
        name: `T${i}`,
        notes: [{ step: 0, length: 1, midi: 60, velocity: 0.8 }],
      }),
    );
    const summary = await service.materialize(parsedResult(tracks));

    expect(summary.trackCount).toBe(32);
    expect(summary.skippedTracks).toBe(1);
    expect(musicManager.addTrack).toHaveBeenCalledTimes(32);
  });

  it("skips bus tracks and empty tracks with warnings", async () => {
    setup();
    const summary = await service.materialize(
      parsedResult([
        midiTrack({ id: "bus", name: "Mix Bus", type: "bus" }),
        midiTrack({ id: "empty", name: "Empty" }),
      ]),
    );

    expect(summary.trackCount).toBe(0);
    expect(summary.skippedTracks).toBe(2);
    expect(musicManager.addTrack).not.toHaveBeenCalled();
    expect(summary.warnings.join(" ")).toMatch(/bus tracks/);
  });

  it("decodes embedded audio into cached clips", async () => {
    setup();
    const bytes = new Uint8Array([1, 2, 3]);
    const result = parsedResult(
      [
        midiTrack({
          id: "a1",
          name: "Loop",
          type: "audio",
          clips: [{ name: "Loop A", start: 4, length: 4, audioId: "audio-1" }],
        }),
      ],
      {
        audio: [{ id: "audio-1", path: "audio/loop.wav", data: bytes }],
      },
    );
    const decode = jest.fn(async () => ({ duration: 8 }) as AudioBuffer);

    const summary = await service.materialize(result, decode);

    expect(decode).toHaveBeenCalledWith(bytes);
    expect(summary.audioClipCount).toBe(1);
    expect(summary.trackCount).toBe(1);
    expect(musicManager.addTrack).toHaveBeenCalledWith(
      "Loop",
      "sampler-elite",
      "audio",
    );
    const clipArg = musicManager.addClipToTrack.mock.calls[0][1];
    expect(clipArg).toMatchObject({
      name: "Loop A",
      start: 4,
      length: 4,
      type: "audio",
    });
    expect(typeof clipArg.audioRefId).toBe("string");
    expect(musicManager.stemAudioCache.get(clipArg.audioRefId)).toEqual({
      duration: 8,
    });
  });

  it("rolls back audio tracks when nothing could be decoded", async () => {
    setup();
    const result = parsedResult([
      midiTrack({
        id: "a1",
        name: "Missing",
        type: "audio",
        clips: [{ name: "Ghost", start: 0, length: 4, audioId: "audio-9" }],
      }),
    ]);
    // No audio refs at all: the archive join already warned, materialize
    // skips the clip and removes the silent track.
    const summary = await service.materialize(result, async () => null);

    expect(summary.trackCount).toBe(0);
    expect(summary.skippedTracks).toBe(1);
    expect(summary.skippedAudio).toBe(1);
    expect(musicManager.removeTrack).toHaveBeenCalledWith("track_0");
    expect(musicManager.addClipToTrack).not.toHaveBeenCalled();
    expect(summary.warnings.join(" ")).toMatch(/no audio was embedded/);
  });

  it("streams long audio instead of caching the whole buffer", async () => {
    setup();
    const bytes = new Uint8Array([82, 73, 70, 70]);
    const result = parsedResult(
      [
        midiTrack({
          id: "a1",
          name: "Long Take",
          type: "audio",
          clips: [{ name: "Take", start: 0, length: 16, audioId: "audio-1" }],
        }),
      ],
      { audio: [{ id: "audio-1", path: "audio/t.wav", data: bytes }] },
    );
    const decode = jest.fn(async () => ({ duration: 30 }) as AudioBuffer);
    const stream = jest.fn(() => ({
      streamer: { fake: true },
      sampleRate: 44100,
      channels: 1,
      duration: 30,
    }));

    const summary = await service.materialize(result, decode, stream);

    expect(stream).toHaveBeenCalledTimes(1);
    expect(summary.audioClipCount).toBe(1);
    const clipArg = musicManager.addClipToTrack.mock.calls[0][1];
    expect(clipArg).toMatchObject({
      type: "audio",
      clipOriginSeconds: 0,
      clipLengthSeconds: 30,
      clipSampleRate: 44100,
      clipChannels: 1,
    });
    expect(clipArg.clipStreamer).toEqual({ fake: true });
    // The full buffer is not pinned when streaming.
    expect(musicManager.stemAudioCache.size).toBe(0);
  });

  it("caches long audio when streaming is unavailable", async () => {
    setup();
    const bytes = new Uint8Array([82, 73, 70, 70]);
    const result = parsedResult(
      [
        midiTrack({
          id: "a1",
          name: "Long Take",
          type: "audio",
          clips: [{ name: "Take", start: 0, length: 16, audioId: "audio-1" }],
        }),
      ],
      { audio: [{ id: "audio-1", path: "audio/t.wav", data: bytes }] },
    );
    const decode = jest.fn(async () => ({ duration: 30 }) as AudioBuffer);

    // jsdom has no URL.createObjectURL, so the default streamer declines.
    const summary = await service.materialize(result, decode);

    expect(summary.audioClipCount).toBe(1);
    const clipArg = musicManager.addClipToTrack.mock.calls[0][1];
    expect(clipArg.clipStreamer).toBeUndefined();
    expect(musicManager.stemAudioCache.size).toBe(1);
  });

  it("falls back to engine decode when no decoder is injected", async () => {
    setup();
    decodeAudioData.mockResolvedValue({ duration: 4 } as AudioBuffer);
    const result = parsedResult(
      [
        midiTrack({
          id: "a1",
          name: "Loop",
          type: "audio",
          clips: [{ name: "L", start: 0, length: 0, audioId: "audio-1" }],
        }),
      ],
      { audio: [{ id: "audio-1", path: "audio/l.wav", data: new Uint8Array([9]) }] },
    );

    const summary = await service.materialize(result);

    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    expect(summary.audioClipCount).toBe(1);
    // Zero-length clips fall back to the decoded duration (4s @120bpm = 2 bars).
    const clipArg = musicManager.addClipToTrack.mock.calls[0][1];
    expect(clipArg.length).toBe(2);
  });
});
