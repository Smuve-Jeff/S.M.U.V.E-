import {
  buildDawproject,
  type DawprojectProject,
} from "./dawproject-export";
import { importDawprojectArchive } from "./dawproject-import";

/**
 * Export → import fidelity: a bundle our exporter writes must come back
 * through the importer with notes, mix, tempo and audio bytes intact.
 * This is the contract check until real Bitwig/Cubasis files can be run
 * on a dev machine.
 */
function fixtureProject(): DawprojectProject {
  return {
    name: "Roundtrip",
    tempo: 174,
    numerator: 4,
    denominator: 4,
    tracks: [
      {
        id: "keys",
        name: "Keys & Pads",
        type: "midi",
        color: "#ff0000",
        instrumentName: "Polymer Stub",
        gain: 0.5,
        pan: -0.5,
        muted: false,
        soloed: true,
        notes: [
          { step: 0, length: 4, midi: 60, velocity: 0.9 },
          { step: 4.5, length: 3.25, midi: 64, velocity: 0.501 },
        ],
        clips: [{ name: "Verse", start: 0, length: 2 }],
      },
      {
        id: "drums",
        name: "Drums",
        type: "drum",
        gain: 1,
        pan: 0,
        muted: false,
        soloed: false,
        notes: [{ step: 0, length: 1, midi: 36, velocity: 1 }],
        clips: [{ name: "Beat", start: 0, length: 1 }],
      },
      {
        id: "loop",
        name: "Loop",
        type: "audio",
        gain: 0.9,
        pan: 0.25,
        muted: true,
        soloed: false,
        notes: [],
        clips: [{ name: "Loop A", start: 2, length: 2, audioId: "loop-a" }],
      },
    ],
    audio: [
      {
        id: "loop-a",
        path: "audio/loop-a.wav",
        data: new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]),
      },
    ],
  };
}

describe("dawproject round-trip", () => {
  it("survives export -> import with notes, mix, tempo and audio intact", async () => {
    const blob = buildDawproject(fixtureProject());
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const { project, warnings } = await importDawprojectArchive(bytes);

    expect(project.name).toBe("Roundtrip");
    expect(project.tempo).toBe(174);
    expect(project.tracks).toHaveLength(3);

    const keys = project.tracks.find((t) => t.name === "Keys & Pads");
    expect(keys).toBeDefined();
    expect(keys!.gain).toBeCloseTo(0.5, 6);
    expect(keys!.pan).toBeCloseTo(-0.5, 6);
    expect(keys!.soloed).toBe(true);
    expect(keys!.muted).toBe(false);
    expect(keys!.color).toBe("#ff0000");
    expect(keys!.instrumentName).toBe("Polymer Stub");
    expect(keys!.notes).toHaveLength(2);
    expect(keys!.notes[0]).toMatchObject({
      step: 0,
      length: 4,
      midi: 60,
    });
    expect(keys!.notes[0].velocity).toBeCloseTo(0.9, 3);
    // Fractional steps survive the beats round-trip.
    expect(keys!.notes[1].step).toBeCloseTo(4.5, 6);
    expect(keys!.notes[1].length).toBeCloseTo(3.25, 6);
    expect(keys!.clips).toHaveLength(1);
    expect(keys!.clips[0]).toMatchObject({ name: "Verse", start: 0 });
    expect(keys!.clips[0].length).toBeCloseTo(2, 6);

    const loop = project.tracks.find((t) => t.name === "Loop");
    expect(loop).toBeDefined();
    expect(loop!.type).toBe("audio");
    expect(loop!.muted).toBe(true);
    expect(loop!.clips).toHaveLength(1);
    expect(loop!.clips[0].start).toBeCloseTo(2, 6);

    // Audio bytes survive the archive join byte-for-byte.
    expect(project.audio).toHaveLength(1);
    expect(project.audio[0].path).toBe("audio/loop-a.wav");
    expect(Array.from(project.audio[0].data)).toEqual([82, 73, 70, 70, 1, 2, 3, 4]);
    expect(loop!.clips[0].audioId).toBe(project.audio[0].id);

    // No warnings: our own output is fully understood.
    expect(warnings).toEqual([]);
  });

  it("documents the lossy edges: ids are namespaced, drum becomes midi", async () => {
    const blob = buildDawproject(fixtureProject());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { project } = await importDawprojectArchive(bytes);

    // xmlId() prefixes ids so they are valid XML ids; matching is by name.
    const keys = project.tracks.find((t) => t.name === "Keys & Pads");
    expect(keys!.id).toContain("keys");

    // Drum kits have no DAWproject mapping, so drums return as MIDI tracks
    // with their hits intact; materialization re-homes them onto a kit.
    const drums = project.tracks.find((t) => t.name === "Drums");
    expect(drums!.type).toBe("midi");
    expect(drums!.notes).toHaveLength(1);
    expect(drums!.notes[0]).toMatchObject({ midi: 36, step: 0 });
  });
});
