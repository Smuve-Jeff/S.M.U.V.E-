import {
  buildProjectArchive,
  isProjectArchive,
  readProjectArchive,
  readProjectFile,
} from "./project-archive.util";
import type { ProjectBundle } from "./project-workspace.service";

const makeBundle = (): ProjectBundle => ({
  metadata: {
    id: "proj_archive",
    name: "Archive Test",
    bpm: 120,
    key: "C",
    genre: "pop",
    mood: "bright",
    tags: [],
    createdAt: 1,
    updatedAt: 2,
    lastOpenedAt: 3,
    version: 1,
  },
  tracks: [{ id: "track-1", notes: [] }],
  audioAssets: [
    {
      id: "clip-1",
      sampleRate: 48000,
      channelCount: 2,
      frameCount: 3,
      duration: 3 / 48000,
      channels: [
        new Float32Array([0.1, -0.2, 0.3]),
        new Float32Array([0.4, -0.5, 0.6]),
      ],
    },
  ],
  structure: [{ id: "section-1", name: "Session", start: 0, length: 4 }],
  automation: { lanes: [], macros: [], modulationSources: [] },
  mixState: { masterGain: 0.8, monitorMono: false },
  tempoMap: [{ id: "tempo-1", step: 0, bpm: 120 }],
  markers: [{ id: "marker-1", name: "Drop", time: 4, color: "#facc15" }],
  vca: { buses: [], assignments: {} },
  sidechain: [],
  playback: { loopEnabled: false, loopStart: null, loopEnd: null },
  notes: "archive",
  exportedAt: 4,
});

describe("project archive", () => {
  it("round-trips audio as raw Float32 inside a ZIP", async () => {
    const blob = buildProjectArchive(makeBundle());
    const bytes = await blob.arrayBuffer();

    expect(isProjectArchive(bytes)).toBe(true);
    const restored = readProjectArchive(bytes);
    expect(restored.metadata.name).toBe("Archive Test");
    expect(restored.tempoMap).toEqual([
      { id: "tempo-1", step: 0, bpm: 120 },
    ]);
    expect(restored.markers?.[0].name).toBe("Drop");
    const left = restored.audioAssets![0].channels[0] as Float32Array;
    const right = restored.audioAssets![0].channels[1] as Float32Array;
    expect(left).toBeInstanceOf(Float32Array);
    expect(left[0]).toBeCloseTo(0.1, 5);
    expect(left[1]).toBeCloseTo(-0.2, 5);
    expect(left[2]).toBeCloseTo(0.3, 5);
    expect(right[0]).toBeCloseTo(0.4, 5);
    expect(right[1]).toBeCloseTo(-0.5, 5);
    expect(right[2]).toBeCloseTo(0.6, 5);
  });

  it("rejects an archive whose audio bytes were corrupted", async () => {
    const bytes = new Uint8Array(
      await buildProjectArchive(makeBundle()).arrayBuffer(),
    );
    const marker = new TextEncoder().encode("audio/0000.f32");
    let markerAt = -1;
    for (let index = 0; index <= bytes.length - marker.length; index++) {
      if (marker.every((byte, offset) => bytes[index + offset] === byte)) {
        markerAt = index;
        break;
      }
    }
    expect(markerAt).toBeGreaterThan(-1);
    bytes[markerAt + marker.length] ^= 0xff;

    expect(() => readProjectArchive(bytes)).toThrow(/checksum/i);
  });

  it("still reads a legacy JSON project file", async () => {
    const bundle = makeBundle();
    // Old exports serialised channels as plain number arrays, not typed arrays.
    bundle.audioAssets![0].channels = [
      [0.1, -0.2, 0.3],
      [0.4, -0.5, 0.6],
    ];
    const legacy = new Blob([JSON.stringify(bundle)], {
      type: "application/json",
    });

    const restored = await readProjectFile(legacy);

    expect(restored.metadata.id).toBe("proj_archive");
    expect(restored.audioAssets?.[0].channels[0]).toHaveLength(3);
  });
});
