import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { ProjectTemplateService } from "./project-template.service";
import { MusicManagerService } from "./music-manager.service";
import { LoggingService } from "./logging.service";

/**
 * Templates are the "new session" starter: applying one must replace the
 * canvas, add the template's channels on their real instruments and set the
 * tempo — not just change a label.
 */
describe("ProjectTemplateService", () => {
  let service: ProjectTemplateService;

  const tempo = signal(120);
  const newProject = jest.fn();
  const addTrack = jest.fn((name: string) => `track-${name}`);
  const replaceTrackNotes = jest.fn();
  const addClipToTrack = jest.fn();
  const applyTrackPatch = jest.fn();
  const musicManager = {
    newProject,
    addTrack,
    replaceTrackNotes,
    addClipToTrack,
    applyTrackPatch,
    engine: { tempo },
    tracks: jest.fn(() => [
      {
        id: "1",
        name: "Lead",
        instrumentId: "analog-warmth",
        type: "midi",
        notes: [
          { id: "n1", midi: 60, step: 0, length: 4, velocity: 0.8 },
        ],
        clips: [
          {
            id: "c1",
            start: 1,
            length: 2,
            type: "midi",
            patternSlotId: "slot-1",
          },
        ],
        activePatternSlotId: "slot-0",
        patternSlots: [
          {
            id: "slot-0",
            name: "Verse",
            launchQuantize: "1bar",
            activeVersionId: "v1",
            versions: [
              {
                id: "v1",
                name: "v1",
                steps: new Array(64).fill(false),
                notes: [
                  { id: "n1", midi: 60, step: 0, length: 4, velocity: 0.8 },
                ],
              },
            ],
          },
          {
            id: "slot-1",
            name: "Chorus",
            launchQuantize: "4bar",
            activeVersionId: "v2",
            versions: [
              {
                id: "v1",
                name: "first",
                steps: new Array(64).fill(false),
                notes: [
                  { id: "n4", midi: 67, step: 0, length: 4, velocity: 0.82 },
                ],
              },
              {
                id: "v2",
                name: "lift",
                steps: new Array(64).fill(false),
                notes: [
                  { id: "n5", midi: 69, step: 2, length: 2, velocity: 0.86 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "2",
        name: "Vox",
        instrumentId: "grand-piano",
        type: "audio",
        notes: [{ id: "n2", midi: 64, step: 0, length: 1, velocity: 0.7 }],
        clips: [{ id: "c2", start: 0, length: 1, type: "audio" }],
      },
      {
        id: "3",
        name: "Drums",
        instrumentId: "trap-kit-elite",
        type: "drum",
        drumPatternLength: 16,
        notes: [{ id: "n3", midi: 36, step: 0, length: 1, velocity: 0.9 }],
        clips: [{ id: "c3", start: 0, length: 4, type: "midi" }],
      },
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    tempo.set(120);
    TestBed.configureTestingModule({
      providers: [
        ProjectTemplateService,
        { provide: MusicManagerService, useValue: musicManager },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(ProjectTemplateService);
  });

  it("ships playable starter templates with real instrument ids and patterns", () => {
    expect(service.templates.length).toBeGreaterThanOrEqual(4);
    for (const template of service.templates) {
      expect(template.tracks.length).toBeGreaterThan(0);
      expect(template.bpm).toBeGreaterThan(0);
      expect(template.tracks.every((track) => !!track.instrumentId)).toBe(true);
      for (const track of template.tracks) {
        expect(track.notes?.length).toBeGreaterThan(0);
        expect(
          track.notes!.every(
            (note) =>
              note.step >= 0 &&
              note.step < 64 &&
              note.length > 0 &&
              note.velocity > 0 &&
              note.velocity <= 1,
          ),
        ).toBe(true);
        if (track.type === "drum") {
          expect(track.drumPatternLength).toBe(16);
          expect(track.notes!.every((note) => note.step < 16)).toBe(true);
        }
      }
    }
  });

  it("applies a template by clearing the canvas, adding channels and tempo", () => {
    const template = service.templates[0];
    service.applyTemplate(template.id);

    expect(newProject).toHaveBeenCalledWith(true);
    expect(addTrack).toHaveBeenCalledTimes(template.tracks.length);
    expect(addTrack).toHaveBeenCalledWith(
      template.tracks[0].name,
      template.tracks[0].instrumentId,
      template.tracks[0].type,
    );
    expect(addTrack).toHaveBeenCalledWith(
      template.tracks[template.tracks.length - 1].name,
      "trap-kit-elite",
      "drum",
    );
    expect(replaceTrackNotes).toHaveBeenCalledTimes(template.tracks.length);
    expect(addClipToTrack).toHaveBeenCalledTimes(template.tracks.length);
    expect(replaceTrackNotes).toHaveBeenCalledWith(
      `track-${template.tracks[0].name}`,
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringContaining(`track-${template.tracks[0].name}`),
          midi: template.tracks[0].notes![0].midi,
          step: template.tracks[0].notes![0].step,
        }),
      ]),
      expect.stringContaining("Template"),
    );
    expect(applyTrackPatch).toHaveBeenCalledWith(
      "track-Studio Drums",
      { drumPatternLength: 16 },
      expect.stringContaining("Template"),
    );
    expect(tempo()).toBe(template.bpm);
  });

  it("ignores an unknown template id without touching the project", () => {
    service.applyTemplate("not-a-template");
    expect(newProject).not.toHaveBeenCalled();
    expect(addTrack).not.toHaveBeenCalled();
  });

  it("saves the current channels and tempo as a user template", () => {
    const template = service.saveCurrentAsTemplate("  My Sketch  ");

    expect(template).not.toBeNull();
    expect(template?.name).toBe("My Sketch");
    expect(template?.bpm).toBe(120);
    expect(template?.tracks).toEqual([
      { name: "Lead", instrumentId: "analog-warmth", type: "midi" },
      { name: "Vox", instrumentId: "grand-piano", type: "audio" },
      { name: "Drums", instrumentId: "trap-kit-elite", type: "drum" },
    ]);
    expect(service.userTemplates()[0].id).toBe(template?.id);
  });

  it("captures the current pattern and clip windows only when asked", () => {
    const plain = service.saveCurrentAsTemplate("Channels only");
    expect(plain?.tracks[0].notes).toBeUndefined();
    expect(plain?.tracks[0].clips).toBeUndefined();

    const patterned = service.saveCurrentAsTemplate("With pattern", true);
    expect(patterned).not.toBeNull();
    expect(patterned?.tracks[0].notes).toEqual([
      { midi: 60, step: 0, length: 4, velocity: 0.8 },
    ]);
    expect(patterned?.tracks[0].clips).toEqual([
      { start: 1, length: 2, type: "midi", patternSlotId: "slot-1" },
    ]);
    expect(patterned?.tracks[0].patternSlots?.map((slot) => slot.name)).toEqual([
      "Verse",
      "Chorus",
    ]);
    expect(patterned?.tracks[0].activePatternSlotId).toBe("slot-0");
    expect(patterned?.tracks[0].patternSlots?.[0].launchQuantize).toBe("1bar");
    expect(patterned?.tracks[0].patternSlots?.[1].launchQuantize).toBe("4bar");
    expect(patterned?.tracks[0].patternSlots?.[1].notes[0].midi).toBe(69);
    expect(
      patterned?.tracks[0].patternSlots?.[1].versions?.map(
        (version) => version.name,
      ),
    ).toEqual(["first", "lift"]);
    expect(patterned?.tracks[0].patternSlots?.[1].activeVersionId).toBe("v2");
    expect(patterned?.tracks[2].drumPatternLength).toBe(16);
    expect(patterned?.tracks[2].notes?.[0]).toEqual({
      midi: 36,
      step: 0,
      length: 1,
      velocity: 0.9,
    });
    // Audio clips reference project buffers, so they do not travel.
    expect(patterned?.tracks[1].notes).toBeUndefined();
    expect(patterned?.tracks[1].clips).toBeUndefined();
  });

  it("applies a captured pattern at its original clip positions", () => {
    const template = service.saveCurrentAsTemplate("Pattern Sketch", true);
    expect(template).not.toBeNull();
    jest.clearAllMocks();

    service.applyTemplate(template!.id);

    expect(replaceTrackNotes).not.toHaveBeenCalledWith(
      "track-Lead",
      expect.anything(),
      expect.anything(),
    );
    expect(applyTrackPatch).toHaveBeenCalledWith(
      "track-Lead",
      expect.objectContaining({
        activePatternSlotId: "slot-0",
        notes: [expect.objectContaining({ midi: 60, step: 0, length: 4 })],
        patternSlots: expect.arrayContaining([
          expect.objectContaining({ id: "slot-0", name: "Verse" }),
          expect.objectContaining({
            id: "slot-1",
            name: "Chorus",
            launchQuantize: "4bar",
            activeVersionId: "v2",
            versions: expect.arrayContaining([
              expect.objectContaining({
                id: "v1",
                notes: [expect.objectContaining({ midi: 67 })],
              }),
              expect.objectContaining({
                id: "v2",
                notes: [expect.objectContaining({ midi: 69 })],
              }),
            ]),
          }),
        ]),
      }),
      expect.stringContaining("Template"),
    );
    expect(addClipToTrack).toHaveBeenCalledWith(
      "track-Lead",
      expect.objectContaining({
        start: 1,
        length: 2,
        type: "midi",
        patternSlotId: "slot-1",
      }),
    );
    expect(applyTrackPatch).toHaveBeenCalledWith(
      "track-Drums",
      { drumPatternLength: 16 },
      expect.any(String),
    );
  });

  it("persists user templates and applies them like a starter", () => {
    const template = service.saveCurrentAsTemplate("Saved Sketch");
    expect(template).not.toBeNull();

    // A fresh service instance reads the stored list back.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProjectTemplateService,
        { provide: MusicManagerService, useValue: musicManager },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    const reloaded = TestBed.inject(ProjectTemplateService);
    expect(reloaded.userTemplates().map((t) => t.name)).toEqual([
      "Saved Sketch",
    ]);

    reloaded.applyTemplate(template!.id);
    expect(newProject).toHaveBeenCalledWith(true);
    expect(addTrack).toHaveBeenCalledTimes(3);
    expect(addTrack).toHaveBeenCalledWith(
      "Drums",
      "trap-kit-elite",
      "drum",
    );
    // User templates stay channel/tempo snapshots; they carry no notes.
    expect(replaceTrackNotes).not.toHaveBeenCalled();
    expect(addClipToTrack).not.toHaveBeenCalled();
  });

  it("rejects an empty save and deletes a user template", () => {
    expect(service.saveCurrentAsTemplate("   ")).toBeNull();

    const template = service.saveCurrentAsTemplate("Delete Me");
    expect(template).not.toBeNull();
    expect(service.deleteUserTemplate(template!.id)).toBe(true);
    expect(service.userTemplates()).toHaveLength(0);
    expect(service.deleteUserTemplate(template!.id)).toBe(false);
  });
});
