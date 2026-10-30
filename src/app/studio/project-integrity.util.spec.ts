import type { ProjectBundle } from "./project-workspace.service";
import {
  describeAudioIntegrityFailure,
  inspectProjectAudioIntegrity,
} from "./project-integrity.util";

const makeBundle = (): ProjectBundle => ({
  metadata: {
    id: "proj_integrity",
    name: "Integrity",
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
  tracks: [
    {
      id: "track-vocal",
      name: "Lead Vocal",
      notes: [],
      clips: [
        {
          id: "clip-take-2",
          name: "Take 2",
          type: "audio",
          audioRefId: "take-2",
        },
      ],
    },
  ],
  audioAssets: [],
  automation: {},
  mixState: {},
  notes: "",
  exportedAt: 4,
});

describe("project audio integrity", () => {
  it("passes when every audio clip resolves to real samples", () => {
    const bundle = makeBundle();
    bundle.audioAssets = [
      {
        id: "take-2",
        sampleRate: 48000,
        channelCount: 1,
        frameCount: 2,
        duration: 2 / 48000,
        channels: [new Float32Array([0.1, -0.1])],
      },
    ];

    const report = inspectProjectAudioIntegrity(bundle);

    expect(report).toEqual(
      expect.objectContaining({
        ok: true,
        audioClipCount: 1,
        audioAssetCount: 1,
        missingCount: 0,
      }),
    );
    expect(report.issues).toEqual([]);
  });

  it("reports a clip whose take was never captured, with track and clip names", () => {
    const report = inspectProjectAudioIntegrity(makeBundle());

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({
        trackName: "Lead Vocal",
        clipName: "Take 2",
        audioRefId: "take-2",
        reason: "missing-asset",
      }),
    ]);
    const message = describeAudioIntegrityFailure(report, "export");
    expect(message).toContain("Export blocked");
    expect(message).toContain("Lead Vocal");
    expect(message).toContain("take-2");
  });

  it("distinguishes an empty reference and an empty asset", () => {
    const noReference = makeBundle();
    noReference.tracks[0].clips[0].audioRefId = "";
    noReference.tracks[0].clips[0].id = "";
    expect(inspectProjectAudioIntegrity(noReference).issues[0]).toEqual(
      expect.objectContaining({
        reason: "missing-reference",
        audioRefId: null,
      }),
    );

    const emptyAsset = makeBundle();
    emptyAsset.audioAssets = [
      {
        id: "take-2",
        sampleRate: 48000,
        channelCount: 1,
        frameCount: 2,
        duration: 2 / 48000,
        channels: [],
      },
    ];
    expect(inspectProjectAudioIntegrity(emptyAsset).issues[0].reason).toBe(
      "empty-asset",
    );
  });

  it("lists assets that no clip points at without failing the check", () => {
    const bundle = makeBundle();
    bundle.audioAssets = [
      {
        id: "take-2",
        sampleRate: 48000,
        channelCount: 1,
        frameCount: 1,
        duration: 1 / 48000,
        channels: [new Float32Array([0.1])],
      },
      {
        id: "orphan",
        sampleRate: 48000,
        channelCount: 1,
        frameCount: 1,
        duration: 1 / 48000,
        channels: [new Float32Array([0.1])],
      },
    ];

    const report = inspectProjectAudioIntegrity(bundle);

    expect(report.ok).toBe(true);
    expect(report.unusedAssetIds).toEqual(["orphan"]);
  });
});
