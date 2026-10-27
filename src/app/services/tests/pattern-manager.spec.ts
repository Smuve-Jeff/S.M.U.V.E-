import { TestBed } from "@angular/core/testing";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { signal } from "@angular/core";

import { MusicManagerService } from "../music-manager.service";
import { AudioEngineService } from "../audio-engine.service";
import { InstrumentsService } from "../instruments.service";
import { UserProfileService } from "../user-profile.service";
import { LoggingService } from "../logging.service";
import { FileLoaderService } from "../file-loader.service";

/**
 * The pattern manager: switching a track's active pattern has to move the
 * live material, not just the id. These tests pin the two-sided move and the
 * management actions (rename / duplicate / delete) around it.
 */
describe("MusicManagerService pattern manager", () => {
  let service: MusicManagerService;

  const mockEngine = {
    tempo: signal(120),
    loopStart: signal(0),
    loopEnd: signal(16),
    ensureTrack: jest.fn(),
    updateTrack: jest.fn(),
    onScheduleStep: null,
    isPlaying: () => false,
    ctx: {},
    playBuffer: jest.fn(),
    playSynth: jest.fn(),
    triggerAttack: jest.fn(),
    triggerSampler: jest.fn(),
    setBaseFaderGain: jest.fn(),
    calculatePlaybackRate: () => 1,
    getContext: () => ({
      destination: {},
      currentTime: 0,
      createGain: () => ({
        gain: { setValueAtTime: () => {} },
        connect: () => {},
      }),
    }),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MusicManagerService,
        { provide: AudioEngineService, useValue: mockEngine },
        InstrumentsService,
        { provide: UserProfileService, useValue: { profile: () => ({}) } },
        LoggingService,
        FileLoaderService,
      ],
    });
    service = TestBed.inject(MusicManagerService);
  });

  const track = (id: string) => service.tracks().find((t) => t.id === id)!;

  function seedTrack() {
    const id = service.addTrack("Keys", "analog-warmth", "midi");
    service.replaceTrackNotes(id, [
      { id: "n-orig", midi: 60, step: 0, length: 1, velocity: 0.8 },
    ] as any);
    return id;
  }

  it("loads the target pattern's material when switching", () => {
    const id = seedTrack();
    const original = track(id).activePatternSlotId!;
    const verse = service.createPatternSlot(id, "Verse")!;
    // Edit the new pattern, then leave and come back.
    service.replaceTrackNotes(id, [
      { id: "n-verse", midi: 64, step: 4, length: 1, velocity: 0.8 },
    ] as any);

    service.setActivePatternSlot(id, original);
    expect(track(id).activePatternSlotId).toBe(original);
    expect(track(id).notes.map((n) => n.id)).toEqual(["n-orig"]);

    service.setActivePatternSlot(id, verse);
    expect(track(id).activePatternSlotId).toBe(verse);
    expect(track(id).notes.map((n) => n.id)).toEqual(["n-verse"]);
  });

  it("captures edits made between switches back into the slot being left", () => {
    const id = seedTrack();
    const original = track(id).activePatternSlotId!;
    service.createPatternSlot(id, "Verse");
    service.replaceTrackNotes(id, [
      { id: "n-tweak", midi: 62, step: 2, length: 1, velocity: 0.8 },
    ] as any);

    service.setActivePatternSlot(id, original);
    const verse = track(id).patternSlots!.find((s) => s.name === "Verse")!;
    expect(verse.versions.at(-1)!.notes.map((n: any) => n.id)).toEqual([
      "n-tweak",
    ]);
  });

  it("does not stack identical snapshots on repeated switches", () => {
    const id = seedTrack();
    const original = track(id).activePatternSlotId!;
    const verse = service.createPatternSlot(id, "Verse")!;
    service.setActivePatternSlot(id, original);
    const versionCount = track(id).patternSlots!.find(
      (s) => s.id === verse,
    )!.versions.length;
    service.setActivePatternSlot(id, verse);
    service.setActivePatternSlot(id, original);
    expect(
      track(id).patternSlots!.find((s) => s.id === verse)!.versions.length,
    ).toBe(versionCount);
  });

  it("switching patterns is a single undoable step", () => {
    const id = seedTrack();
    const original = track(id).activePatternSlotId!;
    const verse = service.createPatternSlot(id, "Verse")!;
    const notesBefore = track(id).notes.map((n) => n.id);

    service.setActivePatternSlot(id, original);
    service.setActivePatternSlot(id, verse);
    expect(track(id).activePatternSlotId).toBe(verse);

    service.history.undo();
    expect(track(id).activePatternSlotId).toBe(original);
    expect(track(id).notes.map((n) => n.id)).toEqual(notesBefore);
  });

  it("ignores unknown slots and no-op switches", () => {
    const id = seedTrack();
    const active = track(id).activePatternSlotId;
    service.setActivePatternSlot(id, "does-not-exist");
    expect(track(id).activePatternSlotId).toBe(active);
    const notes = track(id).notes.length;
    service.setActivePatternSlot(id, active!);
    expect(track(id).notes.length).toBe(notes);
  });

  it("renames a pattern, trimming and refusing blanks", () => {
    const id = seedTrack();
    const slot = track(id).patternSlots![0];
    expect(service.renamePatternSlot(id, slot.id, "   Chorus   ")).toBe(true);
    expect(track(id).patternSlots![0].name).toBe("Chorus");
    expect(service.renamePatternSlot(id, slot.id, "   ")).toBe(false);
    expect(track(id).patternSlots![0].name).toBe("Chorus");
    service.history.undo();
    expect(track(id).patternSlots![0].name).toBe(slot.name);
  });

  it("duplicates a pattern without disturbing the active one", () => {
    const id = seedTrack();
    const sourceId = track(id).patternSlots![0].id;
    // Capture the live material, so the slot has a version worth copying.
    service.snapshotPatternVersion(id, sourceId, "captured");
    const source = track(id).patternSlots![0];
    const activeBefore = track(id).activePatternSlotId;

    const copyId = service.duplicatePatternSlot(id, source.id);
    expect(copyId).toBeTruthy();
    const slots = track(id).patternSlots!;
    expect(slots).toHaveLength(2);
    const copy = slots.find((s) => s.id === copyId)!;
    expect(copy.name).toBe(`${source.name} copy`);
    expect(copy.versions).toHaveLength(source.versions.length);
    // Same material, distinct version ids — editing the copy cannot touch the
    // original's history.
    expect(copy.versions.at(-1)!.notes.map((n: any) => n.id)).toEqual([
      "n-orig",
    ]);
    expect(copy.versions.at(-1)!.id).not.toBe(source.versions.at(-1)!.id);
    expect(copy.activeVersionId).toBe(copy.versions.at(-1)!.id);
    expect(track(id).activePatternSlotId).toBe(activeBefore);
  });

  it("deletes a pattern and re-points the clips that played it", () => {
    const id = seedTrack();
    const original = track(id).activePatternSlotId!;
    const verse = service.createPatternSlot(id, "Verse")!;
    service.addClipToTrack(id, { start: 0, length: 4, type: "midi" });
    const clipId = track(id).clips[0].id;
    service.setClipPattern(id, clipId, verse);

    const error = service.deletePatternSlot(id, verse);
    expect(error).toBeNull();
    const after = track(id);
    expect(after.patternSlots!.map((s) => s.id)).toEqual([original]);
    expect(after.clips[0].patternSlotId).toBe(original);
    // Deleting the pattern being edited hands the editors to the survivor.
    expect(after.activePatternSlotId).toBe(original);
    expect(after.notes.map((n) => n.id)).toEqual(["n-orig"]);
  });

  it("restores the deleted pattern and clip routing on undo", () => {
    const id = seedTrack();
    const verse = service.createPatternSlot(id, "Verse")!;
    service.addClipToTrack(id, { start: 0, length: 4, type: "midi" });
    const clipId = track(id).clips[0].id;
    service.setClipPattern(id, clipId, verse);
    const slotsBefore = track(id).patternSlots!.length;

    service.deletePatternSlot(id, verse);
    service.history.undo();
    expect(track(id).patternSlots).toHaveLength(slotsBefore);
    expect(track(id).clips[0].patternSlotId).toBe(verse);
  });

  it("refuses to delete the only pattern on a track", () => {
    const id = seedTrack();
    const only = track(id).patternSlots![0];
    const error = service.deletePatternSlot(id, only.id);
    expect(error).toMatch(/at least one pattern/i);
    expect(track(id).patternSlots).toHaveLength(1);
  });
});
